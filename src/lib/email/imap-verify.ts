/**
 * Lightweight IMAP credential verification using imapflow.
 *
 * Returns a normalized result so callers can distinguish between
 * wrong password, TLS errors, host unreachable, etc. Used from the
 * simplified onboarding flow to confirm a user's credentials work
 * before we persist them to `channel_accounts`.
 */

import { ImapFlow } from 'imapflow';

export interface VerifyInput {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export interface VerifyResult {
  ok: boolean;
  errorCode?:
    | 'auth_failed'
    | 'host_unreachable'
    | 'tls_error'
    | 'timeout'
    | 'unknown';
  errorMessage?: string;
}

export async function verifyImap(input: VerifyInput): Promise<VerifyResult> {
  const client = new ImapFlow({
    host: input.host,
    port: input.port,
    secure: input.secure,
    auth: { user: input.user, pass: input.pass },
    logger: false,
    tls: { rejectUnauthorized: false },
    socketTimeout: 15_000,
  });

  try {
    await client.connect();
    try {
      await client.noop();
    } catch {
      /* noop failure isn't fatal */
    }
    await client.logout().catch(() => {});
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code;
    const authCodes = [
      'AUTHENTICATIONFAILED',
      'AuthenticationFailed',
      'EAUTH',
      'NO',
      'BAD',
    ];
    const authResponse = (err as { authenticationFailed?: boolean; response?: string; responseText?: string }) ?? {};
    const responseText = (authResponse.responseText || authResponse.response || '').toString();
    let errorCode: VerifyResult['errorCode'] = 'unknown';

    if (/ENOTFOUND|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN/i.test(message)) {
      errorCode = 'host_unreachable';
    } else if (/ETIMEDOUT|timeout/i.test(message)) {
      errorCode = 'timeout';
    } else if (/tls|ssl|certificate/i.test(message)) {
      errorCode = 'tls_error';
    } else if (
      authResponse.authenticationFailed ||
      (code && authCodes.includes(code)) ||
      /invalid credentials|authentication|auth.*fail|login.*fail|password|logindisabled|command failed/i.test(
        message
      ) ||
      /NO|BAD/i.test(responseText)
    ) {
      errorCode = 'auth_failed';
    }

    try {
      await client.close();
    } catch {
      /* ignore */
    }

    const safeMessage =
      errorCode === 'unknown'
        ? 'We could not sign in to your mail server. Please double-check the address and password.'
        : message;

    return { ok: false, errorCode, errorMessage: safeMessage };
  }
}

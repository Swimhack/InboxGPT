/**
 * Gmail channel adapter — Tier-1 cutover implementation.
 *
 * Sync strategy: REST polling via Gmail API (processEmailSync).
 *   - No inbound webhook — Gmail polling is pull-only; normalizeInbound returns null.
 *   - Outbound send via Gmail API POST /users/me/messages/send using OAuth access token.
 *   - sync() hook delegates to processEmailSync → syncGmailViaRest.
 *
 * Connection onboarding: Google OAuth via NextAuth.js (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).
 * Credentials stored in channel_accounts.credentialsEncrypted as OAuthCredentials JSON.
 */

import type { ChannelAdapter, NormalizedInbound, OutboundMessage } from './types';
import type { ChannelAccount } from '@/lib/db/schema';
import { decryptJSON, encryptJSON } from '@/lib/crypto/encryption';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { refreshGoogleToken } from '@/lib/email/token-refresh';
import { processEmailSync } from '@/lib/queue/processors';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface OAuthCredentials {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  scopes?: string[];
}

/**
 * Get a valid (non-expired) access token for a Gmail API call,
 * refreshing via refresh_token if the current one is near expiry.
 */
async function getValidGmailToken(account: ChannelAccount): Promise<string> {
  if (!account.credentialsEncrypted) {
    throw new Error('gmail: account has no credentials');
  }

  let creds = decryptJSON<OAuthCredentials>(account.credentialsEncrypted);

  const isExpired = creds.expiresAt && creds.expiresAt < Date.now() + 5 * 60 * 1000;
  if (isExpired && creds.refreshToken) {
    const refreshed = await refreshGoogleToken(creds.refreshToken);
    creds = { ...creds, accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt };
    await db
      .update(schema.channelAccounts)
      .set({ credentialsEncrypted: encryptJSON(creds), updatedAt: new Date() })
      .where(eq(schema.channelAccounts.id, account.id));
  }

  return creds.accessToken;
}

/**
 * Encode a string as base64url (RFC 4648 §5).
 * Gmail's send API requires the RFC 2822 message in base64url encoding.
 */
function toBase64Url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const BOUNDARY = '===============InboxGPT==';

/**
 * Build an RFC 2822 MIME message string from an OutboundMessage.
 */
function buildMimeMessage(from: string, msg: OutboundMessage): string {
  const headers = [
    `From: ${from}`,
    `To: ${msg.to}`,
    msg.subject ? `Subject: ${msg.subject}` : 'Subject: (no subject)',
    msg.inReplyTo ? `In-Reply-To: ${msg.inReplyTo}` : '',
    msg.inReplyTo ? `References: ${msg.inReplyTo}` : '',
    'MIME-Version: 1.0',
  ]
    .filter(Boolean)
    .join('\r\n');

  if (msg.bodyHtml && msg.bodyText) {
    const body = [
      `Content-Type: multipart/alternative; boundary="${BOUNDARY}"`,
      '',
      `--${BOUNDARY}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      msg.bodyText,
      '',
      `--${BOUNDARY}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      msg.bodyHtml,
      '',
      `--${BOUNDARY}--`,
    ].join('\r\n');
    return `${headers}\r\n${body}`;
  }

  if (msg.bodyHtml) {
    return `${headers}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${msg.bodyHtml}`;
  }

  return `${headers}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${msg.bodyText ?? ''}`;
}

export const gmailAdapter: ChannelAdapter = {
  provider: 'gmail',

  /**
   * Gmail connects via Google OAuth (NextAuth.js GOOGLE_CLIENT_ID/SECRET).
   * No interactive connect step in the adapter — the auth flow creates the
   * channelAccount row upstream. This stub validates credentials are present.
   */
  async connect({ workspaceId, userId }) {
    if (!workspaceId || !userId) {
      return { error: 'workspaceId and userId are required' };
    }
    // Actual OAuth handled by Google sign-in flow (see /api/auth Google provider).
    // If we reach this path from a UI "reconnect" button, tell the client to re-auth.
    return { error: 'Gmail connects via Google sign-in. Please sign in with Google to connect.' };
  },

  /**
   * Send an email via Gmail REST API (POST /users/me/messages/send).
   * Returns the Gmail message ID as providerMessageId.
   */
  async sendMessage(account: ChannelAccount, msg: OutboundMessage) {
    const token = await getValidGmailToken(account);
    const from = account.externalAccountId ?? '';

    const rawMime = buildMimeMessage(from, msg);
    const raw = toBase64Url(rawMime);

    const body: Record<string, string> = { raw };
    // If inReplyTo is a Gmail thread ID, wire threadId too.
    // By convention, OutboundMessage.inReplyTo is the Message-ID header,
    // not the Gmail threadId — so we rely on In-Reply-To header for threading.

    const res = await fetch(`${GMAIL_API}/messages/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gmail send failed (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as { id?: string; threadId?: string };
    return { providerMessageId: data.id };
  },

  /**
   * Gmail inbound is pull-based (REST polling), not webhook-based.
   * normalizeInbound is not applicable; sync() handles inbound via processEmailSync.
   */
  normalizeInbound(): NormalizedInbound | null {
    return null;
  },

  /**
   * Pull new messages from Gmail via processEmailSync → syncGmailViaRest.
   */
  async sync(account: ChannelAccount) {
    const result = await processEmailSync({ accountId: account.id, userId: account.userId ?? '', type: 'incremental' });
    return { inserted: result.newEmailCount };
  },
};

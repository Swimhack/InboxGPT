import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { getWorkspace } from '@/lib/auth/workspace';
import { withWorkspace, schema } from '@/lib/db';
import { encryptJSON } from '@/lib/crypto/encryption';
import { resolveAutoconfig } from '@/lib/email/autoconfig';
import { verifyImap } from '@/lib/email/imap-verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema_ = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  displayName: z.string().optional(),
  /** Manual overrides — used when auto-discovery misses or the user edits them. */
  overrides: z
    .object({
      imapHost: z.string().min(1).optional(),
      imapPort: z.number().int().optional(),
      smtpHost: z.string().min(1).optional(),
      smtpPort: z.number().int().optional(),
    })
    .optional(),
});

/**
 * POST /api/channels/imap/connect
 *
 * Friction-free IMAP onboarding. Given only `{ email, password }` we:
 *   1. Resolve IMAP/SMTP via `resolveAutoconfig` (ISPDB / DNS SRV / MX / heuristic).
 *   2. Live-test the login with imapflow before touching the DB.
 *   3. Persist an encrypted `channel_accounts` row (Track A schema) on success.
 *
 * The UI never asks the user to type a hostname or port — the errors we
 * return drive a manual fallback form when auto-discovery cannot help.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const workspace = await getWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: 'No workspace' }, { status: 400 });
  }

  let body: z.infer<typeof schema_>;
  try {
    body = schema_.parse(await request.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.errors[0].message : 'Invalid payload';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const discovered = await resolveAutoconfig(body.email);
  const imapHost = body.overrides?.imapHost || discovered?.imap.host;
  const imapPort = body.overrides?.imapPort || discovered?.imap.port || 993;
  const smtpHost = body.overrides?.smtpHost || discovered?.smtp.host;
  const smtpPort = body.overrides?.smtpPort || discovered?.smtp.port || 587;
  const imapSecure = body.overrides?.imapPort
    ? body.overrides.imapPort === 993
    : discovered?.imap.secure ?? imapPort === 993;
  const smtpSecure = body.overrides?.smtpPort
    ? body.overrides.smtpPort === 465
    : discovered?.smtp.secure ?? smtpPort === 465;

  if (!imapHost || !smtpHost) {
    return NextResponse.json(
      {
        error: 'Could not auto-detect your mail server. Please enter the settings manually.',
        needsManual: true,
      },
      { status: 422 }
    );
  }

  // Providers that require OAuth instead of IMAP basic auth. Microsoft 365
  // disabled basic auth for IMAP/SMTP in Oct 2022, and Google Workspace
  // requires an app password rather than the account password. Rather than
  // let the user hit an opaque "Command failed" we intercept here unless
  // the caller explicitly overrode the server (i.e. opted into manual).
  const discoveredImapHost = discovered?.imap.host;
  const overrideImapHost = body.overrides?.imapHost;
  /** User changed IMAP host away from auto-discovered — advanced / self-hosted path. */
  const userOptedIntoDifferentImap = Boolean(
    overrideImapHost && discoveredImapHost && overrideImapHost !== discoveredImapHost
  );

  const isM365Imap = imapHost === 'outlook.office365.com';
  const isGoogleHostedImap = imapHost === 'imap.gmail.com';

  if (isM365Imap && !userOptedIntoDifferentImap) {
    return NextResponse.json(
      {
        error:
          'Microsoft 365 has disabled password sign-in for IMAP. Use the one-click Outlook connect on the main screen, or ask your admin to enable an app password.',
        code: 'oauth_required',
        provider: 'outlook',
        oauthUrl: '/api/auth/oauth/outlook?from=/connect-channels',
      },
      { status: 400 }
    );
  }
  if (isGoogleHostedImap && !userOptedIntoDifferentImap) {
    return NextResponse.json(
      {
        error:
          'Google Workspace needs either the one-click Gmail connect or a Google app password (not your normal password). Use the Gmail card on the main screen for the best experience.',
        code: 'oauth_required',
        provider: 'gmail',
        oauthUrl: '/api/auth/oauth/gmail?from=/connect-channels',
      },
      { status: 400 }
    );
  }

  const verify = await verifyImap({
    host: imapHost,
    port: imapPort,
    secure: imapSecure,
    user: body.email,
    pass: body.password,
  });

  if (!verify.ok) {
    const message = (() => {
      switch (verify.errorCode) {
        case 'auth_failed':
          return 'Email or password is incorrect. If your account has 2-step verification, an app password is required.';
        case 'host_unreachable':
          return `Could not reach ${imapHost}. Double-check the server name or try again.`;
        case 'tls_error':
          return 'TLS handshake failed. Your server may not support secure IMAP on this port.';
        case 'timeout':
          return 'Connection timed out. Your server may be down or blocking this IP.';
        default:
          return verify.errorMessage || 'Could not verify credentials.';
      }
    })();

    return NextResponse.json(
      {
        error: message,
        code: verify.errorCode,
        discovered: discovered ?? null,
      },
      { status: 401 }
    );
  }

  const credentialsEncrypted = encryptJSON({
    username: body.email,
    password: body.password,
    imapHost,
    imapPort,
    imapSecure,
    smtpHost,
    smtpPort,
    smtpSecure,
  });

  // Duplicate check + insert in one workspace-scoped transaction.
  const inserted = await withWorkspace(workspace.workspaceId, async (tx) => {
    const existing = await tx
      .select({ id: schema.channelAccounts.id })
      .from(schema.channelAccounts)
      .where(
        and(
          eq(schema.channelAccounts.workspaceId, workspace.workspaceId),
          eq(schema.channelAccounts.provider, 'imap'),
          eq(schema.channelAccounts.externalAccountId, body.email)
        )
      );

    if (existing.length > 0) return null;

    const [row] = await tx
      .insert(schema.channelAccounts)
      .values({
        workspaceId: workspace.workspaceId,
        userId: session.user.id as string,
        provider: 'imap',
        externalAccountId: body.email,
        displayName: body.displayName || body.email,
        status: 'active',
        credentialsEncrypted,
      })
      .returning({ id: schema.channelAccounts.id });
    return row;
  });

  if (!inserted) {
    return NextResponse.json({ error: 'This email is already connected.' }, { status: 409 });
  }

  return NextResponse.json({
    success: true,
    accountId: inserted.id,
    discovered: discovered ?? null,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getWorkspace } from '@/lib/auth/workspace';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { decryptJSON, encryptJSON } from '@/lib/crypto/encryption';
import { refreshGoogleToken } from '@/lib/email/token-refresh';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limit';

// 30 sends per user per 10 minutes — protects the user's upstream mail
// account (Gmail/Outlook) from abuse if a session is compromised.
const SEND_RATE_LIMIT = { limit: 30, windowMs: 600_000 } as const;

const sendEmailSchema = z.object({
  accountId: z.string(),
  to: z.union([z.string().email(), z.array(z.string().email())]),
  cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  subject: z.string(),
  body: z.string(),
  isHtml: z.boolean().optional().default(false),
  replyTo: z.string().optional(),
  inReplyTo: z.string().optional(),
});

interface OAuthCredentials {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
}

/**
 * Build an RFC 2822 message string for the Gmail API.
 */
function buildRawMessage(opts: {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  inReplyTo?: string;
}): string {
  const lines: string[] = [];
  lines.push(`From: ${opts.from}`);
  lines.push(`To: ${opts.to.join(', ')}`);
  if (opts.cc?.length) lines.push(`Cc: ${opts.cc.join(', ')}`);
  if (opts.bcc?.length) lines.push(`Bcc: ${opts.bcc.join(', ')}`);
  lines.push(`Subject: ${opts.subject}`);
  if (opts.replyTo) lines.push(`Reply-To: ${opts.replyTo}`);
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`);
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push(`Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@inboxgpt.fly.dev>`);

  if (opts.html) {
    const boundary = `boundary_${Date.now()}`;
    lines.push(`MIME-Version: 1.0`);
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push('');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('');
    lines.push(opts.text || opts.html.replace(/<[^>]*>/g, ''));
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push('');
    lines.push(opts.html);
    lines.push(`--${boundary}--`);
  } else {
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('');
    lines.push(opts.text || '');
  }

  return lines.join('\r\n');
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = checkRateLimit(`send:${session.user.id}`, SEND_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

  try {
    const body = await request.json();
    const data = sendEmailSchema.parse(body);

    const [account] = await db
      .select()
      .from(schema.channelAccounts)
      .where(
        and(
          eq(schema.channelAccounts.id, data.accountId),
          eq(schema.channelAccounts.workspaceId, workspace.workspaceId)
        )
      );

    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    if (!account.credentialsEncrypted) {
      return NextResponse.json({ error: 'Account has no credentials' }, { status: 400 });
    }

    const toAddresses = Array.isArray(data.to) ? data.to : [data.to];
    const ccAddresses = data.cc ? (Array.isArray(data.cc) ? data.cc : [data.cc]) : undefined;
    const bccAddresses = data.bcc ? (Array.isArray(data.bcc) ? data.bcc : [data.bcc]) : undefined;

    let messageId: string;

    if (account.provider === 'gmail') {
      // --- Gmail REST API send ---
      let creds = decryptJSON<OAuthCredentials>(account.credentialsEncrypted);

      // Refresh token if expired
      const isExpired = creds.expiresAt && creds.expiresAt < Date.now() + 5 * 60 * 1000;
      if (isExpired && creds.refreshToken) {
        const refreshed = await refreshGoogleToken(creds.refreshToken);
        creds = { ...creds, accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt };
        await db
          .update(schema.channelAccounts)
          .set({ credentialsEncrypted: encryptJSON(creds), updatedAt: new Date() })
          .where(eq(schema.channelAccounts.id, account.id));
      }

      const rawMessage = buildRawMessage({
        from: `${account.displayName || account.externalAccountId} <${account.externalAccountId}>`,
        to: toAddresses,
        cc: ccAddresses,
        bcc: bccAddresses,
        subject: data.subject,
        text: data.isHtml ? undefined : data.body,
        html: data.isHtml ? data.body : undefined,
        replyTo: data.replyTo,
        inReplyTo: data.inReplyTo,
      });

      // Base64url encode the raw message
      const encodedMessage = Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const sendRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encodedMessage }),
        }
      );

      if (!sendRes.ok) {
        const errText = await sendRes.text();
        console.error('[send] Gmail API error:', errText);
        return NextResponse.json(
          { error: `Gmail send failed: ${sendRes.status}` },
          { status: 502 }
        );
      }

      const sendData = await sendRes.json();
      messageId = sendData.id || `gmail-sent-${Date.now()}`;
    } else {
      // TODO: IMAP/SMTP send for other providers
      return NextResponse.json(
        { error: `Sending via ${account.provider} is not yet supported` },
        { status: 501 }
      );
    }

    // Save outbound message to DB
    const [inserted] = await db
      .insert(schema.messages)
      .values({
        workspaceId: workspace.workspaceId,
        channelAccountId: account.id,
        provider: account.provider,
        providerMessageId: messageId,
        direction: 'outbound',
        fromIdentity: {
          kind: 'email',
          value: account.externalAccountId,
          display: account.displayName ?? undefined,
        },
        toIdentities: toAddresses.map((addr) => ({ kind: 'email', value: addr })),
        subject: data.subject,
        bodyText: data.isHtml ? undefined : data.body,
        bodyHtml: data.isHtml ? data.body : undefined,
        snippet: data.body.replace(/<[^>]*>/g, '').slice(0, 200),
        sentAt: new Date(),
        receivedAt: new Date(),
        isRead: true,
      })
      .returning({ id: schema.messages.id });

    return NextResponse.json({ success: true, messageId, emailId: inserted.id });
  } catch (error) {
    console.error('Send email error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send email' },
      { status: 500 }
    );
  }
}

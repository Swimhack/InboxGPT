/**
 * IMAP channel adapter — Tier-1 cutover implementation.
 *
 * Sync strategy: polling via processEmailSync (imapflow).
 *   - No inbound webhook — IMAP is pull-only, normalizeInbound returns null.
 *   - Outbound send via nodemailer using SMTP credentials stored in credentialsEncrypted.
 *   - sync() hook delegates to the shared processEmailSync processor.
 *
 * Connection onboarding lives in /api/channels/imap/connect (auto-discovery +
 * live credential verification before DB persist).
 */

import nodemailer from 'nodemailer';
import type { ChannelAdapter, NormalizedInbound } from './types';
import type { ChannelAccount } from '@/lib/db/schema';
import { decryptJSON } from '@/lib/crypto/encryption';
import { processEmailSync } from '@/lib/queue/processors';

interface ImapCredentials {
  username: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapSecure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
}

export const imapAdapter: ChannelAdapter = {
  provider: 'imap',

  /**
   * IMAP accounts are connected via the dedicated onboarding route
   * POST /api/channels/imap/connect which handles auto-discovery + live
   * credential verification before persisting to channel_accounts.
   */
  async connect() {
    return {
      error:
        'IMAP accounts are connected via the onboarding flow at /connect-channels (POST /api/channels/imap/connect).',
    };
  },

  /**
   * Send an outbound email via SMTP.
   * Reads SMTP credentials from credentialsEncrypted (same blob as IMAP creds).
   */
  async sendMessage(account: ChannelAccount, msg) {
    if (!account.credentialsEncrypted) {
      throw new Error('imap.sendMessage: account has no credentials');
    }

    const creds = decryptJSON<ImapCredentials>(account.credentialsEncrypted);

    if (!creds.smtpHost) {
      throw new Error(
        'imap.sendMessage: no SMTP host in credentials — account may need to be reconnected.'
      );
    }

    const transporter = nodemailer.createTransport({
      host: creds.smtpHost,
      port: creds.smtpPort ?? 587,
      secure: creds.smtpSecure ?? (creds.smtpPort === 465),
      auth: { user: creds.username, pass: creds.password },
      tls: { rejectUnauthorized: process.env.IMAP_TLS_REJECT_UNAUTHORIZED !== 'false' },
    });

    const fromDisplay = account.displayName || account.externalAccountId;
    const info = await transporter.sendMail({
      from: `${fromDisplay} <${account.externalAccountId}>`,
      to: msg.to,
      subject: msg.subject,
      text: msg.bodyText,
      html: msg.bodyHtml,
      inReplyTo: msg.inReplyTo,
      attachments: msg.attachments?.map((a) => ({
        filename: a.filename,
        content: a.data,
        contentType: a.mimeType,
      })),
    });

    transporter.close();
    return { providerMessageId: info.messageId };
  },

  /**
   * IMAP is polling-based — there is no inbound webhook payload to normalise.
   * Messages arrive via the sync() hook below.
   */
  normalizeInbound(): NormalizedInbound | null {
    return null;
  },

  /**
   * Full / incremental IMAP inbox sync.
   * Delegates to the shared processEmailSync processor which uses imapflow.
   */
  async sync(account: ChannelAccount) {
    const lastSync = account.lastSyncAt;
    const type = lastSync ? 'incremental' : 'full';

    const result = await processEmailSync({
      accountId: account.id,
      userId: account.userId ?? '',
      type,
    });

    return {
      inserted: result.newEmailCount,
    };
  },
};

/**
 * Outlook channel adapter — Tier-1 cutover implementation.
 *
 * Sync strategy: polling via Microsoft Graph API (processEmailSync).
 *   - No inbound webhook — Outlook polling is pull-only, normalizeInbound returns null.
 *   - Outbound send via Graph API POST /me/sendMail using OAuth access token.
 *   - sync() hook delegates to processEmailSync which calls syncOutlookViaGraph.
 *
 * Connection onboarding lives in /api/auth (Azure AD OAuth via NextAuth.js).
 * Credentials stored in channel_accounts.credentialsEncrypted as OAuthCredentials JSON.
 */

import type { ChannelAdapter, NormalizedInbound, OutboundMessage } from './types';
import type { ChannelAccount } from '@/lib/db/schema';
import { decryptJSON, encryptJSON } from '@/lib/crypto/encryption';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { refreshMicrosoftToken } from '@/lib/email/token-refresh';
import { processEmailSync } from '@/lib/queue/processors';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';

interface OAuthCredentials {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  scopes?: string[];
}

/**
 * Get a valid (non-expired) access token for a Graph API call,
 * refreshing via refresh_token if the current one is near expiry.
 */
async function getValidOutlookToken(account: ChannelAccount): Promise<string> {
  if (!account.credentialsEncrypted) {
    throw new Error('outlook: account has no credentials');
  }

  let creds = decryptJSON<OAuthCredentials>(account.credentialsEncrypted);

  const isExpired = creds.expiresAt && creds.expiresAt < Date.now() + 5 * 60 * 1000;
  if (isExpired && creds.refreshToken) {
    const refreshed = await refreshMicrosoftToken(creds.refreshToken);
    creds = { ...creds, accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt };
    await db
      .update(schema.channelAccounts)
      .set({ credentialsEncrypted: encryptJSON(creds), updatedAt: new Date() })
      .where(eq(schema.channelAccounts.id, account.id));
  }

  return creds.accessToken;
}

/**
 * Build the Graph sendMail body from an OutboundMessage.
 */
function buildSendMailBody(account: ChannelAccount, msg: OutboundMessage): unknown {
  const fromDisplay = account.displayName || account.externalAccountId || '';

  const message: Record<string, unknown> = {
    subject: msg.subject ?? '(No Subject)',
    body: {
      contentType: msg.bodyHtml ? 'HTML' : 'Text',
      content: msg.bodyHtml ?? msg.bodyText ?? '',
    },
    toRecipients: [
      {
        emailAddress: {
          address: msg.to,
        },
      },
    ],
    from: {
      emailAddress: {
        name: fromDisplay,
        address: account.externalAccountId ?? '',
      },
    },
  };

  if (msg.inReplyTo) {
    // Microsoft Graph uses conversationId / in-reply-to header at send time
    message.internetMessageHeaders = [
      { name: 'In-Reply-To', value: msg.inReplyTo },
    ];
  }

  if (msg.attachments && msg.attachments.length > 0) {
    message.attachments = msg.attachments.map((a) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.filename,
      contentType: a.mimeType,
      contentBytes: a.data.toString('base64'),
    }));
  }

  return { message, saveToSentItems: 'true' };
}

export const outlookAdapter: ChannelAdapter = {
  provider: 'outlook',

  /**
   * Outlook accounts connect via Microsoft OAuth (Azure AD) handled by NextAuth.
   * The adapter itself does not initiate the OAuth dance.
   */
  async connect() {
    return {
      error:
        'Outlook accounts connect via Microsoft sign-in at /api/auth/signin (Azure AD OAuth).',
    };
  },

  /**
   * Send an email via the Microsoft Graph API POST /me/sendMail endpoint.
   * Access token is fetched (and refreshed if expired) from credentialsEncrypted.
   */
  async sendMessage(account: ChannelAccount, msg: OutboundMessage) {
    const token = await getValidOutlookToken(account);
    const body = buildSendMailBody(account, msg);

    const res = await fetch(`${GRAPH_API}/me/sendMail`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`outlook.sendMessage: Graph API error (${res.status}): ${errText}`);
    }

    // Graph sendMail returns 202 Accepted with no body — no providerMessageId available.
    return {};
  },

  /**
   * Outlook messages arrive via polling (Graph delta query), not webhooks.
   * normalizeInbound returns null; messages come through sync().
   */
  normalizeInbound(): NormalizedInbound | null {
    return null;
  },

  /**
   * Full / incremental Outlook inbox sync via Microsoft Graph API.
   * Delegates to processEmailSync which calls syncOutlookViaGraph.
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

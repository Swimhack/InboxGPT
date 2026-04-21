/**
 * Job processors — handles email sync, AI processing, and inbound normalization.
 * Runs in-process via the simple-queue worker.
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db';
import { decryptJSON, encryptJSON } from '../crypto/encryption';
import { refreshGoogleToken, refreshMicrosoftToken } from '../email/token-refresh';
import { twilioAdapter } from '../channels/twilio';
import type { EmailSyncJobData, AIProcessingJobData, NormalizeInboundJobData } from './simple-queue';

// ────────────────────────────────────────────────────────────────────────────
// Credential shapes stored in channelAccounts.credentialsEncrypted
// ────────────────────────────────────────────────────────────────────────────

interface OAuthCredentials {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  scopes?: string[];
}

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

// ────────────────────────────────────────────────────────────────────────────
// processEmailSync
// ────────────────────────────────────────────────────────────────────────────

export async function processEmailSync(data: EmailSyncJobData): Promise<{
  newEmailCount: number;
  totalFetched: number;
  skipped?: boolean;
}> {
  const { accountId, type } = data;
  console.log(`[EmailSync] Starting ${type} sync for account ${accountId}`);

  // 1. Load channel account (Track A)
  const [account] = await db
    .select()
    .from(schema.channelAccounts)
    .where(eq(schema.channelAccounts.id, accountId));

  if (!account) throw new Error(`Account ${accountId} not found`);
  if (account.status !== 'active') {
    console.log(`[EmailSync] Account ${accountId} status=${account.status}, skipping`);
    return { skipped: true, newEmailCount: 0, totalFetched: 0 };
  }
  if (!account.credentialsEncrypted) {
    throw new Error(`Account ${accountId} has no credentials`);
  }

  // 2. Get credentials and refresh if needed
  const provider = account.provider;

  if (provider === 'gmail') {
    return syncGmailViaRest(account, type);
  } else if (provider === 'outlook') {
    return syncOutlookViaGraph(account, type);
  } else if (provider === 'imap') {
    return syncViaImap(account, type);
  } else {
    console.log(`[EmailSync] Provider ${provider} is not an email provider, skipping`);
    return { skipped: true, newEmailCount: 0, totalFetched: 0 };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Gmail REST API sync — uses gmail.modify scope, no IMAP needed
// ────────────────────────────────────────────────────────────────────────────

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function getValidGmailToken(account: typeof schema.channelAccounts.$inferSelect): Promise<string> {
  let creds = decryptJSON<OAuthCredentials>(account.credentialsEncrypted!);

  const isExpired = creds.expiresAt && creds.expiresAt < Date.now() + 5 * 60 * 1000;
  if (isExpired && creds.refreshToken) {
    console.log(`[EmailSync] Refreshing expired Gmail token for ${account.id}`);
    const refreshed = await refreshGoogleToken(creds.refreshToken);
    creds = { ...creds, accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt };
    await db
      .update(schema.channelAccounts)
      .set({ credentialsEncrypted: encryptJSON(creds), updatedAt: new Date() })
      .where(eq(schema.channelAccounts.id, account.id));
  }

  return creds.accessToken;
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    mimeType: string;
    body?: { data?: string; size: number };
    parts?: Array<{
      mimeType: string;
      body?: { data?: string; size: number };
      filename?: string;
      parts?: Array<{ mimeType: string; body?: { data?: string } }>;
    }>;
  };
  internalDate: string;
}

function getHeader(msg: GmailMessage, name: string): string {
  return msg.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function decodeBody(data?: string): string {
  if (!data) return '';
  return Buffer.from(data, 'base64url').toString('utf-8');
}

function extractBody(msg: GmailMessage): { text?: string; html?: string } {
  const result: { text?: string; html?: string } = {};

  function walk(parts?: GmailMessage['payload']['parts']) {
    if (!parts) return;
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && !result.text) {
        result.text = decodeBody(part.body?.data);
      } else if (part.mimeType === 'text/html' && !result.html) {
        result.html = decodeBody(part.body?.data);
      } else if (part.parts) {
        walk(part.parts as GmailMessage['payload']['parts']);
      }
    }
  }

  if (msg.payload.body?.data) {
    if (msg.payload.mimeType === 'text/html') {
      result.html = decodeBody(msg.payload.body.data);
    } else {
      result.text = decodeBody(msg.payload.body.data);
    }
  }
  walk(msg.payload.parts);
  return result;
}

function parseEmailAddress(raw: string): { kind: string; value: string; display?: string } {
  const match = /^(.+?)\s*<([^>]+)>$/.exec(raw.trim());
  if (match) return { kind: 'email', display: match[1].replace(/^"|"$/g, ''), value: match[2] };
  return { kind: 'email', value: raw.trim() };
}

async function syncGmailViaRest(
  account: typeof schema.channelAccounts.$inferSelect,
  type: string
): Promise<{ newEmailCount: number; totalFetched: number }> {
  const token = await getValidGmailToken(account);
  const limit = type === 'full' ? 200 : 50;

  // 1. List message IDs
  let query = 'in:inbox';
  if (type === 'incremental' && account.lastSyncAt) {
    const epoch = Math.floor(account.lastSyncAt.getTime() / 1000);
    query += ` after:${epoch}`;
  }

  console.log(`[EmailSync] Gmail REST: listing messages (q="${query}", limit=${limit})`);

  const listRes = await fetch(
    `${GMAIL_API}/messages?maxResults=${limit}&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!listRes.ok) {
    const errText = await listRes.text();
    throw new Error(`Gmail list failed (${listRes.status}): ${errText}`);
  }

  const listData = await listRes.json();
  const messageIds: string[] = (listData.messages ?? []).map((m: { id: string }) => m.id);

  if (messageIds.length === 0) {
    console.log(`[EmailSync] Gmail REST: no messages found`);
    await db
      .update(schema.channelAccounts)
      .set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(schema.channelAccounts.id, account.id));
    return { newEmailCount: 0, totalFetched: 0 };
  }

  console.log(`[EmailSync] Gmail REST: fetching ${messageIds.length} messages`);

  // 2. Fetch each message (batch in parallel, 10 at a time)
  let newEmailCount = 0;
  for (let i = 0; i < messageIds.length; i += 10) {
    const batch = messageIds.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(async (msgId) => {
        const res = await fetch(`${GMAIL_API}/messages/${msgId}?format=full`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null;
        return (await res.json()) as GmailMessage;
      })
    );

    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      const msg = result.value;

      const fromRaw = getHeader(msg, 'From');
      const toRaw = getHeader(msg, 'To');
      const subject = getHeader(msg, 'Subject') || '(No Subject)';
      const messageIdHeader = getHeader(msg, 'Message-ID') || `gmail-${msg.id}`;
      const body = extractBody(msg);
      const hasAttachments = (msg.payload.parts ?? []).some(
        (p) => p.filename && p.filename.length > 0
      );

      try {
        await db
          .insert(schema.messages)
          .values({
            workspaceId: account.workspaceId,
            channelAccountId: account.id,
            provider: 'gmail',
            providerMessageId: messageIdHeader,
            direction: 'inbound',
            fromIdentity: parseEmailAddress(fromRaw),
            toIdentities: toRaw
              .split(',')
              .map((a) => parseEmailAddress(a))
              .filter((a) => a.value),
            subject,
            bodyText: body.text,
            bodyHtml: body.html,
            snippet: msg.snippet || body.text?.slice(0, 200),
            sentAt: new Date(parseInt(msg.internalDate, 10)),
            receivedAt: new Date(parseInt(msg.internalDate, 10)),
            isRead: !msg.labelIds.includes('UNREAD'),
            isStarred: msg.labelIds.includes('STARRED'),
            hasAttachments,
          })
          .onConflictDoNothing();
        newEmailCount++;
      } catch {
        // duplicate or constraint — skip
      }
    }
  }

  // 3. Update account
  await db
    .update(schema.channelAccounts)
    .set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(eq(schema.channelAccounts.id, account.id));

  console.log(`[EmailSync] Gmail REST: done — ${newEmailCount} new of ${messageIds.length} fetched`);
  return { newEmailCount, totalFetched: messageIds.length };
}

// ────────────────────────────────────────────────────────────────────────────
// Microsoft Graph API sync — Outlook / Microsoft 365
// ────────────────────────────────────────────────────────────────────────────

const GRAPH_API = 'https://graph.microsoft.com/v1.0';

async function getValidOutlookToken(
  account: typeof schema.channelAccounts.$inferSelect
): Promise<string> {
  let creds = decryptJSON<OAuthCredentials>(account.credentialsEncrypted!);

  const isExpired = creds.expiresAt && creds.expiresAt < Date.now() + 5 * 60 * 1000;
  if (isExpired && creds.refreshToken) {
    console.log(`[EmailSync] Refreshing expired Outlook token for ${account.id}`);
    const refreshed = await refreshMicrosoftToken(creds.refreshToken);
    creds = { ...creds, accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt };
    await db
      .update(schema.channelAccounts)
      .set({ credentialsEncrypted: encryptJSON(creds), updatedAt: new Date() })
      .where(eq(schema.channelAccounts.id, account.id));
  }

  return creds.accessToken;
}

interface GraphMessage {
  id: string;
  internetMessageId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType: string; content: string };
  from?: { emailAddress: { name?: string; address: string } };
  toRecipients?: Array<{ emailAddress: { name?: string; address: string } }>;
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  flag?: { flagStatus: string };
  hasAttachments?: boolean;
}

async function syncOutlookViaGraph(
  account: typeof schema.channelAccounts.$inferSelect,
  type: string
): Promise<{ newEmailCount: number; totalFetched: number }> {
  const token = await getValidOutlookToken(account);
  const limit = type === 'full' ? 200 : 50;

  // Build filter for incremental sync
  let url = `${GRAPH_API}/me/mailFolders/inbox/messages?$top=${limit}&$select=id,internetMessageId,subject,bodyPreview,body,from,toRecipients,receivedDateTime,sentDateTime,isRead,flag,hasAttachments`;
  if (type === 'incremental' && account.lastSyncAt) {
    const iso = account.lastSyncAt.toISOString();
    url += `&$filter=receivedDateTime ge ${iso}`;
  }
  url += `&$orderby=receivedDateTime desc`;

  console.log(`[EmailSync] Outlook Graph: listing messages (type=${type})`);

  const listRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!listRes.ok) {
    const errText = await listRes.text();
    throw new Error(`Outlook Graph list failed (${listRes.status}): ${errText}`);
  }

  const listData = await listRes.json();
  const messages: GraphMessage[] = listData.value ?? [];

  if (messages.length === 0) {
    console.log(`[EmailSync] Outlook Graph: no messages found`);
    await db
      .update(schema.channelAccounts)
      .set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(schema.channelAccounts.id, account.id));
    return { newEmailCount: 0, totalFetched: 0 };
  }

  console.log(`[EmailSync] Outlook Graph: inserting ${messages.length} messages`);

  let newEmailCount = 0;
  for (const msg of messages) {
    const fromAddr = msg.from?.emailAddress;
    const providerMessageId =
      msg.internetMessageId || `graph-${msg.id}`;

    try {
      await db
        .insert(schema.messages)
        .values({
          workspaceId: account.workspaceId,
          channelAccountId: account.id,
          provider: 'outlook',
          providerMessageId,
          direction: 'inbound',
          fromIdentity: {
            kind: 'email',
            value: fromAddr?.address ?? 'unknown',
            display: fromAddr?.name,
          },
          toIdentities: (msg.toRecipients ?? []).map((r) => ({
            kind: 'email',
            value: r.emailAddress.address,
            display: r.emailAddress.name,
          })),
          subject: msg.subject || '(No Subject)',
          bodyText:
            msg.body?.contentType === 'text' ? msg.body.content : undefined,
          bodyHtml:
            msg.body?.contentType === 'html' ? msg.body.content : undefined,
          snippet: msg.bodyPreview?.slice(0, 200) || undefined,
          sentAt: msg.sentDateTime ? new Date(msg.sentDateTime) : new Date(),
          receivedAt: msg.receivedDateTime
            ? new Date(msg.receivedDateTime)
            : new Date(),
          isRead: msg.isRead ?? false,
          isStarred: msg.flag?.flagStatus === 'flagged',
          hasAttachments: msg.hasAttachments ?? false,
        })
        .onConflictDoNothing();
      newEmailCount++;
    } catch {
      // duplicate or constraint — skip
    }
  }

  await db
    .update(schema.channelAccounts)
    .set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(eq(schema.channelAccounts.id, account.id));

  console.log(
    `[EmailSync] Outlook Graph: done — ${newEmailCount} new of ${messages.length} fetched`
  );
  return { newEmailCount, totalFetched: messages.length };
}

// ────────────────────────────────────────────────────────────────────────────
// IMAP sync — for generic IMAP providers (not Gmail/Outlook)
// ────────────────────────────────────────────────────────────────────────────

async function syncViaImap(
  account: typeof schema.channelAccounts.$inferSelect,
  type: string
): Promise<{ newEmailCount: number; totalFetched: number }> {
  const creds = decryptJSON<ImapCredentials>(account.credentialsEncrypted!);

  const client = new ImapFlow({
    host: creds.imapHost,
    port: creds.imapPort,
    secure: creds.imapSecure ?? creds.imapPort === 993,
    auth: { user: creds.username, pass: creds.password },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    const limit = type === 'full' ? 200 : 50;
    let fetchRange: string;

    if (type === 'incremental' && account.lastSyncAt) {
      fetchRange = `SINCE ${account.lastSyncAt.toISOString().split('T')[0]}`;
    } else {
      fetchRange = '1:*';
    }

    let newEmailCount = 0;
    let totalFetched = 0;

    try {
      for await (const msg of client.fetch(fetchRange, {
        uid: true, envelope: true, flags: true, source: true, bodyStructure: true,
      })) {
        if (totalFetched >= limit) break;
        try {
          const source = msg.source as Buffer | undefined;
          if (!source) continue;
          const parsed = await simpleParser(source);
          const fromAddr = parsed.from?.value[0];
          const flags = msg.flags ?? new Set<string>();

          await db
            .insert(schema.messages)
            .values({
              workspaceId: account.workspaceId,
              channelAccountId: account.id,
              provider: 'imap',
              providerMessageId: parsed.messageId || `uid-${msg.uid}@${creds.imapHost}`,
              direction: 'inbound',
              fromIdentity: { kind: 'email', value: fromAddr?.address || 'unknown', display: fromAddr?.name },
              subject: parsed.subject || '(No Subject)',
              bodyText: parsed.text || undefined,
              bodyHtml: parsed.html || undefined,
              snippet: (parsed.text || '').slice(0, 200).replace(/\s+/g, ' ').trim() || undefined,
              sentAt: parsed.date || new Date(),
              receivedAt: parsed.date || new Date(),
              isRead: flags.has('\\Seen'),
              isStarred: flags.has('\\Flagged'),
              hasAttachments: (parsed.attachments?.length ?? 0) > 0,
            })
            .onConflictDoNothing();
          newEmailCount++;
        } catch { /* skip */ }
        totalFetched++;
      }
    } finally {
      lock.release();
    }

    await db
      .update(schema.channelAccounts)
      .set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(schema.channelAccounts.id, account.id));

    console.log(`[EmailSync] IMAP: done — ${newEmailCount} new of ${totalFetched} fetched`);
    return { newEmailCount, totalFetched };
  } catch (error) {
    console.error(`[EmailSync] IMAP failed for ${account.id}:`, error);
    await db
      .update(schema.channelAccounts)
      .set({ lastError: (error as Error).message, updatedAt: new Date() })
      .where(eq(schema.channelAccounts.id, account.id))
      .catch(() => {});
    throw error;
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// processAIJob (stub — AI processing requires API keys)
// ────────────────────────────────────────────────────────────────────────────

export async function processAIJob(data: AIProcessingJobData): Promise<{
  success: boolean;
  skipped?: boolean;
  reason?: string;
}> {
  console.log(`[AI] Skipping AI processing for message ${data.emailId} — no AI keys configured`);
  return { success: true, skipped: true, reason: 'ai_not_configured' };
}

// ────────────────────────────────────────────────────────────────────────────
// processNormalizeInbound — converts a raw webhook event into a messages row
// Supports: twilio (SMS/voicemail). Extend the provider switch for others.
// ────────────────────────────────────────────────────────────────────────────

export async function processNormalizeInbound(data: NormalizeInboundJobData): Promise<{
  success: boolean;
  messageId?: string;
  duplicate?: boolean;
  skipped?: boolean;
  reason?: string;
}> {
  const { webhookEventId } = data;
  console.log(`[NormalizeInbound] Processing webhook event ${webhookEventId}`);

  // 1. Load the webhook event row
  const [event] = await db
    .select()
    .from(schema.webhookEvents)
    .where(eq(schema.webhookEvents.id, webhookEventId));

  if (!event) {
    console.warn(`[NormalizeInbound] Webhook event ${webhookEventId} not found`);
    return { success: false, reason: 'webhook_event_not_found' };
  }

  if (event.processedAt) {
    console.log(`[NormalizeInbound] Event ${webhookEventId} already processed — skipping`);
    return { success: true, duplicate: true, skipped: true };
  }

  // 2. Resolve the adapter and normalize the payload
  let normalized;
  try {
    if (event.provider === 'twilio') {
      normalized = twilioAdapter.normalizeInbound(event.payload);
    } else {
      console.warn(`[NormalizeInbound] No adapter for provider ${event.provider}`);
      return { success: false, reason: `no_adapter_for_${event.provider}` };
    }
  } catch (err) {
    console.error(`[NormalizeInbound] normalizeInbound threw for event ${webhookEventId}:`, err);
    return { success: false, reason: `normalize_error: ${(err as Error).message}` };
  }

  if (!normalized) {
    console.warn(`[NormalizeInbound] normalizeInbound returned null for event ${webhookEventId}`);
    await db
      .update(schema.webhookEvents)
      .set({ processedAt: new Date(), error: 'normalizeInbound returned null' })
      .where(eq(schema.webhookEvents.id, webhookEventId));
    return { success: false, reason: 'normalize_returned_null' };
  }

  // 3. Find the channelAccount by provider + To phone number
  //    Twilio sends To = the receiving phone (our registered number = externalAccountId)
  const payload = event.payload as Record<string, string>;
  const toPhone = payload.To as string | undefined;

  if (!toPhone) {
    console.warn(`[NormalizeInbound] No To field in Twilio payload for event ${webhookEventId}`);
    await db
      .update(schema.webhookEvents)
      .set({ processedAt: new Date(), error: 'no To phone in payload' })
      .where(eq(schema.webhookEvents.id, webhookEventId));
    return { success: false, reason: 'no_to_phone' };
  }

  const [account] = await db
    .select()
    .from(schema.channelAccounts)
    .where(
      and(
        eq(schema.channelAccounts.provider, 'twilio'),
        eq(schema.channelAccounts.externalAccountId, toPhone)
      )
    );

  if (!account) {
    console.warn(`[NormalizeInbound] No channelAccount for twilio phone ${toPhone}`);
    await db
      .update(schema.webhookEvents)
      .set({ processedAt: new Date(), error: `no channelAccount for ${toPhone}` })
      .where(eq(schema.webhookEvents.id, webhookEventId));
    return { success: false, reason: 'no_channel_account' };
  }

  const workspaceId = account.workspaceId;

  // 4. Upsert thread — keyed by (workspaceId, channelAccountId, participantKey)
  //    participantKey = threadKey from normalizer = From E.164 phone for SMS
  const participantKey = normalized.threadKey ?? normalized.from.value;

  const [existingThread] = await db
    .select({ id: schema.threads.id, unreadCount: schema.threads.unreadCount })
    .from(schema.threads)
    .where(
      and(
        eq(schema.threads.workspaceId, workspaceId),
        eq(schema.threads.channelAccountId, account.id),
        eq(schema.threads.participantKey, participantKey)
      )
    );

  let threadId: string;

  if (existingThread) {
    threadId = existingThread.id;
    // Update thread snippet + lastMessageAt + unreadCount
    await db
      .update(schema.threads)
      .set({
        snippet: normalized.snippet ?? normalized.bodyText?.slice(0, 200),
        lastMessageAt: normalized.receivedAt,
        unreadCount: existingThread.unreadCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.threads.id, threadId));
  } else {
    const [newThread] = await db
      .insert(schema.threads)
      .values({
        workspaceId,
        channelAccountId: account.id,
        participantKey,
        subject: normalized.subject,
        snippet: normalized.snippet ?? normalized.bodyText?.slice(0, 200),
        lastMessageAt: normalized.receivedAt,
        unreadCount: 1,
      })
      .returning({ id: schema.threads.id });
    threadId = newThread.id;
  }

  // 5. Insert message (idempotent via unique index on workspaceId+provider+providerMessageId)
  const [inserted] = await db
    .insert(schema.messages)
    .values({
      workspaceId,
      threadId,
      channelAccountId: account.id,
      provider: 'twilio',
      providerMessageId: normalized.providerMessageId,
      direction: normalized.direction,
      fromIdentity: normalized.from,
      toIdentities: normalized.to,
      subject: normalized.subject,
      bodyText: normalized.bodyText,
      snippet: normalized.snippet,
      receivedAt: normalized.receivedAt,
      sentAt: normalized.sentAt ?? normalized.receivedAt,
      raw: normalized.raw as Record<string, unknown>,
    })
    .onConflictDoNothing()
    .returning({ id: schema.messages.id });

  const messageId = inserted?.id;
  const duplicate = !messageId;

  // 6. Mark webhook event as processed
  await db
    .update(schema.webhookEvents)
    .set({
      processedAt: new Date(),
      workspaceId,
      error: null,
    })
    .where(eq(schema.webhookEvents.id, webhookEventId));

  // 7. Update channelAccount.lastSyncAt
  await db
    .update(schema.channelAccounts)
    .set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(eq(schema.channelAccounts.id, account.id));

  console.log(
    `[NormalizeInbound] Event ${webhookEventId} → message ${messageId ?? '(duplicate)'} in thread ${threadId}`
  );

  return { success: true, messageId, duplicate };
}

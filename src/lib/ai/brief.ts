import { db, schema } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { canProcessWithAI } from './limits';
import { AIClient, type AIClientConfig, type BriefResult } from './client';
import { buildBriefPrompt, type BriefEmailData } from './prompts';
import { decrypt } from '../crypto/encryption';

export type { BriefResult };

// ────────────────────────────────────────────────────────────────────────────
// In-memory brief cache (single-instance PM2 deployment)
// ────────────────────────────────────────────────────────────────────────────
interface CachedBrief {
  brief: BriefResult;
  unreadCount: number; // invalidate when inbox changes
  cachedAt: number;
}

const CACHE_TTL_MS = 30 * 60_000; // 30 minutes
const briefCache = new Map<string, CachedBrief>();

function getCachedBrief(workspaceId: string, currentUnreadCount: number): BriefResult | null {
  const entry = briefCache.get(workspaceId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    briefCache.delete(workspaceId);
    return null;
  }
  // Invalidate if unread count changed (new mail arrived or user read something)
  if (entry.unreadCount !== currentUnreadCount) {
    briefCache.delete(workspaceId);
    return null;
  }
  return entry.brief;
}

function setCachedBrief(workspaceId: string, brief: BriefResult, unreadCount: number): void {
  briefCache.set(workspaceId, { brief, unreadCount, cachedAt: Date.now() });
  // Prevent unbounded growth — evict oldest if over 100 entries
  if (briefCache.size > 100) {
    const oldest = briefCache.keys().next().value;
    if (oldest) briefCache.delete(oldest);
  }
}

/**
 * Extract a human-readable display name + email address from the
 * Track-A `messages.from_identity` JSONB payload.
 *
 * Shape: `{ kind: 'email' | 'phone' | 'handle'; value: string; display?: string }`
 */
function splitFromIdentity(
  identity: unknown
): { display: string | null; address: string | null } {
  if (!identity || typeof identity !== 'object') {
    return { display: null, address: null };
  }
  const id = identity as { display?: string; value?: string };
  return {
    display: typeof id.display === 'string' ? id.display : null,
    address: typeof id.value === 'string' ? id.value : null,
  };
}

export async function generateBriefForUser(
  userId: string,
  timezone?: string
): Promise<BriefResult> {
  const limitStatus = await canProcessWithAI(userId);
  if (!limitStatus.allowed) {
    throw new Error(limitStatus.reason || 'AI processing not available');
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { name: true, userAnthropicKey: true, userOpenaiKey: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  let aiConfig: AIClientConfig | undefined;
  if (!limitStatus.useFounderKey) {
    try {
      if (user.userAnthropicKey) {
        aiConfig = { provider: 'anthropic', apiKey: decrypt(user.userAnthropicKey) };
      } else if (user.userOpenaiKey) {
        aiConfig = { provider: 'openai', apiKey: decrypt(user.userOpenaiKey) };
      }
    } catch (err) {
      // AES-GCM auth tag failure almost always means the row was encrypted
      // with a different ENCRYPTION_KEY than the one currently in env
      // (common after key rotation or migrating between hosts). Surface a
      // clear, actionable message instead of the raw crypto error.
      console.error('[Brief] Failed to decrypt stored AI key for user', userId, err);
      throw new Error(
        'STORED_AI_KEY_INVALID: Your saved AI API key could not be read. ' +
          'Please re-enter it in Settings.'
      );
    }
  }

  // Resolve the user's primary workspace. Messages + channel_accounts in
  // Track A are workspace-scoped, not user-scoped, so we always need a
  // workspace id before querying.
  const membership = await db.query.workspaceMembers.findFirst({
    where: eq(schema.workspaceMembers.userId, userId),
    columns: { workspaceId: true },
    orderBy: [schema.workspaceMembers.createdAt],
  });

  if (!membership) {
    // No workspace yet -> return an empty-but-valid brief instead of
    // throwing, so the UI can render a friendly empty state.
    return emptyBrief(user.name || '');
  }

  const workspaceId = membership.workspaceId;

  const accounts = await db
    .select({
      id: schema.channelAccounts.id,
      displayName: schema.channelAccounts.displayName,
      externalAccountId: schema.channelAccounts.externalAccountId,
    })
    .from(schema.channelAccounts)
    .where(eq(schema.channelAccounts.workspaceId, workspaceId));

  const accountEmails = accounts
    .map((a) => a.displayName || a.externalAccountId)
    .filter((v): v is string => Boolean(v));
  const accountMap = new Map(
    accounts.map((a) => [a.id, a.displayName || a.externalAccountId || 'unknown'])
  );

  // Quick unread count for cache validation (cheap query)
  const [{ count: unreadCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.workspaceId, workspaceId),
        eq(schema.messages.direction, 'inbound'),
        eq(schema.messages.isRead, false),
        eq(schema.messages.isDeleted, false)
      )
    );

  // Return cached brief if inbox hasn't changed
  const cached = getCachedBrief(workspaceId, unreadCount);
  if (cached) {
    console.log('[Brief] Returning cached brief for workspace', workspaceId);
    return cached;
  }

  const recentEmails = await db
    .select({
      subject: schema.messages.subject,
      snippet: schema.messages.snippet,
      fromIdentity: schema.messages.fromIdentity,
      aiCategory: schema.messages.aiCategory,
      aiPriority: schema.messages.aiPriority,
      receivedAt: schema.messages.receivedAt,
      channelAccountId: schema.messages.channelAccountId,
    })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.workspaceId, workspaceId),
        eq(schema.messages.direction, 'inbound'),
        eq(schema.messages.isRead, false),
        eq(schema.messages.isDeleted, false)
      )
    )
    .orderBy(desc(schema.messages.receivedAt))
    .limit(50);

  const emailData: BriefEmailData[] = recentEmails.map((e) => {
    const { display, address } = splitFromIdentity(e.fromIdentity);
    const receivedAt =
      e.receivedAt instanceof Date
        ? e.receivedAt.toISOString()
        : typeof e.receivedAt === 'string'
          ? e.receivedAt
          : 'unknown';

    return {
      subject: e.subject || '(No Subject)',
      from: display || address || 'Unknown sender',
      snippet: e.snippet || '',
      category: e.aiCategory || 'primary',
      priority: e.aiPriority || 'normal',
      receivedAt,
      account: e.channelAccountId ? accountMap.get(e.channelAccountId) || 'unknown' : 'unknown',
    };
  });

  if (emailData.length === 0) {
    return emptyBrief(user.name || '');
  }

  const prompt = buildBriefPrompt(user.name || '', accountEmails, emailData, timezone);

  // Try user's stored key first, fall back to system provider (e.g. OpenRouter)
  let result: BriefResult | null = null;

  if (aiConfig) {
    try {
      const userClient = new AIClient(aiConfig);
      result = await userClient.generateBrief(prompt);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Billing, auth, or rate limit errors → fall back to system provider
      if (/credit balance|too low|rate limit|unauthorized|forbidden|quota/i.test(msg)) {
        console.warn('[Brief] User AI key failed, falling back to system provider:', msg.slice(0, 100));
      } else {
        throw err;
      }
    }
  }

  if (!result) {
    console.log('[Brief] Using system provider:', process.env.AI_PROVIDER || 'anthropic (default)', 'model:', process.env.AI_MODEL || 'default');
    const systemClient = new AIClient();
    try {
      result = await systemClient.generateBrief(prompt);
      console.log('[Brief] System provider succeeded');
    } catch (err) {
      console.error('[Brief] System provider failed:', err instanceof Error ? err.message : err);
      throw err;
    }
  }

  // Cache the generated brief
  setCachedBrief(workspaceId, result, unreadCount);
  return result;
}

function emptyBrief(name: string): BriefResult {
  const first = name.split(/\s+/)[0] || '';
  const greeting = first ? `Hey ${first}, your inbox is clear.` : 'Your inbox is clear.';
  return {
    greeting,
    summary: 'No unread messages right now.',
    sections: [],
    actionItems: [],
  };
}

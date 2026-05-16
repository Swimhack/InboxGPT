import { db, schema } from '@/lib/db';
import { eq, sql, and, gt, desc } from 'drizzle-orm';

export interface BriefEmail {
  id: string;
  subject: string | null;
  snippet: string | null;
  fromName: string;
  fromEmail: string;
  receivedAt: Date;
  threadId: string | null;
  aiSummary: string | null;
  aiCategory: string | null;
  aiPriority: string | null;
}

export interface StaleFollowUp {
  id: string;
  subject: string | null;
  recipientName: string;
  recipientEmail: string;
  sentAt: Date;
  daysSinceSent: number;
}

export interface AwaitingReply {
  id: string;
  subject: string | null;
  fromName: string;
  fromEmail: string;
  receivedAt: Date;
  hoursSinceReceived: number;
}

/**
 * Get unread inbound messages from the last 24 hours, ordered by AI priority
 */
export async function getUnreadMessages(workspaceId: string, limit: number): Promise<BriefEmail[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: schema.messages.id,
      subject: schema.messages.subject,
      snippet: schema.messages.snippet,
      fromIdentity: schema.messages.fromIdentity,
      receivedAt: schema.messages.receivedAt,
      threadId: schema.messages.threadId,
      aiSummary: schema.messages.aiSummary,
      aiCategory: schema.messages.aiCategory,
      aiPriority: schema.messages.aiPriority,
    })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.workspaceId, workspaceId),
        eq(schema.messages.direction, 'inbound'),
        eq(schema.messages.isRead, false),
        eq(schema.messages.isDeleted, false),
        gt(schema.messages.receivedAt, since),
      )
    )
    .orderBy(desc(schema.messages.receivedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    snippet: r.snippet,
    fromName: (r.fromIdentity as any)?.display || (r.fromIdentity as any)?.value || 'Unknown',
    fromEmail: (r.fromIdentity as any)?.value || '',
    receivedAt: r.receivedAt,
    threadId: r.threadId,
    aiSummary: r.aiSummary,
    aiCategory: r.aiCategory,
    aiPriority: r.aiPriority,
  }));
}

/**
 * Find inbound messages where the user hasn't replied in 24h+
 */
export async function getAwaitingReply(workspaceId: string, limit: number): Promise<AwaitingReply[]> {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const cutoff14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const rows = await db.execute(sql`
    SELECT m.id, m.subject, m.from_identity, m.received_at, m.thread_id
    FROM messages m
    WHERE m.workspace_id = ${workspaceId}
      AND m.direction = 'inbound'
      AND m.is_deleted = false
      AND m.received_at < ${cutoff24h.toISOString()}
      AND m.received_at > ${cutoff14d.toISOString()}
      AND m.thread_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM messages r
        WHERE r.thread_id = m.thread_id
          AND r.workspace_id = ${workspaceId}
          AND r.direction = 'outbound'
          AND r.received_at > m.received_at
      )
    ORDER BY m.received_at DESC
    LIMIT ${limit}
  `);

  return (rows.rows as any[]).map((r) => {
    const from = typeof r.from_identity === 'string' ? JSON.parse(r.from_identity) : r.from_identity;
    const receivedAt = new Date(r.received_at);
    return {
      id: r.id,
      subject: r.subject,
      fromName: from?.display || from?.value || 'Unknown',
      fromEmail: from?.value || '',
      receivedAt,
      hoursSinceReceived: Math.floor((Date.now() - receivedAt.getTime()) / (1000 * 60 * 60)),
    };
  });
}

/**
 * Find outbound messages sent 3+ days ago with no inbound reply
 */
export async function getStaleFollowUps(workspaceId: string, limit: number): Promise<StaleFollowUp[]> {
  const cutoff3d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const rows = await db.execute(sql`
    SELECT m.id, m.subject, m.to_identities, m.received_at, m.thread_id
    FROM messages m
    WHERE m.workspace_id = ${workspaceId}
      AND m.direction = 'outbound'
      AND m.is_deleted = false
      AND m.received_at < ${cutoff3d.toISOString()}
      AND m.received_at > ${cutoff30d.toISOString()}
      AND m.thread_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM messages r
        WHERE r.thread_id = m.thread_id
          AND r.workspace_id = ${workspaceId}
          AND r.direction = 'inbound'
          AND r.received_at > m.received_at
      )
    ORDER BY m.received_at DESC
    LIMIT ${limit}
  `);

  return (rows.rows as any[]).map((r) => {
    const to = typeof r.to_identities === 'string' ? JSON.parse(r.to_identities) : r.to_identities;
    const first = Array.isArray(to) ? to[0] : to;
    const sentAt = new Date(r.received_at);
    return {
      id: r.id,
      subject: r.subject,
      recipientName: first?.display || first?.value || 'Unknown',
      recipientEmail: first?.value || '',
      sentAt,
      daysSinceSent: Math.floor((Date.now() - sentAt.getTime()) / (1000 * 60 * 60 * 24)),
    };
  });
}

/**
 * Get total unread count for the workspace
 */
export async function getUnreadCount(workspaceId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.workspaceId, workspaceId),
        eq(schema.messages.direction, 'inbound'),
        eq(schema.messages.isRead, false),
        eq(schema.messages.isDeleted, false),
      )
    );
  return result?.count || 0;
}

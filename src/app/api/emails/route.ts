import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getWorkspace } from '@/lib/auth/workspace';
import { db, schema } from '@/lib/db';
import { eq, desc, and, or, sql } from 'drizzle-orm';
import { z } from 'zod';

const querySchema = z.object({
  page: z.string().optional().default('1').transform((v) => parseInt(v, 10)),
  limit: z.string().optional().default('50').transform((v) => parseInt(v, 10)),
  folder: z.string().optional(),
  channelAccountId: z.string().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  unread: z.string().optional().transform((v) => v === 'true'),
  starred: z.string().optional().transform((v) => v === 'true'),
});

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const workspace = await getWorkspace();
  if (!workspace) {
    return NextResponse.json({ emails: [] });
  }

  const { searchParams } = new URL(request.url);
  const params = querySchema.parse(Object.fromEntries(searchParams.entries()));

  const conditions = [eq(schema.messages.workspaceId, workspace.workspaceId)];

  if (params.channelAccountId) {
    conditions.push(eq(schema.messages.channelAccountId, params.channelAccountId));
  }

  if (params.folder) {
    switch (params.folder) {
      case 'starred':
        conditions.push(eq(schema.messages.isStarred, true));
        break;
      case 'trash':
        conditions.push(eq(schema.messages.isDeleted, true));
        break;
      case 'sent':
        conditions.push(eq(schema.messages.direction, 'outbound'));
        break;
      case 'archive':
        // Track A messages don't have an isArchived — for now, no results.
        conditions.push(sql`false`);
        break;
      case 'drafts':
        // Drafts not implemented yet on Track A — empty results.
        conditions.push(sql`false`);
        break;
      default:
        // Default inbox — inbound, not deleted
        conditions.push(eq(schema.messages.direction, 'inbound'));
        conditions.push(eq(schema.messages.isDeleted, false));
    }
  } else {
    // Default: inbound inbox, not deleted
    conditions.push(eq(schema.messages.direction, 'inbound'));
    conditions.push(eq(schema.messages.isDeleted, false));
  }

  if (params.category) {
    conditions.push(eq(schema.messages.aiCategory, params.category as any));
  }

  if (params.unread) {
    conditions.push(eq(schema.messages.isRead, false));
  }

  if (params.starred) {
    conditions.push(eq(schema.messages.isStarred, true));
  }

  if (params.search) {
    // Use tsvector full-text search if available, fall back to ILIKE
    conditions.push(
      sql`${schema.messages.bodyTsv} @@ plainto_tsquery('english', ${params.search})`
    );
  }

  const offset = (params.page - 1) * params.limit;

  try {
    const rows = await db
      .select({
        id: schema.messages.id,
        channelAccountId: schema.messages.channelAccountId,
        providerMessageId: schema.messages.providerMessageId,
        subject: schema.messages.subject,
        fromIdentity: schema.messages.fromIdentity,
        snippet: schema.messages.snippet,
        receivedAt: schema.messages.receivedAt,
        isRead: schema.messages.isRead,
        isStarred: schema.messages.isStarred,
        hasAttachments: schema.messages.hasAttachments,
        aiCategory: schema.messages.aiCategory,
        aiPriority: schema.messages.aiPriority,
        direction: schema.messages.direction,
      })
      .from(schema.messages)
      .where(and(...conditions))
      .orderBy(desc(schema.messages.receivedAt))
      .limit(params.limit)
      .offset(offset);

    // Map to the shape the frontend expects (backward compat).
    const emails = rows.map((r) => ({
      id: r.id,
      accountId: r.channelAccountId,
      messageId: r.providerMessageId,
      subject: r.subject,
      fromAddress: (r.fromIdentity as any)?.value ?? '',
      fromName: (r.fromIdentity as any)?.display ?? '',
      snippet: r.snippet,
      receivedAt: r.receivedAt,
      isRead: r.isRead,
      isStarred: r.isStarred,
      hasAttachments: r.hasAttachments,
      aiCategory: r.aiCategory,
      aiPriority: r.aiPriority,
    }));

    return NextResponse.json({ emails });
  } catch (error) {
    console.error('[emails] GET failed', error);
    return NextResponse.json({ emails: [] });
  }
}

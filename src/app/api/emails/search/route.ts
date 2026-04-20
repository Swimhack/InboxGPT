import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getWorkspace } from '@/lib/auth/workspace';
import { db, schema } from '@/lib/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { z } from 'zod';

const searchSchema = z.object({
  q: z.string().min(1),
  limit: z.string().optional().default('20').transform((v) => parseInt(v, 10)),
});

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ emails: [] });

  const { searchParams } = new URL(request.url);
  const parsed = searchSchema.safeParse({
    q: searchParams.get('q'),
    limit: searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'Search query required' }, { status: 400 });

  const { q, limit } = parsed.data;

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
      })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.workspaceId, workspace.workspaceId),
          eq(schema.messages.isDeleted, false),
          sql`${schema.messages.bodyTsv} @@ plainto_tsquery('english', ${q})`
        )
      )
      .orderBy(desc(schema.messages.receivedAt))
      .limit(limit);

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
    console.error('[search] failed', error);
    return NextResponse.json({ emails: [] });
  }
}

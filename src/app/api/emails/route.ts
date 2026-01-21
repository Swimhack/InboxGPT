import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { eq, desc, and, like, or } from 'drizzle-orm';
import { z } from 'zod';

const querySchema = z.object({
  page: z.string().optional().default('1').transform((v) => parseInt(v, 10)),
  limit: z.string().optional().default('50').transform((v) => parseInt(v, 10)),
  folder: z.string().optional(),
  accountId: z.string().optional(),
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

  const { searchParams } = new URL(request.url);
  const params = querySchema.parse(Object.fromEntries(searchParams.entries()));

  const conditions = [eq(schema.emails.userId, session.user.id)];

  if (params.accountId) {
    conditions.push(eq(schema.emails.accountId, params.accountId));
  }

  // Handle special folder types
  if (params.folder) {
    switch (params.folder) {
      case 'starred':
        conditions.push(eq(schema.emails.isStarred, true));
        break;
      case 'archive':
        conditions.push(eq(schema.emails.isArchived, true));
        break;
      case 'trash':
        conditions.push(eq(schema.emails.folder, 'trash'));
        break;
      case 'sent':
        conditions.push(eq(schema.emails.folder, 'sent'));
        break;
      case 'drafts':
        conditions.push(eq(schema.emails.folder, 'drafts'));
        break;
      default:
        // Default inbox - exclude archived and trash
        conditions.push(eq(schema.emails.isArchived, false));
        conditions.push(
          or(
            eq(schema.emails.folder, 'inbox'),
            eq(schema.emails.folder, params.folder)
          )!
        );
    }
  } else {
    // Default: show inbox, exclude archived
    conditions.push(eq(schema.emails.isArchived, false));
  }

  if (params.category) {
    conditions.push(eq(schema.emails.aiCategory, params.category as any));
  }

  if (params.unread) {
    conditions.push(eq(schema.emails.isRead, false));
  }

  if (params.starred) {
    conditions.push(eq(schema.emails.isStarred, true));
  }

  // Note: For full-text search, we should use FTS5 directly
  // This is a simplified LIKE search
  if (params.search) {
    conditions.push(
      or(
        like(schema.emails.subject, `%${params.search}%`),
        like(schema.emails.fromName, `%${params.search}%`),
        like(schema.emails.fromAddress, `%${params.search}%`)
      )!
    );
  }

  const offset = (params.page - 1) * params.limit;

  const emails = await db.query.emails.findMany({
    where: and(...conditions),
    orderBy: desc(schema.emails.receivedAt),
    limit: params.limit,
    offset,
    columns: {
      id: true,
      accountId: true,
      messageId: true,
      subject: true,
      fromAddress: true,
      fromName: true,
      snippet: true,
      receivedAt: true,
      isRead: true,
      isStarred: true,
      hasAttachments: true,
      aiCategory: true,
      aiPriority: true,
    },
    with: {
      account: {
        columns: {
          email: true,
          displayName: true,
        },
      },
    },
  });

  return NextResponse.json({ emails });
}

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { eq, and, or, like, desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  if (!query) {
    return NextResponse.json({ error: 'Search query required' }, { status: 400 });
  }

  const searchPattern = `%${query}%`;

  // Get user's account IDs first
  const accounts = await db.query.emailAccounts.findMany({
    where: eq(schema.emailAccounts.userId, session.user.id),
    columns: { id: true },
  });

  const accountIds = accounts.map((a) => a.id);

  if (accountIds.length === 0) {
    return NextResponse.json({ emails: [], total: 0 });
  }

  // Search emails across subject, from, and body
  const emails = await db.query.emails.findMany({
    where: and(
      or(...accountIds.map((id) => eq(schema.emails.accountId, id))),
      or(
        like(schema.emails.subject, searchPattern),
        like(schema.emails.fromAddress, searchPattern),
        like(schema.emails.fromName, searchPattern),
        like(schema.emails.bodyText, searchPattern),
        like(schema.emails.snippet, searchPattern)
      )
    ),
    orderBy: [desc(schema.emails.receivedAt)],
    limit,
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

  return NextResponse.json({
    emails,
    query,
    count: emails.length,
  });
}

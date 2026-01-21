import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { addEmailSyncJob } from '@/lib/queue';
import { z } from 'zod';

const syncSchema = z.object({
  accountId: z.string(),
  type: z.enum(['full', 'incremental']).optional().default('incremental'),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { accountId, type } = syncSchema.parse(body);

    // Verify account ownership
    const account = await db.query.emailAccounts.findFirst({
      where: and(
        eq(schema.emailAccounts.id, accountId),
        eq(schema.emailAccounts.userId, session.user.id)
      ),
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Check if already syncing
    if (account.syncStatus === 'syncing') {
      return NextResponse.json({ error: 'Sync already in progress' }, { status: 409 });
    }

    // Queue sync job
    const jobId = await addEmailSyncJob({
      accountId,
      userId: session.user.id,
      type,
    });

    return NextResponse.json({ success: true, jobId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to start sync' }, { status: 500 });
  }
}

// Get sync status for all accounts
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accounts = await db.query.emailAccounts.findMany({
    where: eq(schema.emailAccounts.userId, session.user.id),
    columns: {
      id: true,
      email: true,
      syncStatus: true,
      lastSyncAt: true,
      syncError: true,
    },
  });

  return NextResponse.json({ accounts });
}

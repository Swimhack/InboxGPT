import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  const account = await db.query.emailAccounts.findFirst({
    where: and(
      eq(schema.emailAccounts.id, id),
      eq(schema.emailAccounts.userId, session.user.id)
    ),
  });

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  if (account.syncStatus === 'syncing') {
    return NextResponse.json({ error: 'Sync already in progress' }, { status: 400 });
  }

  // Update sync status to syncing
  await db.update(schema.emailAccounts)
    .set({
      syncStatus: 'syncing',
      syncError: null,
    })
    .where(eq(schema.emailAccounts.id, id));

  // In a production environment, this would add a job to BullMQ
  // For now, we'll trigger a background sync simulation
  triggerBackgroundSync(id, session.user.id);

  return NextResponse.json({ success: true, message: 'Sync started' });
}

async function triggerBackgroundSync(accountId: string, userId: string) {
  // This would normally add to a BullMQ queue
  // For development, we'll simulate a sync with a timeout
  setTimeout(async () => {
    try {
      // Simulate sync completion
      await db.update(schema.emailAccounts)
        .set({
          syncStatus: 'idle',
          lastSyncAt: new Date(),
        })
        .where(eq(schema.emailAccounts.id, accountId));
    } catch (error) {
      console.error('Sync error:', error);
      await db.update(schema.emailAccounts)
        .set({
          syncStatus: 'error',
          syncError: 'Sync failed',
        })
        .where(eq(schema.emailAccounts.id, accountId));
    }
  }, 3000);
}

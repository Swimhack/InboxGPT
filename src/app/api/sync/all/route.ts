import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { eq, and, ne } from 'drizzle-orm';

export async function POST() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get all active accounts that aren't already syncing
  const accounts = await db.query.emailAccounts.findMany({
    where: and(
      eq(schema.emailAccounts.userId, session.user.id),
      eq(schema.emailAccounts.isActive, true),
      ne(schema.emailAccounts.syncStatus, 'syncing')
    ),
    columns: { id: true },
  });

  if (accounts.length === 0) {
    return NextResponse.json({ message: 'No accounts to sync', syncing: 0 });
  }

  // Mark all accounts as syncing
  await Promise.all(
    accounts.map((account) =>
      db.update(schema.emailAccounts)
        .set({
          syncStatus: 'syncing',
          syncError: null,
        })
        .where(eq(schema.emailAccounts.id, account.id))
    )
  );

  // In production, this would add jobs to BullMQ for each account
  // For development, simulate sync completion
  accounts.forEach((account) => {
    setTimeout(async () => {
      try {
        await db.update(schema.emailAccounts)
          .set({
            syncStatus: 'idle',
            lastSyncAt: new Date(),
          })
          .where(eq(schema.emailAccounts.id, account.id));
      } catch (error) {
        console.error(`Sync error for account ${account.id}:`, error);
        await db.update(schema.emailAccounts)
          .set({
            syncStatus: 'error',
            syncError: 'Sync failed',
          })
          .where(eq(schema.emailAccounts.id, account.id));
      }
    }, 3000 + Math.random() * 2000);
  });

  return NextResponse.json({
    success: true,
    message: `Sync started for ${accounts.length} account(s)`,
    syncing: accounts.length,
  });
}

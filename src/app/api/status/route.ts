import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { eq, and, isNull } from 'drizzle-orm';

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all accounts with their sync status
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

    // Count emails pending AI processing
    const pendingAI = await db.query.emails.findMany({
      where: and(
        eq(schema.emails.userId, session.user.id),
        isNull(schema.emails.aiProcessedAt)
      ),
      columns: { id: true },
    });

    // Get queue stats if available
    let queueStats = { pending: 0, processing: 0 };
    try {
      const { getQueueStats } = await import('@/lib/queue');
      const stats = await getQueueStats();
      queueStats = {
        pending: stats.pending,
        processing: stats.processing,
      };
    } catch {
      // Queue module might not be available
    }

    // Determine overall status
    const isSyncing = accounts.some((a) => a.syncStatus === 'syncing');
    const hasErrors = accounts.some((a) => a.syncStatus === 'error');
    const isAIProcessing = pendingAI.length > 0 || queueStats.processing > 0;

    // Get most recent sync time
    const lastSync = accounts.reduce((latest, a) => {
      if (a.lastSyncAt && (!latest || a.lastSyncAt > latest)) {
        return a.lastSyncAt;
      }
      return latest;
    }, null as Date | null);

    return NextResponse.json({
      syncing: isSyncing,
      aiProcessing: isAIProcessing,
      hasErrors,
      pendingEmails: pendingAI.length,
      lastSync: lastSync?.toISOString() || null,
      queueStats,
      accounts: accounts.map((a) => ({
        id: a.id,
        email: a.email,
        status: a.syncStatus,
        lastSync: a.lastSyncAt?.toISOString() || null,
        error: a.syncError,
      })),
    });
  } catch (error) {
    console.error('Status check failed:', error);
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getWorkspace } from '@/lib/auth/workspace';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspace = await getWorkspace();
  if (!workspace) {
    return NextResponse.json({
      syncing: false,
      accounts: [],
      queueStats: { pending: 0, processing: 0 },
    });
  }

  try {
    const accounts = await db
      .select({
        id: schema.channelAccounts.id,
        externalAccountId: schema.channelAccounts.externalAccountId,
        provider: schema.channelAccounts.provider,
        status: schema.channelAccounts.status,
        lastSyncAt: schema.channelAccounts.lastSyncAt,
        lastError: schema.channelAccounts.lastError,
      })
      .from(schema.channelAccounts)
      .where(eq(schema.channelAccounts.workspaceId, workspace.workspaceId));

    let queueStats = { pending: 0, processing: 0 };
    try {
      const { getQueueStats } = await import('@/lib/queue');
      const stats = await getQueueStats();
      queueStats = { pending: stats.pending, processing: stats.processing };
    } catch {
      /* queue module may not be available */
    }

    const hasErrors = accounts.some((a) => a.lastError != null);
    const lastSync = accounts.reduce((latest, a) => {
      if (a.lastSyncAt && (!latest || a.lastSyncAt > latest)) return a.lastSyncAt;
      return latest;
    }, null as Date | null);

    return NextResponse.json({
      syncing: queueStats.processing > 0,
      hasErrors,
      lastSync: lastSync?.toISOString() || null,
      queueStats,
      accounts: accounts.map((a) => ({
        id: a.id,
        email: a.externalAccountId,
        provider: a.provider,
        status: a.status,
        lastSync: a.lastSyncAt?.toISOString() || null,
        error: a.lastError,
      })),
    });
  } catch (error) {
    console.error('Status check failed:', error);
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getWorkspace } from '@/lib/auth/workspace';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { addEmailSyncJob } from '@/lib/queue';

export async function POST() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const workspace = await getWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: 'No workspace' }, { status: 400 });
  }

  const accounts = await db
    .select({ id: schema.channelAccounts.id, provider: schema.channelAccounts.provider })
    .from(schema.channelAccounts)
    .where(
      and(
        eq(schema.channelAccounts.workspaceId, workspace.workspaceId),
        eq(schema.channelAccounts.status, 'active')
      )
    );

  if (accounts.length === 0) {
    return NextResponse.json({ message: 'No accounts to sync', syncing: 0 });
  }

  await Promise.all(
    accounts.map((account) =>
      addEmailSyncJob({
        accountId: account.id,
        userId: session.user.id as string,
        type: 'incremental',
      }).catch((err) => {
        console.error(`[sync/all] failed to enqueue job for account ${account.id}`, err);
      })
    )
  );

  return NextResponse.json({
    success: true,
    message: `Sync queued for ${accounts.length} account(s)`,
    syncing: accounts.length,
  });
}

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getWorkspace } from '@/lib/auth/workspace';
import { withWorkspace, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const workspace = await getWorkspace();
  if (!workspace) {
    return NextResponse.json({ syncing: false, accounts: [] });
  }

  const accounts = await withWorkspace(workspace.workspaceId, (tx) => tx
    .select({
      id: schema.channelAccounts.id,
      provider: schema.channelAccounts.provider,
      externalAccountId: schema.channelAccounts.externalAccountId,
      lastSyncAt: schema.channelAccounts.lastSyncAt,
      lastError: schema.channelAccounts.lastError,
      status: schema.channelAccounts.status,
    })
    .from(schema.channelAccounts)
    .where(eq(schema.channelAccounts.workspaceId, workspace.workspaceId)));

  return NextResponse.json({
    syncing: false, // Job queue is async — we can't know if a job is mid-flight here
    accounts: accounts.map((a) => ({
      id: a.id,
      provider: a.provider,
      email: a.externalAccountId,
      lastSyncAt: a.lastSyncAt,
      lastError: a.lastError,
      status: a.status,
    })),
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getWorkspace } from '@/lib/auth/workspace';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { addEmailSyncJob } from '@/lib/queue';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const workspace = await getWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: 'No workspace' }, { status: 400 });
  }

  const { id } = await params;

  const [account] = await db
    .select({ id: schema.channelAccounts.id })
    .from(schema.channelAccounts)
    .where(
      and(
        eq(schema.channelAccounts.id, id),
        eq(schema.channelAccounts.workspaceId, workspace.workspaceId)
      )
    );

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const jobId = await addEmailSyncJob({
    accountId: id,
    userId: session.user.id as string,
    type: 'incremental',
  });

  return NextResponse.json({ success: true, jobId });
}

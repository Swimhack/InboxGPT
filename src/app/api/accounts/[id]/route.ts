import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getWorkspace } from '@/lib/auth/workspace';
import { withWorkspace, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';

export async function GET(
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

  const [account] = await withWorkspace(workspace.workspaceId, (tx) => tx
    .select({
      id: schema.channelAccounts.id,
      externalAccountId: schema.channelAccounts.externalAccountId,
      displayName: schema.channelAccounts.displayName,
      provider: schema.channelAccounts.provider,
      status: schema.channelAccounts.status,
      lastSyncAt: schema.channelAccounts.lastSyncAt,
      lastError: schema.channelAccounts.lastError,
      createdAt: schema.channelAccounts.createdAt,
    })
    .from(schema.channelAccounts)
    .where(
      and(
        eq(schema.channelAccounts.id, id),
        eq(schema.channelAccounts.workspaceId, workspace.workspaceId)
      )
    ));

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  return NextResponse.json({ account });
}

export async function DELETE(
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

  await withWorkspace(workspace.workspaceId, (tx) => tx
    .delete(schema.channelAccounts)
    .where(
      and(
        eq(schema.channelAccounts.id, id),
        eq(schema.channelAccounts.workspaceId, workspace.workspaceId)
      )
    ));

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
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
  const body = await request.json();

  const updates: Partial<typeof schema.channelAccounts.$inferInsert> = {};
  if (typeof body.displayName === 'string') updates.displayName = body.displayName;
  if (typeof body.isActive === 'boolean') updates.status = body.isActive ? 'active' : 'paused';
  if (body.status === 'active' || body.status === 'paused' || body.status === 'error') {
    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: true });
  }

  updates.updatedAt = new Date();

  await withWorkspace(workspace.workspaceId, (tx) => tx
    .update(schema.channelAccounts)
    .set(updates)
    .where(
      and(
        eq(schema.channelAccounts.id, id),
        eq(schema.channelAccounts.workspaceId, workspace.workspaceId)
      )
    ));

  return NextResponse.json({ success: true });
}

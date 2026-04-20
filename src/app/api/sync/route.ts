import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getWorkspace } from '@/lib/auth/workspace';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { addEmailSyncJob } from '@/lib/queue';
import { z } from 'zod';

const syncSchema = z.object({
  accountId: z.string().uuid(),
  type: z.enum(['full', 'incremental']).optional().default('incremental'),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const workspace = await getWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: 'No workspace' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { accountId, type } = syncSchema.parse(body);

    const [account] = await db
      .select({ id: schema.channelAccounts.id })
      .from(schema.channelAccounts)
      .where(
        and(
          eq(schema.channelAccounts.id, accountId),
          eq(schema.channelAccounts.workspaceId, workspace.workspaceId)
        )
      );

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const jobId = await addEmailSyncJob({
      accountId,
      userId: session.user.id as string,
      type,
    });

    return NextResponse.json({ success: true, jobId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error('[sync] failed', error);
    return NextResponse.json({ error: 'Failed to start sync' }, { status: 500 });
  }
}

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const workspace = await getWorkspace();
  if (!workspace) {
    return NextResponse.json({ accounts: [] });
  }

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

  return NextResponse.json({ accounts });
}

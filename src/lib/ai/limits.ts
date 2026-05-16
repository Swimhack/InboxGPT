import { db, schema } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import { hasAI, PLANS, type PlanId } from '@/lib/stripe/plans';

export async function canUseAI(workspaceId: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const [workspace] = await db
    .select({ plan: schema.workspaces.plan })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));

  if (!workspace) return { allowed: false, reason: 'Workspace not found' };

  if (!hasAI(workspace.plan || 'free')) {
    return { allowed: false, reason: 'upgrade_required' };
  }

  return { allowed: true };
}

export async function canSyncMore(workspaceId: string): Promise<{
  allowed: boolean;
  currentCount: number;
  limit: number;
}> {
  const [workspace] = await db
    .select({ plan: schema.workspaces.plan })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));

  const plan = workspace?.plan || 'free';
  const planDef = PLANS[plan as PlanId] ?? PLANS.free;
  const limit = planDef.messagesPerMonth;

  // Count messages synced this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.messages)
    .where(
      sql`${schema.messages.workspaceId} = ${workspaceId} AND ${schema.messages.receivedAt} >= ${startOfMonth.toISOString()}`
    );

  const currentCount = result?.count || 0;

  return {
    allowed: currentCount < limit,
    currentCount,
    limit,
  };
}

import { db, schema } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import { hasAI, isAdmin, PLANS, type PlanId } from '@/lib/stripe/plans';

export const AI_LIMITS = {
  FREE_TIER_EMAILS_PER_USER: 50,
};

export async function getUserUsage(userId: string) {
  const [result] = await db
    .select({
      totalEmailsProcessed: sql<number>`coalesce(sum(${schema.aiUsage.messagesProcessed}), 0)::int`,
    })
    .from(schema.aiUsage)
    .where(eq(schema.aiUsage.userId, userId));

  return { totalEmailsProcessed: result?.totalEmailsProcessed || 0 };
}

export async function canUseAI(workspaceId: string, email?: string | null): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const [workspace] = await db
    .select({ plan: schema.workspaces.plan })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));

  if (!workspace) return { allowed: false, reason: 'Workspace not found' };

  if (!hasAI(workspace.plan || 'free', email)) {
    return { allowed: false, reason: 'upgrade_required' };
  }

  return { allowed: true };
}

export async function canSyncMore(workspaceId: string, email?: string | null): Promise<{
  allowed: boolean;
  currentCount: number;
  limit: number;
}> {
  if (isAdmin(email)) return { allowed: true, currentCount: 0, limit: Infinity };
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

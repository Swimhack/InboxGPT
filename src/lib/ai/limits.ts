
import { db } from '@/lib/db';
import { aiUsage, users } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export const AI_LIMITS = {
    // Free tier (founder pays)
    FREE_TIER_EMAILS_PER_USER: 50,      // Lifetime limit per user
    FREE_TIER_MONTHLY_BUDGET_CENTS: 2000, // $20 total monthly cap

    // BYOK (user pays)
    BYOK_RATE_LIMIT_PER_MINUTE: 10,     // Prevent abuse
};

export async function getUser(userId: string) {
    return await db.query.users.findFirst({
        where: eq(users.id, userId),
    });
}

export async function getUserUsage(userId: string) {
    const result = await db
        .select({
            totalEmailsProcessed: sql<number>`sum(${aiUsage.emailsProcessed})`,
        })
        .from(aiUsage)
        .where(eq(aiUsage.userId, userId));

    return {
        totalEmailsProcessed: result[0]?.totalEmailsProcessed || 0
    };
}

export async function getMonthlySpend() {
    // Get start of current month YYYY-MM-DD
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

    const result = await db
        .select({
            totalCost: sql<number>`sum(${aiUsage.estimatedCostCents})`,
        })
        .from(aiUsage)
        .where(sql`${aiUsage.date} >= ${startOfMonth}`);

    return result[0]?.totalCost || 0;
}


export async function canProcessWithAI(userId: string): Promise<{
    allowed: boolean;
    reason?: string;
    useFounderKey: boolean;
}> {
    const user = await getUser(userId);
    if (!user) return { allowed: false, reason: 'User not found', useFounderKey: false };

    // User has own key - always allowed
    if (user.userAnthropicKey || user.userOpenaiKey) {
        return { allowed: true, useFounderKey: false };
    }

    // Check free tier limit
    const usage = await getUserUsage(userId);
    if (usage.totalEmailsProcessed >= AI_LIMITS.FREE_TIER_EMAILS_PER_USER) {
        return {
            allowed: false,
            reason: 'Free AI limit reached. Add your own API key to continue.',
            useFounderKey: false
        };
    }

    // Check global monthly budget
    const monthlySpend = await getMonthlySpend();
    if (monthlySpend >= AI_LIMITS.FREE_TIER_MONTHLY_BUDGET_CENTS) {
        return {
            allowed: false,
            reason: 'Demo AI budget exhausted this month. Add your own API key.',
            useFounderKey: false
        };
    }

    return { allowed: true, useFounderKey: true };
}

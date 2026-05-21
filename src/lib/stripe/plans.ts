// Admin emails always get full Pro access regardless of plan
const ADMIN_EMAILS = new Set([
  'swimhack@gmail.com',
]);

export function isAdmin(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.has(email.toLowerCase());
}

export type PlanId = 'free' | 'pro';

export interface PlanDef {
  id: PlanId;
  name: string;
  price: number; // cents/month, 0 = free
  priceLabel: string;
  channels: number;
  messagesPerMonth: number;
  ai: boolean;
  features: string[];
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    priceLabel: '$0',
    channels: 1,
    messagesPerMonth: 500,
    ai: false,
    features: [
      '1 email account',
      '500 messages/month',
      'Unified inbox',
      'Search across accounts',
      'Star, archive, folders',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 900,
    priceLabel: '$9/mo',
    channels: Infinity,
    messagesPerMonth: Infinity,
    ai: true,
    features: [
      'Unlimited email accounts',
      'Unlimited messages',
      'AI daily brief',
      'AI categorization & priority',
      'AI suggested replies',
      'AI email summaries',
    ],
  },
};

export function getPriceId(plan: PlanId): string | null {
  if (plan === 'free') return null;
  if (plan === 'pro') return process.env.STRIPE_PRO_PRICE_ID || null;
  return null;
}

export function planFromPriceId(priceId: string): PlanId {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'pro';
  return 'free';
}

export function canAddChannel(plan: string, currentCount: number, email?: string | null): boolean {
  if (isAdmin(email)) return true;
  const p = PLANS[plan as PlanId] ?? PLANS.free;
  return currentCount < p.channels;
}

export function canSyncMessages(plan: string, currentMonthCount: number, email?: string | null): boolean {
  if (isAdmin(email)) return true;
  const p = PLANS[plan as PlanId] ?? PLANS.free;
  return currentMonthCount < p.messagesPerMonth;
}

export function hasAI(plan: string, email?: string | null): boolean {
  if (isAdmin(email)) return true;
  const p = PLANS[plan as PlanId] ?? PLANS.free;
  return p.ai;
}

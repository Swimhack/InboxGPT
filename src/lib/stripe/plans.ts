// Admin emails always get full Pro access regardless of plan
const ADMIN_EMAILS = new Set([
  'swimhack@gmail.com',
]);

export function isAdmin(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.has(email.toLowerCase());
}

// Pricing aligned with the StricklandAI ecosystem standard (2026-07-06):
// Free → Pro $29/mo → Business $99/mo (matches STRIX Pro/Business tiers).
export type PlanId = 'free' | 'pro' | 'business';

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
    price: 2900,
    priceLabel: '$29/mo',
    channels: 5,
    messagesPerMonth: 10000,
    ai: true,
    features: [
      'Up to 5 email accounts',
      '10,000 messages/month',
      'AI daily brief',
      'AI categorization & priority',
      'AI suggested replies',
      'AI email summaries',
      'Email support',
    ],
  },
  business: {
    id: 'business',
    name: 'Business',
    price: 9900,
    priceLabel: '$99/mo',
    channels: Infinity,
    messagesPerMonth: Infinity,
    ai: true,
    features: [
      'Unlimited email accounts',
      'Unlimited messages',
      'Everything in Pro',
      'Team & shared inbox',
      'Priority support & onboarding',
      'Self-hosting / custom deployment',
      'Security review & DPA on request',
    ],
  },
};

export function getPriceId(plan: PlanId): string | null {
  if (plan === 'free') return null;
  if (plan === 'pro') return process.env.STRIPE_PRO_PRICE_ID || null;
  if (plan === 'business') return process.env.STRIPE_BUSINESS_PRICE_ID || null;
  return null;
}

export function planFromPriceId(priceId: string): PlanId {
  if (priceId === process.env.STRIPE_BUSINESS_PRICE_ID) return 'business';
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

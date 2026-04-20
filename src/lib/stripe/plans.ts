export type PlanId = 'free' | 'pro' | 'business';

export interface PlanDef {
  id: PlanId;
  name: string;
  price: number; // cents/month, 0 = free
  priceLabel: string;
  channels: number;
  messagesPerMonth: number;
  members: number;
  ai: boolean;
  storage: string;
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
    members: 1,
    ai: false,
    storage: '30 days',
    features: [
      '1 email channel',
      '500 messages/month',
      'Basic inbox',
      '30-day message retention',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 1200,
    priceLabel: '$12/mo',
    channels: 5,
    messagesPerMonth: 10_000,
    members: 5,
    ai: true,
    storage: '1 year',
    features: [
      '5 channels (email, Slack, Discord)',
      '10,000 messages/month',
      'AI summaries & smart replies',
      '5 team members',
      '1-year message retention',
    ],
  },
  business: {
    id: 'business',
    name: 'Business',
    price: 2900,
    priceLabel: '$29/mo',
    channels: Infinity,
    messagesPerMonth: Infinity,
    members: Infinity,
    ai: true,
    storage: 'Unlimited',
    features: [
      'Unlimited channels',
      'Unlimited messages',
      'Full AI + custom models',
      'Unlimited team members',
      'Unlimited retention',
      'Priority support',
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
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'pro';
  if (priceId === process.env.STRIPE_BUSINESS_PRICE_ID) return 'business';
  return 'free';
}

export function canAddChannel(plan: string, currentCount: number): boolean {
  const p = PLANS[plan as PlanId] ?? PLANS.free;
  return currentCount < p.channels;
}

export function canSyncMessages(plan: string, currentMonthCount: number): boolean {
  const p = PLANS[plan as PlanId] ?? PLANS.free;
  return currentMonthCount < p.messagesPerMonth;
}

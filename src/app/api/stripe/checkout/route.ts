import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { requireWorkspace } from '@/lib/auth/workspace';
import { createCheckoutSession } from '@/lib/stripe/checkout';
import { getPriceId, type PlanId } from '@/lib/stripe/plans';

const bodySchema = z.object({
  plan: z.enum(['pro']),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspace = await requireWorkspace();
  const body = bodySchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  const priceId = getPriceId(body.data.plan as PlanId);
  if (!priceId) {
    return NextResponse.json(
      { error: 'Stripe price not configured. Set STRIPE_PRO_PRICE_ID.' },
      { status: 501 }
    );
  }

  const baseUrl = process.env.NEXTAUTH_URL || 'https://inboxgpt.stricklandai.com';

  const checkoutSession = await createCheckoutSession({
    workspaceId: workspace.workspaceId,
    priceId,
    customerEmail: session.user.email,
    successUrl: `${baseUrl}/inbox?upgraded=true`,
    cancelUrl: `${baseUrl}/inbox`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}

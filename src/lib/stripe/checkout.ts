import { getStripe } from './client';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export async function createCheckoutSession(opts: {
  workspaceId: string;
  priceId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const stripe = getStripe();

  // Reuse existing Stripe customer if we have one
  const [ws] = await db
    .select({ stripeCustomerId: schema.workspaces.stripeCustomerId })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, opts.workspaceId));

  const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    mode: 'subscription',
    line_items: [{ price: opts.priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: { workspaceId: opts.workspaceId },
    subscription_data: {
      metadata: { workspaceId: opts.workspaceId },
    },
  };

  if (ws?.stripeCustomerId) {
    sessionParams.customer = ws.stripeCustomerId;
  } else {
    sessionParams.customer_email = opts.customerEmail;
  }

  return stripe.checkout.sessions.create(sessionParams);
}

export async function createPortalSession(opts: {
  workspaceId: string;
  returnUrl: string;
}) {
  const stripe = getStripe();

  const [ws] = await db
    .select({ stripeCustomerId: schema.workspaces.stripeCustomerId })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, opts.workspaceId));

  if (!ws?.stripeCustomerId) {
    throw new Error('No Stripe customer for this workspace');
  }

  return stripe.billingPortal.sessions.create({
    customer: ws.stripeCustomerId,
    return_url: opts.returnUrl,
  });
}

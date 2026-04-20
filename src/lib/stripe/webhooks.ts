import type Stripe from 'stripe';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { planFromPriceId } from './plans';

export async function handleStripeWebhook(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.workspaceId;
      if (!workspaceId) {
        console.error('[stripe] checkout.session.completed missing workspaceId metadata');
        return;
      }

      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id;

      const customerId =
        typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id;

      // Determine plan from the subscription's price
      let plan = 'pro'; // default
      if (subscriptionId) {
        try {
          const { getStripe } = await import('./client');
          const stripe = getStripe();
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = sub.items.data[0]?.price.id;
          if (priceId) plan = planFromPriceId(priceId);
        } catch {
          /* fallback to pro */
        }
      }

      await db
        .update(schema.workspaces)
        .set({
          plan,
          stripeCustomerId: customerId ?? undefined,
          stripeSubscriptionId: subscriptionId ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(schema.workspaces.id, workspaceId));

      console.log(`[stripe] Workspace ${workspaceId} upgraded to ${plan}`);
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const workspaceId = sub.metadata?.workspaceId;
      if (!workspaceId) return;

      const priceId = sub.items.data[0]?.price.id;
      const plan = priceId ? planFromPriceId(priceId) : 'free';

      await db
        .update(schema.workspaces)
        .set({ plan, updatedAt: new Date() })
        .where(eq(schema.workspaces.id, workspaceId));

      console.log(`[stripe] Subscription updated → workspace ${workspaceId} now on ${plan}`);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const workspaceId = sub.metadata?.workspaceId;
      if (!workspaceId) return;

      await db
        .update(schema.workspaces)
        .set({
          plan: 'free',
          stripeSubscriptionId: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.workspaces.id, workspaceId));

      console.log(`[stripe] Subscription cancelled → workspace ${workspaceId} downgraded to free`);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      console.warn(`[stripe] Payment failed for invoice ${invoice.id}`);
      break;
    }

    default:
      console.log(`[stripe] Unhandled event: ${event.type}`);
  }
}

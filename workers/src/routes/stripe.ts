import { Hono } from 'hono';
import Stripe from 'stripe';
import type { Env, AuthContext } from '../bindings';
import * as profilesDb from '../db/profiles';
import { requiresLogin } from '../middleware/supabase-auth';
import { createServiceClient } from '../lib/supabase';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const stripeRoutes = new Hono<HonoEnv>();

function getStripe(env: Env): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  return new Stripe(env.STRIPE_SECRET_KEY);
}

// POST /api/stripe/create-checkout-session
stripeRoutes.post('/api/stripe/create-checkout-session', requiresLogin, async (c) => {
  const stripe = getStripe(c.env);
  if (!stripe) {
    return c.json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in environment.' }, 503);
  }

  const user = c.get('user');
  const profile = c.get('profile');
  const body = await c.req.json();
  const { plan } = body;

  const priceMap: Record<string, string | undefined> = {
    pro: c.env.STRIPE_PRICE_PRO,
    elite: c.env.STRIPE_PRICE_ELITE,
  };

  const priceId = priceMap[plan];
  if (!priceId) {
    return c.json({ error: 'Invalid plan. Must be "pro" or "elite".' }, 400);
  }

  try {
    const serviceClient = createServiceClient(c.env);

    let customerId = profile.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { accountId: user.id, email: profile.email },
      });
      customerId = customer.id;
      await profilesDb.updateById(serviceClient, user.id, { stripeCustomerId: customerId });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${c.env.APP_URL}/upgrade?success=true`,
      cancel_url: `${c.env.APP_URL}/upgrade?canceled=true`,
      metadata: { accountId: user.id, plan },
    });

    return c.json({ url: checkoutSession.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return c.json({ error: 'Failed to create checkout session.' }, 500);
  }
});

// POST /api/stripe/webhook (raw body — no auth needed)
stripeRoutes.post('/api/stripe/webhook', async (c) => {
  const stripe = getStripe(c.env);
  if (!stripe) return c.text('Stripe not configured', 503);

  const sig = c.req.header('stripe-signature');
  const endpointSecret = c.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !endpointSecret) {
    return c.text('Missing signature or secret', 400);
  }

  let event: Stripe.Event;
  try {
    const rawBody = await c.req.text();
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return c.text(`Webhook Error: ${err.message}`, 400);
  }

  const serviceClient = createServiceClient(c.env);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const checkoutSession = event.data.object as Stripe.Checkout.Session;
        const accountId = checkoutSession.metadata?.accountId;
        const plan = checkoutSession.metadata?.plan;
        if (accountId) {
          await profilesDb.updateById(serviceClient, accountId, {
            stripeSubscriptionId: checkoutSession.subscription as string,
            subscriptionPlan: plan || 'pro',
            subscriptionStatus: 'active',
          });
        }
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const account = await profilesDb.findByStripeCustomerId(
          serviceClient,
          subscription.customer as string,
        );
        if (account) {
          const isActive = ['active', 'trialing'].includes(subscription.status);
          await profilesDb.updateById(serviceClient, account.id, {
            subscriptionStatus: subscription.status,
            subscriptionPlan: isActive ? (account.subscription_plan || 'pro') : 'trial',
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const account = await profilesDb.findByStripeCustomerId(
          serviceClient,
          subscription.customer as string,
        );
        if (account) {
          await profilesDb.updateById(serviceClient, account.id, {
            subscriptionPlan: 'trial',
            subscriptionStatus: 'canceled',
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return c.text('Webhook handler error', 500);
  }

  return c.json({ received: true });
});

// POST /api/stripe/billing-portal
stripeRoutes.post('/api/stripe/billing-portal', requiresLogin, async (c) => {
  const stripe = getStripe(c.env);
  if (!stripe) {
    return c.json({ error: 'Stripe is not configured.' }, 503);
  }

  const profile = c.get('profile');

  try {
    if (!profile.stripe_customer_id) {
      return c.json({ error: 'No billing account found. Please subscribe first.' }, 400);
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${c.env.APP_URL}/trades`,
    });

    return c.json({ url: portalSession.url });
  } catch (err) {
    console.error('Billing portal error:', err);
    return c.json({ error: 'Failed to create billing portal session.' }, 500);
  }
});

export default stripeRoutes;

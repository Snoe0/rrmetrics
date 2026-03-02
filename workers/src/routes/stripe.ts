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

// GET /api/stripe/config (public — publishable key is safe to expose)
stripeRoutes.get('/api/stripe/config', (c) => {
  return c.json({ publishableKey: c.env.STRIPE_PUBLISHABLE_KEY || '' });
});

// GET /api/stripe/validate-coupon?code=XXX
stripeRoutes.get('/api/stripe/validate-coupon', requiresLogin, async (c) => {
  const stripe = getStripe(c.env);
  if (!stripe) return c.json({ error: 'Stripe not configured.' }, 503);

  const code = c.req.query('code');
  if (!code) return c.json({ error: 'No code provided.' }, 400);

  try {
    const promoCodes = await stripe.promotionCodes.list({
      code: code.trim().toUpperCase(),
      active: true,
      limit: 1,
    });

    if (promoCodes.data.length === 0) {
      return c.json({ error: 'Invalid or expired coupon code.' }, 404);
    }

    const promo = promoCodes.data[0];
    const coupon = promo.coupon;

    let display = '';
    if (coupon.percent_off) display = `${coupon.percent_off}% off`;
    else if (coupon.amount_off) display = `$${(coupon.amount_off / 100).toFixed(2)} off`;

    if (coupon.duration === 'once') display += ' (first month)';
    else if (coupon.duration === 'repeating' && coupon.duration_in_months) {
      display += ` for ${coupon.duration_in_months} month${coupon.duration_in_months > 1 ? 's' : ''}`;
    }

    return c.json({ id: promo.id, display, percentOff: coupon.percent_off, amountOff: coupon.amount_off });
  } catch (err) {
    console.error('Coupon validation error:', err);
    return c.json({ error: 'Failed to validate coupon.' }, 500);
  }
});

// POST /api/stripe/create-subscription
stripeRoutes.post('/api/stripe/create-subscription', requiresLogin, async (c) => {
  const stripe = getStripe(c.env);
  if (!stripe) {
    return c.json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in environment.' }, 503);
  }

  const user = c.get('user');
  const profile = c.get('profile');
  const body = await c.req.json();
  const { plan, promoCodeId, hasReferral } = body;

  const priceMap: Record<string, string | undefined> = {
    pro: c.env.STRIPE_PRICE_PRO,
    elite: c.env.STRIPE_PRICE_ELITE,
    pro_yearly: c.env.STRIPE_PRICE_PRO_YEARLY,
    elite_yearly: c.env.STRIPE_PRICE_ELITE_YEARLY,
  };

  const priceId = priceMap[plan];
  if (!priceId) {
    return c.json({ error: 'Invalid plan. Must be "pro", "elite", "pro_yearly", or "elite_yearly".' }, 400);
  }

  try {
    const serviceClient = createServiceClient(c.env);

    let customerId = profile.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email,
        metadata: { accountId: user.id },
      });
      customerId = customer.id;
      await profilesDb.updateById(serviceClient, user.id, { stripeCustomerId: customerId });
    }

    // Resolve the discount: explicit coupon code takes priority, otherwise
    // fall back to the referral promo code if the user has an applied referral.
    // Yearly plans never receive discounts.
    let discountPromoId: string | null = null;
    if (!plan.endsWith('_yearly')) {
      discountPromoId = promoCodeId || null;
      if (!discountPromoId && hasReferral) {
        const referralPromos = await stripe.promotionCodes.list({
          code: 'REFERREDBYTHEHOMIE123',
          active: true,
          limit: 1,
        });
        if (referralPromos.data.length > 0) {
          discountPromoId = referralPromos.data[0].id;
        }
      }
    }

    const subscriptionParams: Stripe.SubscriptionCreateParams = {
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: { accountId: user.id, plan: plan.replace('_yearly', '') },
    };

    if (discountPromoId) {
      subscriptionParams.discounts = [{ promotion_code: discountPromoId }];
    }

    const subscription = await stripe.subscriptions.create(subscriptionParams);

    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

    if (!paymentIntent?.client_secret) {
      return c.json({ error: 'Failed to initialize payment.' }, 500);
    }

    return c.json({
      subscriptionId: subscription.id,
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err) {
    console.error('Stripe subscription error:', err);
    return c.json({ error: 'Failed to create subscription.' }, 500);
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
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const account = await profilesDb.findByStripeCustomerId(
          serviceClient,
          subscription.customer as string,
        );
        if (account) {
          const isActive = ['active', 'trialing'].includes(subscription.status);
          // Prefer plan from subscription metadata, fall back to existing account plan
          const plan = subscription.metadata?.plan || account.subscription_plan || 'pro';
          await profilesDb.updateById(serviceClient, account.id, {
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            subscriptionPlan: isActive ? plan : 'free',
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
            subscriptionPlan: 'free',
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

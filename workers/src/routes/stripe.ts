import { Hono } from 'hono';
import Stripe from 'stripe';
import type { Env, AuthContext } from '../bindings';
import * as profilesDb from '../db/profiles';
import * as commissionsDb from '../db/commissions';
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

  const normalizedCode = code.trim();

  function buildDisplay(coupon: Stripe.Coupon): string {
    let display = '';
    if (coupon.percent_off != null) {
      display = `${coupon.percent_off}% off`;
    } else if (coupon.amount_off != null) {
      const dollars = coupon.amount_off / 100;
      display = `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)} off`;
    }
    if (coupon.duration === 'once') display += ' (first payment)';
    else if (coupon.duration === 'repeating' && coupon.duration_in_months) {
      display += ` for ${coupon.duration_in_months} month${coupon.duration_in_months > 1 ? 's' : ''}`;
    }
    return display;
  }

  async function resolveCoupon(couponOrId: Stripe.Coupon | string | null | undefined): Promise<Stripe.Coupon | null> {
    if (!couponOrId) return null;
    if (typeof couponOrId === 'string') {
      try {
        return await stripe!.coupons.retrieve(couponOrId) as Stripe.Coupon;
      } catch {
        return null;
      }
    }
    return couponOrId;
  }

  try {
    // First try promotion codes (customer-facing codes like SAVE20)
    const promoCodes = await stripe.promotionCodes.list({
      code: normalizedCode,
      active: true,
      limit: 1,
    });

    if (promoCodes.data.length > 0) {
      const promo = promoCodes.data[0];
      const coupon = await resolveCoupon(promo.promotion?.coupon);
      if (!coupon) {
        return c.json({ error: 'Invalid or expired coupon code.' }, 404);
      }
      return c.json({
        id: promo.id,
        display: buildDisplay(coupon),
        percentOff: coupon.percent_off,
        amountOff: coupon.amount_off,
      });
    }

    // Fallback 1: try direct coupon ID lookup
    try {
      const coupon = await stripe.coupons.retrieve(normalizedCode) as Stripe.Coupon;
      if (!(coupon as any).deleted && coupon.valid) {
        return c.json({
          id: coupon.id,
          display: buildDisplay(coupon),
          percentOff: coupon.percent_off,
          amountOff: coupon.amount_off,
          isCouponId: true,
        });
      }
    } catch {
      // not found by ID — continue
    }

    // Fallback 2: search coupons by name (Stripe stores user-facing names on the coupon object)
    const allCoupons = await stripe.coupons.list({ limit: 100 });
    const byName = allCoupons.data.find(
      (c) => c.name?.toLowerCase() === normalizedCode.toLowerCase() && c.valid
    );
    if (byName) {
      return c.json({
        id: byName.id,
        display: buildDisplay(byName),
        percentOff: byName.percent_off,
        amountOff: byName.amount_off,
        isCouponId: true,
      });
    }

    return c.json({ error: 'Invalid or expired coupon code.' }, 404);
  } catch (err) {
    console.error('Coupon validation error:', err);
    const stripeErr = err as Stripe.errors.StripeError;
    const message = stripeErr?.message || 'Failed to validate coupon.';
    return c.json({ error: message }, 500);
  }
});

// POST /api/stripe/create-payment-method — creates a PaymentMethod from raw card data
stripeRoutes.post('/api/stripe/create-payment-method', requiresLogin, async (c) => {
  const stripe = getStripe(c.env);
  if (!stripe) return c.json({ error: 'Stripe not configured.' }, 503);

  const { number, exp_month, exp_year, cvc, billing_details } = await c.req.json();

  if (!number || !exp_month || !exp_year || !cvc) {
    return c.json({ error: 'Missing card details.' }, 400);
  }

  try {
    const paymentMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: {
        number: String(number).replace(/\s/g, ''),
        exp_month: parseInt(exp_month, 10),
        exp_year: parseInt(exp_year, 10),
        cvc: String(cvc),
      },
      ...(billing_details ? { billing_details } : {}),
    });
    return c.json({ paymentMethodId: paymentMethod.id });
  } catch (err) {
    const stripeErr = err as Stripe.errors.StripeError;
    return c.json({ error: stripeErr?.message || 'Invalid card details.' }, 400);
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
  const { plan, promoCodeId, couponId, hasReferral } = body;

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
    } else {
      // Ensure existing customer has current email
      await stripe.customers.update(customerId, { email: profile.email });
    }

    // Resolve the discount: explicit coupon/promo code takes priority over referral.
    // Referral auto-discount only applies to monthly plans (it's a first-month discount).
    let discountPromoId: string | null = promoCodeId || null;
    let discountCouponId: string | null = couponId || null;

    if (!discountPromoId && !discountCouponId && hasReferral && !plan.endsWith('_yearly')) {
      const referralPromos = await stripe.promotionCodes.list({
        code: 'REFERREDBYTHEHOMIE123',
        active: true,
        limit: 1,
      });
      if (referralPromos.data.length > 0) {
        discountPromoId = referralPromos.data[0].id;
      }
    }

    const subscriptionParams: Stripe.SubscriptionCreateParams = {
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.confirmation_secret'],
      metadata: { accountId: user.id, plan: plan.replace('_yearly', '') },
    };

    if (discountPromoId) {
      subscriptionParams.discounts = [{ promotion_code: discountPromoId }];
    } else if (discountCouponId) {
      subscriptionParams.discounts = [{ coupon: discountCouponId }];
    }

    const subscription = await stripe.subscriptions.create(subscriptionParams);
    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const effectivePlan = plan.replace('_yearly', '');

    // Subscription already active (e.g. $0 invoice, 100% coupon, or invoice auto-paid)
    const isAlreadyActive = subscription.status === 'active' || subscription.status === 'trialing';
    const isInvoicePaid = invoice?.status === 'paid';

    if (isAlreadyActive || isInvoicePaid) {
      await profilesDb.updateById(serviceClient, user.id, {
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: isAlreadyActive ? subscription.status : 'active',
        subscriptionPlan: effectivePlan,
      });

      // Still collect a payment method for future billing (e.g. temporary 100% coupons)
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        usage: 'off_session',
      });

      return c.json({
        subscriptionId: subscription.id,
        status: 'complete',
        setupIntentSecret: setupIntent.client_secret,
      });
    }

    // Payment required — return client secret for card confirmation
    const clientSecret = invoice?.confirmation_secret?.client_secret;

    if (!clientSecret) {
      return c.json({ error: 'Failed to initialize payment.' }, 500);
    }

    return c.json({
      subscriptionId: subscription.id,
      clientSecret,
    });
  } catch (err) {
    console.error('Stripe subscription error:', err);
    return c.json({ error: 'Failed to create subscription.' }, 500);
  }
});

// POST /api/stripe/confirm-subscription — called after successful client-side payment
stripeRoutes.post('/api/stripe/confirm-subscription', requiresLogin, async (c) => {
  const stripe = getStripe(c.env);
  if (!stripe) return c.json({ error: 'Stripe not configured.' }, 503);

  const user = c.get('user');
  const { subscriptionId } = await c.req.json();
  if (!subscriptionId) return c.json({ error: 'Missing subscriptionId.' }, 400);

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice'],
    });
    const invoice = subscription.latest_invoice as Stripe.Invoice | null;
    const isActive = subscription.status === 'active' || subscription.status === 'trialing';
    const isInvoicePaid = invoice?.status === 'paid';

    // Update DB if subscription is active OR if the invoice was paid (race condition:
    // Stripe may not have transitioned the subscription status yet)
    if (isActive || isInvoicePaid) {
      const serviceClient = createServiceClient(c.env);
      const plan = subscription.metadata?.plan || 'pro';
      await profilesDb.updateById(serviceClient, user.id, {
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: isActive ? subscription.status : 'active',
        subscriptionPlan: plan,
      });
      return c.json({ status: 'active', plan });
    }
    return c.json({ status: subscription.status });
  } catch (err) {
    console.error('Confirm subscription error:', err);
    return c.json({ error: 'Failed to confirm subscription.' }, 500);
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
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, endpointSecret);
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
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        // Only process subscription invoices
        if (!(invoice as any).subscription) break;

        const customerId = invoice.customer as string;
        const account = await profilesDb.findByStripeCustomerId(serviceClient, customerId);
        if (!account) break;

        // Check if this user was referred
        const { data: referralUse } = await serviceClient
          .from('referral_uses')
          .select('referrer_id, subscription_started_at')
          .eq('referred_id', account.id)
          .single();

        if (!referralUse) break;

        const ratePercent = 15;
        const amountCents = Math.floor(invoice.amount_paid * (ratePercent / 100));

        if (amountCents > 0) {
          await commissionsDb.recordCommission(serviceClient, {
            referrerId: referralUse.referrer_id,
            referredId: account.id,
            invoiceId: invoice.id,
            amountCents,
            ratePercent,
          });
        }

        // Track when the referred user first subscribed
        if (referralUse.subscription_started_at === null) {
          await serviceClient
            .from('referral_uses')
            .update({ subscription_started_at: new Date().toISOString() })
            .eq('referred_id', account.id);
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

// ---------------------------------------------------------------------------
// Subscription Management Endpoints
// ---------------------------------------------------------------------------

// GET /api/stripe/subscription — Returns subscription state for management UI
stripeRoutes.get('/api/stripe/subscription', requiresLogin, async (c) => {
  const stripe = getStripe(c.env);
  if (!stripe) return c.json({ error: 'Stripe not configured.' }, 503);

  const profile = c.get('profile');

  if (!profile.stripe_subscription_id) {
    return c.json({ subscription: null });
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id, {
      expand: ['default_payment_method'],
    });

    const billingInterval = subscription.items.data[0]?.price?.recurring?.interval || 'month';

    // Extract payment method card info
    let paymentMethod: { id: string; brand: string; last4: string; expMonth: number; expYear: number; isExpired: boolean } | null = null;
    const pm = subscription.default_payment_method;
    if (pm && typeof pm === 'object' && 'card' in pm && pm.card) {
      const card = pm.card;
      const now = new Date();
      const expMonth = card.exp_month;
      const expYear = card.exp_year;
      const isExpired = expYear < now.getFullYear() || (expYear === now.getFullYear() && expMonth < now.getMonth() + 1);
      paymentMethod = {
        id: pm.id,
        brand: (card as any).display_brand || card.brand || 'unknown',
        last4: card.last4 || '****',
        expMonth,
        expYear,
        isExpired,
      };
    }

    // Best-effort upcoming invoice
    let upcomingInvoice: { amountDue: number; currency: string; periodStart: number; periodEnd: number } | null = null;
    try {
      const preview = await stripe.invoices.createPreview({ subscription: profile.stripe_subscription_id });
      upcomingInvoice = {
        amountDue: preview.amount_due,
        currency: preview.currency,
        periodStart: preview.period_start,
        periodEnd: preview.period_end,
      };
    } catch {
      // best-effort — ignore errors
    }

    return c.json({
      subscription: {
        id: subscription.id,
        status: subscription.status,
        plan: subscription.metadata?.plan || profile.subscription_plan,
        priceId: subscription.items.data[0]?.price?.id || null,
        billingInterval,
        currentPeriodEnd: subscription.items.data[0]?.current_period_end || null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        cancelAt: subscription.cancel_at,
      },
      paymentMethod,
      upcomingInvoice,
    });
  } catch (err) {
    console.error('Get subscription error:', err);
    return c.json({ error: 'Failed to retrieve subscription.' }, 500);
  }
});

// POST /api/stripe/preview-plan-change — Proration preview
stripeRoutes.post('/api/stripe/preview-plan-change', requiresLogin, async (c) => {
  const stripe = getStripe(c.env);
  if (!stripe) return c.json({ error: 'Stripe not configured.' }, 503);

  const profile = c.get('profile');
  if (!profile.stripe_subscription_id) {
    return c.json({ error: 'No active subscription.' }, 400);
  }

  const { newPlan } = await c.req.json();
  const priceMap: Record<string, string | undefined> = {
    pro: c.env.STRIPE_PRICE_PRO,
    elite: c.env.STRIPE_PRICE_ELITE,
    pro_yearly: c.env.STRIPE_PRICE_PRO_YEARLY,
    elite_yearly: c.env.STRIPE_PRICE_ELITE_YEARLY,
  };

  const newPriceId = priceMap[newPlan];
  if (!newPriceId) {
    return c.json({ error: 'Invalid plan.' }, 400);
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
    const existingItem = subscription.items.data[0];
    if (!existingItem) return c.json({ error: 'No subscription item found.' }, 400);

    if (existingItem.price.id === newPriceId) {
      return c.json({ error: 'You are already on this plan.' }, 400);
    }

    const preview = await stripe.invoices.createPreview({
      subscription: profile.stripe_subscription_id,
      subscription_details: {
        items: [{ id: existingItem.id, price: newPriceId }],
        proration_behavior: 'always_invoice',
      },
    });

    return c.json({
      amountDue: preview.amount_due,
      currency: preview.currency,
      prorationDate: preview.created,
      lineItems: preview.lines.data.map((line) => ({
        description: line.description,
        amount: line.amount,
      })),
    });
  } catch (err) {
    console.error('Preview plan change error:', err);
    return c.json({ error: 'Failed to preview plan change.' }, 500);
  }
});

// POST /api/stripe/update-subscription — Change plan
stripeRoutes.post('/api/stripe/update-subscription', requiresLogin, async (c) => {
  const stripe = getStripe(c.env);
  if (!stripe) return c.json({ error: 'Stripe not configured.' }, 503);

  const user = c.get('user');
  const profile = c.get('profile');
  if (!profile.stripe_subscription_id) {
    return c.json({ error: 'No active subscription.' }, 400);
  }

  const { newPlan } = await c.req.json();
  const priceMap: Record<string, string | undefined> = {
    pro: c.env.STRIPE_PRICE_PRO,
    elite: c.env.STRIPE_PRICE_ELITE,
    pro_yearly: c.env.STRIPE_PRICE_PRO_YEARLY,
    elite_yearly: c.env.STRIPE_PRICE_ELITE_YEARLY,
  };

  const newPriceId = priceMap[newPlan];
  if (!newPriceId) {
    return c.json({ error: 'Invalid plan.' }, 400);
  }

  try {
    const currentSub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
    const existingItem = currentSub.items.data[0];
    if (!existingItem) return c.json({ error: 'No subscription item found.' }, 400);

    if (existingItem.price.id === newPriceId) {
      return c.json({ error: 'You are already on this plan.' }, 400);
    }

    const effectivePlan = newPlan.replace('_yearly', '');

    const updated = await stripe.subscriptions.update(profile.stripe_subscription_id, {
      items: [{ id: existingItem.id, price: newPriceId }],
      proration_behavior: 'always_invoice',
      payment_behavior: 'default_incomplete',
      cancel_at_period_end: false,
      metadata: { accountId: user.id, plan: effectivePlan },
      expand: ['latest_invoice.confirmation_secret'],
    });

    const invoice = updated.latest_invoice as Stripe.Invoice | null;
    const isActive = updated.status === 'active' || updated.status === 'trialing';
    const isInvoicePaid = invoice?.status === 'paid';

    if (isActive || isInvoicePaid) {
      const serviceClient = createServiceClient(c.env);
      await profilesDb.updateById(serviceClient, user.id, {
        stripeSubscriptionId: updated.id,
        subscriptionStatus: isActive ? updated.status : 'active',
        subscriptionPlan: effectivePlan,
      });
      return c.json({ status: 'active', plan: effectivePlan, clientSecret: null });
    }

    // Payment required
    const clientSecret = invoice?.confirmation_secret?.client_secret || null;
    return c.json({
      status: 'requires_payment',
      plan: effectivePlan,
      clientSecret,
      subscriptionId: updated.id,
    });
  } catch (err) {
    console.error('Update subscription error:', err);
    return c.json({ error: 'Failed to update subscription.' }, 500);
  }
});

// POST /api/stripe/cancel-subscription — Cancel at period end
stripeRoutes.post('/api/stripe/cancel-subscription', requiresLogin, async (c) => {
  const stripe = getStripe(c.env);
  if (!stripe) return c.json({ error: 'Stripe not configured.' }, 503);

  const profile = c.get('profile');
  if (!profile.stripe_subscription_id) {
    return c.json({ error: 'No active subscription.' }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  const { feedback, comment } = body as { feedback?: string; comment?: string };

  try {
    const updated = await stripe.subscriptions.update(profile.stripe_subscription_id, {
      cancel_at_period_end: true,
      cancellation_details: { feedback: feedback as any, comment },
    });

    return c.json({
      cancelAtPeriodEnd: true,
      currentPeriodEnd: updated.items.data[0]?.current_period_end || null,
    });
  } catch (err) {
    console.error('Cancel subscription error:', err);
    return c.json({ error: 'Failed to cancel subscription.' }, 500);
  }
});

// POST /api/stripe/resume-subscription — Undo cancellation
stripeRoutes.post('/api/stripe/resume-subscription', requiresLogin, async (c) => {
  const stripe = getStripe(c.env);
  if (!stripe) return c.json({ error: 'Stripe not configured.' }, 503);

  const profile = c.get('profile');
  if (!profile.stripe_subscription_id) {
    return c.json({ error: 'No active subscription.' }, 400);
  }

  try {
    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      cancel_at_period_end: false,
    });

    return c.json({ cancelAtPeriodEnd: false, status: 'active' });
  } catch (err) {
    console.error('Resume subscription error:', err);
    return c.json({ error: 'Failed to resume subscription.' }, 500);
  }
});

// POST /api/stripe/setup-payment-method — Create SetupIntent
stripeRoutes.post('/api/stripe/setup-payment-method', requiresLogin, async (c) => {
  const stripe = getStripe(c.env);
  if (!stripe) return c.json({ error: 'Stripe not configured.' }, 503);

  const profile = c.get('profile');
  if (!profile.stripe_customer_id) {
    return c.json({ error: 'No billing account found.' }, 400);
  }

  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: profile.stripe_customer_id,
      usage: 'off_session',
    });

    return c.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    console.error('Setup payment method error:', err);
    return c.json({ error: 'Failed to create setup intent.' }, 500);
  }
});

// POST /api/stripe/confirm-payment-method — Attach new payment method
stripeRoutes.post('/api/stripe/confirm-payment-method', requiresLogin, async (c) => {
  const stripe = getStripe(c.env);
  if (!stripe) return c.json({ error: 'Stripe not configured.' }, 503);

  const profile = c.get('profile');
  if (!profile.stripe_customer_id || !profile.stripe_subscription_id) {
    return c.json({ error: 'No billing account or subscription found.' }, 400);
  }

  const { paymentMethodId } = await c.req.json();
  if (!paymentMethodId) {
    return c.json({ error: 'Missing paymentMethodId.' }, 400);
  }

  try {
    // Attach payment method to customer (skip if already attached, e.g. via SetupIntent)
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (!pm.customer) {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: profile.stripe_customer_id,
      });
    }

    // Set as default on subscription
    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      default_payment_method: paymentMethodId,
    });

    // Set as default on customer invoice settings
    await stripe.customers.update(profile.stripe_customer_id, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const card = pm.card;

    return c.json({
      brand: (card as any)?.display_brand || card?.brand || 'unknown',
      last4: card?.last4 || '****',
      expMonth: card?.exp_month || 0,
      expYear: card?.exp_year || 0,
    });
  } catch (err) {
    console.error('Confirm payment method error:', err);
    return c.json({ error: 'Failed to update payment method.' }, 500);
  }
});

// GET /api/stripe/invoices — Billing history
stripeRoutes.get('/api/stripe/invoices', requiresLogin, async (c) => {
  const stripe = getStripe(c.env);
  if (!stripe) return c.json({ error: 'Stripe not configured.' }, 503);

  const profile = c.get('profile');
  if (!profile.stripe_customer_id) {
    return c.json({ invoices: [] });
  }

  try {
    const invoiceList = await stripe.invoices.list({
      customer: profile.stripe_customer_id,
      limit: 12,
    });

    const invoices = invoiceList.data.map((inv) => ({
      id: inv.id,
      date: inv.created,
      amount: inv.amount_due,
      currency: inv.currency,
      status: inv.status,
      pdfUrl: inv.invoice_pdf,
      hostedUrl: inv.hosted_invoice_url,
    }));

    return c.json({ invoices });
  } catch (err) {
    console.error('List invoices error:', err);
    return c.json({ error: 'Failed to retrieve invoices.' }, 500);
  }
});

export default stripeRoutes;

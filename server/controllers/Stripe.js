const models = require('../models');

const { Account } = models;

const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const stripe = require('stripe');
  return stripe(process.env.STRIPE_SECRET_KEY);
};

const createCheckoutSession = async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in environment.' });
  }

  const { plan } = req.body;
  const priceMap = {
    pro: process.env.STRIPE_PRICE_PRO,
    elite: process.env.STRIPE_PRICE_ELITE,
  };

  const priceId = priceMap[plan];
  if (!priceId) {
    return res.status(400).json({ error: 'Invalid plan. Must be "pro" or "elite".' });
  }

  try {
    const account = await Account.findById(req.session.account._id).exec();
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    let customerId = account.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { accountId: account._id.toString(), username: account.username },
      });
      customerId = customer.id;
      account.stripeCustomerId = customerId;
      await account.save();
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${req.protocol}://${req.get('host')}/upgrade?success=true`,
      cancel_url: `${req.protocol}://${req.get('host')}/upgrade?canceled=true`,
      metadata: { accountId: account._id.toString(), plan },
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session.' });
  }
};

const handleWebhook = async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).send('Stripe not configured');

  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { accountId } = session.metadata;
        const { plan } = session.metadata;
        if (accountId) {
          await Account.findByIdAndUpdate(accountId, {
            isPremium: true,
            stripeSubscriptionId: session.subscription,
            subscriptionPlan: plan || 'pro',
            subscriptionStatus: 'active',
          });
        }
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const account = await Account.findOne({ stripeCustomerId: subscription.customer }).exec();
        if (account) {
          account.subscriptionStatus = subscription.status;
          account.isPremium = ['active', 'trialing'].includes(subscription.status);
          await account.save();
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const account = await Account.findOne({ stripeCustomerId: subscription.customer }).exec();
        if (account) {
          account.isPremium = false;
          account.subscriptionStatus = 'canceled';
          await account.save();
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).send('Webhook handler error');
  }

  return res.json({ received: true });
};

module.exports = {
  createCheckoutSession,
  handleWebhook,
};

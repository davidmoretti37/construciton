/**
 * Stripe Routes
 * Handles subscription management, checkout, webhooks, and billing portal
 */

const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Supabase Admin Client (uses service role key for backend operations)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Price ID mapping
const PRICE_IDS = {
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  pro: process.env.STRIPE_PRO_PRICE_ID,
  business: process.env.STRIPE_BUSINESS_PRICE_ID,
};

// Reverse mapping: price_id -> tier
const PRICE_TO_TIER = {};
Object.entries(PRICE_IDS).forEach(([tier, priceId]) => {
  if (priceId) PRICE_TO_TIER[priceId] = tier;
});

// ============================================================
// AUTHENTICATION MIDDLEWARE
// Verifies Supabase JWT token from Authorization header
// ============================================================
const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7);

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      logger.warn('Auth failed:', error?.message || 'No user found');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// ============================================================
// POST /create-checkout-session
// Creates a Stripe Checkout Session for subscription with 7-day trial
// ============================================================
router.post('/create-checkout-session', authenticateUser, async (req, res) => {
  try {
    const { tier } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;

    // Validate tier
    const priceId = PRICE_IDS[tier];
    if (!priceId) {
      return res.status(400).json({
        error: 'Invalid subscription tier',
        validTiers: Object.keys(PRICE_IDS)
      });
    }

    logger.info(`Creating checkout session for user ${userId}, tier: ${tier}`);

    // Get or create Stripe customer
    let customerId;

    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (existingSub?.stripe_customer_id) {
      customerId = existingSub.stripe_customer_id;
      logger.debug(`Using existing customer: ${customerId}`);
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          supabase_user_id: userId
        },
      });
      customerId = customer.id;
      logger.info(`Created new Stripe customer: ${customerId}`);

      // Create/update subscription record with customer ID
      await supabaseAdmin
        .from('subscriptions')
        .upsert({
          user_id: userId,
          stripe_customer_id: customerId,
          plan_tier: 'none',
          status: 'inactive',
        }, { onConflict: 'user_id' });
    }

    // Create Checkout Session with 7-day trial
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: 'subscription',
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          supabase_user_id: userId
        },
      },
      success_url: `${process.env.FRONTEND_URL}subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}subscription/cancel`,
      metadata: {
        supabase_user_id: userId
      },
      allow_promotion_codes: true,
    });

    logger.info(`Checkout session created: ${session.id}`);

    res.json({
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    logger.error('Create checkout session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ============================================================
// POST /webhook
// Handles Stripe webhook events
// NOTE: This endpoint needs raw body - configured in server.js
// ============================================================
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  // Verify webhook signature
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  logger.info(`Webhook received: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      case 'customer.subscription.trial_will_end':
        await handleTrialEnding(event.data.object);
        break;

      default:
        logger.debug(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// ============================================================
// WEBHOOK HANDLERS
// ============================================================

async function handleCheckoutComplete(session) {
  const userId = session.metadata?.supabase_user_id;
  const subscriptionId = session.subscription;

  if (!userId || !subscriptionId) {
    logger.warn('Missing userId or subscriptionId in checkout session');
    return;
  }

  // Fetch full subscription details from Stripe
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price?.id;
  const tier = PRICE_TO_TIER[priceId] || 'starter';

  await supabaseAdmin
    .from('subscriptions')
    .upsert({
      user_id: userId,
      stripe_customer_id: session.customer,
      stripe_subscription_id: subscriptionId,
      stripe_price_id: priceId,
      plan_tier: tier,
      status: subscription.status,
      trial_ends_at: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
    }, { onConflict: 'user_id' });

  logger.info(`Subscription activated for user ${userId}: ${tier} (${subscription.status})`);
}

async function handleSubscriptionUpdate(subscription) {
  const priceId = subscription.items.data[0]?.price?.id;
  const tier = PRICE_TO_TIER[priceId] || 'starter';

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      stripe_price_id: priceId,
      plan_tier: tier,
      status: subscription.status,
      trial_ends_at: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
    })
    .eq('stripe_subscription_id', subscription.id);

  if (error) {
    logger.error('Error updating subscription:', error);
  } else {
    logger.info(`Subscription updated: ${subscription.id} -> ${tier} (${subscription.status})`);
  }
}

async function handleSubscriptionDeleted(subscription) {
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'canceled',
      plan_tier: 'none',
    })
    .eq('stripe_subscription_id', subscription.id);

  if (error) {
    logger.error('Error canceling subscription:', error);
  } else {
    logger.info(`Subscription canceled: ${subscription.id}`);
  }
}

async function handlePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription;

  if (!subscriptionId) return;

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('stripe_subscription_id', subscriptionId);

  if (error) {
    logger.error('Error marking subscription past_due:', error);
  } else {
    logger.warn(`Payment failed, subscription past_due: ${subscriptionId}`);
  }
}

async function handleTrialEnding(subscription) {
  // Could send notification to user here
  logger.info(`Trial ending soon for subscription: ${subscription.id}`);

  // Optional: Get user email and send reminder
  // const userId = subscription.metadata?.supabase_user_id;
  // if (userId) { ... send email notification ... }
}

// ============================================================
// GET /subscription
// Returns current user's subscription status
// ============================================================
router.get('/subscription', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    // PGRST116 = row not found, which is OK
    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // No subscription found
    if (!data) {
      return res.json({
        hasSubscription: false,
        planTier: 'none',
        status: 'inactive',
      });
    }

    // Calculate trial days remaining
    let trialDaysRemaining = null;
    if (data.status === 'trialing' && data.trial_ends_at) {
      const trialEnd = new Date(data.trial_ends_at);
      const now = new Date();
      trialDaysRemaining = Math.max(0, Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24)));
    }

    res.json({
      hasSubscription: ['trialing', 'active'].includes(data.status),
      planTier: data.plan_tier,
      status: data.status,
      trialDaysRemaining,
      trialEndsAt: data.trial_ends_at,
      currentPeriodEnd: data.current_period_end,
      cancelAtPeriodEnd: data.cancel_at_period_end,
    });

  } catch (error) {
    logger.error('Get subscription error:', error);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

// ============================================================
// POST /create-portal-session
// Creates a Stripe Customer Portal session for managing subscription
// ============================================================
router.post('/create-portal-session', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (!subscription?.stripe_customer_id) {
      return res.status(400).json({ error: 'No subscription found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${process.env.FRONTEND_URL}settings/subscription`,
    });

    logger.info(`Portal session created for user ${userId}`);

    res.json({ url: session.url });

  } catch (error) {
    logger.error('Create portal session error:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// ============================================================
// GET /can-create-project
// Checks if user can create a new project based on subscription limits
// ============================================================
router.get('/can-create-project', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .rpc('can_create_project', { p_user_id: userId });

    if (error) {
      logger.error('can_create_project RPC error:', error);
      throw error;
    }

    res.json(data);

  } catch (error) {
    logger.error('Can create project check error:', error);
    res.status(500).json({ error: 'Failed to check project limit' });
  }
});

module.exports = router;

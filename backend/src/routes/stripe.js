/**
 * Stripe Routes
 * Handles subscription management, checkout, webhooks, and billing portal
 */

const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const { sendPushToUser } = require('../services/pushNotificationService');

// Fail fast if BACKEND_URL is missing in production — Stripe redirects would go nowhere
if (process.env.NODE_ENV === 'production' && !process.env.BACKEND_URL) {
  throw new Error('BACKEND_URL must be set in production — Stripe checkout redirects depend on it');
}

// Initialize Stripe (only if key is configured)
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

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

// Guard middleware: return 503 if Stripe is not configured
const requireStripe = (req, res, next) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured' });
  }
  next();
};
router.use(requireStripe);

const { authenticateUser } = require('../middleware/authenticate');

// ============================================================
// POST /create-guest-checkout
// Creates a Stripe Checkout Session WITHOUT authentication
// For users who haven't signed up yet (pay first flow)
// ============================================================
router.post('/create-guest-checkout', async (req, res) => {
  try {
    const { tier } = req.body;

    // Validate tier
    const priceId = PRICE_IDS[tier];
    if (!priceId) {
      return res.status(400).json({
        error: 'Invalid subscription tier',
        validTiers: Object.keys(PRICE_IDS)
      });
    }

    logger.info(`Creating GUEST checkout session for tier: ${tier}`);

    // Create Checkout Session - Stripe will collect email
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: 'subscription',
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          guest_checkout: 'true',
          selected_tier: tier,
        },
      },
      // Let Stripe collect customer email
      customer_email: undefined,
      success_url: `${process.env.BACKEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}&guest=true`,
      cancel_url: `${process.env.BACKEND_URL}/subscription/cancel`,
      metadata: {
        guest_checkout: 'true',
        selected_tier: tier,
      },
      allow_promotion_codes: true,
    });

    logger.info(`Guest checkout session created: ${session.id}`);

    res.json({
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    logger.error('Create guest checkout session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

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
      success_url: `${process.env.BACKEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BACKEND_URL}/subscription/cancel`,
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

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    logger.error('Webhook rejected: missing signature header or STRIPE_WEBHOOK_SECRET env var');
    return res.status(400).send('Webhook Error: missing signature or secret');
  }

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

  // Idempotency check — Stripe guarantees at-least-once delivery, so we must deduplicate
  try {
    const { data: existing } = await supabaseAdmin
      .from('stripe_webhook_events')
      .select('id')
      .eq('event_id', event.id)
      .single();

    if (existing) {
      logger.info(`Webhook already processed: ${event.id}, skipping`);
      return res.json({ received: true, deduplicated: true });
    }

    // Record that we're processing this event
    await supabaseAdmin
      .from('stripe_webhook_events')
      .insert({ event_id: event.id, event_type: event.type });
  } catch (idempotencyError) {
    // If the insert fails with a unique constraint violation, another process already handled it
    if (idempotencyError?.code === '23505') {
      logger.info(`Webhook already processed (concurrent): ${event.id}`);
      return res.json({ received: true, deduplicated: true });
    }
    // For other errors (e.g. table doesn't exist yet), log but continue processing
    logger.warn('Webhook idempotency check failed, proceeding:', idempotencyError?.message);
  }

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

      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;

      case 'account.updated':
        await handleAccountUpdated(event.data.object);
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
  const isGuestCheckout = session.metadata?.guest_checkout === 'true';
  const subscriptionId = session.subscription;

  if (!subscriptionId) {
    logger.warn('Missing subscriptionId in checkout session');
    return;
  }

  // Fetch full subscription details from Stripe
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price?.id;
  const tier = PRICE_TO_TIER[priceId] || 'starter';

  // GUEST CHECKOUT: Store in pending_subscriptions for later linking
  if (isGuestCheckout || !userId) {
    const customerEmail = session.customer_details?.email || session.customer_email;

    if (!customerEmail) {
      logger.error('Guest checkout without email!');
      return;
    }

    logger.info(`Guest checkout completed for email: ${customerEmail}, tier: ${tier}`);

    // Store in pending_subscriptions table
    const { error } = await supabaseAdmin
      .from('pending_subscriptions')
      .upsert({
        email: customerEmail.toLowerCase(),
        stripe_customer_id: session.customer,
        stripe_subscription_id: subscriptionId,
        stripe_price_id: priceId,
        plan_tier: tier,
        status: subscription.status,
        trial_ends_at: subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null,
      }, { onConflict: 'email' });

    if (error) {
      logger.error('Error storing pending subscription:', error);
    } else {
      logger.info(`Pending subscription stored for ${customerEmail}`);
    }
    return;
  }

  // AUTHENTICATED CHECKOUT: Normal flow
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
      current_period_start: subscription.current_period_start
        ? new Date(subscription.current_period_start * 1000).toISOString()
        : null,
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
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
      current_period_start: subscription.current_period_start
        ? new Date(subscription.current_period_start * 1000).toISOString()
        : null,
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
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
  logger.info(`Trial ending soon for subscription: ${subscription.id}`);

  const userId = subscription.metadata?.supabase_user_id;
  if (!userId) {
    logger.warn('Trial ending but no supabase_user_id in subscription metadata');
    return;
  }

  // Calculate days remaining
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
  const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd - Date.now()) / (1000 * 60 * 60 * 24))) : 3;

  // Create in-app notification
  await supabaseAdmin.from('notifications').insert({
    user_id: userId,
    type: 'trial_ending',
    title: 'Trial Ending Soon',
    message: `Your free trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Subscribe to keep using all features.`,
    data: { screen: 'Billing', daysLeft },
  });

  // Send push notification
  await sendPushToUser(userId, {
    title: 'Trial Ending Soon',
    body: `Your free trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Subscribe to keep all your projects and data.`,
    data: { type: 'trial_ending', screen: 'Billing' },
  });

  logger.info(`Trial ending notification sent to user ${userId} (${daysLeft} days left)`);
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

    const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`;

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${baseUrl}/billing-complete`,
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

// ============================================================
// POST /link-pending-subscription
// Links a pending subscription to a newly signed up user
// Called after user creates their account
// ============================================================
router.post('/link-pending-subscription', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email?.toLowerCase();

    if (!userEmail) {
      return res.status(400).json({ error: 'User email not found' });
    }

    logger.info(`Checking pending subscription for ${userEmail}`);

    // Check for pending subscription with this email
    const { data: pending, error: fetchError } = await supabaseAdmin
      .from('pending_subscriptions')
      .select('*')
      .eq('email', userEmail)
      .eq('status', 'trialing')
      .single();

    if (fetchError || !pending) {
      logger.debug(`No pending subscription found for ${userEmail}`);
      return res.json({ linked: false, message: 'No pending subscription found' });
    }

    // Link the subscription to this user
    const { error: upsertError } = await supabaseAdmin
      .from('subscriptions')
      .upsert({
        user_id: userId,
        stripe_customer_id: pending.stripe_customer_id,
        stripe_subscription_id: pending.stripe_subscription_id,
        stripe_price_id: pending.stripe_price_id,
        plan_tier: pending.plan_tier,
        status: pending.status,
        trial_ends_at: pending.trial_ends_at,
      }, { onConflict: 'user_id' });

    if (upsertError) {
      logger.error('Error linking subscription:', upsertError);
      throw upsertError;
    }

    // Update Stripe customer metadata with the new user ID
    await stripe.customers.update(pending.stripe_customer_id, {
      metadata: { supabase_user_id: userId }
    });

    // Also update the subscription metadata
    await stripe.subscriptions.update(pending.stripe_subscription_id, {
      metadata: { supabase_user_id: userId }
    });

    // Mark pending subscription as linked
    await supabaseAdmin
      .from('pending_subscriptions')
      .update({ status: 'linked' })
      .eq('id', pending.id);

    logger.info(`Subscription linked for user ${userId}, tier: ${pending.plan_tier}`);

    res.json({
      linked: true,
      planTier: pending.plan_tier,
      status: pending.status,
    });

  } catch (error) {
    logger.error('Link pending subscription error:', error);
    res.status(500).json({ error: 'Failed to link subscription' });
  }
});

/**
 * Handle successful PaymentIntent — auto-update invoice
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  const { invoice_id, type } = paymentIntent.metadata || {};

  if (type !== 'portal_invoice_payment' || !invoice_id) return;

  const amountPaidCents = paymentIntent.amount; // Keep in cents for precision
  const amountPaidDollars = amountPaidCents / 100;
  const paymentMethod = paymentIntent.payment_method_types?.[0] || 'card';

  // Fetch current invoice state
  const { data: invoice, error: fetchError } = await supabaseAdmin
    .from('invoices')
    .select('id, total, amount_paid, user_id, project_id, invoice_number')
    .eq('id', invoice_id)
    .single();

  if (fetchError || !invoice) {
    logger.error(`Invoice not found for payment intent: ${invoice_id}`);
    return;
  }

  // Atomic update with optimistic lock + retry on conflict
  // All math in integer cents to avoid floating-point drift
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Re-read invoice on retry to get current amount_paid
    const currentInvoice = attempt === 0 ? invoice : (
      await supabaseAdmin.from('invoices').select('amount_paid, total').eq('id', invoice_id).single()
    ).data;

    if (!currentInvoice) {
      logger.error(`Invoice ${invoice_id} disappeared during payment update`);
      return;
    }

    const existingPaidCents = Math.round(parseFloat(currentInvoice.amount_paid || 0) * 100);
    const totalCents = Math.round(parseFloat(currentInvoice.total) * 100);
    const newAmountPaidCents = existingPaidCents + amountPaidCents;
    const newAmountPaid = newAmountPaidCents / 100;
    const newStatus = newAmountPaidCents >= totalCents ? 'paid' : 'partial';

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('invoices')
      .update({
        amount_paid: newAmountPaid,
        status: newStatus,
        payment_method: paymentMethod,
        paid_date: newStatus === 'paid' ? new Date().toISOString() : null,
      })
      .eq('id', invoice_id)
      // Optimistic lock: only update if amount_paid hasn't changed since we read it
      .eq('amount_paid', currentInvoice.amount_paid || 0)
      .select('id');

    if (updateError) {
      logger.error(`Payment update error (attempt ${attempt + 1}):`, updateError);
      if (attempt === MAX_RETRIES - 1) return;
      continue;
    }

    if (!updated || updated.length === 0) {
      // Lock conflict — another payment was processed concurrently
      logger.warn(`Payment optimistic lock conflict for invoice ${invoice_id}, retrying (attempt ${attempt + 1})`);
      if (attempt === MAX_RETRIES - 1) {
        logger.error(`CRITICAL: Payment of ${amountPaidCents} cents for invoice ${invoice_id} could not be recorded after ${MAX_RETRIES} attempts`);
        return;
      }
      continue;
    }

    // Success
    break;
  }

  // Record immutable payment event for audit trail
  try {
    await supabaseAdmin
      .from('payment_events')
      .insert({
        invoice_id: invoice_id,
        stripe_event_id: paymentIntent.id,
        amount: amountPaidDollars,
        currency: paymentIntent.currency || 'usd',
        payment_method: paymentMethod,
        status: 'succeeded',
        user_id: invoice.user_id,
        project_id: invoice.project_id,
        metadata: {
          invoice_number: invoice.invoice_number,
          stripe_payment_intent: paymentIntent.id,
          new_amount_paid: newAmountPaid,
          new_status: newStatus,
        },
      });
  } catch (auditError) {
    // Don't fail the payment flow if audit logging fails — log and continue
    logger.error('Failed to record payment event:', auditError?.message);
  }

  logger.info(`Invoice ${invoice_id} updated: ${newStatus}, paid: $${newAmountPaid}`);
}

/**
 * Handle Stripe Connect account updates — mark onboarding complete
 */
async function handleAccountUpdated(account) {
  if (!account.metadata?.supabase_user_id) return;

  const userId = account.metadata.supabase_user_id;
  const isComplete = account.charges_enabled && account.payouts_enabled;

  if (isComplete) {
    // Check if already marked complete (avoid duplicate notifications)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_onboarding_complete')
      .eq('id', userId)
      .single();

    if (profile?.stripe_onboarding_complete) return;

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ stripe_onboarding_complete: true })
      .eq('id', userId);

    if (!error) {
      logger.info(`[Connect] Onboarding complete for user ${userId}, account ${account.id}`);

      // Create in-app notification
      await supabaseAdmin.from('notifications').insert({
        user_id: userId,
        type: 'payment_setup_complete',
        title: 'Payments Active',
        message: 'Your bank account is connected. You can now receive payments from clients.',
        data: { accountId: account.id },
      });

      // Send push notification
      await sendPushToUser(userId, {
        title: '💰 Payments Active',
        body: 'Your bank account is connected! You can now receive payments from clients.',
        data: { type: 'payment_setup_complete', screen: 'Settings' },
      });
    }
  }
}

// ============================================================
// STRIPE CONNECT — Contractor Onboarding & Payouts
// ============================================================

/**
 * POST /connect/create-account
 * Creates a Stripe Connected Account for the contractor and returns onboarding URL.
 */
router.post('/connect/create-account', authenticateUser, async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

    const userId = req.user.id;

    // Check if already has an account
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_account_id, stripe_onboarding_complete, full_name, business_name')
      .eq('id', userId)
      .single();

    if (profile?.stripe_account_id && profile?.stripe_onboarding_complete) {
      return res.json({ alreadyConnected: true, accountId: profile.stripe_account_id });
    }

    let accountId = profile?.stripe_account_id;

    // Create account if doesn't exist — use optimistic lock to prevent duplicate creation
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'standard',
        metadata: { supabase_user_id: userId },
      });
      accountId = account.id;

      // Only set if still null (prevents race condition with concurrent requests)
      const { error: updateErr } = await supabaseAdmin
        .from('profiles')
        .update({ stripe_account_id: accountId })
        .eq('id', userId)
        .is('stripe_account_id', null);

      if (updateErr) {
        // Another request won the race — use their account, clean up ours
        const { data: updated } = await supabaseAdmin
          .from('profiles')
          .select('stripe_account_id')
          .eq('id', userId)
          .single();
        if (updated?.stripe_account_id && updated.stripe_account_id !== accountId) {
          // Delete the orphaned Stripe account we just created
          try { await stripe.accounts.del(accountId); } catch (_) {}
          accountId = updated.stripe_account_id;
        }
      }
    }

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.PORTAL_URL || 'https://sylkapp.ai'}/connect/refresh`,
      return_url: `${process.env.PORTAL_URL || 'https://sylkapp.ai'}/connect/complete`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url, accountId });
  } catch (error) {
    logger.error('Stripe Connect create error:', error.message);
    res.status(500).json({ error: 'Failed to create connected account' });
  }
});

/**
 * POST /connect/onboarding-link
 * Generates a new onboarding link for incomplete accounts.
 */
router.post('/connect/onboarding-link', authenticateUser, async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_account_id')
      .eq('id', req.user.id)
      .single();

    if (!profile?.stripe_account_id) {
      return res.status(400).json({ error: 'No connected account. Create one first.' });
    }

    const accountLink = await stripe.accountLinks.create({
      account: profile.stripe_account_id,
      refresh_url: `${process.env.PORTAL_URL || 'https://sylkapp.ai'}/connect/refresh`,
      return_url: `${process.env.PORTAL_URL || 'https://sylkapp.ai'}/connect/complete`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (error) {
    logger.error('Stripe Connect onboarding link error:', error.message);
    res.status(500).json({ error: 'Failed to generate onboarding link' });
  }
});

/**
 * GET /connect/status
 * Checks if contractor's connected account is fully onboarded.
 */
router.get('/connect/status', authenticateUser, async (req, res) => {
  try {
    if (!stripe) return res.json({ connected: false });

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_account_id, stripe_onboarding_complete')
      .eq('id', req.user.id)
      .single();

    if (!profile?.stripe_account_id) {
      return res.json({ connected: false, payoutsEnabled: false });
    }

    const account = await stripe.accounts.retrieve(profile.stripe_account_id);

    // Update onboarding status if changed
    if (account.charges_enabled && !profile.stripe_onboarding_complete) {
      await supabaseAdmin
        .from('profiles')
        .update({ stripe_onboarding_complete: true })
        .eq('id', req.user.id);
    }

    res.json({
      connected: true,
      payoutsEnabled: account.payouts_enabled,
      chargesEnabled: account.charges_enabled,
      onboardingComplete: account.charges_enabled && account.payouts_enabled,
      accountId: profile.stripe_account_id,
      businessName: account.business_profile?.name || account.settings?.dashboard?.display_name,
      bankLast4: account.external_accounts?.data?.[0]?.last4,
    });
  } catch (error) {
    logger.error('Stripe Connect status error:', error.message);
    res.json({ connected: false, error: error.message });
  }
});

/**
 * POST /connect/dashboard-link
 * Generates a link to the Stripe Express Dashboard for the contractor.
 */
router.post('/connect/dashboard-link', authenticateUser, async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_account_id')
      .eq('id', req.user.id)
      .single();

    if (!profile?.stripe_account_id) {
      return res.status(400).json({ error: 'No connected account' });
    }

    // For Standard accounts, direct to their dashboard
    const loginLink = await stripe.accounts.createLoginLink(profile.stripe_account_id);
    res.json({ url: loginLink.url });
  } catch (error) {
    logger.error('Stripe Connect dashboard link error:', error.message);
    res.status(500).json({ error: 'Failed to generate dashboard link' });
  }
});

module.exports = router;

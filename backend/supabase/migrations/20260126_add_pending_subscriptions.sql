-- Migration: Add pending_subscriptions table
-- Purpose: Store subscriptions for users who paid before signing up

CREATE TABLE IF NOT EXISTS public.pending_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  plan_tier TEXT,
  status TEXT DEFAULT 'trialing',
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint on email to prevent duplicates
  CONSTRAINT pending_subscriptions_email_unique UNIQUE (email)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_pending_subscriptions_email ON public.pending_subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_pending_subscriptions_status ON public.pending_subscriptions(status);

-- Enable RLS
ALTER TABLE public.pending_subscriptions ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (backend only)
-- No user-facing policies needed

-- Add comment
COMMENT ON TABLE public.pending_subscriptions IS 'Stores subscription data for users who complete payment before creating an account';

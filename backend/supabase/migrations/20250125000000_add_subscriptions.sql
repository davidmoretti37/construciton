-- ============================================================
-- SUBSCRIPTIONS TABLE
-- Stores Stripe subscription data for each user
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  plan_tier TEXT NOT NULL DEFAULT 'none'
    CHECK (plan_tier IN ('none', 'starter', 'pro', 'business')),
  status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (status IN ('inactive', 'trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_user_subscription UNIQUE (user_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON public.subscriptions(stripe_subscription_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only view their own subscription
CREATE POLICY "Users can view own subscription"
  ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own subscription (for initial creation)
CREATE POLICY "Users can insert own subscription"
  ON public.subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own subscription (limited - mainly for cancel flag)
CREATE POLICY "Users can update own subscription"
  ON public.subscriptions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Get count of active projects (status NOT IN completed, archived)
CREATE OR REPLACE FUNCTION public.get_active_project_count(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM public.projects
    WHERE user_id = p_user_id
    AND status NOT IN ('completed', 'archived')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get project limit for a given plan tier
CREATE OR REPLACE FUNCTION public.get_plan_project_limit(p_plan_tier TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE p_plan_tier
    WHEN 'starter' THEN 3
    WHEN 'pro' THEN 10
    WHEN 'business' THEN 999999  -- Effectively unlimited
    ELSE 0  -- No subscription = 0 projects allowed
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Check if user can create a new project (returns detailed JSON)
CREATE OR REPLACE FUNCTION public.can_create_project(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_subscription RECORD;
  v_active_count INTEGER;
  v_limit INTEGER;
  v_can_create BOOLEAN;
BEGIN
  -- Get user's subscription (only active or trialing)
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE user_id = p_user_id
  AND status IN ('trialing', 'active');

  -- No active subscription found
  IF v_subscription IS NULL THEN
    RETURN jsonb_build_object(
      'can_create', FALSE,
      'reason', 'no_subscription',
      'active_count', public.get_active_project_count(p_user_id),
      'limit', 0,
      'plan_tier', 'none'
    );
  END IF;

  -- Get current counts and limits
  v_active_count := public.get_active_project_count(p_user_id);
  v_limit := public.get_plan_project_limit(v_subscription.plan_tier);
  v_can_create := v_active_count < v_limit;

  RETURN jsonb_build_object(
    'can_create', v_can_create,
    'reason', CASE WHEN v_can_create THEN 'allowed' ELSE 'limit_reached' END,
    'active_count', v_active_count,
    'limit', v_limit,
    'plan_tier', v_subscription.plan_tier,
    'is_trial', v_subscription.status = 'trialing',
    'trial_ends_at', v_subscription.trial_ends_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- UPDATED TIMESTAMP TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_subscription_updated_at ON public.subscriptions;
CREATE TRIGGER trigger_subscription_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_subscription_updated_at();

-- ============================================================
-- GRANT PERMISSIONS
-- ============================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_project_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_plan_project_limit(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_project(UUID) TO authenticated;

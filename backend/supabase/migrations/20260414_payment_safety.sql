-- Payment Safety Migration
-- Adds webhook idempotency table, payment events audit table
-- Run via Supabase SQL Editor or psql

-- 1. Stripe webhook idempotency table
-- Prevents duplicate processing of Stripe webhook events
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups during webhook processing
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_id ON stripe_webhook_events(event_id);

-- Auto-cleanup old events (keep 90 days)
-- Run this as a Supabase cron or manually periodically:
-- DELETE FROM stripe_webhook_events WHERE processed_at < now() - interval '90 days';

-- 2. Payment events audit table (immutable ledger)
-- Records every payment event for dispute resolution, chargebacks, and tax compliance
CREATE TABLE IF NOT EXISTS payment_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  stripe_event_id TEXT,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'usd',
  payment_method TEXT,
  status TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_payment_events_invoice ON payment_events(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_user ON payment_events(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_created ON payment_events(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_events_stripe ON payment_events(stripe_event_id);

-- RLS policies
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

-- Webhook events: only service role can access (backend only)
-- No user-facing policies needed

-- Payment events: owners can read their own payment events
CREATE POLICY "Users can view own payment events"
  ON payment_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role (backend) can insert payment events
-- No INSERT policy for regular users — backend uses service role key

-- 3. Magic link expiration
-- Adds expiration to portal access tokens (default 30 days from creation)
ALTER TABLE project_clients
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days');

-- Backfill existing tokens: set expiration 30 days from now
UPDATE project_clients
  SET token_expires_at = NOW() + INTERVAL '30 days'
  WHERE token_expires_at IS NULL;

-- Function to regenerate an expired token with a new expiration
CREATE OR REPLACE FUNCTION regenerate_portal_token(pc_id UUID)
RETURNS TEXT AS $$
DECLARE
  new_token TEXT;
BEGIN
  new_token := gen_random_uuid()::TEXT;
  UPDATE project_clients
    SET access_token = new_token,
        token_expires_at = NOW() + INTERVAL '30 days'
    WHERE id = pc_id;
  RETURN new_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

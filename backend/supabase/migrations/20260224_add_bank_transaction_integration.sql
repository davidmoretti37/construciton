-- =====================================================
-- Bank/Card Transaction Integration
-- Created: 2026-02-24
-- Purpose: Connect company bank/card accounts via Plaid,
--          pull transactions, match against platform expenses,
--          and surface unmatched transactions for reconciliation.
-- =====================================================

-- =====================================================
-- 1. CONNECTED BANK ACCOUNTS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.connected_bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Plaid tokens (server-side only, never sent to frontend)
  plaid_access_token TEXT,
  plaid_item_id TEXT,
  plaid_institution_id TEXT,

  -- Account info (from Plaid or manual entry)
  institution_name TEXT NOT NULL,
  account_name TEXT,
  account_mask TEXT,
  account_type TEXT,
  account_subtype TEXT,
  plaid_account_id TEXT,

  -- Sync state
  sync_status TEXT DEFAULT 'active' CHECK (sync_status IN ('active', 'paused', 'error', 'disconnected')),
  last_sync_at TIMESTAMPTZ,
  last_sync_cursor TEXT,
  sync_error TEXT,

  -- CSV fallback
  is_manual BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connected_bank_accounts_user ON connected_bank_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_connected_bank_accounts_plaid_item ON connected_bank_accounts(plaid_item_id);

-- RLS: Only the owner can see/manage their connected accounts
ALTER TABLE connected_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage their bank accounts"
  ON connected_bank_accounts FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Updated_at trigger
CREATE TRIGGER update_connected_bank_accounts_updated_at
  BEFORE UPDATE ON public.connected_bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 2. BANK TRANSACTIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES connected_bank_accounts(id) ON DELETE CASCADE,

  -- Transaction data (from Plaid or CSV)
  plaid_transaction_id TEXT UNIQUE,
  amount NUMERIC(10, 2) NOT NULL,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  merchant_name TEXT,
  category TEXT,

  -- Reconciliation
  match_status TEXT DEFAULT 'unmatched' CHECK (match_status IN (
    'auto_matched',
    'suggested_match',
    'manually_matched',
    'unmatched',
    'ignored',
    'created'
  )),
  matched_transaction_id UUID REFERENCES project_transactions(id) ON DELETE SET NULL,
  match_confidence NUMERIC(3, 2),
  matched_at TIMESTAMPTZ,
  matched_by TEXT,

  -- Assignment (for unmatched -> created)
  assigned_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  assigned_category TEXT,

  -- Import metadata
  import_batch_id TEXT,
  is_pending BOOLEAN DEFAULT false,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_user ON bank_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account ON bank_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_status ON bank_transactions(match_status);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(date);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_unmatched ON bank_transactions(user_id) WHERE match_status = 'unmatched';
CREATE INDEX IF NOT EXISTS idx_bank_transactions_plaid_id ON bank_transactions(plaid_transaction_id);

ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage their bank transactions"
  ON bank_transactions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_bank_transactions_updated_at
  BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 3. BANK SYNC LOGS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.bank_sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES connected_bank_accounts(id) ON DELETE CASCADE,

  sync_type TEXT NOT NULL CHECK (sync_type IN ('plaid_sync', 'csv_import', 'manual_refresh')),
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'error')),
  transactions_added INTEGER DEFAULT 0,
  transactions_updated INTEGER DEFAULT 0,
  transactions_removed INTEGER DEFAULT 0,
  auto_matched INTEGER DEFAULT 0,
  error_message TEXT,

  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bank_sync_logs_account ON bank_sync_logs(bank_account_id);

ALTER TABLE bank_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their sync logs"
  ON bank_sync_logs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role can insert sync logs"
  ON bank_sync_logs FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- 4. MODIFY EXISTING TABLES
-- =====================================================

-- Add back-reference on project_transactions for matched bank transactions
ALTER TABLE public.project_transactions
ADD COLUMN IF NOT EXISTS bank_transaction_id UUID REFERENCES bank_transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_transactions_bank_tx ON project_transactions(bank_transaction_id);

COMMENT ON COLUMN public.project_transactions.bank_transaction_id
IS 'Link to bank_transactions record this expense was matched or created from';

-- Add bank_reconciliation to notification types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
CHECK (type IN (
  'appointment_reminder',
  'daily_report_submitted',
  'project_warning',
  'financial_update',
  'worker_update',
  'bank_reconciliation',
  'system'
));

-- Add bank reconciliation preference columns to notification_preferences
ALTER TABLE notification_preferences
ADD COLUMN IF NOT EXISTS push_bank_reconciliation BOOLEAN DEFAULT true;

ALTER TABLE notification_preferences
ADD COLUMN IF NOT EXISTS inapp_bank_reconciliation BOOLEAN DEFAULT true;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

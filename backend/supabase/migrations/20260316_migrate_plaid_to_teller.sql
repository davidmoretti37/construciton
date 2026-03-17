-- =====================================================
-- Migrate from Plaid to Teller
-- Created: 2026-03-16
-- Purpose: Rename all Plaid-specific columns/indexes/constraints
--          to Teller equivalents. Preserves all existing data.
-- =====================================================

-- =====================================================
-- 1. CONNECTED BANK ACCOUNTS — rename columns
-- =====================================================

ALTER TABLE connected_bank_accounts RENAME COLUMN plaid_access_token TO teller_access_token;
ALTER TABLE connected_bank_accounts RENAME COLUMN plaid_item_id TO teller_enrollment_id;
ALTER TABLE connected_bank_accounts RENAME COLUMN plaid_institution_id TO teller_institution_id;
ALTER TABLE connected_bank_accounts RENAME COLUMN plaid_account_id TO teller_account_id;
ALTER TABLE connected_bank_accounts RENAME COLUMN last_sync_cursor TO last_sync_date;

-- Change last_sync_date type from TEXT to DATE (was storing cursor strings, now stores dates)
ALTER TABLE connected_bank_accounts ALTER COLUMN last_sync_date TYPE DATE USING NULL;

-- Rename index (original: idx_connected_bank_accounts_plaid_item)
ALTER INDEX IF EXISTS idx_connected_bank_accounts_plaid_item RENAME TO idx_connected_bank_accounts_teller_enrollment;

-- Add index on teller_account_id (didn't exist before)
CREATE INDEX IF NOT EXISTS idx_connected_bank_accounts_teller_account ON connected_bank_accounts(teller_account_id);

-- Update column comments
COMMENT ON COLUMN connected_bank_accounts.teller_access_token IS 'Teller access token (server-side only, never sent to frontend)';
COMMENT ON COLUMN connected_bank_accounts.teller_enrollment_id IS 'Teller enrollment ID';
COMMENT ON COLUMN connected_bank_accounts.teller_institution_id IS 'Teller institution ID';
COMMENT ON COLUMN connected_bank_accounts.teller_account_id IS 'Teller account ID';
COMMENT ON COLUMN connected_bank_accounts.last_sync_date IS 'Last sync date for date-range transaction queries';

-- =====================================================
-- 2. BANK TRANSACTIONS — rename columns
-- =====================================================

ALTER TABLE bank_transactions RENAME COLUMN plaid_transaction_id TO teller_transaction_id;

-- Rename index (original: idx_bank_transactions_plaid_id)
ALTER INDEX IF EXISTS idx_bank_transactions_plaid_id RENAME TO idx_bank_transactions_teller_id;

COMMENT ON COLUMN bank_transactions.teller_transaction_id IS 'Teller transaction ID (unique)';

-- =====================================================
-- 3. BANK SYNC LOGS — update CHECK constraint
-- =====================================================

-- Drop old constraint, update data, add new constraint
ALTER TABLE bank_sync_logs DROP CONSTRAINT IF EXISTS bank_sync_logs_sync_type_check;
UPDATE bank_sync_logs SET sync_type = 'teller_sync' WHERE sync_type = 'plaid_sync';
ALTER TABLE bank_sync_logs ADD CONSTRAINT bank_sync_logs_sync_type_check
  CHECK (sync_type IN ('teller_sync', 'csv_import', 'manual_refresh'));

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

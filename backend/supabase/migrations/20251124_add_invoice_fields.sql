-- Add missing invoice fields to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT 'Net 30',
  ADD COLUMN IF NOT EXISTS footer_text TEXT DEFAULT '';

-- Add comments
COMMENT ON COLUMN profiles.payment_terms IS 'Payment terms for invoices (e.g., Net 30, Due on Receipt)';
COMMENT ON COLUMN profiles.footer_text IS 'Footer text displayed on invoices';

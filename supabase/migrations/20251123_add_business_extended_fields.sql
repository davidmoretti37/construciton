-- Add extended business fields to profiles table for invoices
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS business_logo TEXT,
  ADD COLUMN IF NOT EXISTS business_address TEXT,
  ADD COLUMN IF NOT EXISTS payment_info TEXT;

-- Add indexes for searching
CREATE INDEX IF NOT EXISTS idx_profiles_business_logo ON profiles(business_logo);

-- Add comments
COMMENT ON COLUMN profiles.business_logo IS 'Business logo URL from Supabase storage';
COMMENT ON COLUMN profiles.business_address IS 'Business address for invoices';
COMMENT ON COLUMN profiles.payment_info IS 'Payment information displayed on invoices';

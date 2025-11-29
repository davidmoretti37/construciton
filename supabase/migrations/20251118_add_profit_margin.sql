-- Add profit_margin column to profiles table
-- This stores the default profit margin percentage (0.20 = 20%, 0.25 = 25%, etc.)
-- Used to calculate final contract amounts on top of project costs

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS profit_margin DECIMAL(3,2) DEFAULT 0.25;

-- Add comment for documentation
COMMENT ON COLUMN profiles.profit_margin IS 'Default profit margin percentage (e.g., 0.25 = 25%) added to project costs';

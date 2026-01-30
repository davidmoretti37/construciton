-- Add auto_translate_estimates setting to profiles
-- When enabled, generate estimate/invoice content in English for PT/ES users

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS auto_translate_estimates BOOLEAN DEFAULT false;

COMMENT ON COLUMN profiles.auto_translate_estimates IS
  'When enabled, generate estimate/invoice content in English for PT/ES users';

-- Add migration_version column to track feature migrations
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS migration_version INTEGER DEFAULT 0;

COMMENT ON COLUMN public.profiles.migration_version IS 'Tracks which feature migrations have been applied to this user';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_migration_version ON public.profiles (migration_version);

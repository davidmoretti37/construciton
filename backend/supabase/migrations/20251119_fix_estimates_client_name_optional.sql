-- Make client_name optional in estimates table
-- This allows saving estimates without client information initially

-- Remove NOT NULL constraint from client_name
ALTER TABLE public.estimates
ALTER COLUMN client_name DROP NOT NULL;

-- Add a default value to prevent completely empty client names
ALTER TABLE public.estimates
ALTER COLUMN client_name SET DEFAULT 'Unnamed Client';

-- Update any existing NULL values (if any)
UPDATE public.estimates
SET client_name = 'Unnamed Client'
WHERE client_name IS NULL;

-- Allow service_locations to exist without a service plan
-- These are standalone saved addresses for the owner's location library
ALTER TABLE public.service_locations ALTER COLUMN service_plan_id DROP NOT NULL;

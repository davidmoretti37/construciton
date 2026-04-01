-- Per-location pricing override
-- Adds billing_cycle, price_per_visit, monthly_rate to location_schedules.
-- When set, these override the plan-level pricing for that location.
-- When NULL, the plan-level pricing applies (fallback).

ALTER TABLE public.location_schedules
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT CHECK (billing_cycle IN ('per_visit','monthly','quarterly')),
  ADD COLUMN IF NOT EXISTS price_per_visit NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS monthly_rate NUMERIC(10,2);

COMMENT ON COLUMN public.location_schedules.billing_cycle IS 'Overrides service_plans.billing_cycle for this location when set';
COMMENT ON COLUMN public.location_schedules.price_per_visit IS 'Overrides service_plans.price_per_visit for this location when set';
COMMENT ON COLUMN public.location_schedules.monthly_rate IS 'Overrides service_plans.monthly_rate for this location when set';

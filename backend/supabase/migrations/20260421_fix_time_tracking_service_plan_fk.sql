-- Fix time_tracking.service_plan_id FK so deleting a service plan doesn't 409.
--
-- Root cause: the FK was created without ON DELETE behavior, defaulting to
-- NO ACTION. Any attempt to delete a service_plan with existing time_tracking
-- rows threw a 23503 foreign-key violation.
--
-- Fix: ON DELETE SET NULL. We want to preserve clock-in/clock-out history
-- (time tracking is audit data) — just detach it from the removed plan.

DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT constraint_name INTO fk_name
  FROM information_schema.table_constraints
  WHERE table_name = 'time_tracking'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%service_plan%';

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.time_tracking DROP CONSTRAINT %I', fk_name);
  END IF;

  ALTER TABLE public.time_tracking
    ADD CONSTRAINT time_tracking_service_plan_id_fkey
    FOREIGN KEY (service_plan_id)
    REFERENCES public.service_plans(id)
    ON DELETE SET NULL;
END $$;

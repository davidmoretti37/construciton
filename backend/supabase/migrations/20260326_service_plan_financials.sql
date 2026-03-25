-- Allow project_transactions to belong to a service plan (not just projects)
-- This enables income/expense tracking for recurring service businesses

-- 1. Make project_id nullable (transactions can now belong to service plan instead)
ALTER TABLE public.project_transactions ALTER COLUMN project_id DROP NOT NULL;

-- 2. Add service_plan_id column
ALTER TABLE public.project_transactions
  ADD COLUMN IF NOT EXISTS service_plan_id UUID REFERENCES public.service_plans(id) ON DELETE CASCADE;

-- 3. Ensure every transaction belongs to at least one entity
ALTER TABLE public.project_transactions
  ADD CONSTRAINT has_project_or_service_plan
  CHECK (project_id IS NOT NULL OR service_plan_id IS NOT NULL);

-- 4. Index for service plan lookups
CREATE INDEX IF NOT EXISTS idx_project_transactions_service_plan_id
  ON public.project_transactions(service_plan_id);

-- 5. Guard the trigger function so it doesn't crash on service-plan-only transactions
CREATE OR REPLACE FUNCTION update_project_totals_from_transactions()
RETURNS TRIGGER AS $$
DECLARE
  target_project_id UUID;
BEGIN
  target_project_id := COALESCE(NEW.project_id, OLD.project_id);

  -- Only update project totals if this transaction belongs to a project
  IF target_project_id IS NOT NULL THEN
    UPDATE public.projects p
    SET
      expenses = COALESCE((
        SELECT SUM(amount)
        FROM public.project_transactions
        WHERE project_id = p.id AND type = 'expense'
      ), 0),
      income_collected = COALESCE((
        SELECT SUM(amount)
        FROM public.project_transactions
        WHERE project_id = p.id AND type = 'income'
      ), 0),
      updated_at = NOW()
    WHERE p.id = target_project_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 6. RLS policies for service plan transactions
-- Owners can view transactions for their service plans
CREATE POLICY "Owners can view service plan transactions"
ON public.project_transactions FOR SELECT
USING (
  service_plan_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.service_plans
    WHERE service_plans.id = project_transactions.service_plan_id
    AND service_plans.owner_id = auth.uid()
  )
);

-- Owners can insert transactions for their service plans
CREATE POLICY "Owners can insert service plan transactions"
ON public.project_transactions FOR INSERT
WITH CHECK (
  service_plan_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.service_plans
    WHERE service_plans.id = project_transactions.service_plan_id
    AND service_plans.owner_id = auth.uid()
  )
);

-- Owners can update transactions for their service plans
CREATE POLICY "Owners can update service plan transactions"
ON public.project_transactions FOR UPDATE
USING (
  service_plan_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.service_plans
    WHERE service_plans.id = project_transactions.service_plan_id
    AND service_plans.owner_id = auth.uid()
  )
);

-- Owners can delete transactions for their service plans
CREATE POLICY "Owners can delete service plan transactions"
ON public.project_transactions FOR DELETE
USING (
  service_plan_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.service_plans
    WHERE service_plans.id = project_transactions.service_plan_id
    AND service_plans.owner_id = auth.uid()
  )
);

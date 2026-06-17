-- FIX: CompanyOverheadScreen offers Quarterly and Annually frequencies, but the
-- recurring_expenses_frequency_check CHECK only allowed weekly/biweekly/monthly,
-- so saving a quarterly or annual overhead expense failed (23514 check_violation).
-- Widen the CHECK to match the UI. Idempotent.
ALTER TABLE public.recurring_expenses DROP CONSTRAINT IF EXISTS recurring_expenses_frequency_check;
ALTER TABLE public.recurring_expenses ADD CONSTRAINT recurring_expenses_frequency_check
  CHECK (frequency IN ('weekly','biweekly','monthly','quarterly','annually'));

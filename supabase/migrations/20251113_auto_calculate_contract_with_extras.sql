-- Migration: Auto-calculate contract_amount to include base + extras
-- This keeps the extras array for history but ensures contract_amount is always accurate

-- Step 1: Add a base_contract column to store the original contract value
-- This preserves the original amount before any extras
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS base_contract NUMERIC(10, 2);

-- Step 2: Migrate existing data
-- Set base_contract to current budget (original value)
-- Set contract_amount to budget + sum of extras
UPDATE public.projects
SET base_contract = COALESCE(budget, contract_amount, 0),
    contract_amount = COALESCE(budget, contract_amount, 0) +
      COALESCE(
        (SELECT SUM((item->>'amount')::numeric)
         FROM jsonb_array_elements(COALESCE(extras, '[]'::jsonb)) AS item),
        0
      )
WHERE base_contract IS NULL;

-- Step 3: Create a function to automatically update contract_amount when extras change
CREATE OR REPLACE FUNCTION public.update_contract_amount()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate total extras
  NEW.contract_amount := COALESCE(NEW.base_contract, 0) +
    COALESCE(
      (SELECT SUM((item->>'amount')::numeric)
       FROM jsonb_array_elements(COALESCE(NEW.extras, '[]'::jsonb)) AS item),
      0
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create trigger to auto-update contract_amount on insert/update
DROP TRIGGER IF EXISTS trigger_update_contract_amount ON public.projects;
CREATE TRIGGER trigger_update_contract_amount
  BEFORE INSERT OR UPDATE OF base_contract, extras ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_contract_amount();

-- Step 5: Add helpful comment
COMMENT ON COLUMN public.projects.base_contract IS 'Original contract value before any extras/change orders';
COMMENT ON COLUMN public.projects.contract_amount IS 'Total contract value (base_contract + sum of extras) - AUTO-CALCULATED';
COMMENT ON COLUMN public.projects.extras IS 'Array of extras/change orders for history tracking: [{"amount": 1500, "description": "tile work", "dateAdded": "2025-11-03"}]';

-- Step 6: Verify the migration worked
-- This should show all projects with their base, extras, and total contract
-- Uncomment to run verification:
-- SELECT
--   name,
--   client,
--   base_contract,
--   contract_amount,
--   jsonb_array_length(extras) as extras_count,
--   (SELECT SUM((item->>'amount')::numeric)
--    FROM jsonb_array_elements(extras) AS item) as extras_total
-- FROM public.projects;

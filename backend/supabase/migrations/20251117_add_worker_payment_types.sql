-- Add payment type options for workers
-- Supports hourly, daily, weekly, and project-based payment structures

-- Step 1: Add payment_type column with constraint
ALTER TABLE public.workers
ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'hourly'
CHECK (payment_type IN ('hourly', 'daily', 'weekly', 'project_based'));

-- Step 2: Add payment rate columns for different payment types
ALTER TABLE public.workers
ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(10, 2) DEFAULT 0;

ALTER TABLE public.workers
ADD COLUMN IF NOT EXISTS weekly_salary NUMERIC(10, 2) DEFAULT 0;

ALTER TABLE public.workers
ADD COLUMN IF NOT EXISTS project_rate NUMERIC(10, 2) DEFAULT 0;

-- Step 3: Add comments for documentation
COMMENT ON COLUMN public.workers.payment_type IS 'Type of payment structure: hourly, daily, weekly, or project_based';
COMMENT ON COLUMN public.workers.hourly_rate IS 'Rate per hour for hourly workers';
COMMENT ON COLUMN public.workers.daily_rate IS 'Rate per day for daily workers';
COMMENT ON COLUMN public.workers.weekly_salary IS 'Fixed weekly salary';
COMMENT ON COLUMN public.workers.project_rate IS 'Fixed rate per project completion';

-- Step 4: Create index for payment_type for faster filtering
CREATE INDEX IF NOT EXISTS idx_workers_payment_type ON public.workers(payment_type);

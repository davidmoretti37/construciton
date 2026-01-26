-- Add receipt_url and line_items columns for worker expense submissions
-- This enables workers to submit expenses with receipt images analyzed by AI

-- Add new columns to project_transactions
ALTER TABLE public.project_transactions
ADD COLUMN IF NOT EXISTS receipt_url TEXT,
ADD COLUMN IF NOT EXISTS line_items JSONB;

-- Add comments for new columns
COMMENT ON COLUMN public.project_transactions.receipt_url IS 'URL to uploaded receipt image in Supabase storage';
COMMENT ON COLUMN public.project_transactions.line_items IS 'Array of line items extracted from receipt by AI: [{description, quantity, unitPrice, total}]';

-- Workers can insert their own expenses for projects they are assigned to
CREATE POLICY "Workers can insert their own expenses"
ON public.project_transactions FOR INSERT
WITH CHECK (
  type = 'expense'
  AND worker_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.workers w
    WHERE w.id = project_transactions.worker_id
    AND w.user_id = auth.uid()
  )
);

-- Workers can view their own submitted expenses
CREATE POLICY "Workers can view their own submitted expenses"
ON public.project_transactions FOR SELECT
USING (
  type = 'expense'
  AND worker_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.workers w
    WHERE w.id = project_transactions.worker_id
    AND w.user_id = auth.uid()
  )
);

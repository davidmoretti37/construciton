-- Fix time_tracking RLS: Allow owners to INSERT and DELETE time entries for their workers
-- The existing policies only allow SELECT and UPDATE for owners

-- Allow owners to INSERT time entries for their workers
CREATE POLICY "Owners can insert time entries for workers"
ON public.time_tracking FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workers
    WHERE workers.id = time_tracking.worker_id
    AND workers.owner_id = auth.uid()
  )
);

-- Allow owners to DELETE time entries for their workers
CREATE POLICY "Owners can delete time entries for workers"
ON public.time_tracking FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.workers
    WHERE workers.id = time_tracking.worker_id
    AND workers.owner_id = auth.uid()
  )
);

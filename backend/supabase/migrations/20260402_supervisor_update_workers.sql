-- Allow supervisors to update workers belonging to their owner
-- Fixes: worker payment values not saving when edited by a supervisor
CREATE POLICY "Supervisors can update owner workers"
ON public.workers FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'supervisor'
    AND p.owner_id = workers.owner_id
  )
);

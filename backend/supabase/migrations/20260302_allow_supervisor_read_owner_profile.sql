-- Allow supervisors to read their owner's profile
-- This is needed so supervisors can fetch the owner's hide_contract_from_supervisors setting
-- Uses SECURITY DEFINER function to avoid circular RLS reference on profiles table

CREATE OR REPLACE FUNCTION get_supervisor_owner_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT owner_id FROM public.profiles WHERE id = auth.uid() AND role = 'supervisor'
$$;

CREATE POLICY "Supervisors can view their owner profile"
ON public.profiles FOR SELECT
USING (id = get_supervisor_owner_id());

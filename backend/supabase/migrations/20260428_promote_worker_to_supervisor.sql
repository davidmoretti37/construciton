-- Promote a worker to supervisor in a single trusted operation.
-- The previous client-side approach updated profiles.role directly, which
-- silently no-ops under standard "users can only update their own profile"
-- RLS — the owner is editing someone else's profile.

-- Marker so workers list queries can hide promoted rows without losing
-- the historical worker record (time_tracking still references workers.id).
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS promoted_to_supervisor BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_workers_promoted
  ON public.workers(owner_id) WHERE promoted_to_supervisor = false;

CREATE OR REPLACE FUNCTION public.promote_worker_to_supervisor(p_worker_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_worker RECORD;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, user_id, owner_id, full_name, email, promoted_to_supervisor
    INTO v_worker
    FROM public.workers
    WHERE id = p_worker_id;

  IF v_worker.id IS NULL THEN
    RAISE EXCEPTION 'Worker not found';
  END IF;

  IF v_worker.owner_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Only the owner can promote this worker';
  END IF;

  IF v_worker.user_id IS NULL THEN
    RAISE EXCEPTION 'Worker has no linked account yet — they need to accept their invite first';
  END IF;

  IF v_worker.promoted_to_supervisor THEN
    RETURN json_build_object('success', true, 'already_promoted', true);
  END IF;

  -- Promote the underlying profile. Set owner_id so the new supervisor is
  -- correctly scoped under the caller, and grant a sensible default
  -- permission set (matches the toggles the owner already controls).
  UPDATE public.profiles
     SET role = 'supervisor',
         owner_id = v_caller,
         can_manage_workers = COALESCE(can_manage_workers, false) OR true,
         updated_at = NOW()
   WHERE id = v_worker.user_id;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, role, owner_id, full_name, email, can_manage_workers)
    VALUES (v_worker.user_id, 'supervisor', v_caller, v_worker.full_name, v_worker.email, true);
  END IF;

  -- Mark the workers row as promoted so the workers list can hide it.
  UPDATE public.workers
     SET promoted_to_supervisor = true,
         updated_at = NOW()
   WHERE id = p_worker_id;

  RETURN json_build_object(
    'success', true,
    'worker_id', p_worker_id,
    'profile_id', v_worker.user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_worker_to_supervisor(UUID) TO authenticated;

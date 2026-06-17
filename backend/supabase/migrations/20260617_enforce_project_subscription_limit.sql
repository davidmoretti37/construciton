-- =====================================================
-- Server-side enforcement of the subscription project limit.
--
-- The client-side check (saveProject in projects.js) and the App-root paywall
-- gate are the UX layer; this trigger is the UNBYPASSABLE backstop so that a
-- direct Supabase insert (bypassing the client) still cannot exceed the owning
-- account's plan limit or create projects with no active subscription.
--
-- projects.user_id is ALWAYS the owner: supervisors insert a project under
-- their owner's user_id (see supervisor_can_create_projects RLS,
-- 20260427_supervisor_project_create_rls.sql), so can_create_project(NEW.user_id)
-- correctly evaluates the OWNING account's subscription/limit in every case.
--
-- Idempotent: safe to run multiple times (CREATE OR REPLACE + DROP IF EXISTS).
-- =====================================================

CREATE OR REPLACE FUNCTION public.enforce_project_subscription_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- can_create_project counts the owner's active (non-completed/archived)
  -- projects and compares to the plan limit; it returns can_create=false for
  -- no active subscription or when the limit is reached. The new row is not yet
  -- counted (BEFORE INSERT), so the comparison is correct for the Nth+1 project.
  v_result := public.can_create_project(NEW.user_id);

  IF COALESCE((v_result->>'can_create')::boolean, false) = false THEN
    RAISE EXCEPTION 'project_limit_reached: %', COALESCE(v_result->>'reason', 'no_subscription')
      USING ERRCODE = 'check_violation',
            HINT = 'The account has no active subscription or has reached its plan project limit.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_project_subscription_limit ON public.projects;
CREATE TRIGGER trg_enforce_project_subscription_limit
  BEFORE INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_project_subscription_limit();

-- Auto-link estimates to projects when project_id is missing.
--
-- Why: even with the agent, the chat preview cards, the system prompt's
-- anti-hallucination rules, and the frontend save handler's preview merge,
-- estimates were still landing with project_id=null. The most common
-- failure was a stale iOS build that didn't have the latest frontend
-- safety nets — the user types "create estimate for Sarah", the chat
-- preview shows Sarah Bathroom Remodel correctly, but the action.data
-- arriving at saveEstimate had only line items and no client/project
-- info. The estimate was inserted bare.
--
-- This trigger is the bottom-of-the-stack defense: regardless of which
-- iOS build is running or which code path inserted the row, if it lands
-- with project_id=null and we can match by name, link it.

CREATE OR REPLACE FUNCTION public.auto_link_estimate_to_project()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_id UUID;
  v_name TEXT;
  v_client TEXT;
BEGIN
  -- Only fire when there's actually no link
  IF NEW.project_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Match by exact project_name first (most specific)
  IF NEW.project_name IS NOT NULL AND NEW.project_name <> '' THEN
    SELECT id, name, client_name INTO v_id, v_name, v_client
    FROM public.projects
    WHERE user_id = NEW.user_id
      AND lower(name) = lower(NEW.project_name)
      AND status <> 'archived'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Fall back to client_name match. Skip the "Unnamed Client" placeholder
  -- saveEstimate uses when nothing was provided — that's noise, not signal.
  IF v_id IS NULL AND NEW.client_name IS NOT NULL AND NEW.client_name <> '' AND NEW.client_name <> 'Unnamed Client' THEN
    SELECT id, name, client_name INTO v_id, v_name, v_client
    FROM public.projects
    WHERE user_id = NEW.user_id
      AND lower(client_name) = lower(NEW.client_name)
      AND status <> 'archived'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_id IS NOT NULL THEN
    NEW.project_id := v_id;
    -- Backfill display fields when missing for visual consistency
    IF NEW.project_name IS NULL OR NEW.project_name = '' THEN
      NEW.project_name := v_name;
    END IF;
    IF NEW.client_name IS NULL OR NEW.client_name = '' OR NEW.client_name = 'Unnamed Client' THEN
      NEW.client_name := v_client;
    END IF;
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS auto_link_estimate_trigger ON public.estimates;
CREATE TRIGGER auto_link_estimate_trigger
  BEFORE INSERT OR UPDATE OF project_name, client_name ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_estimate_to_project();

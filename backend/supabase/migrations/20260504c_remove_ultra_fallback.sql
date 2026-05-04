-- Remove the ultra-fallback branch from auto_link_estimate_to_project.
--
-- The previous version fell through to "link to the user's most-recent
-- active project" when the row had no client_name / project_name signal
-- to match on. Intent: avoid orphan rows. Outcome: actively wrong links.
-- Saw it in prod: "create estimate for Sarah" with empty action.data
-- got cross-linked to Karen Bathroom Remodel (the most recent project)
-- because the chat-side merge produced an empty save.
--
-- Better behavior: leave the estimate orphaned and let the
-- EstimateBuilder UI prompt "Tap to link a project" — accurate, safe,
-- and the user can fix it in one tap. The two upstream defenses
-- (DOMAIN CONTEXT in the prompt + the visualElement normalizer at
-- the SSE writer boundary) already prevent the orphan case in the
-- happy path; this trigger is now a strict by-name resolver only.

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
  v_phone TEXT;
  v_email TEXT;
  v_address TEXT;
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    -- Project link is already set — backfill any missing client contact
    -- fields from the project record.
    SELECT name, client_name, client_phone, client_email, client_address
      INTO v_name, v_client, v_phone, v_email, v_address
    FROM public.projects
    WHERE id = NEW.project_id
    LIMIT 1;

    v_id := NEW.project_id;
  ELSE
    -- Resolve by project_name (most specific) then client_name. Both
    -- skip the "Unnamed Client" placeholder. NO ultra-fallback —
    -- if neither matches, leave the row orphaned.
    IF NEW.project_name IS NOT NULL AND NEW.project_name <> '' THEN
      SELECT id, name, client_name, client_phone, client_email, client_address
        INTO v_id, v_name, v_client, v_phone, v_email, v_address
      FROM public.projects
      WHERE user_id = NEW.user_id
        AND lower(name) = lower(NEW.project_name)
        AND status <> 'archived'
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;

    IF v_id IS NULL AND NEW.client_name IS NOT NULL AND NEW.client_name <> '' AND NEW.client_name <> 'Unnamed Client' THEN
      SELECT id, name, client_name, client_phone, client_email, client_address
        INTO v_id, v_name, v_client, v_phone, v_email, v_address
      FROM public.projects
      WHERE user_id = NEW.user_id
        AND lower(client_name) = lower(NEW.client_name)
        AND status <> 'archived'
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;

    IF v_id IS NOT NULL THEN
      NEW.project_id := v_id;
    END IF;
  END IF;

  -- Backfill display + contact fields when missing
  IF v_id IS NOT NULL THEN
    IF NEW.project_name IS NULL OR NEW.project_name = '' THEN
      NEW.project_name := v_name;
    END IF;
    IF NEW.client_name IS NULL OR NEW.client_name = '' OR NEW.client_name = 'Unnamed Client' THEN
      NEW.client_name := v_client;
    END IF;
    IF (NEW.client_phone IS NULL OR NEW.client_phone = '') AND v_phone IS NOT NULL THEN
      NEW.client_phone := v_phone;
    END IF;
    IF (NEW.client_email IS NULL OR NEW.client_email = '') AND v_email IS NOT NULL THEN
      NEW.client_email := v_email;
    END IF;
    IF (NEW.client_address IS NULL OR NEW.client_address = '') AND v_address IS NOT NULL THEN
      NEW.client_address := v_address;
    END IF;
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS auto_link_estimate_trigger ON public.estimates;
CREATE TRIGGER auto_link_estimate_trigger
  BEFORE INSERT OR UPDATE OF project_name, client_name, project_id ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_estimate_to_project();

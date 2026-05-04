-- v2 of the auto-link trigger. Two upgrades over the original:
--
-- 1. When the trigger does resolve a project, it ALSO backfills
--    client_phone / client_email / client_address from the project
--    record. Without this the EstimateBuilder still showed empty
--    placeholders for contact fields after the link was made.
--
-- 2. ULTRA-FALLBACK: when an estimate lands fully empty (no
--    project_name, client_name = "Unnamed Client" — the chat-save
--    bug shape), link it to the user's most-recent active project.
--    Better to risk a slightly-wrong link than to save a fully
--    orphaned estimate the user has to fix by hand. Only fires
--    when there's literally nothing to match on.

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

    IF v_id IS NULL THEN
      v_id := NEW.project_id;
    END IF;
  ELSE
    -- Resolve by project_name (most specific) then client_name
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

    -- ULTRA-FALLBACK: if the row was inserted with NO client info at all
    -- (the chat-save bug), scope to the user's MOST RECENT active project
    -- as a last resort.
    IF v_id IS NULL
       AND (NEW.project_name IS NULL OR NEW.project_name = '')
       AND NEW.client_name = 'Unnamed Client' THEN
      SELECT id, name, client_name, client_phone, client_email, client_address
        INTO v_id, v_name, v_client, v_phone, v_email, v_address
      FROM public.projects
      WHERE user_id = NEW.user_id
        AND status NOT IN ('archived', 'completed')
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

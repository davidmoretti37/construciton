-- v3 of the auto-link trigger. Adds a recovery path that pulls fields
-- from the most recent agent_jobs row when an estimate is inserted with
-- empty fields. This is the bottom of the stack — works regardless of
-- which iOS build is running.
--
-- Why: the agent_jobs row stores the FULL visualElement.data the agent
-- emitted (project_id, clientName, projectName, clientPhone, etc).
-- When the chat-side save somehow drops fields between the visualElement
-- and the saveEstimate insert (Metro stale cache, frontend race, any
-- code-path divergence), the row still lands with what the agent
-- intended because the trigger pulls from agent_jobs as a last resort.

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
  v_ve JSONB;
  v_ep JSONB;
BEGIN
  -- ────────────────────────────────────────────────────────────
  -- STEP 1: Recovery from agent_jobs.
  -- If the estimate was inserted with no project link AND no client
  -- info to match on, look at the user's most recent completed
  -- agent_jobs row and pull data from its estimate-preview
  -- visualElement (if present).
  -- ────────────────────────────────────────────────────────────
  IF NEW.project_id IS NULL
     AND (NEW.project_name IS NULL OR NEW.project_name = '')
     AND (NEW.client_name IS NULL OR NEW.client_name = '' OR NEW.client_name = 'Unnamed Client') THEN
    BEGIN
      SELECT visual_elements INTO v_ve
      FROM public.agent_jobs
      WHERE user_id = NEW.user_id
        AND status = 'completed'
        AND created_at > (NOW() - INTERVAL '5 minutes')
      ORDER BY created_at DESC
      LIMIT 1;

      IF v_ve IS NOT NULL AND jsonb_typeof(v_ve) = 'array' THEN
        -- Find the first estimate-preview element
        SELECT elem->'data' INTO v_ep
        FROM jsonb_array_elements(v_ve) AS elem
        WHERE elem->>'type' = 'estimate-preview'
        LIMIT 1;

        IF v_ep IS NOT NULL THEN
          IF NEW.project_id IS NULL AND v_ep ? 'project_id' THEN
            NEW.project_id := (v_ep->>'project_id')::uuid;
          END IF;
          IF (NEW.project_name IS NULL OR NEW.project_name = '') AND v_ep ? 'projectName' THEN
            NEW.project_name := v_ep->>'projectName';
          END IF;
          IF (NEW.client_name IS NULL OR NEW.client_name = '' OR NEW.client_name = 'Unnamed Client') AND v_ep ? 'clientName' THEN
            NEW.client_name := v_ep->>'clientName';
          END IF;
          IF (NEW.client_phone IS NULL OR NEW.client_phone = '') AND v_ep ? 'clientPhone' THEN
            NEW.client_phone := v_ep->>'clientPhone';
          END IF;
          IF (NEW.client_email IS NULL OR NEW.client_email = '') AND v_ep ? 'clientEmail' THEN
            NEW.client_email := v_ep->>'clientEmail';
          END IF;
          IF (NEW.client_address IS NULL OR NEW.client_address = '') AND v_ep ? 'clientAddress' THEN
            NEW.client_address := v_ep->>'clientAddress';
          END IF;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Don't fail the insert on a recovery error. Just log and proceed.
      RAISE NOTICE 'agent_jobs recovery failed: %', SQLERRM;
    END;
  END IF;

  -- ────────────────────────────────────────────────────────────
  -- STEP 2: Link by project_id (already set, or just recovered).
  -- Backfill any missing client contact fields from the project record.
  -- ────────────────────────────────────────────────────────────
  IF NEW.project_id IS NOT NULL THEN
    SELECT name, client_name, client_phone, client_email, client_address
      INTO v_name, v_client, v_phone, v_email, v_address
    FROM public.projects
    WHERE id = NEW.project_id
    LIMIT 1;

    v_id := NEW.project_id;
  ELSE
    -- ────────────────────────────────────────────────────────────
    -- STEP 3: Resolve by name signal. Skip the "Unnamed Client"
    -- placeholder — that's noise, not signal.
    -- ────────────────────────────────────────────────────────────
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

  -- ────────────────────────────────────────────────────────────
  -- STEP 4: Backfill display + contact fields from the resolved project.
  -- ────────────────────────────────────────────────────────────
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

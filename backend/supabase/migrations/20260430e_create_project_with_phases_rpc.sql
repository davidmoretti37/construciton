-- RPC: create_project_with_phases_and_assignments(payload jsonb) RETURNS uuid
-- All-or-nothing creation of a project, optional client + link, phases, and
-- per-phase worker assignments. Atomicity is enforced by the natural function
-- transaction boundary (any RAISE/constraint failure rolls everything back).
-- SECURITY INVOKER: each underlying INSERT is subject to the caller's RLS.
--
-- Expected payload shape:
-- {
--   "project": {
--     "name": "Kitchen remodel",          -- required
--     "client": "Acme Co",                -- optional display string
--     "location": "...",                  -- optional
--     "start_date": "2026-05-01",         -- optional ISO date
--     "end_date": "2026-06-15",           -- optional ISO date
--     "contract_amount": 25000,           -- optional numeric
--     "task_description": "...",          -- optional
--     "estimated_duration": "6 weeks",    -- optional
--     "status": "active"                  -- optional, defaults to 'active'
--   },
--   "client": {
--     "mode": "new" | "existing" | null,
--     "id": "<uuid>",                     -- when mode='existing'
--     "full_name": "...",                 -- when mode='new' (required)
--     "email": "...",                     -- when mode='new' (required)
--     "phone": "..."                      -- when mode='new' (optional)
--   },
--   "phases": [
--     {
--       "name": "Demo",                   -- required
--       "order_index": 0,                 -- required
--       "planned_days": 5,                -- required
--       "start_date": "2026-05-01",       -- optional
--       "end_date": "2026-05-06",         -- optional
--       "budget": 1500,                   -- optional
--       "workers": ["<worker-uuid>", ...] -- optional
--     }
--   ]
-- }

CREATE OR REPLACE FUNCTION public.create_project_with_phases_and_assignments(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_project_id   uuid;
  v_client_id    uuid;
  v_client_mode  text;
  v_phase        jsonb;
  v_phase_id     uuid;
  v_worker_id    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF payload IS NULL OR (payload->'project') IS NULL THEN
    RAISE EXCEPTION 'payload.project is required';
  END IF;

  IF NULLIF(payload->'project'->>'name','') IS NULL THEN
    RAISE EXCEPTION 'payload.project.name is required';
  END IF;

  -- 1. Project
  INSERT INTO public.projects (
    user_id,
    name,
    client,
    location,
    start_date,
    end_date,
    contract_amount,
    task_description,
    estimated_duration,
    status,
    has_phases
  )
  VALUES (
    v_uid,
    payload->'project'->>'name',
    NULLIF(payload->'project'->>'client',''),
    NULLIF(payload->'project'->>'location',''),
    NULLIF(payload->'project'->>'start_date','')::date,
    NULLIF(payload->'project'->>'end_date','')::date,
    COALESCE((payload->'project'->>'contract_amount')::numeric, 0),
    NULLIF(payload->'project'->>'task_description',''),
    NULLIF(payload->'project'->>'estimated_duration',''),
    COALESCE(NULLIF(payload->'project'->>'status',''), 'active'),
    COALESCE(jsonb_array_length(payload->'phases'), 0) > 0
  )
  RETURNING id INTO v_project_id;

  -- 2. Optional client
  v_client_mode := payload->'client'->>'mode';

  IF v_client_mode = 'new' THEN
    IF NULLIF(payload->'client'->>'full_name','') IS NULL
       OR NULLIF(payload->'client'->>'email','') IS NULL THEN
      RAISE EXCEPTION 'new client requires full_name and email';
    END IF;

    INSERT INTO public.clients (owner_id, full_name, email, phone)
    VALUES (
      v_uid,
      payload->'client'->>'full_name',
      payload->'client'->>'email',
      NULLIF(payload->'client'->>'phone','')
    )
    RETURNING id INTO v_client_id;

  ELSIF v_client_mode = 'existing' THEN
    v_client_id := NULLIF(payload->'client'->>'id','')::uuid;
    IF v_client_id IS NULL THEN
      RAISE EXCEPTION 'existing client requires id';
    END IF;
  END IF;

  -- 3. Link client (if any)
  IF v_client_id IS NOT NULL THEN
    INSERT INTO public.project_clients (project_id, client_id)
    VALUES (v_project_id, v_client_id)
    ON CONFLICT (project_id, client_id) DO NOTHING;
  END IF;

  -- 4. Phases + 5. phase × worker assignments
  FOR v_phase IN
    SELECT value FROM jsonb_array_elements(COALESCE(payload->'phases', '[]'::jsonb))
  LOOP
    IF NULLIF(v_phase->>'name','') IS NULL THEN
      RAISE EXCEPTION 'phase.name is required';
    END IF;

    INSERT INTO public.project_phases (
      project_id,
      name,
      order_index,
      planned_days,
      start_date,
      end_date,
      budget
    )
    VALUES (
      v_project_id,
      v_phase->>'name',
      COALESCE((v_phase->>'order_index')::int, 0),
      COALESCE((v_phase->>'planned_days')::int, 1),
      NULLIF(v_phase->>'start_date','')::date,
      NULLIF(v_phase->>'end_date','')::date,
      NULLIF(v_phase->>'budget','')::numeric
    )
    RETURNING id INTO v_phase_id;

    FOR v_worker_id IN
      SELECT value::uuid
        FROM jsonb_array_elements_text(COALESCE(v_phase->'workers', '[]'::jsonb))
    LOOP
      INSERT INTO public.phase_assignments (phase_id, worker_id, assigned_by)
      VALUES (v_phase_id, v_worker_id, v_uid)
      ON CONFLICT (phase_id, worker_id) DO NOTHING;
    END LOOP;
  END LOOP;

  RETURN v_project_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_project_with_phases_and_assignments(jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_project_with_phases_and_assignments(jsonb) IS
  'Atomically creates a project, optional client + link, phases, and phase × worker assignments. SECURITY INVOKER — caller RLS applies to every INSERT.';

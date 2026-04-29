-- audit_log_triggers: generic Postgres trigger that captures every
-- INSERT/UPDATE/DELETE on the listed tables and writes one audit_log
-- row. This is the safety net that catches mutations done directly
-- from the mobile/web client (which writes via supabase-js + RLS,
-- bypassing the backend middleware).
--
-- The trigger is intentionally minimal: it can't see request-level
-- context (IP, user-agent, source) the way the middleware can, so
-- those columns are NULL for trigger-written rows. Use the source
-- field to tell them apart ('system' from triggers, 'mobile'/'web'/
-- 'foreman' from middleware).
--
-- Sensitive fields are stripped here too — duplicate of the JS list
-- in middleware/auditLog.js but matched by case-insensitive regex
-- on the JSONB key. Add new patterns here and there in lockstep.

CREATE OR REPLACE FUNCTION public.redact_sensitive_jsonb(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result JSONB := payload;
  k TEXT;
  sensitive_pattern TEXT := '(password|secret|token|api[_-]?key|access[_-]?key|refresh[_-]?token|authorization|credit[_-]?card|card[_-]?number|ssn|cvv|private[_-]?key|webhook[_-]?secret|session[_-]?token|magic[_-]?link|encryption[_-]?key|salt)';
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RETURN payload;
  END IF;

  FOR k IN SELECT jsonb_object_keys(payload)
  LOOP
    IF k ~* sensitive_pattern THEN
      result := jsonb_set(result, ARRAY[k], '"[REDACTED]"'::jsonb);
    END IF;
  END LOOP;

  RETURN result;
END;
$$;

-- Generic audit trigger function. Reads TG_OP and TG_TABLE_NAME to
-- decide what to write. Owner_id resolution is best-effort: prefers
-- owner_id, falls back to user_id, then NULL. Trigger always uses
-- the SECURITY DEFINER bypass so it can write audit_log even if RLS
-- would block the calling session.
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_entity_id UUID;
  v_action TEXT;
  v_before JSONB;
  v_after JSONB;
  v_actor UUID;
  v_entity_type TEXT;
BEGIN
  -- Map trigger op to canonical action.
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_before := NULL;
    v_after := public.redact_sensitive_jsonb(to_jsonb(NEW));
    v_entity_id := (CASE WHEN to_jsonb(NEW) ? 'id' THEN (to_jsonb(NEW)->>'id')::UUID ELSE NULL END);
    v_company_id := COALESCE(
      NULLIF(to_jsonb(NEW)->>'owner_id','')::UUID,
      NULLIF(to_jsonb(NEW)->>'user_id','')::UUID,
      NULLIF(to_jsonb(NEW)->>'company_id','')::UUID
    );
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_before := public.redact_sensitive_jsonb(to_jsonb(OLD));
    v_after := public.redact_sensitive_jsonb(to_jsonb(NEW));
    v_entity_id := (CASE WHEN to_jsonb(NEW) ? 'id' THEN (to_jsonb(NEW)->>'id')::UUID ELSE NULL END);
    v_company_id := COALESCE(
      NULLIF(to_jsonb(NEW)->>'owner_id','')::UUID,
      NULLIF(to_jsonb(OLD)->>'owner_id','')::UUID,
      NULLIF(to_jsonb(NEW)->>'user_id','')::UUID,
      NULLIF(to_jsonb(OLD)->>'user_id','')::UUID
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_before := public.redact_sensitive_jsonb(to_jsonb(OLD));
    v_after := NULL;
    v_entity_id := (CASE WHEN to_jsonb(OLD) ? 'id' THEN (to_jsonb(OLD)->>'id')::UUID ELSE NULL END);
    v_company_id := COALESCE(
      NULLIF(to_jsonb(OLD)->>'owner_id','')::UUID,
      NULLIF(to_jsonb(OLD)->>'user_id','')::UUID
    );
  ELSE
    RETURN NULL;
  END IF;

  -- Recursion guard. Should never fire because we don't attach the
  -- trigger to audit_log itself, but defend in depth.
  IF TG_TABLE_NAME = 'audit_log' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Without a company_id we can't enforce tenant scope on reads, so
  -- skip the row instead of polluting the log with orphans.
  IF v_company_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Map table name to canonical entity_type. Most table names are
  -- already singular-noun-ish; trim plural 's' when not.
  v_entity_type := CASE TG_TABLE_NAME
    WHEN 'projects' THEN 'project'
    WHEN 'estimates' THEN 'estimate'
    WHEN 'invoices' THEN 'invoice'
    WHEN 'clients' THEN 'customer'
    WHEN 'workers' THEN 'worker'
    WHEN 'project_transactions' THEN 'transaction'
    WHEN 'project_phases' THEN 'phase'
    WHEN 'service_plans' THEN 'service_plan'
    WHEN 'service_visits' THEN 'visit'
    WHEN 'service_locations' THEN 'service_location'
    WHEN 'time_tracking' THEN 'time_entry'
    WHEN 'supervisor_time_tracking' THEN 'time_entry'
    WHEN 'project_documents' THEN 'document'
    WHEN 'approval_events' THEN 'change_order'
    WHEN 'material_selections' THEN 'material_selection'
    WHEN 'subcontractor_quotes' THEN 'subcontractor_quote'
    WHEN 'daily_reports' THEN 'daily_report'
    ELSE TG_TABLE_NAME
  END;

  -- Best-effort actor: auth.uid() returns the calling user; for
  -- service-role writes (backend middleware path) it's NULL and the
  -- middleware path will have already written its own row, so the
  -- trigger row becomes the duplicate-resistant fallback.
  v_actor := auth.uid();

  INSERT INTO public.audit_log (
    company_id, actor_user_id, actor_type, action,
    entity_type, entity_id, before_json, after_json,
    source
  ) VALUES (
    v_company_id, v_actor,
    CASE WHEN v_actor IS NULL THEN 'system' ELSE 'user' END,
    v_action,
    v_entity_type, v_entity_id, v_before, v_after,
    'system'
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Helper to attach the trigger idempotently. Drops first so re-runs
-- pick up function changes.
CREATE OR REPLACE FUNCTION public.attach_audit_trigger(target_table TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS audit_log_trg ON public.%I', target_table);
  EXECUTE format(
    'CREATE TRIGGER audit_log_trg AFTER INSERT OR UPDATE OR DELETE ON public.%I '
    'FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger()',
    target_table
  );
END;
$$;

-- Attach to every table the spec calls out as important. New tables
-- get added here; the trigger function itself stays generic.
DO $$
DECLARE
  tbl TEXT;
  audited_tables TEXT[] := ARRAY[
    'projects',
    'estimates',
    'invoices',
    'clients',
    'workers',
    'project_transactions',
    'project_phases',
    'service_plans',
    'service_visits',
    'service_locations',
    'time_tracking',
    'supervisor_time_tracking',
    'project_documents',
    'approval_events',
    'material_selections',
    'subcontractor_quotes',
    'daily_reports'
  ];
BEGIN
  FOREACH tbl IN ARRAY audited_tables
  LOOP
    -- Only attach if the table exists — the audit list is forward-
    -- compatible across deploys where one table hasn't shipped yet.
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      PERFORM public.attach_audit_trigger(tbl);
    END IF;
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';

-- audit_log: focused write-operation audit trail.
--
-- Distinct from domain_events (which captures everything that ever
-- happens in Sylk including agent decisions, voice notes, recall
-- traces). audit_log is the narrow "who changed what" table that
-- powers the mobile audit-trail UI and Foreman's "who edited the
-- Smith estimate?" answers. One row per CRUD action on an important
-- entity, with diffable before/after JSON, the actor, the request
-- envelope (IP, UA, source) and timestamps.
--
-- Multi-tenant boundary: company_id is the owner's auth user id.
-- Sylk has no separate companies table — every owner is a tenant —
-- so company_id semantically means "this owner's tenant scope."

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant scope. Populated with the owner_id of the data being
  -- mutated. Reads are scoped by this column under RLS.
  company_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- WHO: actor_user_id is the auth user that performed the write
  -- (could be the owner, a supervisor under the owner, a worker, or
  -- NULL for system/cron writes). actor_type lets the UI render
  -- "edited by Joe (supervisor)" without joining profiles.
  actor_user_id UUID,
  actor_type TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('user','owner','supervisor','worker','foreman','system','api','client')),

  -- WHAT: action is the verb, entity_type is the canonical noun
  -- ('project','estimate','invoice','change_order','customer',
  -- 'worker','payment','expense','time_entry','service_plan',
  -- 'visit','phase','document', etc.). entity_id is the row id
  -- when applicable (NULL for entity-less actions like bulk imports).
  action TEXT NOT NULL
    CHECK (action IN ('create','update','delete','bulk_create','bulk_update','bulk_delete','restore','archive','void')),
  entity_type TEXT NOT NULL,
  entity_id UUID,

  -- THE DIFF: before_json captures the row state pre-mutation
  -- (NULL for create), after_json captures post-mutation state
  -- (NULL for delete). Sensitive fields are redacted before write
  -- (api_keys, tokens, password_hash, etc.) by the middleware.
  before_json JSONB,
  after_json JSONB,

  -- Bulk roll-up. When the middleware coalesces N rows of the same
  -- (action, entity_type) into one audit row, item_count holds N
  -- (and entity_id is NULL). Keeps the log skim-readable instead
  -- of buried under "imported 400 transactions" walls.
  item_count INT,

  -- REQUEST ENVELOPE. ip and user_agent are captured from the
  -- request at write time. source tags where the call came from so
  -- "show me everything Foreman did" / "everything from the mobile
  -- app" filters work without inferring it from the user-agent.
  ip TEXT,
  user_agent TEXT,
  source TEXT NOT NULL DEFAULT 'api'
    CHECK (source IN ('mobile','web','portal','api','foreman','system','cron','webhook')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot-path index for the entity-history query: "show me every
-- change to estimate 123 in reverse-chronological order." The other
-- two indexes cover the user-history and recent-activity routes.
CREATE INDEX IF NOT EXISTS idx_audit_log_company_entity
  ON public.audit_log(company_id, entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_company_created
  ON public.audit_log(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_company_actor
  ON public.audit_log(company_id, actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Owner reads their own tenant's log.
DROP POLICY IF EXISTS "audit_log_owner_read" ON public.audit_log;
CREATE POLICY "audit_log_owner_read" ON public.audit_log FOR SELECT
  USING (company_id = (SELECT auth.uid()));

-- Supervisors under the owner can read the owner's log (read-only).
DROP POLICY IF EXISTS "audit_log_supervisor_read" ON public.audit_log;
CREATE POLICY "audit_log_supervisor_read" ON public.audit_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'supervisor'
      AND p.owner_id = audit_log.company_id
  ));

-- Writes are service-role only — the audit middleware uses the
-- backend's service_role key. We never want a user session client
-- writing audit rows directly.

NOTIFY pgrst, 'reload schema';

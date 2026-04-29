-- =====================================================
-- Integration imports — schema additions
-- Created: 2026-04-30
-- Purpose: Make every importable entity matchable to its
-- source-of-truth ID in the platform it came from
-- (QuickBooks, Monday, CSV) so re-imports stay idempotent
-- and never create duplicates.
-- =====================================================

-- ---------- workers: subcontractor + business name ----------
-- QB Vendors are typically companies, not people ("Smith Plumbing LLC"),
-- and the 1099 flag tells us whether they're subcontractors. We need
-- both pieces of info to import vendors cleanly.
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS is_subcontractor BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS business_name TEXT;

COMMENT ON COLUMN public.workers.is_subcontractor IS
  'True for 1099 subs / vendors; false for W-2 employees. Imported from QB Vendor.Vendor1099 flag.';
COMMENT ON COLUMN public.workers.business_name IS
  'Company / DBA name when different from full_name (e.g. "Smith Plumbing LLC"). Common for QB Vendors.';

-- ---------- Integration ID columns (idempotent re-imports) ----------
-- Pattern: <platform>_id text + <platform>_synced_at timestamptz on each
-- table that can receive an import. Unique on (user_id, <platform>_id)
-- enforced via partial unique indexes (NULL-safe).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS qbo_id      TEXT,
  ADD COLUMN IF NOT EXISTS qbo_synced_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS monday_id   TEXT,
  ADD COLUMN IF NOT EXISTS monday_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS import_source JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS qbo_id      TEXT,
  ADD COLUMN IF NOT EXISTS qbo_synced_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS import_source JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS qbo_id      TEXT,
  ADD COLUMN IF NOT EXISTS qbo_synced_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS monday_id   TEXT,
  ADD COLUMN IF NOT EXISTS monday_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS import_source JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS qbo_id      TEXT,
  ADD COLUMN IF NOT EXISTS qbo_synced_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS import_source JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS qbo_id      TEXT,
  ADD COLUMN IF NOT EXISTS qbo_synced_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS import_source JSONB DEFAULT '{}'::jsonb;

-- Service catalog (user_services) for QB Items import
ALTER TABLE public.user_services
  ADD COLUMN IF NOT EXISTS qbo_id TEXT,
  ADD COLUMN IF NOT EXISTS qbo_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS import_source JSONB DEFAULT '{}'::jsonb;

-- Transactions (for invoice / bill / expense history import).
-- Note: project_transactions doesn't have user_id directly — uniqueness
-- is enforced on (project_id, qbo_id) since project_id is FK'd to a
-- user-owned project anyway.
ALTER TABLE public.project_transactions
  ADD COLUMN IF NOT EXISTS qbo_id      TEXT,
  ADD COLUMN IF NOT EXISTS qbo_synced_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS import_source JSONB DEFAULT '{}'::jsonb;

-- ---------- Partial unique indexes (idempotency) ----------
-- Each (user_id, qbo_id) pair must be unique BUT only when qbo_id is set
-- (so we don't break existing rows that have NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_user_qbo_id
  ON public.clients(user_id, qbo_id) WHERE qbo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_user_monday_id
  ON public.clients(user_id, monday_id) WHERE monday_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_workers_user_qbo_id
  ON public.workers(user_id, qbo_id) WHERE qbo_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_user_qbo_id
  ON public.projects(user_id, qbo_id) WHERE qbo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_user_monday_id
  ON public.projects(user_id, monday_id) WHERE monday_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_estimates_user_qbo_id
  ON public.estimates(user_id, qbo_id) WHERE qbo_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_user_qbo_id
  ON public.invoices(user_id, qbo_id) WHERE qbo_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_transactions_project_qbo_id
  ON public.project_transactions(project_id, qbo_id) WHERE qbo_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_services_user_qbo_id
  ON public.user_services(user_id, qbo_id) WHERE qbo_id IS NOT NULL;

-- ---------- Lookup indexes for dedup-by-email/phone fallbacks ----------
-- When a record has no qbo_id yet (existing manually-entered data), the
-- importer falls back to email or phone matching. Indexes for speed.
CREATE INDEX IF NOT EXISTS idx_clients_user_email_lower
  ON public.clients(user_id, LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workers_user_email_lower
  ON public.workers(user_id, LOWER(email)) WHERE email IS NOT NULL;

-- ---------- Comments ----------
COMMENT ON COLUMN public.clients.qbo_id IS
  'QuickBooks Customer.Id. Set by import_qbo_clients. Idempotent re-imports update by this key.';
COMMENT ON COLUMN public.workers.qbo_id IS
  'QuickBooks Vendor.Id (subs) or Employee.Id (W-2). Set by import_qbo_subcontractors / import_qbo_employees.';
COMMENT ON COLUMN public.projects.qbo_id IS
  'QuickBooks Class.Id, Project.Id, or Customer.Id (sub-customer) — depending on chosen mapping.';
COMMENT ON COLUMN public.invoices.qbo_id IS
  'QuickBooks Invoice.Id. Set by import_qbo_invoice_history.';
COMMENT ON COLUMN public.project_transactions.qbo_id IS
  'QuickBooks Bill.Id / Payment.Id / Purchase.Id depending on transaction type.';
COMMENT ON COLUMN public.clients.import_source IS
  'JSON map of all platforms this row was imported from + when. Example: {"qbo": {"at": "2026-04-30T...", "id": "123"}, "csv": {"at": "...", "filename": "..."}}.';

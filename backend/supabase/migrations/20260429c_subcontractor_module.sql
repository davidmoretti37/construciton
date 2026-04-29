-- =====================================================================
-- Subcontractor Module — Phase A schema foundation
-- =====================================================================
-- Adds first-class subcontractor support: identity, compliance vault,
-- engagements, subcontracts, bidding, invoicing, payment recording,
-- action tokens, and notification-type extensions.
--
-- Multi-tenant scoping in this codebase is via auth.users.id directly
-- (no companies table). The originating GC for a sub_organization is
-- audit-only via created_by_gc_user_id; access flows through engagements.
--
-- Idempotent — safe to re-run.
-- =====================================================================

-- =====================================================================
-- 0. PROFILE EXTENSIONS — add 'sub' role + subscription_tier
-- =====================================================================

-- Set NULL roles to 'owner' (matches default + original migration intent)
UPDATE public.profiles SET role = 'owner' WHERE role IS NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'supervisor', 'worker', 'sub', 'client'));
-- 'client' kept for backward compat with legacy rows; not used in new flows.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free','solo','pro'));

-- Existing owners are already paying for full Sylk → mark them 'pro'
UPDATE public.profiles SET subscription_tier = 'pro'
  WHERE role = 'owner' AND subscription_tier = 'free';

-- =====================================================================
-- 1. SUB_ORGANIZATIONS — global sub identity
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.sub_organizations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- identity
  legal_name               TEXT NOT NULL,
  dba                      TEXT,
  tax_id                   TEXT,
  tax_id_type              TEXT NOT NULL DEFAULT 'ein'
                           CHECK (tax_id_type IN ('ein','cnpj','cpf','mei','none')),
  country_code             TEXT NOT NULL DEFAULT 'US' CHECK (length(country_code) = 2),
  entity_type              TEXT,
  year_founded             INT,

  -- contact
  primary_email            TEXT NOT NULL,
  primary_phone            TEXT,
  website                  TEXT,

  -- address
  address_line1            TEXT,
  address_line2            TEXT,
  city                     TEXT,
  state_code               TEXT,
  postal_code              TEXT,

  -- trades & capacity
  trades                   TEXT[] DEFAULT '{}',
  service_states           TEXT[] DEFAULT '{}',
  service_radius_km        INT,
  crew_size                INT,
  bonding_capacity_usd     NUMERIC(14,2),
  banking_last4            TEXT,

  -- account linkage
  auth_user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at               TIMESTAMPTZ,
  upgrade_invited_at       TIMESTAMPTZ,
  upgraded_at              TIMESTAMPTZ,

  -- audit (originating GC)
  created_by_gc_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- soft delete
  deleted_at               TIMESTAMPTZ,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sub_org_tax_id_unique UNIQUE (country_code, tax_id_type, tax_id)
);

CREATE INDEX IF NOT EXISTS idx_sub_org_tax_id
  ON public.sub_organizations (country_code, tax_id_type, tax_id);
CREATE INDEX IF NOT EXISTS idx_sub_org_email
  ON public.sub_organizations (lower(primary_email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_org_auth_user_unique
  ON public.sub_organizations (auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sub_org_claimed
  ON public.sub_organizations (claimed_at) WHERE claimed_at IS NOT NULL;

-- =====================================================================
-- 2. SUB_ORG_CONTACTS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.sub_org_contacts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_organization_id      UUID NOT NULL REFERENCES public.sub_organizations(id) ON DELETE CASCADE,
  full_name                TEXT NOT NULL,
  role                     TEXT,
  email                    TEXT,
  phone                    TEXT,
  is_primary               BOOLEAN DEFAULT false,
  is_signer                BOOLEAN DEFAULT false,
  created_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_contacts_org
  ON public.sub_org_contacts (sub_organization_id);

-- =====================================================================
-- 3. COMPLIANCE_DOC_TYPES — catalog (US + BR seeds)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.compliance_doc_types (
  code                     TEXT PRIMARY KEY,
  display_name_en          TEXT NOT NULL,
  display_name_es          TEXT,
  display_name_pt          TEXT,
  category                 TEXT NOT NULL,
  country_code             TEXT NOT NULL,
  state_code               TEXT,
  has_expiry               BOOLEAN DEFAULT true,
  typical_validity_days    INT,
  required_endorsements    TEXT[] DEFAULT '{}',
  description_md           TEXT,
  created_at               TIMESTAMPTZ DEFAULT now()
);

-- US seeds
INSERT INTO public.compliance_doc_types (code, display_name_en, display_name_es, display_name_pt, category, country_code, has_expiry, typical_validity_days, required_endorsements, description_md) VALUES
  ('w9',                'IRS Form W-9',                              'Formulario W-9',                       'Formulário W-9',                          'tax',       'US', false, NULL, '{}',                       'Required to issue 1099 forms.'),
  ('coi_gl',            'Certificate of Insurance — General Liability','COI — Responsabilidad Civil General','COI — Responsabilidade Civil Geral',     'insurance', 'US', true,  365,  '{CG2010,CG2037}',         'GL minimum $1M/$2M typical.'),
  ('coi_wc',            'Certificate of Insurance — Workers Comp',   'COI — Compensación al Trabajador',     'COI — Acidentes de Trabalho',             'insurance', 'US', true,  365,  '{}',                       'Statutory limits in state of work.'),
  ('coi_auto',          'Certificate of Insurance — Commercial Auto','COI — Auto Comercial',                 'COI — Auto Comercial',                    'insurance', 'US', true,  365,  '{}',                       'Combined single limit $1M typical.'),
  ('coi_umbrella',      'Certificate of Insurance — Umbrella',       'COI — Cobertura Sombrilla',            'COI — Cobertura Guarda-chuva',            'insurance', 'US', true,  365,  '{}',                       'Excess liability coverage.'),
  ('ai_endorsement',    'Additional Insured Endorsement',            'Endoso Asegurado Adicional',           'Endosso Adicional Segurado',              'insurance', 'US', true,  365,  '{CG2010,CG2037}',         'Names GC as additional insured per project.'),
  ('waiver_subrogation','Waiver of Subrogation',                     'Renuncia de Subrogación',              'Renúncia de Sub-rogação',                 'insurance', 'US', true,  365,  '{CG2404}',                'Sub insurer cannot subrogate against GC.'),
  ('license_state',     'State Contractor License',                  'Licencia Estatal de Contratista',      'Licença Estadual de Contratante',         'license',   'US', true,  730,  '{}',                       'State-issued contractor license.'),
  ('license_business',  'Business License',                          'Licencia de Negocio',                  'Alvará de Funcionamento',                 'license',   'US', true,  365,  '{}',                       'City or county business license.'),
  ('drug_policy',       'Drug & Alcohol Testing Policy',             'Política de Pruebas de Drogas',        'Política Antidrogas',                     'safety',    'US', true,  365,  '{}',                       'Written drug testing policy.'),
  ('msa',               'Master Subcontract Agreement',              'Contrato Marco de Subcontratista',     'Acordo Marco de Subcontratação',          'contract',  'US', false, NULL, '{}',                       'One-time master agreement covering future Work Orders.')
ON CONFLICT (code) DO NOTHING;

-- BR seeds
INSERT INTO public.compliance_doc_types (code, display_name_en, display_name_es, display_name_pt, category, country_code, has_expiry, typical_validity_days, required_endorsements, description_md) VALUES
  ('cnpj_card',         'CNPJ Card',                                 'Tarjeta CNPJ',                         'Cartão CNPJ',                             'tax',       'BR', false, NULL, '{}',                       'Receita Federal CNPJ registration.'),
  ('cnd_inss',          'CND INSS',                                  'CND INSS',                              'CND INSS',                                'tax',       'BR', true,  180,  '{}',                       'Certidão Negativa de Débitos INSS.'),
  ('cnd_fgts',          'CRF FGTS',                                  'CRF FGTS',                              'CRF FGTS',                                'tax',       'BR', true,  180,  '{}',                       'Certificado de Regularidade do FGTS.'),
  ('cnd_federal',       'CND Federal',                               'CND Federal',                           'CND Federal',                             'tax',       'BR', true,  180,  '{}',                       'Certidão Conjunta Federal.'),
  ('cnd_municipal',     'CND Municipal',                             'CND Municipal',                         'CND Municipal',                           'tax',       'BR', true,  180,  '{}',                       'Certidão municipal de débitos.'),
  ('cnd_trabalhista',   'CNDT — Trabalhista',                        'CNDT — Laboral',                        'CNDT — Trabalhista',                      'tax',       'BR', true,  180,  '{}',                       'Certidão Negativa de Débitos Trabalhistas.'),
  ('art_rrt',           'ART/RRT (Eng. Responsibility)',             'ART/RRT (Responsabilidad Técnica)',     'ART/RRT (Responsabilidade Técnica)',     'license',   'BR', false, NULL, '{}',                       'Anotação ou Registro de Responsabilidade Técnica.'),
  ('nr18_program',      'NR-18 Safety Program',                      'Programa de Seguridad NR-18',           'PCMAT NR-18',                             'safety',    'BR', true,  365,  '{}',                       'Programa de Condições e Meio Ambiente de Trabalho.')
ON CONFLICT (code) DO NOTHING;

-- =====================================================================
-- 4. COMPLIANCE_DOCUMENTS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.compliance_documents (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_organization_id      UUID NOT NULL REFERENCES public.sub_organizations(id) ON DELETE CASCADE,

  doc_type                 TEXT NOT NULL REFERENCES public.compliance_doc_types(code),
  doc_subtype              TEXT,

  file_url                 TEXT NOT NULL,
  file_name                TEXT,
  file_mime                TEXT,
  file_size_bytes          INT,

  issuer                   TEXT,
  policy_number            TEXT,
  issued_at                DATE,
  effective_at             DATE,
  expires_at               DATE,

  coverage_limits          JSONB,
  endorsements             TEXT[] DEFAULT '{}',
  named_insureds           TEXT[] DEFAULT '{}',

  verification_status      TEXT NOT NULL DEFAULT 'unverified'
                           CHECK (verification_status IN ('unverified','self_attested','verified','rejected')),
  verified_at              TIMESTAMPTZ,
  verified_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verification_method      TEXT,
  rejection_reason         TEXT,

  status                   TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','superseded','revoked','expired')),
  superseded_by            UUID REFERENCES public.compliance_documents(id) ON DELETE SET NULL,

  uploaded_by              UUID,
  uploaded_via             TEXT CHECK (uploaded_via IN ('gc_upload','sub_portal','sub_email','api','migration')),
  uploaded_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  notes                    TEXT
);

CREATE INDEX IF NOT EXISTS idx_compliance_org
  ON public.compliance_documents (sub_organization_id, status);
CREATE INDEX IF NOT EXISTS idx_compliance_expiry
  ON public.compliance_documents (expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_compliance_type
  ON public.compliance_documents (sub_organization_id, doc_type, status);

-- =====================================================================
-- 5. COMPLIANCE_POLICIES — per-GC required-doc rules
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.compliance_policies (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gc_user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type                 TEXT NOT NULL REFERENCES public.compliance_doc_types(code),
  enforcement              TEXT NOT NULL DEFAULT 'block'
                           CHECK (enforcement IN ('off','warn','block')),
  applies_when             TEXT NOT NULL DEFAULT 'always'
                           CHECK (applies_when IN ('always','prevailing_wage','public_only','state_match')),
  min_coverage             JSONB,
  required_endorsements    TEXT[] DEFAULT '{}',
  warning_lead_days        INT NOT NULL DEFAULT 30,
  created_at               TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT compliance_policy_unique UNIQUE (gc_user_id, doc_type)
);

CREATE INDEX IF NOT EXISTS idx_compliance_policies_gc
  ON public.compliance_policies (gc_user_id);

-- =====================================================================
-- 6. SUB_ENGAGEMENTS — sub × GC × project
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.sub_engagements (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_organization_id      UUID NOT NULL REFERENCES public.sub_organizations(id) ON DELETE RESTRICT,
  gc_user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id               UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  trade                    TEXT NOT NULL,
  scope_summary            TEXT,
  contract_amount          NUMERIC(14,2),
  retention_pct            NUMERIC(5,2) DEFAULT 0.00,

  payment_terms            TEXT NOT NULL DEFAULT 'net_30'
                           CHECK (payment_terms IN ('fifty_fifty','milestones','net_30','custom')),
  payment_terms_notes      TEXT,

  status                   TEXT NOT NULL DEFAULT 'invited'
                           CHECK (status IN (
                             'invited','bidding','awarded','contracted',
                             'mobilized','in_progress','substantially_complete',
                             'closed_out','cancelled')),

  invited_at               TIMESTAMPTZ,
  awarded_at               TIMESTAMPTZ,
  contracted_at            TIMESTAMPTZ,
  mobilized_at             TIMESTAMPTZ,
  completed_at             TIMESTAMPTZ,
  closed_out_at            TIMESTAMPTZ,
  cancelled_at             TIMESTAMPTZ,

  created_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT engagement_unique UNIQUE (sub_organization_id, project_id, trade)
);

CREATE INDEX IF NOT EXISTS idx_engage_project ON public.sub_engagements (project_id);
CREATE INDEX IF NOT EXISTS idx_engage_sub ON public.sub_engagements (sub_organization_id);
CREATE INDEX IF NOT EXISTS idx_engage_gc ON public.sub_engagements (gc_user_id, status);

-- =====================================================================
-- 7. ENGAGEMENT_COMPLIANCE_LINKS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.engagement_compliance_links (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id            UUID NOT NULL REFERENCES public.sub_engagements(id) ON DELETE CASCADE,
  compliance_doc_id        UUID NOT NULL REFERENCES public.compliance_documents(id) ON DELETE RESTRICT,
  link_type                TEXT NOT NULL DEFAULT 'auto_published'
                           CHECK (link_type IN ('auto_published','project_specific')),
  created_at               TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT engagement_compliance_unique UNIQUE (engagement_id, compliance_doc_id)
);

CREATE INDEX IF NOT EXISTS idx_engage_compliance_links_engage
  ON public.engagement_compliance_links (engagement_id);

-- =====================================================================
-- 8. SUBCONTRACTS — MSA / Work Order / Change Order
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.subcontracts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_type            TEXT NOT NULL CHECK (contract_type IN ('msa','work_order','change_order')),
  sub_organization_id      UUID REFERENCES public.sub_organizations(id) ON DELETE CASCADE,
  gc_user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  engagement_id            UUID REFERENCES public.sub_engagements(id) ON DELETE CASCADE,
  parent_contract_id       UUID REFERENCES public.subcontracts(id) ON DELETE SET NULL,

  title                    TEXT NOT NULL,
  body_md                  TEXT,
  total_amount             NUMERIC(14,2),

  esign_request_id         TEXT,
  status                   TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','sent','signed_by_sub','fully_executed','declined','voided')),
  sent_at                  TIMESTAMPTZ,
  signed_at                TIMESTAMPTZ,
  fully_executed_at        TIMESTAMPTZ,
  pdf_url                  TEXT,

  created_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subcontracts_engage
  ON public.subcontracts (engagement_id, contract_type);
CREATE INDEX IF NOT EXISTS idx_subcontracts_msa
  ON public.subcontracts (sub_organization_id, gc_user_id) WHERE contract_type = 'msa';

-- =====================================================================
-- 9. SUB_ACTION_TOKENS — single-use magic links
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.sub_action_tokens (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_organization_id      UUID NOT NULL REFERENCES public.sub_organizations(id) ON DELETE CASCADE,

  token_hash               TEXT NOT NULL,
  scope                    TEXT NOT NULL CHECK (scope IN (
                             'upload_doc','sign_contract','submit_bid',
                             'upgrade_invite','signup_invite','first_claim'
                           )),

  -- scoped context (any may be NULL)
  engagement_id            UUID REFERENCES public.sub_engagements(id) ON DELETE CASCADE,
  subcontract_id           UUID REFERENCES public.subcontracts(id) ON DELETE CASCADE,
  bid_request_id           UUID,  -- FK added below after bid_requests created
  doc_type_requested       TEXT REFERENCES public.compliance_doc_types(code),

  expires_at               TIMESTAMPTZ NOT NULL,
  used_at                  TIMESTAMPTZ,

  created_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_tokens_org
  ON public.sub_action_tokens (sub_organization_id, scope);
CREATE INDEX IF NOT EXISTS idx_sub_tokens_expires
  ON public.sub_action_tokens (expires_at) WHERE used_at IS NULL;

-- =====================================================================
-- 10. BID_REQUESTS + INVITATIONS + BIDS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.bid_requests (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gc_user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id               UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  trade                    TEXT NOT NULL,
  scope_summary            TEXT NOT NULL,
  plans_url                TEXT,
  due_at                   TIMESTAMPTZ,
  payment_terms            TEXT NOT NULL DEFAULT 'net_30',
  payment_terms_notes      TEXT,
  required_doc_types       TEXT[] DEFAULT '{}',

  status                   TEXT NOT NULL DEFAULT 'open'
                           CHECK (status IN ('draft','open','closed','awarded','cancelled')),
  awarded_bid_id           UUID,  -- FK added after sub_bids created
  awarded_at               TIMESTAMPTZ,

  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bid_requests_project
  ON public.bid_requests (project_id, status);
CREATE INDEX IF NOT EXISTS idx_bid_requests_gc
  ON public.bid_requests (gc_user_id, status);

CREATE TABLE IF NOT EXISTS public.bid_request_invitations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_request_id           UUID NOT NULL REFERENCES public.bid_requests(id) ON DELETE CASCADE,
  sub_organization_id      UUID NOT NULL REFERENCES public.sub_organizations(id) ON DELETE CASCADE,
  invited_at               TIMESTAMPTZ DEFAULT now(),
  invited_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT bid_invite_unique UNIQUE (bid_request_id, sub_organization_id)
);

CREATE INDEX IF NOT EXISTS idx_bid_invites_request
  ON public.bid_request_invitations (bid_request_id);
CREATE INDEX IF NOT EXISTS idx_bid_invites_sub
  ON public.bid_request_invitations (sub_organization_id);

CREATE TABLE IF NOT EXISTS public.sub_bids (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_request_id           UUID NOT NULL REFERENCES public.bid_requests(id) ON DELETE CASCADE,
  sub_organization_id      UUID NOT NULL REFERENCES public.sub_organizations(id) ON DELETE CASCADE,

  amount                   NUMERIC(14,2) NOT NULL,
  timeline_days            INT,
  exclusions               TEXT,
  alternates               TEXT,
  notes                    TEXT,

  status                   TEXT NOT NULL DEFAULT 'submitted'
                           CHECK (status IN ('draft','submitted','withdrawn','accepted','declined')),
  submitted_at             TIMESTAMPTZ DEFAULT now(),
  decided_at               TIMESTAMPTZ,

  CONSTRAINT sub_bid_unique UNIQUE (bid_request_id, sub_organization_id)
);

CREATE INDEX IF NOT EXISTS idx_sub_bids_request
  ON public.sub_bids (bid_request_id, status);
CREATE INDEX IF NOT EXISTS idx_sub_bids_sub
  ON public.sub_bids (sub_organization_id, status);

-- Now add deferred FKs
ALTER TABLE public.sub_action_tokens
  ADD CONSTRAINT fk_sub_action_tokens_bid_request
  FOREIGN KEY (bid_request_id) REFERENCES public.bid_requests(id) ON DELETE CASCADE;

ALTER TABLE public.bid_requests
  ADD CONSTRAINT fk_bid_requests_awarded
  FOREIGN KEY (awarded_bid_id) REFERENCES public.sub_bids(id) ON DELETE SET NULL;

-- =====================================================================
-- 11. SUB_INVOICES + lines
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.sub_invoices (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id            UUID NOT NULL REFERENCES public.sub_engagements(id) ON DELETE CASCADE,
  invoice_number           TEXT,

  total_amount             NUMERIC(14,2) NOT NULL,
  retention_amount         NUMERIC(14,2) DEFAULT 0.00,
  net_amount               NUMERIC(14,2),

  period_start             DATE,
  period_end               DATE,
  due_at                   DATE,

  status                   TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','sent','approved','rejected','paid','partial_paid','void')),
  notes                    TEXT,
  pdf_url                  TEXT,

  submitted_at             TIMESTAMPTZ,
  approved_at              TIMESTAMPTZ,
  paid_at                  TIMESTAMPTZ,
  rejected_at              TIMESTAMPTZ,
  rejection_reason         TEXT,

  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_invoices_engage
  ON public.sub_invoices (engagement_id, status);

CREATE TABLE IF NOT EXISTS public.sub_invoice_lines (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_invoice_id           UUID NOT NULL REFERENCES public.sub_invoices(id) ON DELETE CASCADE,
  line_number              INT NOT NULL,
  description              TEXT NOT NULL,
  quantity                 NUMERIC(14,3) DEFAULT 1,
  unit_price               NUMERIC(14,2),
  amount                   NUMERIC(14,2) NOT NULL,
  CONSTRAINT sub_invoice_line_order_unique UNIQUE (sub_invoice_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_sub_invoice_lines_inv
  ON public.sub_invoice_lines (sub_invoice_id);

-- =====================================================================
-- 12. PAYMENT_RECORDS + PAYMENT_MILESTONES
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.payment_records (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id            UUID NOT NULL REFERENCES public.sub_engagements(id) ON DELETE CASCADE,
  sub_invoice_id           UUID REFERENCES public.sub_invoices(id) ON DELETE SET NULL,
  milestone_id             UUID,  -- FK after payment_milestones created

  amount                   NUMERIC(14,2) NOT NULL,
  paid_at                  DATE NOT NULL,
  method                   TEXT CHECK (method IN ('check','ach','zelle','venmo','wire','cash','other')),
  reference                TEXT,
  notes                    TEXT,

  recorded_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_records_engage
  ON public.payment_records (engagement_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_invoice
  ON public.payment_records (sub_invoice_id) WHERE sub_invoice_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_milestones (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id            UUID NOT NULL REFERENCES public.sub_engagements(id) ON DELETE CASCADE,
  milestone_number         INT NOT NULL,
  description              TEXT NOT NULL,
  pct_of_contract          NUMERIC(5,2),
  amount                   NUMERIC(14,2),
  due_at                   DATE,
  completed_at             TIMESTAMPTZ,
  paid_at                  TIMESTAMPTZ,
  CONSTRAINT payment_milestone_unique UNIQUE (engagement_id, milestone_number)
);

CREATE INDEX IF NOT EXISTS idx_payment_milestones_engage
  ON public.payment_milestones (engagement_id);

ALTER TABLE public.payment_records
  ADD CONSTRAINT fk_payment_records_milestone
  FOREIGN KEY (milestone_id) REFERENCES public.payment_milestones(id) ON DELETE SET NULL;

-- =====================================================================
-- 13. NOTIFICATIONS — extend type enum
-- =====================================================================
-- The existing notifications table has a CHECK constraint on type.
-- Drop and re-add with sub-related events included.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    -- existing pre-migration types (20260224 + 20260226 + earlier):
    'appointment_reminder',
    'daily_report_submitted',
    'project_warning',
    'financial_update',
    'worker_update',
    'system',
    'bank_reconciliation',
    'task_update',
    -- sub-module additions:
    'sub_doc_uploaded',
    'sub_doc_expiring',
    'sub_doc_expired',
    'sub_doc_requested',
    'sub_bid_invitation',
    'sub_bid_submitted',
    'sub_bid_accepted',
    'sub_bid_declined',
    'sub_contract_sent',
    'sub_contract_signed',
    'sub_invoice_sent',
    'sub_payment_received',
    'sub_engagement_status_changed',
    'sub_upgrade_invite'
  ));

-- =====================================================================
-- 14. STORAGE BUCKET — compliance-documents (private)
-- =====================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('compliance-documents', 'compliance-documents', false)
ON CONFLICT (id) DO NOTHING;

-- All access goes through backend service-role; deny direct client access.
-- (No SELECT/INSERT/UPDATE/DELETE policies on storage.objects for this bucket
--  means PostgREST/JS clients are denied; service-role bypasses RLS.)

-- =====================================================================
-- 15. RLS — enable on all new tables
-- =====================================================================

ALTER TABLE public.sub_organizations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_org_contacts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_doc_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_policies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_engagements             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_compliance_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontracts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_action_tokens           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_requests                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_request_invitations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_bids                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_invoices                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_invoice_lines           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_milestones          ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 15a. RLS — sub_organizations
-- =====================================================================
-- Public directory fields (legal_name, dba, trades, service_states) are
-- intended to be searchable by GCs, but the app-layer view explicitly
-- whitelists those columns. The full row is gated:
--   - The sub themselves (auth_user_id matches)
--   - GCs who created the record
--   - GCs with an active engagement with this sub

DROP POLICY IF EXISTS sub_org_self_rw ON public.sub_organizations;
CREATE POLICY sub_org_self_rw ON public.sub_organizations FOR ALL
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS sub_org_gc_creator_rw ON public.sub_organizations;
CREATE POLICY sub_org_gc_creator_rw ON public.sub_organizations FOR ALL
  USING (created_by_gc_user_id = auth.uid())
  WITH CHECK (created_by_gc_user_id = auth.uid());

DROP POLICY IF EXISTS sub_org_gc_engaged_read ON public.sub_organizations;
CREATE POLICY sub_org_gc_engaged_read ON public.sub_organizations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.sub_engagements e
    WHERE e.sub_organization_id = sub_organizations.id
      AND e.gc_user_id = auth.uid()
      AND e.status <> 'cancelled'
  ));

-- =====================================================================
-- 15b. RLS — sub_org_contacts
-- =====================================================================

DROP POLICY IF EXISTS sub_contacts_inherit_org ON public.sub_org_contacts;
CREATE POLICY sub_contacts_inherit_org ON public.sub_org_contacts FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.sub_organizations s
    WHERE s.id = sub_org_contacts.sub_organization_id
      AND (
        s.auth_user_id = auth.uid()
        OR s.created_by_gc_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.sub_engagements e
          WHERE e.sub_organization_id = s.id
            AND e.gc_user_id = auth.uid()
            AND e.status <> 'cancelled'
        )
      )
  ));

-- =====================================================================
-- 15c. RLS — compliance_doc_types (catalog — public read)
-- =====================================================================

DROP POLICY IF EXISTS compliance_doc_types_read ON public.compliance_doc_types;
CREATE POLICY compliance_doc_types_read ON public.compliance_doc_types FOR SELECT
  USING (true);

-- =====================================================================
-- 15d. RLS — compliance_documents
-- =====================================================================

DROP POLICY IF EXISTS compliance_docs_self ON public.compliance_documents;
CREATE POLICY compliance_docs_self ON public.compliance_documents FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.sub_organizations s
    WHERE s.id = compliance_documents.sub_organization_id
      AND s.auth_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sub_organizations s
    WHERE s.id = compliance_documents.sub_organization_id
      AND s.auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS compliance_docs_gc_engaged ON public.compliance_documents;
CREATE POLICY compliance_docs_gc_engaged ON public.compliance_documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.sub_engagements e
    WHERE e.sub_organization_id = compliance_documents.sub_organization_id
      AND e.gc_user_id = auth.uid()
      AND e.status <> 'cancelled'
  ));

DROP POLICY IF EXISTS compliance_docs_gc_creator ON public.compliance_documents;
CREATE POLICY compliance_docs_gc_creator ON public.compliance_documents FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.sub_organizations s
    WHERE s.id = compliance_documents.sub_organization_id
      AND s.created_by_gc_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sub_organizations s
    WHERE s.id = compliance_documents.sub_organization_id
      AND s.created_by_gc_user_id = auth.uid()
  ));

-- =====================================================================
-- 15e. RLS — compliance_policies (GC-owned)
-- =====================================================================

DROP POLICY IF EXISTS compliance_policies_gc ON public.compliance_policies;
CREATE POLICY compliance_policies_gc ON public.compliance_policies FOR ALL
  USING (gc_user_id = auth.uid())
  WITH CHECK (gc_user_id = auth.uid());

-- =====================================================================
-- 15f. RLS — sub_engagements
-- =====================================================================

DROP POLICY IF EXISTS engagements_gc ON public.sub_engagements;
CREATE POLICY engagements_gc ON public.sub_engagements FOR ALL
  USING (gc_user_id = auth.uid())
  WITH CHECK (gc_user_id = auth.uid());

DROP POLICY IF EXISTS engagements_sub_read ON public.sub_engagements;
CREATE POLICY engagements_sub_read ON public.sub_engagements FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.sub_organizations s
    WHERE s.id = sub_engagements.sub_organization_id
      AND s.auth_user_id = auth.uid()
  ));

-- =====================================================================
-- 15g. RLS — engagement_compliance_links (inherit from engagement)
-- =====================================================================

DROP POLICY IF EXISTS engagement_compliance_links_inherit ON public.engagement_compliance_links;
CREATE POLICY engagement_compliance_links_inherit ON public.engagement_compliance_links FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.sub_engagements e
    WHERE e.id = engagement_compliance_links.engagement_id
      AND (
        e.gc_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.sub_organizations s
          WHERE s.id = e.sub_organization_id AND s.auth_user_id = auth.uid()
        )
      )
  ));

-- =====================================================================
-- 15h. RLS — subcontracts (inherit from engagement)
-- =====================================================================

DROP POLICY IF EXISTS subcontracts_gc ON public.subcontracts;
CREATE POLICY subcontracts_gc ON public.subcontracts FOR ALL
  USING (gc_user_id = auth.uid())
  WITH CHECK (gc_user_id = auth.uid());

DROP POLICY IF EXISTS subcontracts_sub_read ON public.subcontracts;
CREATE POLICY subcontracts_sub_read ON public.subcontracts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.sub_organizations s
    WHERE s.id = subcontracts.sub_organization_id
      AND s.auth_user_id = auth.uid()
  ));

-- =====================================================================
-- 15i. RLS — sub_action_tokens (service-role only; deny client access)
-- =====================================================================
-- No policies = no client access. Backend uses service-role to read/write.

-- =====================================================================
-- 15j. RLS — bid_requests
-- =====================================================================

DROP POLICY IF EXISTS bid_requests_gc ON public.bid_requests;
CREATE POLICY bid_requests_gc ON public.bid_requests FOR ALL
  USING (gc_user_id = auth.uid())
  WITH CHECK (gc_user_id = auth.uid());

DROP POLICY IF EXISTS bid_requests_invited_sub_read ON public.bid_requests;
CREATE POLICY bid_requests_invited_sub_read ON public.bid_requests FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.bid_request_invitations i
    JOIN public.sub_organizations s ON s.id = i.sub_organization_id
    WHERE i.bid_request_id = bid_requests.id
      AND s.auth_user_id = auth.uid()
  ));

-- =====================================================================
-- 15k. RLS — bid_request_invitations
-- =====================================================================

DROP POLICY IF EXISTS bid_invites_gc ON public.bid_request_invitations;
CREATE POLICY bid_invites_gc ON public.bid_request_invitations FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.bid_requests br
    WHERE br.id = bid_request_invitations.bid_request_id
      AND br.gc_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bid_requests br
    WHERE br.id = bid_request_invitations.bid_request_id
      AND br.gc_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS bid_invites_sub_read ON public.bid_request_invitations;
CREATE POLICY bid_invites_sub_read ON public.bid_request_invitations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.sub_organizations s
    WHERE s.id = bid_request_invitations.sub_organization_id
      AND s.auth_user_id = auth.uid()
  ));

-- =====================================================================
-- 15l. RLS — sub_bids
-- =====================================================================

DROP POLICY IF EXISTS sub_bids_sub ON public.sub_bids;
CREATE POLICY sub_bids_sub ON public.sub_bids FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.sub_organizations s
    WHERE s.id = sub_bids.sub_organization_id
      AND s.auth_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sub_organizations s
    WHERE s.id = sub_bids.sub_organization_id
      AND s.auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS sub_bids_gc_read ON public.sub_bids;
CREATE POLICY sub_bids_gc_read ON public.sub_bids FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.bid_requests br
    WHERE br.id = sub_bids.bid_request_id
      AND br.gc_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS sub_bids_gc_decide ON public.sub_bids;
CREATE POLICY sub_bids_gc_decide ON public.sub_bids FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.bid_requests br
    WHERE br.id = sub_bids.bid_request_id
      AND br.gc_user_id = auth.uid()
  ));

-- =====================================================================
-- 15m. RLS — sub_invoices + lines
-- =====================================================================

DROP POLICY IF EXISTS sub_invoices_engagement_parties ON public.sub_invoices;
CREATE POLICY sub_invoices_engagement_parties ON public.sub_invoices FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.sub_engagements e
    WHERE e.id = sub_invoices.engagement_id
      AND (
        e.gc_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.sub_organizations s
          WHERE s.id = e.sub_organization_id AND s.auth_user_id = auth.uid()
        )
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sub_engagements e
    WHERE e.id = sub_invoices.engagement_id
      AND (
        e.gc_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.sub_organizations s
          WHERE s.id = e.sub_organization_id AND s.auth_user_id = auth.uid()
        )
      )
  ));

DROP POLICY IF EXISTS sub_invoice_lines_inherit ON public.sub_invoice_lines;
CREATE POLICY sub_invoice_lines_inherit ON public.sub_invoice_lines FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.sub_invoices i
    JOIN public.sub_engagements e ON e.id = i.engagement_id
    WHERE i.id = sub_invoice_lines.sub_invoice_id
      AND (
        e.gc_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.sub_organizations s
          WHERE s.id = e.sub_organization_id AND s.auth_user_id = auth.uid()
        )
      )
  ));

-- =====================================================================
-- 15n. RLS — payment_records + payment_milestones
-- =====================================================================

DROP POLICY IF EXISTS payment_records_engagement_parties ON public.payment_records;
CREATE POLICY payment_records_engagement_parties ON public.payment_records FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.sub_engagements e
    WHERE e.id = payment_records.engagement_id
      AND (
        e.gc_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.sub_organizations s
          WHERE s.id = e.sub_organization_id AND s.auth_user_id = auth.uid()
        )
      )
  ));

DROP POLICY IF EXISTS payment_milestones_engagement_parties ON public.payment_milestones;
CREATE POLICY payment_milestones_engagement_parties ON public.payment_milestones FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.sub_engagements e
    WHERE e.id = payment_milestones.engagement_id
      AND (
        e.gc_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.sub_organizations s
          WHERE s.id = e.sub_organization_id AND s.auth_user_id = auth.uid()
        )
      )
  ));

-- =====================================================================
-- 16. UPDATED_AT TRIGGERS
-- =====================================================================

DROP TRIGGER IF EXISTS update_sub_organizations_updated_at ON public.sub_organizations;
CREATE TRIGGER update_sub_organizations_updated_at
  BEFORE UPDATE ON public.sub_organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sub_engagements_updated_at ON public.sub_engagements;
CREATE TRIGGER update_sub_engagements_updated_at
  BEFORE UPDATE ON public.sub_engagements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bid_requests_updated_at ON public.bid_requests;
CREATE TRIGGER update_bid_requests_updated_at
  BEFORE UPDATE ON public.bid_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sub_invoices_updated_at ON public.sub_invoices;
CREATE TRIGGER update_sub_invoices_updated_at
  BEFORE UPDATE ON public.sub_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- 17. SEED — default compliance policies for every existing GC owner
-- =====================================================================

INSERT INTO public.compliance_policies (gc_user_id, doc_type, enforcement, warning_lead_days, min_coverage)
SELECT p.id, 'w9', 'block', 30, NULL
FROM public.profiles p
WHERE p.role = 'owner'
ON CONFLICT (gc_user_id, doc_type) DO NOTHING;

INSERT INTO public.compliance_policies (gc_user_id, doc_type, enforcement, warning_lead_days, min_coverage, required_endorsements)
SELECT p.id, 'coi_gl', 'block', 30,
       jsonb_build_object('each_occurrence', 1000000, 'aggregate', 2000000),
       ARRAY['CG2010']::TEXT[]
FROM public.profiles p
WHERE p.role = 'owner'
ON CONFLICT (gc_user_id, doc_type) DO NOTHING;

INSERT INTO public.compliance_policies (gc_user_id, doc_type, enforcement, warning_lead_days)
SELECT p.id, 'coi_wc', 'block', 30
FROM public.profiles p
WHERE p.role = 'owner'
ON CONFLICT (gc_user_id, doc_type) DO NOTHING;

INSERT INTO public.compliance_policies (gc_user_id, doc_type, enforcement, warning_lead_days)
SELECT p.id, 'license_state', 'warn', 30
FROM public.profiles p
WHERE p.role = 'owner'
ON CONFLICT (gc_user_id, doc_type) DO NOTHING;

-- =====================================================================
-- 18. BACKFILL — auto-pair every existing owner with a sub_organizations row
-- =====================================================================
-- This gives pure GCs a "sub identity" out of the box so the universal
-- "My Compliance" UI works for them, AND so EIN dedup catches the inverse
-- case (a GC who later gets hired as a sub by another GC).

INSERT INTO public.sub_organizations (
  legal_name, primary_email, primary_phone, country_code, tax_id_type, auth_user_id, claimed_at
)
SELECT
  COALESCE(NULLIF(TRIM(p.business_name), ''), au.email, 'Unnamed Owner'),
  COALESCE(NULLIF(TRIM(p.business_email), ''), au.email, p.id::text || '@unknown.local'),
  COALESCE(NULLIF(TRIM(p.business_phone), ''), p.business_phone_number),
  'US',
  'none',
  p.id,
  now()
FROM public.profiles p
JOIN auth.users au ON au.id = p.id
WHERE p.role = 'owner'
  AND NOT EXISTS (
    SELECT 1 FROM public.sub_organizations s WHERE s.auth_user_id = p.id
  );

-- =====================================================================
-- DONE
-- =====================================================================
-- Phase A complete. Next: Phase B (services + routes).

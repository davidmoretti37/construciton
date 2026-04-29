# Subcontractor Module — Full Design

Full plan for a shared, cross-GC subcontractor system in Sylk. Built on the research in `SUBCONTRACTOR_RESEARCH.md`. Scope: US-first, Brazil-ready. Access pattern: global sub profiles + GC-scoped grants (Option 1 from chat — the moat).

---

## 0 — One-page mental model

```
┌─────────────────────────────────────────────────────────────────┐
│                    SYLK SUBCONTRACTOR NETWORK                    │
│                                                                  │
│  ┌──────────────────┐         ┌──────────────────┐              │
│  │ sub_organization │  many   │     companies    │              │
│  │  (Mike's Plumb)  │◄───────►│ (Davis, Joe, …)  │              │
│  │   GLOBAL         │  via    │  (GCs — exist)   │              │
│  │   one per EIN    │ grants  │                  │              │
│  └────────┬─────────┘         └────────┬─────────┘              │
│           │                            │                         │
│           │ vault                      │ projects                │
│           ▼                            ▼                         │
│  ┌──────────────────┐         ┌──────────────────┐              │
│  │  compliance_     │         │     projects     │              │
│  │  documents       │         │                  │              │
│  │ (COI, W9, lic…)  │         └────────┬─────────┘              │
│  └──────────────────┘                  │                         │
│           │                            │                         │
│           │   feeds                    │                         │
│           ▼                            ▼                         │
│  ┌──────────────────────────────────────────┐                  │
│  │   sub_engagements                         │                  │
│  │   (sub × GC × project — the work unit)    │                  │
│  └────────┬──────────────────────────────────┘                  │
│           │                                                      │
│           ├─► subcontracts (MSA + per-project Work Orders)      │
│           ├─► pay_apps (monthly draws)                          │
│           ├─► lien_waivers (4 types per draw)                   │
│           ├─► change_orders                                     │
│           ├─► preliminary_notices (state-aware)                 │
│           └─► closeout_packages                                 │
└─────────────────────────────────────────────────────────────────┘
```

**The four laws this design follows:**

1. **A sub is one entity in the world.** EIN/CNPJ is the deduplication key. One sub = one row, regardless of how many GCs they work with.
2. **Documents live on the sub, not on the project.** A COI is the sub's. A signed Work Order is the project's. Don't mix.
3. **The work unit is the engagement (sub × GC × project).** Pay apps, change orders, waivers all attach to engagements.
4. **Every payment is gated by computed compliance.** Compliance is derived state, never stored — recomputed on read so it can never be stale.

---

## 1 — Identity & ownership model

### Three actor types

| Actor | Has app account? | Auth mechanism | Lives in |
|---|---|---|---|
| **GC owner / supervisor** | Yes | Supabase auth.users | `profiles` (existing) |
| **GC employee (worker)** | Yes | Supabase auth.users | `workers` (existing) |
| **Subcontractor** | Optional | Magic-link vault token; can claim later | `sub_organizations` (new) |

### Sub identity & dedup

When a GC adds a sub:

1. GC enters: legal name, email, phone, trade(s), tax ID (EIN/CNPJ).
2. System checks `sub_organizations` for matching tax ID.
3. **Match found** → create `sub_gc_grants` row with `status=pending` (sub must approve). GC sees "This sub is already on Sylk; we've requested access."
4. **No match** → create new `sub_organizations` row with `claimed=false`. Auto-grant the inviting GC. Email magic link to sub.

This dedup is the network effect. Without it, the model collapses to per-GC silos.

### Claim flow

A sub_organization starts unclaimed (created by a GC). The first time the sub clicks their magic link and completes their vault setup, `claimed_at` is set and `auth_user_id` may be linked if they sign up. Until claimed, the inviting GC can edit the sub's basic info; after claimed, the sub controls their own profile.

---

## 2 — Full schema (DDL)

All tables under `public` schema with RLS enabled. Migration file: `YYYYMMDD_subcontractor_module.sql`.

### 2.1 sub_organizations (the global sub identity)

```sql
CREATE TABLE public.sub_organizations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- identity
  legal_name          TEXT NOT NULL,
  dba                 TEXT,
  tax_id              TEXT,                 -- EIN (US) or CNPJ (BR)
  tax_id_type         TEXT NOT NULL DEFAULT 'ein'
                      CHECK (tax_id_type IN ('ein','cnpj','cpf','mei','none')),
  country_code        TEXT NOT NULL DEFAULT 'US' CHECK (length(country_code) = 2),
  entity_type         TEXT,                 -- 'llc','corp','sole_prop','mei','simples', etc.
  year_founded        INT,

  -- contact
  primary_email       TEXT NOT NULL,
  primary_phone       TEXT,
  website             TEXT,

  -- address (HQ)
  address_line1       TEXT,
  address_line2       TEXT,
  city                TEXT,
  state_code          TEXT,                 -- US 2-char or BR 2-char
  postal_code         TEXT,

  -- trades & capacity
  trades              TEXT[] DEFAULT '{}',  -- e.g., ['plumbing','hvac']
  service_states      TEXT[] DEFAULT '{}',
  service_radius_km   INT,
  crew_size           INT,
  bonding_capacity_usd NUMERIC(14,2),
  banking_last4       TEXT,                 -- ACH partial; full info encrypted elsewhere

  -- claim status
  claimed_at          TIMESTAMPTZ,          -- NULL until sub claims their vault
  auth_user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
                                            -- NULLABLE — sub may never sign up
  vault_token_hash    TEXT,                 -- bcrypt of the long-lived vault token

  -- soft delete
  deleted_at          TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sub_org_tax_id_unique UNIQUE (country_code, tax_id_type, tax_id)
);

CREATE INDEX idx_sub_org_tax_id ON sub_organizations (country_code, tax_id_type, tax_id);
CREATE INDEX idx_sub_org_email ON sub_organizations (lower(primary_email));
CREATE INDEX idx_sub_org_claimed ON sub_organizations (claimed_at) WHERE claimed_at IS NOT NULL;
```

### 2.2 sub_org_contacts (multiple humans per sub)

```sql
CREATE TABLE public.sub_org_contacts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_organization_id UUID NOT NULL REFERENCES sub_organizations(id) ON DELETE CASCADE,
  full_name           TEXT NOT NULL,
  role                TEXT,                 -- 'owner','pm','field_super','ap','safety'
  email               TEXT,
  phone               TEXT,
  is_primary          BOOLEAN DEFAULT false,
  is_signer           BOOLEAN DEFAULT false,-- can sign waivers, MSAs
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sub_contacts_org ON sub_org_contacts (sub_organization_id);
```

### 2.3 sub_gc_grants (the network-effect table)

```sql
CREATE TABLE public.sub_gc_grants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_organization_id UUID NOT NULL REFERENCES sub_organizations(id) ON DELETE CASCADE,
  gc_company_id       UUID NOT NULL,        -- references the GC's company (existing model)

  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','active','revoked','blocked')),
  requested_by        UUID REFERENCES auth.users(id),
  approved_at         TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ,
  revoked_reason      TEXT,

  -- per-grant overrides (sub can hide certain docs from a specific GC)
  doc_visibility      JSONB DEFAULT '{"all": true}'::jsonb,
                      -- e.g., {"hide": ["financial_statements"]}

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT grant_unique UNIQUE (sub_organization_id, gc_company_id)
);

CREATE INDEX idx_grants_gc ON sub_gc_grants (gc_company_id, status);
CREATE INDEX idx_grants_sub ON sub_gc_grants (sub_organization_id, status);
```

### 2.4 compliance_documents (the vault — global per sub)

```sql
CREATE TABLE public.compliance_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_organization_id UUID NOT NULL REFERENCES sub_organizations(id) ON DELETE CASCADE,

  doc_type            TEXT NOT NULL,        -- see compliance_doc_types catalog
  doc_subtype         TEXT,                 -- e.g., for COI: 'gl','wc','auto','umbrella'

  -- file
  file_url            TEXT NOT NULL,        -- Supabase Storage path
  file_name           TEXT,
  file_mime           TEXT,
  file_size_bytes     INT,

  -- metadata extracted (or manually entered)
  issuer              TEXT,                 -- broker name / state agency / IRS
  policy_number       TEXT,
  issued_at           DATE,
  effective_at        DATE,
  expires_at          DATE,                 -- NULL for non-expiring docs (W9)

  -- coverage details (for insurance)
  coverage_limits     JSONB,                -- {"each_occurrence":1000000,"aggregate":2000000}
  endorsements        TEXT[] DEFAULT '{}',  -- ['CG2010','CG2037','CG2404','primary_noncontrib']
  named_insureds      TEXT[] DEFAULT '{}',  -- if AI endorsement: who is named

  -- verification
  verification_status TEXT NOT NULL DEFAULT 'unverified'
                      CHECK (verification_status IN ('unverified','self_attested','verified','rejected')),
  verified_at         TIMESTAMPTZ,
  verified_by         UUID REFERENCES auth.users(id),
  verification_method TEXT,                 -- 'manual','broker_api','ai_extracted'
  rejection_reason    TEXT,

  -- lifecycle
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','superseded','revoked','expired')),
  superseded_by       UUID REFERENCES compliance_documents(id),
                      -- doc replacement chain — never overwrite, always supersede

  -- tracking
  uploaded_by         UUID,                 -- could be sub user or GC user
  uploaded_via        TEXT,                 -- 'gc_upload','sub_portal','sub_email','api'
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  notes               TEXT
);

CREATE INDEX idx_compliance_org ON compliance_documents (sub_organization_id, status);
CREATE INDEX idx_compliance_expiry ON compliance_documents (expires_at) WHERE status = 'active';
CREATE INDEX idx_compliance_type ON compliance_documents (sub_organization_id, doc_type, status);
```

### 2.5 compliance_doc_types (catalog)

```sql
CREATE TABLE public.compliance_doc_types (
  code                TEXT PRIMARY KEY,     -- 'w9','coi_gl','coi_wc','license_state', etc.
  display_name_en     TEXT NOT NULL,
  display_name_es     TEXT,
  display_name_pt     TEXT,
  category            TEXT NOT NULL,        -- 'tax','insurance','license','safety','contract'
  country_code        TEXT NOT NULL,        -- 'US','BR','*' for universal
  state_code          TEXT,                 -- if state-specific (e.g., 'CA')
  has_expiry          BOOLEAN DEFAULT true,
  typical_validity_days INT,                -- e.g., COI = 365
  required_endorsements TEXT[] DEFAULT '{}',-- which endorsements expected on this doc type
  description_md      TEXT,                 -- explanation for the sub
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Seed (partial example — full seed in migration):
-- ('w9', 'IRS Form W-9', ..., 'tax', 'US', NULL, false, NULL, '{}', '...')
-- ('coi_gl', 'General Liability COI', ..., 'insurance', 'US', NULL, true, 365, '{CG2010,CG2037}', '...')
-- ('license_ca_b', 'CA Contractor License (Class B)', ..., 'license', 'US', 'CA', true, 730, '{}', '...')
-- ('cnd_inss', 'Certidão Negativa INSS', ..., 'tax', 'BR', NULL, true, 180, '{}', '...')
```

### 2.6 compliance_policies (per-GC required-doc rules)

```sql
CREATE TABLE public.compliance_policies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gc_company_id       UUID NOT NULL,
  doc_type            TEXT NOT NULL REFERENCES compliance_doc_types(code),

  enforcement         TEXT NOT NULL DEFAULT 'block'
                      CHECK (enforcement IN ('off','warn','block')),
                      -- block = cannot pay; warn = banner; off = ignore
  applies_when        TEXT NOT NULL DEFAULT 'always'
                      CHECK (applies_when IN ('always','prevailing_wage','public_only','state_match')),
  min_coverage        JSONB,                -- e.g., {"each_occurrence":1000000}
  required_endorsements TEXT[] DEFAULT '{}',
  warning_lead_days   INT NOT NULL DEFAULT 30,

  created_at          TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT policy_unique UNIQUE (gc_company_id, doc_type)
);
```

Default seed: every GC gets a sensible default policy on signup (W9 required, master COI required with GL ≥ $1M, etc.). Editable in settings.

### 2.7 sub_engagements (the work unit)

```sql
CREATE TABLE public.sub_engagements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_organization_id UUID NOT NULL REFERENCES sub_organizations(id) ON DELETE RESTRICT,
  gc_company_id       UUID NOT NULL,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- scope
  trade               TEXT NOT NULL,
  scope_summary       TEXT,
  contract_amount     NUMERIC(14,2),
  retention_pct       NUMERIC(5,2) DEFAULT 10.00,

  -- lifecycle
  status              TEXT NOT NULL DEFAULT 'invited'
                      CHECK (status IN (
                        'invited','bidding','awarded','contracted',
                        'mobilized','in_progress','substantially_complete',
                        'closed_out','cancelled')),

  -- per-engagement compliance docs (per-project COI etc.)
  -- Note: live in compliance_documents but linked via engagement_compliance_links
  -- We DON'T duplicate the master vault here — see §2.8

  invited_at          TIMESTAMPTZ,
  awarded_at          TIMESTAMPTZ,
  contracted_at       TIMESTAMPTZ,
  mobilized_at        TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  closed_out_at       TIMESTAMPTZ,

  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT engagement_unique UNIQUE (sub_organization_id, project_id, trade)
);

CREATE INDEX idx_engage_project ON sub_engagements (project_id);
CREATE INDEX idx_engage_sub ON sub_engagements (sub_organization_id);
CREATE INDEX idx_engage_gc ON sub_engagements (gc_company_id, status);
```

### 2.8 engagement_compliance_links (per-project doc reuse)

```sql
CREATE TABLE public.engagement_compliance_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id       UUID NOT NULL REFERENCES sub_engagements(id) ON DELETE CASCADE,
  compliance_doc_id   UUID NOT NULL REFERENCES compliance_documents(id) ON DELETE RESTRICT,
  link_type           TEXT NOT NULL DEFAULT 'auto_published'
                      CHECK (link_type IN ('auto_published','project_specific')),
                      -- 'auto_published': global doc shown on this engagement
                      -- 'project_specific': doc only valid for this engagement (per-project COI)
  created_at          TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT link_unique UNIQUE (engagement_id, compliance_doc_id)
);
```

Per-project COI = a `compliance_documents` row with `doc_subtype='coi_per_project'`, linked to ONE engagement via this table. Global master COI = a `compliance_documents` row linked to all active engagements.

### 2.9 subcontracts (MSA + per-project Work Orders)

```sql
CREATE TABLE public.subcontracts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_type       TEXT NOT NULL CHECK (contract_type IN ('msa','work_order','change_order')),

  -- MSA = sub-org × GC, no project
  -- WO  = always tied to engagement
  -- CO  = always tied to engagement
  sub_organization_id UUID REFERENCES sub_organizations(id) ON DELETE CASCADE,
  gc_company_id       UUID NOT NULL,
  engagement_id       UUID REFERENCES sub_engagements(id) ON DELETE CASCADE,
  parent_contract_id  UUID REFERENCES subcontracts(id),  -- WO references MSA, CO references WO

  -- content
  title               TEXT NOT NULL,
  body_template_id    UUID,                 -- references contract_templates
  body_md             TEXT,                 -- rendered template OR free text
  total_amount        NUMERIC(14,2),

  -- signing (uses existing eSignService)
  esign_request_id    TEXT,                 -- ID in your eSignService
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','sent','signed_by_sub','fully_executed','declined','voided')),
  sent_at             TIMESTAMPTZ,
  signed_at           TIMESTAMPTZ,
  fully_executed_at   TIMESTAMPTZ,
  pdf_url             TEXT,

  created_by          UUID,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_subcontracts_engage ON subcontracts (engagement_id, contract_type);
CREATE INDEX idx_subcontracts_msa ON subcontracts (sub_organization_id, gc_company_id) WHERE contract_type = 'msa';
```

### 2.10 pay_apps (sub draws)

```sql
CREATE TABLE public.pay_apps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id       UUID NOT NULL REFERENCES sub_engagements(id) ON DELETE CASCADE,
  draw_number         INT NOT NULL,
  period_start        DATE,
  period_end          DATE,

  -- AIA G702/G703-style
  contract_sum        NUMERIC(14,2),        -- with approved COs
  total_completed     NUMERIC(14,2),
  retention_pct       NUMERIC(5,2),
  retention_amount    NUMERIC(14,2),
  less_previous       NUMERIC(14,2),
  current_due         NUMERIC(14,2) NOT NULL,

  -- compliance gate snapshot at submit time
  compliance_snapshot JSONB,                -- {"coi_gl_ok": true, "license_ok": true, ...}
  compliance_passed   BOOLEAN,
  compliance_blockers TEXT[],               -- ['coi_gl_expired','prior_unconditional_missing']

  status              TEXT NOT NULL DEFAULT 'submitted'
                      CHECK (status IN (
                        'draft','submitted','blocked','under_review',
                        'approved','rejected','paid','void')),
  rejection_reason    TEXT,
  approved_by         UUID,
  approved_at         TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  payment_reference   TEXT,                 -- check #, ACH ID

  submitted_by        UUID,                 -- sub user or sub portal token
  submitted_at        TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT pay_app_unique UNIQUE (engagement_id, draw_number)
);

CREATE INDEX idx_payapp_engage ON pay_apps (engagement_id, status);
```

### 2.11 pay_app_lines (G703-style line items)

```sql
CREATE TABLE public.pay_app_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_app_id          UUID NOT NULL REFERENCES pay_apps(id) ON DELETE CASCADE,
  line_number         INT NOT NULL,
  description         TEXT NOT NULL,
  scheduled_value     NUMERIC(14,2),
  pct_complete        NUMERIC(5,2),
  amount_completed    NUMERIC(14,2),
  retention_amount    NUMERIC(14,2)
);

CREATE INDEX idx_payapp_lines ON pay_app_lines (pay_app_id);
```

### 2.12 lien_waivers (the four types)

```sql
CREATE TABLE public.lien_waivers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id       UUID NOT NULL REFERENCES sub_engagements(id) ON DELETE CASCADE,
  pay_app_id          UUID REFERENCES pay_apps(id) ON DELETE SET NULL,

  waiver_type         TEXT NOT NULL CHECK (waiver_type IN (
                        'conditional_progress','unconditional_progress',
                        'conditional_final','unconditional_final')),

  -- statutory form selection (CA has 4 specific forms; others vary)
  state_code          TEXT,
  form_template_code  TEXT NOT NULL,        -- 'ca_civ_8132','generic','tx_form_a' etc.

  through_date        DATE NOT NULL,
  amount              NUMERIC(14,2) NOT NULL,
  exceptions          TEXT,

  -- signing
  status              TEXT NOT NULL DEFAULT 'requested'
                      CHECK (status IN (
                        'requested','sent','signed','voided','superseded')),
  esign_request_id    TEXT,
  signed_at           TIMESTAMPTZ,
  pdf_url             TEXT,

  -- chain (unconditional supersedes prior conditional)
  supersedes_id       UUID REFERENCES lien_waivers(id),

  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_waivers_engage ON lien_waivers (engagement_id, waiver_type, status);
CREATE INDEX idx_waivers_payapp ON lien_waivers (pay_app_id);
```

### 2.13 preliminary_notices (state-aware sub-protection)

```sql
CREATE TABLE public.preliminary_notices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id       UUID NOT NULL REFERENCES sub_engagements(id) ON DELETE CASCADE,
  state_code          TEXT NOT NULL,
  notice_type         TEXT NOT NULL,        -- 'ca_20_day','tx_monthly','fl_nto_45','ny_8mo'
  due_at              DATE NOT NULL,
  served_at           TIMESTAMPTZ,
  served_method       TEXT,                 -- 'certified_mail','e_recorded','hand'
  recipients          JSONB,                -- {owner, gc, lender}
  pdf_url             TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','served','overdue','waived')),
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_prelim_due ON preliminary_notices (status, due_at);
CREATE INDEX idx_prelim_engage ON preliminary_notices (engagement_id);
```

### 2.14 vault_access_tokens (magic-link auth for subs)

```sql
CREATE TABLE public.vault_access_tokens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_organization_id UUID NOT NULL REFERENCES sub_organizations(id) ON DELETE CASCADE,

  -- one of these is set
  token_hash          TEXT NOT NULL,        -- bcrypt of the token in URL
  scope               TEXT NOT NULL CHECK (scope IN (
                        'vault_full',       -- full vault access (after first claim)
                        'first_claim',      -- bootstrap link (single-use, longer-lived)
                        'doc_request',      -- "upload your COI"
                        'waiver_sign',      -- "sign this waiver"
                        'pay_app_status'    -- "view your pay app"
                      )),

  -- scoped context (when relevant)
  engagement_id       UUID REFERENCES sub_engagements(id) ON DELETE CASCADE,
  pay_app_id          UUID REFERENCES pay_apps(id) ON DELETE CASCADE,
  lien_waiver_id      UUID REFERENCES lien_waivers(id) ON DELETE CASCADE,
  doc_type_requested  TEXT REFERENCES compliance_doc_types(code),

  expires_at          TIMESTAMPTZ NOT NULL,
  used_at             TIMESTAMPTZ,          -- single-use tokens
  consumed_count      INT DEFAULT 0,
  max_consumptions    INT DEFAULT 1,        -- 1 for action tokens, NULL for vault session

  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vault_tokens_org ON vault_access_tokens (sub_organization_id, scope);
CREATE INDEX idx_vault_tokens_expires ON vault_access_tokens (expires_at);
```

### 2.15 vault_sessions (after token redemption)

```sql
CREATE TABLE public.vault_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_organization_id UUID NOT NULL REFERENCES sub_organizations(id) ON DELETE CASCADE,
  session_token_hash  TEXT NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL,
  ip_first_seen       TEXT,
  user_agent          TEXT,
  last_activity       TIMESTAMPTZ DEFAULT now(),
  created_at          TIMESTAMPTZ DEFAULT now()
);
```

This mirrors the existing `client_sessions` pattern from the customer portal.

### 2.16 sub_performance_scores (rollup, computed nightly)

```sql
CREATE TABLE public.sub_performance_scores (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_organization_id UUID NOT NULL REFERENCES sub_organizations(id) ON DELETE CASCADE,
  gc_company_id       UUID NOT NULL,        -- per-GC rating (different GCs may rate differently)

  on_time_score       NUMERIC(5,2),         -- 0-100
  on_budget_score     NUMERIC(5,2),
  quality_score       NUMERIC(5,2),
  safety_score        NUMERIC(5,2),
  responsiveness_score NUMERIC(5,2),
  pay_app_accuracy    NUMERIC(5,2),
  callback_count      INT DEFAULT 0,
  total_engagements   INT DEFAULT 0,
  last_engagement_at  TIMESTAMPTZ,

  preferred           BOOLEAN DEFAULT false,
  blacklisted         BOOLEAN DEFAULT false,
  blacklist_reason    TEXT,

  computed_at         TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT score_unique UNIQUE (sub_organization_id, gc_company_id)
);
```

---

## 3 — RLS policies (sketch)

The principle: GCs see subs they have an active grant for; subs see their own org via vault session OR auth.users link.

### sub_organizations

```sql
-- GCs with active grant see the sub
CREATE POLICY sub_org_gc_read ON sub_organizations FOR SELECT
USING (EXISTS (
  SELECT 1 FROM sub_gc_grants g
  JOIN profiles p ON p.company_id = g.gc_company_id
  WHERE g.sub_organization_id = sub_organizations.id
    AND g.status = 'active'
    AND p.id = auth.uid()
));

-- Sub themselves (via auth_user_id link)
CREATE POLICY sub_org_self_rw ON sub_organizations FOR ALL
USING (auth_user_id = auth.uid());

-- Vault session reads (handled at the API layer with vault_sessions check, not RLS)
-- → backend route uses service-role key when serving vault portal endpoints
```

### compliance_documents

```sql
-- GC reads via active grant + visibility filter
CREATE POLICY compliance_gc_read ON compliance_documents FOR SELECT
USING (EXISTS (
  SELECT 1 FROM sub_gc_grants g
  JOIN profiles p ON p.company_id = g.gc_company_id
  WHERE g.sub_organization_id = compliance_documents.sub_organization_id
    AND g.status = 'active'
    AND p.id = auth.uid()
    -- visibility check
    AND NOT (
      g.doc_visibility ? 'hide'
      AND compliance_documents.doc_type = ANY (
        ARRAY(SELECT jsonb_array_elements_text(g.doc_visibility->'hide'))
      )
    )
));

-- Sub themselves
CREATE POLICY compliance_self_rw ON compliance_documents FOR ALL
USING (EXISTS (
  SELECT 1 FROM sub_organizations s
  WHERE s.id = compliance_documents.sub_organization_id
    AND s.auth_user_id = auth.uid()
));
```

### sub_engagements / pay_apps / lien_waivers

GC-scoped: `EXISTS (... WHERE p.company_id = ...gc_company_id)`. Sub-scoped: via the engagement's sub_organization_id matching their auth_user_id or via vault session at API layer.

---

## 4 — Storage strategy

New private bucket: `compliance-documents`.

Path convention:
```
{sub_organization_id}/{doc_type}/{compliance_document_id}.{ext}
```

Why org-scoped (not GC-scoped): the doc belongs to the sub. Multiple GCs reading the same file is fine because RLS on `compliance_documents` table controls metadata access, and signed-URL generation goes through the backend (which checks grant before issuing URL).

Backend signed-URL endpoint: `GET /api/compliance/documents/:id/url` — checks caller has access (active grant, sub auth, or vault session), then issues a 5-minute signed URL.

Per-project COI files go in the same bucket but under a `per-project/` subfolder; metadata row in `compliance_documents` plus link in `engagement_compliance_links`.

For lien-waiver and contract PDFs (signed): `signed-documents/{engagement_id}/...` — these are immutable once executed.

---

## 5 — Magic-link auth flow (full)

### 5.1 GC adds a sub for the first time

```
GC user → POST /api/subs (legal_name, email, phone, tax_id, trades)
  ↓
Backend:
  1. Look up sub_organizations by (country, tax_id_type, tax_id)
  2. CASE A — match found:
       Create sub_gc_grants(status=pending)
       Send sub: "Davis Construction wants to add you. Approve?"
       Return {existing: true, grant_status: 'pending'}
  3. CASE B — no match:
       Create sub_organizations(claimed=false)
       Create sub_gc_grants(status=active, requested_by=auth.uid())
       Create vault_access_tokens(scope='first_claim', expires_at=+14 days)
       Send magic-link email: https://app/sub-vault?t={token}
       Return {created: true, sub_org_id}
```

### 5.2 Sub clicks magic link

```
GET /sub-vault?t={raw_token}
  ↓
Frontend: POST /api/sub-portal/auth/redeem (body: {token: raw})
  ↓
Backend:
  1. Hash token, look up vault_access_tokens
  2. Validate: not expired, not consumed (or under max_consumptions)
  3. Increment consumed_count; set used_at if single-use
  4. Mark sub_organizations.claimed_at = now() if first_claim scope
  5. Create vault_sessions(expires_at=+30 days)
  6. Set httpOnly cookie 'sylk_vault_session' = raw_session_token
  7. Return { sub_org: {...}, scope, redirect_to }
```

### 5.3 Sub uses the vault later

Cookie is sent with every request. Backend looks up `vault_sessions`, validates, attaches `req.sub_org_id` and `req.is_vault_session = true`. All `/api/sub-portal/*` routes accept either:
- A valid Supabase JWT (sub claimed + signed up), OR
- A valid vault session cookie

### 5.4 Action-scoped tokens (no full vault access)

Some emails are action-only: "sign this waiver." Token has `scope='waiver_sign'` + `lien_waiver_id`. Redemption gives access ONLY to that waiver, not the whole vault. After signing, token is consumed.

This minimizes blast radius if a sub forwards an email.

### 5.5 Sub can claim into an account (later)

If the sub has a vault session and clicks "create an account":
```
POST /api/sub-portal/claim
  body: {email, password}
  ↓
Backend:
  1. Validate vault session
  2. Create auth.users (or link to existing if email matches)
  3. Set sub_organizations.auth_user_id = new_user.id
  4. Insert profiles row with role='subcontractor' (new role value)
```

After this, sub can log in normally with email+password and skip magic links.

---

## 6 — Compliance computation (the core invariant)

`compliance_status_for_engagement(engagement_id)` is a computed function (PG function or service-layer code) that returns:

```typescript
{
  passes: boolean,
  blockers: Array<{
    doc_type: string,
    reason: 'missing' | 'expired' | 'expiring_soon' | 'no_endorsement' | 'coverage_low',
    detail: string,
    expires_at?: Date,
  }>,
  warnings: Array<{...}>,
  computed_at: Date,
}
```

### Algorithm

```
input: engagement_id
load: engagement, sub_org, gc_company, project (for state)
load: compliance_policies WHERE gc_company_id = engagement.gc_company_id
                          AND (applies_when='always'
                               OR (applies_when='state_match' AND state matches)
                               OR ...)
load: active compliance_documents for this sub (status='active', not superseded)
load: per-project links (engagement_compliance_links)

for each policy:
  candidates = docs of that doc_type
  if doc_type requires per-project (coi_per_project):
    candidates = candidates filtered to engagement_compliance_links link_type='project_specific'
  pick best (latest expires_at, highest verification)
  check:
    - exists?               → if not: BLOCKER missing
    - expires_at > today?   → if not: BLOCKER expired
    - expires_at > today + warning_lead_days? → if not: WARNING expiring_soon
    - endorsements ⊇ policy.required_endorsements? → if not: BLOCKER no_endorsement
    - coverage_limits ≥ policy.min_coverage? → if not: BLOCKER coverage_low

return {passes, blockers, warnings}
```

This function is called:
1. On pay-app submit (writes snapshot)
2. On pay-app approve attempt (rechecks; can't approve if blocker)
3. On engagement page load (for the GC UI banner)
4. By the daily cron (to fire alerts)
5. By Foreman tools (`get_engagement_compliance`)

Computation is cheap (one query per doc type for one sub) so we don't cache aggressively.

---

## 7 — Lien-waiver flow (wired to pay apps)

### 7.1 Pay-app submission triggers waiver creation

```
Sub: POST /api/sub-portal/pay-apps
  body: {engagement_id, draw_number, lines[], retention_pct, ...}
  ↓
Backend:
  1. Compute current_due
  2. Compute compliance_status_for_engagement → snapshot to pay_apps.compliance_snapshot
  3. If blockers exist: status='blocked', notify sub of blockers, STOP
  4. Else: status='submitted'
  5. Auto-create lien_waivers row:
       waiver_type='conditional_progress'
       state_code = project's state
       form_template_code = state-form lookup
       through_date = pay_app.period_end
       amount = current_due
  6. Render waiver PDF from template
  7. Send sub a magic-link email (scope='waiver_sign') OR
     if sub is in vault session, redirect to inline sign page
  8. Notify GC AP: "Pay app draw N submitted by Mike's Plumbing — waiver pending sub signature"
```

### 7.2 GC approves payment

```
GC: POST /api/pay-apps/:id/approve
  ↓
Backend:
  1. Recompute compliance — must pass
  2. Verify conditional_progress waiver is signed
  3. Verify previous draw's unconditional_progress waiver is signed (if not first draw)
  4. Set status='approved', approved_at, approved_by
  5. (External step: GC writes the check / sends ACH)
  6. GC marks pay_apps.paid_at + payment_reference
  ↓ trigger:
  7. Auto-create lien_waivers row:
       waiver_type='unconditional_progress'
       through_date = period_end
       amount = current_due
       supersedes_id = the conditional row above
  8. Email sub: "Payment cleared — please sign unconditional waiver"
```

### 7.3 Final payment

Same flow but `waiver_type='conditional_final'` and `'unconditional_final'`. The conditional_final blocks until punch-list `closeout_packages.status='complete'`.

### 7.4 State-form selection

```sql
CREATE TABLE public.lien_waiver_form_templates (
  code               TEXT PRIMARY KEY,           -- 'ca_civ_8132','tx_form_a','generic'
  state_code         TEXT,                       -- NULL = generic
  waiver_type        TEXT NOT NULL,
  is_statutory_only  BOOLEAN DEFAULT false,      -- CA: true (only 4 forms valid)
  body_md            TEXT NOT NULL,              -- Mustache template
  fields_required    TEXT[]
);
```

Lookup at waiver-creation time: `WHERE state_code = $1 AND waiver_type = $2 ORDER BY is_statutory_only DESC LIMIT 1`. CA pulls statutory; other states fall back to generic.

---

## 8 — State-law overlay (preliminary notices)

Trigger: when `sub_engagements.status` transitions to `mobilized` (sub starts work):

```
function scheduleStateNotices(engagement):
  state = project.state
  switch state:
    'CA':
      create preliminary_notices(notice_type='ca_20_day', due_at=mobilized_at + 20 days)
    'TX':
      create preliminary_notices(notice_type='tx_monthly', due_at=15th of 3rd month after period)
      (recurring per month — implementation: cron updates next due_at when prior served)
    'FL':
      create preliminary_notices(notice_type='fl_nto_45', due_at=mobilized_at + 45 days)
    'NY':
      // No preliminary notice required, but lien-window deadline tracked
      pass
    default:
      pass
```

Daily cron: `notices_due_in_5_days` → email sub with prefilled notice PDF + send instructions. Sub can click "served" with method/date or upload proof.

---

## 9 — Cron / scheduled jobs

No backend cron exists today. Use **Supabase pg_cron** (already available; you have Management API token to install).

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Daily 6:00 UTC: recompute expiry statuses
SELECT cron.schedule(
  'compliance-expiry-sweep',
  '0 6 * * *',
  $$
    UPDATE compliance_documents
    SET status = 'expired'
    WHERE status = 'active' AND expires_at < CURRENT_DATE;
  $$
);

-- Daily 6:30 UTC: invoke backend webhook to send alerts
SELECT cron.schedule(
  'compliance-alerts',
  '30 6 * * *',
  $$ SELECT net.http_post(
       url := 'https://<backend>/api/internal/compliance/run-alerts',
       headers := '{"X-Cron-Key": "..."}'::jsonb
     )
  $$
);
```

Backend `/api/internal/compliance/run-alerts` (gated by shared secret):
- For every doc expiring within next 30 days: email sub + GC compliance contacts.
- For every doc expired: email + push a notification to GC dashboard.
- For every preliminary_notice due in 5 days: email sub.
- For every engagement with compliance blockers: emit a `compliance_alert` event (consumed by the daily briefing).

---

## 10 — Foreman agent integration (tools)

Following the post-Phase-1 registry pattern (`backend/src/services/tools/registry.js`).

### New static tools

| Tool | Category | Risk | Approval | Tier |
|---|---|---|---|---|
| `list_subs` | SUBS (new) | READ | no | ANY |
| `get_sub` | SUBS | READ | no | ANY |
| `get_sub_compliance` | SUBS | READ | no | ANY |
| `list_engagements` | SUBS | READ | no | ANY |
| `get_engagement` | SUBS | READ | no | ANY |
| `list_expiring_compliance` | SUBS | READ | no | ANY |
| `record_compliance_doc` | SUBS | WRITE_SAFE | no | ANY |
| `add_sub_to_project` (creates engagement) | SUBS | WRITE_SAFE | no | HAIKU |
| `request_compliance_doc_from_sub` (emails sub) | SUBS | EXTERNAL_WRITE | yes | HAIKU |
| `request_pay_app_from_sub` | SUBS | EXTERNAL_WRITE | yes | HAIKU |
| `approve_pay_app` | SUBS | WRITE_DESTRUCTIVE | yes | HAIKU |
| `block_sub_from_project` | SUBS | WRITE_DESTRUCTIVE | yes | HAIKU |
| `generate_preliminary_notice` | SUBS | WRITE_SAFE | no | HAIKU |
| `request_sub_msa_signature` | SUBS | EXTERNAL_WRITE | yes | HAIKU |

Add `CATEGORIES.SUBS` to `categories.js`.

### Approval-gate behavior for the new EXTERNAL_WRITE tools

These flow through the existing `approvalGate.check()` — the agent emits `pending_approval` SSE; ChatScreen renders the amber confirm card; user taps Approve → tool fires.

### Briefing integration

Update `get_daily_briefing()` to include a new section:

```javascript
compliance_alerts: {
  expired: [...],          // {sub_name, doc_type, expired_at, project}
  expiring_soon: [...],    // {sub_name, doc_type, days_left, project}
  blocking_payment: [...], // pay_apps in 'blocked' status
  notice_deadlines: [...], // preliminary_notices due within 5 days
}
```

System-prompt nudge for complex turns: if `compliance_alerts.blocking_payment` has items, the planner is told to surface them prominently.

---

## 11 — Frontend surfaces

### GC side (existing app)

**New screen: `SubcontractorsScreen`**
- Top-level nav entry. List of all subs the GC has active grants for.
- Filter: trade, state, status (active / probation / blacklist), compliance health (green / yellow / red).
- Card: name, trade pills, compliance health dot, last engagement date, performance score.

**New screen: `SubcontractorDetailScreen`** with tabs:
1. **Profile** — identity, contacts, trades, service area
2. **Compliance** — vault docs, statuses, expiry calendar, request-doc button
3. **Engagements** — projects this sub has worked / is working
4. **Pay history** — pay apps, waivers, total paid this YTD
5. **Performance** — scorecard, notes, preferred/blacklist toggle

**New screen: `EngagementDetailScreen`** (tied to a specific project + sub):
- Compliance gate banner (red if blocked)
- Subcontract / Work Order docs
- Pay apps timeline
- Change orders
- Preliminary notice schedule
- Closeout checklist

**Project Detail screen — new section**: "Subcontractors" with `+ Add sub` button. Tapping opens a sub-picker (search across grants) or "Invite new sub" flow.

**Existing components reused**:
- `AuditTrail` (already wired to entity detail screens) — add to sub + engagement.
- `ApprovalCard` (Phase-1 pending_approval card) — fires for the new EXTERNAL_WRITE tools.

### Sub side (new portal — separate web surface, mobile-first)

Two surfaces:

**A. The vault** (web app, mobile-optimized; phase 1 can be a single React route in the same Expo Web build OR a thin Next.js sub-folder):
- Login: paste magic link OR email me a new one
- Dashboard: "3 GCs you work with", "2 docs expiring", "1 waiver to sign"
- Sections:
  - My profile (legal, contacts, banking)
  - Documents (upload, replace, view)
  - Engagements (projects across all GCs)
  - Inbox (pending actions)
- Camera-to-PDF for COI/license capture (mobile)
- Auto-publish toggle per GC

**B. Action emails** (the most-used surface):
- Plain HTML email with one CTA button: "Upload your COI", "Sign waiver", "Submit pay app"
- Tapping opens a single-purpose page (token scope), no full vault required.

### Mobile native app (Expo)

The existing app is GC-focused — we do NOT add a sub-side native experience in v1. Subs use mobile web. Reasoning: subs work with multiple GCs across multiple platforms; forcing them into a native app is the same friction Procore has.

Future: an Expo build with the sub vault, distributed via the same Sylk app store entry, login picks experience based on role.

---

## 12 — Brazil readiness

Most schema is country-agnostic. The pieces that need country-aware handling:

**Identity:**
- `tax_id_type IN ('ein','cnpj','cpf','mei','none')` already in schema
- `country_code` already in schema
- Validation: `validateCNPJ()` helper using checksum algorithm; lookup against Receita Federal `Consulta CNPJ` API for active status

**Document catalog:**
- Seed `compliance_doc_types` with BR rows: `cnd_inss`, `cnd_fgts`, `cnd_federal`, `cnd_municipal`, `cnd_trabalhista`, `nr18_program`, `art_rrt`
- `country_code='BR'` filter in policy lookup

**Lien waivers → not applicable in Brazil** (no mechanic's lien tradition). Instead BR engagements get a parallel concept: `inss_retainage` records (11% retention deposited into INSS code), tracked alongside pay_apps.

**State-law overlays → state codes work** for both US (CA/TX/FL/NY) and BR (SP/RJ/MG); the policy table is country+state composite.

**Add to schema (later):**
```sql
ALTER TABLE pay_apps ADD COLUMN inss_retention_amount NUMERIC(14,2);
ALTER TABLE pay_apps ADD COLUMN inss_retention_paid_at TIMESTAMPTZ;
ALTER TABLE pay_apps ADD COLUMN inss_retention_reference TEXT;
```

V1 ships US-only behavior with the data model BR-ready. BR features are a post-v1 unlock.

---

## 13 — Build sequence (8 phases, ~6 weeks)

Each phase ends with a green test suite + smoke test.

### Phase A — Foundation (week 1)
- All 16 tables + indexes + RLS
- compliance_doc_types seed (US + BR catalog)
- compliance_policies seed defaults
- lien_waiver_form_templates seed (CA statutory + generic)
- Storage bucket `compliance-documents` + RLS
- Migration runs via Management API

**Exit criteria:** schema deployed; can manually insert + read via SQL; RLS denies what it should.

### Phase B — Sub & GC core APIs (week 2)
- `/api/subs` CRUD (GC-side)
- `/api/sub-portal/*` (vault routes)
- `vault_access_tokens` issuance + redemption
- `vault_sessions` cookie middleware
- Magic-link emails (reuses existing email infra)
- Backend `compliance_status_for_engagement()` function + tests

**Exit criteria:** GC can add a sub via API, sub can claim via magic link, both can read each other's data per RLS, unit tests pass.

### Phase C — Document vault (week 3)
- Upload/replace/supersede flow
- File storage signed-URL endpoint
- Verification UI (manual GC verification — broker-API verification deferred)
- Endorsement metadata capture
- Expiry computation + cron sweep

**Exit criteria:** sub uploads COI from mobile camera, GC sees it on the sub's profile, expiry cron correctly transitions statuses, alert emails fire at 30/15/0 days.

### Phase D — Engagements + subcontracts (week 4)
- Project Detail "Add subcontractor" flow
- Engagement state machine
- MSA + Work Order subcontracts (uses existing eSignService)
- Auto-publish docs on engagement creation
- Per-project COI request flow

**Exit criteria:** GC can add sub to project, MSA gets sent for signature, sub signs from email, status flows invited → contracted.

### Phase E — Pay apps + lien waivers (week 5)
- pay_apps + pay_app_lines submission API (sub portal)
- Compliance gate enforced on submit + approve
- lien_waivers auto-generation (conditional progress)
- Waiver PDF rendering from templates
- Waiver signing via magic link
- Cascading unconditional waiver after payment
- State-form selection (CA statutory)

**Exit criteria:** sub submits pay app on phone, waiver auto-generated, sub signs, GC approves and pays, unconditional waiver triggers automatically.

### Phase F — State-law + notices + briefing (week 6)
- preliminary_notices auto-creation per state
- Notice PDF generation + send instructions
- Daily briefing integration
- Foreman tools (all 14 listed in §10)
- approvalGate wiring for new EXTERNAL_WRITE tools

**Exit criteria:** sub on a CA project gets 20-day notice scheduled at mobilization, briefing surfaces a "compliance alerts" section, all Foreman tools tested via Anthropic eval suite.

### Phase G — Frontend GC surfaces (week 6, parallel)
- SubcontractorsScreen + SubcontractorDetailScreen + EngagementDetailScreen
- Project Detail integration
- AuditTrail wired to new entities
- Approval card variants for new tools
- i18n strings (EN/ES/PT)

### Phase H — Sub portal (week 7)
- Vault dashboard (mobile web)
- Document upload (camera-to-PDF)
- Pay-app submission UI
- Waiver inline signing
- Action-token landing pages

**Stop point.** v1 ships behind a feature flag `SUBCONTRACTOR_MODULE_ENABLED` on a per-company basis for staged rollout.

---

## 14 — Test plan

### Unit
- `subOrgService.test.js` — dedup logic, claim flow
- `complianceComputation.test.js` — every blocker variant, every warning
- `payAppGate.test.js` — submit blocked, approve blocked, full happy path
- `lienWaiverChain.test.js` — conditional → unconditional cascade, supersedes
- `stateNotices.test.js` — CA/TX/FL deadlines compute correctly
- `vaultTokens.test.js` — scope enforcement, expiry, single-use

### Integration
- End-to-end: GC creates sub → sub claims → uploads COI → GC adds to project → MSA signed → pay-app cycle through closeout
- Sub on 3 GCs simultaneously: shared vault behavior, per-GC visibility filters
- Brazil sub: CNPJ validation, BR doc types, no lien waivers generated

### Foreman tool evals
- "Add Mike's Plumbing as a sub on the Smith project" → tool call sequence verified
- "What subs have expired insurance?" → list_expiring_compliance fires
- "Approve Mike's pay app for the Davis project" → approval gate fires, tool blocked until user confirms

### Smoke
- Production-shaped data: 50 subs, 200 docs, 100 engagements, 500 pay apps. Briefing latency < 500ms.

---

## 15 — Risks & open questions

### Risks

1. **Mobile-web vault adoption.** Subs may ignore emails. Mitigation: SMS fallback for action tokens; "Sylk for Subs" as an Expo native app post-v1.
2. **Forged docs.** v1 relies on manual GC verification. Mitigation: roadmap broker-API verification (Certificial / Billy / TrustLayer) for v2; for now, expose a "verified" badge that requires GC click + audit trail.
3. **PII in W9 (SSN for sole props).** Mitigation: encrypt the file at rest with a per-company KMS key; restrict download to AP role; redact SSN in any extracted metadata.
4. **State-form maintenance.** CA's 4 statutory forms have specific text the legislature can change. Mitigation: form templates are versioned, audit-logged; legal review annually.
5. **Grant-revoke edge case.** Sub revokes grant mid-project → existing engagements should keep working (otherwise GC is stuck). Mitigation: grant revocation only stops NEW engagements; existing ones unaffected. Document this clearly in the sub UX.
6. **Sub abandons mid-project.** If sub never claims their vault but GC needs to upload docs on their behalf → unclaimed mode allows GC-side upload; on claim, sub can review/replace.
7. **Multiple GCs requesting same per-project COI on same project (joint venture).** Edge case; flag for v2.

### Open questions (need your input)

1. **Sub self-service registration.** Can a sub create their own Sylk vault without being invited (so they're discoverable in a future "find a sub" feature)? My take: yes — it's free for them, a no-friction sub list grows the network. But it adds spam-control surface. Defer to v2?
2. **Per-GC pricing implications.** Subs are free. Does every GC's plan include unlimited subs, or is there a cap (e.g., 25 subs on starter, unlimited on pro)? Pricing needs to be decided before billing wiring.
3. **eSignature provider.** Existing eSignService — is it DocuSign, AdobeSign, or homegrown? Whichever it is, MSA + Work Order + lien waivers will all flow through it. Need to confirm fit (some providers charge per-envelope; lien waivers are high-volume).
4. **Backcharges.** Not in v1 per the research recommendation. Confirm.
5. **Bid-invitation marketplace.** Not in v1. Confirm.
6. **Brazil cutover.** Build BR-ready data model in v1 (yes, no extra cost). Activate BR features in a separate phase. Confirm.
7. **The "performance score" inputs.** Some are auto-computed (on-time = milestones met from project schedule). Some need manual GC entry (quality, callbacks). v1 just captures the data; UI for rating happens at closeout. Confirm scope.
8. **Worker-vs-sub overlap.** Should `workers` get a `subcontractor_employee` role to track which workers belong to which sub? Useful for badged-worker lists per project (NY, CA require this) but adds schema complexity. Defer to v2 unless you've heard the request from your beta GCs.

---

## 16 — Deferred to v2 (the "not now" list)

- AIA A305 full prequalification questionnaire + financial-statement underwriting
- Broker-API insurance verification (myCOI / Certificial / TrustLayer)
- RFI / submittal workflow (Procore territory; not the wedge)
- Daily reports / photo logs / weather (Sylk has this for workers; not for subs in v1)
- Bid-invitation marketplace (BuildingConnected territory)
- Backcharge ledger
- Warranty service-call integration
- BR eSocial / SPED integrations
- AI risk scoring of subs (post-data-collection)
- Worker-level badging within a sub's crew (CA/NY site-access tracking)
- Native mobile app for subs (mobile-web is sufficient for v1)
- Joint-check requests
- Public sub-profile pages ("Mike's Plumbing on Sylk")

---

## 17 — Connections summary (the "is everything wired?" check)

| If… | Then… |
|---|---|
| GC adds a sub | dedup → grant → magic link → vault setup |
| Sub uploads a COI | doc lands in vault → all active engagements re-check compliance → if any pay_app status was 'blocked' due to expiry, auto-recheck |
| COI expires | cron flips status → emails sub + GC → engagement compliance recomputes → blocks new pay-app submits |
| GC adds sub to project | engagement created → docs auto-published → MSA sent if not on file → per-project COI requested |
| Sub submits pay app | compliance computed → if blocked, status='blocked' + sub notified → if passed, conditional waiver auto-generated + sent for signature |
| Sub signs conditional waiver | waiver PDF stored → AP notified pay-app ready for review |
| GC approves pay app | recheck compliance + verify prior unconditional present → status='approved' |
| GC marks paid | unconditional progress waiver auto-generated + sent |
| Engagement mobilized in CA | preliminary notice scheduled at +20 days → cron emails sub at 5-day warning |
| Engagement closed out | conditional final → unconditional final → retainage release → performance score updated |
| Sub revokes grant | existing engagements continue, new ones blocked, GC sees "access pending" badge |
| Sub claims vault | auth.users link, magic-link flow no longer needed, full SaaS UX unlocked |
| Foreman asked "show me expiring docs" | list_expiring_compliance tool → reads compliance_documents → returns to chat |
| Foreman asked "request COI from Mike" | request_compliance_doc_from_sub → approval gate fires → user taps approve → email + token sent |
| Daily briefing rendered | pulls compliance_alerts.* sections → if any blockers, system prompt nudges Foreman to surface |

Every action triggers downstream state. No orphan paths.

---

## Stop point

This document defines the full design. Code starts at Phase A only after you greenlight. Open questions in §15 should be answered (or deferred explicitly) before kickoff.

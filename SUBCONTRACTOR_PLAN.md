# Sylk Subcontractor Module — v1 Plan (revised — three-tier + bidding + payments)

## Context

Sylk currently has no concept of subcontractors. Subs exist only as vendor metadata on `subcontractor_quotes` — no records, no document tracking, no engagement lifecycle. v1 builds a first-class subcontractor system that gives the GC end-to-end control of bid → contract → docs → payment, AND gives the sub a real account they can log into to see their stuff.

**Three tiers (this is the central design choice):**

| Tier | Login? | Cost | What they get |
|---|---|---|---|
| **Sub Magic-Link** | No login | Free | Tap email links to upload docs / sign contracts. No dashboard. For pure one-time subs who refuse any account. |
| **Sub Free** | Yes (email + password) | Free | Log in anytime. Universal sub profile (other GCs can find and contact them). View profile, compliance vault, engagements, bids, invoices, inbox. Replace docs proactively. Submit bids. Send invoices. **Cross-GC compliance vault is FREE at this tier** — moat is open from day one. |
| **Sub Paid Owner** | Yes | $25/mo (Solo) | Everything above PLUS owner-side features: their own projects, customers, invoices to homeowners, crew, Foreman AI. Full Sylk for their own business. |

**The value gradient:** free = run your sub work better. Paid = run your whole business.

The sub picks the tier. Each step up is a soft prompt; nothing is forced.

**The data-transfer answer (the user's central concern): nothing transfers on upgrade.** The Sub Free dashboard and the Sub Paid Owner dashboard read the SAME database tables. Upgrading from Free to Paid is a billing flag flip that reveals the previously-hidden owner-side sections. Architectural detail in §3 below.

**v2 deferred:** lien waivers, state-statutory waiver forms, preliminary notices, performance scoring, broker-API insurance verification, full pay-app cycle (G702/G703), cross-GC vault sharing for non-upgraded subs.

The data model is Brazil-ready (`country_code`, `tax_id_type`).

Backing docs:
- `/Users/moretti/Documents/construction-manager/SUBCONTRACTOR_DESIGN.md` — full design
- `/Users/moretti/Documents/construction-manager/SUBCONTRACTOR_RESEARCH.md` — industry ground-truth (12-stage lifecycle, payment patterns, etc.)

---

## 1. Architecture

```
sub_organizations  (GLOBAL — one record per real-world sub business)
  │  auth_user_id NULL  → Sub Magic-Link tier
  │  auth_user_id SET, profiles.subscription_tier='free' → Sub Free
  │  auth_user_id SET, profiles.subscription_tier='solo'/'pro' → Sub Paid Owner
  │
  ├── sub_org_contacts
  ├── compliance_documents (visible to GCs with active engagement)
  ├── sub_action_tokens (single-use magic links)
  ├── sub_bids ─────────────► (responses to bid_requests)
  ├── sub_invoices ─────────► (against sub_engagements)
  └── sub_engagements (sub × GC × project — the work unit)
        ├── engagement_compliance_links
        ├── subcontracts (MSA + Work Order via eSign)
        ├── payment_terms (50/50, milestones, net30, custom)
        ├── payment_milestones
        └── payment_records (manual entry by GC)

companies (GC/owner)  ──linked_sub_org_id──►  sub_organizations
   (every company has a paired sub_organizations row at signup —
    enables "My Compliance" UI universally + EIN dedup for the
    inverse case where a GC gets hired as a sub)

profiles.role IN ('owner','worker','sub','client')
profiles.subscription_tier IN ('free','solo','pro')

bid_requests (from GC) ──invites──► sub_organizations
notifications (in-app + email; for GC and sub)
```

**Sub_organizations is GLOBAL**, not GC-scoped. Any GC on Sylk can search the directory, find Mike's Plumbing, and request to engage him. Sub controls visibility on their profile (which fields are public vs only-with-engagement).

Compliance is computed (never stored): `complianceService.computeForEngagement()`.

Every Sylk `companies` row gets an auto-paired `sub_organizations` row at signup so:
- Pure GCs have a "sub identity" available out of the box (their COI/W9/license live there) — universal "My Compliance" UI.
- EIN dedup works for the inverse case (a GC who someday gets hired as a sub by another GC — no special path needed).

---

## 2. Sub-side experience (Sub Free portal)

Mobile-first portal at `/sub` in the existing Expo Web build. Reuses theme tokens and components from the GC app.

**Bottom nav: 3 tabs only. Keep it dead simple.**

| Tab | Shows | Actions |
|---|---|---|
| **Home** | Landing page: pending action items at top ("Davis needs your COI", "Sign Work Order", "Bid due Friday"), recent activity feed below, profile summary card | Tap action items → action page. Tap profile card → edit profile. "Upgrade to Sylk for my business" CTA banner here. |
| **Documents** | ALL compliance docs in one section: COI, W9, license, drug policy, MSAs signed, etc. Each card shows status, expiry, which GCs can see it. | Replace doc, add new doc, view audit trail. |
| **Work** | Combined view of all sub's business with GCs: engagements (active + past), open bid invitations, bid history, invoices sent, payment history. Filter chips at top to narrow. | Tap engagement → detail (contract, milestones, invoices, payments). Tap bid → submit/withdraw. Tap invoice → create or view. |

**Auth:** standard Supabase auth, new role `'sub'` on `profiles`. Magic-link tokens (Sub Magic-Link tier) coexist — they hit the same action pages without requiring login. Profile editing surfaces via a gear/avatar icon in the Home tab header.

---

## 3. The Free → Paid transition (the data-transfer story)

**Mental model: it's not a migration. It's a viewing-angle change.**

Both Sub Free and Sub Paid Owner share the SAME app, SAME schema, SAME database rows. The difference is which sections of the dashboard are visible.

### What happens technically when Mike upgrades

1. `UPDATE profiles SET subscription_tier = 'solo'` (was `'free'`)
2. `UPDATE sub_organizations SET is_upgraded = true, upgraded_at = now()`
3. Stripe trial subscription starts on the linked `companies` row
4. Mike's dashboard now renders ALL the owner-side sections (Projects, Customers, Invoices to homeowners, Crew, Foreman) — they were hidden behind the tier flag

**No row is moved or copied. Ever.**

### What Mike sees, day one as Paid Owner

Same login. Same app. The only change: **owner-side sections become visible** that were hidden behind the tier flag.

**A) New sections appear (previously hidden):**
- "Projects" — empty (he hasn't created his own jobs yet)
- "Customers" — empty
- "Invoices to my Customers" — empty (separate from sub-side invoices)
- "Crew" — empty
- "Foreman" (AI assistant) — accessible

**B) ALL existing sub-side sections KEEP THEIR DATA in the exact same place:**
- "Compliance" — same `compliance_documents` rows, untouched
- "Engagements" / "Subbed Work" — same `sub_engagements` rows, untouched
- "Bids" — same `sub_bids` rows, untouched
- "Invoices to GCs" — same `sub_invoices` rows, untouched
- Universal directory profile — already public at Free tier, no change

**The only thing that "moves" is which UI sections render — controlled by `subscription_tier` flag check in the frontend layout component. Cross-GC discoverability is already on at Free tier; it does NOT depend on upgrade.**

### Why this works

The schema is designed so a single Sylk account naturally has both sides:
- Outbound work (you hire others): `companies` → `projects` → `clients` → `invoices`
- Inbound work (others hire you): `companies` → `linked_sub_org_id` → `sub_engagements` → `sub_invoices`

Sub Free hides the outbound-work sections. Sub Paid shows everything. Pure GCs (never subbed for anyone) just have empty inbound sections.

**No "transfer code." No migration scripts. The upgrade is a flag flip.**

---

## 4. GC-side experience (additions to existing app)

### Subcontractors as a section under Workers (primary entry point)

The GC's Team / Workers screen gets a new sibling section. Same level as Workers and Supervisors.

```
Team
├── Workers       (existing — employees, hourly/salaried)
├── Supervisors   (existing — supervisor role)
└── Subcontractors (NEW — sub_organizations with active or past engagements)
```

Tapping "Subcontractors" → list view of subs the GC has engaged. Each row shows: name, trade, compliance health dot (green/yellow/red), last engagement date.

Tap a sub → `SubcontractorDetailScreen` with tabs:
1. **Overview** — profile, contacts, trades, performance summary
2. **Documents** — full compliance vault (COI, W9, license, etc.)
3. **Estimates / Bids** — every bid this sub submitted to this GC, with status
4. **Engagements** — projects this sub has worked on with this GC
5. **Invoices & Payments** — all invoices sent + payment history
6. **Audit trail** — chronological feed of everything (existing `AuditTrail.js` component)

"Add Subcontractor" CTA at the top of the list view → opens add-sub flow (search global directory by EIN/name OR invite by email).

### Filter chips + search on Team / Schedule / Projects

Existing screens with a team-member filter (Team, Schedule, Projects) get TWO controls:

**1. Filter chip-set:**
```
[ All ]  [ Workers ]  [ Supervisors ]  [ Subcontractors ]
```

**2. Search button** (icon in the header, expands to text input on tap):
```
🔍  →  [____search team members____]
```

Search is scoped to the active filter. Examples:
- Filter = `Supervisors`, search "John" → returns supervisors named John.
- Filter = `Subcontractors`, search "plumb" → returns subs with "plumb" in legal_name, dba, or trade.
- Filter = `All`, search "Mike" → returns ANY team member (worker, supervisor, sub) matching.

Search is debounced (~300ms) and queries the appropriate tables based on the filter. Same chip + search pattern reused across Team, Schedule, and Projects so the UX is consistent.

Component: new `frontend/src/components/TeamFilterAndSearch.js` — drop-in replacement for the existing team filter on each screen.

### Bid creation flow (Project Detail → Subcontractors section)

1. GC: "Get bids" button → opens bid request creator.
2. Form: scope summary, plans (file uploads), bid due date, payment terms (preset: 50/50, milestones, net30, custom), required compliance docs.
3. Pick subs from existing list OR add new ones inline.
4. Send → Sylk emails each invited sub with a magic link OR notifies Sub Free users in-app.
5. As bids come in, GC sees them side-by-side ("Compare bids" view) with: amount, timeline, exclusions, sub's compliance status, performance history (placeholder for v1).
6. Accept one → creates `sub_engagements` row, triggers Work Order signature flow.

### Payment recording

On `EngagementDetailScreen`, GC sees:
- Contract amount
- Payment terms (50/50 / milestones / net30)
- Milestone progress (if applicable)
- Invoices received from sub (sub-submitted via portal)
- Payment records (GC manually marks paid: amount, date, method, reference number)
- Outstanding balance computed

No automatic payment processing in v1. GC writes a check / does Zelle / ACH — Sylk just records what happened.

### Notifications

In-app + email (existing notification infrastructure — confirm in Phase B).

**To GC:**
- Sub uploaded a doc
- Sub submitted a bid
- Sub signed contract
- Sub sent an invoice
- Sub's compliance doc expired/expiring
- Bid response deadline approaching

**To sub:**
- New bid invitation
- Contract sent for signature
- Document requested by GC
- Payment received from GC
- Compliance doc expiring
- Engagement status changed

---

## 5. Phases (build sequence — ~5-6 weeks)

Each phase ends with green tests + manual smoke. v1 ships behind feature flag `SUBCONTRACTOR_MODULE_ENABLED` per company.

### Phase A — Schema foundation (Day 1–2)

Migration `backend/supabase/migrations/YYYYMMDD_subcontractor_module.sql`. Run via Supabase Management API.

**Tables (12):**
- `sub_organizations` — identity + auth_user_id (nullable) + is_upgraded + linked_company_id (nullable) + country_code + tax_id_type + upgrade_invited_at + upgraded_at. **GLOBAL** — no `gc_company_id` foreign key. Originating GC is tracked via the first `sub_engagements` row OR an optional `created_by_gc_id` audit column. Public directory fields: legal_name, dba, trade(s), service_states. Private fields (only visible to GCs with active engagement): contacts, address, banking, compliance docs.
- `sub_org_contacts`
- `compliance_documents`
- `compliance_doc_types` (US + BR catalog seed)
- `compliance_policies`
- `sub_engagements`
- `engagement_compliance_links`
- `subcontracts` (eSign-driven)
- `sub_action_tokens` (single-use, scoped)
- `bid_requests` (created by GC; project_id, scope, plans, due_at, payment_terms, status)
- `bid_request_invitations` (which subs were invited)
- `sub_bids` (sub's response: amount, exclusions, status)
- `sub_invoices` (sub-submitted; engagement_id, line items, total, due_at, status)
- `payment_records` (GC-recorded; engagement_id or sub_invoice_id, amount, paid_at, method, reference)
- `payment_milestones` (for milestone-terms engagements)
- `notifications` — IF an existing table doesn't already exist; otherwise extend

**Existing schema additions:**
- `companies.linked_sub_org_id UUID REFERENCES sub_organizations(id)` + backfill so every existing company gets a paired sub_org row.
- `profiles.role` extend CHECK to include `'sub'`.
- `profiles.subscription_tier TEXT CHECK IN ('free','solo','pro')` default `'free'`.

**Storage:** new private bucket `compliance-documents`, path `{sub_organization_id}/{doc_type}/{doc_id}.{ext}`. Reuse existing `documents` bucket for bid plans and invoices.

**Seeds:** doc types (US + BR), default compliance policies for existing companies.

**RLS:** EXISTS subqueries with `auth.uid()`, mirroring `project_documents` policy at `backend/supabase/migrations/20260421_project_docs_bucket.sql:20-31`. Sub-side (auth-based) reads when `sub_organizations.auth_user_id = auth.uid()`. Magic-link reads via service-role with token verification (mirrors `eSignService.js:9`).

### Phase B — Sub records + action tokens + Sub Free auth (Day 3–5)

- `backend/src/services/subOrgService.js`
- `backend/src/services/complianceService.js` — `computeForEngagement(id)` returns `{passes, blockers[], warnings[]}`
- `backend/src/middleware/subAuth.js` — handles `'sub'` role profiles
- Routes:
  - `POST /api/subs` (GC adds sub)
  - `GET /api/subs`, `GET /api/subs/:id`, `PATCH /api/subs/:id`
  - `POST /api/subs/:id/request-doc`
  - `POST /api/sub-action/redeem` (token-gated public)
  - `POST /api/sub-portal/auth/signup` (Sub Free account creation)
  - `GET /api/sub-portal/me`, `PATCH /api/sub-portal/me` (sub's own data)

Tests: `subOrgService.test.js`, `subActionTokens.test.js`, `complianceService.test.js`, `subAuth.test.js`.

### Phase C — Document vault (Day 6–7)

- `POST /api/compliance/documents`
- `GET /api/compliance/documents/:id/url` (5-min signed URL)
- `PATCH`, `DELETE`
- pg_cron: daily expiry sweep (06:00 UTC) + alert dispatch (06:30 UTC) → `/api/internal/compliance/run-alerts`
- Frontend: ComplianceDocUploader component (reuses `frontend/src/utils/storage/projectDocuments.js` pattern), camera-to-PDF on mobile.

Tests: `complianceVault.test.js`.

### Phase D — Engagements + subcontracts (Day 8–10)

- Engagement state machine: invited → bidding → awarded → contracted → mobilized → in_progress → substantially_complete → closed_out → cancelled
- Routes:
  - `POST /api/engagements` (creates from accepted bid OR direct)
  - `GET /api/engagements/:id`, `PATCH`
  - `POST /api/engagements/:id/subcontracts` (MSA or Work Order)
- Extend `eSignService.js`:
  - Add `'msa'` and `'work_order'` to `VALID_DOC_TYPES` (line 33)
  - Add entries to `DOC_TABLES` (line 35) → `subcontracts` table
- Auto-publish vault docs on engagement creation (creates `engagement_compliance_links` rows for current active docs)

Tests: `engagementService.test.js`.

### Phase E — Bidding flow (Day 11–13)

- Routes:
  - `POST /api/bid-requests` (GC creates)
  - `GET /api/bid-requests`, `GET /api/bid-requests/:id`
  - `POST /api/bid-requests/:id/invite` (invite subs by id or email; emails sent + in-app notif)
  - `POST /api/sub-portal/bids` (sub submits bid)
  - `PATCH /api/sub-portal/bids/:id` (sub updates/withdraws)
  - `POST /api/bid-requests/:id/accept` (GC picks a bid → triggers engagement creation)
- Bid notification triggers wired to notifications table

Tests: `biddingService.test.js`.

### Phase F — Invoicing + payments (Day 14–16)

- Payment terms model on engagement creation:
  - `'fifty_fifty'` — 50% on contract sign, 50% on completion
  - `'milestones'` — define N milestones with % each
  - `'net_30'` — invoice when work done, due 30 days
  - `'custom'` — free text
- Routes:
  - `POST /api/sub-portal/invoices` (sub creates)
  - `GET /api/sub-portal/invoices`, `GET /api/engagements/:id/invoices` (GC view)
  - `PATCH /api/sub-portal/invoices/:id` (sub edits draft)
  - `POST /api/sub-portal/invoices/:id/send` (sub submits to GC)
  - `POST /api/engagements/:id/payments` (GC records manual payment)
  - `GET /api/engagements/:id/balance` (computed: contract - paid - retainage)

Tests: `invoiceService.test.js`, `paymentService.test.js`.

### Phase G — Sub Free portal (Day 17–19)

Frontend, mobile-first, 3-tab dashboard at `/sub`:
- `frontend/src/screens/SubPortalScreen.js` (router/layout, bottom nav)
- Tabs: `SubHomeTab.js`, `SubDocumentsTab.js`, `SubWorkTab.js`
- `SubWorkTab.js` has internal sub-filters (engagements / bids / invoices / payments)
- Magic-link single-pages stay: `SubUploadPage.js`, `SubSignPage.js`, `SubBidSubmitPage.js`
- Sub action token redemption auto-routes to the right page
- "Upgrade to Sylk for my business" CTA banner on Home tab (actual upgrade flow in Phase J)

Reuses GC app theme, components (AuditTrail, etc.), i18n.

### Phase H — GC frontend (Day 20–23)

New screens:
- `SubcontractorsScreen.js`
- `SubcontractorDetailScreen.js`
- `EngagementDetailScreen.js`
- `BidRequestCreatorScreen.js` (multi-step form)
- `BidComparisonScreen.js`
- `InvoiceDetailScreen.js` (shared by GC + sub)

Modified screens:
- `frontend/src/screens/ProjectDetailScreen.js` — add Subcontractors section + Get Bids CTA
- Existing Schedule, Projects, Team screens — add filter chip set `[All / Workers / Supervisors / Subcontractors]`

i18n keys for `subs.*` namespace in EN/ES/PT.

### Phase I — Notifications (Day 24–25)

- Backend: `notificationService.js` — fan-out to in-app (notifications table) + email (Resend via emailService)
- Triggers wired to: doc upload, bid submit/accept/decline, contract signed, invoice sent, payment recorded, doc expiring/expired
- Frontend: notification bell + list (reuse existing if present, build minimal if not)
- Email templates per event type
- User preferences: per-event-type opt-out in settings

Tests: `notificationService.test.js`.

### Phase J — Upgrade-to-Owner flow + briefing (Day 26–28)

**Eligibility:** ≥2 completed actions OR ≥30 days since first action. Throttle by `upgrade_invited_at`.

**The upgrade page (`/sub/upgrade?t={token}`):**
- "You've been on Sylk for X engagements. Use it for your own business too."
- Shows what carries over (compliance, engagement history, bid/invoice history) and what's new (projects, customers, crew, Foreman).
- Form: confirm email, set strong password (or skip if Sub Free already had account), accept upgrade ToS.
- "Start 14-day trial" → Stripe.

**Technical switch (`POST /api/sub-action/upgrade`):**
1. Validate token + password
2. If no auth user yet (was Sub Magic-Link): `supabase.auth.admin.createUser()`
3. INSERT `companies` (name = sub legal_name, owner_id = new auth user) IF none exists
4. UPDATE `sub_organizations.auth_user_id`, `is_upgraded=true`, `upgraded_at`, `linked_company_id`
5. UPDATE `companies.linked_sub_org_id`
6. UPDATE `profiles.subscription_tier='solo'`, role stays `'sub'` BUT app reads tier flag for UI gating
7. Stripe customer + trial subscription
8. Redirect to `/onboarding/welcome?from=sub_upgrade`

**Daily briefing integration (`backend/src/services/tools/handlers.js` `get_daily_briefing()`):**
- New `compliance_alerts` section: expired, expiring_soon, pending_doc_requests
- New `bid_activity` section: open bids closing soon, new bids received

**Foreman tools** (registered in `backend/src/services/tools/registry.js`, handlers in `tools/handlers.js`, add `CATEGORIES.SUBS`):
- READ: `list_subs`, `get_sub`, `get_sub_compliance`, `list_engagements`, `get_engagement`, `list_expiring_compliance`, `list_open_bids`, `list_recent_invoices`
- WRITE_SAFE: `record_compliance_doc`, `add_sub_to_project`, `record_payment`
- EXTERNAL_WRITE (approvalGate): `request_compliance_doc_from_sub`, `request_msa_signature`, `send_bid_invitation`

EXTERNAL_WRITE flows through Phase-1 `approvalGate.check()` and the existing amber confirm card in `frontend/src/screens/ChatScreen.js`.

Tests: `subUpgrade.test.js`, `briefing.test.js` (extend), `complianceTools.test.js`.

---

## 6. Critical files

**New backend:**
- `backend/supabase/migrations/YYYYMMDD_subcontractor_module.sql`
- `backend/src/services/subOrgService.js`, `complianceService.js`, `biddingService.js`, `invoiceService.js`, `paymentService.js`, `notificationService.js`
- `backend/src/middleware/subAuth.js`
- `backend/src/routes/subs.js`, `subAction.js`, `subPortal.js`, `bidRequests.js`, `engagements.js`, `internal.js`
- Tests: `subOrgService.test.js`, `subActionTokens.test.js`, `complianceService.test.js`, `complianceVault.test.js`, `engagementService.test.js`, `biddingService.test.js`, `invoiceService.test.js`, `paymentService.test.js`, `notificationService.test.js`, `subUpgrade.test.js`, `complianceTools.test.js`

**New frontend (sub-side):**
- `frontend/src/screens/SubPortalScreen.js` (3-tab bottom nav layout)
- Tabs: `SubHomeTab.js`, `SubDocumentsTab.js`, `SubWorkTab.js`
- Magic-link pages: `SubUploadPage.js`, `SubSignPage.js`, `SubBidSubmitPage.js`, `SubUpgradePage.js`

**New frontend (GC-side):**
- `SubcontractorsScreen.js`, `SubcontractorDetailScreen.js`, `EngagementDetailScreen.js`, `BidRequestCreatorScreen.js`, `BidComparisonScreen.js`, `InvoiceDetailScreen.js`
- `ComplianceDocUploader.js`, `ComplianceDocCard.js`
- `TeamFilterAndSearch.js` (filter chips + scoped search; reused across Team/Schedule/Projects)

**Modified backend:**
- `backend/src/server.js` — register new route mounts
- `backend/src/services/eSignService.js` — extend `VALID_DOC_TYPES` and `DOC_TABLES` (lines 33–39)
- `backend/src/services/tools/registry.js` — add 11 tool metadata entries
- `backend/src/services/tools/categories.js` — add `SUBS`
- `backend/src/services/tools/handlers.js` — add 11 handlers + extend `get_daily_briefing()`

**Modified frontend:**
- `frontend/src/screens/ProjectDetailScreen.js` — Subcontractors section + Get Bids CTA
- `frontend/src/screens/ScheduleScreen.js`, `ProjectsScreen.js`, `WorkersScreen.js` (or equivalent team screen) — replace existing team filter with `TeamFilterAndSearch`
- `frontend/src/i18n/{en,es,pt}/common.json` — `subs.*` keys

## 7. Reused existing utilities

- `backend/src/services/eSignService.js` — extend (homegrown PDF + tokens, no per-envelope cost)
- `backend/src/services/emailService.js` — Resend client
- `backend/src/services/approvalGate.js` — Phase-1 gate handles new EXTERNAL_WRITE tools
- `backend/src/services/tools/registry.js:38` — `TOOL_METADATA` shape
- `backend/src/middleware/authenticate.js:15-38` — GC-side auth
- `backend/src/middleware/portalAuth.js` — pattern for `subAuth.js`
- `backend/src/routes/portal.js:41-147` — magic-link redemption pattern
- `frontend/src/utils/storage/projectDocuments.js` — file upload pattern
- `frontend/src/components/AuditTrail.js` — drop-in for subs and engagements
- Phase-1 ApprovalCard in `ChatScreen.js` — handles `pending_approval` natively
- Existing migration RLS template — `backend/supabase/migrations/20260421_project_docs_bucket.sql:20-31`

## 8. Verification (end-to-end)

After Phase J:

1. **Schema sanity** — query the 12 new tables, RLS denies what it should, every existing company has paired `sub_organizations` row.
2. **GC adds sub via Foreman** — "Add Mike's Plumbing as a plumbing sub..." → sub created, magic-link email sent.
3. **Sub uploads COI via magic link** — taps link, snaps photo, doc lands in vault.
4. **Sub signs up for Sub Free** — clicks "Create your free Sylk account" in next email, lands on portal, sees their existing data (profile, COI).
5. **Bid flow** — GC creates bid request for Smith Bath plumbing, invites Mike + 2 others, Mike submits $8,500 from his Sub Free portal, GC compares and accepts → engagement created, MSA auto-sent.
6. **Sign + payment** — Mike signs Work Order, GC records 50% deposit payment, balance shows correctly. Mike completes work, sends invoice, GC records final 50% payment.
7. **Compliance gate** — manually expire Mike's COI, banner appears on engagement, briefing surfaces it, renewal email auto-sent with fresh upload token.
8. **Filter chips** — open Schedule screen, tap "Subcontractors" chip, see only subs.
9. **Notifications** — every cross-role action triggers an email + in-app notification visible in Mike's Inbox tab and GC's notification bell.
10. **Upgrade flow** — manually trigger eligibility, Mike clicks upgrade, lands on `/sub/upgrade`, fills form, gets redirected to standard owner onboarding with his existing data already populated. Stripe trial active. Tab visibility now includes Projects/Customers/Crew/Foreman.
11. **No data movement on upgrade** — query Mike's `compliance_documents` and `sub_engagements` rows: same UUIDs as before upgrade.
12. **Tool eval** — run Foreman eval suite with sub prompts. EXTERNAL_WRITE tools route through approval gate.

```bash
cd /Users/moretti/Documents/construction-manager/backend
npm test -- subOrg subAction compliance engagement bidding invoice payment notification subUpgrade
npm run evals -- --filter=subs
```

## 9. Risks acknowledged

- **Solo dev shipping ~5-6 weeks of scope.** Each phase is testable independently — can pause after any phase. Phase A–G is the MVP; H–J can ship as a follow-up.
- **PII in W9 (SSN for sole props).** v1 stores in private bucket with RLS; encryption-at-rest is v2.
- **Doc forgery.** Manual GC verification + audit trail in v1; broker-API in v2.
- **Notification fatigue.** Per-event-type opt-out in settings from day one.
- **Sub portal mobile-web only.** Native sub app in a future phase.

## 10. Deferred to v2 (explicit)

- Lien waivers (4 types, state-statutory forms)
- Preliminary notices (CA 20-day, TX monthly, FL 45-day NTO, NY)
- Performance scoring + preferred/blacklist flags
- Broker-API insurance verification (Certificial / TrustLayer)
- Full pay-app cycle (G702/G703 line items, retention tracking with auto-cascade)
- Sub directory search (v1 = GC searches by EIN/name; v2 = full directory with filters by trade/state/availability)
- Sub-side mobile native app (v1 is mobile web)
- Brazil-specific INSS retainage logic (BR data model is in; activation is v2)
- Worker ↔ sub linking for badged-worker tracking (CA/NY)
- Two-way SMS for action tokens
- Granular per-GC document visibility (sub hides specific docs from specific GCs)

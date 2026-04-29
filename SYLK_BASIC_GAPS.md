# Sylk: The Basic-Stuff Gap Analysis

> Long-tail "expected" features that JobTread, Buildertrend, CoConstruct, BuildBook, and Houzz Pro have — that don't appear on Sylk's roadmap and would be missed by a contractor on Day 1.

**Scope:** This deliberately excludes the big strategic gaps already in the build plan (two-way SMS, e-sign, audit log, financing, lead pipeline, change orders, memberships, real-time job costing, QBO sync, GBB proposals, dispatch, punch list, cost catalog, vendor bills, sales tax, pricebook, field forms, route optimization, equipment, Foreman 2.0, MCP Hub, voice receptionist, knowledge graph). Everything below is the *unsexy* stuff the brother is right about.

**Methodology:** Help-doc and product-update crawl across competitor sites + Reddit / G2 / Capterra review tonality. Sources cited inline.

---

## 1. Executive Summary — Top 15 Missing Basics, Ranked by "Demo Pain"

Ranking criterion: how quickly a 5-year Buildertrend / JobTread user would stop, frown, and say "wait, where's the…?" within their first 30 minutes on Sylk.

| # | Gap | Why it stings | Effort |
|---|-----|---------------|--------|
| 1 | **Project / job templates** (start a kitchen remodel from a template that pre-loads phases, tasks, budget, selections, schedule) | Single biggest "I do 40 kitchens a year, don't make me rebuild" moment. JobTread, Buildertrend, BuildBook, CoConstruct all hero this. | M |
| 2 | **Comments & @mentions on every entity** (estimate, invoice, photo, task, document) — not just SMS to customer | This is the ambient "how the team talks" layer. Buildertrend ships a whole Notification Center around it. Without it, Sylk feels like a CRM, not a collaboration tool. | M |
| 3 | **Tags everywhere + saved/custom views with shared filters** | JobTread's identity. Once a user has "Kitchen Remodels — In Progress — Over Budget" pinned to home, you can't take it away. | M |
| 4 | **Custom fields on every entity** (jobs, customers, vendors, cost items) with type system (text/number/dropdown/date/boolean) | Mid-size GCs *demand* this. JobTread markets it as a top-3 feature. Without it Sylk looks rigid. | M |
| 5 | **Multiple contacts per customer + multiple properties per customer** (decision maker vs payer vs spouse; home + rental + commercial) | First demo question from any agency / property manager. Sylk currently has a flat customer→address model. | S |
| 6 | **Gantt with predecessor/successor dependencies** (drag one task, downstream shifts) | Buildertrend's signature scheduling moment. Sylk has drag-drop tasks but no dependency engine. | L |
| 7 | **Activity feed per project + per company** ("what changed" in last 24h) | Owners check this every morning with coffee. Without it they feel blind. | S |
| 8 | **Estimate revisions / versions** (V1 / V2 / V3 with diff & "revert") | Any remodel >$50k goes through 3-4 estimate rounds. Buildertrend ships proposal versioning natively. | M |
| 9 | **Selections / allowances workflow** (client picks tile, signs, allowance updates budget) | Buildertrend, CoConstruct, BuildBook all hero this. *Critical* for residential remodelers. Sylk has no selections concept at all. | L |
| 10 | **Cost-code hierarchy with category-level budget vs actual** (CSI MasterFormat or custom, drill into "cabinets are 12% over") | Real job costing demands this. Sylk has project-level P&L, not category-level. | M |
| 11 | **Document folders + photo albums + drawings viewer** with tags | Right now Sylk's docs are a flat list. JobTread/Buildertrend have folder templates per job. | M |
| 12 | **Bulk operations** (select 10 invoices, send all; bulk update status; CSV import for everything) | The first thing a power user reaches for. Not having it screams "MVP." | S |
| 13 | **Recurring tasks / to-dos** ("Every Monday: site walk checklist") | JobTread shipped this Aug 2025 as a flagship update. Operations people *live* in this. | S |
| 14 | **Warranty / service-claim workflow** post-completion (homeowner submits issue → ticket → assigned trade) | Buildertrend and CoConstruct both have dedicated warranty modules. Without it you lose every "warranty service" sales conversation. | M |
| 15 | **Site access notes per job** (gate code, dog, alarm code, parking, site contact different from customer) | Tiny field, used 100x/week. Crews call the office for gate codes when this is missing. | S |

---

## 2. Per-Category Findings

Each row: Competitor coverage → Sylk gap → Effort → Demo-visibility (would a demo prospect notice on Day 1? Yes / Maybe / No).

### 2.1 Project & Schedule Depth

| Feature | Competitor coverage | Sylk gap | Effort | Demo-visible |
|---------|--------------------|--------|--------|--------------|
| Project templates (phases + tasks + budget + selections pre-loaded) | JobTread "Schedule & To-Dos Template Library" (May 2025 release) + budget templates; Buildertrend "templates cover everything from permitting to walkthrough"; BuildBook & CoConstruct both have. Front-page hero. | No template system — every job starts blank | M | **Yes** |
| Gantt with predecessor / successor dependencies | Buildertrend Gantt links items so moving one shifts the rest ("waterfall"); JobTread Gantt with dependencies inside templates | Sylk has phase/task drag-drop but no dependency engine | L | **Yes** |
| Sub-tasks / WBS / hierarchy | Buildertrend "Checklist within a To-Do = sub-tasks"; JobTread task groups | Flat task list | S | Maybe |
| Personal "To-Dos" separate from project tasks | Buildertrend distinguishes To-Dos (personal/team reminders) from Schedule items; JobTread distinguishes To-Dos (one-off) from Tasks (calendar items) | Sylk only has project tasks | S | Maybe |
| Recurring tasks | JobTread Aug 2025: weekly/monthly/annually frequency; Buildertrend recurring To-Dos and Tasks | None | S | Maybe |
| Multi-resource calendar view (who's working where this week) | JobTread Gantt across all assignees; Buildertrend agenda/list/calendar/Gantt views | Sylk has dispatch board planned but no unified calendar across all resources today | M | Maybe |
| Time-off / vacation tracking | Implicit in JobTread "working days + exceptions"; not heavily marketed | None | S | No |
| Holiday calendar per company / org-level working days | JobTread admin-controlled working days, exceptions, holidays | None | S | No |
| Job-site-specific schedules (different start/end times per site) | Buildertrend "designate workdays" per scheduled item | None | S | No |

### 2.2 Communication & Collaboration

| Feature | Competitor coverage | Sylk gap | Effort | Demo-visible |
|---------|--------------------|--------|--------|--------------|
| Real-time team chat per project (separate from customer SMS) | Buildertrend Chat (Direct Chat + per-job Messages inbox); JobTread comments on jobs with @-mentions | Sylk has owner→customer SMS but no internal team chat | M | **Yes** |
| @mentions on comments — w/ in-app + email notification | Buildertrend "you were mentioned" notification type; JobTread @customers / @vendors / @contacts in any comment | None | S | **Yes** |
| Comments / discussion threads on **every** entity (estimate, invoice, photo, doc, task) | Buildertrend comments per feature item; JobTread same | Comments not present at entity level | M | **Yes** |
| Activity feed per project + per company ("Summary widget") | Buildertrend Summary page widget shows latest comments across all jobs; JobTread custom dashboard activity feed tile | None | S | **Yes** |
| Notification hub / center with per-channel preferences (in-app / email / SMS) | Buildertrend Notification Center fully featured; JobTread custom notifications | Sylk push notifications exist but no unified center / preferences | M | Maybe |
| Read / unread state | Buildertrend "no alert when new message" was a complaint — but it does track read/unread in inbox | None | S | Maybe |
| Email notifications on entity changes (configurable) | Buildertrend per-entity email triggers configurable in Notification Center | None | M | Maybe |
| File sharing inside chat | Buildertrend Chat supports doc/image attachments | Will ride on chat build | — | — |

### 2.3 Customer Model Depth

| Feature | Competitor coverage | Sylk gap | Effort | Demo-visible |
|---------|--------------------|--------|--------|--------------|
| Multiple properties per customer | JobTread customers have multiple "locations"; Buildertrend Client Contacts assignable to many jobs | Sylk: customer → one address | S | **Yes** |
| Multiple contacts per customer (decision maker / payer / spouse / property mgr) | JobTread multiple Customer Contacts per Customer; Buildertrend Client Contacts many-to-many with jobs | Sylk: one contact per customer | S | **Yes** |
| Multiple emails / phones per contact | JobTread custom field types include Email + multi-value | Single email, single phone | S | Maybe |
| Customer status taxonomy (lead / prospect / active / inactive / lost / referral) | Buildertrend CRM with statuses; JobTread Customer Status custom field convention | Will partially come with lead pipeline build but ensure status taxonomy is broad enough to include "lost," "warranty," "referral source" | S | Maybe |
| Communication preferences (this customer prefers email; weekly cadence) | Buildertrend client-level notification opt-ins; not heavily marketed | None | S | No |
| Tags on customers | Buildertrend "tags across features"; JobTread tags | None | S | **Yes** |
| Customer types (residential / commercial / property mgr / GC) | JobTread customer type custom field; Buildertrend Job Types/Groups | None | S | Maybe |
| Customer notes vs project notes vs contact notes (separate notebooks) | Buildertrend has Internal Notes / Sub-Vendor Notes / Customer Notes distinct fields | Sylk's notes model is flat | S | No |

### 2.4 Estimate & Quote Sophistication

| Feature | Competitor coverage | Sylk gap | Effort | Demo-visible |
|---------|--------------------|--------|--------|--------------|
| Versions / revisions (V1, V2, V3) with diff + revert | Buildertrend Proposal Dashboard shows past proposal versions inline + revert; JobTread implicit through document versioning | Sylk: estimates are mutable, no version history | M | **Yes** |
| Expiration dates + auto follow-up | Buildertrend proposal expirations; standard across all | Likely none | S | Maybe |
| Markup by category (different % for materials vs labor vs subs) | Buildertrend "default markup/margin per Cost Type" (Aug 2025 release); JobTread per-item + global markup | Sylk has flat markup | S | Maybe |
| Measurements / quantities with units (LF, SF, CY, EA) | Buildertrend units field on cost items; JobTread units of measure setup + job parameters for site dimensions | Likely no formal unit system | S | Maybe |
| Customizable PDF templates per company | Buildertrend custom proposal templates; JobTread "Customize & Send Documents" + custom email templates | Likely uses single template | M | Maybe |
| Saved estimate templates per service type | All competitors have | Already partially planned via "estimate cost catalog" — confirm template-as-package not just line-item | — | — |
| Optional / upgrade line items the customer can include or exclude | Buildertrend "Mark Group as Optional" (June 2025 release) lets client toggle; JobTread "built-in upgrade options" | None | M | **Yes** |
| Tax modes (per-line / per-category / single-line) | All competitors handle | Will come with sales-tax build — make sure not just single-line | — | — |
| Cost-plus / open-book contract mode | CoConstruct + JobTread support cost-plus showing actuals to client | None | M | No (but **Yes** for cost-plus shops) |

### 2.5 Document & Photo Organization

| Feature | Competitor coverage | Sylk gap | Effort | Demo-visible |
|---------|--------------------|--------|--------|--------------|
| Folders + folder templates per job | Buildertrend default folder templates per job; JobTread default + per-job folders | Flat list | S | **Yes** |
| Document categories (contracts / permits / plans / specs / receipts) | Buildertrend & JobTread folder defaults | None | S | Maybe |
| Document versioning + check-in/check-out | Buildertrend "real-time versions of document history" | None | M | No |
| Photo albums / tags | Buildertrend Files = Docs+Photos+Videos with folders; JobTread file tags + multi-tag share | None formal | S | Maybe |
| Drawing/PDF viewer + annotations (arrows, text, shapes) | Buildertrend "expanded shapes, colors, stamps" markups; JobTread free-draw, shapes, arrows, text, polylines, timestamps with stroke + fill + transparency | Likely none | M | Maybe |
| Photo annotation (blur faces, arrows on photos) | Both | None | S | Maybe |
| Photo metadata preservation (geo, timestamp, taker) | Buildertrend GPS-stamped photos in daily logs; JobTread captures camera metadata | Partial | S | No |
| Bulk drag-and-drop upload | Standard | Confirm | S | Maybe |

### 2.6 Job Costing & Accounting Depth

| Feature | Competitor coverage | Sylk gap | Effort | Demo-visible |
|---------|--------------------|--------|--------|--------------|
| Cost codes with hierarchy (CSI MasterFormat or custom; division → section → subsection) | JobTread cost codes (importable via CSV); Buildertrend Cost Codes Overview; standard for any pro | Sylk has expense categories but not a hierarchical cost-code system | M | **Yes** |
| Cost types (Labor / Material / Sub / Equipment / Other) | Buildertrend Cost Types with default markup per type; JobTread cost types in setup | None | S | **Yes** |
| Budget vs actual at category level (not just project level) | Standard everywhere | Sylk only has project-level P&L | M | **Yes** |
| Committed cost tracking (open POs counted against budget) | JobTread Vendor Orders; Buildertrend POs with committed-vs-billed | Will come with vendor bills/AP build — confirm "committed" surface in budget view | — | — |
| Burden rate / labor multiplier (loaded labor cost) | Standard | None known | S | No |
| Time-card → cost-code mapping | Buildertrend Time Clock with cost codes; JobTread time entries with cost codes | Sylk has time tracking but unclear if cost-code mapped | S | Maybe |
| Per-category profit margin (material profit vs labor profit) | JobTread "Custom Views and Live Reports" by cost type | None | M | No (but loved by power users) |
| Profit-margin alerts at category granularity | JobTread thresholds in custom dashboards | None | S | No |

### 2.7 Customization & Power-User Features

> This is where JobTread *wins* against Buildertrend. It's the entire reason mid-size GCs switch.

| Feature | Competitor coverage | Sylk gap | Effort | Demo-visible |
|---------|--------------------|--------|--------|--------------|
| Tags on every entity, color-coded | JobTread "task types with custom colors," tags on files, jobs, etc.; Buildertrend "tags across features" | None | S | **Yes** |
| Custom fields per entity (text/number/dropdown/date/boolean, with required + multi-value) | JobTread Custom Fields on Jobs, Customers, Customer Contacts, Vendors, Cost Items; Buildertrend Custom Fields | None | M | **Yes** |
| Saved views / filters (private + shared with team) | JobTread custom views with gear icon, save, share with org, pin as default; Buildertrend grids w/ filter+export | None | M | **Yes** |
| Saved searches | Side effect of saved views | None | — | — |
| Custom statuses per entity | JobTread customizable Job/Customer status pipelines | Sylk likely fixed-set statuses | S | Maybe |
| Color coding (jobs, tasks, customers, statuses) | JobTread + Buildertrend liberal color use | Limited | S | Maybe |
| Sort / group / filter on every list view | JobTread + Buildertrend default grids support all | Confirm Sylk's lists do this consistently | S | Maybe |
| Pinned items / pinned views as default home | JobTread pin saved view as login default; Buildertrend favorites | None | S | Maybe |
| Custom dashboards per role (Admin assigns dashboard to role) | JobTread Custom Dashboards (April–May 2025 launch) — drag-drop tiles, action items, activity feeds, charts, filtered data, KPI thresholds | None | L | **Yes** (this is JobTread's "wow" moment) |

### 2.8 Bulk Operations

| Feature | Competitor coverage | Sylk gap | Effort | Demo-visible |
|---------|--------------------|--------|--------|--------------|
| Bulk send (select 10 invoices, email all) | Buildertrend mass-pay bills/POs; bulk markup application | None | S | **Yes** |
| Bulk update status / tag / assignee | Buildertrend checked-actions on POs/Bills; JobTread bulk-edit catalog | None | S | **Yes** |
| Bulk delete with safety confirmation | Standard | None | S | Maybe |
| CSV import for everything (customers, vendors, jobs, cost codes, catalog items, time entries) | JobTread "Data Import - Cost Codes" + customer/job imports; Buildertrend imports | Sylk has receipt scanning but limited CSV import | M | **Yes** |
| Bulk export (CSV + Excel) | Standard | Confirm presence per list | S | Maybe |
| Floating batch-action toolbar when items selected | Standard UI pattern | None | S | Maybe |

### 2.9 Warranty & Post-Job

| Feature | Competitor coverage | Sylk gap | Effort | Demo-visible |
|---------|--------------------|--------|--------|--------------|
| Warranty tracking per project (start date, end date, scope) | Buildertrend dedicated Warranty module; CoConstruct Warranty phase preserves project read-only; warranty-claim workflow with assignment + photo upload | None | M | **Yes** for residential remodelers |
| Warranty claim → service-ticket workflow | Buildertrend: client submits claim with photos/videos/urgency → assign internal user or trade partner → notify | None | M | **Yes** for remodelers |
| Annual maintenance reminders for past clients | Sylk's recurring service plans cover this — but only if you market it. Buildertrend doesn't excel here, so this is potential differentiation. | Partial | — | — |
| Post-completion service plans | Sylk's strength — recurring routes — *if* tied to completed projects | Tie-in missing | S | No |

### 2.10 Bid Management (sub-side, less critical for service shops)

| Feature | Competitor coverage | Sylk gap | Effort | Demo-visible |
|---------|--------------------|--------|--------|--------------|
| Multi-bid tracking (sub bidding to multiple GCs on same project) | JobTread Bidding flow — request bids on budget line items, embed PDF, sub fills units + prices | Sylk service-side only — bids are inverse direction | M | No (only matters to subs) |
| Bid comparison view side-by-side | JobTread side-by-side comparison + award | None | M | Maybe |
| Win/loss reasons | Standard CRM concept | Will partially come with lead pipeline | S | No |
| Bid templates | JobTread budget templates double as bid templates | None | S | No |

### 2.11 Job-Site Logistics

| Feature | Competitor coverage | Sylk gap | Effort | Demo-visible |
|---------|--------------------|--------|--------|--------------|
| Site access notes (gate code, alarm, dog, lock combo) | Buildertrend Job Information page with internal-only and sub-visible note splits | None as dedicated field | S | **Yes** |
| Site contact different from customer (tenant, property manager) | Buildertrend Client Contacts many-to-many; JobTread multiple contacts | Falls out of multi-contact build | S | Maybe |
| Parking instructions | Notes-field convention, not dedicated | None | S | No |
| Required PPE / safety briefing | Implied via daily-log safety notes; not a dedicated feature in any competitor | None | S | No |
| Site hours (when crews can be there) | JobTread working days/exceptions per job override | None | S | No |

### 2.12 Owner Visibility

| Feature | Competitor coverage | Sylk gap | Effort | Demo-visible |
|---------|--------------------|--------|--------|--------------|
| Activity feed across all projects | Buildertrend Summary widget; JobTread dashboard tiles | None | S | **Yes** |
| Multi-project real-time dashboard | JobTread Custom Dashboards (their flagship); Buildertrend Business Insights | Sylk dashboard exists but unclear if multi-project drill-down | M | **Yes** |
| Drill-down on any metric | Standard | Confirm | S | Maybe |
| Date-range comparisons (this month vs last; YoY) | Buildertrend Business Insights timeframe filters | Partial | S | Maybe |
| Owner-defined KPIs (with thresholds + goals) | JobTread "low/high thresholds for KPI tracking" | None | M | Maybe |

### 2.13 Reporting & Exports

| Feature | Competitor coverage | Sylk gap | Effort | Demo-visible |
|---------|--------------------|--------|--------|--------------|
| Pre-built report library (P&L, AR aging, time by employee, project status, WIP, profitability, cashflow) | Buildertrend built-in reports: Work-in-Progress, Cashflow, Profitability, Invoicing | Sylk has financial suite — confirm WIP + cashflow projection reports | M | **Yes** |
| Custom report builder | Buildertrend Business Insights; JobTread custom views = de facto reports | None | L | Maybe |
| Scheduled report email (weekly P&L every Monday) | Buildertrend scheduled reports | None | S | Maybe |
| Export PDF + CSV + Excel | Buildertrend export to Excel from any grid; JobTread CSV from any table | Mix | S | Maybe |
| Print-friendly formatting | Standard | Confirm | S | No |

### 2.14 Sub & Vendor Workflow

| Feature | Competitor coverage | Sylk gap | Effort | Demo-visible |
|---------|--------------------|--------|--------|--------------|
| Sub portal (sees assigned work, uploads completion proof, receives POs/work orders) | Buildertrend Sub Portal; JobTread Vendor Portal — both unlimited free users | None | L | **Yes** |
| Sub onboarding workflow (W-9, COI, license) | Buildertrend tracks COI compliance + integrations; JobTread "tracks COIs and licenses" | None | M | **Yes** |
| 1099 generation / annual sub reporting | Buildertrend generates 1099s; QBO sync handles for both | Will come with QBO sync but ensure native fallback | S | Maybe |
| Vendor catalog / preferred vendors with performance scoring | JobTread custom fields on Vendor Accounts (rate, performance scoring) | None | S | No |
| Vendor performance scoring | Custom-field convention in JobTread | None | S | No |

### 2.15 Misc Workflow

| Feature | Competitor coverage | Sylk gap | Effort | Demo-visible |
|---------|--------------------|--------|--------|--------------|
| Mileage tracking from GPS | Buildertrend has GPS time clock + geofencing but **mileage tracking specifically is a known gap** in Buildertrend (per reviews) — opportunity for Sylk | None | M | Maybe |
| Receipt categorization rules ("Home Depot always = materials") | Standard ML categorization; Sylk has receipt scanning — extend | Partial | S | No |
| Recurring expenses (insurance, software subs) | Standard accounting feature | None | S | No |
| Time-off requests + approval workflow | None of the construction tools have strong TOR; Buildertrend partial | None | M | No |
| Crew check-in / check-out photos | Buildertrend daily logs include crew photos; not enforced check-in | Partial | S | No |
| Pre-task safety briefings with sign-off | Implied via daily logs; not explicit feature | None | M | No |
| End-of-day photos / "leave site clean" checklist | Daily log convention | None as enforced flow | S | No |
| Material delivery scheduling | Buildertrend Schedule items can be deliveries; JobTread same | Falls out of dispatch | — | — |
| Equipment scheduling (crane, lift, dumpster) | JobTread tasks across resources; not equipment-typed | None | M | No (until equipment build lands) |

---

## 3. The "Polish" List

These individually look small. Together they're the difference between "this product feels mature" and "this product feels like an MVP." Most of these are 1–3 day frontend lifts each; bundled together they're the highest ROI work in this entire document.

1. **Tags everywhere** with color picker. JobTread's signature texture.
2. **Saved views** on every list, with private + shared, pin as default home.
3. **Sort, group, filter** on every list with persistent settings per user.
4. **Color coding** of statuses, job types, task types, tags.
5. **Bulk-action toolbar** that floats when ≥1 row selected (send, update, delete, tag, assign).
6. **Inline edit** on list rows (don't make me open a modal to change a status).
7. **Pinned items / favorites** on every entity type.
8. **@mention everywhere** there's a comment box — autocomplete users + customers + vendors.
9. **"What changed" activity sidebar** on every detail page (last 50 events).
10. **Read/unread state** on messages, comments, notifications.
11. **Notification preferences hub** — per-channel (in-app / email / SMS) per-event-type.
12. **Default folder structure templates** per job (Plans/Permits/Contracts/Photos/Receipts auto-created).
13. **Custom fields** on jobs/customers/vendors/cost-items with type system.
14. **Custom statuses** per workflow (don't lock customers into "active/inactive").
15. **CSV import wizards** for customers, vendors, cost catalog, time entries, jobs.
16. **CSV/Excel export** from every list.
17. **Print-friendly view** on every detail page (estimate, invoice, daily report).
18. **Empty-state coaching copy** on every list ("No saved views yet — pin your first filter").
19. **Keyboard shortcuts** for power users (⌘K command palette, j/k navigation).
20. **Inline @-mentions in SMS to team chat hand-off** (mention a teammate in a customer thread → it spawns an internal sidebar discussion the customer doesn't see).

---

## 4. Per-Competitor Signature Features

### Buildertrend's "secret weapons"
- **Daily Logs with weather + GPS-stamped photos** — this is *the* feature subs and supers love. It's what every comparison article leads with.
- **Selections + Allowances** — drives a *huge* % of residential remodel sales. Client picks tile online, signs, allowance auto-updates budget.
- **Notification Center** — channel-by-channel granularity, "you were mentioned" type, per-feature toggles.
- **Warranty module** — homeowner submits claim with photos, urgency, becomes ticket auto-routed to trade partner.
- **Sub Portal** — included free, lets subs see assigned work, daily logs, and complete to-dos. This is the magic.
- **Mass pay bills** — checkbox-bulk pay subs through Chase integration.

### JobTread's "secret weapons"
- **Customizability** — tags, custom fields, custom statuses, custom views, custom dashboards. This is *the* sales pitch vs Buildertrend ("Buildertrend is rigid, JobTread bends to you").
- **Custom Dashboards (Apr 2025)** — drag-drop tiles, KPIs with thresholds, role-assigned home screens.
- **Cost Catalog + Budget Templates** — the "JobTread is fastest at estimates" claim is real. Pre-built reusable items + assemblies.
- **Bid management to subs** — request bids on line items, embed PDFs, side-by-side compare, award flips into vendor order.
- **Photo / PDF annotation tools** — rich (free draw, polylines, timestamps, transparency, fill).
- **Recurring tasks & to-dos** (Aug 2025).
- **Capture email replies** — email a customer from JobTread, their reply lands back in JobTread thread. Subtle but huge.
- **Spanish-language gap** — *known weakness* in JobTread per reviews. Sylk's bilingual potential is a real wedge.

### CoConstruct's "secret weapons" (note: CoConstruct is being sunset / merged into Buildertrend, but the workflows survived)
- **Selections-first** flow — selections drive the entire project, including budget reconciliation.
- **Warranty as a project phase** — when project completes, it doesn't disappear; it transitions to a read-only "Warranty" state with continued comm + claims.
- **Specs & Selections + Estimates & Job Costing** unified — toggle a setting and budget appears with markup/margin/tax variance tracking.

### BuildBook's "secret weapons"
- **Simplicity** — *no training required* is their entire pitch. $79/mo, 2-screen-deep workflows.
- **Selections multi-view** — board / list / room views.
- **Always-on budget vs actuals** — front and center, not buried.

### Houzz Pro's "secret weapons"
- **Estimate Builder with built-in local labor + material costs database** — hard for Sylk to match without partnering.
- **Takeoff → Estimate** integration.
- **Lead funnel from Houzz marketplace** — Houzz's actual moat, not buildable.
- **Client Dashboard** — clean approvals + timelines view.

---

## 5. Recommended Additions to the Build Sequence

These are the top 10 to *insert* into the existing Sylk roadmap, in order. Sequencing matters because each unlocks the next.

### Tier 1 — Must ship before any serious demo
*(Without these, demos go off the rails fast.)*

1. **Project Templates** — pre-loaded phases + tasks + budget + selections + schedule.
   - **Sequence:** Build alongside / immediately after estimate cost catalog. Templates ARE the catalog applied to a job.
   - **Effort:** M (1–2 weeks)
   - **Note:** Make this layered: an org-level library + per-service-type templates + the ability to clone any past job as a template. This is JobTread's stealth weapon.

2. **Tags + Custom Fields + Saved Views** (one umbrella project — they share infrastructure).
   - **Sequence:** Build once, ripple across every list. Do this *before* the dispatch board / lead pipeline so they inherit it.
   - **Effort:** M (2 weeks for the framework, then trivial per-entity)
   - **Note:** This is a single architectural decision. Get it right early or pay forever.

3. **Comments + @mentions on every entity + Activity Feed**
   - **Sequence:** Do alongside two-way SMS — they share the messaging substrate.
   - **Effort:** M (1.5 weeks)
   - **Note:** Foreman 2.0 should be able to read this feed and summarize "what changed today" — bonus AI integration.

4. **Multi-contact + multi-property customer model**
   - **Sequence:** Schema migration. Do ASAP — it gets harder every week.
   - **Effort:** S (3–5 days for schema + UI)
   - **Note:** Critical for property-manager / agency customers (ICP).

5. **Cost-code hierarchy + budget vs actual at category level**
   - **Sequence:** Do alongside the real-time job costing build that's already planned.
   - **Effort:** M (1.5 weeks)
   - **Note:** Use CSI MasterFormat as a default importable pack. Allow custom override.

### Tier 2 — Ship before residential-remodeler ICP push
*(These kill any deal where the customer is doing kitchen / bath / addition work.)*

6. **Selections / Allowances workflow** — client picks options online, signs, allowance updates budget.
   - **Sequence:** After change-orders complete (already planned). Shares e-sign infrastructure.
   - **Effort:** L (2.5 weeks)

7. **Estimate revisions / versions** with diff & revert, expiration dates, optional line-item groups.
   - **Sequence:** Quick win after estimate cost catalog ships.
   - **Effort:** M (1 week)

8. **Document folders + photo albums + drawing/PDF viewer with annotations**
   - **Sequence:** Standalone — can run in parallel to anything.
   - **Effort:** M (2 weeks; PDF.js + annotation lib)

9. **Warranty workflow** — claim → ticket → trade assignment.
   - **Sequence:** After service-plan / dispatch (existing strength) — warranty is *just* a service ticket with a different intake form. Reuse infrastructure.
   - **Effort:** M (1 week)

### Tier 3 — Polish that makes the product feel mature

10. **The Polish List bundle** (tags everywhere, saved views, bulk actions, color coding, inline edit, custom statuses, notification hub, recurring tasks, site access notes, sub-tasks).
    - **Sequence:** Continuous, after Tier 1 + 2. One sprint per ~5 polish items.
    - **Effort:** S each, but compounds.
    - **Note:** This is the difference between "this is impressive but feels new" and "this feels like a 3-year-old product."

---

## 6. What NOT to Worry About (Marketed Heavily, Actually Minor)

Don't get distracted chasing these. Competitors hero them but in real use they're rarely decisive:

- **AI-everything banners** — every competitor slapped AI on their landing page in 2025. Sylk's Foreman is already deeper than any of them.
- **Houzz Pro's "Takeoff → Estimate"** — sounds great, real-world adoption is low because takeoffs require trained operators. Don't chase.
- **"Real-time chat" as a UI feature** — async comments + @mentions + email notify covers 90% of the value. Don't build a Slack clone.
- **Procore-style RFI + Submittal + Punchlist formality** — pure commercial-GC territory. Sylk's ICP doesn't need it.
- **3D visualization / VR** — sales demo eye candy, never gets used. Skip entirely.
- **Built-in invoicing inside chat** — Stripe-payment-link in SMS is already what Sylk does and is better.

---

## 7. The Honest "Day 1" Test

If a 5-year Buildertrend or JobTread user opened Sylk tomorrow, here's what they'd notice missing in their **first 30 minutes**, in order:

1. *"Where do I clone a project template?"* — within 2 minutes
2. *"How do I tag this customer as 'commercial' and filter to just commercial?"* — within 5 minutes
3. *"Why can't I add a second contact to this customer?"* — within 5 minutes
4. *"Where do I @mention my super on this estimate?"* — within 10 minutes
5. *"Where's the activity feed showing what changed today?"* — within 10 minutes
6. *"How do I revise this estimate without overwriting V1?"* — within 15 minutes
7. *"Where do I add the gate code and alarm code for this site?"* — within 20 minutes
8. *"Why is there only one markup % — I want different markups for materials vs labor?"* — within 20 minutes
9. *"How do I send these 8 invoices in one click?"* — within 25 minutes
10. *"Why can't I make my own dashboard?"* — within 30 minutes

Every one of these is in the Top-15 Executive Summary above. Build those, the brother's complaint goes away.

---

## 8. Sources

### Buildertrend
- [Buildertrend Product Overview](https://buildertrend.com/product-overview/)
- [Buildertrend Glossary](https://buildertrend.com/help-article/buildertrend-glossary/)
- [Buildertrend Schedule / Gantt](https://buildertrend.com/project-management/schedule/)
- [Buildertrend To-Dos on Mobile](https://buildertrend.com/help-article/to-dos-on-mobile/)
- [Buildertrend Setup & Customization FAQs](https://buildertrend.com/help-article/buildertrend-setup-customization-faqs/)
- [Buildertrend Estimate Overview](https://buildertrend.com/help-article/estimate-overview/)
- [Buildertrend Setting Default Markup/Margin](https://buildertrend.com/help-article/setting-default-markup-margin/)
- [Buildertrend Selections & Allowances Overview](https://buildertrend.com/help-article/selections-and-allowances-overview/)
- [Buildertrend Selections Software](https://buildertrend.com/project-management/construction-selections-software/)
- [Buildertrend Reports Overview](https://buildertrend.com/help-article/reports-overview/)
- [Buildertrend Custom Reporting / Business Insights](https://buildertrend.com/custom-reporting/)
- [Buildertrend Construction Warranty](https://buildertrend.com/project-management/construction-warranty/)
- [Buildertrend Document Management Software](https://buildertrend.com/communication/construction-document-management-software/)
- [Buildertrend Annotating Documents](https://buildertrend.com/help-article/annotating-documents/)
- [Buildertrend Improved Annotations and File Markups](https://buildertrend.com/product-updates/improved-annotations-and-file-markups/)
- [Buildertrend Chat](https://buildertrend.com/communication/construction-communication-app/)
- [Buildertrend Navigating Communication Tools](https://buildertrend.com/help-article/navigating-communication-tools/)
- [Buildertrend Time Clock](https://buildertrend.com/project-management/construction-time-clock/)
- [Buildertrend August 2025 Product Improvements](https://buildertrend.com/help-article/august-2025-current-product-improvements/)
- [Buildertrend June 2025 Product Improvements](https://buildertrend.com/help-article/june-2025-current-product-improvements/)
- [Buildertrend Mass Pay Bills & POs with Chase](https://buildertrend.com/help-article/mass-pay-bills-purchase-orders-with-chase/)
- [Buildertrend Client Contacts Overview](https://buildertrend.com/help-article/client-contacts-overview/)
- [Buildertrend Daily Logs](https://buildertrend.com/project-management/daily-logs/)
- [Buildertrend Daily Logs on Mobile](https://buildertrend.com/help-article/daily-logs-on-mobile/)

### JobTread
- [JobTread Custom Fields](https://www.jobtread.com/features/custom-fields)
- [JobTread Custom Fields - Jobs](https://app.jobtread.com/help/custom-fields-jobs)
- [JobTread Custom Fields - Vendor Accounts](https://app.jobtread.com/help/custom-fields-vendor-accounts)
- [JobTread Custom Fields - Cost Items](https://app.jobtread.com/help/custom-fields-cost-items)
- [JobTread Custom Table Views](https://app.jobtread.com/help/custom-table-views)
- [JobTread Custom Views - Jobs](https://app.jobtread.com/help/custom-views-jobs)
- [JobTread Custom Views - Catalog](https://app.jobtread.com/help/custom-views-catalog)
- [JobTread Recurring Tasks & To-Dos (Aug 2025)](https://www.jobtread.com/product-updates/2025-08-07-recurring-tasks-to-dos)
- [JobTread Schedule & To-Dos Template Library (May 2025)](https://www.jobtread.com/product-updates/2025-05-09-schedule-to-dos-template-library)
- [JobTread Tasks & Scheduling](https://www.jobtread.com/features/tasks-and-scheduling)
- [JobTread Custom Dashboards (Apr 2025)](https://www.jobtread.com/product-updates/2025-04-25-custom-dashboards)
- [JobTread Reporting & Dashboards](https://www.jobtread.com/features/reporting-and-dashboards)
- [JobTread Cost Catalog](https://www.jobtread.com/features/cost-catalog)
- [JobTread Budgeting Software](https://www.jobtread.com/features/budgeting)
- [JobTread Estimating](https://www.jobtread.com/features/estimating)
- [JobTread Construction Bidding](https://www.jobtread.com/features/bidding)
- [JobTread File Management](https://www.jobtread.com/features/file-management)
- [JobTread File Folders](https://app.jobtread.com/help/file-folders)
- [JobTread File Tags](https://app.jobtread.com/help/file-tags)
- [JobTread Photo Markup & Annotations](https://www.jobtread.com/product-updates/2024-03-15-photo-markup-annotations)
- [JobTread CRM - Managing Your Customers](https://www.jobtread.com/connect/prep/crm-managing-your-customers)
- [JobTread Customer Portals](https://www.jobtread.com/features/customer-portals)
- [JobTread Vendor & Subcontractor Management](https://www.jobtread.com/features/vendor-and-subcontractor-management)
- [JobTread Custom Notifications](https://app.jobtread.com/help/custom-notifications)
- [JobTread Custom Views and Reporting](https://www.jobtread.com/blog/custom-views-and-reporting)
- [JobTread Targeted Messaging and File Sharing](https://www.jobtread.com/blog/targeted-messaging-and-file-sharing)
- [JobTread Global Catalog and Template Library (Jan 2025)](https://www.jobtread.com/product-updates/2025-01-14-global-catalog-and-template-library)
- [JobTread Adjusting a Schedule and Setting a Baseline](https://app.jobtread.com/help/adjusting-a-schedule-and-setting-a-baseline)
- [JobTread BuilderTrend Alternative](https://www.jobtread.com/buildertrend-alternative)

### CoConstruct
- [CoConstruct How It Works](https://www.coconstruct.com/how-it-works)
- [CoConstruct Specs and Selections](https://www.coconstruct.com/learn-construction-software-features/specs-and-selections)
- [CoConstruct Estimates & Job Costing](https://www.coconstruct.com/learn-construction-software/what-changes-if-i-use-the-estimates-job-costing-feature-on-a-project)
- [CoConstruct Setup Guide](https://www.coconstruct.com/learn-construction-software/coconstruct-setup-guide)
- [CoConstruct Warranty Information](https://www.coconstruct.com/learn-construction-software/how-can-i-post-important-warranty-information-to-my-clients)

### BuildBook
- [BuildBook Project Management Tools](https://buildbook.co/project-management-tools)
- [BuildBook Client Selections Software](https://buildbook.co/client-selections-software)
- [BuildBook Construction Scheduling](https://buildbook.co/construction-scheduling-software)
- [BuildBook Task Management](https://buildbook.co/construction-task-management-software)

### Houzz Pro
- [Houzz Pro for Pros - Software Construction](https://pro.houzz.com/for-pros/software-construction)
- [Houzz Pro for Pros - Software Remodeler](https://pro.houzz.com/for-pros/software-remodeler)
- [Houzz Pro for Pros - Software Construction Project Management](https://pro.houzz.com/for-pros/software-construction-project-management)
- [Houzz Pro for Pros - Software Construction CRM](https://pro.houzz.com/for-pros/software-construction-crm)
- [Houzz Pro Best Productivity Tools](https://pro.houzz.com/pro-learn/blog/the-best-of-houzz-pro-productivity-tools-to-take-control)

### Comparisons & Reviews
- [Buildertrend vs JobTread - Software Advice 2026](https://www.softwareadvice.com/construction/buildertrend-profile/vs/jobtread/)
- [Buildertrend vs JobTread - Capterra](https://www.capterra.com/compare/70092-218503/Buildertrend-vs-JobTread)
- [JobTread Review 2026 - Stackvett](https://stackvett.com/jobtread-review/)
- [Buildertrend Review 2026 - The Digital Project Manager](https://thedigitalprojectmanager.com/tools/buildertrend-review/)
- [JobTread vs Buildertrend - Projul](https://projul.com/competitors/jobtread-vs-buildertrend/)
- [Buildertrend vs CoConstruct vs Method - Method](https://www.method.me/blog/buildertrend-vs-coconstruct-vs-method/)
- [Construction Cost Codes - Procore](https://www.procore.com/library/construction-cost-codes)
- [2026 Guide to CSI MasterFormat - Archdesk](https://archdesk.com/blog/2026-guide-csi-masterformat)
- [Reddit-sourced field/mobile complaints - Workyard](https://www.workyard.com/compare/best-field-crew-time-tracking-apps-with-location-verification)
- [W-9, COI & Subcontractor Compliance - TheVendorDocs](https://thevendordocs.com/for/us-contractors)

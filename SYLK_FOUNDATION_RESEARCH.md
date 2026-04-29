# Sylk Foundation Research — JobTread vs Housecall Pro

Research date: 2026-04-28. Focus: foundational operational features only. Marketing/CRM/reporting fluff filtered out.

---

## 1. JobTread — Core Features (project-based contractors)

### Customer & data model
- **CRM with leads, customers, vendors, subs, jobs** as distinct entities.
- **Multi-contact customers**: customers have a `Customer Contacts` entity (custom fields exist on it), so multiple contacts per customer is supported. Locations are also a separate entity (multi-property implied via Locations + Jobs).
- **Custom fields** on Cost Items, Locations, Customers, Customer Contacts, Jobs, Vendors, Vendor Contacts.
- **Tags + folders** for files.
- **Activity feed** per job, customer, vendor, with multi-pick filters.

### Estimating / sales
- Estimates, proposals, **takeoff with formula-based quantities** (Quantity Formula Builder, Mar 2026).
- **Cost Catalog** with templates and pre-built items.
- **Bid Requests** to subs/vendors (digital).
- **Contracts + eSignatures**.
- **Selections & Allowances** — recently redesigned (Feb 2026) with **Job Areas** (room/area grouping) and **Selection Option Groups** (Apr 2026) for cleaner client choices. **Convert Budget Templates → Selection Templates** (Apr 2026).

### Project management
- **Project / job templates**: templates in Catalog with task groups, lengths, dependencies, assignees; pull into a job's schedule.
- **Tasks & scheduling** with dependencies.
- **Daily Logs** with photos, comments, real-time activity.
- **Files / photos / videos** centralized.
- **Job Specifications** (Jan 2025) — dynamic doc that syncs budget item names, descriptions, files; share via portal or QR.
- **Sub & Vendor Portals** (digital bid + task completion).
- **Time tracking** (field crew entry, office approval, **Sync Time Entry Rates to QBO Payroll** Feb 2026).

### Job finances
- **Budgeting** with templates.
- **Change Orders** (scope + payment tracking).
- **Job Costing** (projection vs actual).
- **POs / Work Orders** electronic.
- **Sub & Vendor Billing** (bill comparison).
- **Customer Invoices** (one-click from order). **AIA-style payment applications** (Apr 2026, commercial).
- **Cost-plus invoices** with grouping/sorting controls (Feb 2026).
- **Online payments**, homeowner financing marketplace.
- **Warranties** tracking.

### Client experience
- **Customer Portal** (per-job progress site, doc sharing).
- **Communication / messaging** to customer.

### What's NEW in 2025–2026 (highlight reel)
- **JobTread AI Connector** (Apr 13, 2026) — connect Claude (and others) directly to JobTread. "Anything you can do in JobTread can now be supported through AI."
- **AI Autofill for Web Clipper** (Mar 2026) — extracts item details from supplier sites.
- **Selections redesign with Job Areas** (Feb 2026) — biggest UX update.
- **Selection Option Groups** + **Budget→Selection Template conversion** (Apr 2026).
- **Supplier integrations**: Home Depot, SRS, PoolCorp, Heritage — live catalog browsing inside JobTread (Jan–Apr 2026). This is the new growth surface.
- **AIA payment applications** (Apr 2026).
- **Group documents by custom fields** (Jan 2026).

---

## 2. Housecall Pro — Core Features (service businesses)

### Customer & data model
- **Customers** with **Property Profiles** — service history + equipment per location.
- **Tags on clients** (fully custom).
- Custom fields exist but are limited compared to JobTread; tagging is the primary segmentation tool.

### Scheduling / dispatch
- **Scheduling** for new + recurring jobs.
- **Dispatching** with auto-routing.
- **Drag-and-drop calendar**.
- **Job Routing Optimization** with live GPS.
- **GPS vehicle tracking**.

### Estimating / proposals
- **Estimates** that convert to invoices.
- **Sales Proposal Tool** with visual docs.
- **E-Signatures on estimates** (Jan 2025 release — flagship feature).
- **Price Book** (flat-rate pricing).

### Job execution / mobile
- **Mobile app (iOS + Android)** for techs.
- **Offline mode**: read-only. Jobs + scheduling viewable offline; **editing offline is NOT supported**.
- **Checklists** per job.
- **In-app chat** between customer + tech.
- **Card reader** for in-field payment.

### Financial
- **Invoicing** with auto-reminders, QuickBooks sync.
- **Payment processing** (cards, ACH, financing).
- **Instapay** (deposits in 30 min).
- **Job Costing**.
- **Time Tracking**.

### Recurring revenue
- **Recurring Service Plans** / maintenance plans / memberships.

### Communication
- **In-app chat**, SMS, email reminders built in.

### Subcontractor model
- **Light support only** — can assign jobs and share details via mobile app. **No sub bidding, POs, contract management, or document/schedule sharing with outside crews** (per third-party reviews). Not a real sub-contractor workflow.

### Project mode (multi-day with phases)?
- **NOT really.** HCP is built around single-visit and recurring-visit jobs. The Custom Home Builder page mentions "job management" but **no phase/multi-day construction project structure**. Long-form projects are forced into stretched jobs.

### What's NEW in 2025–2026 (highlight reel)
- **CSR AI** — answers calls + books jobs 24/7 (heavily marketed).
- **Voice to Invoicing** — create invoices via voice.
- **Help AI / Analyst AI / Coach AI** — business insights.
- **E-signatures on estimates** (Jan 2025, big release — 25 features).
- **Bluon HVAC integration** (20M+ HVAC models, OEM parts).
- **Lead Form + Customer Portal website integrations**.
- **Fall 2025 release** — booking + customer experience polish.

---

## 3. Universal Essentials — what BOTH have

| Feature | JobTread | Housecall Pro |
|---|---|---|
| Customer + property data | Yes (Customer + Locations + Contacts) | Yes (Customer + Property Profiles) |
| Estimates → Invoice | Yes | Yes |
| E-signatures | Yes (contracts) | Yes (Jan 2025, estimates) |
| Invoicing + payment collection | Yes | Yes |
| Online payments | Yes | Yes (+ Instapay, card reader) |
| Job costing | Yes | Yes |
| Scheduling (jobs + tasks) | Yes | Yes |
| Mobile app (iOS/Android) | Yes | Yes |
| Time tracking | Yes | Yes |
| Photo/file management | Yes | Yes |
| Customer portal | Yes (per-job site) | Yes (account-level) |
| Tags | Yes (files, etc.) | Yes (clients) |
| QuickBooks sync | Yes | Yes |
| AI features | AI Connector (Claude, Apr 2026), Web Clipper autofill | CSR AI, Voice-to-Invoice, Coach AI |
| In-app messaging | Yes | Yes |

---

## 4. JobTread-Only Essentials (project-based DNA)

- **Project / job templates** with task groups, dependencies, assignees.
- **Selections & Allowances** (with Job Areas, Option Groups).
- **Change Orders** as a first-class workflow.
- **Daily Logs** as a structured artifact.
- **Subcontractor + Vendor Portals** (real bid + task completion workflow).
- **Bid Requests** to multiple subs.
- **POs / Work Orders** electronic.
- **Bill comparison** for sub/vendor invoices.
- **Job Specifications** doc (synced from budget).
- **Takeoff + Quantity Formula Builder**.
- **Budget templates** (vs actual job costing).
- **Cost-plus invoice** logic.
- **AIA payment applications**.
- **Custom fields on every entity** (deep).
- **Warranties** tracking.
- **Live supplier catalog integrations** (Home Depot, SRS, PoolCorp, Heritage) — **the growth surface**.

---

## 5. Housecall Pro-Only Essentials (service-based DNA)

- **Recurring service plans / memberships** as a first-class revenue model.
- **Property equipment tracking** auto-attached to property.
- **Drag-and-drop dispatch board** with route optimization.
- **Live GPS tracking** of vehicles + techs.
- **Card reader** hardware for in-field payment.
- **Instapay** (rapid deposit).
- **Flat-rate Price Book** (codified for service trades).
- **CSR AI** (answers phones, books jobs).
- **Voice-to-Invoice**.
- **Bluon HVAC parts database** integration (vertical-specific).
- **Recurring/auto-scheduled visits**.

---

## 6. Honest Signal — what's "the thing" vs buried

### JobTread — what they put in the demo video
- **Selections + Job Areas** (the new hotness — front and center).
- **Supplier integrations** (Home Depot etc.) — heavy marketing.
- **AI Connector** with Claude — flagship, Apr 2026.
- **Budget → Job Costing** loop (the spine).
- **Customer Portal** (eye candy for clients).

### JobTread — what's quietly foundational but buried
- **Custom fields everywhere** — the real reason the product is sticky.
- **Activity feed + filters** — quiet but essential.
- **Sub/Vendor portals** — huge differentiator vs HCP, not loudly marketed.
- **Daily Logs** — used daily, talked about rarely.
- **Templates** (project + task) — power-user feature, not in the headline reel.

### Housecall Pro — what they put in the demo video
- **CSR AI** — heaviest marketing push of 2025–2026.
- **Dispatch board / drag-drop scheduling** — the iconic shot.
- **Mobile app for techs** — front and center.
- **Instapay + card reader** — money-movement glamour.
- **Online booking + customer portal**.

### Housecall Pro — what's quietly foundational
- **Property profiles + equipment tracking** — runs the whole service-history loop, rarely the headline.
- **Recurring service plans** — the actual revenue engine for HVAC/plumbing.
- **Price Book** — boring but where every shop lives.
- **QuickBooks sync** — the reason they don't churn.

### The signal for Sylk
- **Both products lean hard on AI in 2025–2026 marketing**, but the foundational feature set is unchanged: customer + property + job + money loop.
- **JobTread's wedge into 2026 is supplier integrations + AI Connector** (Claude). They're commoditizing estimating data entry.
- **HCP's wedge is voice AI replacing the front desk** (CSR AI).
- **Subcontractors are JobTread's moat.** HCP has not closed this gap.
- **Phase-based projects are JobTread's moat.** HCP has not closed this gap either.
- **Offline mobile is a real gap on both.** HCP is read-only; JobTread isn't loudly offline-first either.
- **Multi-contact + multi-property** is solved on JobTread (Locations + Customer Contacts), weaker on HCP (Property Profiles attached to one customer).
- **Custom fields + tags + comments + activity feed** are table stakes for any modern B2B ops product. JobTread does this better than HCP.

For Sylk, the universal foundation across both is: customers + properties + estimates + invoices + payments + scheduling + mobile + portal + tags/custom fields + activity feed. Then split into project-mode (JobTread DNA) vs route-mode (HCP DNA).

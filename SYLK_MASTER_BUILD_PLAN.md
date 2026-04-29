# Sylk — Master Build Plan to Win the Market

_Date: 2026-04-28. Author: build manifesto for David. Goal: not parity with Buildertrend / JobTread / ServiceTitan — supremacy in the project + route + hybrid service-business segment._

---

## The thesis

Sylk wins by being the only platform that does **all three at once**: project-based jobs, route-based recurring services, and the hybrid in between — fully bilingual (EN/ES/PT), voice-first, with Foreman as the universal command interface. Every other tool is single-mode (only projects, only routes) and English-only. That's the moat.

This document is the complete build list to get there. Treat it like a war plan, not a wishlist. Each stream below is independently runnable. Split across terminals and machines.

---

## Quick Wins (Week 1 — bang these out for momentum)

These are 1-3 day shipments that cost almost nothing and unlock outsized value. Do these BEFORE starting the long work.

| # | Feature | Why fast | Stream |
|---|---------|----------|--------|
| QW1 | **Wire Twilio SMS (outbound + inbound webhook)** | Schema already exists per audit. Just plumb it. | Comms |
| QW2 | **Auto review request post-job-complete** | Hooks into existing job-complete event. Twilio + Resend. | Marketing |
| QW3 | **E-signature on estimates + contracts** (HelloSign/Dropbox Sign API or DIY w/ canvas + audit log) | Portal already exists; just add `/sign/:token` route. | Sales |
| QW4 | **"Pay this invoice" link in SMS** (Stripe Checkout) | Stripe is wired. One-link flow. Text-to-pay parity with Housecall Pro. | Comms |
| QW5 | **Apple Pay / Google Pay in portal** | Stripe Payment Element. One config flag. | Payments |
| QW6 | **Audit log table + middleware** (who changed what, when, IP) | Cheap to build, huge trust signal at mid-market. | Platform |
| QW7 | **Public read-only API key per owner** (Bearer token, rate-limited) | Foundation for Zapier later. | Platform |
| QW8 | **"Refer a friend" link in customer portal** | Free leads. Track referrer → reward. | Marketing |
| QW9 | **Geofence enforcement on clock-in** (verify worker is at job site) | Buildertrend brags about it. You have GPS already. | Field ops |
| QW10 | **Daily-summary email to owner at 6pm** (jobs done, hours logged, invoices sent, payments received) | Foreman composes it. Already has the data. | Foreman |

Ten things. Most under 4 hours each. Knock them all out in Week 1, ship a polished release, generate buzz.

---

## Parallel Work Streams (6 streams — split across terminals/machines)

The streams below are designed to run in parallel without merge conflicts. Each owns its own files/routes/tables. Pick 2-3 to run simultaneously; queue the rest.

---

### STREAM A — Communications & Customer Experience

**Goal:** Customers feel like Sylk is their concierge. SMS, email, voice, push — all unified.

#### A1. Twilio two-way SMS inbox (S — 3 days)
- Twilio number per company (provision via API on signup)
- Inbound webhook → message stored in `sms_messages` table → linked to customer
- Unified team inbox (all team members see same threads)
- Threaded by phone number / customer
- Unread badges, mark-as-read
- Foreman can read/draft/send replies via tool: `send_sms`, `read_thread`
- File: `backend/src/routes/sms.js`, `backend/src/services/twilioService.js`
- Webhook: `/webhooks/twilio/sms`

#### A2. Resend email integration (S — 2 days)
- Branded email templates (welcome, estimate sent, invoice sent, payment received, daily report ready)
- Owner replies-to address (no-reply or owner's actual email)
- Track opens/clicks (Resend webhooks)
- File: `backend/src/services/emailService.js` (already exists — extend)

#### A3. Two-way email sync (Gmail/Outlook OAuth) (M — 2 weeks)
- OAuth flow for Gmail + Microsoft Graph
- Pull emails to/from customer addresses, attach to customer record
- Send from owner's Gmail via OAuth (real From: address, not a Sylk relay)
- "Snooze," "convert to task," "convert to estimate request" actions
- File: `backend/src/services/emailSyncService.js`

#### A4. AI Receptionist (Foreman Voice) (M-L — 3-4 weeks)
- Twilio Voice → Deepgram STT → Foreman → ElevenLabs TTS → Twilio Voice
- 24/7 inbound call handling (qualify lead, book appointment, take a message, escalate to human)
- Books straight into the calendar
- Multi-lingual (caller speaks Spanish → Foreman replies in Spanish)
- Recording + transcript stored per call
- File: `backend/src/services/voiceReceptionist.js`
- Beats Housecall Pro CSR AI on language coverage

#### A5. Live tech tracking + "Tech is on the way" SMS link (M — 1 week)
- Worker app sends GPS every 60s while clocked in to active visit
- Customer gets SMS: "John is 12 min away [view live →]"
- Public tracking link with map + ETA + tech name + photo
- File: `frontend/src/screens/worker/TripTracker.tsx` + `website/src/app/track/[token]/page.tsx`

#### A6. Push notifications upgrade (S — 2 days)
- Already have Expo push; add: customer push on portal milestones
- Quiet hours per user
- Notification preferences UI
- File: `backend/src/services/notificationService.js` (extend)

#### A7. WhatsApp Business API (M — 1-2 weeks)
- Meta Business Cloud API for Hispanic/Brazilian markets where WhatsApp dominates over SMS
- Send estimates, invoices, photos, schedule via WhatsApp
- File: `backend/src/services/whatsappService.js`

---

### STREAM B — Sales & Customer Acquisition

**Goal:** Close more deals, faster, at higher ticket sizes. Lead → quote → signed contract → deposit collected, all in one flow.

#### B1. E-signature with audit trail (S-M — 5 days)
- Native canvas signature + IP + timestamp + device + user agent
- Tamper-evident PDF generation post-sign
- Store signed PDFs in Supabase Storage
- Apply to: estimates, contracts, change orders, selections, daily reports
- File: `backend/src/services/eSignService.js`, `frontend/src/components/SignaturePad.tsx`

#### B2. Lead pipeline / CRM module (M — 2-3 weeks)
- New entity: `leads` (separate from `projects`)
- Pipeline stages (configurable): Inquiry → Site visit scheduled → Estimate sent → Estimate viewed → Won → Lost
- Kanban board view + list view
- Lead source attribution (which marketing channel)
- Conversion analytics (channel ROI, win rate by stage, sales-cycle length)
- Auto-convert lead → project on signed estimate
- File: `backend/src/routes/leads.js`, `frontend/src/screens/owner/LeadPipeline.tsx`

#### B3. Automated follow-up sequences (S-M — 1 week)
- Trigger: estimate sent N days ago, no response → auto-text reminder
- Trigger: lead in Inquiry stage > 48h → notify owner
- Trigger: invoice 7/14/30 days overdue → auto-text + escalate
- Configurable rules per company
- File: `backend/src/services/automationEngine.js`

#### B4. Consumer financing (Wisetack + Acorn Finance) (S-M — 1-2 weeks)
- Wisetack OAuth + API integration
- "Apply for financing" CTA on estimate share + portal invoice
- Pass amount + customer to Wisetack; webhook approval back
- "From $X/mo" pricing on quotes (compute monthly @ Wisetack APR)
- Sylk gets paid in full immediately; customer pays Wisetack over time
- File: `backend/src/services/wisetackService.js`

#### B5. Good-Better-Best proposal mode (M — 1.5 weeks)
- New estimate type: 3-tier proposal
- Customer picks tier in portal → auto-generate signed contract + invoice
- Tier templates per service (HVAC: bronze/silver/gold packages)
- File: `backend/src/services/proposalGenerator.js`

#### B6. Estimate / cost-item catalog (S-M — 1 week)
- Saved line items library (qty, unit price, markup, tax category)
- "Standard kitchen remodel" template = bundle of line items
- Foreman can pull from catalog: "estimate a kitchen remodel" → uses templates + catalog
- File: `backend/src/routes/catalog.js`

#### B7. Selections + Allowances (M-L — 4-6 weeks, only if remodel-heavy)
- Selection entity → Options → tied to Allowance → tied to Estimate Line Item
- Customer browses image grid in portal, picks, signs
- Approval auto-creates change order if over allowance, updates revised budget
- File: `backend/src/routes/selections.js`, `website/src/app/portal/[project]/selections/`

#### B8. Online booking widget (M — 2 weeks)
- Embed JS snippet for customer's website
- Customer picks service + slot, respects technician zones/skills/availability
- Lands as draft visit; auto-confirm rule per company
- Google Reserve integration (book direct from Google search)
- File: `website/src/app/booking/[company]/page.tsx`, embedded JS at `widget.sylkapp.com`

#### B9. Lead capture form generator (S — 3 days)
- Auto-generate hosted contact form per company (`get-quote.sylkapp.com/[company]`)
- Form fields configurable per business type
- Submissions land as leads
- Embed code or hosted page
- File: `website/src/app/quote/[company]/page.tsx`

#### B10. Lead aggregator integrations (M — 1 week each, optional)
- Angi, Thumbtack, Houzz, HomeAdvisor, Networx
- Inbound lead webhook → land as lead in pipeline
- File: `backend/src/integrations/leadAggregators/`

---

### STREAM C — Financial Depth & Accounting

**Goal:** No bookkeeper resistance. No prospect ever says "but does it sync to QuickBooks?"

#### C1. QuickBooks Online two-way sync (L — 6-8 weeks)
- OAuth + Intuit Developer app
- Sync: Customers, Vendors, Items (cost catalog), Estimates, Invoices, Bills, Payments, Deposits, Time entries
- Bidirectional with conflict resolution UI
- Initial migration wizard (pull existing QB data into Sylk)
- File: `backend/src/services/quickbooksService.js`, dedicated module
- This is THE biggest moat — once shipped, you no longer lose to "but it doesn't sync to QB"

#### C2. QuickBooks Desktop sync (M — 2-3 weeks, optional)
- Web Connector XML protocol
- Some old-school HVAC/roofing shops still on Desktop
- File: `backend/src/services/qbDesktopService.js`

#### C3. Real-time job costing (M — 2-3 weeks)
- New view per project: budget vs committed (open POs + signed contracts) vs actual (paid bills + payroll) vs forecast (committed + uncompleted phases × labor estimate)
- Variance alerts: ">10% over forecast"
- WIP report: % complete × contract value vs billed-to-date = over/under-billed
- File: `backend/src/services/jobCostingEngine.js`, `frontend/src/screens/owner/JobCosting.tsx`

#### C4. Vendor bills / accounts payable (M — 1.5 weeks)
- New entity: `vendor_bills` (separate from one-off expenses)
- Enter bill → assign to PO + project + cost code → schedule payment
- Bill aging report
- ACH or check-print export
- File: `backend/src/routes/bills.js`

#### C5. Purchase orders (M — 1.5 weeks)
- PO creation with line items, vendor, project
- Approval workflow (above $X requires owner approval)
- Receive against PO (mark partial / full receipt)
- 3-way match (PO ↔ receipt ↔ bill)
- File: `backend/src/routes/purchaseOrders.js`

#### C6. Sales tax automation (S-M — 1 week)
- Per-zip tax rate lookup (use Avalara or built-in rate table)
- Per-line-item tax category
- Auto-apply on invoices
- Tax report by jurisdiction for filing
- File: `backend/src/services/taxService.js`

#### C7. Multi-currency support (S — 4 days)
- Per-company default currency
- Per-customer currency override
- Foreman speaks in customer's currency
- File: `backend/src/services/currencyService.js`

#### C8. Automated payment reminders (S — 3 days)
- 7/14/30 days overdue → auto SMS + email
- Escalation: 60 days → owner notification
- Stop reminders on payment received
- File: integrated into `automationEngine.js`

#### C9. Subscription billing for customers (M — 2 weeks)
- Membership / service agreement model (monthly/quarterly/yearly)
- Auto-charge per period via Stripe
- Prepaid visit credits (unlimited tune-ups, 4 visits/year, etc.)
- Member discount auto-applied
- Renewal reminders + upsell offers
- File: `backend/src/services/membershipService.js`

#### C10. Stripe payouts dashboard (S — 2 days)
- Show owner: pending payouts, fees paid YTD, payment volume by method
- File: `frontend/src/screens/owner/PayoutsDashboard.tsx`

---

### STREAM D — Field Operations & Service Excellence

**Goal:** Workers love the app. Owners get visibility. Customers get reliability. Beat ServiceTitan/Jobber on field experience.

#### D1. Dispatch board (M — 2 weeks)
- Drag-drop visual schedule of techs vs jobs
- Skill/zone/equipment matching (job needs an electrician with a lift truck — auto-suggest who's available)
- Drag a job onto a tech → SMS notification + push to worker app
- Color-code by job type, status, urgency
- Visualization for routes too (route-based businesses see route board)
- File: `frontend/src/screens/owner/DispatchBoard.tsx`

#### D2. Smart route optimization (M — 2 weeks)
- TSP solver for daily routes (minimize drive time)
- Constraint-aware: time windows, tech skill requirements, equipment, traffic
- Re-optimize on the fly when jobs change
- File: `backend/src/services/routeOptimizer.js`

#### D3. Punch list module (M — 1.5 weeks)
- Per-project punch list with photo annotation
- Pin location on uploaded plan/photo
- Assign to worker, track status
- Customer-visible in portal at end-of-job
- File: `backend/src/routes/punchlist.js`

#### D4. Photo workflow upgrade (S-M — 1 week)
- Per-project photo gallery with tags (room, phase, before/after)
- AI-suggested tagging (vision API: "this looks like a kitchen photo")
- Before/after pair view
- One-click share to portal / social / email
- File: `backend/src/services/photoService.js`

#### D5. Daily report enhancements (S — 4 days)
- Voice-to-text daily report (Foreman generates structured log from spoken summary)
- Auto-pull weather data based on project address
- Auto-pull manpower from time clock entries
- Auto-pull materials from receipts uploaded that day
- File: `backend/src/services/dailyReportGenerator.js`

#### D6. Field forms / inspections (M — 2 weeks)
- Custom JSON forms per company
- Conditional logic (if "yes" then show field X)
- Required signatures, photo attachments
- Templates: OSHA toolbox talk, QA checklist, safety pre-task plan, COVID screening
- File: `backend/src/routes/forms.js`, `frontend/src/components/DynamicForm.tsx`

#### D7. Equipment / tool tracking (M — 1.5 weeks)
- Asset registry per company
- Check-out/in to projects or workers
- QR code on asset → scan to check out
- Maintenance log + warranty + value
- File: `backend/src/routes/equipment.js`

#### D8. Customer equipment tracking (HVAC focus) (S-M — 1 week)
- Per-address equipment registry (AC unit, model, serial, install date, warranty)
- Service history per unit
- Renewal/replacement reminders
- Warranty alerts
- File: `backend/src/routes/customerEquipment.js`

#### D9. Pricebook / flat-rate library (M — 2 weeks)
- Trade-specific flat-rate book (HVAC, plumbing, electrical)
- Smart upsell suggestions (if you do diagnostic + repair, recommend tune-up too)
- Regional pricing benchmarks (anonymized aggregate from Sylk users)
- File: `backend/src/routes/pricebook.js`

#### D10. Offline mobile mode (M — 2 weeks)
- Worker app caches active jobs locally
- Queue actions (clock in/out, photos, daily report) when offline
- Sync when back online
- Conflict resolution per action type
- File: `frontend/src/services/offlineQueue.ts`

#### D11. Time approval workflow (S — 4 days)
- Crew leads can approve/edit team's time before it goes to payroll
- Audit trail on edits
- Edit reasons required
- File: `frontend/src/screens/supervisor/TimeApproval.tsx`

---

### STREAM E — Marketing, Reviews, Growth

**Goal:** Sylk users grow faster than competitors' users. Free flywheel features that compound revenue.

#### E1. Review automation (S — 3 days, COVERED IN QUICK WINS)
- Post-job auto-text "How'd we do?" → 5-star scale
- 4-5★ → push to Google review link
- 1-3★ → internal feedback form
- Per-tech attribution → bonus eligibility
- File: `backend/src/services/reviewAutomation.js`

#### E2. Email marketing campaigns (M — 1.5 weeks)
- Audience segmentation (past customers, recurring members, leads in stage X)
- Template library (seasonal, promotional, win-back)
- Schedule + send via Resend
- Open/click tracking
- File: `backend/src/routes/campaigns.js`

#### E3. Referral program (S — 4 days)
- Referral code per customer
- "Refer a friend, get $50" — reward auto-issued on referee's first paid invoice
- Track referral chain
- File: `backend/src/routes/referrals.js`

#### E4. Before/after gallery for marketing (S — 3 days)
- Owner picks photos to publish to public marketing page
- Shareable link per gallery (`gallery.sylkapp.com/[company]`)
- Auto-generated social media posts (Instagram, Facebook)
- File: `website/src/app/gallery/[company]/page.tsx`

#### E5. Auto-generated marketing site (M — 1.5 weeks)
- Each Sylk company gets `[company].sylkapp.com` auto-provisioned
- Editable content blocks (services, photos, reviews, contact form, booking widget)
- Lead form embedded → lands as lead in pipeline
- SEO-optimized, mobile-responsive
- Custom domain support (CNAME to Sylk)
- File: `website/src/app/[company]/page.tsx`

#### E6. Direct mail integration (M — 1 week, optional)
- Lob.com or Click2Mail API
- Trigger postcards from automations: "60-day no contact" or "winter HVAC tune-up"
- Templates with merge fields
- File: `backend/src/services/directMailService.js`

#### E7. Call tracking with dynamic numbers (M — 1 week, optional)
- Twilio number per ad campaign
- "Where did this customer come from?" auto-attribute calls
- Recording + AI scoring (booked vs not booked)
- File: `backend/src/services/callTracking.js`

---

### STREAM F — Foreman & Platform Intelligence

**Goal:** Foreman becomes the most capable AI agent in any vertical SaaS, period. The agent IS the product.

#### F1. MCP server (S-M — 1 week, BIG STRATEGIC WIN)
- Wrap your existing 82 tools in MCP protocol
- "Connect Claude.ai to Sylk" — same headline as JobTread, neutralizes pitch
- Power users use their own Claude subscription = your AI cost goes to zero for them
- File: `backend/src/mcp/server.js`

#### F2. Bring-your-own-Claude-key tier (S — 3 days)
- Owner enters their Anthropic API key in settings
- Foreman uses their key instead of Sylk's
- Unlimited usage tier @ premium subscription price
- File: `backend/src/services/aiClient.js` (extend)

#### F3. Foreman scheduled background work (M — 1 week)
- Cron-style "do this every morning at 6am" for the agent
- Examples: "review yesterday's reports and flag issues," "send overdue invoice reminders," "review tomorrow's schedule for conflicts"
- Owner configures recurring agent tasks via natural language
- File: `backend/src/services/agentScheduler.js`

#### F4. Foreman proactive alerts (M — 1 week)
- Agent watches for patterns and pings owner: "Project ABC is trending 15% over budget — want me to draft a change order?"
- Cash-flow forecasting alerts
- Cross-project insights ("you have 3 projects waiting on the same Permit Bureau — call them once for all 3")
- File: `backend/src/services/agentInsights.js`

#### F5. Foreman team mode (M — 2 weeks)
- Multiple users in same company can chat with Foreman
- Foreman knows who's asking and respects role permissions
- Foreman can route: "I'll let your bookkeeper know" → notifies bookkeeper
- Memory is per-company AND per-role
- File: `backend/src/services/agentRouting.js`

#### F6. Voice-driven workflows (S-M — 1 week)
- Worker-on-jobsite voice flows: "Foreman, log 2 hours on Smith kitchen, took photos, drywall is done"
- Foreman: clocks time, attaches photos, marks task done, adds to daily report
- Hands-free for crews
- File: extend `frontend/src/screens/worker/VoiceCapture.tsx`

#### F7. Smarter receipt processing (S — 2 days)
- Already have receipt scanning. Add: auto-match to PO, auto-allocate to project, learn vendor preferences
- Foreman: "found a $342 Home Depot charge — should I assign to Smith kitchen like usual?"
- File: extend `backend/src/services/receiptProcessor.js`

#### F8. Foreman in dispatch (M — 1.5 weeks)
- Owner: "Foreman, who should take the Johnson HVAC call tomorrow morning?"
- Agent considers: tech skills, location, current load, customer history, route optimization
- Suggests + reasons
- File: extend tool: `agent_dispatch_recommendation`

#### F9. Foreman knowledge graph (M — 2 weeks)
- Build per-company semantic index: customers, projects, vendors, materials, equipment, history
- RAG-style retrieval for complex queries
- "Find all projects where we used Sherwin-Williams paint and went over budget on materials"
- File: `backend/src/services/knowledgeGraph.js`

#### F10. Spec-mode (Foreman builds workflows) (L — 3 weeks)
- Owner describes a workflow in plain language: "every time a kitchen project hits drywall stage, schedule the electrician for following Tuesday and notify the homeowner"
- Foreman writes it as a structured automation
- Owner reviews and activates
- File: `backend/src/services/workflowBuilder.js`

---

### STREAM G — Compliance, Subcontractors, Enterprise (Optional, Defer Unless Pursuing)

Skip unless going after $1M+ residential remodelers or commercial subs.

- **Subcontractor portal + COI/W-9 tracking + 1099 prep** (M)
- **Lien waivers** (state-specific PDFs + e-sign + tracking) (M)
- **Insurance certificate expiration alerts** (S)
- **Certified payroll WH-347** (M)
- **AIA G702/G703 progress billing + retainage + SOV** (L) — only for commercial subs
- **OSHA safety log + permit tracking** (M)

---

### STREAM H — Roofing-Specific (Build Only If Chasing Roofing Vertical)

- **EagleView / Hover / GAF QuickMeasure integration** (S-M)
- **Insurance supplement workflow** (mortgage check, depreciation, supplements) (M)
- **ABC Supply / SRS / Beacon / QXO direct material ordering** (M each)
- **Roof visualizer** (drop materials onto photo) (L)
- **In-home tablet sales mode w/ offline contracts** (M)

---

### STREAM I — Pest Control / Lawn / Pool Specifics (Build Only If Chasing)

- **Chemical / pesticide tracking** (state-regulated) (S)
- **Vegetation mapping / tree inventory** (M, niche)
- **Multi-property recurring service templates** (S)
- **Member auto-renewal + prepaid credit visit packages** (M, also useful for HVAC)

---

### STREAM J — Platform Foundation (Run alongside everything)

#### J1. Public REST API + API key per owner (S — 3 days, COVERED IN QUICK WINS)
- All major resources (customers, projects, invoices, leads) accessible via Bearer token
- OpenAPI spec auto-generated
- Per-key rate limits + scopes
- File: `backend/src/routes/api/v1/`

#### J2. Webhooks for outbound events (S — 3 days)
- Owner configures webhook URLs
- Events: invoice.paid, lead.created, project.status_changed, payment.failed
- Retries + delivery logs
- File: `backend/src/services/webhookService.js`

#### J3. Zapier app (M — 1 week)
- Triggers (paid invoice, new lead, completed visit) + Actions (create estimate, send invoice, add customer)
- Submit to Zapier directory
- File: `backend/src/integrations/zapier/`

#### J4. Make.com + n8n compatibility (S — 1 day)
- These both work via webhook + API key (J1 + J2)
- Just document and submit to their directories

#### J5. Audit log infrastructure (S — 3 days, COVERED IN QUICK WINS)
- Middleware on every write
- `audit_log` table: actor, action, entity, before/after, IP, timestamp
- Search/filter UI for owner
- File: `backend/src/middleware/auditLog.js`

#### J6. Granular permissions / roles matrix (M — 1.5 weeks)
- Beyond owner/supervisor/worker: office_manager, bookkeeper, sales_rep, dispatcher
- Per-resource permissions matrix (read/write/delete on each entity type)
- Custom roles with permission picker
- File: `backend/src/services/permissionsService.js`

#### J7. Multi-location / multi-company support (M — 2 weeks)
- Owner can manage multiple locations (franchises) under one login
- Per-location branding, billing, team
- Cross-location reporting
- File: `backend/src/services/multiLocationService.js`

#### J8. White-label custom domain (S — 4 days)
- Customer portal at `portal.[customer-domain].com` via CNAME
- Email from `team@[customer-domain].com` via Resend custom domain
- Full white-label per Enterprise tier
- File: `backend/src/services/customDomainService.js`

#### J9. Data export & migration tools (S-M — 1 week)
- One-click CSV export of every entity
- "Migrate from Buildertrend / JobTread / Jobber" import wizard
- Foreman can do it: "import my customers from this CSV"
- File: `backend/src/services/migrationService.js`

#### J10. Backups + disaster recovery (S — 2 days)
- Daily Supabase logical backups to S3
- Point-in-time recovery enabled
- Customer-initiated data export anytime (GDPR-style)
- File: `scripts/backup.sh`

#### J11. Performance optimization pass (M — 1 week)
- Add DB indexes on hot paths
- Query profiling + N+1 elimination
- Frontend bundle size analysis
- Image lazy-loading + CDN
- Cache layer (Redis) for expensive aggregations
- File: across the codebase

#### J12. SOC2 prep (L — ongoing 3-6 months, only if going enterprise)
- Audit logging, access controls, encryption-at-rest verification, vendor reviews
- Required for any prospect with a security questionnaire
- Engage an auditor (Vanta, Drata) when ready

---

## How to split across terminals & machines

**Right now you have:**
- MacBook Pro (this — runs Expo + simulator + primary Claude)
- MacBook Air (dev environment, secondary Claude)
- Mac Mini (Forge running autonomously, hub)

**Recommended parallel allocation:**

| Terminal | Machine | Worktree branch | Stream |
|----------|---------|----------------|--------|
| 1 | Pro | `main` | Quick Wins (QW1-QW10) — knock out fast |
| 2 | Air | `feature/comms` | Stream A (SMS, email, voice receptionist) |
| 3 | Pro (parallel) | `feature/qbo` | Stream C1 (QuickBooks — long-running, dedicated focus) |
| 4 | Mac Mini (Forge) | autonomous | Stream F (Foreman improvements + MCP server) |

That's **4 streams running in parallel**. The 5th and 6th streams (D, E) come online once the first wave ships.

### Setting up the worktrees (run from `/Users/moretti/Documents/construction-manager`)

```bash
git worktree add ../sylk-comms -b feature/comms
git worktree add ../sylk-qbo -b feature/qbo
git worktree add ../sylk-foreman -b feature/foreman-mcp
```

Mutagen will sync each worktree to the Mac Mini and Air automatically. Open a terminal in each and run `claude`.

---

## Force multipliers (the 10x stuff that goes BEYOND parity)

These are features competitors don't have. Build at least 3 of them and Sylk genuinely becomes the best:

1. **Foreman as the universal interface.** Every screen has a "ask Foreman" button. Most actions in the app can be done by voice/text instead of clicks. Competitors have AI sidebars; Foreman IS the app.

2. **Tri-lingual everything.** UI, voice, customer-facing materials, marketing site builder, AI receptionist. No competitor has Portuguese at all. Spanish coverage is shallow elsewhere.

3. **Project + route + hybrid native.** No other tool serves a landscaper who mows weekly + installs $40K patios in one workflow. This is positioning gold — make it the homepage hero.

4. **Foreman scheduled background work + proactive alerts.** Other tools have AI as a chat sidebar. Foreman should run continuously and surface insights without being asked. "Your AR is up 22% this month — want me to send reminders to the top 5 overdue?"

5. **Auto-generated marketing site per customer.** Every Sylk subscriber gets a free website + booking widget + lead form. Competitor add-ons cost $50-150/mo extra. Bundle it.

6. **MCP server + bring-your-own-Claude key.** Power users save money by using their own subscription. JobTread has the first; nobody has the second.

7. **Mobile-first dispatch + voice-driven worker app.** Workers control everything by voice on jobsite. Competitors require typing on tiny screens.

8. **One-shot creation from natural language.** "Schedule a kitchen remodel for the Smiths starting Tuesday, with electrical, drywall, paint phases." Already partially built — extend to ALL workflows.

9. **Cross-customer benchmarks (anonymous).** "Your average kitchen remodel: 6 weeks. Industry: 8 weeks. You're 25% faster." Powered by aggregated data. Marketing-quality data.

10. **Foreman can speak for the owner via voice receptionist.** Customers call after-hours, Foreman answers in three languages, books work, escalates real emergencies. Other tools have basic AI receptionists in English only.

---

## Anti-goals — DO NOT BUILD

These either don't fit your ICP or are death-by-feature-bloat:

- ❌ AIA G702/G703 (commercial only)
- ❌ Lien waivers (commercial only — defer until enterprise tier)
- ❌ RFIs / Submittals / spec books (commercial GC only)
- ❌ Plan/blueprint viewer + version compare (Procore territory; not your fight)
- ❌ Takeoff from PDFs (only matters for residential remodel above $500K — defer)
- ❌ Salesforce / HubSpot CRM integration (your CRM is your CRM; integration is wrong-direction)
- ❌ BIM / 3D modeling (Houzz Pro territory; not your fight)
- ❌ GPS hardware fleet tracking (defer; phone GPS is enough at SMB)
- ❌ Multi-location franchise mode V1 (until you have customers asking)

---

## The honest 6-month outcome

If you ship Quick Wins + Streams A + C + F (with B/D opportunistic), in 6 months Sylk will be:

- **Demo-equivalent to Buildertrend/JobTread on table-stakes** (portal already live, e-sign added, QBO sync live, financing live, SMS live, online booking live)
- **AI-superior to all competitors** (MCP server, agent scheduling, proactive alerts, voice receptionist, three languages)
- **Hybrid-positioned** (project + route + recurring native — no other tool does this)
- **Priced 50% below Buildertrend** ($249-399/mo) with more features in core

That's not "good enough" — that's "category-defining."

After 6 months, Phase 2 expands: Stream D (advanced field ops), Stream E (full marketing flywheel), Stream G (enterprise compliance for the few customers who need it).

---

## What to do in the next hour

1. **Set up worktrees** (5 min): one for `feature/comms`, one for `feature/qbo`, one for `feature/foreman-mcp`
2. **Open a terminal on each + `claude` in each**: 3 parallel sessions
3. **Tell Stream A's Claude to start QW1 + QW2 + QW3 + QW4** (Twilio SMS, review automation, e-sign, text-to-pay) — these are the Week-1 momentum shots
4. **Tell Stream C's Claude to start C1** (QuickBooks Online OAuth + initial sync scaffold) — this is the long one, start now
5. **Tell Stream F's Claude to start F1** (MCP server) — wraps existing tools, neutralizes JobTread pitch in a week

Once those are running in parallel, you sit back, review PRs as they come in, and the platform builds itself.

This is the war plan. Now go make Sylk inevitable.

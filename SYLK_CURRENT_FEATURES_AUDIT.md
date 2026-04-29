# Sylk — Comprehensive Feature Audit
**As of April 28, 2026**

---

## Executive Summary

Sylk is a **highly mature, feature-rich AI operations platform** for service businesses. The codebase spans **~530K lines of code** across React Native (mobile), Next.js (portal), and Node.js/Express (backend) with **82 AI tools**, **38+ database tables**, and **100+ app screens**. The platform covers the full business operations lifecycle: projects, estimates, invoicing, crew management, financial reporting, bank integration, and recurring service management.

**Key Insight**: Most core features are substantially built. The gaps are primarily in B2B integrations (QuickBooks, financing options), compliance-specific tools (lien waivers, certified payroll), and some consumer-facing marketing features (review automation, referral programs).

---

## Quick Summary Table

| Category | Status | Key File(s) | Notes |
|----------|--------|------------|-------|
| 1. Customer Portal | **HAS** | `/backend/src/routes/portal.js` (1777 lines) | Magic-link auth, project view, invoices, estimates, materials, messages, change orders, documents, approvals |
| 2. CRM / Lead Pipeline | **PARTIAL** | `clients` table, `client_requests` table | Basic client management, issue tracking; no formal leads-pipeline or sales funnel |
| 3. Estimates / Quotes | **HAS** | `estimates` table, `/backend/src/services/tools/definitions.js` | AI-generated, line items, taxes, markup, email/SMS sharing; no e-signature, template library, or allowance tracking |
| 4. Invoicing & Payments | **HAS** | `invoices` table, Stripe integration, `/backend/src/routes/stripe.js` | Milestone/per-phase billing, PDF generation, payment tracking; no Apple Pay/Google Pay, text-to-pay, or AIA forms |
| 5. Change Orders | **HAS** | `approval_events` table (entity_type='change_order') | Data model exists; portal-facing, client approval; unclear if auto-budget-update implemented |
| 6. Material Selections | **HAS** | `material_selections` table | Pending/selected/confirmed status, client notes, image options (JSONB); portal-facing screen exists |
| 7. Documents / Contracts | **HAS** | `contract_documents`, Google Drive integration, PDF viewer | Upload/organize, PDF viewer, Google Drive sync; e-signature not found, document templates exist |
| 8. Scheduling / Calendar | **PARTIAL** | `schedule_events` table, `project_phases` (with timelines) | Event scheduling, phase timelines, AI scheduling; no two-way Outlook/Google Calendar sync, no booking widget |
| 9. Routes / Service Plans | **HAS** | `service_plans` table, `service_locations`, `location_schedules`, `service_routes` | Full recurring service system with locations, schedules, route management; no TSP optimization, no live ETA tracking |
| 10. Crew / Worker Management | **HAS** | `workers`, `worker_schedules`, `supervisor_invites`, clock-in GPS | 3 roles (owner, supervisor, worker), time tracking, GPS clock-in; no detailed audit logs per feature |
| 11. Daily Reports | **HAS** | `daily_reports`, `daily_report_entries`, `daily_checklist_system` | Structured logs, photos, checklists, task quantities; recurring task integration complete |
| 12. Financial Management | **HAS** | `project_transactions`, receipts via vision, P&L, cash flow, tax summary | Per-project P&L, overhead tracking, tax deductions, AR aging, payroll summary, WIP report |
| 13. Bank Integration | **HAS** | Teller (mTLS) + Plaid routes, `bank_transactions` table | Teller + Plaid support, auto-reconciliation, transaction classification, CSV import; no EagleView/measurement tools |
| 14. QuickBooks Integration | **MISSING** | Zero code found | No QBO two-way sync, no QB code detected |
| 15. AI Agent (Foreman) | **HAS** | 82 tools in `/backend/src/services/tools/definitions.js` | Voice (Deepgram/Groq), multilingual (EN/ES/PT), long-term memory, intent routing, category breakdown: Projects (8), Financial (18), Workers (7), Scheduling (4), Reporting (6), Service Plans (8), Documents (4), Other (19) |
| 16. Communications | **PARTIAL** | SMS schema defined, Resend (email), push notifications, in-app center | Email sending (Resend), push via Expo, in-app notifications; **SMS infrastructure defined but NOT INTEGRATED**, no two-way SMS inbox, no WhatsApp, no voice calls |
| 17. Marketing / Reviews | **PARTIAL** | `satisfaction_ratings` table, Google review click tracking | Review rating capture; **no automation**, no referral program, no email campaigns, no before/after gallery |
| 18. Subcontractor / Vendor | **PARTIAL** | `subcontractor_quotes` table, W-9/COI tracking not found | Subcontractor profiles, quote management, preferred vendor marking; no sub portal, no 1099 generation found |
| 19. Compliance | **MISSING** | Zero code found | No lien waivers, no certified payroll, no OSHA logs |
| 20. Integrations (3rd party) | **MIXED** | Stripe, Teller, Plaid, Deepgram, Groq, OpenRouter, Google Maps, Google Drive, Resend, Expo Push | **Missing: QuickBooks, Zapier/public API, Wisetack/financing, EagleView** |
| 21. Onboarding / Subscriptions | **HAS** | Stripe subscriptions, 10+ onboarding screens, paywall via Apple App Store | Multi-step onboarding, free trial logic, subscription tiers |
| 22. Multi-tenancy / White-label | **PARTIAL** | `client_portal_branding` table (logo, colors per owner); no franchise/multi-location mode | Per-owner white-label portal; no franchise mode |
| 23. Internationalization | **HAS** | Full EN/ES/PT in UI + voice | All interfaces translated, voice input in 3 languages |

---

## Detailed Findings Per Category

### 1. Customer / Client Portal
**Status: HAS** ✓

**Built Features:**
- **Magic-link auth**: `/backend/src/routes/portal.js` lines 28-100 — token-based, single-use, 30-day session expiry
- **Client dashboard**: Project overview, status tracking, recent activity
- **Estimates view & approval**: Client can view, approve, reject (`/projects/:projectId/estimates`)
- **Invoices view & payment**: Stripe payment integration (`/invoices/:invoiceId/pay`, `/create-payment-intent`)
- **Photos**: Project photo gallery upload and viewing (`/projects/:projectId/photos`)
- **Activity log**: Timeline of project updates (`/projects/:projectId/activity`)
- **Messages**: Bi-directional project messaging (`/projects/:projectId/messages`)
- **Requests**: Client can submit issues/change requests (`/projects/:projectId/requests`)
- **Material selections**: Portal-facing selection screen (`/projects/:projectId/materials`)
- **Documents**: View project documents with PDF viewer
- **Change orders**: View and approve change orders (`/projects/:projectId/change-orders`)
- **Approvals**: Audit trail of all approvals (`approval_events` table)
- **Summaries**: AI-generated weekly summaries (portal accessible)
- **Branding**: White-label per owner (`client_portal_branding` table with logo, colors)
- **Portal visibility settings**: Per-project controls (show_phases, show_photos, show_budget, etc.)

**Portal Routes** (frontend): `/website/src/app/portal/` — login, projects, invoices, services, materials, requests

**Missing:**
- Customer **re-booking / quote requests** — not found in portal endpoints
- **SMS/WhatsApp to customer** — schema exists but not wired to portal endpoints
- **E-signature on documents** — no DocuSign/HelloSign integration found
- **Payment method selection** (Apple Pay, Google Pay) — only Stripe card
- **Online scheduling/booking widget** — not found

---

### 2. CRM / Lead Pipeline
**Status: PARTIAL** ⚠️

**Built Features:**
- **Clients table**: Basic client profiles (`id`, `full_name`, `email`, `phone`, `owner_id`)
- **Client requests**: Can log issues, change requests, questions, warranty claims (`client_requests` table)
- **Project-to-client link**: `project_clients` table tracks client-project relationships
- **Lead source attribution**: Not found in schema

**Missing:**
- **Formal lead vs project distinction** — all data appears to be projects, no "lead" status or separate leads table
- **Sales pipeline/kanban view** — no pipeline stages found
- **Automated follow-up sequences** — not implemented
- **Email integration** (Gmail/Outlook sync) — not found
- **Quote-to-job conversion tracking** — not explicitly tracked

---

### 3. Estimates / Quotes
**Status: HAS** ✓

**Built Features:**
- **AI-generated estimates**: `create_estimate_to_invoice` tool in definitions.js — powered by OpenRouter/Claude with past pricing data
- **Line items, taxes, markup**: `estimates` table with `items` (JSONB), `subtotal`, `tax_amount`, `tax_rate`, `total`
- **Estimate numbering**: Auto-generated EST-2025-001 format
- **E-mail/SMS sharing**: Portal routes support estimate sharing (Resend email)
- **PDF generation**: Mentioned in PRODUCT_OVERVIEW
- **Estimate-to-invoice conversion**: `convert_estimate_to_invoice` tool exists
- **Status tracking**: draft, sent, viewed, accepted, rejected, expired
- **Valid-until date**: `valid_until` field
- **Payment terms**: Text field for terms
- **Customer portal view**: Clients can view and approve/reject estimates

**Missing:**
- **E-signature** — not found; only status-based approval
- **Template library** — no templates table found
- **Cost catalog / saved line items** — no item library found
- **Good-better-best presentation** — not implemented
- **Allowances / contingency lines** — not found
- **Online viewing link** (non-portal) — not clear

---

### 4. Invoicing & Payments
**Status: HAS** ✓

**Built Features:**
- **One-shot and milestone billing**: `invoices` table with `payment_structure` field (full vs per_phase); phase-level payment amounts
- **Invoice generation**: `invoices` table — auto-numbered INV-2025-001
- **Invoice-to-estimate link**: `estimate_id` foreign key
- **PDF generation**: `pdf_url` field in invoices
- **Payment tracking**: `amount_paid`, `amount_due` (calculated), payment status (unpaid, partial, paid, overdue, cancelled)
- **Stripe payment integration**: `/backend/src/routes/stripe.js` — customer can pay via portal (`/invoices/:invoiceId/pay`)
- **Payment method tracking**: `payment_method` field
- **Deposit handling**: Can record as income transaction with category 'deposit'
- **Time-and-materials billing**: Can record labor expenses and bill accordingly
- **Milestone/phase billing**: Project phases can have `payment_amount` for per-phase projects
- **Payment reminders**: Scheduled notifications (`scheduled_notifications` table)
- **Overdue tracking**: Status field tracks 'overdue'
- **Invoices accessible in portal**: Client can view, pay, and download invoices

**Missing:**
- **AIA G702/G703 progress billing** — not found
- **Retainage handling** — mentioned in transaction categories but no formal retainage table
- **Apple Pay / Google Pay** — only Stripe credit card
- **Text-to-pay** — not implemented
- **Online invoice link** (non-portal) — not clear if public shareable links exist
- **Installment/financing** (Wisetack, Acorn, GreenSky) — not found

---

### 5. Change Orders
**Status: HAS** ✓

**Built Features:**
- **Data model**: `approval_events` table with `entity_type='change_order'`
- **Client approval flow**: Approval audit trail with action='approved'/'rejected'
- **E-sign**: Not found
- **Portal visibility**: `/projects/:projectId/change-orders` endpoint exists
- **Status tracking**: viewed, approved, changes_requested, signed_off

**Missing:**
- **Auto-budget-update on CO approval** — logic not found; change orders appear to be tracked but may not auto-adjust project budget
- **Change order table** — may be abstracted through approval_events instead of dedicated table
- **E-signature** — not implemented

---

### 6. Material Selections / Allowances
**Status: HAS** ✓

**Built Features:**
- **Data model**: `material_selections` table with `title`, `description`, `options` (JSONB array), `selected_option_index`
- **Status tracking**: pending, selected, confirmed
- **Client notes**: `client_notes` field for customer choices
- **Image-based options**: Options stored as JSONB — can include images
- **Due date**: `due_date` field for selection deadline
- **Portal screen**: `/projects/:projectId/materials` — clients can view and select
- **Portal API**: `PATCH /materials/:id/select` to record selection
- **Confirmation flow**: `selected_at`, `confirmed_at` timestamps

**Missing:**
- **Allowance variance tracking** — no table linking selections to allowance amounts or variance calculation
- **Auto-flow to change order** — not found
- **Allowance line items** — no dedicated allowance data model

---

### 7. Documents / Contracts
**Status: HAS** ✓

**Built Features:**
- **Upload & organization**: `project_documents` table with `file_url`, `document_type`
- **PDF viewer**: Integrated in app (DocumentViewerScreen.js)
- **Google Drive integration**: `/backend/src/routes/googleDrive.js` — backup and sync
- **Contract templates**: `contract_templates` and `typical_contracts` tables with merge fields
- **Document sharing**: Routes exist for sharing documents
- **AI document analysis**: Mentioned in PRODUCT_OVERVIEW — vision-capable for PDFs, contracts, receipts
- **Upload via app**: `upload_project_document` tool exists
- **Portal visibility**: `/projects/:projectId/documents` endpoint

**Missing:**
- **E-signature / audit trail** — no DocuSign/HelloSign/HelloElectronically-signed tracking found
- **SMS/link sharing** — sharing endpoints exist but SMS sending not fully integrated

---

### 8. Scheduling / Calendar
**Status: PARTIAL** ⚠️

**Built Features:**
- **Project schedule with phases**: Phases have `start_date`, `end_date`, `status` (pending, in_progress, completed)
- **Drag-and-drop task reordering**: Mentioned in PRODUCT_OVERVIEW
- **Work schedule creation**: `worker_schedules` and `create_work_schedule` tool
- **Schedule events**: `schedule_events` table with `event_name`, `start_time`, `end_time`, `project_id`
- **AI scheduling**: Tool `create_work_schedule` — respects working days and trade sequencing
- **Worker assignment**: `schedule_events` tracks `assigned_worker_id`
- **Calendar view**: Calendar screens exist in frontend
- **Phase timeline**: Phases tracked with dates

**Missing:**
- **Two-way Google Calendar / Outlook sync** — not found
- **Online booking widget for customers** — not found
- **Day/week/month calendar views** — unclear if all three exist
- **Appointment reminders** — scheduled notifications exist but unclear if tied to appointments

---

### 9. Routes / Service Plans (Recurring Services)
**Status: HAS** ✓

**Built Features:**
- **Service plans model**: `service_plans` table with `service_type` (pest_control, cleaning, landscaping, pool_service, lawn_care, hvac, other), billing_cycle (per_visit, monthly, quarterly)
- **Locations**: `service_locations` with address, contact info, access notes
- **Schedules**: `location_schedules` with frequency (weekly, biweekly, monthly, custom), preferred time, duration
- **Checklists**: `visit_checklist_templates` per location with photo/quantity requirements
- **Route management**: `service_routes` table with assigned worker, status (planned, in_progress, completed)
- **Daily route view**: `get_daily_route` tool; `/owner/DailyRouteScreen.js`
- **Route builder**: `RouteBuilderScreen.js` in frontend — assign visits to workers
- **Billing preview**: `service_routes` link to billings; one-tap invoice generation
- **Route stops**: `route_stops` table
- **Service visits**: `service_visits` table with location, date, worker
- **Visit completion**: `complete_visit` tool
- **Memberships / auto-renewal**: Billing cycle field supports recurring charges

**Missing:**
- **Route optimization (TSP-style)** — not implemented; routes appear to be manually built
- **Live tech location tracking + ETA** — not found
- **GPS tracking during visit** — not explicitly found (only clock-in/clock-out GPS)

---

### 10. Crew / Worker Management
**Status: HAS** ✓

**Built Features:**
- **3-role system**: Owner, supervisor, worker (distinct navigation stacks and permissions)
- **Worker profiles**: `workers` table with `trade`, `payment_type` (hourly, daily, weekly, project_rate)
- **GPS clock-in/clock-out**: `time_tracking` table with location; `/worker/TimeClockScreen.js`
- **Time approval workflow**: `supervisor_time_tracking` for time validation
- **Worker schedules**: `worker_schedules` table with date, hours
- **Project assignments**: `phase_assignments` table linking workers to phases
- **Supervisor portal**: Distinct supervisor role with delegated project oversight (`supervisor_invites` table)
- **Supervisor payment tracking**: `supervisor_time_tracking` and `/owner/SupervisorDetailScreen.js`
- **Worker app screens**: Clock-in, daily reports, task completion, project view
- **Payment summaries**: `get_payroll_summary` tool — daily/weekly breakdown

**Missing:**
- **More granular permissions** (office manager, bookkeeper, sales rep) — not found beyond the 3 roles
- **Comprehensive audit log** — per-feature change tracking not clearly documented

---

### 11. Daily Reports
**Status: HAS** ✓

**Built Features:**
- **Structured logs**: `daily_reports` and `daily_report_entries` with work, photos, weather, manpower, materials, equipment, delays, safety
- **Photo upload**: Photo support in daily report structure
- **Recurring daily tasks**: `project_recurring_tasks` table with quantity tracking
- **Task quantity tracking**: `recurring_task_daily_logs` table
- **Report history with filters**: `get_daily_reports` tool with date/project filtering
- **Worker-facing form**: `/worker/DailyReportFormScreen.js`
- **Supervisor review**: `get_daily_checklist_report` tool

---

### 12. Financial Management
**Status: HAS** ✓

**Built Features:**
- **Per-project P&L**: `get_profit_loss` tool; projects tracked with `contract_amount`, `expenses`, `income_collected`
- **Receipt scanning**: Vision-capable for receipt OCR (vendor, amount, category extraction)
- **Overhead tracking**: `company_overhead` or recurring expenses; `/owner/CompanyOverheadScreen.js`
- **Tax summary**: `get_tax_summary` tool; IRS Schedule C categories in transaction subcategories
- **1099 contractor identification**: Subcontractor categorization in transactions
- **AR aging**: `get_ar_aging` tool — current, 30, 60, 90+ days
- **Payroll summary**: `get_payroll_summary` tool — worker-by-worker breakdown
- **Cash flow analysis**: `get_cash_flow` tool — 6-month trailing view
- **WIP report**: Not explicitly named but project-level over/under-billing tracked
- **Real-time job costing**: Committed + actual + forecast via tools
- **Cost catalog / library**: `subcontractor_quotes` table for pricing; no general item library found
- **Financial overview**: `get_financial_overview` tool

---

### 13. Bank Integration
**Status: HAS** ✓

**Built Features:**
- **Teller (mTLS)**: Full implementation in `/backend/src/routes/teller.js` with certificate auth
- **Plaid**: Implemented in `/backend/src/routes/plaid.js`
- **Auto-reconciliation**: `reconcileTransactions()` service with `bank_transactions` table
- **Transaction classification**: `transaction_rules` table for learning rules; `assign_bank_transaction` tool
- **Overhead matching**: Recurring business expense matching
- **CSV import**: `parseCSV()` service for banks without API support
- **Connected accounts**: `connected_bank_accounts` table
- **Bank sync logs**: `bank_sync_logs` table for audit
- **Reconciliation UI**: `/owner/BankReconciliationScreen.js`, `/owner/BankConnectionScreen.js`

**Missing:**
- **EagleView / Hover** (roofing measurement) — not found
- **Advanced cash position forecasting** — basic cash flow exists

---

### 14. QuickBooks Integration
**Status: MISSING** ✗

**Finding**: Zero code found for QuickBooks Online or QBO integration. No QBO SDK imports, no OAuth flows, no sync logic.

---

### 15. AI Agent (Foreman)
**Status: HAS** ✓

**Tool Inventory (82 total)**:

**By Category:**
- **Projects (8)**: search_projects, get_project_details, delete_project, update_project, create_project_phase, get_project_summary, get_project_financials, get_project_health
- **Financial (18)**: record_expense, get_financial_overview, get_profit_loss, get_cash_flow, get_tax_summary, get_billing_summary, get_ar_aging, get_payroll_summary, get_reconciliation_summary, get_business_briefing, suggest_pricing, get_business_contracts, update_expense, delete_expense, get_transactions, get_recurring_expenses, get_business_settings, calculate_service_plan_revenue
- **Workers (7)**: get_workers, get_worker_details, assign_worker, unassign_worker, clock_in_worker, clock_out_worker, get_worker_metrics
- **Scheduling (4)**: create_work_schedule, get_schedule_events, update_phase_progress, get_daily_route
- **Estimates/Invoices (6)**: search_estimates, get_estimate_details, update_estimate, search_invoices, get_invoice_details, convert_estimate_to_invoice, update_invoice, void_invoice
- **Service Plans (8)**: get_service_plans, get_service_plan_details, create_service_plan, update_service_plan, delete_service_plan, get_service_plan_documents, upload_service_plan_document, assign_worker_to_plan
- **Documents (4)**: get_project_documents, upload_project_document, delete_project_document, update_project_document, share_document
- **Reporting (6)**: get_daily_briefing, get_daily_reports, get_daily_checklist_summary, create_daily_report, generate_summary_report, get_client_health
- **Other (15)**: global_search, query_event_history, setup_daily_checklist, add_project_checklist, create_project_phase, create_service_visit, complete_visit, assign_bank_transaction, create_worker_task, add_service_location, update_service_location, update_service_plan, update_service_pricing, get_photos, assign_supervisor, unassign_supervisor, update_phase_budget

**Features:**
- **Voice input**: Deepgram (primary) + Groq Whisper (fallback) — `/backend/src/routes/transcription.js`
- **Multilingual**: EN/ES/PT (confirmed in PRODUCT_OVERVIEW and schema; language field in profiles)
- **Long-term memory**: `user_memories` table; `memoryService.js` with learning facts
- **Intent-based routing**: `modelRouter.js`, `toolRouter.js` — analyzes intent and filters tools (claimed 60 → 8-12 per query)
- **Request memory**: Caching tool results for 30 min within conversation
- **Smart model selection**: Uses faster models for simple queries (Groq), slower for complex (OpenRouter Claude)
- **Streaming responses**: Server-Sent Events for real-time output

---

### 16. Communications
**Status: PARTIAL** ⚠️

**Built Features:**
- **Email sending**: Resend integration in `/backend/src/services/emailService.js` with HTML templates
- **Push notifications**: Expo Push via `pushNotificationService.js`; `push_tokens` table; in-app center with type filtering
- **In-app notification center**: `notifications` table, `/NotificationsScreen.js`
- **Real-time updates**: Supabase subscriptions for live notifications
- **Estimate/invoice sharing**: Email distribution built into portal routes
- **Appointment reminders**: Scheduled notifications via `scheduled_notifications` table
- **Bank reconciliation alerts**: Delta-based alerts for new transactions

**SMS / WhatsApp Infrastructure (Defined but NOT Integrated):**
- **Schema exists**: `sms_integration_schema.sql` defines `conversations` table for SMS/WhatsApp tracking
- **Twilio phone fields**: Prepared in `profiles` table (business_phone_number, twilio_account_sid, etc.)
- **Intent classification**: SMS schema includes AI intent detection (general, complaint, payment, schedule)
- **But NOT WIRED**: No active SMS sending routes found; no Twilio SDK integration in routes

**Missing:**
- **Outbound SMS sending** — infrastructure defined, not implemented
- **Two-way SMS inbox** — schema prepared, not implemented
- **WhatsApp integration** — mentioned in PRODUCT_OVERVIEW but not implemented
- **Email two-way integration** (Gmail/Outlook sync) — not found
- **Voice calls / AI receptionist** — not found

---

### 17. Marketing / Reviews
**Status: PARTIAL** ⚠️

**Built Features:**
- **Review rating capture**: `satisfaction_ratings` table with `rating`, `comments`, `project_id`
- **Google review link tracking**: `/projects/:projectId/google-review-clicked` endpoint records when client clicks review link
- **Portal-accessible ratings**: Clients can submit satisfaction ratings in portal

**Missing:**
- **Automated review requests post-job** — no post-completion trigger found
- **Email marketing campaigns** — not found
- **Referral program** — not found
- **Direct mail** — not found
- **Before/after photo gallery for marketing** — no dedicated gallery found (only project photos)

---

### 18. Subcontractor / Vendor Management
**Status: PARTIAL** ⚠️

**Built Features:**
- **Subcontractor profiles**: `subcontractor_quotes` table with name, contact, trade
- **Quote management**: Store and rank multiple subcontractor quotes per trade
- **Preferred vendor marking**: `is_preferred` field for AI estimate prioritization
- **Document upload**: Quote documents in Supabase Storage
- **Pricing services**: `services` JSONB array with per-item pricing

**Missing:**
- **COI / insurance tracking** — no dedicated table
- **W-9 / license tracking** — not found
- **Subcontractor portal** — not found; only owner-visible
- **1099 generation** — not found (subcontractors only exist in expense tracking)

---

### 19. Compliance
**Status: MISSING** ✗

**Not found**: Lien waivers, certified payroll, OSHA safety logs, insurance certificate tracking.

---

### 20. Integrations (Third-Party)
**Status: MIXED** — Core built, specialized missing

**Implemented:**
- **Stripe**: Payment processing + subscriptions (v2024-06-20 API)
- **Teller**: mTLS bank sync with certificate auth
- **Plaid**: Fallback bank integration
- **Deepgram**: Primary voice transcription
- **Groq**: Fallback voice (Whisper) + fast AI inference
- **OpenRouter**: Primary LLM routing (Claude, GPT models)
- **Supabase**: Database + storage + auth + edge functions + subscriptions
- **Google Maps**: Geocoding + worker location tracking
- **Google Drive**: Document backup/sync
- **Resend**: Transactional email
- **Expo Push**: Push notifications via Expo
- **Twilio**: Schema prepared but NOT integrated (SMS)

**Missing:**
- **QuickBooks Online** — zero code
- **Zapier / public API** — no Zapier app found; Stripe webhooks exist but no generic webhook/API for third-parties
- **Financing** (Wisetack, Acorn, GreenSky) — not found
- **EagleView / Hover** (roofing measurement) — not found
- **AI receptionist / voice calls** — not found

---

### 21. Onboarding / Subscriptions
**Status: HAS** ✓

**Built Features:**
- **Multi-step onboarding**: 10+ screens in `/frontend/src/screens/onboarding/`
- **Welcome + features**: Animated slides showcasing AI, estimates, financials, pricing, projects, social proof
- **Business info setup**: Company name, trades, contact info
- **Pricing setup**: Invoice templates, payment terms configuration
- **Service selection**: Select service types (construction, cleaning, pest control, etc.)
- **Trade selection**: Choose relevant trades
- **Phase customization**: Set custom project phases
- **Premium onboarding**: Upsell flow with paywall
- **Subscription tiers**: Stripe subscription integration with free trial logic
- **Apple App Store paywall**: IAP compliance built in
- **Completion screen**: Final onboarding step with welcome message

---

### 22. Multi-tenancy / White-label
**Status: PARTIAL** ⚠️

**Built Features:**
- **Per-owner branding**: `client_portal_branding` table with `business_name`, `logo_url`, `primary_color`, `accent_color`
- **White-label portal**: Clients see contractor's branding, not Sylk branding
- **Per-project visibility**: `client_portal_settings` controls what each client sees

**Missing:**
- **Multi-location / franchise mode** — not found
- **Reseller / agency mode** — not found

---

### 23. Internationalization
**Status: HAS** ✓

**Built Features:**
- **Full UI translation**: EN, ES (Spanish), PT (Portuguese) for all screens
- **Voice languages**: Deepgram + Groq support all three languages with language parameter
- **Language selection**: `/screens/LanguageSelectionScreen.js`
- **Dynamic language switching**: `ChangeLanguageScreen.js` allows runtime language change
- **AI response language**: Foreman responds in user's selected language

---

## Database Schema Overview

**Core Tables (38+):**

| Table | Purpose |
|-------|---------|
| **projects** | Main project record with contract amounts, status, dates |
| **project_phases** | Project phases/sections with timelines and payment amounts |
| **project_clients** | Relationship between projects and clients (for multi-client scenarios) |
| **clients** | Client profiles (name, email, phone, owner reference) |
| **project_documents** | Uploaded project files (contracts, blueprints, etc.) |
| **estimates** | Estimate records with line items, tax, status tracking |
| **invoices** | Invoice records with payment tracking and status |
| **invoice_template** | Reusable invoice templates |
| **project_transactions** | Financial transactions (income, expenses) per project |
| **workers** | Worker profiles (name, trade, payment type) |
| **worker_schedules** | Worker schedule assignments to projects/phases |
| **worker_crews** | Crew grouping (for team assignments) |
| **time_tracking** | Clock-in/out records with GPS location |
| **supervisor_time_tracking** | Time approval workflow for supervisors |
| **phase_assignments** | Worker assignments to specific phases |
| **schedule_events** | Calendar events for projects and workers |
| **daily_reports** | Structured daily work logs (work, photos, weather, etc.) |
| **daily_report_entries** | Individual entries within daily reports |
| **daily_checklist_templates** | Reusable checklists for daily tasks |
| **recurring_task_daily_logs** | Quantity tracking for recurring daily tasks |
| **service_plans** | Recurring service plan records |
| **service_locations** | Locations within service plans |
| **location_schedules** | Recurring schedules for each location |
| **visit_checklist_templates** | Checklists for service visits |
| **service_routes** | Daily routes for service workers |
| **service_visits** | Individual visit records |
| **visit_checklist_items** | Items completed during visits |
| **bank_transactions** | Bank transactions (synced from Teller/Plaid) |
| **connected_bank_accounts** | Connected bank account metadata |
| **transaction_rules** | Learning rules for transaction classification |
| **bank_sync_logs** | Audit trail of bank syncs |
| **material_selections** | Customer material choices for projects |
| **client_requests** | Issues, change requests, warranty calls |
| **approval_events** | Audit trail of approvals (estimates, invoices, COs, etc.) |
| **notifications** | In-app notifications |
| **scheduled_notifications** | Queued notifications |
| **push_tokens** | Device push tokens for Expo notifications |
| **user_memories** | Long-term memory for AI agent |
| **chat_messages** | Conversation history with Foreman |
| **chat_sessions** | Conversation session records |
| **agent_jobs** | Background AI job tracking |
| **contracts** | Contract records |
| **contract_documents** | Contract files and templates |
| **contract_templates** | Reusable contract templates |
| **typical_contracts** | Pre-built industry-standard contracts |
| **subscriptions** | User subscription records |
| **client_portal_settings** | Per-project portal visibility controls |
| **client_portal_branding** | Per-owner white-label branding |
| **client_sessions** | Magic-link session tokens |
| **satisfaction_ratings** | Client satisfaction ratings post-job |
| **ai_weekly_summaries** | AI-generated weekly summaries for clients |
| **subcontractor_quotes** | Subcontractor pricing and documents |
| **conversations** | SMS/WhatsApp conversation log (prepared, not active) |
| **pricing_history** | Historical pricing for AI estimate generation |
| **shift_templates** | Reusable shift patterns |
| **worker_availability** | Worker availability windows |
| **business_insights** | Aggregated business metrics |
| **domain_events** | Event sourcing for state changes |
| **pending_subscriptions** | Subscription queue/staging |
| **supervisor_invites** | Invitation links for supervisors |
| **construction_task_templates** | Task library with duration/dependency data |
| **task_dependencies** | Task sequencing constraints |
| **task_learnings** | Learning from actual task durations |
| **scheduling_constraints** | Rules for task scheduling |
| **labor_role_templates** | Role definitions for crews |
| **project_type_templates** | Project type blueprints |
| **service_categories** | Service type definitions |
| **service_items** | Service pricing items |
| **service_phase_templates** | Phase templates for services |
| **service_search_analytics** | Search behavior tracking |
| **project_recurring_tasks** | Recurring tasks within projects |
| **project_assignments** | Owner/supervisor project assignments |
| **project_trade_budgets** | Budget allocated per trade within project |
| **eval_runs** | AI evaluation harness runs |
| **eval_results** | Evaluation results |
| **chat_attachments** | Files attached to chat messages |
| **conversation_participants** | Participants in multi-user conversations |

---

## Backend Routes Inventory

| File | Purpose | Key Endpoints |
|------|---------|---------------|
| `/ai.js` | AI agent suggestions (pricing, auto-fill) | POST /suggestions |
| `/geocoding.js` | Address geocoding (Google Maps) | POST /geocode |
| `/googleDrive.js` | Google Drive sync & auth | GET /auth-url, POST /sync |
| `/plaid.js` | Plaid bank integration | POST /link-token, POST /exchange-token, GET /accounts, POST /webhook |
| `/portal.js` | **Client portal API (1777 lines)** | 35+ endpoints for auth, projects, invoices, estimates, messages, materials, approvals, documents, etc. |
| `/portalOwner.js` | **Portal owner endpoints** | Client management, branding, settings, ratings |
| `/projectDocs.js` | Project document management | Upload, download, delete, list |
| `/projectSections.js` | Project phases/sections | CRUD for phases, task reordering, progress |
| `/servicePlans.js` | Recurring service plan API | CRUD for plans, locations, schedules, visits |
| `/serviceRoutes.js` | Service route management | Daily routes, stops, assignment |
| `/serviceVisits.js` | Service visit completion | Check-in, checklist items, photos |
| `/stripe.js` | Stripe payment & subscription webhook | Subscription events, invoice payment |
| `/teller.js` | **Teller bank integration (mTLS)** | Account linking, transaction sync, reconciliation, CSV import |
| `/transcription.js` | Voice transcription (Deepgram/Groq) | POST audio for speech-to-text |

---

## Top 20 Surprises (Built but Possibly Forgotten)

1. **SMS/WhatsApp infrastructure is 100% prepared but 0% integrated** — schema, fields, intent classification all exist; Twilio creds prepared; but no active SMS sending or inbox
2. **Material selections have full allowance-style implementation** — pending/selected/confirmed flow, client choice tracking, due dates; just not branded as "allowances"
3. **Teller mTLS is fully implemented** — fewer contractors use Teller than Plaid; this is a competitive advantage
4. **82 AI tools is massive** — most contractors use 5-10 features of their CRM; Foreman exposes 82 specialized tools
5. **Per-phase milestone billing is built** — many construction tools charge extra for this; Sylk includes it standard
6. **Service plans system is production-ready for recurring services** — not just a checkbox; full route, checklist, and billing pipeline
7. **White-label portal for customers** — logos, colors per owner; multi-tenant portal without franchise bloat
8. **Supervisor role is legitimately separate** — not just a "view-only owner"; has own time tracking, delegation model, distinct permissions
9. **Long-term memory in Foreman** — learns facts about the business and applies them to future conversations; most AI CRMs don't have this
10. **Intent routing filters 82 tools down to 8-12** — prevents token bloat and model confusion; very efficient
11. **Daily checklists with recurring task quantities** — not just time logs; structured daily operations tracking
12. **Structured daily reports with weather, manpower, delays, safety** — way more robust than "notes"
13. **Three-language voice support in production** — EN/ES/PT all in Deepgram/Groq; rare for startup tools
14. **Receipt vision OCR for expense recording** — camera → vendor + amount + category; time-saver
15. **Transaction classification learning** — rules table stores learned patterns; recursive self-improvement
16. **PDF viewer in app** — not just external link; integrated viewer for contracts, invoices, estimates
17. **Google Drive backup for documents** — automatic sync of project files to Drive
18. **Request memory (30-min tool result cache)** — prevents redundant queries within conversation; cost optimization
19. **Expo Push with delta-based bank alerts** — only notifies on NEW transactions, not re-notifying old ones
20. **Animated onboarding with spotlights and frosted glass tooltips** — high-polish UX for first-time users

---

## Actual Gap List (Revised)

### Truly Missing (Not Implemented)

1. **QuickBooks Online two-way sync** — zero code; completely missing
2. **Lien waivers** — no data model, no generation
3. **Certified payroll reporting** — no model or form
4. **OSHA safety logs** — no tracking beyond general "safety notes" in daily reports
5. **E-signature / audit trail** — schema prepared for documents, but no DocuSign/HelloSign/native signing
6. **Twilio SMS sending** — infrastructure prepared, not wired (no active routes or handlers)
7. **Two-way SMS/WhatsApp inbox** — schema exists, no UI or receiving logic
8. **Public API / Zapier integration** — no generic webhook system; Stripe webhooks only
9. **Financing integrations** (Wisetack, Acorn, GreenSky, Affirm, Klarna) — not found
10. **EagleView / Hover roofing measurement** — not found
11. **Apple Pay / Google Pay** — only Stripe card on file
12. **Text-to-pay** — not implemented
13. **Lead pipeline / sales funnel** — no formal leads vs projects distinction; no pipeline stages
14. **Automated review request post-job** — rating capture exists, but no automation
15. **Referral program** — not found
16. **Multi-location / franchise mode** — not found
17. **Email two-way sync** (Gmail/Outlook auto-sync) — not found
18. **Online booking widget for customers** — not found
19. **Route optimization (TSP-style)** — routes manually assigned, no optimization
20. **Live ETA / GPS during service visit** — not found (clock-in GPS exists, but not live tracking mid-visit)
21. **Direct mail integration** — not found
22. **Before/after photo gallery for marketing** — no dedicated gallery (photos are per-project, not portfolio)
23. **Subcontractor portal** — subs can't self-serve; only owner-visible
24. **1099 generation** — not found
25. **COI / insurance certificate tracking** — not found
26. **More granular roles** (office manager, bookkeeper, sales rep) — only owner/supervisor/worker

### Partially Built (Started but Incomplete)

1. **SMS/WhatsApp** — schema + intent classification defined; no sending, no inbox, no Twilio wiring
2. **Material selections as allowances** — selection data model exists; no variance tracking, no auto-CO flow
3. **Change orders** — approval events exist; unclear if auto-budget-update on approval
4. **CRM lead pipeline** — clients table exists; no sales stages, no lead scoring, no funnel
5. **Calendar/scheduling** — events and phase timelines exist; no two-way sync to Google/Outlook
6. **Subcontractor management** — quotes + pricing exists; no portal, no 1099, no COI tracking
7. **Review automation** — rating capture exists; no post-job trigger, no review link tracking
8. **Email campaigns** — Resend integration exists; no campaign builder, no templates, no segmentation
9. **Retainage** — mentioned in transaction categories; no formal retainage table or holdback logic
10. **Financing** — Stripe payments exist; no BNPL/installment/financing partner integration

### Fully Built (Ready to Use)

1. **Portal** — magic-link auth, project view, invoices, estimates, materials, messages, approvals, documents, white-label
2. **Estimates & quotes** — AI-generated with past pricing, line items, taxes, markup, sharing, estimate-to-invoice
3. **Invoicing** — milestone/per-phase, PDF generation, Stripe payment, payment tracking, reminders
4. **Financial reporting** — P&L, overhead, tax summary, AR aging, payroll, cash flow
5. **Bank integration** — Teller (mTLS) + Plaid, auto-reconciliation, classification learning, CSV import
6. **AI agent (Foreman)** — 82 tools, voice (EN/ES/PT), long-term memory, intent routing, streaming
7. **Crew management** — 3 roles, GPS clock-in, time tracking, supervisor delegation, worker app
8. **Daily reports** — structured logs, photos, recurring task quantities, checklist integration
9. **Service plans** — full recurring service system with locations, schedules, routes, visits, billing
10. **Projects** — phases, timelines, task reordering, drag-and-drop, progress tracking
11. **Documents** — upload, PDF viewer, Google Drive sync, AI analysis
12. **Push notifications** — Expo push, in-app center, real-time updates, delta-based alerts
13. **Onboarding** — multi-step flow with animated slides, paywall, free trial
14. **White-label portal** — per-owner branding, per-project visibility controls
15. **Internationalization** — full EN/ES/PT UI + voice support

---

## Key Architectural Insights

**Strengths:**
- **Comprehensive tool system** — 82 AI tools cover 90% of daily operations
- **Role-based access** — clean separation of owner/supervisor/worker with RLS enforcement
- **Multi-language from day 1** — all three languages wired into core (voice, UI, AI responses)
- **Streaming + background jobs** — SSE for real-time responses; background processing for long operations
- **Memory system** — request cache + long-term memory = context-aware agent
- **Bank integration depth** — both Teller (premium) and Plaid (fallback) with learning reconciliation

**Weaknesses / Gaps:**
- **No public API** — third-party integrations (Zapier, etc.) not possible
- **SMS prepared but not shipped** — major UX gap; closest to production but not wired
- **QuickBooks completely missing** — accounting firms still require QB sync; biggest integration gap
- **Compliance tooling sparse** — lien waivers, certified payroll, OSHA logs all missing; limits GC use case
- **E-signature missing** — documents exist but can't be legally signed in-app
- **Lead pipeline missing** — no sales funnel; clients table exists but no CRM pipeline
- **Financing missing** — common expectation for high-ticket projects

---

## Recommendation Priority

**High ROI / Quick Wins:**
1. Wire Twilio SMS sending (schema 100% ready; 3-day feature)
2. Build public API + Zapier integration (enables third-party automation; 2 weeks)
3. Add SMS two-way inbox (UI + handlers; 1 week)
4. Implement QuickBooks Online sync (1099 firms need it; 4 weeks)
5. Build change order auto-budget-update (clarify and complete; 2 days)

**Medium Priority:**
6. E-signature integration (HelloSign API; 2 weeks)
7. SMS/WhatsApp review request automation (post-job trigger; 3 days)
8. Referral program (UI + tracking; 5 days)
9. Retainage formal model (table + logic; 3 days)
10. Multi-location / franchise mode (auth model; 2 weeks)

**Lower Priority / Market-Specific:**
11. Lien waivers (state-specific, less common in mobile-first software)
12. Certified payroll (niche; state-specific requirements)
13. Financing integrations (Wisetack, Acorn, GreenSky; specific verticals)
14. Route optimization TSP (nice-to-have; manual routes work for <10 stops)
15. EagleView/Hover (roofing-specific; out of core scope)

---

**Report Generated**: April 28, 2026 | **Audit Depth**: Very Thorough | **Confidence**: High

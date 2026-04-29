# Sylk — Feature Build Prompts

_Date: 2026-04-28. Paste-ready prompts for sequential Claude sessions. Each prompt builds backend + mobile frontend for one feature._

**How to use this file:**
1. Pick the next task from the sequence below
2. Open a fresh Claude session in the repo (`cd ~/Documents/construction-manager && claude` or on the Air `cd ~/projects/construction-manager && claude`)
3. Paste the prompt block from that task
4. Let it work, review the changes, commit, move to next task

**Quality bar (every prompt enforces):**
- Backend: route + service + Supabase migration + tests
- Mobile: screen + components + i18n in EN/ES/PT + dark mode support + Foreman tool wired
- Foreman tool added for every feature with logical agent action
- Verify with curl + simulator before declaring done
- Match existing patterns in the codebase — don't invent new ones

---

## Sequence (pick in this order)

### Wave 1 — Quick Wins (Week 1)
1. Two-way SMS inbox (Twilio)
2. E-signature with audit trail
3. Audit log middleware + history view
4. Geofence enforcement on clock-in
5. Foreman daily summary at 6pm
6. Apple Pay / Google Pay in checkout
7. Refer-a-friend program
8. Public REST API + per-owner API keys

### Wave 2 — Revenue Lifters (Weeks 2-3)
9. Review automation post-job
10. Consumer financing (Wisetack)
11. Good-Better-Best proposal mode
12. Estimate / cost-item catalog

### Wave 3 — Sales Depth (Weeks 4-6)
13. Lead pipeline / CRM
14. Automated follow-up sequences
15. Selections + allowances (full)
16. Change-order completeness pass
17. Memberships / service agreements

### Wave 4 — Financial Depth (Weeks 7-12)
18. QuickBooks Online sync — Phase 1 (OAuth + customers/invoices)
19. QuickBooks Online sync — Phase 2 (vendors/bills/payments)
20. QuickBooks Online sync — Phase 3 (time entries + cost codes + reconciliation)
21. Real-time job costing engine
22. Vendor bills / accounts payable
23. Purchase orders with approval
24. Sales tax automation
25. Multi-currency support
26. Automated payment reminders

### Wave 5 — Field Ops Excellence (Weeks 13-16)
27. Dispatch board (drag-drop)
28. Smart route optimization (TSP)
29. Punch list with photo pins
30. Photo workflow + AI tagging + before/after
31. Daily report voice generator
32. Field forms / inspections engine
33. Equipment / tool tracking
34. Customer equipment tracking (HVAC)
35. Pricebook / flat-rate library
36. Offline mobile mode
37. Time approval workflow

### Wave 6 — Foreman Superpowers (Weeks 17-20)
38. Foreman scheduled background work
39. Foreman proactive alerts
40. Voice-driven worker workflows
41. Foreman knowledge graph + RAG
42. MCP server
43. BYO Claude API key tier

### Wave 7 — Growth / Enterprise (Weeks 21-24)
44. Email marketing campaigns
45. Granular permissions / roles matrix
46. Multi-location support
47. Migration / CSV import wizard

---

# THE PROMPTS

Each prompt is designed to be pasted into a fresh Claude session. Customize the wording if needed but keep the structure.

---

## Task 1: Two-way SMS inbox (Twilio)

**Why:** Customers reply by text. If those replies land in someone's personal phone, the record breaks. Audit found schema is ready; just plumb it.

```
Build two-way SMS for Sylk. The schema is already prepared per the audit (look in `supabase/migrations/` for sms-related tables, and `backend/src/services/` for any twilio scaffolding).

GOAL:
- Each company gets a Twilio number provisioned on signup or first SMS use
- Owners send/receive SMS in a unified team inbox
- Inbound replies land on the customer record, threaded by phone number
- Foreman can read threads and draft/send replies via tools
- Mobile owner app shows the inbox with unread badges

BACKEND:
1. Create or finish `backend/src/services/twilioService.js`:
   - `provisionNumber(companyId, areaCode)` — buys a Twilio number scoped to company
   - `sendSms(companyId, to, body, customerId?)` — outbound, store in `sms_messages`
   - `handleInbound(req)` — webhook handler, find customer by phone, store message, push notify owner
2. Routes in `backend/src/routes/sms.js`:
   - POST `/sms/send`
   - GET `/sms/threads` — list grouped by customer
   - GET `/sms/threads/:customerId` — full message history
   - POST `/sms/threads/:customerId/read` — mark all read
   - POST `/webhooks/twilio/sms` — Twilio webhook (no auth, validate signature)
3. Add Foreman tools: `send_sms`, `read_sms_thread`, `list_unread_sms`. Wire into `backend/src/services/tools/`.
4. Migration: ensure `sms_messages` table exists with company_id, customer_id, direction (in/out), body, twilio_sid, status, created_at, read_at. Add `sms_phone` and `twilio_number` columns where appropriate.
5. Use existing webhook signature validation pattern. Rate-limit /sms/send.

MOBILE (frontend/):
1. New screen `frontend/src/screens/owner/InboxScreen.tsx` — list of threads, grouped by customer, unread first
2. New screen `frontend/src/screens/owner/ThreadScreen.tsx` — message bubbles, send box, attach customer chip
3. Add nav entry in OwnerMainNavigator with badge count from unread
4. Real-time updates via existing Supabase subscription pattern
5. Push notification on inbound SMS (use existing notification service)
6. i18n keys in EN/ES/PT: `inbox.title`, `inbox.empty`, `inbox.send`, `inbox.unread_count`
7. Dark mode support
8. Hook Foreman: when owner taps "Ask Foreman about this thread", pass thread context to existing chat

DONE WHEN:
- I can send a real SMS to my phone from the app (use my number for testing — ask before adding test data)
- A reply comes back, lands in InboxScreen, badge increments
- Foreman can list unread, read a thread, send a reply
- Tests in `backend/src/__tests__/sms.test.js` cover inbound + outbound + threading
- All UI text appears in EN/ES/PT correctly
- Curl examples for each endpoint added to docs

TWILIO ENV NEEDED:
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- TWILIO_WEBHOOK_BASE_URL (Railway public URL)

If env vars missing, use mock mode that logs to console and stores messages with status='mock'. Never block on missing creds.
```

---

## Task 2: E-signature with audit trail

**Why:** You have a portal but customers can't legally sign documents in it. Critical for estimates, change orders, contracts.

```
Add e-signature to Sylk. Apply to: estimates, change orders, contracts, daily reports.

GOAL:
- Customer or worker draws signature on a touch surface
- Audit trail captured: timestamp, IP, device, user-agent, signed-by name, document hash
- Final signed PDF is tamper-evident (PDF includes signature image + audit metadata)
- Available on mobile (worker signs daily report) AND web portal (customer signs estimate)
- Stored in Supabase Storage
- Foreman can request signatures and check status

BACKEND:
1. New service `backend/src/services/eSignService.js`:
   - `createSignatureRequest(documentType, documentId, signerEmail, signerPhone)` — generates signed token, sends email + SMS with link
   - `recordSignature(token, signaturePngBase64, signerName, ip, userAgent)` — stores signature, generates audit-stamped PDF, marks document signed
   - `getSignatureStatus(documentType, documentId)` — pending / signed / declined
2. New routes in `backend/src/routes/esign.js`:
   - POST `/esign/request` — owner creates request
   - GET `/esign/sign/:token` — public, no auth (token-protected) — returns document for review
   - POST `/esign/sign/:token` — public, submit signature
   - GET `/esign/status/:documentType/:documentId` — auth required
3. Migration `signatures` table: id, company_id, document_type, document_id, signer_name, signer_email, signer_phone, signature_png_url, audit_json (ip, ua, ts, hash), pdf_url, status, signed_at, created_at
4. Use pdfkit or pdf-lib to generate signed PDFs. Embed audit footer on every page. Hash original doc + signature for tamper detection.
5. Integrate with existing portal token system if present (`backend/src/middleware/portalAuth.js`)
6. Add Foreman tools: `request_signature`, `check_signature_status`, `cancel_signature_request`

MOBILE (frontend/):
1. New component `frontend/src/components/SignaturePad.tsx`:
   - Touch canvas with smooth-stroke rendering
   - Clear / undo / accept buttons
   - Returns PNG base64
   - Use react-native-signature-canvas or build with react-native-skia
2. New screen `frontend/src/screens/shared/SignDocumentScreen.tsx` — for workers signing daily reports on the spot
3. In existing estimate detail screen: add "Request signature" button → opens modal with email/phone, calls /esign/request, shows status
4. New section in estimate/CO/contract detail showing signature status (pending/signed) with audit trail expansion
5. Push notification when a customer signs
6. i18n: `esign.sign_here`, `esign.clear`, `esign.confirm`, `esign.signed_by`, `esign.signed_at`, `esign.audit`
7. Voice flow for Foreman: "Foreman, send the Smith estimate for signature" → Foreman calls request_signature

DONE WHEN:
- I can create an estimate, request signature via SMS, click the link on my phone, sign, and the signed PDF appears in the project documents
- Audit trail visible on both mobile (owner) and portal (customer-facing)
- Worker can sign daily report on the spot from the worker app
- Foreman commands work end-to-end
- PDF passes basic tamper detection (changing the doc invalidates the signature)
- Tests in `backend/src/__tests__/esign.test.js`

NO third-party signing service. Native implementation. Cheaper, no per-signature cost, full data ownership.
```

---

## Task 3: Audit log middleware + history view

**Why:** Mid-market trust signal. "Who edited this estimate?" Always cheap to build, huge differentiator.

```
Add comprehensive audit logging to Sylk.

GOAL:
- Every write operation (create/update/delete) on important entities is logged
- Searchable in mobile app for owners
- Includes: actor, action, entity, before/after diff, IP, timestamp, user-agent
- Used by Foreman for "who changed X?" queries

BACKEND:
1. Migration: `audit_log` table — id, company_id, actor_user_id, actor_type (user/foreman/system/api), action (create/update/delete), entity_type, entity_id, before_json, after_json, ip, user_agent, source (mobile/web/api/foreman), created_at
2. Index on (company_id, entity_type, entity_id, created_at desc)
3. Middleware `backend/src/middleware/auditLog.js`:
   - Wraps Supabase mutations
   - Captures before-state, runs mutation, captures after-state, writes audit row asynchronously (fire-and-forget queue)
4. Apply middleware to ALL routes that mutate: projects, estimates, invoices, change_orders, customers, workers, payments, expenses, time_entries, service_plans, visits
5. New routes in `backend/src/routes/audit.js`:
   - GET `/audit/entity/:type/:id` — full history of an entity
   - GET `/audit/user/:userId` — what this user did
   - GET `/audit/recent` — last 50 across company
6. Foreman tools: `get_entity_history`, `who_changed`, `recent_activity`

MOBILE (frontend/):
1. New component `frontend/src/components/AuditTrail.tsx` — collapsible "history" section on entity detail screens
2. Add "View history" button on: project detail, estimate detail, invoice detail, customer detail
3. New screen `frontend/src/screens/owner/AuditLogScreen.tsx` — full searchable log with filters (entity type, user, date range)
4. Format diffs nicely: "Total changed from $4,200 to $4,800"
5. i18n: `audit.title`, `audit.changed`, `audit.created`, `audit.deleted`, `audit.by`, `audit.at`
6. Foreman flow: "Foreman, who changed the Smith estimate?" → tool call → readable summary

DONE WHEN:
- Editing any entity creates an audit row with full diff
- Owner can see "edited by Joe at 2pm, changed total from $X to $Y" on any project/estimate
- Foreman can answer "what changed today?" naturally
- Performance: audit writes don't slow down mutations (async queue)
- Tests cover: middleware captures correctly, queries work, diffs render
```

---

## Task 4: Geofence enforcement on clock-in

**Why:** Workers clocking in from home. Buildertrend brags about geofence enforcement. You have GPS already — just add the boundary check.

```
Add geofence enforcement to worker clock-in.

GOAL:
- Owner sets a radius around the project address (default 250 meters)
- Worker clocking in outside the geofence is blocked or flagged
- Three modes: STRICT (block clock-in), WARN (allow but flag), OFF (no enforcement)
- Per-project override of company default
- Audit log of geofence violations

BACKEND:
1. Migration: add `geofence_meters` column to `projects` table (default 250) and `geofence_mode` ('strict' | 'warn' | 'off') with company-level default
2. New service `backend/src/services/geofenceService.js`:
   - `checkGeofence(projectId, lat, lng)` — returns { withinFence: bool, distance: number, mode: string, projectLocation: {...} }
3. Modify clock-in endpoint to call checkGeofence:
   - If STRICT and outside: 403 with reason
   - If WARN and outside: allow but mark `time_entries.geofence_violation = true`
   - If OFF: no check
4. New route `/projects/:id/geofence` (PUT) — owner updates radius/mode
5. Foreman tool: `set_geofence`, `list_geofence_violations`

MOBILE (frontend/):
1. Worker app: when clocking in, geocode current GPS, compare to project address, show modal:
   - In fence: green checkmark, normal flow
   - Outside (warn): yellow warning, "I'm outside the work area, clock in anyway" requires reason text
   - Outside (strict): red block, "Get to the work area to clock in"
2. Show distance on the clock-in screen ("87m from job site" or "1.2km away")
3. Owner project settings screen: geofence radius slider + mode picker, with map preview showing the circle (use react-native-maps)
4. Owner clock-in detail view: show "✓ Within fence" or "⚠ Was 1.2km away — reason: [worker note]"
5. i18n: `geofence.within`, `geofence.outside`, `geofence.distance`, `geofence.reason_required`
6. Foreman: "Foreman, who's clocked in outside their job today?" → list violations

DONE WHEN:
- Setting a radius on a project blocks clock-in from outside that radius (in strict mode)
- Map preview shows the circle correctly
- Violations appear in audit log + owner can review
- Worker UX is clear about why they can't clock in
- All three modes tested
```

---

## Task 5: Foreman daily summary at 6pm

**Why:** Owner gets one focused report every evening showing the day's status. Foreman composes it from existing data.

```
Build Foreman's daily summary feature.

GOAL:
- Every evening at 6pm local time per owner, Foreman composes a summary of the day
- Sent via push notification + email
- Format: "Today: 12 hours logged across 3 jobs · 2 invoices sent ($4,200) · 1 payment received ($2,100) · 1 issue: Smith project is trending over budget"
- Tappable: opens detail screen with full breakdown
- Owner can tweak: ON/OFF, time of day, what's included

BACKEND:
1. New service `backend/src/services/dailySummaryService.js`:
   - `composeSummary(companyId, date)` — gathers: hours logged, jobs touched, invoices sent, payments received, expenses, daily reports submitted, overdue items, budget warnings
   - Uses existing data queries; no new tables needed for v1
   - Calls Foreman with structured prompt to write owner-friendly summary
2. New scheduler `backend/src/services/scheduler.js` if not present:
   - Runs every 5 minutes, finds owners whose local time is at their summary hour, fires
3. Migration: `daily_summary_settings` per owner: enabled (default true), hour (default 18), include_flags (json — what to include)
4. Route GET `/summaries/today` and GET `/summaries/:date`
5. Send via existing push service + email service

MOBILE (frontend/):
1. New screen `frontend/src/screens/owner/DailySummaryScreen.tsx`:
   - Header: today's date + Foreman avatar + summary text
   - Sections: hours, money in/out, projects touched, alerts, what to do tomorrow
   - "Ask Foreman" inline at bottom
2. Push notification at the configured hour with summary preview
3. Settings screen for summary: enabled toggle, time picker, sections toggle
4. Add to dashboard: mini "today" widget with link to full screen
5. i18n with rich Foreman tone in EN/ES/PT
6. Voice: tap mic on summary screen → "Tell me about today" → Foreman speaks the summary

DONE WHEN:
- I get a real daily summary push at the configured time
- Tapping it opens the detail screen
- Toggling sections in settings actually changes the summary content
- Foreman's writing style is sharp, not corporate (use existing personality from `systemPrompt.js`)
- Localized correctly EN/ES/PT
- Voice version works
```

---

## Task 6: Apple Pay / Google Pay

**Why:** Reduce friction at checkout. Stripe is already wired — just turn it on.

```
Enable Apple Pay and Google Pay in Sylk's payment flow.

GOAL:
- Customers paying invoices via the app's checkout (or shared payment link) can use Apple Pay / Google Pay
- Workers/owners receiving deposits can use them too
- Stripe Payment Element / Payment Sheet handles it; we just configure

BACKEND:
1. In Stripe service (`backend/src/routes/stripe.js`), ensure Payment Intent creation includes `automatic_payment_methods: { enabled: true }` so Apple/Google Pay show up
2. Verify Stripe Connect setup if applicable (each company is a connected account or we charge centrally — use existing pattern)
3. Add Apple Pay merchant ID configuration to environment

MOBILE (frontend/):
1. In React Native, integrate `@stripe/stripe-react-native` Payment Sheet
2. On invoice detail screen → "Pay" button → opens PaymentSheet with all methods including Apple/Google Pay
3. On the public estimate-pay-link landing screen (if mobile webview), same
4. Add Apple Pay merchant config to ios/ entitlements
5. Add Google Pay enabled flag in android/ manifest
6. Test on physical devices (simulator doesn't support Apple Pay)
7. i18n: `payment.pay_now`, `payment.success`, `payment.failed`

DONE WHEN:
- I can pay a real $1 test invoice with Apple Pay on iPhone
- Google Pay flow works on Android device
- Failure cases handled gracefully
- Receipt automatically generated and synced
```

---

## Task 7: Refer-a-friend program

**Why:** Free leads. Past customers refer new ones, get a reward.

```
Build the refer-a-friend system.

GOAL:
- Each customer gets a unique referral code
- They share via SMS/email/link
- Referee enters code on first quote/visit
- Customer earns reward (configurable: $X credit, % off, free service)
- Owner sees referral chain in dashboard

BACKEND:
1. Migration:
   - `referral_codes` — id, company_id, customer_id, code (unique), reward_type, reward_value, uses_count, max_uses, created_at, expires_at
   - `referrals` — id, code_id, referrer_customer_id, referee_customer_id, referee_first_invoice_id, status (pending/qualified/rewarded), created_at
2. New routes `backend/src/routes/referrals.js`:
   - POST `/referrals/codes` — owner creates default referral program for company
   - GET `/customers/:id/referral-code` — fetch or auto-generate per customer
   - POST `/referrals/redeem` — referee or owner records "this customer was referred by X"
   - POST `/referrals/qualify/:id` — fires when referee's first invoice is marked paid → reward issued
3. Service `backend/src/services/referralService.js`:
   - Generate friendly codes (e.g., "JANE-2EX9")
   - Calculate and apply rewards (credit on next invoice, or coupon code)
4. Hook into invoice.payment_received event — auto-qualify pending referrals
5. Foreman tools: `get_referral_code`, `list_referrals`, `referral_stats`

MOBILE (frontend/):
1. New screen `frontend/src/screens/owner/ReferralProgramScreen.tsx`:
   - Configure reward type/value
   - View total referrals, qualified, rewards paid
   - Per-customer view: who referred them, who they referred
2. On customer detail: show referral code + "Send via SMS" / "Send via email" / "Copy link" buttons
3. Customer-facing view in portal magic-link area: "Refer a friend, get $50" with shareable card
4. Auto-include referral CTA in completed-job emails/SMS
5. i18n: `referrals.title`, `referrals.your_code`, `referrals.share`, `referrals.earned`
6. Foreman: "Foreman, send a referral text to all customers from last quarter" → bulk action

DONE WHEN:
- Customer record shows their unique code
- Referee records with code linked to referrer
- When referee pays first invoice, referrer gets credit applied to their next invoice automatically
- Owner dashboard shows referral funnel
```

---

## Task 8: Public REST API + per-owner API keys

**Why:** Foundation for Zapier/Make.com integrations. Power-user feature mid-market expects.

```
Build a public REST API for Sylk.

GOAL:
- Owner can generate API keys in settings
- API exposes major resources via Bearer token auth
- Versioned (`/api/v1/...`)
- Rate-limited per key
- OpenAPI spec auto-generated

BACKEND:
1. Migration: `api_keys` table — id, company_id, key_hash, key_prefix (first 8 chars for display), name, scopes (json), created_at, last_used_at, revoked_at, rate_limit_rpm
2. New middleware `backend/src/middleware/apiAuth.js`:
   - Validates Bearer token, looks up company, attaches to req
   - Updates last_used_at
   - Rate-limits per key
3. Mount routes at `/api/v1/`:
   - GET/POST `/api/v1/customers`
   - GET/POST/PATCH `/api/v1/projects`
   - GET/POST `/api/v1/estimates`
   - GET/POST `/api/v1/invoices`
   - GET/POST `/api/v1/leads` (after Task 13)
   - GET/POST `/api/v1/expenses`
   - GET `/api/v1/dashboard` — read-only metrics
4. OpenAPI spec at `/api/v1/openapi.json` auto-generated from route definitions (use express-openapi or hand-roll)
5. Public docs page (later — for now JSON spec is enough)
6. Routes for managing keys: POST `/account/api-keys`, GET `/account/api-keys`, DELETE `/account/api-keys/:id`
7. Foreman tool: `generate_api_key`, `list_api_keys`, `revoke_api_key`

MOBILE (frontend/):
1. New screen `frontend/src/screens/owner/ApiKeysScreen.tsx` in Settings:
   - List existing keys with prefix + name + last used + revoke button
   - "Create new key" — show full key ONCE in copyable format with warning
   - Per-key scope picker (read-only, read-write, all)
2. Settings entry "Developers / API"
3. i18n: `api.keys`, `api.create`, `api.copy_warning`, `api.last_used`
4. Foreman: "Foreman, create an API key for my Zapier integration" → triggers key creation, copies to clipboard

DONE WHEN:
- I can curl `/api/v1/customers` with Bearer token and get my customers
- 401 if token invalid/revoked
- 429 if over rate limit
- OpenAPI spec generates correctly
- Mobile UI lets me create + revoke keys
- Tests cover auth, rate-limit, scopes
```

---

## Task 9: Review automation post-job

**Why:** Trades win on Google star count. Auto-text after job completion.

```
Build automated review collection.

GOAL:
- When a job is marked complete, auto-text the customer "How'd we do? [link]"
- Link goes to a sentiment screen: 1-5 star
- 4-5 stars → push to Google review URL
- 1-3 stars → internal feedback form (don't surface publicly)
- Per-tech attribution
- Owner sees response funnel

BACKEND:
1. Migration:
   - `review_requests` — id, company_id, customer_id, project_id (or visit_id), tech_user_id, sent_at, opened_at, completed_at, rating, feedback_text, public_review_url, status
   - `company_review_settings` — google_place_id, threshold_for_public_push (default 4), template_text (per-language)
2. New service `backend/src/services/reviewAutomation.js`:
   - Hook into project.completed and visit.completed events
   - Send SMS via existing service with magic-link
3. Public route `/reviews/:token` (no auth):
   - GET — render rating screen
   - POST — submit rating + optional comment
   - If rating ≥ threshold and Google place ID set: redirect to Google review URL
   - Else: show "thank you" + capture feedback
4. Owner routes:
   - GET `/reviews/funnel` — sent / opened / completed / 4+ counts
   - GET `/reviews/recent` — recent reviews list
5. Foreman tools: `request_review`, `review_funnel`, `recent_negative_reviews`

MOBILE (frontend/):
1. New screen `frontend/src/screens/owner/ReviewsScreen.tsx`:
   - Funnel chart (sent → opened → rated → 4+ stars)
   - Per-tech leaderboard
   - Recent feedback list (negative ones flagged)
   - Settings: enable, threshold, Google place ID, custom message
2. Per-project / per-visit detail: "Review request sent on X" or "Send review request" button
3. Customer-facing rating screen lives in `website/` portal area but linked from SMS — coordinate with web. For mobile-only build, just handle the API + admin views and link to a TBD web page.
4. i18n template: "Hey {customer}! How'd we do on the {service}? Tap here: {link}" (EN/ES/PT)
5. Foreman: "Foreman, send a review request to last week's completed jobs" → bulk action

DONE WHEN:
- Marking a project complete sends an SMS within 1 hour
- Tapping the link rates the job
- 4+ rating redirects to Google review URL
- Owner sees the funnel
- Per-tech attribution works
```

---

## Task 10: Consumer financing (Wisetack)

**Why:** Lift ticket size 25-40%. Mostly partner integration work.

```
Integrate Wisetack consumer financing.

GOAL:
- "From $X/mo" CTA on quotes ≥ $1,000
- Customer applies for financing in-flow
- Wisetack approves; pays company in full; customer pays Wisetack monthly
- Approval status syncs back to Sylk

BACKEND:
1. New service `backend/src/services/wisetackService.js`:
   - `createLoanInquiry(estimateId)` — creates Wisetack inquiry, returns hosted application URL
   - `handleWebhook(req)` — process status updates (approved/declined/funded/cancelled)
   - `calculateMonthly(amount, termMonths, apr)` — for "from $X/mo" display
2. Migration: `financing_applications` — id, company_id, customer_id, estimate_id, wisetack_loan_id, amount, term_months, status, application_url, decline_reason, created_at, updated_at
3. New routes in `backend/src/routes/financing.js`:
   - POST `/financing/inquiry` — create inquiry for an estimate
   - GET `/financing/status/:id`
   - POST `/webhooks/wisetack` — webhook
4. Verify Wisetack webhook signatures
5. Add merchant onboarding flow — owner connects their Wisetack account via OAuth (or hosted form)
6. Foreman tools: `offer_financing`, `financing_status`

MOBILE (frontend/):
1. On estimate detail screen: if amount ≥ threshold, show "Offer financing" toggle. When on, "from $XX/mo" appears on shared estimate links + emails + SMS
2. New screen `frontend/src/screens/owner/FinancingScreen.tsx`:
   - List of financing applications and statuses
   - Funnel: offered / applied / approved / funded
3. Customer-facing: estimate share-link includes "Apply for financing" button → opens Wisetack hosted form
4. Settings entry: connect Wisetack account, set merchant ID
5. i18n: `financing.from_per_month`, `financing.apply`, `financing.approved`, `financing.declined`
6. Foreman: "Foreman, add financing to the Smith bathroom estimate" → toggles the flag

ENV NEEDED:
- WISETACK_API_KEY
- WISETACK_WEBHOOK_SECRET

If env missing, mock mode that always returns "approved with mock loan ID."

DONE WHEN:
- Estimate ≥ threshold shows monthly pricing
- Customer can click apply, complete Wisetack flow, get approved
- Status syncs back
- Owner sees funnel and per-customer status
- Foreman can manage the flag
```

---

## Task 11: Good-Better-Best proposal mode

**Why:** HVAC/plumbing/roofing salespeople present 3 tiers. Doubles close rate when tier-priced.

```
Add Good-Better-Best proposals to Sylk.

GOAL:
- Owner creates a 3-tier proposal: Good / Better / Best, each with its own line items + total
- Customer picks a tier in the shared link or portal
- Picking auto-converts to that tier's estimate (signed if e-sign added) → invoice
- Templates so owners can save common GBB sets per service

BACKEND:
1. Migration:
   - `proposals` — id, company_id, customer_id, project_id, status (draft/sent/picked/expired), picked_tier, expires_at, created_at
   - `proposal_tiers` — id, proposal_id, name, position, total, description, line_items_json
2. New service `backend/src/services/proposalGenerator.js`:
   - `createProposal(customerId, tiers[])` — multiple tiers
   - `selectTier(proposalId, tierId)` — converts to estimate; estimate flows through normal pipeline
3. Routes `backend/src/routes/proposals.js`:
   - POST `/proposals`
   - PATCH `/proposals/:id`
   - GET `/proposals/:id`
   - POST `/proposals/:id/select` (public via token)
4. Templates: `proposal_templates` — id, company_id, name, service_type, tiers_json (default tiers)
5. Foreman tools: `create_gbb_proposal`, `select_proposal_tier`, `proposal_templates`

MOBILE (frontend/):
1. New screen `frontend/src/screens/owner/ProposalBuilderScreen.tsx`:
   - 3-column layout: Good / Better / Best
   - Add line items per tier (or pull from cost catalog after Task 12)
   - Auto-calculate totals
   - Preview button shows customer view
2. New screen `frontend/src/screens/shared/ProposalPreviewScreen.tsx` — what customer sees
3. New screen `frontend/src/screens/owner/ProposalTemplatesScreen.tsx` — save/load templates
4. Customer-facing tier picker (web-side; here just link to it)
5. i18n: `proposal.good`, `proposal.better`, `proposal.best`, `proposal.recommended`, `proposal.select_this`
6. Foreman: "Foreman, build a 3-tier proposal for the Smith HVAC install" → uses template + customizes

DONE WHEN:
- I can create a 3-tier proposal in 30 seconds with templates
- Customer link shows clean tier comparison
- Picking a tier creates a normal estimate that flows through existing pipeline
- Foreman builds proposals end-to-end
```

---

## Task 12: Estimate / cost-item catalog

**Why:** Mid-market reuses pricing. Foreman generates estimates faster from a catalog than from scratch.

```
Build the cost-item catalog.

GOAL:
- Saved library of line items per company (description, unit, unit cost, markup %, tax category, default qty)
- Bundles: "Standard Kitchen Remodel" = group of line items with default quantities
- Used by estimate creation (manual + Foreman)
- Foreman pulls from catalog instead of guessing

BACKEND:
1. Migration:
   - `catalog_items` — id, company_id, sku (optional), description, unit (each/sqft/lf/hour), unit_cost, default_markup_pct, default_qty, tax_category, trade, archived, created_at, updated_at
   - `catalog_bundles` — id, company_id, name, description, trade
   - `catalog_bundle_items` — bundle_id, item_id, default_qty
2. Routes `backend/src/routes/catalog.js`:
   - CRUD for items + bundles
   - GET `/catalog/search?q=...&trade=...` — for autocomplete
   - POST `/catalog/import-from-estimate/:estimateId` — turn an existing good estimate into reusable bundle
3. Service: `applyBundleToEstimate(bundleId, estimateId)` — adds all bundle items as estimate line items
4. Foreman tools: `search_catalog`, `add_bundle_to_estimate`, `save_estimate_as_bundle`

MOBILE (frontend/):
1. New screens:
   - `CatalogItemsScreen.tsx` — searchable list, archive, edit
   - `CatalogBundlesScreen.tsx` — list of bundles, drill into items
   - `CatalogItemEditScreen.tsx` — full editor
2. In estimate creation: "Add from catalog" button opens picker; "Add bundle" applies a bundle
3. Long-press on existing estimate line → "Save to catalog" option
4. Foreman flow: "estimate a kitchen remodel for the Smiths" → Foreman searches catalog, applies bundle, customizes
5. i18n: `catalog.title`, `catalog.add_item`, `catalog.add_bundle`, `catalog.search`, `catalog.archive`
6. Bulk import from CSV (later)

DONE WHEN:
- I can add 20 items, build a "Standard Kitchen" bundle, and apply it to a new estimate in 10 seconds
- Foreman uses the catalog automatically when estimating
- Editing items doesn't affect already-issued estimates (snapshot at apply-time)
```

---

## Task 13: Lead pipeline / CRM

**Why:** Sales-stage funnel before a job becomes a project. Today everything's already a "project."

```
Build the lead pipeline / CRM.

GOAL:
- Separate `leads` entity from `projects`
- Configurable pipeline stages with kanban view
- Lead source attribution (channel ROI)
- Auto-convert lead → project on signed estimate
- Conversion analytics

BACKEND:
1. Migration:
   - `leads` — id, company_id, name, contact info (phone, email), address, source (web_form / google_ads / referral / phone / etc.), stage_id, value_estimate, notes, assigned_user_id, created_at, lost_reason
   - `pipeline_stages` — id, company_id, name, position, default_for_new (bool), is_won_stage (bool), is_lost_stage (bool)
   - `lead_activities` — id, lead_id, activity_type (call/email/sms/meeting/note), description, user_id, created_at
2. Default stages on signup: Inquiry → Site visit scheduled → Estimate sent → Estimate viewed → Won → Lost
3. Routes `backend/src/routes/leads.js`:
   - CRUD for leads
   - PATCH `/leads/:id/stage` — move stage
   - POST `/leads/:id/convert` — converts to project, links estimate
   - GET `/leads/funnel` — counts per stage + conversion rate
   - GET `/leads/sources` — performance by source
4. Auto-create lead from public lead form submission (link to a future task — for now just expose the API)
5. Foreman tools: `create_lead`, `move_lead_stage`, `lead_funnel`, `convert_lead_to_project`

MOBILE (frontend/):
1. New screen `frontend/src/screens/owner/LeadsKanbanScreen.tsx`:
   - Horizontal-scroll kanban with stage columns
   - Drag lead card between stages
   - Lead card: name, phone, value, days-in-stage
   - Long-press: quick actions (call, text, email)
2. New screen `frontend/src/screens/owner/LeadDetailScreen.tsx`:
   - Contact info
   - Activity timeline (calls, texts, emails, notes)
   - Assigned estimates
   - Convert to project button
3. New screen `frontend/src/screens/owner/PipelineSettingsScreen.tsx` — manage stages + default sources
4. Dashboard widgets: leads by stage, conversion rate, source ROI
5. i18n full coverage
6. Foreman: "Foreman, who's been in the Estimate Sent stage for >5 days?" → list with quick action

DONE WHEN:
- I can add a lead, drag it through stages, attach estimates, convert to project
- Conversion auto-attaches the won lead's customer to the new project
- Funnel + source performance display correctly
- Foreman manages leads naturally
```

---

## Task 14: Automated follow-up sequences

**Why:** Bid follow-ups close 25%+ more deals. Manual follow-up is the #1 sales leak.

```
Build the automation engine for follow-ups.

GOAL:
- Trigger-based automations: "if estimate sent > 2 days ago and not viewed, send reminder SMS"
- "If lead in Inquiry > 24h, notify owner"
- "If invoice 14 days overdue, auto-text customer + escalate to owner at 30"
- Configurable rules per company
- All channels: SMS, email, push, internal task

BACKEND:
1. Migration:
   - `automation_rules` — id, company_id, name, trigger_type, trigger_config (json: e.g. {"entity":"estimate","condition":"sent_age_days >= 2 AND viewed = false"}), action_type, action_config (json: SMS template, email template, etc.), enabled, last_run_at
   - `automation_runs` — id, rule_id, entity_id, ran_at, success, notes
2. Service `backend/src/services/automationEngine.js`:
   - Cron every 5 min iterates enabled rules, evaluates conditions, runs actions
   - Rule DSL evaluator (simple JSON logic — don't reinvent: use json-logic-js)
3. Pre-built templates so owners don't start from scratch:
   - "Estimate follow-up at 2/5/14 days"
   - "Overdue invoice reminder at 7/14/30 days"
   - "New lead alert"
   - "Birthday discount"
4. Routes `backend/src/routes/automations.js` for CRUD
5. Foreman tools: `create_automation`, `pause_automation`, `automation_runs_today`

MOBILE (frontend/):
1. New screen `frontend/src/screens/owner/AutomationsScreen.tsx`:
   - List of rules with on/off toggles
   - Last-ran indicator + recent runs
   - "Create from template" buttons
   - Custom rule builder (advanced)
2. Rule editor: pick trigger, pick action, fill template variables ({customer.name}, {invoice.amount}, etc.)
3. Settings: enable/disable globally
4. i18n full
5. Foreman: "Foreman, set up follow-ups for any estimate sent more than 3 days without a response" → creates rule

DONE WHEN:
- 5 default templates ship enabled-by-default
- Custom rules execute correctly
- Owner can pause/resume and see run history
- No infinite loops (idempotency on actions)
- Foreman authors rules conversationally
```

---

## Task 15: Selections + allowances (full implementation)

**Why:** Marquee feature for residential remodel. Verify and complete.

```
Build full selections + allowances workflow.

GOAL:
- Owner adds Selection items to a project (Kitchen Cabinets, Backsplash, etc.)
- Each Selection has options (3-5 choices) with photo + price
- Each Selection has an Allowance (budgeted amount)
- Customer picks an option in the portal
- If pick > allowance, auto-create Change Order for the difference (customer signs)
- Project budget updates accordingly

BACKEND:
1. Migration (verify against existing — only add what's missing):
   - `selections` — id, project_id, name, room, allowance, status (draft/awaiting/picked/over), picked_option_id, due_date, notes
   - `selection_options` — id, selection_id, name, description, image_url, price, position, is_default
   - On pick: create change_order if delta > 0, update revised_budget
2. Routes `backend/src/routes/selections.js`:
   - CRUD for selections + options
   - POST `/selections/:id/pick` (customer-side via token)
   - GET `/projects/:id/selections-summary` — total allowance, total picked, variance
3. Image upload: piggyback on existing photo upload service
4. Foreman tools: `create_selection`, `add_option`, `selection_status`, `over_allowance_alert`

MOBILE (frontend/):
1. New screen `frontend/src/screens/owner/SelectionsScreen.tsx` per project:
   - List of selections with status icons
   - Add new selection: name, room, allowance, due date, options with photos
2. Owner can mass-create selections from a kitchen template (after Task 12 catalog)
3. Customer-facing selection picker — coordinate with web portal
4. Project summary widget: "Selections: 8/12 picked, $2,400 over allowance"
5. Push notification to owner when customer picks
6. i18n: `selections.title`, `selections.allowance`, `selections.picked`, `selections.variance`
7. Foreman: "Foreman, create selections for the kitchen remodel using my standard template" → bulk creates

DONE WHEN:
- Owner creates 5 selections with 3 options each in 2 minutes
- Customer picks → auto-CO if over → owner gets push, customer signs CO
- Project budget reflects real-time variance
- Templates speed up selection creation
```

---

## Task 16: Change-order completeness pass

**Why:** Audit said partial. Round it out.

```
Complete the change-order workflow.

GOAL:
- Standalone CO creation (not just from selections)
- Customer e-sign flow
- Project budget auto-updates on signed CO
- CO PDF with line items + customer signature
- Customer-facing portal view shows pending COs

BACKEND:
1. Verify and complete `change_orders` schema — add fields if missing: signed_at, signed_pdf_url, signature_audit_json, sent_at, viewed_at
2. Service `backend/src/services/changeOrderService.js`:
   - `createCO(projectId, lineItems, reason, customerEmail/phone)` — creates draft, generates PDF
   - `sendForSignature(coId)` — uses Task 2 e-sign flow
   - `markSigned(coId, signaturePayload)` — updates project revised_budget, fires invoice if instructed
3. Routes — full CRUD + signature link generation
4. Foreman tools: `create_change_order`, `co_status`, `pending_change_orders`

MOBILE (frontend/):
1. Project detail → COs tab — list with status icons
2. Create CO screen: line items, reason, customer-facing description, "send for signature" button
3. CO detail screen: status, signed PDF preview, audit trail
4. Notifications: customer viewed, customer signed
5. Budget screen on project: original vs revised vs spent
6. i18n
7. Foreman: "Foreman, draft a change order for the extra electrical run on the Smith project, $1,200" → creates draft, prompts to send

DONE WHEN:
- Full CO lifecycle works end-to-end with e-sign
- Project budget auto-updates
- Signed PDF stored and retrievable
- Customer-portal-facing view shows pending CO action item
```

---

## Task 17: Memberships / service agreements

**Why:** Highest-LTV revenue line for HVAC/pest. Auto-renewal + prepaid visit credits.

```
Build memberships / recurring service agreements.

GOAL:
- Owner offers membership tiers (e.g., "Bronze: 2 tune-ups/year + 10% off repairs, $19/mo")
- Customer subscribes → auto-charge via Stripe
- Prepaid visit credits applied to scheduled visits
- Member discount auto-applies on invoices
- Renewal reminders

BACKEND:
1. Migration:
   - `membership_plans` — id, company_id, name, description, price_monthly, price_yearly, included_visits_per_period, period (month/year), discount_pct, terms_json
   - `customer_memberships` — id, plan_id, customer_id, started_at, current_period_end, status (active/paused/cancelled), stripe_subscription_id, visits_remaining
   - `membership_visit_credits` — track usage per visit
2. Stripe integration: create subscription on signup, webhook handles renewals
3. Service hooks: invoice creation checks for active membership and applies discount; visit creation checks credits
4. Routes `backend/src/routes/memberships.js`
5. Foreman tools: `create_membership_plan`, `subscribe_customer`, `member_status`, `expiring_memberships`

MOBILE (frontend/):
1. New screen `frontend/src/screens/owner/MembershipPlansScreen.tsx` — manage offered plans
2. Customer detail → membership tab: subscribe / manage / cancel
3. Visit detail: shows "Member visit (free, 3/4 remaining)" or applies discount
4. Dashboard widget: active members, MRR, expiring soon
5. i18n
6. Foreman: "Foreman, sign the Smiths up for the Silver HVAC plan" → creates subscription, charges via Stripe

DONE WHEN:
- I can offer 3 plans, sign a customer up, auto-charge monthly
- Visit credits track and apply
- Discounts auto-apply on invoices for members
- Cancellation/pause flow works
- Renewal reminders go out
```

---

## Task 18: QuickBooks Online sync — Phase 1 (OAuth + customers/invoices)

**Why:** Crack open the entire $300K+ contractor market. The biggest moat. Split into 3 phases to keep PRs reviewable.

```
Phase 1 of QBO sync: OAuth flow + Customer + Invoice sync.

GOAL:
- Owner connects their QBO account via OAuth
- Bidirectional sync of customers
- Bidirectional sync of invoices (and their payments)
- Conflict resolution UI

BACKEND:
1. Intuit Developer app setup (OAuth 2.0). Add `INTUIT_CLIENT_ID`, `INTUIT_CLIENT_SECRET` env.
2. Service `backend/src/services/quickbooks/`:
   - `oauthService.js` — connect/disconnect, token refresh
   - `customerSync.js` — pull QBO customers, push Sylk customers, match by email/phone
   - `invoiceSync.js` — pull QBO invoices, push Sylk invoices
   - `conflictResolver.js` — last-write-wins by default, prompts owner if both edited within 5 min
3. Migration:
   - `qbo_connections` — company_id, access_token (encrypted), refresh_token (encrypted), realm_id, expires_at, last_sync_at, sync_settings_json
   - Add `qbo_id` columns to customers + invoices (nullable, unique with company)
   - `qbo_sync_log` — entity_type, entity_id, direction (push/pull), success, error, ran_at
4. Sync engine: incremental sync every 15 min via cron + webhook for real-time changes (Intuit webhooks)
5. Routes `backend/src/routes/quickbooks.js`:
   - GET `/quickbooks/connect` — start OAuth
   - GET `/quickbooks/callback` — OAuth return
   - POST `/quickbooks/disconnect`
   - POST `/quickbooks/sync-now` — manual trigger
   - GET `/quickbooks/sync-status`
   - GET `/quickbooks/conflicts` — list of conflicts to resolve
6. Foreman tools: `qbo_status`, `qbo_sync_now`, `qbo_resolve_conflict`

MOBILE (frontend/):
1. New screen `frontend/src/screens/owner/QuickBooksScreen.tsx`:
   - Connect button → OAuth web flow → returns to app
   - Connection status (connected company name, last sync)
   - Sync now button + progress
   - Conflict list with side-by-side resolve
   - Sync settings (which entities to sync, sync direction per entity)
2. Customer detail: shows QBO link icon if synced
3. Invoice detail: shows QBO link + sync status
4. i18n
5. Foreman: "Foreman, sync to QuickBooks now" → triggers manual sync

DONE WHEN:
- I connect QBO, my customers + invoices appear in QBO within 1 minute
- Editing in QBO syncs back within 15 min (or on demand)
- Conflict UI works for simultaneous edits
- Disconnecting cleanly clears tokens (without deleting data)
- Tests cover OAuth + token refresh + sync logic
```

---

## Task 19: QuickBooks Online sync — Phase 2 (vendors / bills / payments)

**Why:** Continuation of Task 18. Adds AP side.

```
Phase 2 of QBO sync: Vendors, Bills, Bill Payments, Estimates.

(Builds on Task 18 foundations)

GOAL:
- Sync vendors bidirectionally
- Sync vendor bills (after Task 22 introduces them)
- Sync bill payments
- Sync estimates as QBO Estimates

BACKEND:
1. Extend `backend/src/services/quickbooks/`:
   - `vendorSync.js`
   - `billSync.js`
   - `paymentSync.js`
   - `estimateSync.js`
2. Map fields carefully — QBO has its own structure. Document the field-by-field map.
3. Add to existing sync orchestrator
4. Foreman tools updated

MOBILE:
1. Update QuickBooks screen to show all entity types in sync settings
2. Vendor detail / bill detail / estimate detail show QBO link icons
3. i18n
4. No new screens needed

DONE WHEN:
- All four new entity types sync bidirectionally
- Field mapping respects QBO requirements (e.g., QBO vendor needs DisplayName)
```

---

## Task 20: QuickBooks Online sync — Phase 3 (time + cost codes + reconciliation)

**Why:** Job costing precision. Time entries flow to QBO, projects map to QBO Class/Customer:Sub.

```
Phase 3 of QBO sync: Time entries, cost codes, project ↔ QBO Customer:Sub mapping.

(Builds on Tasks 18-19)

GOAL:
- Sylk projects map to QBO sub-customers (so all costs/income roll up to parent)
- Cost codes map to QBO Items or Class
- Time entries push to QBO (with cost rate + billing rate)
- Bank reconciliation hand-off (Sylk's bank rec doesn't have to compete; defer to QBO if connected)

BACKEND:
1. Cost code mapping UI: Sylk cost codes ↔ QBO Items
2. Project → QBO sub-customer auto-create on first sync
3. Time entry sync with hourly cost + billable flag
4. Optional: when QBO is connected, hide some Sylk reconciliation features (or show "QBO authoritative")
5. WIP report uses QBO data when available

MOBILE:
1. Cost code mapping screen
2. Project detail shows QBO sub-customer reference
3. Time entry detail shows QBO sync status
4. i18n

DONE WHEN:
- Time entry on a project posts to QBO with cost code → flows to job profitability report in QBO
- Project profitability matches between Sylk and QBO
- Cost codes are first-class
```

---

## Task 21: Real-time job costing engine

**Why:** Mid-market wants forecast variance, not just historical P&L.

```
Build the real-time job costing engine.

GOAL:
- Per-project view: budget vs committed (open POs + signed contracts) vs actual (paid bills + payroll) vs forecast
- Variance alerts: ">10% over forecast"
- WIP report: % complete × contract value vs billed-to-date

BACKEND:
1. Service `backend/src/services/jobCostingEngine.js`:
   - `computeProjectCosting(projectId)` — returns { budget, committed, actual, forecast, variance, percent_complete }
   - Forecast = committed + (uncompleted_phases × labor_estimate)
   - Cache per-project in Supabase materialized view, refresh on relevant events
2. Routes:
   - GET `/projects/:id/job-costing`
   - GET `/job-costing/wip-report` — all active projects
3. Alert: when variance > threshold, push to owner + log to audit
4. Foreman tools: `job_cost_status`, `over_budget_projects`, `wip_report`

MOBILE (frontend/):
1. New screen `frontend/src/screens/owner/JobCostingScreen.tsx`:
   - List of projects with variance badges (red = over, green = under)
   - Drill into project → 4-bar visualization (budget / committed / actual / forecast)
   - Variance breakdown by phase
2. Dashboard widget: top 3 over-budget projects
3. WIP report screen
4. i18n
5. Foreman: "Foreman, which projects are running over?" → lists with variance + reasons

DONE WHEN:
- Numbers tie out across all entities (PO + bills + time + invoices)
- Variance updates in near-real-time
- Alerts fire correctly
- WIP report exports to CSV
```

---

## Task 22: Vendor bills / accounts payable

```
Build the AP / vendor bills module.

GOAL:
- Enter bills from vendors (separate from one-off expenses)
- Bills can be unassigned, project-assigned, or PO-assigned
- Bill aging report
- Schedule bill payments
- Pay via ACH or print check
- Sync to QBO when connected

BACKEND:
1. Migration:
   - `vendor_bills` — id, company_id, vendor_id, bill_number, bill_date, due_date, total, status (draft/open/paid/overdue), project_id, po_id, line_items_json, attachment_url
   - `bill_payments` — bill_id, amount, payment_date, payment_method, reference_number
2. Routes `backend/src/routes/bills.js`
3. Service to compute aging
4. Auto-detect duplicate bills (same vendor + bill number)
5. Foreman tools: `enter_bill`, `bill_aging`, `pay_bill`

MOBILE (frontend/):
1. Screens:
   - `BillsListScreen.tsx` with filter by vendor/status/aging
   - `BillCreateScreen.tsx` with photo capture (auto-OCR vendor + amount + date — use existing receipt scanner)
   - `BillDetailScreen.tsx`
2. Dashboard widget: bills due this week
3. Foreman: "Foreman, enter this Home Depot bill for $342, attach to Smith project" → creates from photo
4. i18n

DONE WHEN:
- Photo capture → bill created with vendor/amount/date pre-filled
- Project P&L shows bills correctly
- Aging report works
```

---

## Task 23: Purchase orders with approval

```
Build the PO module.

GOAL:
- Create PO with vendor, line items, project
- Approval workflow if amount > threshold
- Receive against PO (partial or full)
- 3-way match (PO ↔ receipt ↔ bill)

BACKEND:
1. Migration: `purchase_orders`, `po_line_items`, `po_receipts`
2. Routes for CRUD + approve + receive
3. Service to track open POs (for committed cost in job costing)
4. Foreman tools: `create_po`, `approve_po`, `receive_po`

MOBILE (frontend/):
1. Screens:
   - PO list with status (draft/pending approval/open/received/closed)
   - PO create with line items, vendor picker, project picker
   - Approval inbox for owner
   - Receive screen with quantity received per line
2. Dashboard widget: pending approvals
3. i18n
4. Foreman: "Foreman, create a PO for $4,200 of lumber from ABC Supply for Smith project" → creates draft

DONE WHEN:
- Full PO lifecycle works
- Job costing picks up committed costs
```

---

## Task 24: Sales tax automation

```
Add automated sales tax to invoices.

GOAL:
- Per-zip tax rate lookup (use Avalara API or static rate table)
- Per-line-item tax category (some items taxable, some not — labor often not)
- Auto-apply on invoice creation
- Tax summary report by jurisdiction

BACKEND:
1. Service `backend/src/services/taxService.js` — uses Avalara if configured, else static rates
2. Migration: `tax_rates` table for static fallback, `tax_categories` for per-item categorization
3. Modify invoice creation to compute tax line
4. Tax report endpoint
5. Foreman tools: `tax_for_zip`, `tax_summary`

MOBILE:
1. Settings: tax provider config (Avalara key or use built-in rates)
2. Cost catalog: tax category per item
3. Invoice line item: tax indicator
4. Tax report screen
5. i18n

DONE WHEN:
- Invoice auto-computes correct tax for the customer's zip
- Per-line-item taxability respected
- Quarterly tax summary exports correctly
```

---

## Task 25: Multi-currency support

```
Add multi-currency support.

GOAL:
- Per-company default currency
- Per-customer currency override (BRL for Brazilian customer of US contractor, etc.)
- Foreman/owner sees totals in correct currency
- Reports in company's default currency (with FX conversion shown)

BACKEND:
1. Migration: add `currency` column to companies, customers, projects, estimates, invoices (default to USD inheriting from company)
2. FX rate service (use exchangerate-api.com or similar; cache daily)
3. All money displays go through formatter that respects currency
4. Foreman speaks in customer's currency

MOBILE:
1. Settings: company default currency picker
2. Customer detail: currency override
3. All money fields use Intl.NumberFormat with locale
4. i18n includes currency formatting

DONE WHEN:
- Brazilian customer's invoice shows R$ with proper formatting
- Owner's dashboard shows totals in their default
- FX rate displayed when viewing cross-currency
```

---

## Task 26: Automated payment reminders

```
Build payment-reminder automation.

GOAL:
- 7/14/30 days overdue → auto-text + email
- Escalation: 60 days → owner notified
- Stop on payment received
- Configurable thresholds + templates per company

BACKEND:
1. Use automation engine from Task 14
2. Pre-built rules: overdue 7/14/30/60 days
3. Templates per company, per language
4. Stop trigger on invoice.paid event

MOBILE:
1. Settings: enable per-threshold + edit template
2. Per-invoice: see reminder history
3. Dashboard widget: overdue + reminders sent
4. Foreman: "Foreman, send reminders to all 14-day overdue accounts" → bulk action

DONE WHEN:
- Reminders fire on schedule
- Stop reliably on payment
- Owner can customize without coding
```

---

## Task 27: Dispatch board (drag-drop)

```
Build the dispatch board.

GOAL:
- Visual schedule: techs as rows, time as columns (hour blocks for the day, day blocks for the week)
- Drag a job onto a tech-time cell to assign
- Skill/zone/equipment matching: when dragging, suggest best techs (highlighted in green)
- Notification to tech on assignment
- Real-time updates across team

BACKEND:
1. New table or use existing schedule entity. Ensure: visit/job has assigned_user_id, scheduled_start, scheduled_end
2. Service: `suggestTechs(jobId)` — score techs by skills + zone + current load
3. Real-time pub/sub via Supabase Realtime
4. Foreman tools: `assign_tech`, `suggest_tech`, `dispatch_status`

MOBILE (frontend/):
1. New screen `frontend/src/screens/owner/DispatchBoardScreen.tsx`:
   - Day/week toggle
   - Horizontal scroll if many techs
   - Touch-and-drag jobs to reassign
   - Color-code by job type/urgency
   - Conflict detection (overlapping bookings)
2. Tech mobile: receives push when assigned
3. Foreman: "Foreman, who's the best tech for the Smith HVAC tomorrow at 10am?" → suggests with reasoning
4. i18n

DONE WHEN:
- Drag-drop works smoothly on iPad-sized screen
- Suggestions are accurate
- Assignments propagate in real-time
- Conflicts highlighted
```

---

## Task 28: Smart route optimization (TSP)

```
Build route optimization.

GOAL:
- Given a list of visits for a tech today, optimize order to minimize drive time
- Constraint-aware: time windows, skill requirements, traffic
- Use Google Maps Routes API or build with OR-Tools

BACKEND:
1. Service `backend/src/services/routeOptimizer.js`:
   - Input: visits[] with locations, time windows, durations
   - Output: optimized order with ETAs
   - Use Google Routes API for routing matrix; OR-Tools for TSP
2. Endpoint: POST `/routes/optimize` (per tech, per day)
3. Foreman tools: `optimize_route`, `route_summary`

MOBILE (frontend/):
1. Tech home screen: "Today's route" with optimized order + map
2. Dispatcher (owner) view: "Optimize all routes" button → re-orders day's visits
3. Live re-routing if a visit gets added or cancelled
4. i18n
5. Foreman: "Foreman, optimize my crew's routes for today" → applies optimization

DONE WHEN:
- Real route is meaningfully shorter (verify on test data)
- Constraints respected
- Re-optimization on changes works
```

---

## Task 29: Punch list with photo pins

```
Build the punch list module.

GOAL:
- Per-project punch list — items requiring fix/touch-up
- Pin location on a photo (or floor plan if uploaded)
- Assign to worker, track status
- Customer-visible at project closeout

BACKEND:
1. Migration: `punch_list_items` — id, project_id, description, photo_url, photo_pin_x, photo_pin_y, assigned_to, status (open/in_progress/done), priority, created_at
2. Routes for CRUD
3. Foreman tools: `create_punch_item`, `punch_status`

MOBILE (frontend/):
1. Project detail → Punch list tab
2. Add punch item: take photo or pick from gallery, tap on photo to drop a pin, describe issue, assign
3. Worker view: my punch items, mark complete with completion photo
4. Customer-portal-facing summary at closeout
5. i18n
6. Foreman: "Foreman, add a punch item for the chipped paint in the kitchen" + voice photo upload

DONE WHEN:
- Photo + pin + assignment + completion all work
- Customer sees clean punch list at closeout
```

---

## Task 30: Photo workflow + AI tagging + before/after

```
Upgrade the photo workflow.

GOAL:
- Per-project photo gallery with tags (room, phase, before/after, daily report linkage)
- AI auto-tag (vision API: "looks like a kitchen photo")
- Pair before/after photos
- One-click share to portal / social / email

BACKEND:
1. Migration: extend `project_photos` table with tags[], pairing_id, ai_caption, taken_at, taken_by
2. Service: vision tagging via OpenRouter Claude vision (or GPT-4 vision) — auto-tag on upload
3. Pairing endpoint: POST `/photos/pair` (before-id, after-id)
4. Marketing publish: POST `/photos/:id/publish` makes it public-gallery-eligible
5. Foreman tools: `find_photos`, `pair_before_after`, `auto_tag`

MOBILE (frontend/):
1. Photo gallery screen with filter (room, phase, tag)
2. Photo detail: edit tags, pair, publish
3. Before/after viewer (swipe to reveal)
4. Capture flow: auto-tag on upload + suggest existing pairing
5. Share: one-tap to portal / social / email
6. i18n
7. Foreman: "Foreman, show me all kitchen photos from the Smith project" → returns gallery

DONE WHEN:
- Auto-tagging is reasonably accurate (>70% useful)
- Before/after works smoothly
- Sharing is one-tap
- Search by tag works
```

---

## Task 31: Daily report voice generator

```
Add voice-to-structured daily report.

GOAL:
- Worker on jobsite says: "Today we framed the back wall, took 4 photos, drywall delivery delayed til tomorrow, three guys here, no incidents"
- Foreman generates structured daily report with all fields filled
- Worker reviews + submits

BACKEND:
1. Extend daily report service to accept a free-text description
2. Foreman tool: `generate_daily_report(audio_or_text, project_id)` — returns structured fields
3. Auto-pull weather, manpower (from time clock), photos taken today
4. Foreman uses good prompt to extract fields from natural language

MOBILE (frontend/):
1. Worker app: "Voice report" button → record → review screen with all fields pre-filled → submit
2. Owner can voice-generate too
3. i18n in 3 languages, voice STT in 3 languages
4. Foreman edits inline if owner says "actually it was 4 guys not 3"

DONE WHEN:
- Voice → structured report in <10 seconds
- All fields auto-populated where possible
- Worker can correct before submit
- Works in EN/ES/PT
```

---

## Task 32: Field forms / inspections engine

```
Build the custom forms engine.

GOAL:
- Owner builds custom forms (OSHA toolbox talk, QA checklist, pre-task plan, COVID screening)
- Workers fill on phone with conditional logic
- Required signatures + photo attachments
- Templates so owners don't start from scratch

BACKEND:
1. Migration:
   - `form_definitions` — id, company_id, name, description, schema_json (json-schema-style), category
   - `form_submissions` — id, form_id, project_id, user_id, data_json, signed_at, submitted_at
2. Service: form validator
3. Routes for CRUD on definitions + submissions
4. Pre-built templates: OSHA daily toolbox, safety pre-task, QA closeout, COVID
5. Foreman tools: `submit_form`, `form_compliance_status`

MOBILE (frontend/):
1. Form builder screen for owner: drag-drop fields, conditional logic
2. Form filler for workers: dynamic renderer, photo capture, signature
3. Submission history per project
4. i18n
5. Foreman: "Foreman, did everyone sign the safety pre-task today?" → compliance status

DONE WHEN:
- Owner builds a 10-question form in 5 minutes
- Worker fills it on phone with photos + signature
- Compliance reporting works
```

---

## Task 33: Equipment / tool tracking

```
Add equipment tracking.

GOAL:
- Asset registry per company (tools, vehicles, equipment)
- Check out to project or worker
- QR code on asset → scan to check out
- Maintenance log + warranty + value

BACKEND:
1. Migration: `equipment`, `equipment_checkouts`, `equipment_maintenance`
2. QR code generation per asset
3. Foreman tools: `check_out_equipment`, `equipment_status`

MOBILE (frontend/):
1. Equipment list screen
2. Equipment detail with QR code
3. Scan flow (use existing camera)
4. Maintenance log
5. i18n

DONE WHEN:
- Scan QR → check out → see at-a-glance who has what
- Maintenance reminders fire
```

---

## Task 34: Customer equipment tracking (HVAC focus)

```
Track customer-owned equipment (HVAC units, water heaters, etc.).

GOAL:
- Per-address equipment registry: model, serial, install date, warranty
- Service history per unit
- Renewal/replacement reminders

BACKEND:
1. Migration: `customer_equipment` — customer_id, location_id, type, model, serial, installed_at, warranty_expires_at, install_user_id
2. Link service visits to equipment serviced
3. Foreman tools: `find_customer_equipment`, `expiring_warranties`

MOBILE (frontend/):
1. Customer detail → Equipment tab
2. Add equipment with photo + scan-serial OCR
3. Per-equipment service history
4. Reminders
5. i18n

DONE WHEN:
- Tech on-site knows what equipment is there before arriving
- Warranty reminders fire 30 days before expiration
```

---

## Task 35: Pricebook / flat-rate library

```
Build the flat-rate pricebook.

GOAL:
- Trade-specific flat-rate library (HVAC, plumbing, electrical)
- Smart upsell suggestions
- Regional benchmarks (anonymized aggregate)

BACKEND:
1. Migration: `pricebook_services` per trade with description, flat_rate, time_estimate
2. Seed common services per trade (use ServiceTitan/FieldEdge as reference for which to include)
3. Upsell rules: "if customer requests A, suggest B"
4. Aggregated pricing (median across Sylk users in same zip-cluster — anonymous)
5. Foreman tools: `pricebook_lookup`, `upsell_suggestions`

MOBILE (frontend/):
1. Pricebook list per trade
2. On invoice/estimate: "Add from pricebook" with smart upsell
3. Owner can override prices per service
4. i18n

DONE WHEN:
- Tech on-site can quote a flat-rate fix in 10 seconds
- Upsells are relevant (not pushy)
```

---

## Task 36: Offline mobile mode

```
Add full offline support to the worker app.

GOAL:
- Worker can clock in/out, take photos, fill daily reports, submit forms — all offline
- Queue actions until online
- Sync when back online with conflict resolution

BACKEND:
1. Idempotency keys on all mutating endpoints
2. Bulk-sync endpoint for queued actions

MOBILE (frontend/):
1. Service `frontend/src/services/offlineQueue.ts`:
   - SQLite (Expo SQLite) for local storage
   - Queue all writes; mark synced/failed
   - Background sync when online
2. UI banner when offline + pending count
3. All worker flows use the queue (don't bypass)
4. i18n
5. Conflict resolution: server wins by default; show user when their queued action was rejected

DONE WHEN:
- Drop airplane mode for an hour, do everything
- Reconnect, everything syncs cleanly
- Performance is fast even offline
```

---

## Task 37: Time approval workflow

```
Add time approval before payroll.

GOAL:
- Crew leads see pending time entries from their crew
- Edit or approve each entry
- Edit reasons required (logged in audit)
- Once approved, entry locked from worker editing

BACKEND:
1. Add `time_entries.approval_status` (pending/approved/rejected), `approved_by`, `approved_at`, `edit_reason`
2. Routes: POST `/time-entries/:id/approve`, `/reject`, PATCH for edits with reason
3. Crew leads see only their crew's entries
4. Foreman tools: `pending_approvals`, `approve_time`, `time_dispute`

MOBILE (frontend/):
1. New screen `frontend/src/screens/supervisor/TimeApprovalScreen.tsx` — list of pending entries
2. Tap entry → edit (with reason) / approve / reject
3. Worker sees status of their entries
4. i18n
5. Foreman: "Foreman, approve all of yesterday's time entries that look normal" → bulk approve with anomaly detection

DONE WHEN:
- Crew lead can clear yesterday's entries in 60 seconds
- Edits captured with reasons in audit log
- Approved entries lock for worker
```

---

## Task 38: Foreman scheduled background work

```
Let owners configure recurring Foreman tasks.

GOAL:
- "Every morning at 7am, send me a summary of overdue invoices"
- "Every Friday at 5pm, prepare a payroll preview"
- "Every Monday, review last week's job costing variance"
- Configurable in plain English

BACKEND:
1. Migration: `agent_schedules` — id, company_id, prompt, cron, enabled, last_run_at, next_run_at, channel (push/email/in-app)
2. Service: scheduler that fires Foreman with the prompt + sends result via channel
3. Owner can configure via natural language: "Foreman, every morning at 7am give me overdue invoices" → creates schedule
4. Foreman tools: `create_schedule`, `list_schedules`, `pause_schedule`

MOBILE (frontend/):
1. Settings screen: list of agent schedules with enable/disable
2. Tap to edit prompt + time
3. View recent runs + outputs
4. i18n

DONE WHEN:
- I can say "Foreman, brief me every weekday at 6am on yesterday's progress" — and that happens
- Schedule history shows past outputs
- I can pause/resume
```

---

## Task 39: Foreman proactive alerts

```
Make Foreman watch for patterns and alert owner.

GOAL:
- Foreman flags: cash flow risks, overdue invoices, budget overruns, scheduling conflicts, customer no-replies
- Pushes only when something matters (not noise)
- Owner can configure alert rules

BACKEND:
1. Service `backend/src/services/agentInsights.js`:
   - Runs every hour
   - Checks rules + applies LLM reasoning to surface anomalies
   - Pushes to owner with priority + suggested action
2. Migration: `insights` — id, company_id, type, priority, message, suggested_action, dismissed_at, acted_on_at
3. Foreman tools: `recent_insights`, `dismiss_insight`, `act_on_insight`

MOBILE (frontend/):
1. Insights inbox screen (separate from notifications)
2. Each insight: priority chip + suggested action button
3. Push for high-priority only
4. Configurable: which categories to monitor
5. i18n
6. Foreman: when owner opens app, top insight surfaces in chat: "Hey, you have 3 invoices about to hit 30 days overdue — want me to send reminders?"

DONE WHEN:
- Insights are actually useful (not noise)
- Tapping an insight + acting takes one tap
- Snooze/dismiss works
```

---

## Task 40: Voice-driven worker workflows

```
Make the worker app fully voice-operable.

GOAL:
- Worker says: "Foreman, log 2 hours on Smith kitchen, drywall is done"
- Foreman: clocks time, marks task done, updates daily report
- All major worker actions doable hands-free

BACKEND:
- Use existing Foreman + tools, just expand what worker role can do via voice

MOBILE (frontend/):
1. Worker home screen: large mic button (push-to-talk or always-listening with wake word "Foreman")
2. Voice flows: log time, mark task, take photo (with voice description), submit daily report, clock in/out
3. Confirmation feedback (haptic + voice TTS)
4. Works in all 3 languages
5. Background process when phone in pocket

DONE WHEN:
- Whole shift can be logged via voice on the jobsite
- Workers actually use it (test with one)
- Accuracy is high in EN/ES/PT
```

---

## Task 41: Foreman knowledge graph + RAG

```
Build a per-company knowledge graph.

GOAL:
- Semantic index of all customers, projects, vendors, materials, equipment, history
- RAG retrieval for complex queries: "find all projects where we used Sherwin-Williams paint and went over budget on materials"
- Foreman can answer cross-cutting questions instantly

BACKEND:
1. Service `backend/src/services/knowledgeGraph.js`:
   - Embeddings of: customer notes, daily reports, project descriptions, estimates, invoices, communications
   - Use OpenAI text-embedding-3-small or similar
   - Store in Supabase pgvector
   - Re-index incrementally on changes
2. New retrieval tool for Foreman: `semantic_search(query, scope)`
3. Add to existing Foreman intent routing

MOBILE (frontend/):
1. Foreman search screen: natural language → ranked results
2. Result cards: type icon, title, snippet, "open" button
3. i18n
4. Hook into existing chat — make it the new default search

DONE WHEN:
- "Find projects where we used green roofing materials" returns the right ones
- Indexing keeps up with new entities
- Cost-controlled (don't re-embed unchanged content)
```

---

## Task 42: MCP server

```
Expose Sylk's tools as an MCP server.

GOAL:
- Power users connect Claude.ai to Sylk via MCP
- Same headline as JobTread, neutralizes their pitch
- Eats your AI cost for power users

BACKEND:
1. New MCP server at `backend/src/mcp/server.js`:
   - Wraps existing 82 Foreman tools
   - Per-company auth via API key
   - Streams responses via stdio + HTTP transports
2. Documentation: `docs/mcp.md` with installation instructions for Claude Desktop
3. Hosted endpoint for HTTP MCP (Streamable HTTP)
4. Foreman tool: `mcp_status` — show connected MCP clients per owner

MOBILE (frontend/):
1. Settings screen: "Connect Claude" with copy-paste config + activation toggle
2. Show connected sessions
3. Marketing: page on Sylk site
4. i18n

DONE WHEN:
- I configure Claude Desktop with my Sylk API key + MCP URL
- Claude can read/write Sylk via natural language
- Config copy-paste is one step
- Owner sees connected sessions
```

---

## Task 43: BYO Claude API key tier

```
Let owners use their own Anthropic API key.

GOAL:
- Owner enters their Anthropic key in settings
- Foreman uses their key instead of Sylk's
- Premium tier with unlimited usage at flat price (since cost goes to owner)
- Encrypted at rest

BACKEND:
1. Migration: `companies.anthropic_api_key` (encrypted)
2. AI client routes to per-company key when set, else Sylk default
3. Validate key on save
4. Cost tracking off when BYO

MOBILE (frontend/):
1. Settings: "Bring your own API key" with paste field + validation + visible/hidden toggle
2. Show "using your Claude" indicator on Foreman screen
3. Pricing tier: "Pro Unlimited — $99/mo, you bring your Claude key"
4. i18n

DONE WHEN:
- Owner pastes key, Foreman uses it (verify in usage console)
- Removing key falls back to Sylk's
- Validation prevents bad keys
```

---

## Task 44: Email marketing campaigns

```
Build email campaigns.

GOAL:
- Audience segmentation
- Template library (seasonal, promo, win-back)
- Schedule + send via Resend
- Open/click tracking

BACKEND:
1. Migration: `campaigns`, `campaign_segments`, `campaign_sends`
2. Audience builder: "all customers who haven't booked in 90 days"
3. Send via Resend with tracking
4. Foreman tools: `create_campaign`, `campaign_results`

MOBILE (frontend/):
1. Campaign list, builder, audience picker, template picker, results screen
2. i18n
3. Foreman: "Foreman, send a 20% off Spring HVAC tune-up to inactive customers" → builds + sends

DONE WHEN:
- Real campaign sends to a segment
- Open/click metrics show
- Foreman authors campaigns
```

---

## Task 45: Granular permissions / roles matrix

```
Add granular role permissions.

GOAL:
- Beyond owner/supervisor/worker: office_manager, bookkeeper, sales_rep, dispatcher
- Per-resource permissions matrix

BACKEND:
1. Migration: `roles`, `role_permissions`
2. Middleware: replace simple role checks with permission lookup
3. Default roles seeded
4. Owner can create custom roles
5. Foreman tools: `assign_role`, `permissions_audit`

MOBILE (frontend/):
1. User management screen: assign roles to users
2. Role builder: per-resource read/write/delete
3. Audit: "who can see financials?"
4. i18n

DONE WHEN:
- Bookkeeper sees financials, no crew data
- Sales rep sees leads + estimates, no financials
- Custom roles work
```

---

## Task 46: Multi-location support

```
Add multi-location to a single owner account.

GOAL:
- Owner manages multiple locations (franchises) under one login
- Per-location branding, billing, team
- Cross-location reporting

BACKEND:
1. Migration: `locations` table; add `location_id` to most entities
2. Multi-location selector in API requests
3. Cross-location aggregations
4. Foreman tools: `switch_location`, `cross_location_report`

MOBILE (frontend/):
1. Location switcher in nav
2. All screens scope to current location
3. Cross-location dashboard for executive owners
4. i18n

DONE WHEN:
- I can run two locations from one account cleanly
- Reports roll up correctly
- Foreman knows which location I'm asking about
```

---

## Task 47: Migration / CSV import wizard

```
Build the import wizard.

GOAL:
- Owner uploads CSV from Buildertrend / JobTread / Jobber / QuickBooks export
- Sylk maps fields (with smart suggestions) and imports
- Foreman can do it via voice: "import my customers from this file"

BACKEND:
1. Service `backend/src/services/migrationService.js`:
   - CSV parser
   - Field-mapping engine (suggests via column-name heuristics)
   - Per-source presets (Buildertrend, JobTread, etc.)
   - Dry-run before commit
2. Routes for upload + preview + commit
3. Foreman tool: `import_csv`

MOBILE (frontend/):
1. Settings → Import
2. Pick source (or generic CSV) → upload → review mappings → preview rows → commit
3. Progress + error report
4. i18n
5. Foreman: "import this file" → walks through

DONE WHEN:
- 1000 customers from a Buildertrend CSV imports in < 30 sec
- Mappings preserved across imports
- Errors flagged clearly
```

---

## After all 47

Once you've shipped 1-47, you'll have:
- Full demo parity with Buildertrend, JobTread, ServiceTitan
- AI superiority over all of them
- Hybrid (project + route + recurring) native — uniquely positioned
- Half their price ($249-399/mo target)
- Three languages including Portuguese (no one else)

That's the platform. After that, the work shifts to growth, not features.

Re-evaluate at task 25 — by then you'll have real customer signal to decide whether selections / financing / dispatch deserves more depth or whether to start a new vertical (roofing-specific, pest-specific) push.

Now go ship Task 1.

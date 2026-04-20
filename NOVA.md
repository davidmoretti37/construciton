# NOVA.md — Strategy Validation

## Goal Assessment

**Goal:** Determine if Sylk is ready for a v1 launch to real contractors.

**Clarity: 9/10.** This is a concrete, answerable question. The codebase exists, the features are built, and the analysis below is based on actual files — not roadmap slides.

**Verdict: NO — not today. YES — within 1-2 weeks of focused fixes.**

The product is 90% there. What's missing isn't features — it's safety, hardening, and one dead switch that prevents all revenue. The feature set already exceeds most competitors at this price tier. The blockers are operational, not structural.

---

## Feature Inventory: What Exists Today

### Mobile App — 126 screens across 5 roles

**Owner (31 screens):**
- Dashboard with 17 draggable widgets (P&L, cash flow, AR aging, payroll, margins, pipeline, overdue invoices) — `OwnerDashboardScreen.js`
- Project CRUD with phases, budgets, worker assignments — `OwnerProjectsScreen.js`, `ManualProjectCreateScreen.js`
- Full financial suite: bank reconciliation (`BankReconciliationScreen.js`), bank connection (`BankConnectionScreen.js`), transaction assignment (`BankTransactionAssignScreen.js`), payroll summary (`PayrollSummaryScreen.js`), AR aging (`ARAgingScreen.js`), tax summary (`TaxSummaryScreen.js`), recurring expenses (`RecurringExpenseScreen.js`), overhead tracking (`CompanyOverheadScreen.js`)
- Worker/supervisor management with clock-out tracking — `OwnerWorkersScreen.js`, `SupervisorsScreen.js`, `ClockOutsScreen.js`
- Client management with portal visibility controls — `ClientsScreen.js`, `ClientVisibilityScreen.js`
- Service plans and daily route building — `ServicePlansScreen.js`, `DailyRouteScreen.js`, `RouteBuilderScreen.js`
- Google Drive integration — `GoogleDriveScreen.js`
- Billing/subscription management — `BillingScreen.js`

**Worker (15 screens):**
- Today's assignments with optimistic task updates — `TodaysWorkScreen.js`
- Visit detail with checklists, photos, notes — `VisitDetailScreen.js`
- Time clock (in/out per project) — `TimeClockScreen.js`
- Daily report submission — `DailyReportFormScreen.js`
- Expense logging — `ExpenseFormScreen.js`
- Daily route with map — `WorkerDailyRouteScreen.js`
- Schedule view — `WorkerScheduleScreen.js`

**Client (14 screens):**
- Portal dashboard — `ClientDashboardScreen.js`
- Project timeline with phases — `ClientTimelineScreen.js`
- Invoice viewing/payment — `ClientInvoicesScreen.js`
- Photo gallery — `ClientPhotosScreen.js`
- Two-way messaging — `ClientMessagesScreen.js`
- Material selections and change orders — `ClientSelectionsScreen.js`, `ClientChangeOrderDetailScreen.js`
- AI-generated weekly summaries — `ClientAISummariesScreen.js`
- Document access — `ClientDocumentsScreen.js`

**Supervisor (3 screens):** Onboarding flow only — limited standalone features.

**Shared:** AI chat with 61 tools (`ChatScreen.js`), project detail, notifications, estimates, invoices.

### Backend — 151+ endpoints, 12 route files, 12 services

| Domain | Key Capabilities | Files |
|--------|-----------------|-------|
| **AI Agent** | 61 tools, streaming SSE, background jobs, model routing (Haiku/Sonnet), parallel tool execution, 8-round loop | `agentService.js`, `toolRouter.js`, `modelRouter.js`, `handlers.js` |
| **Payments** | Stripe checkout, subscriptions, Connect payouts, webhook handling, guest checkout | `stripe.js` |
| **Banking** | Plaid + Teller dual integration, auto-reconciliation, CSV import, transaction matching | `plaid.js`, `teller.js`, `reconciliationService.js` |
| **Client Portal** | Magic link auth, 31 endpoints, session cookies, project access control | `portal.js`, `portalOwner.js`, `portalAuth.js` |
| **Services** | Plan CRUD, visit generation, route optimization, checklists | `servicePlans.js`, `serviceVisits.js`, `serviceRoutes.js`, `visitGenerator.js` |
| **Integrations** | Google Drive OAuth, Google Maps geocoding, Groq/Deepgram transcription, Resend email, Expo push | `googleDrive.js`, `geocoding.js`, `transcription.js`, `emailService.js`, `pushNotificationService.js` |

### Website Portal — Next.js, ~20 pages

**Landing site:** Hero with 3D phone mockup, industry showcase, pricing tiers, testimonials, social proof, CTA — all in `website/src/app/page.tsx` + `components/landing/`.

**Client portal (7 pages):**
- Dashboard with projects, invoices, estimates, service plans — `/portal/page.tsx`
- Project detail with phases, milestones, photo timeline, messaging, materials, change orders, approval history, weekly AI summaries — `/portal/projects/[id]/page.tsx`
- Material selection workflow — `/portal/projects/[id]/materials/page.tsx`
- Client request submission (questions, issues, warranty claims) — `/portal/projects/[id]/requests/page.tsx`
- Invoice list with Stripe payment — `/portal/invoices/page.tsx`
- Service plan details — `/portal/services/[id]/page.tsx`

**Contractor web app (6 pages, partially built):**
- Dashboard with financials — `/app/page.tsx`
- Project list with filters — `/app/work/page.tsx`
- Project + service plan detail — `/app/work/projects/[id]/page.tsx`, `/app/work/services/[id]/page.tsx`
- Client list — `/app/clients/page.tsx`
- Chat, Workers, Settings — placeholder pages (Phase 3-5)

### Database — 78 tables, 123 migrations, full RLS

Comprehensive schema covering: projects, phases, tasks, workers, time tracking, estimates, invoices, transactions, bank accounts, service plans, visits, routes, checklists, client portal, change orders, material selections, AI jobs, push notifications, subscriptions, and audit trails.

---

## MVP Gap Analysis: What's Missing

### Critical Gaps (a contractor expects these on day one)

**1. TESTING_MODE = true — Zero Revenue**
`SubscriptionContext.js:17` bypasses ALL paywalls. Every user gets unlimited free access. This is the single biggest blocker. Flip it to `false` and add a CI guard.

**2. No payment audit trail**
Invoice `amount_paid` updates inline with no immutable log. No record of who paid when. Required for disputes, chargebacks, and tax compliance. Need a `payment_events` table.

**3. Stripe webhook idempotency missing**
No deduplication of webhook events. ~1% of payments will double-process. Need a `stripe_webhook_events(event_id PK)` table.

**4. Trial-ending notification is dead code**
`stripe.js:441-448` — handler just logs. Users won't know their trial is converting to paid. This generates chargebacks and angry support tickets. Push notification infrastructure exists; wire it up.

**5. Hardcoded Stripe test key in source**
`App.js:330` — a `pk_test_` key committed as fallback. Remove it, fail loudly if env var missing.

### Important Gaps (should be fixed before real users, but not blockers)

**6. No online booking/quote request form**
Every competitor (Jobber, HCP) has a way for homeowners to request a quote. A simple embeddable form that creates a lead would close a major acquisition gap. **Defer to v1.1** — not blocking for launch if you're acquiring users through direct outreach.

**7. Magic link tokens never expire**
`project_clients.access_token` has no `expires_at`. Forwarded emails grant permanent access. Add 7-day TTL.

**8. No role-based middleware on backend**
Any authenticated user (worker) can hit owner-only endpoints. RLS catches most of this, but defense-in-depth matters. Add `requireRole()` middleware.

**9. 483 console.log statements leaking data**
Financial amounts, session tokens, Stripe IDs visible in device logs. Replace with existing logger utilities, gate behind `__DEV__`.

**10. CORS allows all origins if env var missing**
`server.js:63` — `origin: true` when `PORTAL_URL` unset. Hard-fail in production.

**11. Floating-point money math**
`parseFloat()` on dollar amounts causes penny drift. Store and compute in integer cents.

### Not Missing (features that are adequate for v1)

- **Invoicing** — Full CRUD, email delivery, Stripe payment, partial payments, estimate-to-invoice conversion. ✅
- **Estimates** — Creation, client approval, conversion to invoice. ✅
- **Scheduling** — Worker schedules, daily routes, service visit generation. ✅
- **Client management** — Client list, portal invites, visibility controls. ✅
- **Payments** — Stripe checkout, Connect payouts, bank reconciliation. ✅
- **Time tracking** — Clock in/out, project-level, forgotten clockout alerts. ✅
- **Daily reports** — Worker submission, owner review. ✅
- **Photos** — Project photo management, client portal sharing. ✅
- **AI assistant** — 61 tools, voice input, streaming, background jobs. ✅
- **Multi-language** — English, Spanish, Portuguese. ✅
- **Onboarding** — 17 screens, AI service discovery, pricing setup, invoice setup. ✅

---

## Scope Assessment

**This is not a scope problem — it's a hardening problem.** The feature surface is genuinely impressive: 126 screens, 151+ endpoints, 61 AI tools, 78 database tables, 10 external integrations. The build is complete. What's incomplete is the safety layer around financial operations.

The fixes are bounded: MARCO.md's Tier 1 ship blockers are estimated at ~3 days of focused work. LEO.md's top 5 must-fixes are estimated at under 1 day. There is significant overlap between them.

---

## Prerequisites

Before launch, in priority order:

| # | Fix | Effort | Source |
|---|-----|--------|--------|
| 1 | Set `TESTING_MODE = false` + CI guard | 5 min | MARCO #1 |
| 2 | Remove hardcoded Stripe key from `App.js` | 5 min | LEO #1 |
| 3 | Add `payment_events` audit table | 1 day | MARCO #4 |
| 4 | Add Stripe webhook idempotency table | 1 day | MARCO #2 |
| 5 | Implement trial-ending push notification | 30 min | LEO #3 |
| 6 | Fix per-request Stripe instantiation in `portal.js:793` | 5 min | LEO #4 |
| 7 | Lock CORS — hard-fail if `PORTAL_URL` unset in production | 30 min | MARCO #6 |
| 8 | Remove localStorage portal token fallback | 30 min | MARCO #5 |
| 9 | Atomic payment updates (RPC instead of read-then-write) | 4 hours | MARCO #3 |
| 10 | Replace console.log with logger utilities | 2-4 hours | LEO #2 |

**Total: ~4 days of focused work.** Items 1-2 are 10-minute fixes. Items 3-4 are the bulk. Everything else is under an hour each.

---

## Success Criteria

**"Done" means:**

1. `TESTING_MODE = false` — subscriptions enforce limits, paywalls activate
2. A contractor can: sign up → create project → send estimate → convert to invoice → get paid via Stripe → see payment in dashboard — with no data loss or double-processing
3. A homeowner can: receive magic link → view project progress → approve estimate → pay invoice → message contractor — through the portal
4. All financial mutations are logged in `payment_events`
5. No Stripe keys, tokens, or financial data visible in device logs
6. Webhook events are idempotent (replay-safe)
7. Users receive trial-ending notification before conversion

**Verification:**
- End-to-end test of the payment flow (estimate → invoice → Stripe checkout → webhook → dashboard update)
- Verify `payment_events` table records every payment
- Replay a Stripe webhook and confirm no duplicate processing
- Check device logs contain no sensitive data
- Confirm trial-ending push notification fires 3 days before conversion

---

## Strategic Recommendations

### 1. Launch to 5-10 beta contractors, not the public

After the fixes above, do a closed beta. Find 5-10 contractors through Facebook groups or personal network. Give them 60 days free. Watch them use it. The product is feature-rich enough that the risk isn't "not enough features" — it's "too many features, unclear where to start." Beta users will tell you which features they actually use and which they ignore.

### 2. The client portal IS the launch strategy

Every project a beta contractor creates generates a client portal. Every homeowner who sees it is a warm lead for another contractor. Add a subtle "Powered by Sylk" footer with a CTA link. This is how Calendly and DocuSign grew — the product markets itself through usage. Prioritize portal polish over new features.

### 3. Defer to v2

These are real features but not launch blockers:
- **Online booking/quote request form** — important for lead gen, not for servicing existing clients
- **Contractor web app completion** (chat, workers, settings pages are placeholders) — mobile app is the primary interface; web can grow later
- **Gantt charts / advanced scheduling** — competitors have this, but contractors under $2M rarely use it
- **QuickBooks integration** — eventual necessity, not day-one requirement
- **Bid management** — GC-specific, not the beachhead market
- **Marketing automation** — requires an established user base first

### 4. Pick one buyer persona for launch

The product serves both project-based contractors (remodelers, GCs) and recurring service businesses (HVAC maintenance, cleaning). **Launch with project-based contractors.** The client portal + estimates + invoicing + AI combo is most differentiated for this segment. Service plans/visits/routes are strong but serve a different buyer with different expectations. Serve one well before serving two adequately.

### 5. Price at $49 / $99 / $199

Current pricing ($49/$79/$149) undersells the Pro tier. The client portal alone justifies $99. Gate Pro on the portal — it's the feature contractors will upgrade for. See the existing NOVA.md pricing section for the full rationale.

---

## Final Verdict

**NO — not ready today.** The `TESTING_MODE = true` flag means zero revenue. The missing payment audit trail means legal exposure. The webhook idempotency gap means ~1% of payments double-process. The hardcoded Stripe key is a security liability.

**YES — ready in ~1-2 weeks.** The fixes are concrete, bounded, and well-documented across LEO.md and MARCO.md. None require architectural changes. The feature set is complete for a v1. The client portal is best-in-class at this price. The AI assistant is a genuine differentiator no competitor has.

**What exists today is not a prototype — it's a product that needs a safety inspection before the doors open.**

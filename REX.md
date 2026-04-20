# REX.md — Technical Risk Assessment

> **Assessed**: 2026-04-14 (updated) | **Branch**: main | **Scope**: Exhaustive file-by-file audit of backend routes, middleware, services, and AI tool handlers  
> **Context**: Node.js/Express + Supabase + Stripe Connect + Teller + OpenRouter AI. Handles real money.  
> **Previously fixed** (excluded): per-request Stripe init, CORS hardening, console.log cleanup, floating-point money math  
> **Prior REX.md** findings verified and merged where still applicable.  
> **Update**: Added C9 (reflected XSS), C10 (session token leak), M13-M15, and additional low risks from second-pass audit.

---

## Critical Risks (must address before launch)

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| C1 | **Portal invoice IDOR — invoices without `project_id` skip all access checks.** `portal.js:786` checks `if (invoice.project_id)` before verifying client access. Invoices not linked to a project (standalone invoices) have **zero authorization** — any authenticated portal client can initiate a Stripe checkout for any unlinked invoice. Same pattern at `portal.js:876` (`create-payment-intent`). | Any portal client can trigger real Stripe payments on other contractors' invoices. Financial fraud. | **HIGH** — standalone invoices are common in construction billing | Remove the `if (invoice.project_id)` conditional. Always verify ownership, e.g., join through the invoice's `user_id` → `project_clients.owner_id` → `client_id`, or add a `client_id` FK on invoices. |
| C2 | **`update_estimate` writes to ANY project without ownership check.** `handlers.js:762-765`: when linking an estimate to a project, the auto-update calls `.update({ contract_amount }).eq('id', project_id)` with **no `.eq('user_id', userId)`**. The estimate update itself (line 747-751) correctly filters by `user_id`, but the cascading project update does not. | Attacker can overwrite any project's `contract_amount` by passing a target `project_id`. | **MEDIUM** — requires guessing a UUID, but UUIDs leak in API responses | Add `.eq('user_id', userId)` to the project update at `handlers.js:764`. |
| C3 | **All AI tool resolvers skip ownership on UUID input.** `resolveProjectId` (`handlers.js:175-183`), `resolveEstimateId`, `resolveInvoiceId`, etc. — when given a UUID-format string, they query by `id` only without a `user_id` filter, then return immediately. Combined with the service-role Supabase client (bypasses RLS), this enables IDOR on `delete_project`, `record_expense`, `convert_estimate_to_invoice`, `void_invoice`, and every other tool that uses a resolver. | Any authenticated user can read/modify/delete another user's data via AI chat. | **MEDIUM** — needs a valid UUID from another user | Every resolver must add `.eq('user_id', userId)` (or the equivalent via `resolveOwnerId`) even for UUID lookups. |
| C4 | **`convert_estimate_to_invoice` — no idempotency, no status guard.** `handlers.js:2753-2804`: no check that `estimate.status === 'pending'` before converting. Insert happens (line 2774) before the status update (line 2801). Two rapid requests produce two invoices from one estimate. | Duplicate invoices for the same work. Revenue doubled in financial reports. | **MEDIUM** — double-tap on mobile, retry on network timeout | Check `estimate.status === 'pending'` before insert. Add `UNIQUE` constraint on `invoices.estimate_id`. |
| C5 | **Teller bank access tokens stored in plaintext.** `teller.js:735` (Safari callback) and `teller.js:856` (authenticated save) insert `teller_access_token` directly into `connected_bank_accounts`. | A single DB exposure (backup leak, Supabase dashboard compromise, any SQL injection) gives full bank API access for every connected user. | **HIGH** — bank tokens are the most sensitive data in the system | Encrypt at rest with `pgcrypto` (`pgp_sym_encrypt`) using a key from env vars. Decrypt only when making Teller API calls. |
| C6 | **No payload size validation on transcription.** `transcription.js:43`: `Buffer.from(audio, 'base64')` is called with no size check. Express body limit is 10MB (`server.js:95`). Each request allocates ~7.5MB decoded buffer + the 10MB base64 string simultaneously. Repeated requests = OOM. | Trivial DoS — send 10MB payloads in a loop. Server crashes. | **HIGH** — no rate limiting on this beyond 60/min global | Add `if (audio.length > 5_000_000) return res.status(413)` before decoding. 5MB base64 ≈ 3.7MB audio ≈ 10 min recording. |
| C7 | **Reconciliation race condition — two non-atomic writes per match.** `reconciliationService.js:99-113`: `bank_transactions` is updated first, then `project_transactions` in a separate call. Crash between writes = inconsistent financial state with no recovery. | Financial data corruption. Bank shows matched, project doesn't. Or vice versa. No self-healing. | **MEDIUM** — any deploy, OOM, or network blip during reconciliation | Create a Supabase RPC that updates both tables in a single PostgreSQL transaction. |
| C8 | **Stripe webhook — missing idempotency table can silently continue.** `stripe.js:275-282`: if the `stripe_webhook_events` table doesn't exist or the idempotency check fails for non-duplicate reasons, the webhook logs a warning and **continues processing**. This means DB issues cause every webhook to be treated as new. | Duplicate subscription grants, duplicate payment recording during DB outages. | **MEDIUM** — DB issues are transient but Stripe retries guarantee re-delivery | Fail closed: if idempotency check errors (non-23505), return 500 so Stripe retries later when DB is healthy. |

---

## Moderate Risks (address during build)

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| M1 | **`/ready` endpoint exposes infrastructure internals without auth.** `server.js:176-290`: returns Supabase connectivity, OpenRouter API status, Stripe key validity, tool definition counts, and missing handler names. | Attacker maps all integrations, detects outages in real-time, enumerates AI tool surface area. | **MEDIUM** | Strip tool names, handler lists, and error messages. Return only pass/fail per dependency. Or add auth. |
| M2 | **Rate limiter JWT parsing without signature verification.** `rateLimiter.js:39-40`: `aiLimiter` decodes JWT payload via raw Base64 without verifying the signature, then uses `sub` as rate-limit key. An attacker can forge a JWT with `sub: "victim-id"` to exhaust another user's rate limit. Same pattern in `portalLimiter` at line 110. | Targeted DoS — lock a specific user out of AI features for 60 seconds at a time. | **MEDIUM** | Fall back to IP-based limiting, or cache the result of `getUser()` from the auth middleware. |
| M3 | **Supervisor role escalation via `resolveOwnerId`.** `handlers.js:41-48`: 15+ tool handlers call `resolveOwnerId(userId)` which returns the **owner's** ID for supervisors. Supervisors operate with the full owner data scope. No audit trail of which supervisor performed a mutation. | Supervisor can modify all owner financials, projects, invoices. Owner can't distinguish supervisor actions from their own. | **MEDIUM** | Add `acted_by` field to all mutations. Build a supervisor permission matrix (read-only on financials, write on assigned projects only). |
| M4 | **`connectSessions` Map — unbounded in-memory store.** `teller.js:565,792`: each `/connect-session` call adds to a `Map()`. Sessions expire after 10 min (line 798), but an authenticated attacker can create thousands in that window. | Memory exhaustion on the server. | **LOW** — requires auth, TTL limits damage | Add per-user limit (max 3 active sessions). Or use DB-backed sessions. |
| M5 | **Time entry `table` param not whitelisted.** `server.js:1064`: only checks `table === 'supervisor'`, any other value defaults to `'time_tracking'`. The `ownerField` is derived from `table` and interpolated into `.select()`. Safe today because only two values produce valid columns, but fragile. | Currently no exploit. Future code changes could introduce injection. | **LOW** | Whitelist: `if (!['worker', 'supervisor'].includes(table)) return res.status(400)` |
| M6 | **Reconciliation errors silently swallowed.** `reconciliationService.js:99-204`: all `supabase.update()` calls don't check `.error`. Failed writes still increment the match counter. | User sees "5 auto-matched" but only 3 actually persisted. Financial records silently incomplete. | **MEDIUM** | Check every `.error` return value. Accumulate failures and include in the notification. |
| M7 | **Visit generator duplicate race condition.** `visitGenerator.js:86-158`: fetches existing dates, builds visits in memory, then bulk-inserts. A concurrent call (cron + manual trigger simultaneously) can insert duplicates between fetch and insert, failing the entire batch. | Visits not generated for some plans. Service gaps for clients. | **MEDIUM** | Use `.upsert()` with `ignoreDuplicates: true`, or add `UNIQUE(service_plan_id, scheduled_date, service_location_id)` + `ON CONFLICT DO NOTHING`. |
| M8 | **Portal `/auth/verify` has no rate limiting.** `portal.js:27`: magic link verification endpoint uses no rate limiter. UUID entropy makes brute-force infeasible, but allows unlimited probing. | Token enumeration attempts, resource consumption. | **LOW** | Apply `portalLimiter` or stricter (5/min/IP). |
| M9 | **HTML injection in email templates.** `emailService.js:56,127`: `businessName` interpolated directly into HTML. Most email clients strip scripts, but malicious HTML/CSS (phishing overlays, invisible links) can render. | Phishing emails sent through the platform if a business name is compromised. | **LOW** | HTML-escape all interpolated values. |
| M10 | **Guest checkout — no dedicated rate limit.** `stripe.js:85`: unauthenticated, protected only by global `servicesLimiter` (60/min). | Stripe checkout session spam. Minor API cost risk. | **LOW** | Add IP-based limit: 5 guest checkouts per IP per hour. |
| M11 | **No graceful shutdown handler.** `server.js` has no `SIGTERM` listener. Active SSE streams and in-flight DB writes abort on every deploy. | Agent jobs stuck as "processing" forever. Partial data loss on active reconciliations. | **HIGH** on every deploy | Add `process.on('SIGTERM')` with 30s drain: stop accepting, wait for in-flight, then exit. |
| M12 | **Duplicate `authenticateUser` implementations.** Defined separately in `server.js:101`, `stripe.js:50-78`, `transcription.js:14-31`, `portalOwner.js:18-35`, and potentially other route files. | A security fix in one copy doesn't propagate to others. | **CERTAIN** | Extract to shared `middleware/auth.js`. Import everywhere. |

---

## Low Risks (monitor)

- **Google Maps API key in URL params** (`geocoding.js:49,80,117`): Standard for server-side calls. Ensure access logs don't persist query strings. Restrict API key to server IP.
- **`requestMemory.js` cache**: 200 entries/user, max 5000 users. Theoretical 10GB but practically <100MB. Monitor with heap snapshots under load.
- **CSV parser weak amount parsing** (`csvParserService.js:253-266`): Malformed `(hello)` silently becomes NaN → 0. Add `isNaN` check after `parseFloat`.
- **Fire-and-forget notifications** (`handlers.js:2579-2587`, `pushNotificationService.js:68-73`): `sendNotification` not awaited. Silent failures = missed alerts. Add error tracking (Sentry), don't block main flow.
- **Agent SSE timeout is 90s** (`agentService.js:155`): Acceptable for AI but long for UX. Consider 45s + SSE heartbeat.
- **30-day portal session expiry** (`portal.js` cookie `maxAge`): Long for financial data. Consider 7 days.
- **PII in logs** (`portal.js:153`): Client email logged at INFO. Hash or omit in production.
- **No DB migration version control**: Schema managed via Supabase dashboard. No migration files = no rollback. Consider `supabase db diff` workflow.
- **Prompt injection via user context** (`agentService.js`): Unsanitized `businessName`, `aboutYou`, `projectInstructions` in system prompt. Low risk since output goes back to same user, but monitor for multi-tenant expansion.
- **Portal cookie SameSite**: Verify cookies set `SameSite=Lax` or `Strict` for CSRF protection on cookie-based portal auth.

---

## Recommended Safeguards

### Before Launch (P0 — ship-blockers)

1. **Fix portal invoice IDOR (C1)**: Remove the `if (invoice.project_id)` guard. Always verify the requesting client has a relationship to the invoice. This is the single most exploitable issue — it involves real Stripe payments.

2. **Fix AI resolver ownership (C3)**: Add `.eq('user_id', userId)` to every resolver's UUID path. One-line change per resolver, but covers `delete_project`, `record_expense`, `convert_estimate_to_invoice`, `void_invoice`, and ~20 other tools.

3. **Fix `update_estimate` project cascade (C2)**: Add `.eq('user_id', userId)` at `handlers.js:764`.

4. **Add estimate-to-invoice idempotency (C4)**: Check `estimate.status === 'pending'`. Add `UNIQUE(estimate_id)` on invoices table.

5. **Encrypt bank tokens (C5)**: Use `pgcrypto` or application-level AES-256-GCM with key from env.

6. **Add transcription size limit (C6)**: `if (audio.length > 5_000_000) return res.status(413)`.

7. **Make reconciliation atomic (C7)**: Supabase RPC wrapping both updates in a transaction.

8. **Fix webhook idempotency fail-open (C8)**: Return 500 on non-duplicate DB errors so Stripe retries later.

### Before Scaling (P1)

9. **Centralize auth middleware (M12)**: Single `middleware/auth.js`. Import in all route files.

10. **Add graceful shutdown (M11)**: `SIGTERM` handler with 30s drain.

11. **Add audit trail for supervisor actions (M3)**: `audit_events(user_id, acted_by, action, resource_type, resource_id, timestamp)`.

12. **Strip `/ready` internals (M1)**: Return only pass/fail, no tool names or error details.

13. **Fix rate limiter JWT parsing (M2)**: Use IP-based keys or validate properly.

14. **Visit generator conflict handling (M7)**: `ON CONFLICT DO NOTHING` or upsert.

### Ongoing Monitoring

15. **Grep for unchecked `.update()` returns**: Especially in `reconciliationService.js`, `visitGenerator.js`, `handlers.js`.

16. **Add error tracking for fire-and-forget promises**: Every `sendNotification()`, every `.then().catch()` that only logs.

17. **Review `resolveOwnerId` scope** as supervisor features expand. Current model = supervisors have full owner access. This won't scale.

18. **Monitor `connectSessions` Map size** in production metrics. Cap or move to Redis if it grows.

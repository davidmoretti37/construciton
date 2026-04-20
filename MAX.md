# MAX.md — Integrations Map

## Required Integrations

| Service | Purpose | Auth Method | Already Connected? | Status |
|---------|---------|-------------|-------------------|--------|
| Supabase (DB) | All data storage, RLS, storage buckets | `SUPABASE_SERVICE_ROLE_KEY` (backend) | Yes | Working |
| Supabase (Storage) | Document signed URLs (`project-documents` bucket) | Service role key | Yes | Working |
| Stripe (Checkout) | Invoice payment via hosted checkout page | `STRIPE_SECRET_KEY` | Yes | Working |
| Stripe (PaymentIntent) | Native in-app invoice payment (card, ACH, Apple/Google Pay) | `STRIPE_SECRET_KEY` + ephemeral keys | Yes | Working — but no frontend caller |
| Next.js Portal (website) | Client-facing web app | httpOnly cookie (`portal_session`) | Yes | Working |
| Backend Express API | All portal data endpoints | Cookie + CORS | Yes | Working |

---

## Portal API Endpoint Audit

### Every frontend call and its backend match

| # | Frontend Function | Method | Portal Path | Backend Route | Status |
|---|------------------|--------|-------------|---------------|--------|
| 1 | `fetchDashboard` | GET | `/dashboard` | portal.js:180 | MATCH |
| 2 | `fetchBranding` | GET | `/branding` | portal.js:307 | MATCH (unused in UI) |
| 3 | `fetchProject` | GET | `/projects/:id` | portal.js:346 | MATCH |
| 4 | `fetchProjectPhotos` | GET | `/projects/:id/photos` | portal.js:446 | MATCH (unused in UI) |
| 5 | `fetchSiteActivity` | GET | `/projects/:id/activity` | portal.js:488 | MATCH (unused in UI) |
| 6 | `fetchEstimates` | GET | `/projects/:id/estimates` | portal.js:539 | MATCH |
| 7 | `respondToEstimate` | PATCH | `/estimates/:id/respond` | portal.js:563 | MATCH |
| 8 | `fetchInvoices` | GET | `/projects/:id/invoices` | portal.js:647 | MATCH |
| 9 | `fetchMilestones` | GET | `/projects/:id/milestones` | portal.js:712 | MATCH |
| 10 | `payInvoice` | POST | `/invoices/:id/pay` | portal.js:770 | MATCH |
| 11 | `fetchMessages` | GET | `/projects/:id/messages` | portal.js:982 | MATCH (unused in UI) |
| 12 | `sendMessage` | POST | `/projects/:id/messages` | portal.js:1037 | MATCH (unused in UI) |
| 13 | `fetchRequests` | GET | `/projects/:id/requests` | portal.js:1110 | MATCH |
| 14 | `createRequest` | POST | `/projects/:id/requests` | portal.js:1132 | MATCH |
| 15 | `fetchMaterials` | GET | `/projects/:id/materials` | portal.js:1177 | MATCH |
| 16 | `selectMaterial` | PATCH | `/materials/:id/select` | portal.js:1199 | MATCH |
| 17 | `submitRating` | POST | `/projects/:id/rate` | portal.js:1272 | MATCH (unused in UI) |
| 18 | `trackGoogleReviewClick` | POST | `/projects/:id/google-review-clicked` | portal.js:1311 | MATCH (unused in UI) |
| 19 | `fetchSummaries` | GET | `/projects/:id/summaries` | portal.js:1338 | MATCH |
| 20 | `fetchServicePlans` | GET | `/services` | portal.js:1363 | MATCH |
| 21 | `fetchServicePlan` | GET | `/services/:id` | portal.js:1384 | MATCH |
| 22 | `fetchApprovals` | GET | `/projects/:id/approvals` | portal.js:1434 | MATCH (unused in UI) |
| 23 | `fetchDocuments` | GET | `/projects/:id/documents` | portal.js:1458 | MATCH |
| 24 | `fetchChangeOrders` | GET | `/projects/:id/change-orders` | portal.js:1497 | MATCH (unused in UI) |
| 25 | `respondToChangeOrder` | POST | `/change-orders/:id/respond` | portal.js:1529 | MATCH (unused in UI) |
| 26 | `fetchCalendar` | GET | `/projects/:id/calendar?start=&end=` | portal.js:1615 | MATCH (unused in UI) |

### Backend routes with NO frontend caller

| Method | Path | File:Line | Notes |
|--------|------|-----------|-------|
| GET | `/projects/:id/money-summary` | portal.js:669 | Composite endpoint — no frontend function exists |
| POST | `/invoices/:id/create-payment-intent` | portal.js:861 | Native payment (card/ACH/Apple Pay) — no frontend function exists |

### Frontend functions defined but NOT called from any page

| Function | Likely Purpose | Risk |
|----------|---------------|------|
| `fetchBranding` | Standalone branding fetch | None — dashboard includes branding |
| `fetchProjectPhotos` | Photo gallery | Dead code or future feature |
| `fetchSiteActivity` | Live worker tracking | Dead code or future feature |
| `fetchMessages` / `sendMessage` | In-portal messaging | Dead code or future feature |
| `submitRating` / `trackGoogleReviewClick` | Satisfaction flow | Dead code or future feature |
| `fetchApprovals` | Audit trail viewer | Dead code or future feature |
| `fetchChangeOrders` / `respondToChangeOrder` | Change order flow | Dead code or future feature |
| `fetchCalendar` | Project calendar | Dead code or future feature |

---

## Auth Token Flow

### Portal Client Authentication

```
1. Owner shares project → POST /api/portal-admin/share
   → Creates project_clients row with auto-generated access_token
   → Returns portal URL: https://sylkapp.ai/portal/login?token={access_token}

2. Client opens link → GET /portal/login?token={token}
   → Frontend calls POST /api/portal/auth/verify { token }
   → Backend validates token against project_clients.access_token
   → Checks token_expires_at (30-day expiry, refreshed on re-share)
   → Creates client_sessions row (or reuses existing unexpired session)
   → Sets httpOnly cookie: portal_session={session_token}
     - secure: true (production only)
     - sameSite: 'none' (production) / 'lax' (dev)
     - maxAge: 30 days
     - path: /api/portal

3. Subsequent requests → portalFetch() with credentials: 'include'
   → Cookie sent automatically
   → authenticatePortalClient middleware reads req.cookies.portal_session
   → Also supports Bearer JWT (for mobile app clients)
   → Validates session against client_sessions table
   → Attaches req.client { id, full_name, email, phone, owner_id, sessionId }

4. Project access → verifyProjectAccess middleware
   → Checks project_clients table for client_id + project_id match

5. Logout → POST /api/portal/auth/logout
   → Deletes client_sessions row
   → Clears portal_session cookie
```

### Portal Owner Authentication (portal-admin routes)

```
Owner app → Authorization: Bearer {supabase_jwt}
  → authenticateUser middleware validates JWT via Supabase
  → All /api/portal-admin/* routes protected
```

---

## CORS Configuration

**Server setup** (server.js):
```
origin: PORTAL_URL ? [PORTAL_URL.replace(/\/portal$/, '')] : ['localhost:3000', 'localhost:3001']
credentials: true
```

| Environment | Allowed Origin | Portal URL |
|-------------|---------------|------------|
| Production | `https://sylkapp.ai` (derived from PORTAL_URL) | `https://sylkapp.ai/portal` |
| Development | `http://localhost:3000`, `http://localhost:3001` | N/A |

**Risk:** If `PORTAL_URL` is not set in production, CORS falls back to localhost origins — all portal requests will be blocked.

**Cookie path:** `/api/portal` — cookie is only sent to portal API routes, not other backend endpoints. This is correct and secure.

**Cross-origin cookie requirement:** `sameSite: 'none'` + `secure: true` required for cross-origin cookies. Both are set when `NODE_ENV === 'production'`. If `NODE_ENV` is unset in production, cookies get `sameSite: 'lax'` and `secure: false` — **portal auth will silently fail**.

---

## Environment Variables

### Portal-Specific Env Vars

| Variable | Where Used | Required? | Default | Status |
|----------|-----------|-----------|---------|--------|
| `NEXT_PUBLIC_BACKEND_URL` | website portal-api.ts:7 | Yes | `''` (empty = same origin) | Set in .env.local → Railway |
| `PORTAL_URL` | portal.js:810, portalOwner.js:188,212 | Yes (prod) | `https://sylkapp.ai/portal` | Used for Stripe redirect URLs + CORS |
| `SUPABASE_URL` | portal.js:14 | Yes | None | Verified present |
| `SUPABASE_SERVICE_ROLE_KEY` | portal.js:15 | Yes | None | Verified present |
| `STRIPE_SECRET_KEY` | portal.js:12 | Yes (for payments) | None | Verified present |
| `STRIPE_PUBLISHABLE_KEY` | portal.js:966 | Yes (for PaymentIntent) | None | Verified present |
| `NODE_ENV` | portal.js:80,82,111,113,152,154 | Critical | `undefined` | **MUST be 'production' in prod** |

### No New Env Vars Needed

The portal uses only existing integrations (Supabase + Stripe). No new services required.

---

## Data Flows

### Portal Dashboard Load
```
Browser → GET /api/portal/dashboard (cookie auth)
  → 5 parallel Supabase queries:
    1. project_clients → projects (client's projects)
    2. service_plans (client's plans)
    3. invoices × 2 (by email + by name, deduped)
    4. estimates × 2 (by email + by name, deduped)
    5. client_portal_branding (owner's branding)
  → Merged response → Browser
```

### Invoice Payment (Stripe Checkout)
```
Browser → POST /api/portal/invoices/:id/pay (cookie auth)
  → Verify invoice access via project_clients
  → stripe.checkout.sessions.create (idempotencyKey: checkout_{id}_{cents})
  → Log approval_event (type: 'viewed')
  → Return { url: stripe_checkout_url }
  → Browser redirects to Stripe
  → Stripe webhook (checkout.session.completed) → update invoice
```

### Invoice Payment (PaymentIntent — unused by portal frontend)
```
[No caller] → POST /api/portal/invoices/:id/create-payment-intent
  → Find/create Stripe customer
  → Create ephemeral key
  → Check owner's Stripe Connect account
  → stripe.paymentIntents.create (with optional transfer_data)
  → Store payment_intent_id on invoice
  → Return { clientSecret, ephemeralKey, customerId, publishableKey }
```

### Document Download
```
Browser → GET /api/portal/projects/:id/documents
  → Supabase query project_documents
  → For each doc: supabase.storage.createSignedUrl (1hr expiry)
  → Return docs with signed download URLs
```

---

## Integration Risks

### Will Fail at Runtime

| Issue | Severity | Details |
|-------|----------|---------|
| `NODE_ENV` unset in production | **CRITICAL** | Cookies get `secure: false` + `sameSite: 'lax'` → cross-origin auth fails silently. Portal appears "logged out" on every page. |
| `PORTAL_URL` unset | **HIGH** | CORS blocks all portal requests (falls back to localhost). Stripe redirect URLs point to localhost. |
| `create-payment-intent` references `invoice.user_id` | **BUG** | portal.js:925 queries `profiles` where `id = invoice.user_id`, but the invoice select (line 870) does NOT include `user_id`. Will always return null → payments never route to Connect account. |

### Potential Issues

| Issue | Severity | Details |
|-------|----------|---------|
| 10 unused frontend API functions | **LOW** | Dead code — `fetchMessages`, `sendMessage`, `fetchChangeOrders`, `respondToChangeOrder`, `fetchCalendar`, `fetchSiteActivity`, `fetchProjectPhotos`, `fetchApprovals`, `submitRating`, `trackGoogleReviewClick`. No runtime risk but adds maintenance burden. |
| `money-summary` endpoint has no caller | **LOW** | Backend-only orphan — works fine, just unused. |
| Invoice dedup by email + name | **MEDIUM** | Dashboard fetches invoices twice (by email, by name) and dedupes. If client changes name, old invoices may not appear. |
| Signed URLs expire in 1 hour | **LOW** | Document downloads fail if user waits >1hr. Acceptable for most use cases. |
| No rate limiting on estimate/CO responses | **LOW** | A client could spam approve/reject. Mitigated by portalLimiter on the router. |

### What Works Correctly

- All 26 frontend API functions have matching backend routes
- Auth flow is secure: httpOnly cookies, session validation, project access checks
- Supabase service role key is backend-only (never exposed to frontend)
- Stripe checkout has idempotency keys (portal.js:834, 952)
- All mutating endpoints verify client ownership before allowing changes
- CORS credentials properly configured for cookie-based auth
- Portal rate limiter applied to all portal routes

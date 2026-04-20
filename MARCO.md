# MARCO.md — Architecture

## Mobile App Architecture Audit
_Date: 2026-04-17 | Scope: frontend/src/ — React Native + Expo + Supabase_
_Previous audit (Client Portal, 2026-04-16) archived below._

---

## 1. Project Structure

```
frontend/src/
├── components/          104 files, 7 subdirs — well-organized by domain
│   ├── ChatVisuals/     24 — rich data viz for AI chat responses
│   ├── dashboard/       20 — widget system (draggable, customizable)
│   ├── FinancialReport/ 8  — P&L, cash flow, metrics
│   ├── onboarding/      14 — animated intro flow
│   ├── schedule/        2  — calendar views
│   ├── skeletons/       3  — loading states
│   ├── modals/          1  — should hold more (65 root-level components include ~20 modals)
│   └── [root]           65 — mix of modals, cards, inputs, UI primitives
├── contexts/            6 providers (Auth, Theme, Network, Subscription, Notification, Onboarding)
├── hooks/               9 general + 8 action hooks (AI agent bindings)
├── navigation/          13 navigators (role-based)
├── screens/             130+ screens across 10 subdirs
├── services/            20 services + agents/ subsystem (6 agents, 9 core files)
├── utils/               18 utilities + storage/ (22 domain modules, 14K LOC)
├── constants/           4 files (theme, trades, phases, transaction categories)
├── config/              1 file (API URL)
├── lib/                 1 file (Supabase client)
├── locales/             3 languages x 14 namespaces
└── i18n/                1 file (i18next setup)
```

**Verdict: Structure is solid.** Clear separation of concerns. Each layer has a defined responsibility. Two organizational issues exist (see Recommendations).

---

## 2. Navigation Architecture

### Hierarchy

```
App.js (conditional root)
├── AuthNavigator (login/signup — 5 screens)
├── OnboardingNavigator (owner — 14 screens)
├── SupervisorOnboardingNavigator (3 screens)
├── WorkerOnboardingNavigator (3 screens)
│
├── OwnerMainNavigator (Stack)
│   └── OwnerBottomTabNavigator (Tabs)
│       ├── Dashboard (OwnerDashboardScreen)
│       ├── Projects (OwnerProjectsScreen)
│       ├── Workers (OwnerWorkersScreen)
│       ├── Chat (ChatScreen)
│       └── More (OwnerSettingsScreen)
│   └── 45+ detail screens registered flat
│
├── MainNavigator (Supervisor — Stack)
│   └── BottomTabNavigator (Tabs)
│       ├── Projects
│       ├── Workers
│       ├── Chat
│       └── More
│   └── 14 detail screens
│
├── WorkerMainNavigator (Stack)
│   └── WorkerBottomTabNavigator (Tabs)
│       ├── Home (TodaysWorkScreen)
│       ├── Schedule
│       ├── Time Clock
│       └── More
│
└── ClientMainNavigator (Stack)
    └── ClientTabNavigator (Tabs)
        ├── Dashboard
        ├── Projects
        ├── Invoices
        ├── Messages
        └── More
```

### Issues

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| N1 | **OwnerMainNavigator is a 337-line flat list of 45+ screens** | Medium | Every owner-accessible screen is registered as a direct child of one Stack. No grouping. Works, but adding/removing screens requires scanning a massive file. Compare to MainNavigator (supervisor) which has only 14 screens — same features, different structure. |
| N2 | **Screen name duplication risk across navigators** | Low | `ProjectDetail`, `Notifications`, `DailyReportForm`, etc. appear in multiple navigators. React Navigation handles this via navigator scoping, but deep links and `navigation.navigate()` calls from shared components may resolve to the wrong navigator. |
| N3 | **No SettingsNavigator in Owner flow** | Low | Supervisor flow uses a dedicated `SettingsNavigator` (modal presentation). Owner flow inlines all settings screens directly in the main stack. Inconsistent pattern. |
| N4 | **Role selection happens in App.js, not in navigation** | Info | The role → navigator mapping is done via conditional rendering in App.js (435 lines), not via a RootNavigator. This works but makes App.js a god file. |

**Verdict: Navigation works correctly. The main concern is maintainability, not correctness.**

---

## 3. Data Flow

### The Three Data Paths

```
Path A: Cache-First (useCachedFetch)
  AsyncStorage → instant render → background fetch → update if stale
  Used by: HomeScreen, ProjectDetailScreen, PhaseDetailScreen, etc.

Path B: Direct Fetch (storage modules)
  Supabase query → transform → setState
  Used by: useProjects, most owner screens, AI agents
  22 storage modules in utils/storage/ (14K LOC total)

Path C: Optimistic Mutation (useOptimisticMutation)
  Update UI immediately → fire server request → rollback on failure
  Used by: task completion, visit status, worker assignments
```

### Data Flow Diagram

```
Supabase (source of truth)
    ↓ (via supabase-js client)
utils/storage/*.js (22 modules — query + transform layer)
    ↓
hooks/ (useCachedFetch, useProjects, useOptimisticMutation)
    ↓
screens/ (consume via hooks, manage local state with useState)
    ↓ (cross-screen sync)
services/eventEmitter.js (project-updated, data-changed, phase-updated, task-completed, transaction-deleted)
```

### Issues

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| D1 | **Two parallel caching systems that don't know about each other** | High | `useCachedFetch` (hook-level, AsyncStorage, SWR pattern) and `offlineCache.js` (service-level, memCache + AsyncStorage) both write to `cache:*` keys. Same namespace, different TTL defaults (5m vs 24h), different staleness logic. If a screen uses `useCachedFetch` and a service writes via `offlineCache.cacheData`, they can overwrite each other's timestamps. |
| D2 | **eventEmitter has no integration with useCachedFetch** | Medium | When `emitProjectUpdated()` fires, screens listening via `onProjectUpdated()` must manually call `refresh()`. There's no automatic cache invalidation. Some screens listen, some don't — inconsistent freshness. |
| D3 | **useProjects doesn't use useCachedFetch** | Medium | `useProjects` is a standalone hook with its own loading/error/cache state — none of it integrated with the caching layer. It fetches directly from storage. Two patterns for the same problem. |
| D4 | **Storage modules are 14K LOC of Supabase queries with no abstraction** | Info | Each module re-implements the same pattern: get userId, query supabase, check error, transform. No base class or helper. The largest files (`workerTasks.js` at 1,893 lines, `timeTracking.js` at ~1,400 lines) are growing unwieldy. Functional but will slow new development. |

---

## 4. State Management

### Current Pattern: Context + Local State (no global store)

| State Type | Where | Pattern |
|-----------|-------|---------|
| Auth (user, session, role, profile) | `AuthContext` | Context + AsyncStorage cache |
| Theme | `ThemeContext` | Context + AsyncStorage |
| Network status | `NetworkContext` | Context + NetInfo listener |
| Subscription tier | `SubscriptionContext` | Context + Supabase fetch |
| Notifications | `NotificationContext` | Context + Supabase realtime |
| Screen data | Each screen | `useState` + `useCachedFetch` or direct fetch |
| Cross-screen sync | `eventEmitter.js` | Pub/sub (manual) |
| Form state | Each screen | `useState` (local) |

**There is no global store (no Redux, Zustand, Recoil, Jotai).** State lives in contexts (global) or component state (local). Cross-screen communication uses a custom event emitter.

### Assessment

This is **adequate for the current app** but shows strain:

| Signal | Evidence |
|--------|----------|
| Prop drilling | `ownerId` passed through 3+ levels in owner screens |
| Stale data | Screens that don't subscribe to eventEmitter show outdated info after mutations on other screens |
| Redundant fetches | Multiple screens fetch the same project list independently |
| No derived state | Each screen re-computes totals, status badges, etc. from raw data |

**Verdict: The ad-hoc approach works because most screens are self-contained. The pain points are at screen boundaries — when one screen mutates data another screen displays.**

---

## 5. Caching Layer Deep Dive

### Architecture

```
┌─────────────────────────────────┐
│     useCachedFetch (hook)       │ ← SWR pattern, per-component
│  staleTTL: 30s, maxAge: 5m     │
│  optimisticUpdate() with rollback│
│  Storage: AsyncStorage cache:*   │
└────────────┬────────────────────┘
             │ (same key namespace!)
┌────────────┴────────────────────┐
│     offlineCache.js (service)   │ ← Global cache, used by services
│  DEFAULT_TTL: 24h, MAX_STALE: 7d│
│  memCache{} in-memory mirror    │
│  allowStale mode for offline    │
│  Storage: AsyncStorage cache:*   │
└─────────────────────────────────┘
```

### What Works

- `useCachedFetch` is well-designed: instant render from cache, background refresh, optimistic updates with rollback, mounted-ref guard against state updates after unmount.
- `offlineCache` has a smart in-memory mirror that warms on startup via `AsyncStorage.multiGet`.
- Both support graceful degradation (stale data > no data).

### What Doesn't

| # | Issue | Impact |
|---|-------|--------|
| C1 | **Shared `cache:*` namespace** — both systems read/write the same keys with incompatible metadata formats. `useCachedFetch` stores `{ data, timestamp }`. `offlineCache` stores `{ data, timestamp, ttl }`. A key written by one and read by the other will misinterpret the TTL field. | Silent cache corruption. `useCachedFetch` reads `offlineCache` entries and ignores TTL. `offlineCache` reads `useCachedFetch` entries and treats them as having `undefined` TTL → falls back to default. |
| C2 | **No cache size management** — AsyncStorage has a 6MB default limit on Android. With 130+ screens potentially caching data, heavy users will hit this. No eviction strategy. | App data loss or AsyncStorage write failures on Android. |
| C3 | **offlineCache.getCachedData is synchronous but reads from memCache** — if called before the async warmup completes (first ~200ms of app launch), returns null even when data exists in AsyncStorage. | First render after cold start may miss cached data. |

---

## 6. API Layer (Supabase Calls)

### Organization

```
utils/storage/          22 modules — THE primary API layer
  ├── auth.js           getCurrentUserId, DEFAULT_PROFILE
  ├── projects.js       Project CRUD (28KB)
  ├── projectPhases.js  Phase/task management (41KB)
  ├── workers.js        Worker CRUD + invites (42KB)
  ├── workerTasks.js    Task assignment + completion (62KB)
  ├── timeTracking.js   Clock in/out + timesheets (67KB)
  ├── estimates.js      Estimate CRUD + conversion (30KB)
  ├── invoices.js       Invoice CRUD + payments (19KB)
  ├── transactions.js   Financial recording (22KB)
  ├── dailyReports.js   Reports + photos (20KB)
  ├── schedules.js      Calendar events (33KB)
  ├── ... (11 more domain modules)
  └── index.js          Barrel re-export

services/               Higher-level services
  ├── aiService.js      Backend AI calls
  ├── projectService.js Project transforms + progress calc
  ├── uploadService.js  File/photo uploads
  ├── bankService.js    Plaid integration
  ├── subscriptionService.js  Stripe checkout
  └── ... (15 more)
```

### Pattern

Every storage module follows the same implicit contract:
1. Get `userId` via `getCurrentUserId()`
2. Query Supabase with `.eq('user_id', userId)` (or `resolveOwnerId` for supervisors)
3. Transform response from DB format → app format
4. Return data or throw

### Issues

| # | Issue | Severity |
|---|-------|----------|
| A1 | **No error typing or consistent error handling** — some functions throw, some return null, some return empty arrays. Callers have to guess. | Medium |
| A2 | **No request deduplication** — two screens mounting simultaneously both call `fetchProjects()`. No in-flight request tracking. | Low |
| A3 | **`utils/storage/` is a misnomer** — these are API/data-access modules, not storage utilities. The name suggests localStorage wrappers. | Low (naming only) |

---

## 7. Offline-First Capabilities

### What Exists

| Layer | Mechanism | Scope |
|-------|-----------|-------|
| **Network detection** | `NetworkContext` + NetInfo | Global online/offline state |
| **Read cache** | `useCachedFetch` + `offlineCache` | Cached reads survive offline |
| **Write queue** | `offlineQueue.js` | Queues 5 action types for replay |
| **Queue sync** | `NetworkContext.syncQueuedActions()` | Auto-replays on reconnect |
| **Queue persistence** | AsyncStorage (`sylk_offline_queue`) | Survives app restart |
| **Deduplication** | Last-write-wins per entity key | Prevents duplicate visit/checklist updates |
| **Expiry** | 7-day max age on queued actions | Prevents stale replays |
| **UI feedback** | Offline banner + sync progress message | User knows they're offline |

### What's Missing

| # | Gap | Impact | Effort |
|---|-----|--------|--------|
| O1 | **Only 5 action types are queueable** — `complete_visit`, `uncomplete_visit`, `toggle_checklist`, `update_quantity`, `submit_daily_report`. Core operations like creating projects, logging time, sending invoices are NOT queued. If a contractor clocks in while in a dead zone, it fails silently. | High — time tracking and daily reports are the #1 use case on job sites with poor connectivity | Medium — each new action type needs an `executeAction` handler |
| O2 | **No offline indicator on action buttons** — buttons that won't work offline look identical to ones that will. User doesn't know which actions are safe. | Medium | Low |
| O3 | **No conflict resolution** — last-write-wins dedup works for simple toggles but not for concurrent edits. Two supervisors editing the same task offline → one loses their changes. | Low (rare for current user base) | High |
| O4 | **Optimistic mutations (useOptimisticMutation) don't queue on failure** — if the server request fails due to being offline, the UI rolls back. It should queue instead. | High — defeats the purpose of optimistic UI when offline | Medium |

**Verdict: The offline architecture is well-designed but narrow.** The infrastructure (queue, persistence, sync, dedup) is production-quality. The coverage (5 of ~50 write operations) leaves most of the app broken offline.

---

## 8. Service Layer

### Inventory

| Service | Purpose | LOC | Quality |
|---------|---------|-----|---------|
| `aiService.js` | Backend AI calls, model routing | ~200 | Good — clean SSE streaming |
| `projectService.js` | Transforms, progress calc | ~150 | Good — pure functions |
| `uploadService.js` | Photo/file uploads to Supabase storage | ~100 | Good |
| `subscriptionService.js` | Stripe checkout, tier check | ~100 | Good |
| `bankService.js` | Plaid link + reconciliation | ~150 | Good |
| `conversationService.js` | Chat persistence | ~100 | Good |
| `chatHistoryService.js` | Chat session management | ~100 | Redundant with conversationService |
| `offlineQueue.js` | Write queue for offline | 213 | Excellent — clean, well-documented |
| `offlineCache.js` | K/V cache with TTL | 107 | Good — smart memCache warmup |
| `eventEmitter.js` | Pub/sub for cross-screen sync | 79 | Good — simple, effective |
| `profileCacheService.js` | Instant boot via cached profile | ~80 | Good |
| `pricingIntelligence.js` | Competitive pricing analysis | ~200 | Niche |
| `agents/` | 6 AI agents + 9 core modules | 4,032 | Sophisticated — fast routing, caching, memory |

### What's Missing

| Gap | Impact |
|-----|--------|
| **No analytics/telemetry service** — no screen tracking, no feature usage measurement. You're flying blind on what contractors actually use. | Can't prioritize features post-launch |
| **No error reporting service wrapper** — Sentry is initialized in App.js but there's no `reportError(error, context)` utility. Each screen does its own `console.error`. | Inconsistent error capture |
| **No sync service** — offline queue handles writes, but there's no coordinated "full sync" on app foreground (pull latest projects, invoices, workers in one call). Each screen fetches independently. | Redundant network requests, stale data on long-backgrounded sessions |

---

## 9. Shared Utilities

| Utility | Purpose | Notes |
|---------|---------|-------|
| `calculations.js` | Financial math (margins, totals, tax) | **Uses floating-point** — NOVA flagged this |
| `pdfGenerator.js` | Estimate/invoice PDF generation | Expo Print + HTML templates |
| `financialReportPDF.js` | P&L / cash flow PDF export | Large HTML template builder |
| `dateUtils.js` | Date formatting helpers | Standard |
| `formatters.js` | Currency, phone, address formatting | Standard |
| `validators.js` | Input validation | Standard |
| `permissions.js` | Permission request wrappers | Camera, location, notifications |
| `storage/index.js` | Barrel export for all 22 storage modules | Clean re-export |

**Verdict: Adequate utility layer.** No unnecessary abstractions. The floating-point money math in `calculations.js` is the only correctness concern (flagged by NOVA).

---

## 10. Recommendations — Ranked by Impact

### Tier 1: High Impact, Low Effort (do first)

| # | Recommendation | Why | Effort |
|---|---------------|-----|--------|
| R1 | **Unify the cache namespace** — add a prefix to distinguish `useCachedFetch` keys (`swrcache:`) from `offlineCache` keys (`offcache:`). Or better: make `useCachedFetch` use `offlineCache` as its backend instead of raw AsyncStorage. | Eliminates silent cache corruption (C1). Single cache = single TTL policy. | 2-3 hours |
| R2 | **Add time tracking to offline queue** — `clock_in` and `clock_out` are the single most important operations for workers on job sites. These must work offline. | Workers on construction sites lose cell signal constantly. Failed clock-ins = lost pay records. | 4-6 hours |
| R3 | **Bridge optimistic mutations to offline queue** — when `useOptimisticMutation` catches a network error, queue the action instead of rolling back. | Turns every optimistic mutation into an offline-capable mutation with zero UI changes. | 4-6 hours |
| R4 | **Fix floating-point money math** — convert `calculations.js` to integer cents. `Math.round(amount * 100)` on input, `/100` on display. | NOVA and REX both flagged this. Penny drift on invoices = trust erosion with clients. | 3-4 hours |

### Tier 2: High Impact, Medium Effort

| # | Recommendation | Why | Effort |
|---|---------------|-----|--------|
| R5 | **Add a foreground sync service** — on `AppState.change === 'active'`, fetch the latest for the current role's primary data (projects, workers, invoices). Invalidate relevant `useCachedFetch` keys.  | Eliminates stale data after long background sessions. Reduces "pull to refresh" friction. | 1-2 days |
| R6 | **Integrate eventEmitter with useCachedFetch** — when a `data-changed:${cacheKey}` event fires, auto-invalidate and refetch. Currently requires manual wiring per screen. | One change eliminates an entire class of stale-data bugs. | 1 day |
| R7 | **Split OwnerMainNavigator into nested stacks** — group by domain: `FinancialStack`, `TeamStack`, `ProjectStack`, `SettingsStack`. | OwnerMainNavigator (45+ flat screens) is the hardest file to maintain. Grouped stacks make navigation predictable and enable per-domain lazy loading. | 1 day |
| R8 | **Add an error reporting utility** — `export function reportError(error, context)` that calls `Sentry.captureException` with structured context. Replace `console.error` calls. | 483 `console.log` statements (per NOVA). A utility makes cleanup mechanical. | 1 day |

### Tier 3: Strategic (plan for v2)

| # | Recommendation | Why | Effort |
|---|---------------|-----|--------|
| R9 | **Consider Zustand for cross-screen state** — projects, workers, and invoices are fetched by 5+ screens each. A lightweight store with selectors would eliminate redundant fetches and make cache invalidation automatic. | Not urgent — Context + eventEmitter works. But if you add more shared state, the manual wiring won't scale. | 2-3 days |
| R10 | **Add screen analytics** — track which screens contractors actually visit, time spent, and feature adoption. | You're about to launch to beta users. Without analytics, you won't know what they use. | 1-2 days |
| R11 | **Reorganize `components/`** — move the ~20 modal components from root into `components/modals/`. Move cards into `components/cards/`. Root should have <15 files. | 65 files in one directory is a scanning burden. The subdirs already exist for other domains. | Half day |

---

## Architectural Decisions (Current State)

| Decision | Choice | Assessment |
|----------|--------|------------|
| State management | Context + useState + eventEmitter | Correct for current scale. Zustand would be a clean upgrade path. |
| Navigation | Role-conditional rendering in App.js | Works but makes App.js a god file. RootNavigator would be cleaner. |
| Data access | 22 domain-specific storage modules | Good domain separation. Naming (`storage/`) is misleading. |
| Caching | Dual system (useCachedFetch + offlineCache) | Architecturally sound patterns, but the namespace collision is a bug. |
| Offline writes | Custom queue with AsyncStorage persistence | Excellent design. Too narrow in scope (5 of ~50 operations). |
| AI system | 6 agents + fast routing + model selection | Sophisticated and well-architected. Best part of the codebase. |
| i18n | i18next with 3 languages, 14 namespaces | Complete and well-organized. |
| Error tracking | Sentry (prod only, 20% sample) | Good but under-utilized — most errors go to console.log. |
| Cross-screen sync | Custom event emitter | Simple and effective. Not integrated with cache layer. |

---

## Summary

**The mobile app architecture is well-structured and production-capable.** The separation into layers (contexts → hooks → services → storage → Supabase) is clean. The AI agent system is genuinely impressive. The offline infrastructure is well-designed.

**The three highest-impact fixes are:**
1. Unify the dual cache systems (R1) — eliminates a silent data corruption bug
2. Add time tracking to offline queue (R2) — the #1 reliability need for the target user
3. Bridge optimistic mutations to the offline queue (R3) — makes the entire app offline-resilient with minimal code

**What NOT to change:** Don't add Redux/Zustand yet. Don't restructure the 22 storage modules into classes. Don't rewrite navigation. The current patterns work — they just need the gaps filled.

---

---

## Appendix: Client Portal Architecture Audit (2026-04-16)

_Previous MARCO.md content preserved for reference._

### Auth Flow

```
Owner shares project → POST /api/portal-admin/share → magic link
Client clicks link → POST /api/portal/auth/verify → httpOnly cookie session
All requests → portalFetch() with credentials:include → cookie auto-sent
```

Auth is well-structured. Cookie-only (no localStorage). Session expiry enforced server-side.

### Critical Issues (from prior audit)

1. **Revoked client sessions stay valid** — DELETE /share removes `project_clients` but `client_sessions` survive 30 days
2. **Dashboard runs unbounded queries** — no LIMIT on invoice/estimate queries
3. **Pending estimates click handler is empty** — `page.tsx:107-111`
4. **Dead "Book Again" CTA** — links to project detail, no booking flow

### Verdict

Portal architecture is solid. All 10 pages, 26 API functions, 9 components verified. Fix session invalidation and unbounded queries before launch.

_Full audit details: see git history for previous MARCO.md content._

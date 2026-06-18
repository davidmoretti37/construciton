# Sylk E2E test suite

The app is instrumented with **testID + accessibilityLabel on every interactive
element and key value** (≈906 in the owner role, plus the login + onboarding
funnel), using a `screenKey.element` convention (e.g. `ownerTab.Settings`,
`ownerDashboard.revenueAmount`, `ownerSettings.subscriptionItem`,
`login.signInButton`). This lets E2E tooling find and drive every element **by
id** — no fragile coordinate taps.

Two runners use the **same testIDs**:

## 1. Detox (CI — release build, fully deterministic)

```bash
npm run e2e          # build + test
# or separately:
npm run e2e:build    # detox build -c ios.sim.release
npm run e2e:test     # detox test  -c ios.sim.release --cleanup
```

- Config: `.detoxrc.js` (config `ios.sim.release`), runner `e2e/jest.config.js`,
  specs `e2e/*.test.js`, shared login/funnel helpers in `e2e/helpers.js`.
- The **Release** build bundles the JS (`main.jsbundle`) — no Metro, no Expo dev
  launcher — so `device.launchApp` is deterministic and CI-safe.
- `helpers.loginAsOwner()` cold-launches, walks the logged-out funnel
  (onboarding carousel → Skip → Signup → Sign In → Login) when present, signs in
  the seeded QA owner, and dismisses the first-time walkthrough overlay — all by
  id, all idempotent. Specs can then assume the owner tab bar.

### Build prerequisites (local + CI)
- **Stripe NSUInteger patch** — captured as a `patch-package` patch under
  `patches/` and re-applied automatically by `npm`'s `postinstall`. No manual
  node_modules editing.
- **runtimeVersion** — the bare (prebuilt) project can't use a `{ policy }`
  runtimeVersion. The committed `app.json` keeps the policy for EAS; the local
  sim build and CI pin a literal `"1.0.0"` transiently (CI does it in a step;
  locally set it before building and don't commit it).
- `applesimutils` (`brew tap wix/brew && brew install applesimutils`).

CI runs this on `.github/workflows/e2e-ios.yml` (macOS runner, manual +
app-touching pushes to main; skips cleanly when the Supabase secrets aren't set).

## 2. Maestro (quick local runs against the dev build)

```bash
maestro test e2e/maestro/owner-walk.yaml
```

Same testIDs, `tapOn: { id }` / `assertVisible: { id }` / `scrollUntilVisible:
{ id }`. Handles the Expo dev launcher. Good for a fast eyeball during dev; the
only flaky part is dev-client startup (use the Detox release build for CI).

## Owner coverage (`owner-coverage.test.js`)
Data-driven from `owner-screens.map.js` — one entry per owner screen with the
nav steps from the tabs, the testIDs that prove it rendered, and safe
(non-destructive) buttons to exercise. `beforeEach` relaunches (session
persists) to reset to the tabs, so each screen test is independent.

**Covered (31 owner screens, all reachable via stable testID nav):** 5 bottom
tabs + embedded projects list; project detail + documents; Financial Report and
its full Reports&Tools grid → AR Aging, Tax Summary, Payroll Summary, Contractor
Payments; Settings sub-screens (clients, integrations, edit business info,
estimates detail, invoices detail, contracts, invoice template, bank connection,
pictures, notification settings, change language, add service, subscription,
notifications); Team detail screens (supervisor detail, worker detail history);
create/builder forms (manual project, estimate, invoice). Plus `owner.test.js`
(subscription) and `owner-deep.test.js` (company overhead). The QA owner is
seeded with a team (2 workers, 1 supervisor, 1 sub) so the Workers detail
screens render.

**Genuinely gated (7 screens — documented, not faked):**
- **subcontractorDetail** — instrumented + a sub is seeded, but the
  Workers→Subcontractors list loads from the backend `GET /api/subs`, whose
  in-app fetch fails in the release sim build (the endpoint returns 200 via curl
  and its URL is bundled — a sim/backend-integration issue, not a harness
  defect). supervisorDetail + workerDetailHistory use Supabase-direct queries
  and pass.
- **BankReconciliation** — needs a connected bank or unmatched bank
  transactions (a data state we don't seed).
- **ClockOuts** — needs a "forgotten clock-out" (worker clocked in >10h) and for
  it to be the first dashboard alert; only reached via that alert / a
  non-default widget.
- **ProjectBuilder / ChangeOrderBuilder** — reached only via the AI chat flow
  (FAB "new project"/"new estimate" are `type: 'ai'`), non-deterministic for e2e.
- **ChangeOrdersList** — needs a `change_order` billing event on the first
  project + uses a dynamic per-row id.
- **Material Selections** — its entry link sits below a nested ScrollView at the
  very bottom of project detail, which traps Detox's whileElement scroll.

## Extending to other roles
Repeat the testID pass for worker / client / sub screens, add each role's login
funnel to `helpers.js`, and provision a QA account per role linked to the QA
owner (the owner account is `claude.qa.user.1781642646@sylkqa.test`).

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

**Covered (reachable via stable, testID-anchored nav):** the 5 bottom tabs
(dashboard / projects / workers / settings + embedded projects list), project
detail, project documents, material selections, clients, integrations,
financial report, and the create/builder forms (manual project, estimate,
invoice). Plus `owner.test.js` (subscription) and `owner-deep.test.js`
(company overhead).

**Known gaps (NOT yet auto-covered, and why):**
- **Financial cluster** — TaxSummary, ARAging, ContractorPayments,
  PayrollSummary, BankReconciliation, ClockOuts are reached only through
  *optional* dashboard widgets (not in `DEFAULT_LAYOUT`) or *data-gated* alerts
  (e.g. "forgotten clock-outs" needs someone clocked in >10h). To cover them:
  seed the QA owner's dashboard layout to include those widgets (+ the alert
  data), or add testIDs to the inner widget cards and drive from there.
- **ProjectBuilder / ChangeOrderBuilder** — reachable only via the QuickAction
  FAB menu (no testIDs) / the AI chat flow. Need testIDs on the FAB items.

## Extending to other roles
Repeat the testID pass for worker / client / sub screens, add each role's login
funnel to `helpers.js`, and provision a QA account per role linked to the QA
owner (the owner account is `claude.qa.user.1781642646@sylkqa.test`).

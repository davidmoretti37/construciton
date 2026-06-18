# Sylk E2E test suite

The app is instrumented with **testID + accessibilityLabel on every interactive
element and key value** (≈906 in the owner role), using a `screenKey.element`
convention (e.g. `ownerTab.Settings`, `ownerDashboard.revenueAmount`,
`ownerSettings.subscriptionItem`, `addWorker.submitButton`). This lets E2E
tooling find and drive every element **by id** — no fragile coordinate taps.

Two runners use the **same testIDs**:

## 1. Maestro (works today, against the running dev build)

```bash
maestro test e2e/maestro/owner-walk.yaml
```

`owner-walk.yaml` launches the app, navigates every owner tab, asserts the
dashboard financial tiles, scrolls to + opens Subscription — all by id. The
`tapOn: { id }`, `assertVisible: { id }`, and `scrollUntilVisible: { id }`
steps are deterministic.

Caveat: against the **dev client** the only flaky part is app *startup* — the
Expo dev launcher + first Metro bundle. The flow handles the launcher, but for
a fully deterministic `launchApp` use a release/standalone build (no launcher).

## 2. Detox (CI — needs the native build finished)

```bash
detox build -c ios.sim.debug && detox test -c ios.sim.debug
```

Config: `.detoxrc.js`, runner `e2e/jest.config.js`, spec `e2e/owner.test.js`.

**Status / remaining work for Detox-on-iOS:**
- `detox` + `applesimutils` installed; config + spec scaffolded.
- `@config-plugins/detox` only wires Detox for **Android**. iOS Detox 20 on this
  Expo SDK 54 / RN 0.81 **new-architecture** app needs the Detox framework linked
  into the app manually (Podfile) — the config plugin does not do this for iOS.
- `expo prebuild` converts the project to the bare workflow, where
  `runtimeVersion: { policy: "appVersion" }` is unsupported — set a literal
  `"runtimeVersion": "1.0.0"` for local/sim builds (keep the policy for prod EAS).
- `e2e/owner.test.js` references `ownerSettings.scrollView` for whileElement
  scrolling — add that testID to the Settings ScrollView if not present.

Once the Detox-instrumented build links the framework and boots a
release-style binary (no dev launcher), `owner.test.js` runs the same walk as
the Maestro flow, in CI, on every push.

## Extending coverage
The owner screens are instrumented. Repeat the testID pass for the worker /
client / sub screens, then add per-screen specs that assert the seeded numbers.

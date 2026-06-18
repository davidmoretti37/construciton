/**
 * Owner smoke walk — Detox e2e, driven entirely by testID.
 * Run (once the Detox-instrumented iOS build exists — see e2e/README.md):
 *   detox build -c ios.sim.debug && detox test -c ios.sim.debug
 *
 * Mirrors e2e/maestro/owner-walk.yaml. The same testIDs work in both runners.
 */
/* eslint-disable no-undef */

describe('Owner — smoke walk', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  it('dashboard renders the financial tiles', async () => {
    await element(by.id('ownerTab.Home')).tap();
    await waitFor(element(by.id('ownerDashboard.welcomeText')))
      .toBeVisible()
      .withTimeout(30000);
    await expect(element(by.id('ownerDashboard.revenueAmount'))).toBeVisible();
    await expect(element(by.id('ownerDashboard.overheadAmount'))).toBeVisible();
    await expect(element(by.id('ownerDashboard.grossProfitAmount'))).toBeVisible();
  });

  it('navigates every bottom tab', async () => {
    await element(by.id('ownerTab.Projects')).tap();
    await expect(element(by.id('work.title'))).toBeVisible();
    await element(by.id('ownerTab.Workers')).tap();
    await element(by.id('ownerTab.Settings')).tap();
    await expect(element(by.id('ownerSettings.headerTitle'))).toBeVisible();
    await element(by.id('ownerTab.Home')).tap();
    await expect(element(by.id('ownerDashboard.welcomeText'))).toBeVisible();
  });

  it('opens Subscription from Settings', async () => {
    await element(by.id('ownerTab.Settings')).tap();
    await waitFor(element(by.id('ownerSettings.subscriptionItem')))
      .toBeVisible()
      .whileElement(by.id('ownerSettings.scrollView'))
      .scroll(400, 'down');
    await element(by.id('ownerSettings.subscriptionItem')).tap();
  });
});

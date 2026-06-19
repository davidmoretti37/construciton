/**
 * Owner smoke walk — Detox e2e, driven entirely by testID.
 * Run (Release build — see e2e/README.md):
 *   npx detox build -c ios.sim.release && npx detox test -c ios.sim.release
 *
 * Mirrors e2e/maestro/owner-walk.yaml. The same testIDs work in both runners.
 * loginAsOwner() cold-launches and signs in the seeded QA owner.
 */
/* eslint-disable no-undef */

const { loginAsOwner } = require('./helpers');

describe('Owner — smoke walk', () => {
  beforeAll(async () => {
    await loginAsOwner();
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
    // Start the swipe from the vertical middle (a guaranteed-visible point) —
    // the default bottom-edge start point is clipped under the home indicator.
    await waitFor(element(by.id('ownerSettings.subscriptionItem')))
      .toBeVisible()
      .whileElement(by.id('ownerSettings.scrollView'))
      .scroll(350, 'down', NaN, 0.5);
    await element(by.id('ownerSettings.subscriptionItem')).tap();
  });
});

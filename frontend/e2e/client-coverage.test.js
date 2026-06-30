/**
 * Client portal coverage — visits every reachable client screen as the seeded
 * QA client (Mike Johnson) and asserts it renders real content, screenshotting
 * each for visual review. Data-driven from client-screens.map.js.
 *
 * Uses .atIndex(0) on every assert: client content testIDs (invoiceNumber,
 * documentTitle, etc.) repeat once per row, so a bare matcher would resolve to
 * multiple elements.
 */
/* eslint-disable no-undef */

const { loginAsClient, runNavSteps, tapIfVisible } = require('./helpers');
const SCREENS = require('./client-screens.map');

// Back buttons for every detail screen the suite can leave us on. beforeEach
// pops whichever one is open, then returns to the Home tab.
const DETAIL_BACK_BUTTONS = [
  'clientInvoices.backButton', 'clientMessages.backButton',
  'clientDocuments.backButton', 'clientPhotos.backButton',
  'clientAISummaries.backButton', 'clientSelections.backButton',
  'clientChangeOrderDetail.backButton', 'clientEstimateDetail.backButton',
  'clientProjectDetail.backButton',
];

describe('Client — screen coverage', () => {
  beforeAll(async () => {
    await loginAsClient();
  });

  beforeEach(async () => {
    // CRITICAL: synchronization was disabled in loginAsClient and MUST stay off —
    // ClientDashboard runs an infinite native-driver pulse that Detox tracks as a
    // recurring "busy" timer, so any relaunch/reloadReactNative (which re-enable
    // sync) hangs. So we reset to Home purely by NAVIGATION (all polling, sync
    // stays off): if the tab bar isn't showing, we're on a pushed detail screen —
    // pop it via its back button — then select the Home tab.
    let onTabs = false;
    try {
      await waitFor(element(by.id('clientTab.Home'))).toBeVisible().withTimeout(1500);
      onTabs = true;
    } catch (e) {}
    if (!onTabs) {
      for (const id of DETAIL_BACK_BUTTONS) {
        if (await tapIfVisible(by.id(id), 600)) break; // only one detail screen is open
      }
    }
    await tapIfVisible(by.id('clientTab.Home'), 4000);
    await waitFor(element(by.id('clientTab.Home'))).toBeVisible().withTimeout(15000);
  });

  SCREENS.forEach((s) => {
    it(`${s.screenKey} reachable + renders`, async () => {
      await runNavSteps(s.navSteps);
      const asserts = (s.assertTestIds || []).slice(0, 3);
      for (const id of asserts) {
        await waitFor(element(by.id(id)).atIndex(0)).toBeVisible().withTimeout(15000);
      }
      try { await device.takeScreenshot(`tour-client-${s.screenKey}`); } catch (e) {}
    });
  });
});

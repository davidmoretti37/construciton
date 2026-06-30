/**
 * Worker portal coverage — visits every reachable worker screen as the seeded
 * QA worker and asserts it renders, screenshotting each for visual review.
 * Mirrors owner-coverage.test.js (data-driven from worker-screens.map.js).
 */
/* eslint-disable no-undef */

const { loginAsWorker, runNavSteps, tapIfVisible } = require('./helpers');
const SCREENS = require('./worker-screens.map');

const LAUNCH_PERMS = {
  microphone: 'YES', camera: 'YES', photos: 'YES', location: 'always', notifications: 'YES',
};

describe('Worker — screen coverage', () => {
  beforeAll(async () => {
    await loginAsWorker();
  });

  beforeEach(async () => {
    // Relaunch resets to the worker TimeClock tab (session persists).
    await device.launchApp({ newInstance: true, permissions: LAUNCH_PERMS });
    await waitFor(element(by.id('workerTab.TimeClock'))).toBeVisible().withTimeout(30000);
  });

  SCREENS.forEach((s) => {
    it(`${s.screenKey} reachable + renders`, async () => {
      await runNavSteps(s.navSteps);
      const asserts = (s.assertTestIds || []).slice(0, 3);
      for (const id of asserts) {
        await waitFor(element(by.id(id))).toBeVisible().withTimeout(15000);
      }
      try { await device.takeScreenshot(`tour-worker-${s.screenKey}`); } catch (e) {}
      for (const id of s.safeTapTestIds || []) {
        await tapIfVisible(by.id(id), 1500);
      }
    });
  });
});

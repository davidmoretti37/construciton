/**
 * Owner EVERY-BUTTON QA — for each reachable owner screen, taps every
 * stay-on-screen safe control (toggles, tabs, section headers, pickers, modal
 * opens) and screenshots the result, so the parallel review can judge whether
 * each button actually does something (catches dead/broken buttons).
 *
 * Robust + fast: nav to the screen once, then tap each button best-effort
 * (tapIfVisible fails fast if a modal/nav covered it) and screenshot. The
 * beforeEach relaunch resets to the tabs between screens, so a modal opened by
 * one screen never bleeds into the next. No mid-screen relaunch => can't hang.
 */
/* eslint-disable no-undef */

const { loginAsOwner, runNavSteps, tapIfVisible } = require('./helpers');
const SCREENS = require('./owner-screens.map');
const BUTTONS = require('./owner-buttons.map');

const LAUNCH_PERMS = {
  microphone: 'YES', camera: 'YES', photos: 'YES', location: 'always', notifications: 'YES',
};

describe('Owner — every button', () => {
  beforeAll(async () => {
    await loginAsOwner();
  });

  beforeEach(async () => {
    await device.launchApp({ newInstance: true, permissions: LAUNCH_PERMS });
    await waitFor(element(by.id('ownerTab.Home'))).toBeVisible().withTimeout(30000);
  });

  const screens = SCREENS.filter((s) => BUTTONS[s.screenKey] && BUTTONS[s.screenKey].length);

  screens.forEach((s) => {
    const buttons = BUTTONS[s.screenKey];
    it(`${s.screenKey}: ${buttons.length} buttons`, async () => {
      try {
        await runNavSteps(s.navSteps);
      } catch (e) {
        // If nav fails, screenshot the failure and bail — review will catch it.
        try { await device.takeScreenshot(`btn__${s.screenKey}__NAV-FAILED`); } catch (e2) {}
        return;
      }
      for (const b of buttons) {
        await tapIfVisible(by.id(b.id), 2000);
        try { await device.takeScreenshot(`btn__${s.screenKey}__${b.id}`); } catch (e) {}
      }
    });
  });
});

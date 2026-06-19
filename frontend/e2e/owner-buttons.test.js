/**
 * Owner EVERY-BUTTON QA — for each reachable owner screen, taps every
 * stay-on-screen safe control (toggles, tabs, section headers, pickers, modal
 * opens) and screenshots the result, so the parallel review can judge whether
 * each button actually does something (catches dead/broken buttons).
 *
 * If a button navigates away / leaves the screen, we relaunch + re-nav before
 * the next one, so every button is tapped from a correct state.
 */
/* eslint-disable no-undef */

const { loginAsOwner, runNavSteps, tapIfVisible } = require('./helpers');
const SCREENS = require('./owner-screens.map');
const BUTTONS = require('./owner-buttons.map');

const LAUNCH_PERMS = {
  microphone: 'YES', camera: 'YES', photos: 'YES', location: 'always', notifications: 'YES',
};

async function isVisible(id, timeout = 1200) {
  try { await waitFor(element(by.id(id))).toBeVisible().withTimeout(timeout); return true; }
  catch (e) { return false; }
}

async function relaunch() {
  await device.launchApp({ newInstance: true, permissions: LAUNCH_PERMS });
  await waitFor(element(by.id('ownerTab.Home'))).toBeVisible().withTimeout(30000);
}

describe('Owner — every button', () => {
  beforeAll(async () => {
    await loginAsOwner();
  });

  beforeEach(async () => {
    await relaunch();
  });

  const screens = SCREENS.filter((s) => BUTTONS[s.screenKey] && BUTTONS[s.screenKey].length);

  screens.forEach((s) => {
    const anchor = (s.assertTestIds || [])[0];
    const buttons = BUTTONS[s.screenKey];
    it(`${s.screenKey}: ${buttons.length} buttons`, async () => {
      await runNavSteps(s.navSteps);
      for (const b of buttons) {
        // Make sure we're still on this screen (a prior button may have left it).
        if (anchor && !(await isVisible(anchor, 1200))) {
          await relaunch();
          await runNavSteps(s.navSteps);
        }
        await tapIfVisible(by.id(b.id), 2500);
        await device.takeScreenshot(`btn__${s.screenKey}__${b.id}`);
      }
    });
  });
});

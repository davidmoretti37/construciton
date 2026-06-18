/**
 * Owner FULL coverage — visits every reachable owner screen and asserts it
 * renders with the seeded data. Data-driven from owner-screens.map.js (one
 * entry per screen: nav steps from the tabs + assertable testIDs).
 *
 * Reset strategy: beforeAll logs in once (full funnel); beforeEach relaunches
 * with newInstance — the Supabase session persists in AsyncStorage, so the app
 * comes back up straight on the owner tabs (no funnel, no walkthrough), giving
 * each screen test a clean, deterministic starting point.
 */
/* eslint-disable no-undef */

const { loginAsOwner, runNavSteps, tapIfVisible } = require('./helpers');
const SCREENS = require('./owner-screens.map');

const LAUNCH_PERMS = {
  microphone: 'YES',
  camera: 'YES',
  photos: 'YES',
  location: 'always',
  notifications: 'YES',
};

describe('Owner — full screen coverage', () => {
  beforeAll(async () => {
    await loginAsOwner();
  });

  beforeEach(async () => {
    // Relaunch to reset navigation to the owner tabs (session persists).
    await device.launchApp({ newInstance: true, permissions: LAUNCH_PERMS });
    await waitFor(element(by.id('ownerTab.Home'))).toBeVisible().withTimeout(30000);
  });

  const reachable = SCREENS.filter((s) => s.reachableFromOwnerTabs && s.navSteps.length > 0);

  reachable.forEach((s) => {
    const asserts = (s.assertTestIds || []).slice(0, 4);
    it(`${s.screenKey} reachable + renders`, async () => {
      await runNavSteps(s.navSteps);
      if (asserts.length === 0) {
        throw new Error(`No assertTestIds for ${s.screenKey} — cannot verify it rendered`);
      }
      for (const id of asserts) {
        await waitFor(element(by.id(id))).toBeVisible().withTimeout(15000);
      }

      // Best-effort: exercise the screen's safe (non-destructive, in-screen)
      // buttons. The render assertion above is the hard check; these taps are
      // bonus coverage ("the buttons work / don't crash") and never fail the
      // test — a missing/off-screen control is fine.
      for (const id of s.safeTapTestIds || []) {
        await tapIfVisible(by.id(id), 1500);
      }
    });
  });
});

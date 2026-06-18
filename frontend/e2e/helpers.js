/**
 * Shared Detox helpers — driven entirely by testID.
 *
 * A fresh Release install boots logged-out. Depending on AsyncStorage it lands
 * on either the onboarding carousel or the Login screen, and after login a
 * first-time SpotlightWalkthrough overlay can appear. loginAsOwner() handles
 * every one of those gates idempotently so specs can assume the owner tabs.
 *
 * The QA owner account is pre-seeded (language=en, is_onboarded, role=owner,
 * active 'pro' subscription) so no LanguageSelection screen appears.
 */
/* eslint-disable no-undef */

const OWNER_EMAIL = 'claude.qa.user.1781642646@sylkqa.test';
const OWNER_PASSWORD = 'SylkQA-test-2026!';

/** Tap an element only if it shows up within `timeout` ms; never throws. */
async function tapIfVisible(matcher, timeout = 2500) {
  try {
    await waitFor(element(matcher)).toBeVisible().withTimeout(timeout);
    await element(matcher).tap();
    return true;
  } catch (e) {
    return false;
  }
}

/** Returns true once the Login screen's email field is on screen. */
async function isOnLogin(timeout = 4000) {
  try {
    await waitFor(element(by.id('login.emailInput'))).toBeVisible().withTimeout(timeout);
    return true;
  } catch (e) {
    return false;
  }
}

/** Navigate the logged-out funnel (onboarding carousel -> signup) to Login. */
async function reachLoginScreen() {
  if (await isOnLogin(4000)) return;

  // Onboarding carousel: advance one slide so "Skip" appears, then skip to Signup.
  try {
    await element(by.id('onboarding.slides')).swipe('left', 'fast');
  } catch (e) {}
  await tapIfVisible(by.id('onboarding.skipButton'), 6000);

  // Signup screen: follow the "Sign In" link to Login.
  await tapIfVisible(by.id('signup.signInLink'), 8000);

  await waitFor(element(by.id('login.emailInput'))).toBeVisible().withTimeout(12000);
}

/** Full cold-launch -> owner dashboard. Use in beforeAll. */
async function loginAsOwner() {
  // Pre-grant permissions so the native mic/camera/photos system dialogs (which
  // the Chat tab triggers on mount and which no testID can dismiss) never cover
  // the UI. This is the root fix for the post-login flakiness.
  await device.launchApp({
    newInstance: true,
    permissions: {
      microphone: 'YES',
      camera: 'YES',
      photos: 'YES',
      location: 'always',
      notifications: 'YES',
    },
  });
  console.log('[e2e] launched; reaching login screen…');
  await reachLoginScreen();
  console.log('[e2e] on login screen; filling credentials');

  await element(by.id('login.emailInput')).replaceText(OWNER_EMAIL);
  await element(by.id('login.passwordInput')).replaceText(OWNER_PASSWORD);
  // Dismiss keyboard so the submit button is hittable, then sign in.
  try { await element(by.id('login.passwordInput')).tapReturnKey(); } catch (e) {}
  await element(by.id('login.signInButton')).tap();
  console.log('[e2e] tapped sign in; waiting for owner tabs…');

  // Login round-trips to Supabase, then the owner tab bar mounts. The
  // first-time SpotlightWalkthrough can render as a Modal overlay on top, so
  // assert the tab *exists* (login completed) rather than is visible — the
  // overlay would cover it.
  try {
    await waitFor(element(by.id('ownerTab.Home'))).toExist().withTimeout(60000);
  } catch (e) {
    await device.takeScreenshot('login-stuck');
    const stillOnLogin = await isOnLogin(1500);
    throw new Error(
      `Owner tabs never mounted after sign-in (stillOnLogin=${stillOnLogin}). ` +
        `Check QA credentials / post-login routing. Original: ${e.message}`
    );
  }
  console.log('[e2e] owner tabs mounted; clearing overlays');

  // The first-time SpotlightWalkthrough mounts as a Modal over the tabs after a
  // variable delay (it measures element layout first), so a single dismiss can
  // race it. Loop: dismiss the overlay whenever its Skip button shows and check
  // whether the Home tab has become hittable, until it is.
  await dismissOverlaysUntilHomeVisible();
}

/** Retry dismissing the walkthrough overlay until ownerTab.Home is hittable. */
async function dismissOverlaysUntilHomeVisible() {
  for (let i = 0; i < 8; i++) {
    await tapIfVisible(by.id('walkthrough.skipButton'), 3000);
    try {
      await waitFor(element(by.id('ownerTab.Home'))).toBeVisible().withTimeout(3000);
      console.log('[e2e] Home tab hittable');
      return;
    } catch (e) {}
  }
  await device.takeScreenshot('home-not-visible');
  // Final attempt — throw with context if still covered.
  await waitFor(element(by.id('ownerTab.Home'))).toBeVisible().withTimeout(8000);
}

/**
 * Run an ordered list of nav steps ({action:'tap'|'scrollTo', id, scrollViewId})
 * to reach a screen from the owner tabs. Used by the data-driven coverage spec.
 */
async function runNavSteps(steps) {
  for (const step of steps) {
    if (step.action === 'scrollTo' && step.scrollViewId) {
      await waitFor(element(by.id(step.id)))
        .toBeVisible()
        .whileElement(by.id(step.scrollViewId))
        .scroll(320, 'down', NaN, 0.5);
      await element(by.id(step.id)).tap();
    } else {
      await waitFor(element(by.id(step.id))).toBeVisible().withTimeout(15000);
      await element(by.id(step.id)).tap();
    }
  }
}

/** Return to a known root by tapping a bottom tab; the tab bar is hidden on
 * pushed screens, so callers should go back first. Best-effort. */
async function resetToTab(tabId = 'ownerTab.Home') {
  await tapIfVisible(by.id(tabId), 4000);
}

module.exports = {
  loginAsOwner,
  reachLoginScreen,
  tapIfVisible,
  runNavSteps,
  resetToTab,
  OWNER_EMAIL,
  OWNER_PASSWORD,
};

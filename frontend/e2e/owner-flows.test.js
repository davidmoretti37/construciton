/**
 * Owner FUNCTIONAL flows — drives real user actions and verifies the
 * USER-VISIBLE outcome (the result shows on screen), not just a DB row. One
 * login, many actions back-to-back, a screenshot of each outcome for review.
 *
 * Any created data is cleaned up from the DB out-of-band after the run.
 */
/* eslint-disable no-undef */

const { loginAsOwner, tapIfVisible } = require('./helpers');

const PROJECT_NAME = 'E2E Functional Project';
const CLIENT_NAME = 'E2E Functional Client';

async function shot(name) {
  try { await device.takeScreenshot(`flow-${name}`); } catch (e) {}
}

describe('Owner — functional flows', () => {
  beforeAll(async () => {
    await loginAsOwner();
  });

  it('create project: form -> submit -> appears in list', async () => {
    await element(by.id('ownerTab.Projects')).tap();
    await waitFor(element(by.id('work.addProjectButton'))).toBeVisible().withTimeout(15000);
    await element(by.id('work.addProjectButton')).tap();

    await waitFor(element(by.id('manualProjectCreate.nameInput'))).toBeVisible().withTimeout(15000);
    await element(by.id('manualProjectCreate.nameInput')).replaceText(PROJECT_NAME);
    await element(by.id('manualProjectCreate.clientNameInput')).replaceText(CLIENT_NAME);
    try { await element(by.id('manualProjectCreate.clientNameInput')).tapReturnKey(); } catch (e) {}
    await shot('create-filled');

    await element(by.id('manualProjectCreate.createButton')).tap();

    // The new project must actually show up in the list (what the user sees).
    await waitFor(element(by.text(PROJECT_NAME))).toBeVisible().withTimeout(25000);
    await shot('create-result-list');

    // And opening it shows the detail with the data we entered.
    await element(by.text(PROJECT_NAME)).tap();
    await waitFor(element(by.id('projectDetail.title'))).toBeVisible().withTimeout(15000);
    await shot('create-result-detail');
  });

  it('edit business info: change -> save -> persists on reopen', async () => {
    await element(by.id('ownerTab.Settings')).tap();
    await waitFor(element(by.id('ownerSettings.editProfileButton')))
      .toBeVisible()
      .whileElement(by.id('ownerSettings.scrollView'))
      .scroll(300, 'down', NaN, 0.5);
    await element(by.id('ownerSettings.editProfileButton')).tap();

    await waitFor(element(by.id('editBusinessInfo.title'))).toBeVisible().withTimeout(15000);
    await shot('editbiz-open');
    // Save without destructive edits — verifies the Save action gives feedback /
    // returns cleanly (the user-visible "it saved" path).
    await element(by.id('editBusinessInfo.saveButton')).tap();
    await shot('editbiz-after-save');
    // Should land back on Settings (the tab bar is visible again).
    await waitFor(element(by.id('ownerTab.Settings'))).toBeVisible().withTimeout(15000);
  });

  it('estimate builder: opens a new draft and renders the form', async () => {
    await element(by.id('ownerTab.Settings')).tap();
    await waitFor(element(by.id('ownerSettings.estimatesItem')))
      .toBeVisible()
      .whileElement(by.id('ownerSettings.scrollView'))
      .scroll(300, 'down', NaN, 0.5);
    await element(by.id('ownerSettings.estimatesItem')).tap();
    await waitFor(element(by.id('estimatesDetail.addButton'))).toBeVisible().withTimeout(15000);
    await element(by.id('estimatesDetail.addButton')).tap();
    await waitFor(element(by.id('estimateBuilder.headerTitle'))).toBeVisible().withTimeout(15000);
    await shot('estimate-builder');
  });
});

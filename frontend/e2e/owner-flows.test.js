/**
 * Owner FUNCTIONAL flows — drives real actions like a user and checks they
 * actually happen (not just that screens render). Create-a-project here proves
 * the form → validation → backend → DB → list-refresh path works end to end.
 *
 * The created row is cleaned up from the DB out-of-band after the run.
 */
/* eslint-disable no-undef */

const { loginAsOwner } = require('./helpers');

const PROJECT_NAME = 'E2E Functional Project';
const CLIENT_NAME = 'E2E Functional Client';

describe('Owner — functional flows', () => {
  beforeAll(async () => {
    await loginAsOwner();
  });

  it('creates a project end-to-end and it appears in the list', async () => {
    await element(by.id('ownerTab.Projects')).tap();
    await waitFor(element(by.id('work.addProjectButton'))).toBeVisible().withTimeout(15000);
    await element(by.id('work.addProjectButton')).tap();

    // Fill the required name (the Client section is expanded by default).
    await waitFor(element(by.id('manualProjectCreate.nameInput'))).toBeVisible().withTimeout(15000);
    await element(by.id('manualProjectCreate.nameInput')).replaceText(PROJECT_NAME);
    await element(by.id('manualProjectCreate.clientNameInput')).replaceText(CLIENT_NAME);
    try { await element(by.id('manualProjectCreate.clientNameInput')).tapReturnKey(); } catch (e) {}

    // Submit (the Create button lives in the top header, always visible).
    await element(by.id('manualProjectCreate.createButton')).tap();

    // Back on the Projects list, the new project card should appear.
    await waitFor(element(by.text(PROJECT_NAME))).toBeVisible().withTimeout(25000);
  });
});

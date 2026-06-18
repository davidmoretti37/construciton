/**
 * Owner deep walk — opens detail screens and asserts they render, driven by
 * testID. Builds on the smoke walk (owner.test.js); both share helpers.js.
 *
 * Stable navigation paths only (no customizable dashboard widgets):
 *   - Projects tab -> first project card -> ProjectDetail
 *   - Dashboard company card -> CompanyOverhead
 */
/* eslint-disable no-undef */

const { loginAsOwner } = require('./helpers');

describe('Owner — deep walk', () => {
  beforeAll(async () => {
    await loginAsOwner();
  });

  it('opens a project from the Projects tab', async () => {
    await element(by.id('ownerTab.Projects')).tap();
    await waitFor(element(by.id('ownerProjects.firstRow')))
      .toBeVisible()
      .withTimeout(20000);
    await element(by.id('ownerProjects.firstRow')).tap();

    // ProjectDetail mounted.
    await waitFor(element(by.id('projectDetail.title')))
      .toBeVisible()
      .withTimeout(20000);

    // Back to the project list.
    await element(by.id('projectDetail.headerBackButton')).tap();
    await waitFor(element(by.id('ownerProjects.firstRow')))
      .toBeVisible()
      .withTimeout(20000);
  });

  it('opens Company Overhead from the dashboard', async () => {
    await element(by.id('ownerTab.Home')).tap();
    await waitFor(element(by.id('ownerDashboard.companyCard')))
      .toBeVisible()
      .withTimeout(20000);
    await element(by.id('ownerDashboard.companyCard')).tap();

    // CompanyOverhead screen shows the monthly/annual overhead totals.
    await waitFor(element(by.id('companyOverhead.monthlyTotal')))
      .toBeVisible()
      .withTimeout(20000);

    await element(by.id('companyOverhead.backButton')).tap();
    await waitFor(element(by.id('ownerTab.Home'))).toBeVisible().withTimeout(20000);
  });
});

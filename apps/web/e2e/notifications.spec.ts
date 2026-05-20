import { test, expect } from './fixtures/base';
import { NotificationsPage } from './pages';

/**
 * E2E coverage for the Notifications area (`/notifications`).
 *
 * Scaffolded by `e2e/scripts/scaffold-spec.ts`. Each test starts as a stub
 * with the global fixtures pre-wired — fill in the TODOs with the actual
 * assertions and request mocks the area needs.
 *
 * Patterns to copy from:
 *   - apps/web/e2e/route-smokes.spec.ts        (route smoke)
 *   - apps/web/e2e/workshop-actions.spec.ts    (data-mocking + assertions)
 *   - apps/web/e2e/fixtures-smoke.spec.ts      (fixture wiring)
 */

test('notifications loads without errors', async ({ adminPage, apiMocks }) => {
  // The `pageErrors` auto-fixture already fails the test on any
  // non-allowlisted console.error / pageerror — there's nothing extra to
  // wire up beyond hitting the route.
  void apiMocks; // available for resource mocks if the page needs data

    const notificationsPage = new NotificationsPage(adminPage);
    await notificationsPage.goto();
    await notificationsPage.expectLoaded();

  // TODO: assert the page heading or another stable DOM anchor is visible.
  await expect(
    adminPage.getByRole('heading', { name: new RegExp('Notifications', 'i') }).first(),
  ).toBeVisible();
});

test('notifications primary CTA opens modal or navigates', async ({ adminPage, apiMocks }) => {
  void apiMocks;
    const notificationsPage = new NotificationsPage(adminPage);
    await notificationsPage.goto();
    await notificationsPage.expectLoaded();

    // TODO: identify the primary CTA on this page and click it. Examples:
    //   await notificationsPage.openNew();
    //   await notificationsPage.clickButton(/create|new/i);
    // Then assert either a dialog appears OR the URL changes.
    // await expect(notificationsPage.dialog()).toBeVisible();
    // OR
    // await expect(adminPage).toHaveURL(/.../);
});

test('notifications list renders mocked data', async ({ adminPage, apiMocks }) => {
  // TODO: replace this stub with the real resource mock(s) the page reads.
  // Example with the api-mocks factory:
  //   await apiMocks.mockDatasetsList(adminPage, [
  //     apiMocks.makeDataset({ id: 'dataset-1', name: 'Alpha' }),
  //     apiMocks.makeDataset({ id: 'dataset-2', name: 'Beta' }),
  //   ]);
  void apiMocks;

    const notificationsPage = new NotificationsPage(adminPage);
    await notificationsPage.goto();
    await notificationsPage.expectLoaded();

    // TODO: assert each mocked row is rendered. With a Page Object that
    // extends ListPagePO you can do:
    //   await expect(notificationsPage.row(/Alpha/)).toBeVisible();
    //   await expect(notificationsPage.row(/Beta/)).toBeVisible();
});

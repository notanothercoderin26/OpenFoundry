import { test, expect } from './fixtures/base';
import { FavoritesPage } from './pages';

/**
 * E2E coverage for the Favorites area (`/favorites`).
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

test('favorites loads without errors', async ({ adminPage, apiMocks }) => {
  // The `pageErrors` auto-fixture already fails the test on any
  // non-allowlisted console.error / pageerror — there's nothing extra to
  // wire up beyond hitting the route.
  void apiMocks; // available for resource mocks if the page needs data

    const favoritesPage = new FavoritesPage(adminPage);
    await favoritesPage.goto();
    await favoritesPage.expectLoaded();

  // TODO: assert the page heading or another stable DOM anchor is visible.
  await expect(
    adminPage.getByRole('heading', { name: new RegExp('Favorites', 'i') }).first(),
  ).toBeVisible();
});

test('favorites primary CTA opens modal or navigates', async ({ adminPage, apiMocks }) => {
  void apiMocks;
    const favoritesPage = new FavoritesPage(adminPage);
    await favoritesPage.goto();
    await favoritesPage.expectLoaded();

    // TODO: identify the primary CTA on this page and click it. Examples:
    //   await favoritesPage.openNew();
    //   await favoritesPage.clickButton(/create|new/i);
    // Then assert either a dialog appears OR the URL changes.
    // await expect(favoritesPage.dialog()).toBeVisible();
    // OR
    // await expect(adminPage).toHaveURL(/.../);
});

test('favorites list renders mocked data', async ({ adminPage, apiMocks }) => {
  // TODO: replace this stub with the real resource mock(s) the page reads.
  // Example with the api-mocks factory:
  //   await apiMocks.mockDatasetsList(adminPage, [
  //     apiMocks.makeDataset({ id: 'dataset-1', name: 'Alpha' }),
  //     apiMocks.makeDataset({ id: 'dataset-2', name: 'Beta' }),
  //   ]);
  void apiMocks;

    const favoritesPage = new FavoritesPage(adminPage);
    await favoritesPage.goto();
    await favoritesPage.expectLoaded();

    // TODO: assert each mocked row is rendered. With a Page Object that
    // extends ListPagePO you can do:
    //   await expect(favoritesPage.row(/Alpha/)).toBeVisible();
    //   await expect(favoritesPage.row(/Beta/)).toBeVisible();
});

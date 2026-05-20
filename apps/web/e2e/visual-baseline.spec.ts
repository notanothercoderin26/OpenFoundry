import { test } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { expectScreenshot, prepareForVisual } from './helpers/visual';
import { LoginPage } from './pages/LoginPage';

/**
 * Visual regression baselines. Snapshots are stored under
 * `e2e/__snapshots__/` and are pixel-compared on every run.
 *
 * Generating / updating snapshots:
 *   pnpm --filter @open-foundry/web exec playwright test --update-snapshots
 *
 * Only stable, fully-static surfaces belong here. Workshop runtimes, charts,
 * graphs and editor canvases produce per-run pixel noise and should NOT be
 * snapshotted — use behavioral assertions for those instead.
 */

test.describe('visual baselines', () => {
  test('login page', async ({ page }) => {
    await mockAuth(page, { authenticated: false });

    const login = new LoginPage(page);
    await login.goto();
    await login.expectVisible();

    await prepareForVisual(page);
    await expectScreenshot(page, 'login');
  });
});

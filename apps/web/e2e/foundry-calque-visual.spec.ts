import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Visual + a11y regression suite for the Foundry calque.
 *
 * Skipped by default — the calque relies on a populated ontology backend
 * that the standard e2e fixtures don't seed yet. To run locally:
 *
 *   PLAYWRIGHT_FOUNDRY_CALQUE=1 pnpm --filter @open-foundry/web test:e2e \
 *     --grep "foundry calque"
 *
 * Once the seed fixtures cover the ontology manager surface, drop the
 * conditional skip and screenshot baselines will pin the layout.
 */
const RUN = process.env.PLAYWRIGHT_FOUNDRY_CALQUE === '1';

test.describe('foundry calque', () => {
  test.skip(!RUN, 'set PLAYWRIGHT_FOUNDRY_CALQUE=1 to enable');

  test('components gallery renders all primitives without a11y violations', async ({
    page,
  }) => {
    await mockAuth(page, { authenticated: true });
    await page.goto('/dev/components');
    await expect(page.getByRole('heading', { name: 'Components gallery' })).toBeVisible();
    await expect(page).toHaveScreenshot('components-gallery.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
    await expectNoA11yViolations(page);
  });

  test('ontology manager discover view', async ({ page }) => {
    await mockAuth(page, { authenticated: true });
    await page.goto('/ontology-manager');
    await expect(
      page.getByRole('heading', { name: 'Ontology Management' }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot('discover.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test('object type overview', async ({ page }) => {
    await mockAuth(page, { authenticated: true });
    /* Pick the first object type from the seed fixtures. The e2e harness is
     * expected to expose at least one stable id; replace with a real one. */
    await page.goto('/ontology/seed-object-type-id');
    await expect(
      page.getByRole('heading', { level: 1 }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot('object-type-overview.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test('property editor', async ({ page }) => {
    await mockAuth(page, { authenticated: true });
    await page.goto('/ontology/seed-object-type-id?tab=properties');
    await expect(
      page.getByRole('heading', { name: 'Properties' }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot('property-editor.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});

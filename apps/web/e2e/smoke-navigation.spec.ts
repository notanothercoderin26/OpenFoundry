import { test, expect } from './fixtures/base';

/**
 * Top-level navigation smoke. Walks the primary sidebar items as a real user
 * would, asserting each route resolves without throwing and renders the
 * expected URL. This is the "nothing is on fire" gate — keep it fast and
 * resilient by mocking only what the AppShell hits on bootstrap.
 */

const NAV_ITEMS: ReadonlyArray<{ label: string; path: string }> = [
  { label: 'Home', path: '/' },
  { label: 'Search', path: '/search' },
  { label: 'Notifications', path: '/notifications' },
  { label: 'Favorites', path: '/favorites' },
  { label: 'Recent', path: '/recent' },
  { label: 'Files', path: '/projects' },
  { label: 'AI Assist', path: '/ai' },
  { label: 'Account', path: '/settings' },
];

test.describe('navigation smoke', () => {
  test('every primary sidebar entry navigates without error', async ({ authedPage: page }) => {
    // Catch console errors from the routes themselves — a silent React error
    // boundary firing should fail the test.
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });

    // Fallback for any list endpoint the AppShell or sidebar hits eagerly.
    // Specs that exercise a page in depth still install their own routes.
    await page.route(/\/api\/v1\/(notifications|favorites|projects|recent|search)/, async (route) => {
      await route.fulfill({ json: { data: [], next_cursor: null } });
    });

    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);

    for (const item of NAV_ITEMS) {
      const link = page.getByRole('link', { name: item.label }).first();
      await expect(link, `nav link missing: ${item.label}`).toBeVisible();
      await link.click();
      await expect(page, `route did not change for ${item.label}`).toHaveURL(
        new RegExp(item.path === '/' ? '/$' : `${item.path}(/|$|\\?)`),
      );
    }

    expect(errors, errors.join('\n')).toEqual([]);
  });
});

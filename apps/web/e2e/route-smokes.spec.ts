import { test, expect } from './fixtures/base';

/**
 * Horizontal coverage: walk each top-level route area and assert it loads
 * without producing console errors or unhandled rejections.
 *
 * This is the "did the lazy chunk explode?" gate. Specific behavior lives
 * in per-area specs — these tests only catch broken routes, broken
 * imports, and broken error boundaries.
 *
 * To keep the suite fast and deterministic, we route-mock every
 * `/api/v1/*` GET to an empty paginated envelope. Per-area specs can
 * still install richer mocks above this fallback because Playwright
 * matches routes in registration order.
 */

const AREAS: ReadonlyArray<{ name: string; path: string }> = [
  { name: 'Home', path: '/' },
  { name: 'Search', path: '/search' },
  { name: 'Notifications', path: '/notifications' },
  { name: 'Favorites', path: '/favorites' },
  { name: 'Recent', path: '/recent' },
  { name: 'Projects', path: '/projects' },
  { name: 'Datasets', path: '/datasets' },
  { name: 'Dashboards', path: '/dashboards' },
  { name: 'Pipelines', path: '/pipelines' },
  { name: 'Ontologies', path: '/ontologies' },
  { name: 'Action types', path: '/action-types' },
  { name: 'Functions', path: '/functions' },
  { name: 'Workflows', path: '/workflows' },
  { name: 'Lineage', path: '/lineage' },
  { name: 'AI Assist', path: '/ai' },
  { name: 'Settings', path: '/settings' },
];

for (const area of AREAS) {
  test(`route smoke — ${area.name} (${area.path}) loads without error`, async ({
    authedPage: page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });

    // Broad fallback for any list endpoint a route hits during bootstrap.
    await page.route(/\/api\/v1\/.*/, async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({ json: { data: [], next_cursor: null, total: 0 } });
      } else {
        await route.fulfill({ status: 204, body: '' });
      }
    });

    await page.goto(area.path);
    // Lazy chunks need a beat to mount. Wait for the AppShell scaffold.
    await expect(
      page.getByRole('navigation', { name: 'Primary navigation' }),
    ).toBeVisible({ timeout: 15_000 });

    // Filter out noisy errors we don't own. Tighten this list as we fix
    // root causes instead of suppressing.
    const filtered = errors.filter(
      (e) =>
        !e.includes('Failed to load resource') &&
        !e.includes('net::ERR_ABORTED') &&
        !e.includes('AbortError'),
    );
    expect(filtered, filtered.join('\n')).toEqual([]);
  });
}

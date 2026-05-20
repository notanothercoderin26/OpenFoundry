import { test, expect } from './fixtures/base';

/**
 * Sanity check for the global fixtures (Task 0.3).
 *
 * Verifies the fixture wiring without booting the full React app — that
 * would require per-endpoint mocks the spec doesn't care about. Specs
 * that exercise real pages should install resource-specific mocks on
 * top of the catch-all.
 *
 * What's checked:
 * - `adminPage` / `viewerPage` boot and identity is the expected override.
 * - `apiMocks` exposes the factory and the catch-all returns an empty
 *   envelope for unmocked GETs.
 * - `pageErrors` auto-fixture attaches listeners and the post-test
 *   assertion respects a custom `errorAllowlist`.
 */

type IdentityBody = { roles: string[]; permissions: string[] };

async function fetchJsonFromPage<T>(
  page: import('@playwright/test').Page,
  url: string,
): Promise<{ status: number; body: T }> {
  return await page.evaluate(async (u) => {
    const res = await fetch(u);
    return { status: res.status, body: (await res.json()) as unknown };
  }, url) as { status: number; body: T };
}

test('adminPage boots authed and apiMocks installs the catch-all', async ({
  adminPage,
  apiMocks,
  pageErrors,
}) => {
  expect(Array.isArray(pageErrors)).toBe(true);

  // `apiMocks` exposes the factory namespace.
  expect(typeof apiMocks.makeDataset).toBe('function');
  expect(typeof apiMocks.mockDatasetsList).toBe('function');
  expect(typeof apiMocks.installDefaultApiMocks).toBe('function');

  // Use a static HTML stub so the page acquires an origin that `fetch` can
  // resolve relative `/api/v1/...` URLs against — without booting the React
  // app's heavy data graph (which would need per-endpoint mocks the smoke
  // doesn't care about).
  await adminPage.route('**/__smoke__', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8"><title>smoke</title>',
    });
  });
  await adminPage.goto('/__smoke__');

  // Catch-all fulfils unmocked GETs with an empty envelope.
  const uncovered = await fetchJsonFromPage<{
    data: unknown[];
    next_cursor: string | null;
    total: number;
  }>(adminPage, '/api/v1/anything-uncovered');
  expect(uncovered.status).toBe(200);
  expect(uncovered.body).toMatchObject({ data: [], next_cursor: null, total: 0 });

  // mockAuth (run by the adminPage fixture) overrides `/api/v1/users/me`.
  const me = await fetchJsonFromPage<IdentityBody>(adminPage, '/api/v1/users/me');
  expect(me.status).toBe(200);
  expect(me.body.roles).toEqual(['admin']);
  expect(me.body.permissions).toEqual(['*']);
});

test('viewerPage exposes the read-only identity', async ({ viewerPage }) => {
  await viewerPage.route('**/__smoke__', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8"><title>smoke</title>',
    });
  });
  await viewerPage.goto('/__smoke__');

  const me = await fetchJsonFromPage<IdentityBody>(viewerPage, '/api/v1/users/me');
  expect(me.body.roles).toEqual(['viewer']);
  expect(me.body.permissions).toEqual(['read:*']);
});

test.describe('pageErrors allowlist', () => {
  test.use({ errorAllowlist: [/expected noise/i] });

  test('custom allowlist filters matching console errors', async ({ adminPage }) => {
    await adminPage.route('**/__smoke__', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta charset="utf-8"><title>smoke</title>',
      });
    });
    await adminPage.goto('/__smoke__');
    // Emit a `console.error` that matches the custom allowlist — the auto
    // post-test assertion should treat it as filtered noise and pass.
    await adminPage.evaluate(() => console.error('expected noise from spec'));
  });
});

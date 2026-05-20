import { test, expect, DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';

/**
 * E2E coverage for the global 404 (NotFound) catch-all and the legacy
 * route redirects declared in `apps/web/src/router.tsx`.
 *
 * The router declares 15 `loader: redirectTo(...)` entries that map
 * pre-launcher routes to their canonical Foundry-parity destinations.
 * `redirectTo` preserves both `?search` and `#hash`, so this spec
 * loops over the full table once for plain redirects and asserts query
 * preservation on representative entries.
 *
 * `/audit` was mentioned in the task description but is NOT a redirect —
 * it lazy-loads `AuditPage` (router.tsx:248). Excluded from the table.
 */

// AppShell + lazy destination chunks emit a fair amount of benign mount-
// time noise when API responses are empty envelopes (the default
// catch-all). Suppress the well-known patterns so the auto pageErrors
// assertion only catches genuinely unexpected errors from this spec.
test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /Cannot read properties of null/,
      /React Router caught the following error/,
      /^console\.error: %o$/,
      /Failed to load workspace/,
      /Failed to fetch/,
    ],
  },
});

interface LegacyRedirect {
  /** Path the user navigates to (the deprecated URL). */
  legacy: string;
  /** Expected pathname after the loader's `redirect()` resolves. */
  destination: string;
}

/**
 * Mirror of `router.tsx` — every `{ path, loader: redirectTo(...) }`
 * entry, in source order. Dynamic segments are filled with deterministic
 * sample IDs because the loader doesn't read the param value.
 */
const REDIRECTS: ReadonlyArray<LegacyRedirect> = [
  { legacy: '/workflows', destination: '/foundry-rules' },
  { legacy: '/automate', destination: '/foundry-rules' },
  { legacy: '/nexus', destination: '/ai/threads' },
  { legacy: '/functions', destination: '/compute-modules' },
  { legacy: '/ontology-design', destination: '/ontology-manager' },
  { legacy: '/ontologies', destination: '/ontology-manager' },
  { legacy: '/reports', destination: '/slate' },
  { legacy: '/ml', destination: '/model-catalog' },
  { legacy: '/dashboards', destination: '/quiver' },
  { legacy: '/dashboards/dash-123', destination: '/quiver' },
  { legacy: '/queries', destination: '/object-explorer' },
  { legacy: '/workflow-lineage', destination: '/lineage' },
  { legacy: '/marketplace', destination: '/' },
  { legacy: '/marketplace/item-1', destination: '/' },
  { legacy: '/global-branching', destination: '/' },
];

function pathname(page: import('@playwright/test').Page): string {
  return new URL(page.url()).pathname;
}

// ---------------------------------------------------------------------------
// Legacy redirects (15 programmatic tests)
// ---------------------------------------------------------------------------

for (const { legacy, destination } of REDIRECTS) {
  test(`legacy redirect: ${legacy} → ${destination}`, async ({ authedPage: page }) => {
    await page.goto(legacy);
    await expect.poll(() => pathname(page), { timeout: 15_000 }).toBe(destination);
  });
}

// ---------------------------------------------------------------------------
// Query / hash preservation
// ---------------------------------------------------------------------------

test('redirect preserves ?search and #hash', async ({ authedPage: page }) => {
  await page.goto('/workflows?foo=bar&baz=qux#section');

  await expect.poll(() => pathname(page), { timeout: 15_000 }).toBe('/foundry-rules');

  const url = new URL(page.url());
  expect(url.search).toBe('?foo=bar&baz=qux');
  expect(url.hash).toBe('#section');
});

test('dashboards/:id preserves search params across the redirect', async ({ authedPage: page }) => {
  await page.goto('/dashboards/dash-42?tab=metrics');

  await expect.poll(() => pathname(page), { timeout: 15_000 }).toBe('/quiver');
  expect(new URL(page.url()).search).toBe('?tab=metrics');
});

// ---------------------------------------------------------------------------
// NotFound surface
// ---------------------------------------------------------------------------

test('unknown URL renders NotFound with a working "Back to home" link', async ({
  authedPage: page,
}) => {
  await page.goto('/this-route-does-not-exist-anywhere');

  await expect(page.getByRole('heading', { name: 'Route not migrated yet' })).toBeVisible();
  await expect(page.getByText('404', { exact: true })).toBeVisible();

  const homeLink = page.getByRole('link', { name: 'Back to home' });
  await expect(homeLink).toBeVisible();
  await expect(homeLink).toHaveAttribute('href', '/');

  await homeLink.click();
  await expect.poll(() => pathname(page), { timeout: 15_000 }).toBe('/');
});

test('NotFound for an authenticated user renders inside the AppShell chrome', async ({
  authedPage: page,
}) => {
  await page.goto('/some-bogus-path');

  // NotFound itself should be visible…
  await expect(page.getByRole('heading', { name: 'Route not migrated yet' })).toBeVisible();
  // …AND the AppShell primary navigation should be mounted, proving the
  // 404 rendered as a child of `{ path: '/', element: <AppShell /> }`
  // rather than replacing the chrome.
  await expect(
    page.getByRole('navigation', { name: 'Primary navigation' }),
  ).toBeVisible({ timeout: 15_000 });
});

test('NotFound for an unauthenticated user redirects to /auth/login', async ({
  page,
  apiMocks,
}) => {
  // Touch the apiMocks fixture so the catch-all is registered before any
  // navigation. authedPage normally does this for us; in this spec we
  // need to override mockAuth to simulate an unauthenticated visitor.
  void apiMocks;
  await mockAuth(page, { authenticated: false });

  await page.goto('/some-bogus-path');

  // The AppShell short-circuits unauthenticated users to /auth/login
  // before rendering NotFound, and `buildAuthReturnToPath` stashes the
  // original location in the `returnTo` query parameter.
  await expect
    .poll(() => pathname(page), { timeout: 15_000 })
    .toBe('/auth/login');
  expect(page.url()).toContain('returnTo=');
});

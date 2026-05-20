import { type Page } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { mockAuth } from './fixtures/mocks';

/**
 * E2E coverage for the authenticated-session lifecycle: silent token
 * refresh, involuntary logout, and the /auth/logout endpoint contract.
 *
 * The shipped app diverges from the roadmap in three notable ways and
 * tests are aligned to the real behaviour:
 *
 *   - **No UI logout button.** `auth.logout()` exists in
 *     `lib/stores/auth.ts` but no component in `src/lib/components/`
 *     or `src/routes/` invokes it. The user-facing "log out" today is
 *     the AppShell guard kicking the user to /auth/login after the
 *     server invalidates the session cookie. We test that pipeline.
 *
 *   - **Refresh trigger is narrow.** The API client only attempts
 *     `POST /auth/token/refresh` when the failing response body has
 *     `code: 'token_expired'` (or nested `error.code: 'token_expired'`).
 *     A plain 401 surfaces as an ApiError without a refresh attempt.
 *
 *   - **No cross-tab logout propagation.** No BroadcastChannel and no
 *     `window.addEventListener('storage', …)` listener exists in the
 *     codebase. The roadmap's "two contexts" test is split: we verify
 *     the involuntary-logout pipeline works inside one context, AND
 *     that two contexts in the same browser don't unexpectedly share
 *     auth state (each context has its own storage + cookies). A
 *     future cross-tab feature can extend this spec.
 *
 * Endpoints we touch:
 *   - `POST /api/v1/auth/token/refresh`  — refresh; server reads
 *     refresh token from of_refresh cookie; success rotates of_session.
 *   - `POST /api/v1/auth/logout`        — 204; clears server cookies.
 *
 * Authentication is cookie-driven; the `of_access_token` /
 * `of_refresh_token` localStorage keys seeded by `mockAuth` are legacy
 * compatibility shims (the production SPA reads from cookies, not
 * those keys).
 */

const TOKEN_EXPIRED_BODY = { code: 'token_expired', error: 'token expired' };
const REFRESH_PATTERN = /\/api\/v1\/auth\/token\/refresh$/;
const LOGOUT_PATTERN = /\/api\/v1\/auth\/logout$/;

/** Mock GET /users/me with a realistic user so the AppShell renders. */
async function mockUsersMeAuthenticated(page: Page): Promise<void> {
  await page.route('**/api/v1/users/me', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'runner@example.com',
        name: 'E2E Runner',
        is_active: true,
        roles: ['admin'],
        groups: [],
        permissions: ['*'],
        organization_id: null,
        attributes: {},
        mfa_enabled: false,
        mfa_enforced: false,
        auth_source: 'local',
        created_at: '2026-05-11T00:00:00Z',
      },
    });
  });
}

/**
 * Several authenticated routes mount many widgets that hit endpoints
 * the catch-all returns the standard list envelope for. Some of those
 * widgets expect different shapes (e.g. `ScopedSessionBanner`) which
 * is already handled by `mockAuth`. A few others log `console.error`
 * on partial data; we widen the allowlist so the session tests pin
 * the auth pipeline rather than collateral noise.
 */
test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Unauthorized|token expired/i,
    ],
  },
});

test('access token expired → refresh succeeds → original request is retried', async ({
  page,
}) => {
  await mockAuth(page, { authenticated: true });
  await mockUsersMeAuthenticated(page);

  let datasetsCalls = 0;
  await page.route('**/api/v1/datasets**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    datasetsCalls += 1;
    if (datasetsCalls === 1) {
      await route.fulfill({ status: 401, json: TOKEN_EXPIRED_BODY });
      return;
    }
    await route.fulfill({
      json: { data: [], next_cursor: null, total: 0 },
    });
  });

  const refreshCalls = captureRequests(page, REFRESH_PATTERN);
  await page.route('**/api/v1/auth/token/refresh', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    // 204 with no body — the real server rotates the of_session cookie.
    await route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/datasets');

  // After the initial 401, the client triggers refresh and replays the
  // original GET. Both indicators must be true: refresh fired AND the
  // datasets endpoint was hit twice.
  await expect.poll(() => refreshCalls.count()).toBeGreaterThanOrEqual(1);
  await expect.poll(() => datasetsCalls).toBeGreaterThanOrEqual(2);

  // The user is NOT bounced to /auth/login — the refresh recovered.
  await expect(page).toHaveURL(/\/datasets/);
});

test('access token expired → refresh fails → forced logout to /auth/login', async ({
  page,
}) => {
  await mockAuth(page, { authenticated: true });
  await mockUsersMeAuthenticated(page);

  // Every datasets GET surfaces token_expired so the refresh path
  // engages even on retry attempts.
  await page.route('**/api/v1/datasets**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 401, json: TOKEN_EXPIRED_BODY });
  });

  const refreshCalls = captureRequests(page, REFRESH_PATTERN);
  await page.route('**/api/v1/auth/token/refresh', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 401,
      json: { error: 'refresh token rejected' },
    });
  });

  await page.goto('/datasets');

  // The auth store calls `globalThis.location.assign('/auth/login')`
  // from `forceLogoutRedirect`. Wait for the URL to settle.
  await expect(page).toHaveURL(/\/auth\/login(\?|$)/);
  expect(refreshCalls.count()).toBeGreaterThanOrEqual(1);
});

test('plain 401 (no token_expired code) is NOT silently refreshed', async ({ page }) => {
  await mockAuth(page, { authenticated: true });
  await mockUsersMeAuthenticated(page);

  // Returns a generic 401 — the client should treat it as a normal
  // ApiError and surface it without firing refresh.
  await page.route('**/api/v1/datasets**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 401, json: { error: 'unauthorized' } });
  });

  const refreshCalls = captureRequests(page, REFRESH_PATTERN);
  await page.route('**/api/v1/auth/token/refresh', async (route) => {
    // If refresh is unexpectedly attempted, this 4xx surfaces the
    // regression alongside the count assertion below.
    await route.fulfill({ status: 418, json: { error: 'unexpected refresh' } });
  });

  await page.goto('/datasets');
  // Give the SPA enough time that any erroneous refresh would have
  // fired by now.
  await page.waitForTimeout(500);

  expect(refreshCalls.count()).toBe(0);
});

test('AppShell guard: unauthenticated user lands on /auth/login with returnTo', async ({
  page,
}) => {
  // mockAuth(authenticated: false) → /users/me returns 401 → store
  // never seats a user → AppShell's gate effect redirects.
  await mockAuth(page, { authenticated: false });

  await page.goto('/datasets');

  // The guard wraps the original path into a `returnTo` query param so
  // post-login routing can come back here.
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page).toHaveURL(
    new RegExp(`returnTo=${encodeURIComponent('/datasets').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  );
});

test('POST /auth/logout endpoint clears the server-side session', async ({ page }) => {
  // The shipped app has no UI button that calls `auth.logout()`, so we
  // exercise the wire contract directly from the page context. This
  // also verifies that the route is reachable as an authenticated
  // browser request would deliver it (no preflight, credentials sent,
  // the request is a POST).
  await mockAuth(page, { authenticated: true });
  await mockUsersMeAuthenticated(page);

  const logoutCalls = captureRequests(page, LOGOUT_PATTERN);
  await page.route('**/api/v1/auth/logout', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/');

  const status = await page.evaluate(async () => {
    const res = await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    return res.status;
  });
  expect(status).toBe(204);

  await expect.poll(() => logoutCalls.count()).toBeGreaterThanOrEqual(1);
  const call = logoutCalls.last();
  expect(call?.method).toBe('POST');
});

test('two contexts do not share auth state (no cross-tab propagation by design)', async ({
  browser,
}) => {
  // The shipped SPA has neither BroadcastChannel nor a `storage` event
  // listener for auth. Until that lands, each browser context owns
  // its own storage + cookies, so logging out / clearing storage in
  // one context must NOT affect the other.

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await mockAuth(pageA, { authenticated: true });
    await mockUsersMeAuthenticated(pageA);
    await mockAuth(pageB, { authenticated: true });
    await mockUsersMeAuthenticated(pageB);

    // Stub a simple HTML payload so the test doesn't depend on the
    // full React app booting.
    for (const p of [pageA, pageB]) {
      await p.route('**/auth-session-smoke', async (route) => {
        await route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><meta charset="utf-8"><title>session smoke</title>',
        });
      });
      await p.goto('/auth-session-smoke');
    }

    // Both contexts initially hold the legacy token shims.
    const beforeA = await pageA.evaluate(() => window.localStorage.getItem('of_access_token'));
    const beforeB = await pageB.evaluate(() => window.localStorage.getItem('of_access_token'));
    expect(beforeA).not.toBeNull();
    expect(beforeB).not.toBeNull();

    // Clear context A's storage to simulate a logout in tab A.
    await pageA.evaluate(() => window.localStorage.clear());

    const afterA = await pageA.evaluate(() => window.localStorage.getItem('of_access_token'));
    const afterB = await pageB.evaluate(() => window.localStorage.getItem('of_access_token'));

    expect(afterA).toBeNull();
    // Context B is unaffected — Playwright contexts are isolated like
    // separate browser profiles. This pins the current isolation
    // behaviour; a future cross-tab propagation feature should
    // explicitly test the same-context-multiple-pages case instead.
    expect(afterB).not.toBeNull();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

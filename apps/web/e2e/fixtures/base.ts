import { test as base, expect, type Page } from '@playwright/test';
import * as apiMocksModule from './api-mocks';
import { E2E_NOW, mockAuth, type AuthMockOptions } from './mocks';

/**
 * Allowlist of error fragments that are noisy but not actionable in CI:
 * - `ERR_ABORTED` / `AbortError`: in-flight requests cancelled by route
 *   changes (TanStack Query, React Suspense, navigation).
 * - `Failed to load resource`: the browser's generic message when a route
 *   returns a non-2xx status — we already assert response shapes elsewhere.
 * - `ResizeObserver loop ...`: layout thrash that browsers report defensively;
 *   does not affect functionality (well-known React warning).
 *
 * Override per test with `test.use({ errorAllowlist: [...] })`.
 */
export const DEFAULT_ERROR_ALLOWLIST: readonly RegExp[] = Object.freeze([
  /ERR_ABORTED/,
  /Failed to load resource/,
  /AbortError/,
  /ResizeObserver loop/,
]);

export type ApiMocks = typeof apiMocksModule;

type FixtureOptions = {
  /**
   * Per-test override knob for the auth mocks (roles, user identity, sso).
   * Set via `test.use({ authOptions: { user: { roles: ['viewer'] } } })`.
   */
  authOptions: AuthMockOptions;
  /**
   * When `true`, freezes `Date.now()` / `new Date()` to {@link E2E_NOW} on
   * every page. Opt-in via `test.use({ freezeTime: true })`.
   */
  freezeTime: boolean;
  /**
   * Patterns to strip from {@link pageErrors} before the auto post-test
   * assertion. Override per file via
   * `test.use({ errorAllowlist: [...DEFAULT_ERROR_ALLOWLIST, /my noise/] })`.
   */
  errorAllowlist: readonly RegExp[];
};

type Fixtures = {
  /**
   * Plain `page` with auth/bootstrap mocks installed (and freezeTime applied
   * if opted in). Use for tests that start from an authenticated state.
   */
  authedPage: Page;
  /**
   * Authenticated page with `roles: ['admin']` + `permissions: ['*']`. Use
   * when a test exercises admin-only surfaces.
   */
  adminPage: Page;
  /**
   * Authenticated page with `roles: ['viewer']` + `permissions: ['read:*']`.
   * Use for permission/RBAC tests that need a read-only identity.
   */
  viewerPage: Page;
  /**
   * Factory of resource builders + route mockers. `installDefaultApiMocks`
   * has already run when this fixture resolves, so any `/api/v1/...` request
   * the spec doesn't explicitly mock returns an empty envelope (GET) or 204
   * (mutations). Add more specific mocks via `apiMocks.mockXList(page, ...)`
   * inside the test body.
   */
  apiMocks: ApiMocks;
  /**
   * Live array of `pageerror` + `console.error` events captured for the
   * current test. Auto-attached BEFORE any `page.goto()`, so listeners
   * cover the whole spec lifetime. After the test ends, the fixture
   * filters this array against {@link errorAllowlist} and fails the test
   * if anything remains.
   */
  pageErrors: string[];
};

async function installFreezeTime(page: Page): Promise<void> {
  await page.addInitScript((nowMs: number) => {
    const OriginalDate = globalThis.Date;
    const Patched = new Proxy(OriginalDate, {
      construct(target, args) {
        if (args.length === 0) {
          return new target(nowMs);
        }
        // Forward to the real constructor for explicit-args callers
        // (e.g. `new Date('2030-01-01')`).
        return Reflect.construct(target, args);
      },
      apply() {
        return new OriginalDate(nowMs).toString();
      },
    });
    (Patched as unknown as { now: () => number }).now = () => nowMs;
    globalThis.Date = Patched;
  }, new Date(E2E_NOW).getTime());
}

export const test = base.extend<FixtureOptions & Fixtures>({
  // ---- Options ------------------------------------------------------------

  authOptions: [{}, { option: true }],
  freezeTime: [false, { option: true }],
  errorAllowlist: [DEFAULT_ERROR_ALLOWLIST, { option: true }],

  // ---- Auto fixtures ------------------------------------------------------

  pageErrors: [
    async ({ page, errorAllowlist }, use, testInfo) => {
      const errors: string[] = [];
      const onPageError = (err: Error): void => {
        errors.push(`pageerror: ${err.message}`);
      };
      const onConsole = (msg: import('@playwright/test').ConsoleMessage): void => {
        if (msg.type() === 'error') {
          errors.push(`console.error: ${msg.text()}`);
        }
      };
      page.on('pageerror', onPageError);
      page.on('console', onConsole);

      await use(errors);

      page.off('pageerror', onPageError);
      page.off('console', onConsole);

      // Skip the assertion if the test already failed (timeout, expect
      // failure, etc.) — extra noise would just bury the real cause.
      if (testInfo.status !== testInfo.expectedStatus) return;

      const filtered = errors.filter(
        (e) => !errorAllowlist.some((rx) => rx.test(e)),
      );
      expect(
        filtered,
        `Unexpected page errors during test:\n  - ${filtered.join('\n  - ')}`,
      ).toEqual([]);
    },
    { auto: true },
  ],

  // ---- Page fixtures ------------------------------------------------------
  //
  // `apiMocks` runs before the page fixtures so its catch-all is the
  // *oldest* handler — auth + per-spec routes installed afterwards win,
  // matching Playwright's most-recent-first dispatch.

  apiMocks: async ({ page }, use) => {
    await apiMocksModule.installDefaultApiMocks(page);
    await use(apiMocksModule);
  },

  authedPage: async ({ page, apiMocks, authOptions, freezeTime }, use) => {
    void apiMocks; // ensure default mocks installed before auth routes
    if (freezeTime) await installFreezeTime(page);
    await mockAuth(page, authOptions);
    await use(page);
  },

  adminPage: async ({ page, apiMocks, freezeTime }, use) => {
    void apiMocks;
    if (freezeTime) await installFreezeTime(page);
    await mockAuth(page, {
      user: { roles: ['admin'], permissions: ['*'] },
    });
    await use(page);
  },

  viewerPage: async ({ page, apiMocks, freezeTime }, use) => {
    void apiMocks;
    if (freezeTime) await installFreezeTime(page);
    await mockAuth(page, {
      user: { roles: ['viewer'], permissions: ['read:*'] },
    });
    await use(page);
  },
});

export { expect };

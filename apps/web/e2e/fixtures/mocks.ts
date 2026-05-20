import type { Page, Route } from '@playwright/test';

export const E2E_NOW = '2026-05-11T00:00:00Z';

export type UserOverrides = {
  id?: string;
  email?: string;
  name?: string;
  roles?: string[];
  permissions?: string[];
  organization_id?: string | null;
};

export function buildUser(overrides: UserOverrides = {}) {
  return {
    id: overrides.id ?? '00000000-0000-0000-0000-000000000001',
    email: overrides.email ?? 'runner@example.com',
    name: overrides.name ?? 'E2E Runner',
    is_active: true,
    roles: overrides.roles ?? ['admin'],
    groups: [],
    permissions: overrides.permissions ?? ['*'],
    organization_id: overrides.organization_id ?? null,
    attributes: {},
    mfa_enabled: false,
    mfa_enforced: false,
    auth_source: 'local',
    created_at: E2E_NOW,
  };
}

export type AuthMockOptions = {
  authenticated?: boolean;
  user?: UserOverrides;
  requiresInitialAdmin?: boolean;
  ssoProviders?: unknown[];
};

/**
 * Installs the auth/bootstrap route mocks shared by every authenticated spec.
 *
 * Always call this BEFORE `page.goto(...)` — `page.route` only intercepts
 * requests made after the handler is registered.
 */
export async function mockAuth(page: Page, options: AuthMockOptions = {}): Promise<void> {
  const {
    authenticated = true,
    user,
    requiresInitialAdmin = false,
    ssoProviders = [],
  } = options;

  if (authenticated) {
    await page.addInitScript(() => {
      // `about:blank` denies localStorage access in modern Chromium, so the
      // init script needs to be tolerant of pre-navigation document states.
      try {
        window.localStorage.setItem('of_access_token', 'e2e-token');
        window.localStorage.setItem('of_refresh_token', 'e2e-refresh');
      } catch {
        // Storage will be re-set on the first real navigation.
      }
    });
  }

  await page.route('**/api/v1/auth/bootstrap-status', async (route) => {
    await route.fulfill({ json: { requires_initial_admin: requiresInitialAdmin } });
  });

  await page.route('**/api/v1/auth/sso/providers', async (route) => {
    await route.fulfill({ json: ssoProviders });
  });

  await page.route('**/api/v1/users/me', async (route) => {
    if (!authenticated) {
      await route.fulfill({ status: 401, json: { error: 'unauthenticated' } });
      return;
    }
    await route.fulfill({ json: buildUser(user) });
  });

  // ScopedSessionBanner is mounted in the AppShell and unconditionally
  // dereferences `options.presets` on render. Return the disabled-feature
  // shape so the banner short-circuits to `null` instead of crashing in
  // every authenticated spec.
  await page.route('**/api/v1/auth/scoped-sessions', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        enabled: false,
        allow_no_scoped_session: true,
        always_show_selector: false,
        no_scoped_session_available: true,
        bypass_allowed: true,
        active_scoped_session: null,
        full_allowed_markings: [],
        presets: [],
      },
    });
  });
}

/**
 * Fulfills an arbitrary GET route with a JSON body. Sugar over `page.route`.
 */
export async function mockJson(page: Page, url: string | RegExp, body: unknown): Promise<void> {
  await page.route(url, async (route: Route) => {
    await route.fulfill({ json: body });
  });
}

import { type Page, type Route } from '@playwright/test';
import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { ControlPanelPage } from './pages';

/**
 * E2E coverage for `/control-panel`
 * (apps/web/src/routes/control-panel/ControlPanelPage.tsx).
 *
 * **Reality check.** The shipped ControlPanelPage is the admin hub —
 * but it is NOT a metrics dashboard. There are no headline KPI cards
 * (active users / sessions / storage); the page is a configuration
 * surface composed of:
 *
 *   - an h1 "Control panel" + sensitive-admin subtitle;
 *   - 15 navigation tiles (rendered as `.of-button` links) that drop
 *     the user on each `/control-panel/*` sub-section;
 *   - a "Platform" settings panel (platform name, support email, docs
 *     URL, status page, default region, release channel, deployment
 *     mode, default locale, announcement banner, maintenance/self-
 *     signup toggles, supported locales chips, allowed email domains,
 *     restricted operations);
 *   - an "Advanced (JSON)" panel with four `JsonEditor` widgets;
 *   - an "Upgrade readiness" section that pretty-prints the
 *     `/control-panel/upgrade-readiness` envelope;
 *   - an "SSO providers" list, rendered only when `listSsoProviders()`
 *     returns ≥1 entry.
 *
 * Endpoints called on mount (`Promise.all`):
 *   - GET /api/v1/control-panel                  → ControlPanelSettings
 *   - GET /api/v1/control-panel/upgrade-readiness → UpgradeReadinessResponse
 *   - GET /api/v1/auth/sso/providers              → SsoProviderRecord[]
 *
 * Gating: the page itself does NOT gate by role. The backend enforces
 * admin-only access via 403 on `/control-panel`; the page then surfaces
 * the API error in its `.of-status-danger` banner and skips rendering
 * the settings form. There is no client-side redirect to `/` today —
 * this spec pins that absence so when a `requireAdmin` guard ships the
 * relevant assertion fails loudly.
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      // The settings form mounts `JsonEditor` widgets that occasionally
      // log "%o"-style warnings while React Suspense flushes; ignore.
      /^console\.error: %o$/,
      // Some sub-pages (Users, Identity providers, …) crash on the
      // catch-all's empty `{data: [], total: 0}` envelope because they
      // expect richer shapes. We exercise the control-panel HOME here,
      // not the sub-pages — their own specs cover them with realistic
      // mocks. Allowlist the React error so a click-through navigation
      // test doesn't double-fail on unrelated sub-page noise.
      /Cannot read properties of undefined/,
      /React Router caught the following error/,
    ],
  },
});

const SETTINGS_FIXTURE = {
  platform_name: 'OpenFoundry E2E',
  support_email: 'support@example.com',
  docs_url: 'https://docs.example.com',
  status_page_url: 'https://status.example.com',
  announcement_banner: 'Scheduled maintenance window: Sun 02:00 UTC.',
  maintenance_mode: false,
  release_channel: 'stable',
  default_region: 'us-east-1',
  deployment_mode: 'cloud',
  allow_self_signup: false,
  supported_locales: ['en', 'es'],
  default_locale: 'en',
  allowed_email_domains: ['acme.com', 'example.org'],
  restricted_operations: ['delete:dataset'],
  default_app_branding: {
    display_name: 'OpenFoundry',
    primary_color: '#0a0a0a',
    accent_color: '#3b82f6',
    logo_url: null,
    favicon_url: null,
    show_powered_by: true,
  },
  identity_provider_mappings: [],
  resource_management_policies: [],
  upgrade_assistant: {
    current_version: '2026.05.10',
    target_version: '2026.05.20',
    maintenance_window: 'Sun 02:00-04:00 UTC',
    rollback_channel: 'stable',
    preflight_checks: [],
    rollout_stages: [],
    rollback_steps: [],
  },
  scoped_sessions: {
    enabled: false,
    allow_no_scoped_session: true,
    always_show_selector: false,
    allowed_bypass_groups: [],
    presets: [],
  },
  application_access: {
    enabled: false,
    default_visibility: 'visible',
    warning: '',
    applications: [],
    rules: [],
    approval_policy: {
      mode: 'self_approve',
      reviewer_user_ids: [],
      reviewer_group_ids: [],
      require_distinct_reviewer_for_policy: false,
    },
    change_requests: [],
    history: [],
  },
  member_discovery: {
    default_discover_users: true,
    default_discover_groups: true,
    warning: '',
    organizations: [],
    history: [],
  },
  file_access_presets: {
    enabled: false,
    warning: '',
    guest_organization_behavior: 'primary_organization',
    presets: [],
    history: [],
  },
  updated_by: 'admin@example.com',
  updated_at: '2026-05-19T22:00:00Z',
};

const READINESS_FIXTURE = {
  current_version: '2026.05.10',
  target_version: '2026.05.20',
  release_channel: 'stable',
  readiness: 'ready',
  checks: [
    { id: 'preflight-1', label: 'Database migrations', status: 'passed', detail: '' },
  ],
  blockers: [],
  recommended_actions: [],
  next_stage: null,
  completed_stage_count: 0,
  total_stage_count: 0,
  preflight_ready_count: 1,
  preflight_total_count: 1,
  completed_rollout_percentage: 0,
  generated_at: '2026-05-19T22:00:00Z',
};

const SSO_FIXTURE = [
  {
    id: 'sso-1',
    slug: 'okta',
    name: 'Okta corporate',
    provider_type: 'oidc',
    enabled: true,
    client_id: 'client-id',
    client_secret_configured: true,
    issuer_url: 'https://example.okta.com',
    authorization_url: null,
    token_url: null,
    userinfo_url: null,
    scopes: ['openid', 'email'],
    saml_metadata_url: null,
    saml_entity_id: null,
    saml_sso_url: null,
    attribute_mapping: {},
    created_at: '2026-05-19T22:00:00Z',
    updated_at: '2026-05-19T22:00:00Z',
  },
];

interface CpMockOverrides {
  settings?: typeof SETTINGS_FIXTURE | null;
  readiness?: typeof READINESS_FIXTURE | null;
  sso?: typeof SSO_FIXTURE;
  /** Status to return for `/control-panel` (default 200 with `settings`). */
  settingsStatus?: number;
}

/**
 * Per-test mocks for the three endpoints the control-panel home reads
 * on mount. Each defaults to the deterministic fixtures above; pass an
 * override to simulate a failure or empty payload.
 */
async function mockControlPanelEndpoints(
  page: Page,
  overrides: CpMockOverrides = {},
): Promise<void> {
  const settings = overrides.settings ?? SETTINGS_FIXTURE;
  const readiness = overrides.readiness === undefined ? READINESS_FIXTURE : overrides.readiness;
  const sso = overrides.sso ?? SSO_FIXTURE;
  const settingsStatus = overrides.settingsStatus ?? 200;

  await page.route('**/api/v1/control-panel', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    if (settingsStatus !== 200) {
      await route.fulfill({
        status: settingsStatus,
        json: { error: `mocked ${settingsStatus}: admin role required` },
      });
      return;
    }
    await route.fulfill({ json: settings });
  });

  await page.route('**/api/v1/control-panel/upgrade-readiness', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    if (readiness === null) {
      await route.fulfill({ status: 403, json: { error: 'forbidden' } });
      return;
    }
    await route.fulfill({ json: readiness });
  });

  // mockAuth already installs an empty `/auth/sso/providers` mock; override
  // it here so the SSO section renders the fixture entries.
  await page.route('**/api/v1/auth/sso/providers', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: sso });
  });
}

/** The 15 sub-section tiles rendered on the home page, in source order. */
const SUBSECTION_TILES: ReadonlyArray<{ label: RegExp; href: string }> = [
  { label: /streaming profiles/i, href: '/control-panel/streaming-profiles' },
  { label: /data health/i, href: '/control-panel/data-health' },
  { label: /organizations & spaces/i, href: '/control-panel/tenancy' },
  { label: /identity providers/i, href: '/control-panel/identity-providers' },
  { label: /^users\b/i, href: '/control-panel/users' },
  { label: /^groups\b/i, href: '/control-panel/groups' },
  { label: /projects \(security\)/i, href: '/control-panel/projects' },
  { label: /role sets & operations/i, href: '/control-panel/role-sets' },
  { label: /marking categories/i, href: '/control-panel/marking-categories' },
  { label: /scoped sessions/i, href: '/control-panel/scoped-sessions' },
  { label: /application access/i, href: '/control-panel/application-access' },
  { label: /third-party applications/i, href: '/control-panel/third-party-applications' },
  { label: /user & group visibility/i, href: '/control-panel/member-discovery' },
  { label: /file access presets/i, href: '/control-panel/file-access-presets' },
  { label: /retention policies/i, href: '/control-panel/retention-policies' },
];

test('renders the control-panel admin hub: heading, platform settings, upgrade readiness, SSO', async ({
  adminPage,
}) => {
  await mockControlPanelEndpoints(adminPage);

  const cp = new ControlPanelPage(adminPage);
  await cp.goto();
  await cp.expectLoaded();

  // ── Heading + subtitle ────────────────────────────────────────────
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^control panel$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/platform configuration, upgrade readiness, sso providers/i),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/sensitive admin surface/i),
  ).toBeVisible();

  // ── Platform settings: mocked values hydrate into the form ─────────
  // These are the closest thing to "KPIs" the page exposes today —
  // platform identity + deployment posture. Real metric KPIs (active
  // users, session counts, storage usage) are NOT rendered here; they
  // live on the per-area sub-pages (e.g. /control-panel/data-health,
  // /control-panel/users). When/if a metrics tile strip ships on the
  // hub, extend this test with `getByRole('region', { name: /kpis|stats|overview/i })`.
  await expect(
    adminPage.getByRole('textbox', { name: /platform name/i }),
  ).toHaveValue('OpenFoundry E2E');
  await expect(
    adminPage.getByRole('textbox', { name: /support email/i }),
  ).toHaveValue('support@example.com');
  await expect(
    adminPage.getByRole('textbox', { name: /docs url/i }),
  ).toHaveValue('https://docs.example.com');
  await expect(
    adminPage.getByRole('textbox', { name: /default region/i }),
  ).toHaveValue('us-east-1');
  await expect(
    adminPage.getByRole('combobox', { name: /release channel/i }),
  ).toHaveValue('stable');
  await expect(
    adminPage.getByRole('combobox', { name: /deployment mode/i }),
  ).toHaveValue('cloud');
  await expect(
    adminPage.getByRole('checkbox', { name: /maintenance mode/i }),
  ).not.toBeChecked();
  await expect(
    adminPage.getByRole('checkbox', { name: /allow self-signup/i }),
  ).not.toBeChecked();
  await expect(
    adminPage.getByRole('textbox', { name: /allowed email domains/i }),
  ).toHaveValue('acme.com, example.org');

  // ── Save button is present and enabled while idle ─────────────────
  await expect(
    adminPage.getByRole('button', { name: /^save settings$/i }),
  ).toBeEnabled();

  // ── Upgrade readiness: pretty-printed payload contains the versions ─
  // Anchor on the eyebrow label (exact match) — the page subtitle also
  // contains the phrase "upgrade readiness", which would otherwise trip
  // Playwright's strict-mode locator resolution.
  await expect(
    adminPage.getByText('Upgrade readiness', { exact: true }),
  ).toBeVisible();
  const readinessPre = adminPage.locator('pre').filter({ hasText: '"current_version"' });
  await expect(readinessPre).toBeVisible();
  await expect(readinessPre).toContainText('"2026.05.10"');
  await expect(readinessPre).toContainText('"2026.05.20"');

  // ── SSO providers section appears with the mocked entry ────────────
  await expect(adminPage.getByText(/sso providers \(1\)/i)).toBeVisible();
  await expect(adminPage.getByText(/okta corporate/i)).toBeVisible();
});

test('navigation tiles: every sub-section link is rendered with the right href', async ({
  adminPage,
}) => {
  await mockControlPanelEndpoints(adminPage);

  const cp = new ControlPanelPage(adminPage);
  await cp.goto();
  await cp.expectLoaded();

  // ControlPanelPage page object exposes `section(name)` — use it.
  for (const tile of SUBSECTION_TILES) {
    const link = cp.section(tile.label);
    await expect(link, `tile "${tile.label}" should be visible`).toBeVisible();
    await expect(link).toHaveAttribute('href', new RegExp(`${tile.href}$`));
  }

  // 15 tiles in total (regression guard: catches a renamed tile or a
  // tile that gets accidentally deleted in a future refactor).
  expect(SUBSECTION_TILES.length).toBe(15);
});

test('navigation tiles: clicking a tile navigates to the sub-section', async ({
  adminPage,
}) => {
  await mockControlPanelEndpoints(adminPage);

  const cp = new ControlPanelPage(adminPage);
  await cp.goto();
  await cp.expectLoaded();

  // Pick three tiles that route to genuinely different sub-pages — one
  // per "lane" (operational, identity, governance). Page Object's
  // `section()` returns the `<Link>`; clicking it drives the router.
  await cp.section(/identity providers/i).click();
  await expect(adminPage).toHaveURL(/\/control-panel\/identity-providers(\?|$)/);

  await adminPage.goBack();
  await cp.expectLoaded();

  await cp.section(/^users\b/i).click();
  await expect(adminPage).toHaveURL(/\/control-panel\/users(\?|$)/);

  await adminPage.goBack();
  await cp.expectLoaded();

  await cp.section(/retention policies/i).click();
  await expect(adminPage).toHaveURL(/\/control-panel\/retention-policies(\?|$)/);
});

test('gating: viewerPage hits the page but the settings API rejects with 403', async ({
  viewerPage,
}) => {
  // The realistic backend behaviour for a non-admin: 403 on
  // `/control-panel`. The page surfaces the API error message in its
  // danger banner and SKIPS rendering the settings form. The upgrade-
  // readiness call is also rejected (admin-only on the server).
  await mockControlPanelEndpoints(viewerPage, {
    settingsStatus: 403,
    readiness: null,
  });

  await viewerPage.goto('/control-panel');

  // Heading is still mounted — the page is not redirected today.
  await expect(
    viewerPage.getByRole('heading', { level: 1, name: /^control panel$/i }),
  ).toBeVisible();

  // The danger banner appears with the mocked 403 message.
  const banner = viewerPage.locator('.of-status-danger').first();
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/admin role required/i);

  // Settings form does NOT render — `settings` stays null after the
  // refresh() catch, so the Platform / Advanced JSON panels never mount.
  expect(
    await viewerPage.getByRole('textbox', { name: /platform name/i }).count(),
  ).toBe(0);
  expect(
    await viewerPage.getByRole('button', { name: /^save settings$/i }).count(),
  ).toBe(0);
});

test('absent today: viewerPage is NOT redirected away from /control-panel', async ({
  viewerPage,
}) => {
  // Pins current behaviour: there is no client-side route guard that
  // redirects non-admin identities to `/`. When `requireAdmin` ships
  // (router middleware or an AppShell guard), this assertion flips
  // from "stays at /control-panel" to "redirects to /" — the failing
  // test is the signal to update the spec to match the new contract.
  await mockControlPanelEndpoints(viewerPage, {
    settingsStatus: 403,
    readiness: null,
  });

  await viewerPage.goto('/control-panel');

  // Wait until the page settles on its final URL (give React Router a
  // beat to run any redirect that lands later in mount).
  await viewerPage.waitForLoadState('networkidle');

  await expect(viewerPage).toHaveURL(/\/control-panel(\?|$)/);
  await expect(viewerPage).not.toHaveURL(/^https?:\/\/[^/]+\/$/);
});

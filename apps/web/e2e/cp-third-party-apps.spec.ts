import { type Page, type Route } from '@playwright/test';
import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/control-panel/third-party-applications`
 * (apps/web/src/routes/control-panel/ThirdPartyApplicationsPage.tsx).
 *
 * **Reality check.** The page is the OAuth2-client Control-Panel
 * fallback (Developer Console is the preferred surface). It composes:
 *
 *   - Optional warning / error / notice / client-secret banners.
 *   - "New OAuth2 client" register form (Name, Client type
 *     confidential/public, Managing organization, Description,
 *     Authorization-code + Client-credentials grant chips, Redirect
 *     URIs / Scopes / Owner IDs / Discoverable / Enablement orgs
 *     textareas).
 *   - "Applications" registry table — Name / Client (client_id +
 *     type) / Grants (chips) / Organizations (enabled vs.
 *     discoverable counts) / per-row Rotate-secret + Revoke buttons.
 *   - Per-selected-app "Organization enablement" panel (PUT /
 *     DELETE per organization), plus "Service user" panel
 *     (Prepare service user → ensure; Assign role; project /
 *     resource grants; Audit history).
 *
 * Mapping the requested cases:
 *
 *   - Case 1 (lista de apps OAuth registradas) ✅
 *   - Case 2 (crear OAuth client) ✅ — typed form + grant chips +
 *     textareas; POSTs the full request body.
 *   - Case 3 (rotar client secret) ✅ — per-row "Rotate secret"
 *     POSTs `/rotate-secret`; the new secret renders inside the
 *     client-secret panel at the top.
 *   - Case 4 (revocar) ✅ — per-row "Revoke" issues a direct
 *     DELETE with no confirm dialog today.
 *   - Case 5 (ver tokens activos) ❌ — there is NO active-token
 *     surface; the closest is the service-user inspection
 *     (platform roles + project/resource grants + audit events).
 *
 * Endpoints (mirrors `src/lib/api/third-party-applications.ts`):
 *   - GET    /api/v1/third-party-applications                          → { items, total, warning }
 *   - POST   /api/v1/third-party-applications                          → { application, client_secret, warning }
 *   - DELETE /api/v1/third-party-applications/:id                      → 204
 *   - POST   /api/v1/third-party-applications/:id/rotate-secret        → { application, client_secret, warning }
 *   - GET    /api/v1/third-party-applications/:id/service-user         → ThirdPartyServiceUserInspection
 *   - GET    /api/v1/roles                                              → RoleRecord[]
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /^console\.error: %o$/,
    ],
  },
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface ThirdPartyApplication {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  client_type: 'confidential' | 'public';
  enabled_grant_types: ('authorization_code' | 'client_credentials')[];
  redirect_uris: string[];
  scopes: string[];
  owner_user_ids: string[];
  managing_organization_id: string;
  discoverable_organization_ids: string[];
  enablements: {
    application_id: string;
    organization_id: string;
    enabled: boolean;
    project_resource_ids: string[];
    marking_ids: string[];
    organization_consent: boolean;
    created_at: string;
    updated_at: string;
  }[];
  service_user_id: string | null;
  client_secret_prefix: string | null;
  client_secret_created_at: string | null;
  preferred_management_surface: 'developer_console' | 'control_panel_fallback';
  control_panel_fallback: boolean;
  requires_pkce: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
}

const E2E_NOW = '2026-05-11T00:00:00Z';

function makeApp(overrides: Partial<ThirdPartyApplication> = {}): ThirdPartyApplication {
  return {
    id: 'app-1',
    client_id: 'cli_abc123',
    name: 'Acme Reporter',
    description: 'Read-only reporting integration.',
    client_type: 'confidential',
    enabled_grant_types: ['authorization_code', 'client_credentials'],
    redirect_uris: ['https://acme.example/oauth/callback'],
    scopes: ['datasets:read', 'projects:read'],
    owner_user_ids: ['user-owner-1'],
    managing_organization_id: 'org-1',
    discoverable_organization_ids: ['org-1', 'org-partner-1'],
    enablements: [
      {
        application_id: 'app-1',
        organization_id: 'org-1',
        enabled: true,
        project_resource_ids: [],
        marking_ids: [],
        organization_consent: true,
        created_at: E2E_NOW,
        updated_at: E2E_NOW,
      },
    ],
    service_user_id: 'svc-user-1',
    client_secret_prefix: 'sec_abc',
    client_secret_created_at: E2E_NOW,
    preferred_management_surface: 'developer_console',
    control_panel_fallback: true,
    requires_pkce: false,
    created_by: 'admin-user',
    updated_by: 'admin-user',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    revoked_at: null,
    ...overrides,
  };
}

const ACME_REPORTER = makeApp({
  id: 'app-acme',
  client_id: 'cli_acme123',
  name: 'Acme Reporter',
});
const PARTNER_INGEST = makeApp({
  id: 'app-partner',
  client_id: 'cli_partner456',
  name: 'Partner Ingest',
  client_type: 'public',
  enabled_grant_types: ['authorization_code'],
  requires_pkce: true,
  enablements: [],
});

// Endpoint patterns
const APPS_LIST = /\/api\/v1\/third-party-applications$/;
const APP_DELETE = (id: string) =>
  new RegExp(`/api/v1/third-party-applications/${id}$`);
const APP_ROTATE_SECRET = (id: string) =>
  new RegExp(`/api/v1/third-party-applications/${id}/rotate-secret$`);
const APP_SERVICE_USER = (id: string) =>
  new RegExp(`/api/v1/third-party-applications/${id}/service-user$`);
const ROLES_LIST = /\/api\/v1\/roles$/;

interface MockOpts {
  apps?: ThirdPartyApplication[];
  warning?: string;
}

async function mockRegistry(page: Page, opts: MockOpts = {}) {
  const apps = opts.apps ?? [];
  const warning = opts.warning ?? '';

  await page.route(APPS_LIST, async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { items: apps, total: apps.length, warning } });
      return;
    }
    await route.fallback();
  });

  // listRoles returns `RoleRecord[]` (a plain array); the catch-all's
  // `{data: [], next_cursor, total}` envelope would crash `roles.map`.
  await page.route(ROLES_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: [] });
  });

  // The page auto-fetches the selected app's service-user record on
  // selection. Stub each app's endpoint with a benign inspection
  // payload so the section renders without crashing on undefined
  // arrays.
  for (const app of apps) {
    await page.route(APP_SERVICE_USER(app.id), async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        json: {
          application: app,
          service_user: null,
          client_credentials_enabled: false,
          platform_roles: [],
          permissions: [],
          resource_grants: [],
          audit_events: [],
          warning: '',
        },
      });
    });
  }

  return captureRequests(page, APPS_LIST);
}

async function waitForRequest(
  cap: ReturnType<typeof captureRequests>,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
): Promise<{ method: string; body: unknown }> {
  await expect
    .poll(() => cap.calls.filter((c) => c.method === method).length)
    .toBeGreaterThanOrEqual(1);
  const matching = cap.calls.filter((c) => c.method === method);
  return matching[matching.length - 1];
}

function appRow(page: Page, name: string) {
  return page.getByRole('row').filter({ hasText: name }).first();
}

// ---------------------------------------------------------------------------
// Case 1 — list registered OAuth apps
// ---------------------------------------------------------------------------

test('lists registered OAuth2 clients in the registry table', async ({
  adminPage,
}) => {
  await mockRegistry(adminPage, { apps: [ACME_REPORTER, PARTNER_INGEST] });
  await adminPage.goto('/control-panel/third-party-applications');

  // Page chrome.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^third-party applications$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /^control panel$/i }).first(),
  ).toHaveAttribute('href', /\/control-panel$/);

  // Each row carries the app name as a link-styled button + the
  // client_id as a `<code>` block + the grant chips.
  const acmeRow = appRow(adminPage, 'Acme Reporter');
  await expect(acmeRow).toBeVisible();
  await expect(acmeRow).toContainText('cli_acme123');
  await expect(acmeRow).toContainText('confidential');
  await expect(acmeRow).toContainText('authorization_code');
  await expect(acmeRow).toContainText('client_credentials');
  await expect(acmeRow).toContainText(/1 enabled/i);

  const partnerRow = appRow(adminPage, 'Partner Ingest');
  await expect(partnerRow).toBeVisible();
  await expect(partnerRow).toContainText('cli_partner456');
  // Public clients require PKCE — pin the "· PKCE" annotation.
  await expect(partnerRow).toContainText(/public.*PKCE/);
  await expect(partnerRow).toContainText(/0 enabled/i);
});

// ---------------------------------------------------------------------------
// Case 2 — Create OAuth client (name + redirect URIs + scopes + grants)
// ---------------------------------------------------------------------------

test('register OAuth client: POSTs name + redirect_uris + scopes + grants and renders the new client_secret', async ({
  adminPage,
}) => {
  await mockRegistry(adminPage, { apps: [] });
  const cap = captureRequests(adminPage, APPS_LIST);
  await adminPage.route(APPS_LIST, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: {
        application: makeApp({
          id: 'app-new-1',
          client_id: 'cli_new1',
          name: 'Acme Reporter',
        }),
        client_secret: 'sec_PLAINTEXT_REVEAL_ONCE',
        warning: 'Treat the secret as plaintext; copy now.',
      },
    });
  });

  await adminPage.goto('/control-panel/third-party-applications');
  await expect(
    adminPage.getByRole('heading', { name: /^new oauth2 client$/i }),
  ).toBeVisible();

  // Fill the typed inputs.
  await adminPage.getByRole('textbox', { name: /^name$/i }).fill('Acme Reporter');
  await adminPage.getByRole('textbox', { name: /^description$/i }).fill('Read-only reporting integration.');

  // The two grant checkboxes ride inside `<label className="of-chip">`
  // chips with text "Authorization code" / "Client credentials".
  // Authorization code is enabled by default; ensure both are on.
  const clientCredsCheckbox = adminPage.getByRole('checkbox', { name: /client credentials/i });
  await clientCredsCheckbox.check();

  // The textareas accept newline OR comma-separated lists.
  await adminPage
    .getByRole('textbox', { name: /redirect uris/i })
    .fill('https://acme.example/oauth/callback\nhttps://acme.example/oauth/cb2');
  await adminPage
    .getByRole('textbox', { name: /^scopes$/i })
    .fill('datasets:read, projects:read');
  await adminPage
    .getByRole('textbox', { name: /owner user ids/i })
    .fill('user-owner-1');

  await adminPage.getByRole('button', { name: /^register application$/i }).click();

  const post = await waitForRequest(cap, 'POST');
  expect(post.body).toMatchObject({
    name: 'Acme Reporter',
    description: 'Read-only reporting integration.',
    client_type: 'confidential',
    enabled_grant_types: ['authorization_code', 'client_credentials'],
    redirect_uris: [
      'https://acme.example/oauth/callback',
      'https://acme.example/oauth/cb2',
    ],
    scopes: ['datasets:read', 'projects:read'],
    owner_user_ids: ['user-owner-1'],
    preferred_management_surface: 'developer_console',
    control_panel_fallback: true,
  });

  // The new client_secret renders in its own panel above the form.
  await expect(adminPage.getByText(/^client secret$/i).first()).toBeVisible();
  await expect(adminPage.getByText('sec_PLAINTEXT_REVEAL_ONCE')).toBeVisible();

  // Success banner echoes the registered app name.
  await expect(adminPage.locator('.of-status-success').first()).toContainText(
    /registered acme reporter/i,
  );
});

// ---------------------------------------------------------------------------
// Case 3 — Rotate client secret
// ---------------------------------------------------------------------------

test('rotate secret: per-row Rotate secret POSTs /rotate-secret and reveals the new value', async ({
  adminPage,
}) => {
  await mockRegistry(adminPage, { apps: [ACME_REPORTER] });
  const cap = captureRequests(adminPage, APP_ROTATE_SECRET(ACME_REPORTER.id));
  await adminPage.route(APP_ROTATE_SECRET(ACME_REPORTER.id), async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: {
        application: makeApp({ ...ACME_REPORTER, client_secret_prefix: 'sec_NEW' }),
        client_secret: 'sec_ROTATED_VALUE',
        warning: 'Old secret invalidated; update your integrations.',
      },
    });
  });

  await adminPage.goto('/control-panel/third-party-applications');
  const row = appRow(adminPage, 'Acme Reporter');
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: /^rotate secret$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('POST');

  // New secret renders in the client-secret panel + the warning surfaces
  // in the success banner.
  await expect(adminPage.getByText('sec_ROTATED_VALUE')).toBeVisible();
  await expect(adminPage.locator('.of-status-success').first()).toContainText(
    /old secret invalidated/i,
  );
});

test('rotate secret: button is disabled for public (PKCE) clients', async ({
  adminPage,
}) => {
  await mockRegistry(adminPage, { apps: [PARTNER_INGEST] });
  await adminPage.goto('/control-panel/third-party-applications');

  const row = appRow(adminPage, 'Partner Ingest');
  await expect(row).toBeVisible();
  // Public clients have no client_secret so rotation is disabled
  // server-side; the page mirrors this with a disabled button.
  await expect(row.getByRole('button', { name: /^rotate secret$/i })).toBeDisabled();
});

// ---------------------------------------------------------------------------
// Case 4 — Revoke
// ---------------------------------------------------------------------------

test('revoke: per-row Revoke DELETEs /third-party-applications/:id (no confirm today)', async ({
  adminPage,
}) => {
  await mockRegistry(adminPage, { apps: [ACME_REPORTER] });
  const cap = captureRequests(adminPage, APP_DELETE(ACME_REPORTER.id));
  await adminPage.route(APP_DELETE(ACME_REPORTER.id), async (route: Route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    await route.fulfill({ status: 204, body: '' });
  });

  // Pin: today the Revoke button fires DELETE with NO confirm dialog.
  // Track dialogs so the test fails loudly if a guard ever lands.
  const dialogMessages: string[] = [];
  adminPage.on('dialog', (dialog) => {
    dialogMessages.push(dialog.message());
    void dialog.accept();
  });

  await adminPage.goto('/control-panel/third-party-applications');
  const row = appRow(adminPage, 'Acme Reporter');
  await row.getByRole('button', { name: /^revoke$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('DELETE');

  await expect(adminPage.locator('.of-status-success').first()).toContainText(
    /revoked acme reporter/i,
  );
  expect(dialogMessages).toEqual([]);
});

// ---------------------------------------------------------------------------
// Case 5 — Absent: no active-token surface
// ---------------------------------------------------------------------------

test('absent today: live OAuth-token list, per-token revoke, token TTL counters', async ({
  adminPage,
}) => {
  await mockRegistry(adminPage, { apps: [ACME_REPORTER] });
  await adminPage.goto('/control-panel/third-party-applications');
  await expect(appRow(adminPage, 'Acme Reporter')).toBeVisible();

  // 1. No "Active tokens" / "Issued tokens" surface. The page exposes
  //    service-user grants + audit events as the inspection plane,
  //    not live OAuth access tokens.
  expect(
    await adminPage.getByRole('heading', { name: /active tokens|issued tokens|live tokens|access tokens/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('table', { name: /tokens/i }).count(),
  ).toBe(0);

  // 2. No per-token Revoke action — the per-row Revoke button is on
  //    the application, not on individual tokens.
  expect(
    await adminPage.getByRole('button', { name: /revoke token|revoke session/i }).count(),
  ).toBe(0);

  // 3. No token-TTL / token-expiry counters on the page.
  expect(
    await adminPage.getByText(/expires in|ttl|expires at/i).count(),
  ).toBe(0);

  // Sanity: the "Service user" section IS rendered for confidential
  // apps — that's the closest existing inspection plane today.
  await expect(
    adminPage.getByRole('heading', { name: /^service user$/i }),
  ).toBeVisible();
});

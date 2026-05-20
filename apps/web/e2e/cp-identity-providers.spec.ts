import { type Page, type Route } from '@playwright/test';
import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/control-panel/identity-providers`
 * (apps/web/src/routes/control-panel/IdentityProvidersPage.tsx).
 *
 * **Reality check.** The shipped page composes:
 *
 *   - A "Login troubleshoot" panel — email input + POST
 *     `/auth/sso/troubleshoot` that surfaces a colour-coded
 *     diagnostics list.
 *   - A `ProviderList` of `<article>` cards: one per registered
 *     provider, header with name/slug + per-row actions
 *     (Enable/Disable, "Refresh metadata" — SAML only, Check health,
 *     Delete). The metadata `<dl>` underneath surfaces issuer URL,
 *     SAML SSO URL / entity id, email-domain routing list, cached
 *     refresh time/error, and certificate expiry.
 *   - A "Register provider" panel — slug, display name, type
 *     (OIDC/SAML), email domains; OIDC swaps in issuer/client_id/
 *     client_secret/scopes; SAML swaps in metadata URL/entity id/SSO
 *     URL/signing certificate. Both share a JSON attribute_mapping
 *     editor (`subject`, `email`, `name`, `groups.claim`).
 *
 * What is **NOT** there (the roadmap calls for it; pin the absence so
 * a half-shipped feature surfaces immediately):
 *
 *   - JIT (just-in-time) provisioning toggle. The page maps
 *     attributes but does not expose an explicit "auto-create users
 *     on first sign-in" switch.
 *   - Dedicated group-mappings UI (regex/claim → role/group rules).
 *     Group mapping today is encoded as a single line inside the
 *     attribute-mapping JSON (`groups.claim`) — no rule builder, no
 *     per-mapping CRUD.
 *   - Delete confirmation. The Delete button calls DELETE directly;
 *     there is no `confirm()` and no in-app dialog. Pin the absence
 *     so a future destructive guard flips this assertion.
 *
 * Endpoints (mirrors `src/lib/api/auth.ts`):
 *   - GET    /api/v1/auth/sso/providers                       → SsoProviderRecord[]
 *   - POST   /api/v1/auth/sso/providers                       → SsoProviderRecord
 *   - PATCH  /api/v1/auth/sso/providers/:id                   → SsoProviderRecord
 *   - DELETE /api/v1/auth/sso/providers/:id                   → 204
 *   - POST   /api/v1/auth/sso/providers/:id/refresh-metadata  → SsoProviderRecord
 *   - GET    /api/v1/auth/sso/providers/:id/health            → SsoProviderHealth
 *   - POST   /api/v1/auth/sso/troubleshoot                    → LoginTroubleshootResponse
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

interface SsoProviderRecord {
  id: string;
  slug: string;
  name: string;
  provider_type: string;
  enabled: boolean;
  client_id: string | null;
  client_secret_configured: boolean;
  issuer_url: string | null;
  authorization_url: string | null;
  token_url: string | null;
  userinfo_url: string | null;
  scopes: string[];
  saml_metadata_url: string | null;
  saml_entity_id: string | null;
  saml_sso_url: string | null;
  saml_certificate_configured?: boolean;
  attribute_mapping: Record<string, unknown>;
  domains?: string[];
  metadata_last_refreshed_at?: string | null;
  metadata_last_error?: string | null;
  certificate_expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

const E2E_NOW = '2026-05-11T00:00:00Z';

function makeProvider(overrides: Partial<SsoProviderRecord> = {}): SsoProviderRecord {
  return {
    id: 'sso-1',
    slug: 'okta',
    name: 'Okta corporate',
    provider_type: 'oidc',
    enabled: true,
    client_id: 'oidc-client-id',
    client_secret_configured: true,
    issuer_url: 'https://example.okta.com',
    authorization_url: null,
    token_url: null,
    userinfo_url: null,
    scopes: ['openid', 'email', 'profile'],
    saml_metadata_url: null,
    saml_entity_id: null,
    saml_sso_url: null,
    saml_certificate_configured: false,
    attribute_mapping: { subject: 'sub', email: 'email' },
    domains: ['acme.com'],
    metadata_last_refreshed_at: null,
    metadata_last_error: null,
    certificate_expires_at: null,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

const OKTA = makeProvider({
  id: 'sso-1',
  slug: 'okta',
  name: 'Okta corporate',
  provider_type: 'oidc',
  enabled: true,
});

const ENTRA_SAML = makeProvider({
  id: 'sso-2',
  slug: 'entra-saml',
  name: 'Microsoft Entra (SAML)',
  provider_type: 'saml',
  enabled: false,
  client_id: null,
  client_secret_configured: false,
  issuer_url: null,
  scopes: [],
  saml_metadata_url: 'https://login.microsoftonline.com/tenantid/federationmetadata.xml',
  saml_entity_id: 'urn:foundry:e2e',
  saml_sso_url: 'https://login.microsoftonline.com/tenantid/saml2',
  saml_certificate_configured: true,
  domains: ['partner.example.com'],
  certificate_expires_at: '2027-01-01T00:00:00Z',
  metadata_last_refreshed_at: '2026-05-10T08:00:00Z',
});

/**
 * Wait until at least one POST shows up in the capture and return the
 * most recent one. Mirror of the assert-and-read flow used in the
 * projects / users specs.
 */
async function waitForPost(
  cap: ReturnType<typeof captureRequests>,
): Promise<{ method: string; body: unknown }> {
  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);
  const posts = cap.calls.filter((c) => c.method === 'POST');
  return posts[posts.length - 1];
}

// Endpoint patterns
const SSO_LIST = /\/api\/v1\/auth\/sso\/providers$/;
const SSO_TROUBLESHOOT = /\/api\/v1\/auth\/sso\/troubleshoot$/;
const SSO_HEALTH = (id: string) =>
  new RegExp(`/api/v1/auth/sso/providers/${id}/health$`);
const SSO_REFRESH_METADATA = (id: string) =>
  new RegExp(`/api/v1/auth/sso/providers/${id}/refresh-metadata$`);
const SSO_PATCH = (id: string) =>
  new RegExp(`/api/v1/auth/sso/providers/${id}$`);

/**
 * Per-test mock for the list endpoint. mockAuth installs an empty `[]`
 * mock for the same URL — we override it here (newer route handlers
 * win in Playwright's dispatch).
 */
async function mockListProviders(page: Page, items: SsoProviderRecord[]): Promise<void> {
  await page.route(SSO_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: items });
  });
}

// ---------------------------------------------------------------------------
// Case 1 — list configured IdPs (OIDC + SAML)
// ---------------------------------------------------------------------------

test('lists configured providers (OIDC + SAML) with their metadata', async ({
  adminPage,
}) => {
  await mockListProviders(adminPage, [OKTA, ENTRA_SAML]);
  await adminPage.goto('/control-panel/identity-providers');

  // Page chrome.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^identity providers$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /^← control panel$/i }),
  ).toHaveAttribute('href', /\/control-panel$/);

  // OIDC card: name + slug in the heading, "OIDC · enabled · secret configured" subtitle.
  const oktaCard = adminPage
    .getByRole('heading', { level: 3, name: /okta corporate/i })
    .locator('xpath=ancestor::article[1]');
  await expect(oktaCard).toContainText('(okta)');
  await expect(oktaCard).toContainText(/OIDC\s+·\s+enabled\s+·\s+secret configured/i);
  await expect(oktaCard).toContainText('https://example.okta.com');

  // SAML card: shows entity id, SSO URL and the metadata refresh time.
  const entraCard = adminPage
    .getByRole('heading', { level: 3, name: /microsoft entra \(saml\)/i })
    .locator('xpath=ancestor::article[1]');
  await expect(entraCard).toContainText(/SAML\s+·\s+disabled\s+·\s+certificate configured/i);
  await expect(entraCard).toContainText('urn:foundry:e2e');
  await expect(entraCard).toContainText('https://login.microsoftonline.com/tenantid/saml2');

  // Per-card action set differs by provider_type: only SAML exposes
  // "Refresh metadata"; OIDC does not.
  await expect(entraCard.getByRole('button', { name: /^refresh metadata$/i })).toBeVisible();
  await expect(oktaCard.getByRole('button', { name: /^refresh metadata$/i })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Case 2 — Add IdP (OIDC: type + issuer + client_id + secret + scopes)
// ---------------------------------------------------------------------------

test('register OIDC provider: POSTs slug + name + issuer + client_id + secret + scopes', async ({
  adminPage,
}) => {
  await mockListProviders(adminPage, []);
  const cap = captureRequests(adminPage, SSO_LIST);
  await adminPage.route(SSO_LIST, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: makeProvider({ id: 'sso-new-1', slug: 'auth0', name: 'Auth0 staging' }),
    });
  });

  await adminPage.goto('/control-panel/identity-providers');
  await expect(
    adminPage.getByRole('heading', { name: /^register provider$/i }),
  ).toBeVisible();

  // Default type is OIDC → the OIDC field group should be visible and
  // the SAML group hidden.
  await expect(adminPage.getByRole('textbox', { name: /issuer url/i })).toBeVisible();
  await expect(adminPage.getByRole('textbox', { name: /^metadata url$/i })).toHaveCount(0);

  await adminPage.getByRole('textbox', { name: /^slug$/i }).fill('auth0');
  await adminPage.getByRole('textbox', { name: /^display name$/i }).fill('Auth0 staging');
  await adminPage.getByRole('textbox', { name: /email domains/i }).fill('acme.com, partner.example.com');
  await adminPage.getByRole('textbox', { name: /issuer url/i }).fill('https://acme.auth0.com');
  await adminPage.getByRole('textbox', { name: /client id/i }).fill('auth0-client');
  // Client secret is a `type="password"` input — `getByRole('textbox')`
  // does NOT cover password inputs, so locate by label.
  await adminPage.getByLabel(/client secret/i).fill('s3cr3t');
  await adminPage.getByRole('textbox', { name: /scopes/i }).fill('openid, email');

  await adminPage.getByRole('button', { name: /^register provider$/i }).click();

  const posts = await waitForPost(cap);
  expect(posts.body).toMatchObject({
    slug: 'auth0',
    name: 'Auth0 staging',
    provider_type: 'oidc',
    enabled: true,
    client_id: 'auth0-client',
    client_secret: 's3cr3t',
    issuer_url: 'https://acme.auth0.com',
    scopes: ['openid', 'email'],
    domains: ['acme.com', 'partner.example.com'],
  });
});

test('register SAML provider: form swaps to metadata URL / entity ID / SSO URL / certificate', async ({
  adminPage,
}) => {
  await mockListProviders(adminPage, []);
  const cap = captureRequests(adminPage, SSO_LIST);
  await adminPage.route(SSO_LIST, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: makeProvider({ id: 'sso-saml-new', slug: 'entra', provider_type: 'saml' }),
    });
  });

  await adminPage.goto('/control-panel/identity-providers');

  await adminPage
    .getByRole('combobox', { name: /provider type/i })
    .selectOption('saml');

  // SAML fields swap in, OIDC fields disappear.
  await expect(
    adminPage.getByRole('textbox', { name: /^metadata url$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('textbox', { name: /entity id/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('textbox', { name: /saml sso url/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('textbox', { name: /signing certificate/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('textbox', { name: /issuer url/i }),
  ).toHaveCount(0);
  await expect(
    adminPage.getByLabel(/client secret/i),
  ).toHaveCount(0);

  await adminPage.getByRole('textbox', { name: /^slug$/i }).fill('entra');
  await adminPage.getByRole('textbox', { name: /^display name$/i }).fill('Entra SAML');
  await adminPage
    .getByRole('textbox', { name: /^metadata url$/i })
    .fill('https://login.microsoftonline.com/x/federationmetadata.xml');
  await adminPage.getByRole('textbox', { name: /entity id/i }).fill('urn:foundry:e2e');
  await adminPage
    .getByRole('textbox', { name: /saml sso url/i })
    .fill('https://login.microsoftonline.com/x/saml2');

  await adminPage.getByRole('button', { name: /^register provider$/i }).click();

  const posts = await waitForPost(cap);
  expect(posts.body).toMatchObject({
    slug: 'entra',
    name: 'Entra SAML',
    provider_type: 'saml',
    saml_metadata_url: 'https://login.microsoftonline.com/x/federationmetadata.xml',
    saml_entity_id: 'urn:foundry:e2e',
    saml_sso_url: 'https://login.microsoftonline.com/x/saml2',
  });
});

// ---------------------------------------------------------------------------
// Case 3 — Test connection (Check health + Login troubleshoot)
// ---------------------------------------------------------------------------

test('check health: GETs /providers/:id/health and renders the JSON payload', async ({
  adminPage,
}) => {
  await mockListProviders(adminPage, [OKTA]);
  const cap = captureRequests(adminPage, SSO_HEALTH(OKTA.id));
  await adminPage.route(SSO_HEALTH(OKTA.id), async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        provider_id: OKTA.id,
        provider_slug: OKTA.slug,
        provider_type: 'oidc',
        enabled: true,
        overall_status: 'ok',
        issuer_reachable: true,
        metadata_reachable: true,
        certificate_expires_at: null,
        certificate_days_left: null,
        checked_at: E2E_NOW,
      },
    });
  });

  await adminPage.goto('/control-panel/identity-providers');
  const oktaCard = adminPage
    .getByRole('heading', { level: 3, name: /okta corporate/i })
    .locator('xpath=ancestor::article[1]');

  await oktaCard.getByRole('button', { name: /^check health$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('GET');

  // The card renders the health payload as a `<pre>` block. Assert
  // the overall status string surfaces inside the card.
  await expect(oktaCard.locator('pre')).toContainText('"overall_status": "ok"');
  await expect(oktaCard.locator('pre')).toContainText('"issuer_reachable": true');
});

test('login troubleshoot: POSTs the email and renders the diagnostics list', async ({
  adminPage,
}) => {
  await mockListProviders(adminPage, [OKTA]);
  const cap = captureRequests(adminPage, SSO_TROUBLESHOOT);
  await adminPage.route(SSO_TROUBLESHOOT, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: {
        email: 'who@unknown.test',
        domain: 'unknown.test',
        state: 'unknown_domain',
        matched_providers: [],
        user_exists: false,
        user_disabled: false,
        diagnostics: [
          {
            code: 'unknown_domain',
            severity: 'error',
            message: 'No provider matches the email domain "unknown.test".',
          },
        ],
        checked_at: E2E_NOW,
      },
    });
  });

  await adminPage.goto('/control-panel/identity-providers');

  await adminPage
    .getByRole('textbox', { name: /^email$/i })
    .fill('who@unknown.test');
  await adminPage.getByRole('button', { name: /^troubleshoot$/i }).click();

  const post = await waitForPost(cap);
  expect(post.body).toMatchObject({ email: 'who@unknown.test' });

  // Diagnostics row contains the SEVERITY badge + the human message.
  await expect(adminPage.getByText(/state:\s*unknown_domain/i)).toBeVisible();
  await expect(
    adminPage.getByText(/ERROR:\s*No provider matches the email domain/i),
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// Case 6 — Enable / Disable toggle
// ---------------------------------------------------------------------------

test('enable / disable: PATCHes /providers/:id with the flipped enabled flag', async ({
  adminPage,
}) => {
  await mockListProviders(adminPage, [OKTA]);
  const cap = captureRequests(adminPage, SSO_PATCH(OKTA.id));
  await adminPage.route(SSO_PATCH(OKTA.id), async (route: Route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await route.fulfill({ json: makeProvider({ ...OKTA, enabled: false }) });
  });

  await adminPage.goto('/control-panel/identity-providers');
  const oktaCard = adminPage
    .getByRole('heading', { level: 3, name: /okta corporate/i })
    .locator('xpath=ancestor::article[1]');

  // Okta is currently enabled — the button reads "Disable".
  await oktaCard.getByRole('button', { name: /^disable$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('PATCH');
  expect(cap.last()?.body).toMatchObject({ enabled: false });
});

// ---------------------------------------------------------------------------
// "Refresh metadata" is only exposed for SAML providers — pin the
// per-type branch.
// ---------------------------------------------------------------------------

test('refresh metadata: SAML-only button POSTs /providers/:id/refresh-metadata', async ({
  adminPage,
}) => {
  await mockListProviders(adminPage, [OKTA, ENTRA_SAML]);
  const cap = captureRequests(adminPage, SSO_REFRESH_METADATA(ENTRA_SAML.id));
  await adminPage.route(SSO_REFRESH_METADATA(ENTRA_SAML.id), async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({ json: makeProvider({ ...ENTRA_SAML }) });
  });

  await adminPage.goto('/control-panel/identity-providers');
  const entraCard = adminPage
    .getByRole('heading', { level: 3, name: /microsoft entra \(saml\)/i })
    .locator('xpath=ancestor::article[1]');

  await entraCard.getByRole('button', { name: /^refresh metadata$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('POST');
});

// ---------------------------------------------------------------------------
// Case 7 — Delete (no confirm today — pin the absence)
// ---------------------------------------------------------------------------

test('delete provider: DELETEs immediately (no native confirm() today)', async ({
  adminPage,
}) => {
  await mockListProviders(adminPage, [OKTA]);
  const cap = captureRequests(adminPage, SSO_PATCH(OKTA.id));
  await adminPage.route(SSO_PATCH(OKTA.id), async (route: Route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    await route.fulfill({ status: 204, body: '' });
  });

  // Track any dialog events — none should fire today. If a future
  // version wires a confirm prompt this listener captures it so the
  // absence assertion below fails loudly.
  const dialogMessages: string[] = [];
  adminPage.on('dialog', (dialog) => {
    dialogMessages.push(dialog.message());
    void dialog.accept();
  });

  await adminPage.goto('/control-panel/identity-providers');
  const oktaCard = adminPage
    .getByRole('heading', { level: 3, name: /okta corporate/i })
    .locator('xpath=ancestor::article[1]');

  await oktaCard.getByRole('button', { name: /^delete$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('DELETE');

  // Pin the absence — Delete fires the DELETE call WITHOUT prompting.
  // When a confirm guard is added (it should be — this is a
  // destructive admin action), this assertion flips.
  expect(dialogMessages).toEqual([]);
});

// ---------------------------------------------------------------------------
// Absent-today guards — cases 4, 5, 7 (partial)
// ---------------------------------------------------------------------------

test('absent today: JIT provisioning toggle and dedicated group-mappings rule UI', async ({
  adminPage,
}) => {
  await mockListProviders(adminPage, [OKTA]);
  await adminPage.goto('/control-panel/identity-providers');
  const oktaCard = adminPage
    .getByRole('heading', { level: 3, name: /okta corporate/i })
    .locator('xpath=ancestor::article[1]');
  await expect(oktaCard).toBeVisible();

  // 1. No JIT (just-in-time) provisioning toggle anywhere on the page.
  //    The roadmap calls for an explicit "auto-create users on first
  //    sign-in" control; today the page only exposes the attribute-
  //    mapping JSON.
  expect(
    await adminPage.getByRole('checkbox', { name: /jit|just[- ]in[- ]time|auto[- ]?provision/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('switch', { name: /jit|just[- ]in[- ]time|auto[- ]?provision/i }).count(),
  ).toBe(0);

  // 2. No dedicated group-mappings UI (regex/claim → group rule
  //    builder). Mapping today is encoded as ONE field inside the
  //    `attribute_mapping` JSON editor (`groups: { claim: 'groups' }`).
  //    Pin that no rule-list / per-rule "Add mapping" / "Edit rule"
  //    surface exists.
  expect(
    await adminPage.getByRole('heading', { name: /group mappings?|claim mappings?|role mappings?/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /add (group |claim |role )?mapping|add rule/i }).count(),
  ).toBe(0);

  // 3. The "Register provider" panel exposes attribute_mapping as a
  //    JsonEditor — confirm that's what's shipped (a `<textarea>`
  //    today, replaced by Monaco lazily) rather than a richer
  //    table-driven mapper.
  await expect(adminPage.getByLabel(/attribute mapping/i)).toBeVisible();
});

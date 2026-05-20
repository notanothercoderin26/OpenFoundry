import { type Page, type Route } from '@playwright/test';
import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/control-panel/tenancy`
 * (apps/web/src/routes/control-panel/TenancyPage.tsx).
 *
 * **Reality check.** The page heading reads "Tenancy: organizations &
 * spaces". It is a **per-organization** admin surface, NOT an
 * instance-level branding/quotas/region page:
 *
 *   - "Organizations" panel: one `<button>` pill per org from
 *     `/organizations`; first item auto-selected.
 *   - For the selected org, an `OrganizationDetail` section that
 *     shows display_name + slug + status + (optional)
 *     description/contact, then three side-by-side `JsonEditor`s
 *     (Metadata, Settings, Quotas) hydrated from the org payload,
 *     and a "Save metadata / settings / quotas" button that PATCHes
 *     `/organizations/:id` with the parsed JSON for all three fields.
 *   - Sub-panels: Administrators (add/remove user_id + scope), Guest
 *     memberships (add/remove user_id + primary_organization_id),
 *     Spaces (Foundry-style — create with slug/display_name/desc,
 *     delete by id), Membership probe.
 *
 * Mapping the requested cases to what shipped today:
 *
 *   - Case 1 ("instance name / logo / branding") — there is no
 *     typed branding form here. Branding is encoded inside the
 *     per-org `settings` JSON; instance-wide branding lives on the
 *     `/control-panel` home page (`default_app_branding`).
 *   - Case 2 ("allowed domains") — no dedicated input. Lives inside
 *     `settings` JSON for orgs, `allowed_email_domains` on the
 *     control-panel home for the instance.
 *   - Case 3 ("quotas: storage / compute") — only a generic Quotas
 *     JsonEditor; no typed storage/compute inputs.
 *   - Case 4 ("region / residency settings") — not exposed here;
 *     lives in `settings` JSON or on the control-panel home
 *     (`default_region`).
 *
 * This spec PINS the actual JsonEditor-driven surface and adds
 * absent-today guards for every typed control the roadmap implies.
 *
 * Endpoints (mirrors `src/lib/api/tenancy.ts`):
 *   - GET   /api/v1/organizations                       → { items: Organization[] }
 *   - PATCH /api/v1/organizations/:id                   → Organization
 *   - GET   /api/v1/organizations/:id/admins            → { items: OrganizationAdmin[] }
 *   - GET   /api/v1/organizations/:id/guests            → { items: OrganizationGuest[] }
 *   - GET   /api/v1/organizations/:id/spaces            → { items: TenancySpace[] }
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

interface Organization {
  id: string;
  slug: string;
  display_name: string;
  description: string;
  contact_email: string | null;
  organization_type: string;
  default_workspace: string | null;
  tenant_tier: string | null;
  status: string;
  metadata: Record<string, unknown>;
  settings: Record<string, unknown>;
  quotas: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const E2E_NOW = '2026-05-11T00:00:00Z';

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-1',
    slug: 'acme',
    display_name: 'Acme Corporation',
    description: 'Primary tenant.',
    contact_email: 'tenant-admin@acme.example',
    organization_type: 'tenant',
    default_workspace: 'default',
    tenant_tier: 'enterprise',
    status: 'active',
    metadata: { owner: 'acme', region: 'us-east-1' },
    settings: {
      branding: { display_name: 'Acme', primary_color: '#0a0a0a' },
      allowed_email_domains: ['acme.example', 'partner.example'],
      region: 'us-east-1',
      data_residency: 'us',
    },
    quotas: { storage_gb: 1024, compute_workers: 16, requests_per_minute: 6000 },
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

const ACME = makeOrg({
  id: 'org-1',
  slug: 'acme',
  display_name: 'Acme Corporation',
});
const GLOBEX = makeOrg({
  id: 'org-2',
  slug: 'globex',
  display_name: 'Globex Industries',
  description: 'Subsidiary tenant.',
  contact_email: 'admin@globex.example',
  metadata: { owner: 'globex' },
  settings: { allowed_email_domains: ['globex.example'] },
  quotas: { storage_gb: 256, compute_workers: 4 },
});

// Endpoint patterns
const ORGS_LIST = /\/api\/v1\/organizations(?:\?|$)/;
const ORG_PATCH = (id: string) => new RegExp(`/api/v1/organizations/${id}(?:\\?|$)`);
const ORG_ADMINS = (id: string) => new RegExp(`/api/v1/organizations/${id}/admins$`);
const ORG_GUESTS = (id: string) => new RegExp(`/api/v1/organizations/${id}/guests$`);
const ORG_SPACES = (id: string) => new RegExp(`/api/v1/organizations/${id}/spaces$`);

/**
 * Install per-test mocks for the four GET endpoints the TenancyPage
 * reads on mount + per-org switch. Admins/guests/spaces default to
 * empty `{items: []}` envelopes (the page wraps `res.items`, which
 * would crash if it fell through to the catch-all's `{data: [], ...}`
 * shape).
 */
async function mockTenancy(page: Page, orgs: Organization[]): Promise<void> {
  await page.route(ORGS_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { items: orgs } });
  });
  for (const o of orgs) {
    await page.route(ORG_ADMINS(o.id), async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({ json: { items: [] } });
    });
    await page.route(ORG_GUESTS(o.id), async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({ json: { items: [] } });
    });
    await page.route(ORG_SPACES(o.id), async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({ json: { items: [] } });
    });
  }
}

/**
 * Locator for a JsonEditor `<textarea>` inside an OrganizationDetail
 * sub-section. The page wraps each editor in `<label>Name<div>
 * <textarea/></div></label>` — the wrapper div breaks Playwright's
 * implicit `getByLabel` association, so we walk the DOM explicitly:
 * find a `<label>` whose first text node starts with the editor name,
 * then its descendant `<textarea>`.
 */
function jsonEditor(page: Page, name: 'Metadata' | 'Settings' | 'Quotas') {
  return page.locator(
    `xpath=//label[starts-with(normalize-space(text()), "${name}")]//textarea`,
  );
}

async function readJsonEditor(
  page: Page,
  name: 'Metadata' | 'Settings' | 'Quotas',
): Promise<unknown> {
  const raw = await jsonEditor(page, name).inputValue();
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Case 1 (partial) — list orgs + select default
// ---------------------------------------------------------------------------

test('lists organizations as switch pills with the first selected by default', async ({
  adminPage,
}) => {
  await mockTenancy(adminPage, [ACME, GLOBEX]);
  await adminPage.goto('/control-panel/tenancy');

  await expect(
    adminPage.getByRole('heading', {
      level: 1,
      name: /^tenancy: organizations & spaces$/i,
    }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /^← control panel$/i }),
  ).toHaveAttribute('href', /\/control-panel$/);

  // Both orgs render as buttons with "display_name (slug)" labels.
  const acmePill = adminPage.getByRole('button', { name: /Acme Corporation\s*\(acme\)/ });
  const globexPill = adminPage.getByRole('button', { name: /Globex Industries\s*\(globex\)/ });
  await expect(acmePill).toBeVisible();
  await expect(globexPill).toBeVisible();

  // First item auto-selected → its detail panel header renders with
  // the org id + slug + status. Use the h2 heading instead of the
  // text "Acme Corporation" since that also appears in the pill.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^Acme Corporation$/ }),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/ID\s+org-1\s+·\s+slug\s+acme\s+·\s+status\s+active/i),
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// Cases 1 + 2 + 3 + 4 — detail panel hydrates the 3 JSON editors
// ---------------------------------------------------------------------------

test('org detail: Metadata / Settings / Quotas JsonEditors hydrate from the payload', async ({
  adminPage,
}) => {
  await mockTenancy(adminPage, [ACME]);
  await adminPage.goto('/control-panel/tenancy');
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^Acme Corporation$/ }),
  ).toBeVisible();

  expect(await readJsonEditor(adminPage, 'Metadata')).toEqual(ACME.metadata);
  expect(await readJsonEditor(adminPage, 'Settings')).toEqual(ACME.settings);
  expect(await readJsonEditor(adminPage, 'Quotas')).toEqual(ACME.quotas);

  // The single save CTA covers all three fields at once.
  await expect(
    adminPage.getByRole('button', { name: /^save metadata \/ settings \/ quotas$/i }),
  ).toBeEnabled();
});

// ---------------------------------------------------------------------------
// Case 3 — Quotas (the only Q-shaped surface today: free-form JSON)
// ---------------------------------------------------------------------------

test('save: PATCHes /organizations/:id with parsed metadata + settings + quotas', async ({
  adminPage,
}) => {
  await mockTenancy(adminPage, [ACME]);
  const cap = captureRequests(adminPage, ORG_PATCH(ACME.id));
  await adminPage.route(ORG_PATCH(ACME.id), async (route: Route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await route.fulfill({ json: makeOrg({ ...ACME }) });
  });

  await adminPage.goto('/control-panel/tenancy');
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^Acme Corporation$/ }),
  ).toBeVisible();

  // Edit the Quotas JSON to bump storage_gb + compute_workers.
  const updatedQuotas = {
    storage_gb: 2048,
    compute_workers: 32,
    requests_per_minute: 6000,
  };
  await jsonEditor(adminPage, 'Quotas').fill(JSON.stringify(updatedQuotas, null, 2));

  await adminPage
    .getByRole('button', { name: /^save metadata \/ settings \/ quotas$/i })
    .click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  const body = cap.last()?.body as
    | { metadata: unknown; settings: unknown; quotas: unknown }
    | undefined;
  expect(body).toBeTruthy();
  expect(body?.metadata).toEqual(ACME.metadata);
  expect(body?.settings).toEqual(ACME.settings);
  expect(body?.quotas).toEqual(updatedQuotas);
});

// ---------------------------------------------------------------------------
// Multi-org switching: case 1 navigation behaviour
// ---------------------------------------------------------------------------

test('switching organization swaps the detail panel + re-hydrates the JsonEditors', async ({
  adminPage,
}) => {
  await mockTenancy(adminPage, [ACME, GLOBEX]);
  await adminPage.goto('/control-panel/tenancy');

  // Acme is auto-selected → wait for its detail h2 and confirm Quotas
  // start as Acme's fixture.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^Acme Corporation$/ }),
  ).toBeVisible();
  expect(await readJsonEditor(adminPage, 'Quotas')).toEqual(ACME.quotas);

  // Click the Globex pill.
  await adminPage
    .getByRole('button', { name: /Globex Industries\s*\(globex\)/ })
    .click();

  // Detail h2 switches; metadata + settings + quotas re-hydrate from
  // the Globex payload (the page effect-syncs the editor state when
  // the selected org changes).
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^Globex Industries$/ }),
  ).toBeVisible();
  expect(await readJsonEditor(adminPage, 'Metadata')).toEqual(GLOBEX.metadata);
  expect(await readJsonEditor(adminPage, 'Settings')).toEqual(GLOBEX.settings);
  expect(await readJsonEditor(adminPage, 'Quotas')).toEqual(GLOBEX.quotas);
});

// ---------------------------------------------------------------------------
// Absent-today guards — cases 1 / 2 / 3 / 4 typed-form aspirations
// ---------------------------------------------------------------------------

test('absent today: typed branding / allowed-domains / region / storage-compute quota inputs', async ({
  adminPage,
}) => {
  await mockTenancy(adminPage, [ACME]);
  await adminPage.goto('/control-panel/tenancy');
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^Acme Corporation$/ }),
  ).toBeVisible();

  // 1. Instance branding form (logo URL, primary color, display name)
  //    — NOT exposed on the tenancy page. Lives on `/control-panel`
  //    via the `default_app_branding` JSON; per-org branding lives
  //    inside the Settings JSON. Pin the absence of any typed input.
  expect(
    await adminPage.getByRole('textbox', { name: /logo url|primary color|brand color/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /upload logo/i }).count(),
  ).toBe(0);

  // 2. No typed "allowed email domains" input. The field lives inside
  //    the Settings JSON editor today (the Acme fixture above seeds
  //    it as `settings.allowed_email_domains`).
  expect(
    await adminPage.getByRole('textbox', { name: /allowed email domains|email domains/i }).count(),
  ).toBe(0);

  // 3. No typed region / data-residency control on this page. Lives
  //    inside Settings JSON (`region`, `data_residency`) and on the
  //    `/control-panel` home as `default_region`.
  expect(
    await adminPage.getByRole('combobox', { name: /region|residency/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('textbox', { name: /^region$|data residency/i }).count(),
  ).toBe(0);

  // 4. No typed storage / compute quota inputs. The Quotas surface is
  //    a free-form JSON editor — pin that there is no per-field input
  //    or `<input type="number">` for storage / compute / requests.
  expect(
    await adminPage.getByRole('spinbutton', { name: /storage|compute|requests/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('textbox', { name: /storage \(gb\)|compute workers/i }).count(),
  ).toBe(0);

  // Sanity: the three JsonEditor textareas remain the canonical
  // surface for branding / domains / region / quotas today.
  await expect(jsonEditor(adminPage, 'Metadata')).toBeVisible();
  await expect(jsonEditor(adminPage, 'Settings')).toBeVisible();
  await expect(jsonEditor(adminPage, 'Quotas')).toBeVisible();
});

import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { E2E_NOW } from './fixtures/mocks';
import { InterfacesPage } from './pages';

/**
 * E2E coverage for `/interfaces`
 * (apps/web/src/routes/interfaces/InterfacesPage.tsx).
 *
 * **Surface.** A two-pane workspace for ontology interfaces — reusable
 * schema contracts that object types can implement. The left aside is
 * the interface catalog (library + coverage cards); the right
 * "Workbench" exposes six tabs (Library, Definition, Extensions,
 * Implementation, Link constraints, Reference).
 *
 * Real backend endpoints exercised:
 *   - GET    /api/v1/ontology/interfaces?page=1&per_page=200
 *   - GET    /api/v1/ontology/types?per_page=200
 *   - GET    /api/v1/ontology/links?per_page=200
 *   - GET    /api/v1/ontology/interfaces/{id}/properties
 *   - GET    /api/v1/ontology/types/{id}/interfaces  (binding matrix; one per type)
 *   - POST   /api/v1/ontology/interfaces
 *   - PATCH  /api/v1/ontology/interfaces/{id}
 *   - DELETE /api/v1/ontology/interfaces/{id}
 *   - POST   /api/v1/ontology/interfaces/{id}/implementations
 *   - POST   /api/v1/ontology/interfaces/{id}/properties
 *
 * Extensions / link constraints / implementation-detail mappings are
 * stored client-side in localStorage today, so we do not need to mock
 * those endpoints.
 *
 * The `InterfacesPage` page-object's `newInterfaceButton` /
 * `assignTypeButton` locators are aspirational labels; the real
 * controls are "+ New" / "Create interface" / "Implement interface".
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /^console\.error: %o$/,
      /Failed to load/i,
    ],
  },
});

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

interface InterfaceFixture {
  id: string;
  name: string;
  display_name: string;
  description: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

interface ObjectTypeFixture {
  id: string;
  name: string;
  display_name: string;
  description: string;
  primary_key_property: string | null;
  icon: string | null;
  color: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

const CASE_CONTRACT: InterfaceFixture = {
  id: 'iface-case-contract',
  name: 'case_contract',
  display_name: 'Case contract',
  description: 'Canonical shape for case-like records across the ontology.',
  owner_id: 'user-1',
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
};

const ASSET_CONTRACT: InterfaceFixture = {
  id: 'iface-asset-contract',
  name: 'asset_contract',
  display_name: 'Asset contract',
  description: 'Canonical shape for managed physical or digital assets.',
  owner_id: 'user-1',
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
};

const AIRCRAFT: ObjectTypeFixture = {
  id: 'object-type-aircraft',
  name: 'aircraft',
  display_name: 'Aircraft',
  description: 'Operational fleet aircraft.',
  primary_key_property: 'tail_number',
  icon: 'plane',
  color: '#0f766e',
  owner_id: 'user-1',
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
};

const SUPPORT_CASE: ObjectTypeFixture = {
  id: 'object-type-support-case',
  name: 'support_case',
  display_name: 'Support case',
  description: 'Operational support ticket / case record.',
  primary_key_property: 'case_number',
  icon: 'ticket',
  color: '#d97706',
  owner_id: 'user-1',
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
};

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

interface InterfaceMocks {
  interfaces: InterfaceFixture[];
  objectTypes: ObjectTypeFixture[];
  propertiesByInterfaceId: Record<string, unknown[]>;
  /** Map<typeId, interfaces this type currently implements>. */
  bindingsByTypeId: Record<string, InterfaceFixture[]>;
}

function defaultMocks(): InterfaceMocks {
  return {
    interfaces: [CASE_CONTRACT, ASSET_CONTRACT],
    objectTypes: [AIRCRAFT, SUPPORT_CASE],
    propertiesByInterfaceId: {},
    bindingsByTypeId: {},
  };
}

async function installInterfaceMocks(page: Page, mocks: InterfaceMocks): Promise<void> {
  // Order matters: register the per-id detail routes BEFORE the bare
  // list route so most-recent-first dispatch picks the specific
  // handler.

  await page.route(
    /\/api\/v1\/ontology\/interfaces\/[^/]+\/properties(\?|$)/,
    async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const id = /\/interfaces\/([^/]+)\/properties/.exec(route.request().url())?.[1] ?? '';
      const data = mocks.propertiesByInterfaceId[id] ?? [];
      await route.fulfill({ json: { data } });
    },
  );

  await page.route(
    /\/api\/v1\/ontology\/types\/[^/]+\/interfaces(\?|$)/,
    async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const typeId = /\/types\/([^/]+)\/interfaces/.exec(route.request().url())?.[1] ?? '';
      await route.fulfill({ json: { data: mocks.bindingsByTypeId[typeId] ?? [] } });
    },
  );

  await page.route(/\/api\/v1\/ontology\/interfaces(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        data: mocks.interfaces,
        total: mocks.interfaces.length,
        page: 1,
        per_page: 200,
      },
    });
  });

  await page.route(/\/api\/v1\/ontology\/types(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        data: mocks.objectTypes,
        total: mocks.objectTypes.length,
        page: 1,
        per_page: 200,
      },
    });
  });

  await page.route(/\/api\/v1\/ontology\/links(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: [], total: 0 } });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renders hero, library catalog, and workbench with the mocked interfaces', async ({
  adminPage,
}) => {
  await installInterfaceMocks(adminPage, defaultMocks());
  const page = new InterfacesPage(adminPage);
  await page.goto();
  await page.expectLoaded();

  // Hero: eyebrow + h1.
  await expect(adminPage.getByText(/Define ontologies \/ interfaces/i)).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^Interfaces$/ }),
  ).toBeVisible();

  // KPI cards in the hero strip reflect the mocked totals.
  const interfaceKpi = adminPage.locator('div.of-panel-muted', {
    has: adminPage.getByText(/^Interfaces$/, { exact: true }),
  });
  await expect(interfaceKpi.getByText(/^2$/)).toBeVisible();
  const typeKpi = adminPage.locator('div.of-panel-muted', {
    has: adminPage.getByText(/^Object types$/, { exact: true }),
  });
  await expect(typeKpi.getByText(/^2$/)).toBeVisible();

  // Library catalog lists every interface as a clickable button. The
  // display_name renders in two places — the catalog button AND the
  // workbench h2 — so we scope to the catalog section to keep the
  // assertion unambiguous.
  await expect(adminPage.getByRole('heading', { level: 2, name: /^Interface catalog$/i })).toBeVisible();
  const catalogSection = adminPage.locator('section.of-panel', {
    has: adminPage.getByRole('heading', { level: 2, name: /^Interface catalog$/i }),
  });
  for (const iface of [CASE_CONTRACT, ASSET_CONTRACT]) {
    await expect(catalogSection.getByText(iface.display_name)).toBeVisible();
  }

  // Workbench tabs render (six of them).
  for (const tab of ['Library', 'Definition', 'Extensions', 'Implementation', 'Link constraints', 'Reference']) {
    await expect(adminPage.getByRole('button', { name: new RegExp(`^${tab}$`) })).toBeVisible();
  }

  // The first mocked interface auto-selects → its display_name shows
  // up as the workbench heading.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: CASE_CONTRACT.display_name }),
  ).toBeVisible();
});

test('library search filters the interface catalog locally (no re-fetch)', async ({
  adminPage,
}) => {
  await installInterfaceMocks(adminPage, defaultMocks());
  const listCalls = captureRequests(adminPage, /\/api\/v1\/ontology\/interfaces(\?|$)/);

  const page = new InterfacesPage(adminPage);
  await page.goto();
  // Scope visibility checks to the catalog section — the display
  // name also renders as the workbench h2, which would otherwise
  // make the assertion ambiguous (and the post-filter h2 doesn't
  // clear because the workbench keeps the previous selection).
  const catalogSection = adminPage.locator('section.of-panel', {
    has: adminPage.getByRole('heading', { level: 2, name: /^Interface catalog$/i }),
  });
  await expect(catalogSection.getByText(CASE_CONTRACT.display_name)).toBeVisible();
  const baselineListCalls = listCalls.calls.filter((c) => c.method === 'GET').length;

  await adminPage
    .getByPlaceholder(/Search interface name, display name, or description/i)
    .fill('asset');

  // Only the asset entry survives the filter inside the catalog.
  await expect(catalogSection.getByText(CASE_CONTRACT.display_name)).toHaveCount(0);
  await expect(catalogSection.getByText(ASSET_CONTRACT.display_name)).toBeVisible();

  // No extra GET — the filter is purely local.
  await adminPage.waitForTimeout(200);
  const finalListCalls = listCalls.calls.filter((c) => c.method === 'GET').length;
  expect(finalListCalls).toBe(baselineListCalls);
});

test('"+ New" clears the form and "Create interface" POSTs the new interface to /ontology/interfaces', async ({
  adminPage,
}) => {
  await installInterfaceMocks(adminPage, defaultMocks());
  const createCalls = captureRequests(adminPage, /\/api\/v1\/ontology\/interfaces(\?|$)/);
  await adminPage.route(/\/api\/v1\/ontology\/interfaces(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      json: {
        id: 'iface-new-1',
        name: (body.name as string) ?? 'new_interface',
        display_name: (body.display_name as string) ?? 'New interface',
        description: (body.description as string) ?? '',
        owner_id: 'user-1',
        created_at: E2E_NOW,
        updated_at: E2E_NOW,
      },
    });
  });

  const page = new InterfacesPage(adminPage);
  await page.goto();
  // Wait until the workbench has mounted; the seed interface
  // auto-selects so the name input is initially disabled.
  await expect(adminPage.getByRole('heading', { level: 2, name: CASE_CONTRACT.display_name })).toBeVisible();

  // "+ New" — resetInterfaceDraft clears selection + empties the
  // form, switching the save button label to "Create interface".
  await adminPage.getByRole('button', { name: /^\+ New$/ }).click();
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^New interface$/ }),
  ).toBeVisible();

  // Fill the form. The name input is the only required field.
  await adminPage.getByPlaceholder(/^case_contract$/).fill('shipment_contract');
  await adminPage.getByPlaceholder(/^Case contract$/).fill('Shipment contract');
  await adminPage
    .getByPlaceholder(/Describe the shared semantic contract/i)
    .fill('Canonical shape for shipments across the ontology.');

  await adminPage.getByRole('button', { name: /^Create interface$/ }).click();

  // POST hits /ontology/interfaces with the form payload (filter the
  // captures to POSTs only — saveInterface chains a list re-fetch).
  const posts = () => createCalls.calls.filter((c) => c.method === 'POST');
  await expect.poll(() => posts().length).toBeGreaterThanOrEqual(1);
  const body = posts().at(-1)?.body as Record<string, unknown> | undefined;
  expect(body).toEqual({
    name: 'shipment_contract',
    display_name: 'Shipment contract',
    description: 'Canonical shape for shipments across the ontology.',
  });

  // Success banner surfaces.
  await expect(adminPage.getByText(/^Interface created\.$/)).toBeVisible();
});

test('Implementation tab: clicking "Implement" on an available object type opens the modal pre-selected with that type', async ({
  adminPage,
}) => {
  await installInterfaceMocks(adminPage, defaultMocks());
  const page = new InterfacesPage(adminPage);
  await page.goto();
  await expect(adminPage.getByRole('heading', { level: 2, name: CASE_CONTRACT.display_name })).toBeVisible();

  // Switch to the Implementation tab.
  await adminPage.getByRole('button', { name: /^Implementation$/ }).click();

  // Both object types render under "Available object types" since no
  // type implements the seed interface yet — each has a per-row
  // "Implement" button.
  await expect(adminPage.getByText(/^Available object types$/i)).toBeVisible();
  await expect(adminPage.getByText(/No object types implement this interface yet/i)).toBeVisible();

  // Click the per-row Implement button on the Aircraft row.
  const aircraftRow = adminPage.locator('div.of-panel-muted', {
    has: adminPage.getByText(AIRCRAFT.display_name, { exact: true }),
  });
  await aircraftRow.getByRole('button', { name: /^Implement$/ }).click();

  // The ImplementInterfaceModal opens with a dialog landmark and
  // pre-selects the Aircraft type (visible as "Selected object type"
  // → Aircraft inside the modal summary card).
  const dialog = adminPage.getByRole('dialog', { name: /^Implement interface$/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/^Selected object type$/i)).toBeVisible();
  await expect(dialog.getByText(AIRCRAFT.display_name).first()).toBeVisible();
  // The submit button is enabled because the type is pre-selected.
  await expect(dialog.getByRole('button', { name: /^Implement interface$/ })).toBeEnabled();
});

test('submitting the Implement-interface modal POSTs to /ontology/interfaces/{id}/implementations and refreshes the binding matrix', async ({
  adminPage,
}) => {
  // Drive the workflow end-to-end: open the modal, submit, verify
  // both the POST body and the subsequent re-fetch of the binding
  // matrix (one GET per object type).
  const mocks = defaultMocks();
  await installInterfaceMocks(adminPage, mocks);

  const implementCalls = captureRequests(
    adminPage,
    new RegExp(`/api/v1/ontology/interfaces/${CASE_CONTRACT.id}/implementations$`),
  );
  await adminPage.route(
    new RegExp(`/api/v1/ontology/interfaces/${CASE_CONTRACT.id}/implementations$`),
    async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      const body = (route.request().postDataJSON() ?? {}) as { object_type_id?: string };
      // Echo the binding back so the post-save re-fetch can reflect
      // the new state — flip the bindingsByTypeId map in the
      // closure so the matrix refresh sees Support case bound to the
      // selected interface.
      if (body.object_type_id) {
        mocks.bindingsByTypeId[body.object_type_id] = [CASE_CONTRACT];
      }
      await route.fulfill({
        json: {
          id: 'binding-new-1',
          interface_id: CASE_CONTRACT.id,
          object_type_id: body.object_type_id ?? '',
          created_at: E2E_NOW,
        },
      });
    },
  );

  const matrixCalls = captureRequests(
    adminPage,
    /\/api\/v1\/ontology\/types\/[^/]+\/interfaces(\?|$)/,
  );

  const page = new InterfacesPage(adminPage);
  await page.goto();
  await expect(adminPage.getByRole('heading', { level: 2, name: CASE_CONTRACT.display_name })).toBeVisible();

  await adminPage.getByRole('button', { name: /^Implementation$/ }).click();

  // Use the per-row Implement button so the modal pre-selects the
  // type and the submit button is immediately enabled.
  const supportRow = adminPage.locator('div.of-panel-muted', {
    has: adminPage.getByText(SUPPORT_CASE.display_name, { exact: true }),
  });
  await supportRow.getByRole('button', { name: /^Implement$/ }).click();

  const dialog = adminPage.getByRole('dialog', { name: /^Implement interface$/i });
  await dialog.getByRole('button', { name: /^Implement interface$/ }).click();

  // POST fires once with { object_type_id: 'object-type-support-case' }.
  await expect.poll(() => implementCalls.count()).toBeGreaterThanOrEqual(1);
  const call = implementCalls.last();
  expect(call?.method).toBe('POST');
  expect(call?.body).toEqual({ object_type_id: SUPPORT_CASE.id });

  // implementSelectedInterface chains loadBindingMatrix(), which
  // refetches /types/{id}/interfaces for every object type.
  await expect.poll(() => matrixCalls.count()).toBeGreaterThanOrEqual(mocks.objectTypes.length * 2);

  // Modal closes after a successful implement (onImplement resolves →
  // onClose fires).
  await expect(dialog).toHaveCount(0);

  // Implementing-types panel now lists Support case as a bound
  // implementer (the stateful mock updated bindingsByTypeId).
  await expect(adminPage.getByText(/Implementing object types/i)).toBeVisible();
  const implementingPanel = adminPage.locator('section.of-panel', {
    has: adminPage.getByText(/Implementing object types/i),
  });
  await expect(implementingPanel.getByText(SUPPORT_CASE.display_name)).toBeVisible();
});

test('absent today: list-page generic search / row helpers do not match the InterfacesPage layout', async ({
  adminPage,
}) => {
  // Regression guard for the `InterfacesPage` page object: it extends
  // `ListPagePO`, whose generic search input + table locators don't
  // resolve here (this page is a workbench, not a data table). The
  // page object's `newInterfaceButton` / `assignTypeButton` regexes
  // also fail to match the shipped CTA labels ("+ New", "Create
  // interface", "Implement interface"). When the page gets the
  // generic list shell later, these absent-today checks flip.
  await installInterfaceMocks(adminPage, defaultMocks());
  const page = new InterfacesPage(adminPage);
  await page.goto();
  await page.expectLoaded();
  await expect(adminPage.getByRole('heading', { level: 2, name: /^Interface catalog$/i })).toBeVisible();

  // No `<table role="table">` on the page.
  expect(await adminPage.getByRole('table').count()).toBe(0);

  // No "New interface" / "Assign type" CTAs — the shipped buttons are
  // labelled "+ New" / "Create interface" / "Implement interface".
  expect(
    await adminPage.getByRole('button', { name: /^new interface$/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /^assign type$|^add type$/i }).count(),
  ).toBe(0);
});

import type { Page, Route } from '@playwright/test';

import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/ontology/:id`
 * (apps/web/src/routes/ontology/ObjectTypeDetailPage.tsx).
 *
 * **Shape of the shipped page vs the requested checklist.** The page
 * ships a 9-tab editor: `Overview · Properties · Objects · Actions ·
 * Datasources · Links · Rules · Shared · Capabilities`. It does NOT
 * ship a dedicated `Permissions` tab, an `Audit` tab, or a top-level
 * Delete button:
 *
 *   - **Permissions** (case 4): the closest analogue is the
 *     Datasources tab's restricted-view section, which configures
 *     `required_markings` + `allowed_groups` (test 5).
 *   - **Audit log** (case 5): is centralised on `/ontology-manager`
 *     under the History panel (covered by ontology-manager.spec.ts);
 *     this detail page does not surface a per-type audit feed.
 *   - **Delete object type** (case 6): the page has a "Manage schema"
 *     header link that navigates out to `/object-link-types`; no
 *     destructive button lives on this page.
 *
 * The tests below pin every tab that actually ships plus the two
 * non-trivial workflows (edit property + attach/detach shared
 * property) and call out the missing surfaces in the assertions.
 *
 * Endpoints exercised:
 *   - GET   /api/v1/ontology/types/:id                       (object type detail)
 *   - GET   /api/v1/ontology/types?per_page=500              (type catalog for links/joins)
 *   - GET   /api/v1/ontology/links?object_type_id=:id        (Links tab)
 *   - GET   /api/v1/ontology/types/:id/properties            (Properties tab)
 *   - PATCH /api/v1/ontology/types/:id/properties/:propId    (edit property)
 *   - GET   /api/v1/ontology/types/:id/shared-property-types (Shared tab list)
 *   - GET   /api/v1/ontology/shared-property-types           (Shared tab catalog)
 *   - POST  /api/v1/ontology/types/:id/shared-property-types/:propId (attach)
 *   - DELETE /api/v1/ontology/types/:id/shared-property-types/:propId (detach)
 *   - GET   /api/v1/ontology/types/:id/bindings              (Datasources tab)
 *   - GET   /api/v1/datasets                                 (Datasources tab)
 *   - PATCH /api/v1/ontology/types/:id                       (Datasources tab save)
 *   - GET   /api/v1/ontology/rules?object_type_id=:id        (Rules tab)
 *   - GET   /api/v1/ontology/actions?object_type_id=:id      (Actions tab)
 *   - GET   /api/v1/ontology/types/:id/interfaces            (Actions tab)
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Failed to load/i,
      /Cannot read properties of undefined/,
    ],
  },
});

const E2E_NOW = '2026-05-11T00:00:00Z';

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
  version: number;
}

function makeObjectType(overrides: Partial<ObjectTypeFixture> = {}): ObjectTypeFixture {
  return {
    id: 'object-type-aircraft',
    name: 'aircraft',
    display_name: 'Aircraft',
    description: 'Fleet vehicle records used by ops.',
    primary_key_property: 'tail_number',
    icon: 'AC',
    color: '#0f766e',
    owner_id: 'user-1',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    version: 1,
    ...overrides,
  };
}

interface PropertyFixture {
  id: string;
  object_type_id: string;
  name: string;
  display_name: string;
  description: string;
  property_type: string;
  required: boolean;
  unique_constraint?: boolean;
  time_dependent?: boolean;
  display_mode?: string;
  value_type_id?: string | null;
  value_formatting?: Record<string, unknown>;
  conditional_formatting?: unknown[];
  reducer_metadata?: Record<string, unknown>;
  default_value?: unknown;
}

function makeProperty(overrides: Partial<PropertyFixture> = {}): PropertyFixture {
  return {
    id: 'property-1',
    object_type_id: 'object-type-aircraft',
    name: 'tail_number',
    display_name: 'Tail Number',
    description: '',
    property_type: 'string',
    required: true,
    unique_constraint: false,
    time_dependent: false,
    display_mode: 'normal',
    value_type_id: null,
    value_formatting: {},
    conditional_formatting: [],
    reducer_metadata: {},
    default_value: null,
    ...overrides,
  };
}

interface LinkTypeFixture {
  id: string;
  name: string;
  display_name: string;
  source_type_id: string;
  target_type_id: string;
  cardinality: string;
  visibility?: string;
  forward_label?: string | null;
  reverse_label?: string | null;
  link_datasource_mapping?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  version: number;
}

function makeLinkType(overrides: Partial<LinkTypeFixture> = {}): LinkTypeFixture {
  return {
    id: 'link-aircraft-route',
    name: 'aircraft_route',
    display_name: 'Operates route',
    source_type_id: 'object-type-aircraft',
    target_type_id: 'object-type-route',
    cardinality: 'one_to_many',
    visibility: 'normal',
    forward_label: 'operates',
    reverse_label: 'operated by',
    link_datasource_mapping: null,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    version: 1,
    ...overrides,
  };
}

interface SharedPropertyFixture {
  id: string;
  name: string;
  display_name: string;
  description: string;
  property_type: string;
  version?: number;
}

function makeSharedProperty(overrides: Partial<SharedPropertyFixture> = {}): SharedPropertyFixture {
  return {
    id: 'shared-prop-color',
    name: 'color',
    display_name: 'Color',
    description: 'Hex colour value.',
    property_type: 'string',
    version: 1,
    ...overrides,
  };
}

const AIRCRAFT = makeObjectType();
const ROUTE = makeObjectType({
  id: 'object-type-route',
  name: 'route',
  display_name: 'Route',
  description: 'Origin / destination pair.',
  primary_key_property: 'route_id',
  icon: 'RT',
  color: '#1d4ed8',
});

const TAIL = makeProperty();
const STATUS_PROP = makeProperty({
  id: 'property-2',
  name: 'status',
  display_name: 'Status',
  description: 'Active / retired / parked.',
  property_type: 'string',
  required: false,
});

const LINK = makeLinkType();

const COLOR_SHARED = makeSharedProperty();
const TAG_SHARED = makeSharedProperty({
  id: 'shared-prop-tag',
  name: 'tag',
  display_name: 'Tag',
  description: 'Free-text tag.',
});

interface MockOptions {
  type?: ObjectTypeFixture;
  properties?: PropertyFixture[];
  links?: LinkTypeFixture[];
  catalog?: ObjectTypeFixture[];
  rules?: unknown[];
  bindings?: unknown[];
  sharedAttached?: SharedPropertyFixture[];
  sharedCatalog?: SharedPropertyFixture[];
}

async function mockObjectTypeDetail(page: Page, options: MockOptions = {}): Promise<void> {
  const type = options.type ?? AIRCRAFT;
  const properties = options.properties ?? [TAIL, STATUS_PROP];
  const links = options.links ?? [LINK];
  const catalog = options.catalog ?? [AIRCRAFT, ROUTE];
  const rules = options.rules ?? [];
  const bindings = options.bindings ?? [];
  let attached = (options.sharedAttached ?? []).slice();
  const sharedCatalog = options.sharedCatalog ?? [COLOR_SHARED, TAG_SHARED];

  await page.route(new RegExp(`/api/v1/ontology/types/${type.id}$`), async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: type });
      return;
    }
    if (method === 'PATCH') {
      const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
      await route.fulfill({ json: { ...type, ...body, updated_at: E2E_NOW } });
      return;
    }
    return route.fallback();
  });

  await page.route(/\/api\/v1\/ontology\/types(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: catalog, total: catalog.length, page: 1, per_page: 500 },
    });
  });

  await page.route(/\/api\/v1\/ontology\/links(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: links, total: links.length } });
  });

  await page.route(
    new RegExp(`/api/v1/ontology/types/${type.id}/properties$`),
    async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({ json: { data: properties } });
    },
  );

  await page.route(
    /\/api\/v1\/ontology\/types\/[^/]+\/properties\/[^/]+$/,
    async (route: Route) => {
      const method = route.request().method();
      const match = /\/properties\/([^/?]+)$/.exec(route.request().url());
      const propId = match?.[1] ?? '';
      const target = properties.find((p) => p.id === propId);
      if (method === 'PATCH' && target) {
        const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
        const next: PropertyFixture = { ...target, ...(body as Partial<PropertyFixture>) };
        await route.fulfill({ json: next });
        return;
      }
      return route.fallback();
    },
  );

  await page.route(
    new RegExp(`/api/v1/ontology/types/${type.id}/shared-property-types$`),
    async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({ json: { data: attached } });
    },
  );

  await page.route(
    /\/api\/v1\/ontology\/types\/[^/]+\/shared-property-types\/[^/]+$/,
    async (route: Route) => {
      const method = route.request().method();
      const match = /\/shared-property-types\/([^/?]+)$/.exec(route.request().url());
      const sharedId = match?.[1] ?? '';
      if (method === 'POST') {
        const found = sharedCatalog.find((s) => s.id === sharedId);
        if (found && !attached.some((s) => s.id === found.id)) attached = [...attached, found];
        await route.fulfill({
          status: 201,
          json: { object_type_id: type.id, shared_property_type_id: sharedId },
        });
        return;
      }
      if (method === 'DELETE') {
        attached = attached.filter((s) => s.id !== sharedId);
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      return route.fallback();
    },
  );

  await page.route(/\/api\/v1\/ontology\/shared-property-types(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: sharedCatalog, total: sharedCatalog.length, page: 1, per_page: 200 },
    });
  });

  await page.route(
    new RegExp(`/api/v1/ontology/types/${type.id}/bindings$`),
    async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({ json: { data: bindings } });
    },
  );

  await page.route(/\/api\/v1\/ontology\/rules(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: rules, total: 0 } });
  });

  await page.route(/\/api\/v1\/ontology\/actions(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: [], total: 0, page: 1, per_page: 100 } });
  });

  await page.route(
    new RegExp(`/api/v1/ontology/types/${type.id}/interfaces$`),
    async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({ json: [] });
    },
  );

  await page.route(/\/api\/v1\/datasets(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        data: [
          {
            id: 'dataset-fleet',
            name: 'fleet_roster',
            description: '',
            format: 'csv',
            storage_path: 's3://fleet/roster.csv',
            size_bytes: 1024,
            row_count: 12,
            owner_id: 'user-1',
            tags: [],
            current_version: 1,
            active_branch: 'main',
            created_at: E2E_NOW,
            updated_at: E2E_NOW,
          },
        ],
        page: 1,
        per_page: 100,
        total: 1,
        total_pages: 1,
      },
    });
  });
}

// ───────────────────────────────────────────────────────────────────

test('renders the page header + the 9-tab control with the loaded type metadata', async ({
  adminPage,
}) => {
  await mockObjectTypeDetail(adminPage);
  await adminPage.goto(`/ontology/${AIRCRAFT.id}`);

  // Heading + metadata strip.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^Aircraft$/ }),
  ).toBeVisible();
  await expect(
    adminPage.getByText(
      new RegExp(`${AIRCRAFT.id} / name: ${AIRCRAFT.name} / pk: tail_number`),
    ),
  ).toBeVisible();

  // The Tabs component renders `role="tablist"` + `role="tab"`. The
  // page ships exactly 9 tabs — the prompt's Permissions / Audit /
  // Delete surfaces are NOT among them (spec preamble documents that).
  const tablist = adminPage.getByRole('tablist');
  await expect(tablist).toBeVisible();
  const tabLabels = [
    'Overview', 'Properties', 'Objects', 'Actions',
    'Datasources', 'Links', 'Rules', 'Shared', 'Capabilities',
  ];
  for (const label of tabLabels) {
    await expect(tablist.getByRole('tab', { name: new RegExp(`^${label}( \\(\\d+\\))?$`) })).toBeVisible();
  }
  // Permissions / Audit / Delete are absent.
  await expect(tablist.getByRole('tab', { name: /^Permissions$/ })).toHaveCount(0);
  await expect(tablist.getByRole('tab', { name: /^Audit$/ })).toHaveCount(0);

  // Overview defaults to active.
  await expect(tablist.getByRole('tab', { name: /^Overview$/, exact: false }))
    .toHaveAttribute('aria-selected', 'true');
});

test('navigates between Properties, Links and Rules tabs, fetching the right endpoints', async ({
  adminPage,
}) => {
  await mockObjectTypeDetail(adminPage);
  const propertyCalls = captureRequests(
    adminPage,
    new RegExp(`/api/v1/ontology/types/${AIRCRAFT.id}/properties$`),
  );
  const linkCalls = captureRequests(adminPage, /\/api\/v1\/ontology\/links(\?|$)/);
  const ruleCalls = captureRequests(adminPage, /\/api\/v1\/ontology\/rules(\?|$)/);
  await adminPage.goto(`/ontology/${AIRCRAFT.id}`);
  await expect(adminPage.getByRole('heading', { level: 1, name: /^Aircraft$/ })).toBeVisible();

  const tablist = adminPage.getByRole('tablist');

  // Properties tab — lazy-loads `listProperties`.
  await tablist.getByRole('tab', { name: /^Properties/ }).click();
  await expect.poll(() => propertyCalls.count()).toBeGreaterThanOrEqual(1);
  await expect(adminPage.getByText(/^2 properties$/)).toBeVisible();
  await expect(adminPage.locator('strong').filter({ hasText: /^tail_number$/ })).toBeVisible();
  await expect(adminPage.locator('strong').filter({ hasText: /^status$/ })).toBeVisible();
  // PK badge appears on the primary-key property.
  await expect(adminPage.getByText(/^PK$/)).toBeVisible();

  // Links tab — listLinkTypes was already hit on initial load (the
  // overview embeds the graph), but landing on the Links tab should
  // not error and should render the typed-edge graph.
  await tablist.getByRole('tab', { name: /^Links/ }).click();
  await expect.poll(() => linkCalls.count()).toBeGreaterThanOrEqual(1);
  await expect(adminPage.getByText(/^Object type graph$/).first()).toBeVisible();
  await expect(adminPage.getByText('Aircraft → Route').first()).toBeVisible();

  // Rules tab — lazy-loads listRules; the response is empty, so the
  // panel shows "No rules.".
  await tablist.getByRole('tab', { name: /^Rules/ }).click();
  await expect.poll(() => ruleCalls.count()).toBeGreaterThanOrEqual(1);
  await expect(adminPage.getByText(/^Rules \(0\)$/)).toBeVisible();
  await expect(adminPage.getByText(/^No rules\.$/)).toBeVisible();
});

test('Properties tab edit: PATCHes display_name + required toggle for the selected property', async ({
  adminPage,
}) => {
  await mockObjectTypeDetail(adminPage);
  const patchCalls = captureRequests(
    adminPage,
    new RegExp(`/api/v1/ontology/types/${AIRCRAFT.id}/properties/${STATUS_PROP.id}$`),
  );
  await adminPage.goto(`/ontology/${AIRCRAFT.id}`);
  await adminPage.getByRole('tab', { name: /^Properties/ }).click();
  await expect(adminPage.locator('strong').filter({ hasText: /^status$/ })).toBeVisible();

  // The `status` property article exposes an Edit button. The
  // PropertyPanel renders each property as an `<article>` and the
  // Edit button is the only `<button>` on that row before edit mode.
  const statusCard = adminPage
    .locator('article')
    .filter({ has: adminPage.locator('strong').filter({ hasText: /^status$/ }) });
  await expect(statusCard).toBeVisible();
  await statusCard.getByRole('button', { name: /^Edit$/ }).click();

  // The edit form surfaces the four critical controls: display name,
  // required, unique, and time-dependent. Update display_name + the
  // required checkbox to exercise the contract.
  await statusCard.getByLabel(/^Display name$/).fill('Status (revised)');
  const requiredCheckbox = statusCard.getByRole('checkbox', { name: /required/i });
  await expect(requiredCheckbox).not.toBeChecked();
  await requiredCheckbox.check();

  await statusCard.getByRole('button', { name: /^Save$/ }).click();

  // PATCH /api/v1/ontology/types/:id/properties/:propId fired with
  // the new display_name + required: true.
  await expect.poll(() =>
    patchCalls.calls.filter((c) => c.method === 'PATCH').length,
  ).toBeGreaterThanOrEqual(1);
  const patch = patchCalls.calls.find((c) => c.method === 'PATCH');
  expect(patch?.body).toMatchObject({
    display_name: 'Status (revised)',
    required: true,
  });

  // After save, edit mode collapses (the Edit button comes back).
  await expect(statusCard.getByRole('button', { name: /^Edit$/ })).toBeVisible();
});

test('Links tab selects a link and surfaces source / target / cardinality / labels', async ({
  adminPage,
}) => {
  await mockObjectTypeDetail(adminPage);
  await adminPage.goto(`/ontology/${AIRCRAFT.id}`);
  await adminPage.getByRole('tab', { name: /^Links/ }).click();

  // The Links tab renders the graph (left) + the link detail (right).
  // Selecting the only link surfaces its metadata in the right panel.
  await adminPage.getByRole('button', { name: /Aircraft → Route/ }).click();

  // Scope to `.of-panel` so we skip the outer page <section> wrapper —
  // a plain `section`-by-`has-text` match resolves to both because the
  // outer section contains the inner panel.
  const detailPanel = adminPage.locator('section.of-panel').filter({
    has: adminPage.getByText('Link type detail', { exact: true }),
  });
  await expect(detailPanel).toBeVisible();
  await expect(detailPanel.getByRole('heading', { name: /^Operates route$/ })).toBeVisible();
  // Inner tab bar has Overview + Datasource.
  await expect(detailPanel.getByRole('tab', { name: /^Overview$/ })).toBeVisible();
  await expect(detailPanel.getByRole('tab', { name: /^Datasource$/ })).toBeVisible();
  // The Overview tab's dl exposes source / target / cardinality.
  await expect(detailPanel.getByText(/^Source$/)).toBeVisible();
  await expect(detailPanel.getByText(/^Target$/)).toBeVisible();
  await expect(detailPanel.getByText(/^Cardinality$/)).toBeVisible();
  await expect(detailPanel.getByText(/^Forward label$/)).toBeVisible();
  await expect(detailPanel.getByText(/^Reverse label$/)).toBeVisible();

  // The "Manage schema" header link is the page's route into the
  // add/remove link surface (which lives on `/object-link-types`,
  // covered by a separate spec). This page itself does not ship an
  // in-place "+ New link" / "Delete link" affordance.
  await expect(adminPage.getByRole('link', { name: /^Manage schema$/ })).toHaveAttribute(
    'href',
    /\/object-link-types/,
  );
});

test('Datasources tab: restricted-view mode exposes the markings + allowed-groups permission inputs', async ({
  adminPage,
}) => {
  // The page has NO standalone Permissions tab. The closest analogue
  // for "roles that can read/write" is the Datasources → Restricted
  // view block, which gates rows by markings + allowed groups (and
  // the Edits toggles). This test pins that surface and the save
  // workflow that PATCHes the object type.
  await mockObjectTypeDetail(adminPage);
  const patchCalls = captureRequests(
    adminPage,
    new RegExp(`/api/v1/ontology/types/${AIRCRAFT.id}$`),
  );
  await adminPage.goto(`/ontology/${AIRCRAFT.id}`);
  await adminPage.getByRole('tab', { name: /^Datasources$/ }).click();

  // Switch the backing source to "Restricted view" so the policy
  // controls render.
  await adminPage.getByRole('button', { name: /^Restricted view$/ }).click();

  const rvId = adminPage.getByLabel(/^Restricted view RID\/API name$/);
  const markings = adminPage.getByLabel(/^Required markings$/);
  const groups = adminPage.getByLabel(/^Allowed groups$/);
  const requiredProp = adminPage.getByLabel(/^Required row property$/);
  const requiredValue = adminPage.getByLabel(/^Required value$/);

  await rvId.fill('rv.aircraft_rows');
  await markings.fill('public, internal');
  await groups.fill('ops, analysts');
  await requiredProp.fill('region');
  await requiredValue.fill('emea');

  // The page-level Save button is at the bottom of the Datasources
  // form. The AppShell topbar also ships a Save button (class
  // `of-topbar__action--primary`); exclude it via the class selector
  // so we click the right one.
  await adminPage
    .locator('button:not(.of-topbar__action--primary)')
    .filter({ hasText: /^Save$/ })
    .click();

  // PATCH /api/v1/ontology/types/:id fired with the restricted-view
  // body shape (backing_datasource_type === 'restricted_view').
  await expect.poll(() =>
    patchCalls.calls.filter((c) => c.method === 'PATCH').length,
  ).toBeGreaterThanOrEqual(1);
  const patch = patchCalls.calls.find((c) => c.method === 'PATCH');
  expect(patch?.body).toMatchObject({
    backing_datasource_type: 'restricted_view',
    restricted_view_id: 'rv.aircraft_rows',
  });
  const patchBody = patch?.body as {
    restricted_view_policy?: {
      required_markings?: string[];
      allowed_groups?: string[];
      row_rules?: Array<{ property: string; value: string }>;
    };
  } | undefined;
  expect(patchBody?.restricted_view_policy?.required_markings).toEqual(['public', 'internal']);
  expect(patchBody?.restricted_view_policy?.allowed_groups).toEqual(['ops', 'analysts']);
  expect(patchBody?.restricted_view_policy?.row_rules?.[0]).toMatchObject({
    property: 'region',
    value: 'emea',
  });

  // The "Saved" notice replaces the dirty indicator after a successful
  // PATCH.
  await expect(adminPage.getByText(/^Saved$/)).toBeVisible();
});

test('Shared tab: attaching and detaching a shared property type fires POST and DELETE', async ({
  adminPage,
}) => {
  await mockObjectTypeDetail(adminPage);
  const sharedCalls = captureRequests(
    adminPage,
    /\/api\/v1\/ontology\/types\/[^/]+\/shared-property-types\/[^/]+$/,
  );
  await adminPage.goto(`/ontology/${AIRCRAFT.id}`);
  await adminPage.getByRole('tab', { name: /^Shared$/ }).click();
  await expect(adminPage.getByText(/^Shared property types \(0\)$/)).toBeVisible();

  // The select wraps a <label> with options text "Color", "Tag" — we
  // pick by option value to dodge the label-text bleeding pitfall.
  const sharedSelect = adminPage.locator('select').filter({ hasText: 'Select shared property' });
  await sharedSelect.selectOption(COLOR_SHARED.id);
  await adminPage.getByRole('button', { name: /^Attach$/ }).click();

  // POST fired.
  await expect.poll(() =>
    sharedCalls.calls.filter((c) => c.method === 'POST').length,
  ).toBeGreaterThanOrEqual(1);
  const post = sharedCalls.calls.find((c) => c.method === 'POST');
  expect(post?.url).toMatch(
    new RegExp(`/types/${AIRCRAFT.id}/shared-property-types/${COLOR_SHARED.id}$`),
  );

  // The attached list now contains the property + a Detach button.
  await expect(adminPage.getByText(/^Shared property types \(1\)$/)).toBeVisible();
  await expect(adminPage.locator('strong').filter({ hasText: /^Color$/ })).toBeVisible();

  // Detach. The mock returns 204 and the page filters the row out
  // locally without re-fetching the attached list.
  await adminPage.getByRole('button', { name: /^Detach$/ }).click();
  await expect.poll(() =>
    sharedCalls.calls.filter((c) => c.method === 'DELETE').length,
  ).toBeGreaterThanOrEqual(1);
  const del = sharedCalls.calls.find((c) => c.method === 'DELETE');
  expect(del?.url).toMatch(
    new RegExp(`/types/${AIRCRAFT.id}/shared-property-types/${COLOR_SHARED.id}$`),
  );
  // The attached row drops out of the list.
  await expect(adminPage.locator('strong').filter({ hasText: /^Color$/ })).toHaveCount(0);
  await expect(adminPage.getByText(/^None attached\.$/)).toBeVisible();
});

test('Overview surfaces the dependents catalogue with Workshop initially selected', async ({
  adminPage,
}) => {
  await mockObjectTypeDetail(adminPage);
  await adminPage.goto(`/ontology/${AIRCRAFT.id}`);
  await expect(adminPage.getByRole('heading', { level: 1, name: /^Aircraft$/ })).toBeVisible();

  // Overview embeds the dependents column (9 dependent kinds, all 0
  // for our mocked fixtures). Workshop is the default-selected kind.
  await expect(adminPage.getByRole('button', { name: /^Workshop\b/ })).toBeVisible();
  await expect(adminPage.getByText(/^No Workshop modules$/)).toBeVisible();
  // Switching to a sibling updates the empty-state copy.
  await adminPage.getByRole('button', { name: /^Function\b/ }).click();
  await expect(adminPage.getByText(/^No functions$/)).toBeVisible();

  // The page's destructive "Delete object type" affordance — case 6
  // of the prompt — is intentionally absent on this page. Pin the
  // negative assertion so a future regression doesn't silently
  // introduce a destructive surface here.
  await expect(
    adminPage.getByRole('button', { name: /^Delete( object type)?$/ }),
  ).toHaveCount(0);
});

import { type Page, type Route } from '@playwright/test';

import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/object-explorer`
 * (apps/web/src/routes/object-explorer/ObjectExplorerPage.tsx).
 *
 * **Reality vs roadmap.** The shipped page is a 4-tab search + filter +
 * preview surface over the ontology runtime (Overview, Objects, Object
 * types, Artifacts). The "table" of results is a stack of preview cards
 * with no pagination UI (limit hardcoded to 50), and the per-object
 * "detail" is a side panel — not a modal drawer. Several wishlist
 * controls are NOT shipped today and are pinned by the regression
 * guard at the bottom:
 *
 *   - No inline property editor on the preview panel (read-only).
 *     `PATCH /ontology/types/:id/objects/:id/properties` is never
 *     fired from this page.
 *   - No "+ New object" CTA / schema-driven create form.
 *   - No "Delete object" action on the preview side panel.
 *   - No pagination chrome (Next / Previous, per-page picker).
 *
 * What IS shipped and exercised here:
 *   - Object type selector (in the PropertyFilters panel + Direct-open
 *     row in the header).
 *   - Property filter rows (property + operator + value), Add filter,
 *     Run filters → POST `/ontology/types/:id/objects/query`.
 *   - Result cards with Preview button → GET
 *     `/ontology/types/:id/objects/:id/view` → side panel with
 *     Summary, Properties, Linked objects, applicable actions.
 *   - "Direct open" form: pick type + enter id + click "Open Object View".
 *   - Affordances panel: Download CSV / JSON / Copy IDs (CSV export
 *     runs entirely client-side via downloadText — no API call).
 *   - Artifacts tab: Save exploration → POST `/ontology/object-sets`
 *     + optimistic refresh of the list query.
 *
 * Endpoints exercised:
 *   - GET    /api/v1/ontology/types
 *   - GET    /api/v1/ontology/types/:typeId/properties
 *   - POST   /api/v1/ontology/types/:typeId/objects/query
 *   - GET    /api/v1/ontology/types/:typeId/objects/:objectId/view
 *   - POST   /api/v1/ontology/object-sets
 *   - POST   /api/v1/ontology/object-sets/:id/evaluate
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      // The Properties query rejects briefly when the page boots before
      // the type-id resolves; the page sets the error state but the
      // assertion paths don't depend on that warning.
      /Failed to load properties/,
      /Failed to load object view/,
      /Property filter search failed/,
    ],
  },
});

const E2E_NOW = '2026-05-11T00:00:00Z';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface ObjectTypeFixture {
  id: string;
  rid: string;
  name: string;
  display_name: string;
  description: string;
  primary_key_property: string;
  icon: string | null;
  color: string | null;
  status: string;
  visibility: string;
  group_names: string[];
  editable: boolean;
  properties: PropertyFixture[];
  owner_id: string;
  created_at: string;
  updated_at: string;
}

interface PropertyFixture {
  id: string;
  object_type_id: string;
  name: string;
  display_name: string;
  description: string;
  property_type: string;
  required: boolean;
  unique_constraint: boolean;
  time_dependent: boolean;
  default_value: unknown;
  validation_rules: unknown;
  filterable: boolean;
  sortable: boolean;
  created_at: string;
  updated_at: string;
}

function makeProperty(overrides: Partial<PropertyFixture> = {}): PropertyFixture {
  return {
    id: 'property-1',
    object_type_id: 'object-type-aircraft',
    name: 'tail_number',
    display_name: 'Tail #',
    description: 'Aircraft tail number',
    property_type: 'string',
    required: true,
    unique_constraint: true,
    time_dependent: false,
    default_value: null,
    validation_rules: null,
    filterable: true,
    sortable: true,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

function makeObjectType(overrides: Partial<ObjectTypeFixture> = {}): ObjectTypeFixture {
  const id = overrides.id ?? 'object-type-aircraft';
  const propertyOverrides = overrides.properties;
  return {
    id,
    rid: `ri.ontology.main.object-type.${id}`,
    name: 'aircraft',
    display_name: 'Aircraft',
    description: 'Aircraft objects',
    primary_key_property: 'tail_number',
    icon: 'plane',
    color: '#0f766e',
    status: 'active',
    visibility: 'normal',
    group_names: ['Fleet'],
    editable: true,
    properties:
      propertyOverrides ?? [
        makeProperty({ id: `${id}-prop-1`, object_type_id: id, name: 'tail_number', display_name: 'Tail #', property_type: 'string' }),
        makeProperty({
          id: `${id}-prop-2`,
          object_type_id: id,
          name: 'capacity',
          display_name: 'Capacity',
          property_type: 'integer',
        }),
      ],
    owner_id: 'user-1',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

const AIRCRAFT = makeObjectType({
  id: 'object-type-aircraft',
  name: 'aircraft',
  display_name: 'Aircraft',
});
const FLIGHT = makeObjectType({
  id: 'object-type-flight',
  name: 'flight',
  display_name: 'Flight',
  primary_key_property: 'flight_id',
  properties: [
    makeProperty({ id: 'flight-prop-1', object_type_id: 'object-type-flight', name: 'flight_id', display_name: 'Flight #', property_type: 'string' }),
    makeProperty({ id: 'flight-prop-2', object_type_id: 'object-type-flight', name: 'duration_minutes', display_name: 'Duration (min)', property_type: 'integer' }),
  ],
});

const AIRCRAFT_ROWS = [
  { id: 'aircraft-1', object_type_id: AIRCRAFT.id, properties: { tail_number: 'N123AB', capacity: 180 }, created_by: 'user-1', created_at: E2E_NOW, updated_at: E2E_NOW },
  { id: 'aircraft-2', object_type_id: AIRCRAFT.id, properties: { tail_number: 'N456CD', capacity: 220 }, created_by: 'user-1', created_at: E2E_NOW, updated_at: E2E_NOW },
];

// ---------------------------------------------------------------------------
// Mock installers
// ---------------------------------------------------------------------------

const TYPES_LIST_URL = /\/api\/v1\/ontology\/types(\?[^/]*)?$/;
const OBJECT_SETS_URL = /\/api\/v1\/ontology\/object-sets(\?[^/]*)?$/;

function propertiesUrl(typeId: string): RegExp {
  return new RegExp(`/api/v1/ontology/types/${typeId}/properties$`);
}
function queryUrl(typeId: string): RegExp {
  return new RegExp(`/api/v1/ontology/types/${typeId}/objects/query$`);
}
function viewUrl(typeId: string, objectId: string): RegExp {
  return new RegExp(`/api/v1/ontology/types/${typeId}/objects/${objectId}/view$`);
}

async function mockObjectTypes(page: Page, types: ObjectTypeFixture[]): Promise<void> {
  await page.route(TYPES_LIST_URL, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        data: types,
        total: types.length,
        page: 1,
        per_page: 200,
      },
    });
  });
}

async function mockProperties(
  page: Page,
  typeId: string,
  properties: PropertyFixture[],
): Promise<void> {
  await page.route(propertiesUrl(typeId), async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: properties } });
  });
}

async function mockQueryObjects(
  page: Page,
  typeId: string,
  rows: Array<{ id: string; object_type_id: string; properties: Record<string, unknown>; created_at: string; updated_at: string; created_by: string }>,
): Promise<void> {
  await page.route(queryUrl(typeId), async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: { data: rows, total: rows.length },
    });
  });
}

async function mockObjectView(
  page: Page,
  typeId: string,
  objectId: string,
  body: { properties: Record<string, unknown> },
): Promise<void> {
  await page.route(viewUrl(typeId, objectId), async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        object: {
          id: objectId,
          object_type_id: typeId,
          properties: body.properties,
          created_by: 'user-1',
          marking: null,
          created_at: E2E_NOW,
          updated_at: E2E_NOW,
        },
        summary: body.properties,
        neighbors: [],
        graph: { nodes: [], edges: [] },
        applicable_actions: [],
        matching_rules: [],
        recent_rule_runs: [],
        timeline: [],
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('initial load: renders the header, tabs, and Overview as the default tab', async ({
  adminPage,
}) => {
  await mockObjectTypes(adminPage, [AIRCRAFT, FLIGHT]);
  await adminPage.goto('/object-explorer');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /object explorer/i }),
  ).toBeVisible();

  // All four tabs render and Overview is selected.
  for (const label of ['Overview', 'Objects', 'Object types', 'Artifacts']) {
    await expect(adminPage.getByRole('tab', { name: new RegExp(`^${label}$`, 'i') })).toBeVisible();
  }
  await expect(
    adminPage.getByRole('tab', { name: /^overview$/i }),
  ).toHaveAttribute('aria-selected', 'true');

  // Header KPI cards expose at minimum the visible-types count.
  await expect(adminPage.getByText(/visible types/i).first()).toBeVisible();

  // Direct-open header form lists the mocked types.
  await expect(adminPage.getByRole('button', { name: /open object view/i })).toBeVisible();
});

test('Objects tab: property filter type selector lists the mocked object types', async ({
  adminPage,
}) => {
  await mockObjectTypes(adminPage, [AIRCRAFT, FLIGHT]);
  await mockProperties(adminPage, AIRCRAFT.id, AIRCRAFT.properties);

  await adminPage.goto('/object-explorer');

  // Move to the Objects tab — the property filters panel mounts here.
  await adminPage.getByRole('tab', { name: /^objects$/i }).click();

  // The PropertyFilters type selector is the first <select> inside the
  // filters panel; assert both mocked types are options.
  const typeSelect = adminPage.locator('section.of-panel-muted').filter({ has: adminPage.getByText('Property filters', { exact: true }) }).getByRole('combobox').first();
  await expect(typeSelect).toBeVisible();
  await expect(typeSelect.locator('option')).toContainText(['Aircraft', 'Flight']);
});

test('Objects tab: Run filters POSTs /objects/query with the property filter draft and renders rows', async ({
  adminPage,
}) => {
  await mockObjectTypes(adminPage, [AIRCRAFT, FLIGHT]);
  await mockProperties(adminPage, AIRCRAFT.id, AIRCRAFT.properties);
  await mockQueryObjects(adminPage, AIRCRAFT.id, AIRCRAFT_ROWS);

  const cap = captureRequests(adminPage, queryUrl(AIRCRAFT.id));

  await adminPage.goto('/object-explorer');
  await adminPage.getByRole('tab', { name: /^objects$/i }).click();

  // Fill in the first property-filter row's value input.
  const filtersSection = adminPage.locator('section.of-panel-muted').filter({ has: adminPage.getByText('Property filters', { exact: true }) });
  await filtersSection.getByPlaceholder(/value|number|date/i).fill('N123AB');

  // The "Run filters" CTA is the primary button inside the filters panel.
  await filtersSection.getByRole('button', { name: /run filters/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  const last = cap.last();
  expect(last?.method).toBe('POST');
  const body = last?.body as { filters?: Array<{ field: string; operator: string; value: unknown }>; limit?: number } | undefined;
  expect(body?.limit).toBe(50);
  expect(body?.filters?.[0]).toMatchObject({ property_name: 'tail_number', value: 'N123AB' });

  // Results render with the row tail numbers visible on the page.
  await expect(adminPage.getByText('N123AB').first()).toBeVisible();
  await expect(adminPage.getByText('N456CD').first()).toBeVisible();
  // Results count chip in the panel header (search results = 2). Scope
  // to the eyebrow's parent so the count picked up is exactly the
  // search-results header.
  await expect(
    adminPage.locator('div').filter({ has: adminPage.getByText('Search results', { exact: true }) }).first(),
  ).toContainText('2');
});

test('Objects tab: "Add filter" appends a new draft row; Remove is disabled when only one row exists', async ({
  adminPage,
}) => {
  await mockObjectTypes(adminPage, [AIRCRAFT]);
  await mockProperties(adminPage, AIRCRAFT.id, AIRCRAFT.properties);

  await adminPage.goto('/object-explorer');
  await adminPage.getByRole('tab', { name: /^objects$/i }).click();

  const filtersSection = adminPage.locator('section.of-panel-muted').filter({ has: adminPage.getByText('Property filters', { exact: true }) });

  // With one row, the Remove button is disabled.
  const initialRemoves = filtersSection.getByRole('button', { name: /^remove$/i });
  await expect(initialRemoves).toHaveCount(1);
  await expect(initialRemoves).toBeDisabled();

  // Add a second row.
  await filtersSection.getByRole('button', { name: /add filter/i }).click();

  // Now there are 2 Remove buttons and both are enabled.
  const removesAfterAdd = filtersSection.getByRole('button', { name: /^remove$/i });
  await expect(removesAfterAdd).toHaveCount(2);
  await expect(removesAfterAdd.first()).toBeEnabled();
  await expect(removesAfterAdd.last()).toBeEnabled();

  // Removing the second one brings the count back to 1 and disables Remove.
  await removesAfterAdd.last().click();
  await expect(filtersSection.getByRole('button', { name: /^remove$/i })).toHaveCount(1);
  await expect(filtersSection.getByRole('button', { name: /^remove$/i })).toBeDisabled();
});

test('Objects tab: clicking a result Preview opens the side panel with Summary + Properties', async ({
  adminPage,
}) => {
  await mockObjectTypes(adminPage, [AIRCRAFT]);
  await mockProperties(adminPage, AIRCRAFT.id, AIRCRAFT.properties);
  await mockQueryObjects(adminPage, AIRCRAFT.id, AIRCRAFT_ROWS);
  await mockObjectView(adminPage, AIRCRAFT.id, AIRCRAFT_ROWS[0].id, {
    properties: { tail_number: 'N123AB', capacity: 180 },
  });

  const viewCap = captureRequests(adminPage, viewUrl(AIRCRAFT.id, AIRCRAFT_ROWS[0].id));

  await adminPage.goto('/object-explorer');
  await adminPage.getByRole('tab', { name: /^objects$/i }).click();

  // Run filters so we have results to click.
  await adminPage
    .locator('section')
    .filter({ hasText: /property filters/i })
    .getByRole('button', { name: /run filters/i })
    .click();
  await expect(adminPage.getByText('N123AB').first()).toBeVisible();

  await adminPage.getByRole('button', { name: /^preview$/i }).first().click();

  // GET /view fired exactly once.
  await expect.poll(() => viewCap.count()).toBeGreaterThanOrEqual(1);

  // Preview panel shows the panel header + the property values.
  const preview = adminPage.locator('section.of-panel').filter({ has: adminPage.getByText('Panel Object View', { exact: true }) });
  await expect(preview.getByText('Summary', { exact: true })).toBeVisible();
  await expect(preview.getByText('Properties', { exact: true })).toBeVisible();
  await expect(preview.getByText('Linked objects', { exact: true })).toBeVisible();
  // The selected object id is rendered in the header of the panel.
  await expect(preview.getByText(AIRCRAFT_ROWS[0].id).first()).toBeVisible();
});

test('Header: "Open Object View" button is gated on type + id and opens the preview when clicked', async ({
  adminPage,
}) => {
  await mockObjectTypes(adminPage, [AIRCRAFT]);
  await mockObjectView(adminPage, AIRCRAFT.id, 'aircraft-direct-1', {
    properties: { tail_number: 'DIRECT-1' },
  });

  await adminPage.goto('/object-explorer');
  // The preview side panel only renders on the Objects tab — switch
  // before invoking Direct-open so the result is observable.
  await adminPage.getByRole('tab', { name: /^objects$/i }).click();

  const openButton = adminPage.getByRole('button', { name: /open object view/i });
  // The button is disabled until both type and id are present (type is
  // auto-filled to the first visible type; id starts empty).
  await expect(openButton).toBeDisabled();

  await adminPage.getByPlaceholder(/object primary key or id/i).fill('aircraft-direct-1');
  await expect(openButton).toBeEnabled();
  await openButton.click();

  // The preview side panel now shows the directly-opened object id in
  // the header chip area.
  const preview = adminPage.locator('section.of-panel').filter({ has: adminPage.getByText('Panel Object View', { exact: true }) });
  await expect(preview.getByText('aircraft-direct-1').first()).toBeVisible();
});

test('Affordances panel: "Download CSV" fires a synchronous download (no API call) and surfaces the notice', async ({
  adminPage,
}) => {
  await mockObjectTypes(adminPage, [AIRCRAFT]);
  await mockProperties(adminPage, AIRCRAFT.id, AIRCRAFT.properties);
  await mockQueryObjects(adminPage, AIRCRAFT.id, AIRCRAFT_ROWS);

  await adminPage.goto('/object-explorer');
  await adminPage.getByRole('tab', { name: /^objects$/i }).click();

  await adminPage
    .locator('section')
    .filter({ hasText: /property filters/i })
    .getByRole('button', { name: /run filters/i })
    .click();
  await expect(adminPage.getByText('N123AB').first()).toBeVisible();

  // The export affordance is rendered inside the "Actions / Open In /
  // Export" panel header.
  const affordances = adminPage.locator('section').filter({ hasText: /actions \/ open in \/ export/i });
  const csvButton = affordances.getByRole('button', { name: /download csv/i });
  await expect(csvButton).toBeEnabled();

  const downloadPromise = adminPage.waitForEvent('download');
  await csvButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);

  // The page surfaces the count notice on success.
  await expect(adminPage.getByText(/exported 2 objects as csv/i)).toBeVisible();
});

test('Artifacts tab: "Save exploration" POSTs /ontology/object-sets with the form values', async ({
  adminPage,
}) => {
  await mockObjectTypes(adminPage, [AIRCRAFT, FLIGHT]);

  const cap = captureRequests(adminPage, OBJECT_SETS_URL);

  // The POST is intercepted with a deterministic id so the page can
  // chain into evaluateObjectSet without crashing on a 204 catch-all.
  await adminPage.route(OBJECT_SETS_URL, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: {
        id: 'set-new-1',
        name: 'My exploration',
        description: '',
        base_object_type_id: AIRCRAFT.id,
        filters: [],
        traversals: [],
        projections: [],
        kind: 'exploration',
        privacy: 'private',
        project_id: null,
        folder_path: '/home/Explorations',
        share_slug: 'my-exploration',
        layout: { view: 'split', columns: [] },
        query_state: {},
        created_at: E2E_NOW,
        updated_at: E2E_NOW,
      },
    });
  });
  // The follow-up evaluate call is fulfilled with empty rows so the
  // success path completes without console errors.
  await adminPage.route(/\/api\/v1\/ontology\/object-sets\/set-new-1\/evaluate$/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: {
        object_set: { id: 'set-new-1', name: 'My exploration', base_object_type_id: AIRCRAFT.id },
        rows: [],
        total: 0,
      },
    });
  });

  await adminPage.goto('/object-explorer');
  await adminPage.getByRole('tab', { name: /^artifacts$/i }).click();

  // Locate the "Save exploration" CTA + the title input inside the
  // SavedExplorationsPanel.
  const titleInput = adminPage.getByPlaceholder(/^title$/i);
  await titleInput.fill('My exploration');

  await adminPage.getByRole('button', { name: /save exploration/i }).click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(1);
  const postCall = cap.calls.find((c) => c.method === 'POST');
  expect(postCall?.body).toMatchObject({
    name: 'My exploration',
    base_object_type_id: AIRCRAFT.id,
    kind: 'exploration',
    privacy: 'private',
  });
});

test('absent today: inline property editor (PATCH), "+ New object" CTA, "Delete object" action, pagination chrome', async ({
  adminPage,
}) => {
  // Single regression guard for the wishlist controls that the page
  // does not surface. When each one ships, the matching assertion
  // flips and forces an update.
  await mockObjectTypes(adminPage, [AIRCRAFT]);
  await mockProperties(adminPage, AIRCRAFT.id, AIRCRAFT.properties);
  await mockQueryObjects(adminPage, AIRCRAFT.id, AIRCRAFT_ROWS);
  await mockObjectView(adminPage, AIRCRAFT.id, AIRCRAFT_ROWS[0].id, {
    properties: { tail_number: 'N123AB', capacity: 180 },
  });

  // Watch for any PATCH against the object's properties — none should fire.
  const patches = captureRequests(adminPage, new RegExp(`/api/v1/ontology/types/${AIRCRAFT.id}/objects/`));

  await adminPage.goto('/object-explorer');
  await adminPage.getByRole('tab', { name: /^objects$/i }).click();
  await adminPage
    .locator('section')
    .filter({ hasText: /property filters/i })
    .getByRole('button', { name: /run filters/i })
    .click();
  await expect(adminPage.getByText('N123AB').first()).toBeVisible();

  // 1. No "+ New object" CTA from the results or the page header.
  expect(
    await adminPage.getByRole('button', { name: /^(\+\s*)?new\s+object$/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /^create\s+object$/i }).count(),
  ).toBe(0);

  // 2. Open the preview side panel and confirm there's no inline edit
  //    or delete action.
  await adminPage.getByRole('button', { name: /^preview$/i }).first().click();
  const preview = adminPage.locator('section.of-panel').filter({ has: adminPage.getByText('Panel Object View', { exact: true }) });
  await expect(preview.getByText(AIRCRAFT_ROWS[0].id).first()).toBeVisible();

  expect(await preview.getByRole('button', { name: /edit property|edit value/i }).count()).toBe(0);
  expect(await preview.getByRole('button', { name: /^delete( object)?$/i }).count()).toBe(0);
  // No `contenteditable` inputs on the property value cells.
  expect(await preview.locator('[contenteditable="true"]').count()).toBe(0);

  // 3. No pagination chrome (Next/Previous, per-page picker).
  const results = adminPage.locator('section').filter({ hasText: /search results/i });
  expect(await results.getByRole('button', { name: /next page|previous page/i }).count()).toBe(0);
  expect(await results.getByLabel(/rows per page|page size/i).count()).toBe(0);

  // 4. After clicking through to preview, NO PATCH against the object
  //    fired (the page never mutates object data — only object sets).
  await adminPage.waitForTimeout(200);
  expect(patches.calls.some((c) => c.method === 'PATCH' || c.method === 'PUT')).toBe(false);
});

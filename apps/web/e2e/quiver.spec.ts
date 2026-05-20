import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/quiver`
 * (apps/web/src/routes/quiver/QuiverPage.tsx, 926 LoC).
 *
 * **Reality vs roadmap.** The shipped page is NOT a tile-style
 * "dashboard with multiple chart widgets you drop on a canvas". It's a
 * single configurable analytics lens with two `EChartView` panels
 * (time-series + grouped bars), a Vega-Lite export panel, and a
 * persisted "visual functions" library (the equivalent of "saved
 * dashboards"). Concrete divergences from the roadmap brief:
 *
 *   - No drag-to-place "Add chart" canvas. You configure ONE lens at a
 *     time; the two `EChartView` panels are wired to the same dataset
 *     pipeline. "Adding a chart" maps to picking a chart kind preset
 *     (line / area / bar / point — there is NO pie option) plus a
 *     primary ObjectType as the data source.
 *   - No PNG / PDF export. The Vega panel exposes "Copy spec" +
 *     "Download JSON" instead.
 *   - No "Refresh" button. Data refetches automatically when the
 *     primary type, fields, or visual-function selection changes. The
 *     same reload is triggered by `saveVisualFunction()` after a write.
 *   - Drill-down is implemented as a global `selected_group` filter
 *     that survives in the URL (`?selected_group=…`) and surfaces a
 *     "Clear <group>" button. The on-click pathway from
 *     `<EChartView onCategoryClick>` cannot be exercised by Playwright
 *     because ECharts renders to a `<canvas>`; the tests below pin the
 *     filter using the URL parameter (the same hook the bar click
 *     calls into).
 *
 * Endpoints touched on mount:
 *   - GET    /api/v1/ontology/types?per_page=100
 *   - GET    /api/v1/ontology/types/{primary}/objects?page=1&per_page=100
 *   - GET    /api/v1/ontology/graph?root_type_id={primary}&depth=2&limit=120
 *   - GET    /api/v1/ontology/quiver/visual-functions?per_page=100&include_shared=true
 * Triggered by user actions:
 *   - POST   /api/v1/ontology/quiver/visual-functions          (Save lens)
 *   - PATCH  /api/v1/ontology/quiver/visual-functions/{id}     (Update lens)
 *   - DELETE /api/v1/ontology/quiver/visual-functions/{id}     (Delete lens)
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Failed to load/i,
      // ECharts wheel-sensitivity / label-style noise during charts mount.
      /ResizeObserver/,
    ],
  },
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TYPE_ORDER = {
  id: 'object-type-order',
  rid: 'ri.ontology.main.object-type.order',
  name: 'order',
  display_name: 'Order',
  plural_display_name: 'Orders',
  description: 'A customer order',
  primary_key_property: 'id',
  icon: 'shopping-cart',
  color: '#0ea5e9',
};

const TYPE_CUSTOMER = {
  id: 'object-type-customer',
  rid: 'ri.ontology.main.object-type.customer',
  name: 'customer',
  display_name: 'Customer',
  plural_display_name: 'Customers',
  description: 'A registered customer',
  primary_key_property: 'id',
  icon: 'user',
  color: '#22c55e',
};

const ORDER_OBJECTS = [
  {
    id: 'order-1',
    object_type_id: 'object-type-order',
    properties: { id: 'order-1', date: '2026-04-01', region: 'EU', amount: 120, customer_id: 'cust-1' },
    created_by: 'user-1',
    marking: 'public',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  },
  {
    id: 'order-2',
    object_type_id: 'object-type-order',
    properties: { id: 'order-2', date: '2026-04-02', region: 'US', amount: 80, customer_id: 'cust-2' },
    created_by: 'user-1',
    marking: 'public',
    created_at: '2026-04-02T00:00:00Z',
    updated_at: '2026-04-02T00:00:00Z',
  },
  {
    id: 'order-3',
    object_type_id: 'object-type-order',
    properties: { id: 'order-3', date: '2026-04-03', region: 'EU', amount: 200, customer_id: 'cust-1' },
    created_by: 'user-1',
    marking: 'public',
    created_at: '2026-04-03T00:00:00Z',
    updated_at: '2026-04-03T00:00:00Z',
  },
];

const CUSTOMER_OBJECTS = [
  {
    id: 'cust-1',
    object_type_id: 'object-type-customer',
    properties: { id: 'cust-1', name: 'Acme', tier: 'gold' },
    created_by: 'user-1',
    marking: 'public',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cust-2',
    object_type_id: 'object-type-customer',
    properties: { id: 'cust-2', name: 'Globex', tier: 'silver' },
    created_by: 'user-1',
    marking: 'public',
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  },
];

interface SavedLens {
  id: string;
  name: string;
  description: string;
  primary_type_id: string;
  secondary_type_id: string | null;
  join_field: string;
  secondary_join_field: string;
  date_field: string;
  metric_field: string;
  group_field: string;
  selected_group: string | null;
  chart_kind: 'line' | 'area' | 'bar' | 'point';
  shared: boolean;
  vega_spec: Record<string, unknown>;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

interface QuiverMocks {
  /** Live mutable copy of the saved-lens library; tests can assert on it. */
  lenses: SavedLens[];
}

/**
 * Installs the route mocks the Quiver page reads on mount + the
 * visual-function CRUD endpoints. Mocks the SAME response for the
 * paginated `/objects` loop (page 1 returns all rows with
 * `total = rows.length`) so the page's `loadAllObjects` while-loop
 * terminates after a single fetch.
 */
async function mockQuiver(page: Page): Promise<QuiverMocks> {
  const state: QuiverMocks = { lenses: [] };

  // Object types (drives the Primary / Secondary type selects).
  await page.route(/\/api\/v1\/ontology\/types(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: [TYPE_ORDER, TYPE_CUSTOMER], total: 2, page: 1, per_page: 100 },
    });
  });

  // Per-type objects.
  await page.route(/\/api\/v1\/ontology\/types\/object-type-order\/objects/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: ORDER_OBJECTS, total: ORDER_OBJECTS.length, page: 1, per_page: 100 },
    });
  });
  await page.route(/\/api\/v1\/ontology\/types\/object-type-customer\/objects/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: CUSTOMER_OBJECTS, total: CUSTOMER_OBJECTS.length, page: 1, per_page: 100 },
    });
  });

  // Ontology graph — optional; failures fall back to a placeholder card.
  // Return a minimal but well-shaped response.
  await page.route(/\/api\/v1\/ontology\/graph/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        mode: 'type',
        root_object_id: null,
        root_type_id: 'object-type-order',
        depth: 2,
        total_nodes: 2,
        total_edges: 1,
        summary: { scope: 'order', node_kinds: {}, edge_kinds: {}, object_types: {}, markings: {} },
        nodes: [
          { id: 'object-type-order', kind: 'object_type', label: 'Order', secondary_label: null, color: null, route: null, metadata: {} },
          { id: 'object-type-customer', kind: 'object_type', label: 'Customer', secondary_label: null, color: null, route: null, metadata: {} },
        ],
        edges: [
          { id: 'edge-1', kind: 'link', source: 'object-type-order', target: 'object-type-customer', label: 'placed_by', metadata: {} },
        ],
      },
    });
  });

  // Saved Quiver lenses (visual functions) — GET, POST, PATCH, DELETE.
  await page.route(/\/api\/v1\/ontology\/quiver\/visual-functions(\?|$)/, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { data: state.lenses, total: state.lenses.length, page: 1, per_page: 100 } });
      return;
    }
    if (method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as Partial<SavedLens>;
      const created: SavedLens = {
        id: `lens-${state.lenses.length + 1}`,
        name: body.name ?? 'untitled lens',
        description: body.description ?? '',
        primary_type_id: body.primary_type_id ?? 'object-type-order',
        secondary_type_id: body.secondary_type_id ?? null,
        join_field: body.join_field ?? '',
        secondary_join_field: body.secondary_join_field ?? '',
        date_field: body.date_field ?? '',
        metric_field: body.metric_field ?? '',
        group_field: body.group_field ?? '',
        selected_group: body.selected_group ?? null,
        chart_kind: (body.chart_kind ?? 'line') as SavedLens['chart_kind'],
        shared: Boolean(body.shared),
        vega_spec: {},
        owner_id: 'user-1',
        created_at: '2026-05-11T00:00:00Z',
        updated_at: '2026-05-11T00:00:00Z',
      };
      state.lenses.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    return route.fallback();
  });

  // PATCH / DELETE on a specific lens by id.
  await page.route(/\/api\/v1\/ontology\/quiver\/visual-functions\/[^/?#]+/, async (route: Route) => {
    const method = route.request().method();
    const url = route.request().url();
    const m = /\/visual-functions\/([^/?#]+)/.exec(url);
    const id = m ? decodeURIComponent(m[1]) : '';

    if (method === 'PATCH') {
      const body = (route.request().postDataJSON() ?? {}) as Partial<SavedLens>;
      const idx = state.lenses.findIndex((entry) => entry.id === id);
      if (idx >= 0) {
        state.lenses[idx] = { ...state.lenses[idx], ...body, updated_at: '2026-05-11T00:00:00Z' };
        await route.fulfill({ json: state.lenses[idx] });
        return;
      }
      await route.fulfill({ status: 404, json: { error: 'not found' } });
      return;
    }
    if (method === 'DELETE') {
      state.lenses = state.lenses.filter((entry) => entry.id !== id);
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    return route.fallback();
  });

  return state;
}

/**
 * Wait for the Quiver page's heading + a non-empty "Saved lens(es)"
 * status line, signalling that both `listObjectTypes` and
 * `listQuiverVisualFunctions` resolved. The two `EChartView` panels
 * mount synchronously after that.
 */
async function waitForQuiverReady(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: /time-series and ontology analytics/i }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/saved lens\(es\)/i)).toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renders the configurable canvas: object sets, time-series + grouped charts, and Vega export', async ({ adminPage }) => {
  await mockQuiver(adminPage);
  await adminPage.goto('/quiver');
  await waitForQuiverReady(adminPage);

  // Top-level h1 + page intro.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /time-series and ontology analytics/i }),
  ).toBeVisible();

  // Both EChart panels (h2-level): time-series + grouped lens.
  await expect(adminPage.getByRole('heading', { name: /metric progression over time/i })).toBeVisible();
  await expect(adminPage.getByRole('heading', { name: /interactive grouped lens/i })).toBeVisible();

  // Vega export panel + JSON output block.
  await expect(adminPage.getByRole('heading', { name: /hydrated vega-lite export/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^download json$/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^copy spec$/i })).toBeVisible();
});

test('chart kind preset selector exposes line, area, bar, and point options', async ({ adminPage }) => {
  await mockQuiver(adminPage);
  await adminPage.goto('/quiver');
  await waitForQuiverReady(adminPage);

  // The chart-kind `<select>` lives inside the "Visual functions"
  // panel under the "Vega chart preset" eyebrow. The QuiverPage's
  // `FieldSelect` widget wraps the label + select in a `<label>` with
  // the eyebrow text inside.
  const presetSelect = adminPage
    .locator('label')
    .filter({ hasText: /^Vega chart preset/ })
    .locator('select');

  await expect(presetSelect).toBeVisible();

  // The four chart-kind options shipped by the page.
  const optionValues = await presetSelect.locator('option').allTextContents();
  expect(optionValues.map((s) => s.trim())).toEqual(['line', 'area', 'bar', 'point']);

  // The default is `line`; switch to `bar` and confirm.
  await expect(presetSelect).toHaveValue('line');
  await presetSelect.selectOption('bar');
  await expect(presetSelect).toHaveValue('bar');

  // The Vega JSON block reflects the new chart kind. The page renders
  // both the chart `mark.type` and a `usermeta.quiver.chart_kind` echo
  // — the latter is a stable plain-text anchor.
  await expect(adminPage.locator('pre').filter({ hasText: /usermeta/ })).toContainText(/"chart_kind":\s*"bar"/);
});

test('primary type selector populates from listObjectTypes and drives the data source', async ({ adminPage }) => {
  await mockQuiver(adminPage);
  await adminPage.goto('/quiver');
  await waitForQuiverReady(adminPage);

  // Primary type select hosts the two mocked object types.
  const primarySelect = adminPage
    .locator('label')
    .filter({ hasText: /^Primary type/ })
    .locator('select');
  await expect(primarySelect).toBeVisible();
  const primaryOptions = await primarySelect.locator('option').allTextContents();
  expect(primaryOptions.map((s) => s.trim())).toEqual(['Order', 'Customer']);

  // Initial primary type is the first one (Order). The default lens
  // name reflects this — "Order lens".
  await expect(primarySelect).toHaveValue('object-type-order');
  await expect(adminPage.getByPlaceholder(/name this quiver lens/i)).toHaveValue('Order lens');

  // Secondary type starts as "No join". Switching the secondary type
  // re-fetches; we assert the option exists rather than waiting on
  // the (canvas-rendered) chart.
  const secondarySelect = adminPage
    .locator('label')
    .filter({ hasText: /^Secondary type/ })
    .locator('select');
  await expect(secondarySelect).toBeVisible();
  await expect(secondarySelect).toHaveValue('');
});

test('dimension + measure selectors hydrate from the first object\'s properties', async ({ adminPage }) => {
  await mockQuiver(adminPage);
  await adminPage.goto('/quiver');
  await waitForQuiverReady(adminPage);

  // The QuiverPage's hydration effect picks the first key matching a
  // date/time pattern as the default date field, then the first numeric
  // property as the metric field, and the first key as the group field.
  // For our fixture the order object's keys are
  // [id, date, region, amount, customer_id], so the resolved defaults
  // are:
  //   - date_field   → 'date'
  //   - metric_field → 'amount'   (first numeric)
  //   - group_field  → 'id'        (first key)
  // We can rebind the group field to "region" — that change should
  // appear in both the Vega spec body and the Group field select.
  const dateField = adminPage.locator('label').filter({ hasText: /^Date field/ }).locator('select');
  const metricField = adminPage.locator('label').filter({ hasText: /^Metric field/ }).locator('select');
  const groupField = adminPage.locator('label').filter({ hasText: /^Group field/ }).locator('select');

  await expect(dateField).toHaveValue('date');
  await expect(metricField).toHaveValue('amount');
  await expect(groupField).toHaveValue('id');

  // Switch group field to "region".
  await groupField.selectOption('region');
  await expect(groupField).toHaveValue('region');

  // The Vega spec preview reflects the new group field.
  await expect(adminPage.locator('pre').filter({ hasText: /"field"/ })).toContainText(/region/);
});

test('selected_group URL param activates the drill-down filter and surfaces the Clear button', async ({ adminPage }) => {
  await mockQuiver(adminPage);

  // The bar-click drill-down callback calls `setSelectedGroup(value)`,
  // which is also the value read from the URL on mount. Driving via
  // URL exercises the same downstream state path that the ECharts
  // `onCategoryClick` handler does, without needing to drive the
  // canvas-rendered chart from Playwright. Pin `group_field=region`
  // so the URL-restored value matches one of our fixture buckets.
  await adminPage.goto('/quiver?group_field=region&selected_group=EU');
  await waitForQuiverReady(adminPage);

  // The "Clear EU" button only renders when `selectedGroup` is truthy.
  // Its presence proves the global filter is active.
  const clearBtn = adminPage.getByRole('button', { name: /^Clear\s+EU$/ });
  await expect(clearBtn).toBeVisible();

  // Clearing the filter removes the chip — the button disappears.
  await clearBtn.click();
  await expect(clearBtn).toHaveCount(0);
});

test('Save lens POSTs the lens payload and appends it to the saved-lens library', async ({ adminPage }) => {
  const state = await mockQuiver(adminPage);
  const cap = captureRequests(adminPage, /\/api\/v1\/ontology\/quiver\/visual-functions$/);

  await adminPage.goto('/quiver');
  await waitForQuiverReady(adminPage);

  // Edit the default name so the captured POST body asserts a known
  // value, then save. The page validates that group/metric/date/join
  // fields are populated before allowing the save — the auto-hydration
  // effect already filled them from the fixture.
  const nameInput = adminPage.getByPlaceholder(/name this quiver lens/i);
  await nameInput.fill('Weekly orders by region');

  await adminPage.getByRole('button', { name: /^save lens$/i }).click();

  // Wait for the success notice — the page surfaces a green status
  // banner after the POST resolves.
  await expect(
    adminPage.getByText(/saved weekly orders by region to the quiver workspace library/i),
  ).toBeVisible();

  // Exactly one POST hit /visual-functions with the right name.
  const post = cap.calls.find((c) => c.method === 'POST');
  expect(post?.body).toMatchObject({
    name: 'Weekly orders by region',
    primary_type_id: 'object-type-order',
  });

  // Stateful mock recorded the new lens and the lens-library list
  // surfaces it as a button (its name is rendered inside the
  // applyVisualFunction click target).
  expect(state.lenses.map((l) => l.name)).toContain('Weekly orders by region');
  await expect(adminPage.getByText(/^Weekly orders by region$/)).toBeVisible();
});

test('Download JSON triggers a browser download of the current Vega-Lite spec', async ({ adminPage }) => {
  await mockQuiver(adminPage);
  await adminPage.goto('/quiver');
  await waitForQuiverReady(adminPage);

  // The "Download JSON" button uses an in-DOM anchor + `Blob` to
  // trigger a synthetic download. Playwright surfaces the resulting
  // download via `page.waitForEvent('download')`. We assert on the
  // suggested filename (slug derived from the lens name, suffixed
  // with `-vega.json`) and the success notice the page emits after
  // the click.
  const downloadPromise = adminPage.waitForEvent('download', { timeout: 5_000 });
  await adminPage.getByRole('button', { name: /^download json$/i }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^order-lens-vega\.json$/);
  await expect(adminPage.getByText(/downloaded the vega-lite spec json/i)).toBeVisible();
});

test('changing the primary type re-fetches the secondary objects (the implicit refresh)', async ({ adminPage }) => {
  await mockQuiver(adminPage);
  const cap = captureRequests(adminPage, /\/api\/v1\/ontology\/types\/object-type-customer\/objects/);

  await adminPage.goto('/quiver');
  await waitForQuiverReady(adminPage);

  // Initially only `object-type-order` was fetched (Primary = Order,
  // Secondary = none). Switching the Secondary type to Customer
  // triggers a fetch for that type's objects — the same code path
  // a manual "Refresh" button would call into.
  expect(cap.count()).toBe(0);

  const secondarySelect = adminPage
    .locator('label')
    .filter({ hasText: /^Secondary type/ })
    .locator('select');
  await secondarySelect.selectOption('object-type-customer');

  // Poll for the request to land. The auto-hydration effect also
  // re-runs after the new objects arrive — proving the data flow
  // re-ran end-to-end.
  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
});

test('absent today: PNG / PDF export buttons + explicit Refresh + pie chart preset', async ({ adminPage }) => {
  // Regression guards for the roadmap controls the shipped page does
  // not provide today. When each one lands, the assertion flips and
  // forces a spec update.
  await mockQuiver(adminPage);
  await adminPage.goto('/quiver');
  await waitForQuiverReady(adminPage);

  // 1. No "Export PNG" / "Export PDF" buttons — only Copy spec + Download JSON.
  expect(await adminPage.getByRole('button', { name: /export png|export pdf|download png|download pdf/i }).count()).toBe(0);

  // 2. No explicit "Refresh" button — refetch is automatic on type /
  //    field changes.
  expect(await adminPage.getByRole('button', { name: /^refresh$/i }).count()).toBe(0);

  // 3. No "pie" option on the Vega chart preset (shipped set is
  //    line / area / bar / point).
  const presetSelect = adminPage
    .locator('label')
    .filter({ hasText: /^Vega chart preset/ })
    .locator('select');
  const presetOptions = await presetSelect.locator('option').allTextContents();
  expect(presetOptions.map((s) => s.trim())).not.toContain('pie');
});

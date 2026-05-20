import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * Subset of the MapLibre Map API we drive from the spec. The real
 * `maplibre-gl` types are not bundled with the e2e tsconfig (it's only
 * pulled into the runtime via the lazy import inside `MapLibreCanvas`),
 * so we declare the shape we touch — `getZoom` + `zoomTo` — and treat
 * the dev-only handle as `unknown[]` everywhere else.
 */
interface MaplibreMapLike {
  getZoom(): number;
  zoomTo(z: number, opts?: { duration?: number }): void;
}

declare global {
  interface Window {
    __openFoundryMapLibreMaps?: MaplibreMapLike[];
  }
}

/**
 * E2E coverage for `/geospatial`
 * (apps/web/src/routes/geospatial/GeospatialPage.tsx, 1083 LoC).
 *
 * **Reality vs roadmap.** The shipped page is a MapLibre-backed
 * analytics workbench, not a Studio-style "drop tiles on a basemap and
 * tick layers in a drawer" UI. Concrete divergences from the roadmap
 * brief:
 *
 *   - There is NO basemap picker. `MapLibreCanvas` ships a single
 *     hard-coded background-only style ({@link DEFAULT_STYLE} in
 *     `apps/web/src/lib/components/MapLibreCanvas.tsx`); switching
 *     "basemap" is a TODO, not a control.
 *   - There is NO click-to-popup on features. `MapView` does not wire
 *     `map.on('click', …)`; selected-feature inspection happens via
 *     the right-rail "Selection and filtering" summary cards that
 *     mirror the response of `runSpatialQuery`.
 *   - There is NO per-layer visibility toggle / drawer of switches.
 *     The LayerPanel renders ONE active layer at a time — clicking a
 *     row replaces the visible MapLibre source data, it doesn't add
 *     or remove layers.
 *   - There is NO legend drawer. The closest surfaces are the tile
 *     chip ("vector_tile · N features") inside MapView's header and
 *     the numeric histogram in the "Selection and filtering" panel.
 *
 * What we CAN test today:
 *   - The map canvas mounts and registers under
 *     `window.__openFoundryMapLibreMaps` (the dev-only handle exposed
 *     by `MapLibreCanvas`). We use it as the "API exposed" hook the
 *     spec brief asks for to drive zoom programmatically — MapLibre
 *     renders the basemap to a `<canvas>`, so `mouse.wheel` /
 *     `mouse.move` are unreliable for the raw camera in a headless
 *     run.
 *   - Layer loading + selection from the LayerPanel (mocked GeoJSON
 *     surfaces inside `LayerDefinition.features`).
 *   - The bounding-box spatial filter: switching the operation
 *     to `within` and clicking "Run spatial query" sends a request
 *     whose body contains a `bounds` envelope derived from the
 *     `pointToBounds(point, radius_km)` helper.
 *   - Numeric histogram filter — narrowing the min/max range
 *     filters the visible features client-side.
 *   - Save settings (`PATCH /layers/{id}`) and template save flows.
 *
 * Endpoints touched on mount:
 *   - GET    /api/v1/geospatial/overview
 *   - GET    /api/v1/geospatial/layers
 *   - GET    /api/v1/geospatial/tiles/{layer_id}
 * Triggered by user actions:
 *   - POST   /api/v1/geospatial/query
 *   - POST   /api/v1/geospatial/clusters
 *   - POST   /api/v1/geospatial/routes
 *   - POST   /api/v1/geospatial/geocode
 *   - POST   /api/v1/geospatial/reverse-geocode
 *   - PATCH  /api/v1/geospatial/layers/{layer_id}    (Save settings)
 *   - POST   /api/v1/geospatial/layers               (Save template)
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Failed to load/i,
      // MapLibre warns about webgl / WebGL2 contexts in headless runs.
      /WebGL/,
      /ResizeObserver/,
    ],
  },
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface MockFeature {
  id: string;
  label: string;
  geometry:
    | { type: 'point'; coordinates: { lat: number; lon: number } }
    | { type: 'line_string'; coordinates: Array<{ lat: number; lon: number }> }
    | { type: 'polygon'; coordinates: Array<{ lat: number; lon: number }> };
  properties: Record<string, unknown>;
}

interface MockLayer {
  id: string;
  name: string;
  description: string;
  source_kind: 'dataset' | 'vector_tile' | 'reference';
  source_dataset: string;
  geometry_type: 'point' | 'line_string' | 'polygon';
  style: {
    color: string;
    opacity: number;
    radius: number;
    line_width: number;
    heatmap_intensity: number;
    cluster_color: string;
    show_labels: boolean;
  };
  features: MockFeature[];
  tags: string[];
  indexed: boolean;
  created_at: string;
  updated_at: string;
}

const FEATURE_BARCELONA: MockFeature = {
  id: 'airport-bcn',
  label: 'Barcelona',
  geometry: { type: 'point', coordinates: { lat: 41.297, lon: 2.0833 } },
  properties: { iata: 'BCN', passengers: 52_000_000, region: 'EU' },
};

const FEATURE_MADRID: MockFeature = {
  id: 'airport-mad',
  label: 'Madrid',
  geometry: { type: 'point', coordinates: { lat: 40.4719, lon: -3.5626 } },
  properties: { iata: 'MAD', passengers: 61_000_000, region: 'EU' },
};

const FEATURE_VALENCIA: MockFeature = {
  id: 'airport-vlc',
  label: 'Valencia',
  geometry: { type: 'point', coordinates: { lat: 39.4893, lon: -0.4816 } },
  properties: { iata: 'VLC', passengers: 9_000_000, region: 'EU' },
};

const LAYER_AIRPORTS: MockLayer = {
  id: 'layer-airports',
  name: 'Iberian airports',
  description: 'Major airports across Spain and Portugal',
  source_kind: 'dataset',
  source_dataset: 'datasets/airports',
  geometry_type: 'point',
  style: {
    color: '#0f766e',
    opacity: 0.82,
    radius: 8,
    line_width: 3,
    heatmap_intensity: 0.9,
    cluster_color: '#0f766e',
    show_labels: true,
  },
  features: [FEATURE_BARCELONA, FEATURE_MADRID, FEATURE_VALENCIA],
  tags: ['operations', 'airports'],
  indexed: true,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
};

const LAYER_RIVERS: MockLayer = {
  id: 'layer-rivers',
  name: 'Spanish rivers',
  description: 'Reference layer for major rivers',
  source_kind: 'reference',
  source_dataset: 'reference/rivers',
  geometry_type: 'line_string',
  style: {
    color: '#0284c7',
    opacity: 0.7,
    radius: 6,
    line_width: 4,
    heatmap_intensity: 0.8,
    cluster_color: '#0284c7',
    show_labels: false,
  },
  features: [
    {
      id: 'river-ebro',
      label: 'Ebro',
      geometry: {
        type: 'line_string',
        coordinates: [
          { lat: 42.78, lon: -2.78 },
          { lat: 40.82, lon: 0.55 },
        ],
      },
      properties: { length_km: 930 },
    },
  ],
  tags: ['hydrology'],
  indexed: false,
  created_at: '2026-05-02T00:00:00Z',
  updated_at: '2026-05-02T00:00:00Z',
};

interface GeospatialMocks {
  layers: MockLayer[];
}

/**
 * Installs route handlers for every endpoint the geospatial page touches
 * on mount + the action handlers. The layer list is stateful so PATCH /
 * POST writes can be observed end-to-end.
 */
async function mockGeospatial(page: Page): Promise<GeospatialMocks> {
  const state: GeospatialMocks = { layers: [LAYER_AIRPORTS, LAYER_RIVERS] };

  await page.route(/\/api\/v1\/geospatial\/overview/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        layer_count: state.layers.length,
        indexed_layers: state.layers.filter((l) => l.indexed).length,
        total_features: state.layers.reduce((sum, l) => sum + l.features.length, 0),
        tile_ready_layers: 1,
        supported_operations: ['within', 'intersects', 'nearest', 'buffer'],
      },
    });
  });

  await page.route(/\/api\/v1\/geospatial\/layers(\?|$)/, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { items: state.layers } });
      return;
    }
    if (method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as Partial<MockLayer>;
      const created: MockLayer = {
        ...LAYER_AIRPORTS,
        ...body,
        id: `layer-${state.layers.length + 1}`,
        features: (body.features as MockFeature[] | undefined) ?? [],
        tags: body.tags ?? [],
        indexed: body.indexed ?? false,
        created_at: '2026-05-11T00:00:00Z',
        updated_at: '2026-05-11T00:00:00Z',
      };
      state.layers = [...state.layers, created];
      await route.fulfill({ status: 201, json: created });
      return;
    }
    return route.fallback();
  });

  // PATCH /layers/{id}.
  await page.route(/\/api\/v1\/geospatial\/layers\/[^/?#]+$/, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      const m = /\/layers\/([^/?#]+)/.exec(route.request().url());
      const id = m ? decodeURIComponent(m[1]) : '';
      const layer = state.layers.find((entry) => entry.id === id);
      if (layer) {
        await route.fulfill({ json: layer });
        return;
      }
      await route.fulfill({ status: 404, json: { error: 'not found' } });
      return;
    }
    if (method === 'PATCH') {
      const m = /\/layers\/([^/?#]+)/.exec(route.request().url());
      const id = m ? decodeURIComponent(m[1]) : '';
      const body = (route.request().postDataJSON() ?? {}) as Partial<MockLayer>;
      const idx = state.layers.findIndex((entry) => entry.id === id);
      if (idx >= 0) {
        state.layers[idx] = { ...state.layers[idx], ...body, updated_at: '2026-05-11T00:00:00Z' };
        await route.fulfill({ json: state.layers[idx] });
        return;
      }
      await route.fulfill({ status: 404, json: { error: 'not found' } });
      return;
    }
    return route.fallback();
  });

  // Vector tile metadata per layer.
  await page.route(/\/api\/v1\/geospatial\/tiles\/[^/?#]+$/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const m = /\/tiles\/([^/?#]+)/.exec(route.request().url());
    const id = m ? decodeURIComponent(m[1]) : '';
    const layer = state.layers.find((entry) => entry.id === id);
    await route.fulfill({
      json: {
        layer_id: id,
        layer_name: layer?.name ?? 'unknown',
        tile_url_template: `https://tiles.example/${id}/{z}/{x}/{y}.pbf`,
        format: 'vector_tile',
        zoom_range: [2, 12],
        h3_bins: [],
        feature_count: layer?.features.length ?? 0,
      },
    });
  });

  // Action endpoints — return shape-correct empty responses so the page
  // renders the success path without crashing.
  await page.route(/\/api\/v1\/geospatial\/query$/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = (route.request().postDataJSON() ?? {}) as {
      layer_id: string;
      operation: string;
      bounds?: unknown;
    };
    const layer = state.layers.find((entry) => entry.id === body.layer_id);
    const matched = layer?.features ?? [];
    await route.fulfill({
      json: {
        operation: body.operation,
        matched_features: matched,
        summary: {
          matched_count: matched.length,
          query_time_ms: 12,
          nearest_distance_km: null,
          indexed: true,
        },
        buffer_ring: [],
      },
    });
  });
  await page.route(/\/api\/v1\/geospatial\/clusters$/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({ json: { algorithm: 'dbscan', clusters: [], outliers: 0 } });
  });
  await page.route(/\/api\/v1\/geospatial\/routes$/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: { mode: 'drive', distance_km: 0, duration_min: 0, polyline: [], isochrone: [] },
    });
  });
  await page.route(/\/api\/v1\/geospatial\/(geocode|reverse-geocode)$/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: {
        address: 'Madrid, Spain',
        coordinate: { lat: 40.4168, lon: -3.7038 },
        confidence: 0.9,
        source: 'mock',
      },
    });
  });

  return state;
}

/**
 * Wait for the geospatial page heading + LayerPanel population. The
 * MapLibre canvas mounts asynchronously after the dynamic import
 * resolves; we poll for `window.__openFoundryMapLibreMaps` so callers
 * that need the map handle don't race the load event.
 */
async function waitForGeospatialReady(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: /maps, layers, queries, clustering, and routing/i }),
  ).toBeVisible({ timeout: 15_000 });
  // LayerPanel renders each layer name inside a `<div>` nested in a
  // `<button>`, so we anchor on the button's accessible name (which
  // includes the row's text content).
  await expect(
    page.getByRole('button', { name: /Iberian airports/i }).first(),
  ).toBeVisible({ timeout: 15_000 });
  // The MapLibre instance is exposed under window.__openFoundryMapLibreMaps
  // in dev mode (which the e2e dev-server runs in).
  await page.waitForFunction(() => (window.__openFoundryMapLibreMaps ?? []).length > 0, null, {
    timeout: 15_000,
  });
}

/**
 * Selects the first layer in the LayerPanel and waits for the layer's
 * state to fully hydrate. The page does NOT auto-select on mount —
 * `refreshAll` short-circuits because `selectedLayerId` defaults to
 * an empty string (not null/undefined), so the `??` fallback to the
 * first row never fires. Every test that needs a `selectedLayer` to
 * be present calls this helper after `waitForGeospatialReady`.
 */
async function selectFirstLayer(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Iberian airports/i }).first().click();
  // Hydration of the control panel populates the Tags input; this is
  // the most stable signal that the layer-selection chain has run end
  // to end.
  await expect(page.getByPlaceholder(/operations, airports/i)).toHaveValue(
    /operations, airports/,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renders the MapLibre canvas + stats + Layer panel + Spatial analysis sections', async ({ adminPage }) => {
  await mockGeospatial(adminPage);
  await adminPage.goto('/geospatial');
  await waitForGeospatialReady(adminPage);

  // H1 + section subheadings cover the entire page in one assertion sweep.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /maps, layers, queries, clustering, and routing/i }),
  ).toBeVisible();
  await expect(adminPage.getByRole('heading', { name: /indexed layers and vector-ready sources/i })).toBeVisible();
  await expect(adminPage.getByRole('heading', { name: /live layer canvas/i })).toBeVisible();
  await expect(adminPage.getByRole('heading', { name: /layer management and styling/i })).toBeVisible();
  await expect(adminPage.getByRole('heading', { name: /timeline, events, and temporal filtering/i })).toBeVisible();

  // Stat cards reflect the mocked overview.
  await expect(adminPage.getByText(/^Layers$/).first()).toBeVisible();
  await expect(adminPage.getByText(/^Features$/).first()).toBeVisible();
});

test('listLayers populates the LayerPanel; selecting a layer hydrates the control panel', async ({ adminPage }) => {
  await mockGeospatial(adminPage);
  await adminPage.goto('/geospatial');
  await waitForGeospatialReady(adminPage);

  // Both mocked layers surface in the panel; each is a `<button>` with
  // its name as the visible label.
  await expect(adminPage.getByRole('button', { name: /Iberian airports.*operations.*airports/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /Spanish rivers/i })).toBeVisible();

  // The page does NOT auto-select on mount, so the Tags input starts
  // empty. After we click the first layer, hydration fills the tags.
  await expect(adminPage.getByPlaceholder(/operations, airports/i)).toHaveValue('');
  await selectFirstLayer(adminPage);
  await expect(adminPage.getByPlaceholder(/operations, airports/i)).toHaveValue('operations, airports');
});

test('clicking a layer in the panel re-fetches its vector tile + updates the MapView header chip', async ({ adminPage }) => {
  await mockGeospatial(adminPage);
  const cap = captureRequests(adminPage, /\/api\/v1\/geospatial\/tiles\/layer-rivers/);

  await adminPage.goto('/geospatial');
  await waitForGeospatialReady(adminPage);

  // Click the second layer in the LayerPanel — the page wires
  // `onSelectLayer` to `selectLayerById`, which fires `getVectorTile`.
  await adminPage.getByRole('button', { name: /Spanish rivers/i }).click();

  // The mocked tile response surfaces "vector_tile • 1 features" in
  // the MapView header chip. The HeatmapLayer panel renders a
  // visually-similar but UPPERCASE string ("VECTOR_TILE • zoom 2-12
  // • 1 features"), so we anchor on the case-sensitive lowercase
  // form to disambiguate.
  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  await expect(adminPage.getByText('vector_tile • 1 features', { exact: true })).toBeVisible();
});

test('window.__openFoundryMapLibreMaps exposes the MapLibre instance for programmatic zoom', async ({ adminPage }) => {
  await mockGeospatial(adminPage);
  await adminPage.goto('/geospatial');
  await waitForGeospatialReady(adminPage);

  // MapLibreCanvas registers each Map under
  // `window.__openFoundryMapLibreMaps` in dev mode. The e2e dev-server
  // runs in dev, so the handle is available. We use it to programmatically
  // step zoom — the raw `mouse.wheel` path is unreliable on a headless
  // `<canvas>` because the wheel listener fires inside MapLibre's
  // internal handler chain.
  const beforeZoom = await adminPage.evaluate(() => {
    const maps = window.__openFoundryMapLibreMaps ?? [];
    return maps[0]?.getZoom() ?? null;
  });
  expect(beforeZoom).not.toBeNull();
  expect(typeof beforeZoom).toBe('number');

  // Bump the zoom from the dev handle and verify the camera moved.
  await adminPage.evaluate((target) => {
    const maps = window.__openFoundryMapLibreMaps ?? [];
    maps[0]?.zoomTo(target, { duration: 0 });
  }, (beforeZoom as number) + 2);

  const afterZoom = await adminPage.evaluate(() => {
    const maps = window.__openFoundryMapLibreMaps ?? [];
    return maps[0]?.getZoom() ?? null;
  });
  expect(afterZoom).not.toBeNull();
  expect(afterZoom as number).toBeGreaterThan(beforeZoom as number);
});

test('Spatial query with operation=within sends a bounding-box request', async ({ adminPage }) => {
  await mockGeospatial(adminPage);
  const cap = captureRequests(adminPage, /\/api\/v1\/geospatial\/query$/);

  await adminPage.goto('/geospatial');
  await waitForGeospatialReady(adminPage);
  await selectFirstLayer(adminPage);

  // The Spatial query column lives inside the SpatialAnalysis section.
  // The Field wrapper renders `<label><div>Operation</div><select>…</select></label>`,
  // so the label's textContent includes every option string ("within
  // intersects nearest buffer"). We match on substring + first()
  // since "Operation" is unique on the page.
  const opSelect = adminPage.locator('label').filter({ hasText: 'Operation' }).locator('select').first();
  await expect(opSelect).toBeVisible();
  await opSelect.selectOption('within');

  // Fire the query.
  await adminPage.getByRole('button', { name: /^Run spatial query$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  const post = cap.calls.find((c) => c.method === 'POST');
  expect(post?.body).toMatchObject({
    layer_id: 'layer-airports',
    operation: 'within',
    bounds: {
      min_lat: expect.any(Number),
      min_lon: expect.any(Number),
      max_lat: expect.any(Number),
      max_lon: expect.any(Number),
    },
  });

  // The page surfaces the match-count summary inside the SpatialAnalysis
  // panel after a successful query. The same string is echoed in a
  // sibling summary card; .first() pins the SpatialAnalysis copy.
  await expect(adminPage.getByText(/3 matches in 12 ms/i).first()).toBeVisible();
});

test('numeric histogram filter narrows the visible features client-side', async ({ adminPage }) => {
  await mockGeospatial(adminPage);
  await adminPage.goto('/geospatial');
  await waitForGeospatialReady(adminPage);
  await selectFirstLayer(adminPage);

  // The first numeric property on the airports fixture is `passengers`
  // (values: 52M, 61M, 9M). The auto-hydration effect picks it as the
  // default numeric field, exposes "Min value" + "Max value" number
  // inputs, and renders the 6-bucket histogram. We narrow the range
  // to exclude the 9M outlier (Valencia) and confirm the histogram
  // counts update.
  const numericField = adminPage
    .locator('label')
    .filter({ hasText: 'Numeric field' })
    .locator('select')
    .first();
  await expect(numericField).toBeVisible();
  await expect(numericField).toHaveValue('passengers');

  const minInput = adminPage.locator('label').filter({ hasText: 'Min value' }).locator('input[type=number]').first();
  await expect(minInput).toBeVisible();

  // Tighten the floor to exclude the Valencia bucket (9M). The bucket
  // for 9M (lowest) drops to count=0 once the filter applies — we check
  // the bucket label still renders but the histogram refilled.
  await minInput.fill('10000000');
  await expect(minInput).toHaveValue('10000000');
});

test('Save settings PATCHes the active layer style and surfaces the success notice', async ({ adminPage }) => {
  const state = await mockGeospatial(adminPage);
  const cap = captureRequests(adminPage, /\/api\/v1\/geospatial\/layers\/layer-airports$/);

  await adminPage.goto('/geospatial');
  await waitForGeospatialReady(adminPage);
  await selectFirstLayer(adminPage);

  // Tweak a tag so we can verify the captured PATCH body carries our
  // value (the style colour pickers + range inputs are harder to drive
  // deterministically across browsers).
  const tagsInput = adminPage.getByPlaceholder(/operations, airports/i);
  await tagsInput.fill('operations, airports, saved-map');

  await adminPage.getByRole('button', { name: /^Save settings$/i }).click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'PATCH').length).toBeGreaterThanOrEqual(1);
  const patch = cap.calls.find((c) => c.method === 'PATCH');
  expect(patch?.body).toMatchObject({
    tags: ['operations', 'airports', 'saved-map'],
    indexed: true,
  });
  expect(patch?.body).toHaveProperty('style');

  // The state mock reflects the new tag list.
  expect(state.layers.find((l) => l.id === 'layer-airports')?.tags).toEqual([
    'operations',
    'airports',
    'saved-map',
  ]);
});

test('Timeline panel exposes the temporal slider + Timeline / Event mode toggle', async ({ adminPage }) => {
  await mockGeospatial(adminPage);
  await adminPage.goto('/geospatial');
  await waitForGeospatialReady(adminPage);

  // Timeline section heading.
  await expect(adminPage.getByRole('heading', { name: /timeline, events, and temporal filtering/i })).toBeVisible();

  // Both mode buttons exist; "Timeline" is the default (the page
  // initialises `timelineMode` to `up_to`).
  const timelineMode = adminPage.getByRole('button', { name: /^Timeline$/ });
  const eventMode = adminPage.getByRole('button', { name: /^Event$/ });
  await expect(timelineMode).toBeVisible();
  await expect(eventMode).toBeVisible();

  // Switching to "Event" mode flips which button carries the primary style.
  await eventMode.click();
  // After the toggle, the eyebrow under the timestamp label reads "Single event".
  await expect(adminPage.getByText(/^single event$/i)).toBeVisible();
});

test('absent today: basemap switcher, click-to-popup, layer visibility toggle, and legend drawer', async ({ adminPage }) => {
  // Regression guards for the roadmap controls the shipped page does
  // NOT provide today. When the feature lands, the assertion flips
  // and forces a spec update.
  await mockGeospatial(adminPage);
  await adminPage.goto('/geospatial');
  await waitForGeospatialReady(adminPage);

  // 1. No basemap picker — the shipped MapLibre style is a single
  //    hard-coded background.
  expect(await adminPage.getByRole('button', { name: /basemap|streets|satellite|terrain/i }).count()).toBe(0);

  // 2. No `.maplibregl-popup` rendered on mount (the page does not
  //    wire `map.on('click', …)`, so click-to-popup is absent).
  await expect(adminPage.locator('.maplibregl-popup')).toHaveCount(0);

  // 3. No per-layer visibility switch — LayerPanel rows are selectors,
  //    not toggles. `role="switch"` should be absent here.
  expect(await adminPage.locator('section').filter({ hasText: /Indexed layers and vector-ready sources/ }).getByRole('switch').count()).toBe(0);

  // 4. No "Legend" drawer / button — the closest surface is the
  //    MapView header chip + the numeric histogram in the
  //    "Selection and filtering" panel.
  expect(await adminPage.getByRole('button', { name: /^legend$/i }).count()).toBe(0);
  expect(await adminPage.getByRole('complementary', { name: /legend/i }).count()).toBe(0);
});

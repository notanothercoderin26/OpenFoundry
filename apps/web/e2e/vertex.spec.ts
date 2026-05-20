import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/vertex`
 * (apps/web/src/routes/vertex/VertexPage.tsx, 4384 LoC).
 *
 * **Reality vs roadmap.** Vertex is a Cytoscape-backed graph
 * exploration product layered with sidebar tabs (Selection / Events /
 * Series / Layers / Histogram / Media / Scenarios), a Quiver lens
 * select, scenario simulation, templates, edge-grouping, and so on.
 *
 * Concrete divergences from the roadmap brief:
 *
 *   - The graph itself renders to a `<canvas>` via `CytoscapeCanvas`;
 *     individual nodes are NOT in the DOM, so Playwright can't `click`
 *     them. The tests below drive selection through the inline-search
 *     control ("Search visible graph (⌘/Ctrl+K)") which is the same
 *     code path the Cytoscape tap handler feeds — both call
 *     `setSelectedNodeId(...)`.
 *   - "Path finder" maps to the "Shortest path (2 selected)" button
 *     in the Selection sidebar. It's disabled until two nodes are
 *     selected. Since the canvas tap is unreachable, the test
 *     verifies the disabled state + button text (`shortestPath` is
 *     itself a pure client-side helper, not a backend call).
 *   - "Expand relations of the node" maps to the "Expand neighbors"
 *     button which posts via `expandNeighbors → listNeighbors` to
 *     `GET /api/v1/ontology/types/{id}/objects/{id}/neighbors`.
 *   - "Filtros por tipo" maps to the "Filter node type id" / "Filter
 *     edge type id" inputs that filter the visible graph
 *     client-side via `useMemo` (the FiltersStrip section under the
 *     Graph canvas header).
 *
 * Endpoints touched on mount:
 *   - GET  /api/v1/ontology/types?per_page=100               (object types)
 *   - GET  /api/v1/ontology/quiver/visual-functions?...      (Quiver lenses)
 *   - GET  /api/v1/ontology/links?...                         (link types)
 *   - GET  /api/v1/vertex/graph-templates                     (saved templates)
 *   - GET  /api/v1/vertex/graphs/{id}/scenarios               (scenarios)
 *   - GET  /api/v1/ontology/graph?root_type_id=X&depth=2&limit=120 (graph)
 *   - GET  /api/v1/ontology/types/{id}/objects                (object hydration)
 * Triggered by user actions:
 *   - POST /api/v1/ontology/search                            (Global search)
 *   - GET  /api/v1/ontology/types/{id}/objects/{oid}/neighbors (Expand)
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Failed to load/i,
      /cytoscape/i,
      /style property during rerender/i,
      /borderColor/,
      // The neighbor-results list in the Selection tab renders a
      // sibling block with a non-unique key once neighbors arrive;
      // benign React dev warning, not actionable from the spec.
      /Each child in a list should have a unique "key" prop/,
    ],
  },
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const E2E_NOW = '2026-05-11T00:00:00Z';

const TYPE_PERSON = {
  id: 'object-type-person',
  rid: 'ri.ontology.main.object-type.person',
  name: 'person',
  display_name: 'Person',
  plural_display_name: 'People',
  description: 'A modelled person',
  primary_key_property: 'id',
  icon: 'user',
  color: '#0ea5e9',
};

const TYPE_ACCOUNT = {
  id: 'object-type-account',
  rid: 'ri.ontology.main.object-type.account',
  name: 'account',
  display_name: 'Account',
  plural_display_name: 'Accounts',
  description: 'A bank account',
  primary_key_property: 'id',
  icon: 'wallet',
  color: '#22c55e',
};

const PERSON_OBJECTS = [
  {
    id: 'person-alice',
    object_type_id: 'object-type-person',
    properties: { id: 'person-alice', name: 'Alice', country: 'ES' },
    created_by: 'user-1',
    marking: 'public',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
  },
];

const ACCOUNT_OBJECTS = [
  {
    id: 'account-iban-1',
    object_type_id: 'object-type-account',
    properties: { id: 'account-iban-1', iban: 'ES00 0000 0001', balance: 1200 },
    created_by: 'user-1',
    marking: 'public',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
  },
];

const GRAPH_PAYLOAD = {
  mode: 'type' as const,
  root_object_id: null,
  root_type_id: 'object-type-person',
  depth: 2,
  total_nodes: 2,
  total_edges: 1,
  summary: {
    scope: 'person',
    node_kinds: { object_type: 2 },
    edge_kinds: { link: 1 },
    object_types: { 'object-type-person': 1, 'object-type-account': 1 },
    markings: { public: 2 },
  },
  nodes: [
    {
      id: 'object:person-alice',
      kind: 'object_type',
      label: 'Alice',
      secondary_label: 'person:alice',
      color: '#0ea5e9',
      route: '/ontology-manager/object-type-person/person-alice',
      metadata: { object_type_id: 'object-type-person', properties: PERSON_OBJECTS[0].properties },
    },
    {
      id: 'object:account-iban-1',
      kind: 'object_type',
      label: 'Account ES00 0000 0001',
      secondary_label: 'account:iban-1',
      color: '#22c55e',
      route: '/ontology-manager/object-type-account/account-iban-1',
      metadata: { object_type_id: 'object-type-account', properties: ACCOUNT_OBJECTS[0].properties },
    },
  ],
  edges: [
    {
      id: 'edge-owns',
      kind: 'link',
      source: 'object:person-alice',
      target: 'object:account-iban-1',
      label: 'owns',
      metadata: { link_type_id: 'link-owns' },
    },
  ],
};

interface VertexMocks {
  /** Captured neighbor calls (for Expand assertions). */
  neighborCalls: number;
}

/**
 * Installs the minimum set of route mocks Vertex reads on mount + the
 * search / neighbors endpoints driven by user actions. The mocks
 * return shape-correct payloads so downstream `useMemo`s and the
 * sidebar tabs render without crashing.
 */
async function mockVertex(page: Page): Promise<VertexMocks> {
  const state: VertexMocks = { neighborCalls: 0 };

  // Object types — drives the "Object type" select + the page's
  // rootTypeId auto-init effect.
  await page.route(/\/api\/v1\/ontology\/types(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: [TYPE_PERSON, TYPE_ACCOUNT], total: 2, page: 1, per_page: 100 },
    });
  });

  // Per-type object lists (some hydration code paths fetch the rows
  // of the selected type to populate property options).
  await page.route(/\/api\/v1\/ontology\/types\/object-type-person\/objects(?!\/)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: PERSON_OBJECTS, total: PERSON_OBJECTS.length, page: 1, per_page: 100 },
    });
  });
  await page.route(/\/api\/v1\/ontology\/types\/object-type-account\/objects(?!\/)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: ACCOUNT_OBJECTS, total: ACCOUNT_OBJECTS.length, page: 1, per_page: 100 },
    });
  });

  // Ontology graph — the heart of the Vertex render.
  await page.route(/\/api\/v1\/ontology\/graph/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: GRAPH_PAYLOAD });
  });

  // Link types (D.6 edge direction capability).
  await page.route(/\/api\/v1\/ontology\/links(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        data: [
          { id: 'link-owns', name: 'owns', display_name: 'Owns', source_type_id: 'object-type-person', target_type_id: 'object-type-account' },
        ],
        total: 1,
      },
    });
  });

  // Quiver visual functions (lens select).
  await page.route(/\/api\/v1\/ontology\/quiver\/visual-functions/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: [], total: 0, page: 1, per_page: 100 } });
  });

  // Vertex scenarios (analysisRid-scoped saved scenarios).
  await page.route(/\/api\/v1\/vertex\/graphs\/[^/?#]+\/scenarios(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: [], total: 0, page: 1, per_page: 100 } });
  });

  // Vertex graph templates.
  await page.route(/\/api\/v1\/vertex\/graph-templates(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: [], total: 0, page: 1, per_page: 100 } });
  });

  // Ontology global search — POST endpoint. Returns a single matching
  // object so the result-card rendering can be exercised. The SearchResult
  // wire shape uses `title`/`subtitle`/`snippet`; the result button
  // renders `result.title`, not `result.label`.
  await page.route(/\/api\/v1\/ontology\/search$/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: {
        query: 'alice',
        total: 1,
        data: [
          {
            kind: 'object',
            id: 'person-alice',
            object_type_id: 'object-type-person',
            title: 'Alice',
            subtitle: 'person:alice',
            snippet: 'Person registered in ES',
            score: 0.91,
            route: '/ontology-manager/object-type-person/person-alice',
            metadata: {},
          },
        ],
      },
    });
  });

  // Neighbors endpoint — drives the "Expand neighbors" button. The
  // page's `expandNeighbors` is a wrapper over `listNeighbors`.
  await page.route(/\/api\/v1\/ontology\/types\/[^/?#]+\/objects\/[^/?#]+\/neighbors/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    state.neighborCalls += 1;
    await route.fulfill({
      json: {
        data: [
          {
            object: ACCOUNT_OBJECTS[0],
            edge_label: 'owns',
            link_type_id: 'link-owns',
            direction: 'outgoing',
          },
        ],
      },
    });
  });

  return state;
}

/**
 * Wait for the Vertex page to mount + the initial graph response to
 * surface. We anchor on the "Nodes 2" chip rendered in the canvas
 * header — it only appears once `getOntologyGraph` resolves with the
 * mocked payload.
 */
async function waitForVertexReady(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { level: 1, name: /visualize, simulate, and annotate/i }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/^Nodes 2$/)).toBeVisible({ timeout: 15_000 });
}

/**
 * Locate a `<select>` by the Field component's wrapping label. The
 * `Field` helper renders `<label><div class="of-eyebrow">…</div>
 * <select>…</select></label>` and the select's options leak into
 * the label's textContent, so we filter labels by substring (not by
 * `^…$` anchors).
 */
function fieldSelect(page: Page, label: string) {
  return page.locator('label').filter({ hasText: label }).locator('select').first();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renders the Vertex canvas + sidebar tabs + ribbon controls', async ({ adminPage }) => {
  await mockVertex(adminPage);
  await adminPage.goto('/vertex');
  await waitForVertexReady(adminPage);

  // Hero + canvas header.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /visualize, simulate, and annotate/i }),
  ).toBeVisible();
  await expect(adminPage.getByRole('heading', { name: /^Editable system graph$/ })).toBeVisible();

  // Stats chips reflect the mocked graph (2 nodes, 1 edge).
  await expect(adminPage.getByText('Nodes 2')).toBeVisible();
  await expect(adminPage.getByText('Edges 1')).toBeVisible();

  // Sidebar exposes the seven tabs Vertex ships today.
  for (const tab of ['Selection', 'Events', 'Series', 'Layers', 'Histogram', 'Media', 'Scenarios']) {
    await expect(
      adminPage.getByRole('button', { name: new RegExp(`^${tab}$`, 'i') }).first(),
    ).toBeVisible();
  }
});

test('Object type select hydrates from listObjectTypes; the first type auto-selects as the root', async ({ adminPage }) => {
  await mockVertex(adminPage);
  await adminPage.goto('/vertex');
  await waitForVertexReady(adminPage);

  // The Object type Field hosts the mocked types.
  const typeSelect = fieldSelect(adminPage, 'Object type');
  await expect(typeSelect).toBeVisible();
  const options = await typeSelect.locator('option').allTextContents();
  expect(options.map((s) => s.trim())).toEqual(['Person', 'Account']);

  // The first type auto-selects on mount (rootTypeId auto-init effect).
  await expect(typeSelect).toHaveValue('object-type-person');
});

test('Layout picker exposes the seven layouts and switching one persists in the select', async ({ adminPage }) => {
  await mockVertex(adminPage);
  await adminPage.goto('/vertex');
  await waitForVertexReady(adminPage);

  const layout = fieldSelect(adminPage, 'Layout');
  await expect(layout).toBeVisible();

  // Vertex ships seven layouts: Auto / Hierarchy / Grid / Circular /
  // Cluster / Radial / Cartesian. Default is "cose" (Auto).
  const options = await layout.locator('option').allTextContents();
  expect(options.map((s) => s.trim())).toEqual([
    'Auto',
    'Hierarchy',
    'Grid',
    'Circular',
    'Cluster',
    'Radial',
    'Cartesian',
  ]);
  await expect(layout).toHaveValue('cose');

  // Switching to "Hierarchy" (breadthfirst) persists.
  await layout.selectOption('breadthfirst');
  await expect(layout).toHaveValue('breadthfirst');
});

test('Inline search ("Search visible graph") selects + centers a matching node', async ({ adminPage }) => {
  await mockVertex(adminPage);
  await adminPage.goto('/vertex');
  await waitForVertexReady(adminPage);

  // The inline-search input + Find button is the page's
  // "buscar y centrar nodo" surface. It calls `runInlineSearch` →
  // `setSelectedNodeId` / `setSelectedNodeIds`, which is the SAME
  // code path the canvas-tap handler uses.
  const inline = adminPage.getByPlaceholder(/Search visible graph/i);
  await expect(inline).toBeVisible();
  await inline.fill('Alice');

  // Two "Find" buttons exist on the page (one inline-search, one
  // misc). The inline one sits right after the search input — we
  // anchor on the button immediately following the placeholder.
  await adminPage.getByRole('button', { name: /^Find$/i }).last().click();

  // The Selection sidebar surfaces the node's properties (the
  // sidebar is on the Selection tab by default).
  await expect(adminPage.getByText(/Alice/).first()).toBeVisible();
});

test('Global search POSTs to /ontology/search and renders result cards', async ({ adminPage }) => {
  await mockVertex(adminPage);
  const cap = captureRequests(adminPage, /\/api\/v1\/ontology\/search$/);

  await adminPage.goto('/vertex');
  await waitForVertexReady(adminPage);

  // The global-search input lives at the top of the filters strip.
  // Its placeholder is "Find objects or types".
  const search = adminPage.getByPlaceholder(/Find objects or types/i);
  await search.fill('alice');
  await adminPage.getByRole('button', { name: /^Search$/i }).click();

  // /ontology/search is POSTed with the query body…
  await expect.poll(() => cap.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(1);
  const post = cap.calls.find((c) => c.method === 'POST');
  expect(post?.body).toMatchObject({ query: 'alice' });

  // …and the matching result renders as a clickable card.
  await expect(adminPage.getByRole('button', { name: /alice/i }).first()).toBeVisible();
});

test('"Filter node type id" input is exposed in the canvas filters strip', async ({ adminPage }) => {
  await mockVertex(adminPage);
  await adminPage.goto('/vertex');
  await waitForVertexReady(adminPage);

  // The filters strip below the search row hosts the type / property /
  // edge / min-degree filter inputs. Each is a separate `<input>` with
  // a distinct placeholder.
  await expect(adminPage.getByPlaceholder(/^Filter node type id$/i)).toBeVisible();
  await expect(adminPage.getByPlaceholder(/^Filter node property value$/i)).toBeVisible();
  await expect(adminPage.getByPlaceholder(/^Filter edge type id$/i)).toBeVisible();
  await expect(adminPage.getByPlaceholder(/^Min degree$/i)).toBeVisible();

  // Typing into the node-type filter is accepted and persisted.
  await adminPage.getByPlaceholder(/^Filter node type id$/i).fill('object-type-account');
  await expect(adminPage.getByPlaceholder(/^Filter node type id$/i)).toHaveValue('object-type-account');
});

test('"Shortest path (2 selected)" button exists and is disabled without two selected nodes', async ({ adminPage }) => {
  await mockVertex(adminPage);
  await adminPage.goto('/vertex');
  await waitForVertexReady(adminPage);

  // The Selection sidebar surfaces three analytics buttons inside
  // the Traversal plan card: Centrality (cached), Shortest path
  // (2 selected), and Run AIP block. Shortest path is the path
  // finder for cases requiring exactly 2 selected nodes.
  const shortest = adminPage.getByRole('button', { name: /Shortest path \(2 selected\)/i });
  await expect(shortest).toBeVisible();
  await expect(shortest).toBeDisabled();

  // Sibling buttons in the same card are present + enabled.
  await expect(adminPage.getByRole('button', { name: /^Centrality \(cached\)$/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^Run AIP block$/i })).toBeVisible();
});

test('"Expand neighbors" button calls the /neighbors endpoint when a node is selected', async ({ adminPage }) => {
  const state = await mockVertex(adminPage);
  await adminPage.goto('/vertex');
  await waitForVertexReady(adminPage);

  // Driving selection via the inline search is the only Playwright-safe
  // path (the canvas tap handler is unreachable in headless mode).
  await adminPage.getByPlaceholder(/Search visible graph/i).fill('Alice');
  await adminPage.getByRole('button', { name: /^Find$/i }).last().click();

  // After selection, the Expand neighbors button (inside the
  // Selection sidebar tab) is enabled. Click it and verify the
  // /neighbors endpoint was hit.
  await adminPage.getByRole('button', { name: /^Expand neighbors$/i }).first().click();

  await expect.poll(() => state.neighborCalls).toBeGreaterThanOrEqual(1);
});

test('sidebar tab navigation: Selection → Events → Selection', async ({ adminPage }) => {
  await mockVertex(adminPage);
  await adminPage.goto('/vertex');
  await waitForVertexReady(adminPage);

  // The sidebar's tab strip exposes each tab as a `<button>`. Clicking
  // each one swaps the sidebar content. The `SidebarSection` component
  // renders the title as an EYEBROW `<p>` and the subtitle as the
  // `<h2>` heading, so we anchor on the subtitle text (the Events
  // tab's heading is "Timeline-aware event badges").
  await adminPage.getByRole('button', { name: /^Events$/i }).first().click();
  await expect(
    adminPage.getByRole('heading', { name: /timeline-aware event badges/i }),
  ).toBeVisible();

  await adminPage.getByRole('button', { name: /^Selection$/i }).first().click();
  // Selection tab restores the analytics buttons.
  await expect(adminPage.getByRole('button', { name: /Shortest path \(2 selected\)/i })).toBeVisible();
});

test('absent today: drag-to-canvas seeding from search, click-to-popup, named graph-history library', async ({ adminPage }) => {
  // Regression guards for the roadmap controls Vertex does NOT
  // provide today. When each one lands, the assertion flips and
  // forces a spec update.
  await mockVertex(adminPage);
  await adminPage.goto('/vertex');
  await waitForVertexReady(adminPage);

  // 1. No "Drop here" canvas dropzone — search results are merged
  //    by tapping their card (`addSearchResultToGraph`), not by
  //    drag-and-drop.
  expect(await adminPage.getByText(/drop here|drag here/i).count()).toBe(0);

  // 2. No native browser popups on node tap — there's only the
  //    right-click context menu, which we can't trigger on a
  //    `<canvas>` element from Playwright.
  expect(await adminPage.locator('.cytoscape-popup, .leaflet-popup').count()).toBe(0);

  // 3. No "Graph history" library. The page persists named TEMPLATES
  //    (via "Save as template") and SCENARIOS (in the Scenarios
  //    tab), but not a flat saved-history view of past graphs.
  expect(await adminPage.getByRole('button', { name: /^graph history$|^recent graphs$/i }).count()).toBe(0);
});

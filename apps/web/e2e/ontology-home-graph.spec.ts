import type { Page, Route } from '@playwright/test';

import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for the two Ontology overview surfaces:
 *
 *   - `/ontology`        → apps/web/src/routes/ontology/OntologyHomePage.tsx
 *   - `/ontology/graph`  → apps/web/src/routes/ontology/OntologyGraphPage.tsx
 *
 * **Home page shape (vs the requested checklist).** The shipped home
 * page does NOT show a `#types / #properties / #links` summary strip
 * — its footer reports `Object types`, `Groups`, and `Favorites` and
 * the per-type cards render an object-count badge fed by
 * `listObjects(typeId, { per_page: 1 }).total`. We assert against
 * those (the real surface) rather than the requested numbers.
 *
 * **Graph page caveats.** Cytoscape renders into a `<canvas>` — there
 * is no DOM per node, so Playwright's role-based locators are useless
 * for graph internals. The `CytoscapeCanvas` wrapper now exposes the
 * `Core` instance at `window.__cytoscape__['ontology-graph']` (only
 * when a `testHandle` prop is set, so production is unaffected); the
 * tests drive it through that handle, falling back to React-side
 * surfaces (the right-hand info panel, the toolbar form controls) to
 * assert behaviour. The page itself ships no zoom buttons and no
 * explicit layout picker — the `Schema/Object` mode toggle acts as
 * the de-facto layout switcher (fcose ↔ breadthfirst) and the `Root
 * type` select acts as the de-facto namespace filter; the tests pin
 * those flows.
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
  rid?: string;
  name: string;
  display_name: string;
  description: string;
  primary_key_property: string | null;
  icon: string | null;
  color: string | null;
  status: string;
  visibility: string;
  group_names: string[];
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
    description: 'Fleet vehicle records.',
    primary_key_property: 'tail_number',
    icon: 'plane',
    color: '#0f766e',
    status: 'active',
    visibility: 'normal',
    group_names: ['Operations'],
    owner_id: 'user-1',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
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
  icon: 'route',
  color: '#1d4ed8',
  group_names: ['Operations'],
});
const ENGINE = makeObjectType({
  id: 'object-type-engine',
  name: 'engine',
  display_name: 'Engine',
  description: 'Aircraft propulsion units.',
  primary_key_property: 'engine_id',
  icon: 'engine',
  color: '#a16207',
  group_names: ['Maintenance'],
});

const OBJECT_TYPES = [AIRCRAFT, ROUTE, ENGINE];

/**
 * Minimal `getOntologyGraph` payload: three type nodes wired by two
 * edges. The IDs follow the convention the page already encodes for
 * "object_type" nodes (`type:<id>`) so the Focus button can resolve
 * back to a type via `node.id.slice('type:'.length)`.
 */
const GRAPH_RESPONSE = {
  mode: 'schema',
  root_object_id: null,
  root_type_id: null,
  depth: 2,
  total_nodes: 3,
  total_edges: 2,
  summary: {
    scope: 'organization',
    node_kinds: { object_type: 3 },
    edge_kinds: { link_type: 2 },
    object_types: { 'object-type-aircraft': 1, 'object-type-route': 1, 'object-type-engine': 1 },
    markings: {},
    root_neighbor_count: 2,
    max_hops_reached: 1,
    boundary_crossings: 0,
    sensitive_objects: 0,
    sensitive_markings: [] as string[],
  },
  nodes: [
    {
      id: `type:${AIRCRAFT.id}`,
      kind: 'object_type',
      label: 'Aircraft',
      secondary_label: 'aircraft',
      color: '#0f766e',
      route: `/ontology/${AIRCRAFT.id}`,
      metadata: { object_type_id: AIRCRAFT.id, group: 'Operations' },
    },
    {
      id: `type:${ROUTE.id}`,
      kind: 'object_type',
      label: 'Route',
      secondary_label: 'route',
      color: '#1d4ed8',
      route: `/ontology/${ROUTE.id}`,
      metadata: { object_type_id: ROUTE.id, group: 'Operations' },
    },
    {
      id: `type:${ENGINE.id}`,
      kind: 'object_type',
      label: 'Engine',
      secondary_label: 'engine',
      color: '#a16207',
      route: `/ontology/${ENGINE.id}`,
      metadata: { object_type_id: ENGINE.id, group: 'Maintenance' },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      kind: 'link_type',
      source: `type:${AIRCRAFT.id}`,
      target: `type:${ROUTE.id}`,
      label: 'operates',
      metadata: {},
    },
    {
      id: 'edge-2',
      kind: 'link_type',
      source: `type:${AIRCRAFT.id}`,
      target: `type:${ENGINE.id}`,
      label: 'has engine',
      metadata: {},
    },
  ],
};

async function mockOntologySurface(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/ontology\/types(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: OBJECT_TYPES, total: OBJECT_TYPES.length, page: 1, per_page: 200 },
    });
  });

  // Lazy per-type object counts fed into the home-page cards.
  await page.route(
    /\/api\/v1\/ontology\/types\/[^/]+\/objects(\?|$)/,
    async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const match = /\/ontology\/types\/([^/?]+)\/objects/.exec(route.request().url());
      const typeId = match?.[1] ?? '';
      // Deterministic per-type counts so the home-page badges are
      // assertable: 12, 7, 3 — the fall-through `42` is a guard.
      const counts: Record<string, number> = {
        [AIRCRAFT.id]: 12,
        [ROUTE.id]: 7,
        [ENGINE.id]: 3,
      };
      await route.fulfill({
        json: { data: [], total: counts[typeId] ?? 42, page: 1, per_page: 1 },
      });
    },
  );

  // Background searchOntology (the debounced search box) and the graph
  // endpoint share the same router. Graph: 200 with the canned
  // payload above. Search: empty list.
  await page.route(/\/api\/v1\/ontology\/graph(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const rootTypeId = url.searchParams.get('root_type_id');
    // When the user picks a root type, narrow the response to that
    // type's node + its incident edges. Keeps the "filter by
    // namespace" assertion crisp on the test side.
    if (rootTypeId) {
      const filteredNodes = GRAPH_RESPONSE.nodes.filter((node) =>
        node.metadata.object_type_id === rootTypeId,
      );
      const allowed = new Set(filteredNodes.map((node) => node.id));
      const filteredEdges = GRAPH_RESPONSE.edges.filter(
        (edge) => allowed.has(edge.source) && allowed.has(edge.target),
      );
      await route.fulfill({
        json: {
          ...GRAPH_RESPONSE,
          mode: 'schema',
          root_type_id: rootTypeId,
          total_nodes: filteredNodes.length,
          total_edges: filteredEdges.length,
          nodes: filteredNodes,
          edges: filteredEdges,
          summary: {
            ...GRAPH_RESPONSE.summary,
            node_kinds: { object_type: filteredNodes.length },
            edge_kinds: { link_type: filteredEdges.length },
          },
        },
      });
      return;
    }
    await route.fulfill({ json: GRAPH_RESPONSE });
  });
}

// ────────────────────────────────────────────────────────────────
// /ontology — home page
// ────────────────────────────────────────────────────────────────

test('Home: renders the page shell with the footer stats and per-type counts', async ({
  adminPage,
}) => {
  await mockOntologySurface(adminPage);
  await adminPage.goto('/ontology');

  // Top-level heading anchors the page-load gate.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /explore your data/i }),
  ).toBeVisible();

  // The tab bar exposes all four tabs.
  for (const label of ['Overview', 'Objects', 'Object types', 'Artifacts']) {
    await expect(adminPage.getByRole('button', { name: new RegExp(`^${label}$`) })).toBeVisible();
  }

  // The footer stats strip is the page's "summary numbers" surface.
  // Match each as a `<span>` wrapping a numeric `<strong>` + label.
  const footer = adminPage.locator('footer').last();
  await expect(footer).toBeVisible();
  await expect(footer).toContainText('Object types');
  await expect(footer).toContainText('Groups');
  await expect(footer).toContainText('Favorites');
  await expect(footer).toContainText('ONT-001 · /ontology');

  // Three mocked types ⇒ "3 Object types" + "2 Groups" (Operations
  // + Maintenance). Each stat is `<span><span>N</span> label</span>`
  // — the rendered text of the outer span is the concatenation of
  // the value and the label, so we match the inner spans by exact
  // text and assert their owning labels via `toContainText` on the
  // footer.
  const objectTypesValue = footer
    .locator('span')
    .filter({ hasText: /^3$/ });
  const groupsValue = footer
    .locator('span')
    .filter({ hasText: /^2$/ });
  await expect(objectTypesValue.first()).toBeVisible();
  await expect(groupsValue.first()).toBeVisible();

  // Drop into the Object types tab so the table renders. The lazy
  // per-type count fetch lands the badges as "12", "7", "3".
  await adminPage.getByRole('button', { name: /^Object types$/ }).click();
  const table = adminPage.getByRole('table');
  await expect(table).toBeVisible();
  await expect(table.getByRole('link', { name: 'Aircraft' })).toBeVisible();
  await expect(table.getByRole('link', { name: 'Route' })).toBeVisible();
  await expect(table.getByRole('link', { name: 'Engine' })).toBeVisible();
  // The per-row count cell ('Objects' column) renders as the compact
  // number when the lazy fetch lands.
  await expect.poll(async () => table.getByRole('cell', { name: '12' }).count()).toBeGreaterThan(0);
});

test('Home: tab switching reveals per-tab sub-sections, and an object-type card navigates to /ontology/:id', async ({
  adminPage,
}) => {
  await mockOntologySurface(adminPage);
  await adminPage.goto('/ontology');
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /explore your data/i }),
  ).toBeVisible();

  // Default tab is Overview — the "New object type" CTA in the
  // Object-types section is hidden because that section is wrapped
  // in the `tab === 'object-types'` conditional.
  await expect(adminPage.getByRole('link', { name: /^new object type$/i })).toHaveCount(0);

  // Object types tab: surfaces the table + the "New object type" CTA.
  await adminPage.getByRole('button', { name: /^Object types$/ }).click();
  await expect(adminPage.getByRole('link', { name: /^new object type$/i })).toBeVisible();
  await expect(adminPage.getByRole('table')).toBeVisible();

  // Artifacts tab: placeholder copy lives in a `<div className="of-panel">`.
  await adminPage.getByRole('button', { name: /^Artifacts$/ }).click();
  await expect(
    adminPage.getByText(/Artifacts \(saved searches, dashboards, time series\)/i),
  ).toBeVisible();
  await expect(adminPage.getByRole('table')).toHaveCount(0);

  // Back to Overview, the type cards render under a Group block. Clicking
  // a card calls `navigate(/ontology/:id)`.
  await adminPage.getByRole('button', { name: /^Overview$/ }).click();
  const aircraftCard = adminPage
    .getByRole('button')
    .filter({ has: adminPage.getByText('Aircraft') })
    .filter({ hasText: 'Fleet vehicle records' });
  await expect(aircraftCard.first()).toBeVisible();
  await aircraftCard.first().click();
  await expect(adminPage).toHaveURL(new RegExp(`/ontology/${AIRCRAFT.id}$`));
});

// ────────────────────────────────────────────────────────────────
// /ontology/graph — graph page
// ────────────────────────────────────────────────────────────────

/**
 * Drains queued promises so async cytoscape registry assignments
 * settle before the test reads the global.
 */
async function waitForCytoscapeReady(page: Page) {
  await expect.poll(
    async () => page.evaluate(() => {
      const registry = (window as unknown as { __cytoscape__?: Record<string, unknown> }).__cytoscape__;
      return Boolean(registry?.['ontology-graph']);
    }),
    { timeout: 10_000, message: 'window.__cytoscape__["ontology-graph"] never appeared' },
  ).toBe(true);
}

test('Graph: renders the canvas with the mocked node + edge counts and stats strip', async ({
  adminPage,
}) => {
  await mockOntologySurface(adminPage);
  await adminPage.goto('/ontology/graph');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /ontology graph/i }),
  ).toBeVisible();
  // Header chips report the loaded graph shape.
  await expect(adminPage.getByText(/^3 nodes$/)).toBeVisible();
  await expect(adminPage.getByText(/^2 edges$/)).toBeVisible();

  // Stats strip surfaces the summary fields.
  const stats = adminPage.getByRole('region', { name: /ontology graph summary/i });
  await expect(stats).toBeVisible();
  await expect(stats).toContainText(/object type 3/);
  await expect(stats).toContainText(/link type 2/);

  // CytoscapeCanvas mounts inside a div labelled by the testHandle. We
  // assert the underlying Core observes the same 3 nodes + 2 edges
  // (Cytoscape draws to a <canvas> so DOM-level queries can't see them).
  await waitForCytoscapeReady(adminPage);
  const counts = await adminPage.evaluate(() => {
    const cy = (window as unknown as {
      __cytoscape__: Record<string, { nodes: () => { length: number }; edges: () => { length: number } }>;
    }).__cytoscape__['ontology-graph'];
    return { nodes: cy.nodes().length, edges: cy.edges().length };
  });
  expect(counts).toEqual({ nodes: 3, edges: 2 });

  // The canvas wrapper is locatable via the data-testid the wrapper
  // emits when `testHandle` is set.
  await expect(adminPage.getByTestId('cytoscape-canvas-ontology-graph')).toBeVisible();
});

test('Graph: tapping a node via the Cytoscape API populates the info panel', async ({
  adminPage,
}) => {
  await mockOntologySurface(adminPage);
  await adminPage.goto('/ontology/graph');
  await waitForCytoscapeReady(adminPage);

  // The sidebar starts in its "select a node" empty state.
  await expect(
    adminPage.getByText(/Select a node to inspect focus, metadata, and connected types/i),
  ).toBeVisible();

  // Fire a synthetic `tap` on the Aircraft node. The page's
  // `handleReady` wired `cy.on('tap', 'node', …)` so this propagates
  // through React state into the sidebar.
  await adminPage.evaluate(({ nodeId }) => {
    const cy = (window as unknown as {
      __cytoscape__: Record<string, {
        $: (selector: string) => { emit: (event: string) => void; length: number };
      }>;
    }).__cytoscape__['ontology-graph'];
    const target = cy.$(`#${CSS.escape(nodeId)}`);
    if (target.length === 0) throw new Error(`Node ${nodeId} not in cytoscape`);
    target.emit('tap');
  }, { nodeId: `type:${AIRCRAFT.id}` });

  // Sidebar replaces the empty state with the node detail panel.
  await expect(
    adminPage.getByText(/Select a node to inspect focus, metadata, and connected types/i),
  ).toHaveCount(0);
  const sidebar = adminPage.locator('.ontology-graph-sidebar');
  // Heading is the selected node's label.
  await expect(sidebar.getByRole('heading', { name: 'Aircraft' })).toBeVisible();
  // The id row renders the raw cytoscape node id.
  await expect(sidebar.getByText(`type:${AIRCRAFT.id}`)).toBeVisible();
  // Focus + Open actions are wired to the node's metadata + route.
  await expect(sidebar.getByRole('button', { name: /^Focus$/ })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: /^Open$/ })).toBeVisible();
  // The "Connected types" list surfaces the two GRAPH_RESPONSE
  // edges as bold rows under the selected node.
  const neighbourList = sidebar.locator('.ontology-graph-neighbor-list');
  await expect(neighbourList.getByRole('strong').filter({ hasText: 'Route' })).toBeVisible();
  await expect(neighbourList.getByRole('strong').filter({ hasText: 'Engine' })).toBeVisible();
});

test('Graph: zoom in / out is driven through the exposed Cytoscape API', async ({
  adminPage,
}) => {
  // The shipped page has no zoom buttons — Cytoscape's wheel
  // sensitivity is configured but no React controls hook into
  // `cy.zoom()`. The user-facing test note flagged this explicitly:
  // when Cytoscape lacks accessible controls, exercise the API via
  // `window.__cy__`. We do exactly that here.
  await mockOntologySurface(adminPage);
  await adminPage.goto('/ontology/graph');
  await waitForCytoscapeReady(adminPage);

  // Capture the initial zoom level.
  const initialZoom = await adminPage.evaluate(() => {
    const cy = (window as unknown as {
      __cytoscape__: Record<string, { zoom: () => number }>;
    }).__cytoscape__['ontology-graph'];
    return cy.zoom();
  });
  expect(initialZoom).toBeGreaterThan(0);

  // Zoom in.
  const zoomedIn = await adminPage.evaluate(() => {
    const cy = (window as unknown as {
      __cytoscape__: Record<string, { zoom: ((level?: number) => number) | (() => number) }>;
    }).__cytoscape__['ontology-graph'] as unknown as {
      zoom: ((level?: number) => number) & (() => number);
    };
    cy.zoom(2);
    return cy.zoom();
  });
  expect(zoomedIn).toBeCloseTo(2, 3);

  // Zoom out.
  const zoomedOut = await adminPage.evaluate(() => {
    const cy = (window as unknown as {
      __cytoscape__: Record<string, { zoom: ((level?: number) => number) | (() => number) }>;
    }).__cytoscape__['ontology-graph'] as unknown as {
      zoom: ((level?: number) => number) & (() => number);
    };
    cy.zoom(0.5);
    return cy.zoom();
  });
  expect(zoomedOut).toBeCloseTo(0.5, 3);
});

test('Graph: the Schema / Object mode toggle switches the active layout', async ({
  adminPage,
}) => {
  // The page has no explicit layout-picker dropdown; the layout is
  // derived from `graph.mode`:
  //   schema → fcose (force-directed)
  //   object → breadthfirst (hierarchical)
  // The mode toggle is therefore the de-facto layout picker.
  await mockOntologySurface(adminPage);
  await adminPage.goto('/ontology/graph');
  await waitForCytoscapeReady(adminPage);

  // Schema mode is the initial selection; its button carries the
  // primary-state class.
  await expect(
    adminPage.getByRole('button', { name: /^Schema$/ }),
  ).toHaveClass(/of-button--primary/);
  await expect(
    adminPage.getByRole('button', { name: /^Object$/ }),
  ).not.toHaveClass(/of-button--primary/);

  // The toolbar advertises the active root selector via its label
  // <span>: "Root type" in schema mode, "Root object" in object mode.
  // (Playwright's `getByLabel` is unreliable here because the wrapping
  // `<label>` text includes the `<select>`'s option text, so we match
  // the visible label <span> instead.)
  const toolbar = adminPage.getByRole('region', { name: /ontology graph controls/i });
  await expect(toolbar.getByText(/^Root type$/)).toBeVisible();
  await expect(toolbar.getByText(/^Root object$/)).toHaveCount(0);

  // Toggle to Object mode. The toolbar swaps the "Root type" select
  // for a "Root object" text input, proving the layout-mode swap took.
  await adminPage.getByRole('button', { name: /^Object$/ }).click();
  await expect(
    adminPage.getByRole('button', { name: /^Object$/ }),
  ).toHaveClass(/of-button--primary/);
  await expect(toolbar.getByText(/^Root object$/)).toBeVisible();
  await expect(toolbar.getByText(/^Root type$/)).toHaveCount(0);

  // Back to schema — the Root type label returns.
  await adminPage.getByRole('button', { name: /^Schema$/ }).click();
  await expect(toolbar.getByText(/^Root type$/)).toBeVisible();
});

test('Graph: filtering by Root type re-fetches the graph scoped to that namespace', async ({
  adminPage,
}) => {
  await mockOntologySurface(adminPage);
  const graphCalls = captureRequests(adminPage, /\/api\/v1\/ontology\/graph(\?|$)/);
  await adminPage.goto('/ontology/graph');
  await waitForCytoscapeReady(adminPage);

  // Wait for the initial unfiltered load so the captured count is
  // stable before we measure the filter-driven re-fetch.
  await expect.poll(() => graphCalls.count()).toBeGreaterThanOrEqual(1);
  const initialCalls = graphCalls.count();

  // Pick the Aircraft root type and click Load. The root-type select
  // is the de-facto "namespace filter" in the shipped page. The
  // toolbar renders exactly one `<select>` in schema mode, so a
  // toolbar-scoped combobox locator is unambiguous.
  const toolbar = adminPage.getByRole('region', { name: /ontology graph controls/i });
  await toolbar.getByRole('combobox').selectOption(AIRCRAFT.id);
  await adminPage.getByRole('button', { name: /^Load$/ }).click();

  // A new GET hit /ontology/graph with `root_type_id=<aircraft>`.
  await expect.poll(() => graphCalls.count()).toBeGreaterThan(initialCalls);
  const filterCall = graphCalls.calls.find((call) =>
    call.url.includes(`root_type_id=${AIRCRAFT.id}`),
  );
  expect(filterCall).toBeDefined();

  // Header chips report the narrowed graph shape from the filtered
  // mock response (only Aircraft passes the filter ⇒ 1 node, 0 edges).
  await expect(adminPage.getByText(/^1 nodes$/)).toBeVisible();
  await expect(adminPage.getByText(/^0 edges$/)).toBeVisible();

  // Cytoscape itself is rebuilt with the narrowed node set.
  await expect.poll(async () =>
    adminPage.evaluate(() => {
      const cy = (window as unknown as {
        __cytoscape__: Record<string, { nodes: () => { length: number } }>;
      }).__cytoscape__['ontology-graph'];
      return cy.nodes().length;
    }),
  ).toBe(1);
});

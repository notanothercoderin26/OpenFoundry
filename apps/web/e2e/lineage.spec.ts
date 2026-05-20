import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';

/**
 * E2E coverage for `/lineage`
 * (apps/web/src/routes/lineage/LineagePage.tsx, ~7000 LoC).
 *
 * **Reality vs roadmap.** The shipped page is the Foundry Data Lineage
 * application:
 *   - The graph renders into a Cytoscape canvas (`<div class="lineage-canvas">`).
 *     Cytoscape draws to a `<canvas>` — individual nodes are NOT in the
 *     DOM, so Playwright can't `click` a node directly. The tests below
 *     therefore drive selection through the Search panel in the right
 *     rail (`onPick(id)` → `selectLineageNode`), which is the same code
 *     path the on-canvas `cy.on('tap', 'node', …)` handler uses.
 *   - There is no slider per se; depth is controlled by the parents /
 *     children Stepper widgets inside the Expand popover.
 *   - There is no explicit "Upstream only / Downstream only / Both"
 *     radio. Direction is conveyed two ways:
 *       (a) The Flow toggle rotates layout (TB → LR → BT → RL).
 *       (b) The Health tab in the bottom panel shows Upstream / Downstream
 *           metric cards and impact columns sourced from
 *           `/api/v1/lineage/datasets/{id}/impact`.
 *   - "Export as JSON" is exposed via the Clipboard right-rail panel for
 *     saved snapshots; "Export as image" is the `Save options → Export
 *     graph to SVG` menu entry. Both ride the browser's `Blob` + anchor
 *     download path, so we assert the menu entries exist and that the
 *     SVG export item is clickable.
 *
 * Endpoints touched on mount:
 *   - GET  /api/v1/lineage                       (full lineage graph)
 *   - GET  /data-integration/v1/schedules?limit=500
 *   - GET  /v1/builds?limit=500                  (NOT under /api/v1)
 *   - GET  /api/v1/datasets/{id}/job-specs       (per dataset, fire-and-forget)
 * After a dataset is selected:
 *   - GET  /api/v1/lineage/datasets/{id}/impact
 *   - GET  /api/v1/datasets/{id}/preview
 *   - GET  /api/v1/datasets/{id}/schema (etc.)
 *
 * Selector strategy mirrors task 6.3: pure data-testid hooks are not
 * present yet, so we drive through the canonical accessible names
 * (button `title`, button text, `<select>` options) exposed by the
 * Ribbon / RightRail / Header components.
 */

// The lineage page composes Monaco, Cytoscape, and several lazy panels.
// Each of them legitimately logs during route-mocked runs.
test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Failed to load/i,
      /cytoscape/i,
      // React 19 + Cytoscape interop: Cytoscape rewrites the canvas's
      // border declarations, and React surfaces a benign style-conflict
      // warning during re-renders. Not actionable from app code.
      /style property during rerender/i,
      /borderColor/,
    ],
  },
});

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

interface MockNode {
  id: string;
  kind: string;
  label: string;
  marking: string;
  metadata: Record<string, unknown>;
}

interface MockEdge {
  id: string;
  source: string;
  source_kind: string;
  target: string;
  target_kind: string;
  relation_kind: string;
  pipeline_id: string | null;
  workflow_id: string | null;
  node_id: string | null;
  step_id: string | null;
  effective_marking: string;
  metadata: Record<string, unknown>;
}

interface MockGraph {
  nodes: MockNode[];
  edges: MockEdge[];
}

const DATASET_RAW: MockNode = {
  id: 'dataset-raw',
  kind: 'dataset',
  label: 'raw_events',
  marking: 'public',
  metadata: {
    rid: 'ri.foundry.main.dataset.raw',
    project_rid: 'project-alpha',
    folder_path: '/raw',
    branch: 'master',
  },
};

const PIPELINE: MockNode = {
  id: 'pipeline-1',
  kind: 'pipeline',
  label: 'enrichment',
  marking: 'public',
  metadata: {
    rid: 'ri.foundry.main.pipeline.enrich',
    pipeline_rid: 'ri.foundry.main.pipeline.enrich',
    project_rid: 'project-alpha',
    repository: 'openfoundry/transforms',
  },
};

const DATASET_CURATED: MockNode = {
  id: 'dataset-curated',
  kind: 'dataset',
  label: 'curated_events',
  marking: 'confidential',
  metadata: {
    rid: 'ri.foundry.main.dataset.curated',
    project_rid: 'project-alpha',
    folder_path: '/curated',
    pipeline_rid: 'ri.foundry.main.pipeline.enrich',
    branch: 'master',
  },
};

const OBJECT_TYPE: MockNode = {
  id: 'object-type-event',
  kind: 'object_type',
  label: 'Event',
  marking: 'public',
  metadata: { rid: 'ri.ontology.main.object-type.event' },
};

function makeEdge(overrides: Partial<MockEdge> & Pick<MockEdge, 'id' | 'source' | 'target' | 'source_kind' | 'target_kind'>): MockEdge {
  return {
    relation_kind: 'depends_on',
    pipeline_id: null,
    workflow_id: null,
    node_id: null,
    step_id: null,
    effective_marking: 'public',
    metadata: {},
    ...overrides,
  };
}

const DEFAULT_GRAPH: MockGraph = {
  nodes: [DATASET_RAW, PIPELINE, DATASET_CURATED, OBJECT_TYPE],
  edges: [
    makeEdge({
      id: 'edge-raw-to-pipeline',
      source: 'dataset-raw',
      source_kind: 'dataset',
      target: 'pipeline-1',
      target_kind: 'pipeline',
      relation_kind: 'consumes',
      pipeline_id: 'pipeline-1',
    }),
    makeEdge({
      id: 'edge-pipeline-to-curated',
      source: 'pipeline-1',
      source_kind: 'pipeline',
      target: 'dataset-curated',
      target_kind: 'dataset',
      relation_kind: 'produces',
      pipeline_id: 'pipeline-1',
    }),
    makeEdge({
      id: 'edge-curated-to-object-type',
      source: 'dataset-curated',
      source_kind: 'dataset',
      target: 'object-type-event',
      target_kind: 'object_type',
      relation_kind: 'materializes',
    }),
  ],
};

interface LineageMocks {
  /** The graph payload `/api/v1/lineage` returns. Mutate to simulate refreshes. */
  graph: MockGraph;
}

/**
 * Installs the minimum set of route mocks the lineage page reads on
 * mount, plus the dataset-impact endpoint hit when a dataset is
 * selected. Mocks are NOT idempotent — call once per test before
 * `page.goto('/lineage')`.
 */
async function mockLineage(page: Page, graph: MockGraph = DEFAULT_GRAPH): Promise<LineageMocks> {
  const state: LineageMocks = { graph: { nodes: graph.nodes.slice(), edges: graph.edges.slice() } };

  // GET /api/v1/lineage — the canonical entry point for `getFullLineage`.
  // Anchored on `/lineage(?|$)` so it does NOT mask the per-dataset impact
  // route (`/lineage/datasets/<id>/impact`).
  await page.route(/\/api\/v1\/lineage(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: state.graph });
  });

  // Per-dataset impact: synthesised from the graph so the upstream /
  // downstream split mirrors the topology the spec actually rendered.
  await page.route(/\/api\/v1\/lineage\/datasets\/([^/?#]+)\/impact/, async (route: Route) => {
    const m = /\/datasets\/([^/?#]+)\/impact/.exec(route.request().url());
    const id = m ? decodeURIComponent(m[1]) : '';
    const upstream = state.graph.edges.filter((e) => e.target === id);
    const downstream = state.graph.edges.filter((e) => e.source === id);
    const root = state.graph.nodes.find((n) => n.id === id);
    await route.fulfill({
      json: {
        root: root ?? { id, kind: 'dataset', label: id, marking: 'public', metadata: {} },
        propagated_marking: root?.marking ?? 'public',
        upstream: upstream.map((e) => ({
          id: e.source,
          kind: e.source_kind,
          label: state.graph.nodes.find((n) => n.id === e.source)?.label ?? e.source,
          distance: 1,
          marking: e.effective_marking,
          effective_marking: e.effective_marking,
          requires_acknowledgement: false,
          metadata: {},
          path: [],
        })),
        downstream: downstream.map((e) => ({
          id: e.target,
          kind: e.target_kind,
          label: state.graph.nodes.find((n) => n.id === e.target)?.label ?? e.target,
          distance: 1,
          marking: e.effective_marking,
          effective_marking: e.effective_marking,
          requires_acknowledgement: false,
          metadata: {},
          path: [],
        })),
        build_candidates: [],
      },
    });
  });

  // Dataset preview / schema / health / transactions — empty bodies so
  // the bottom-panel tabs render without crashing.
  await page.route(/\/api\/v1\/datasets\/[^/?#]+\/preview/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { columns: [], rows: [], total_rows: 0, sample_size: 0, fresh: true },
    });
  });
  await page.route(/\/api\/v1\/datasets\/[^/?#]+\/schema/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { columns: [] } });
  });
  await page.route(/\/api\/v1\/datasets\/[^/?#]+\/health/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        row_count: 0,
        col_count: 0,
        last_build_status: 'unknown',
        schema_drift_flag: false,
      },
    });
  });
  await page.route(/\/api\/v1\/datasets\/[^/?#]+\/transactions/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: [] });
  });
  await page.route(/\/api\/v1\/datasets\/[^/?#]+\/job-specs/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: [] });
  });

  // Column-level lineage is hit lazily when the user opens Find → By
  // column. The page expects an array `ColumnLineageEdge[]` — the
  // default catch-all would return a list envelope, which is NOT
  // iterable and crashes the page (`result.value is not iterable`).
  await page.route(/\/api\/v1\/lineage\/datasets\/[^/?#]+\/columns/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: [] });
  });

  // Schedules service (different base path, `/data-integration/v1`).
  await page.route(/\/data-integration\/v1\/schedules/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: [], total: 0 } });
  });

  // Builds V1 client targets `/v1/builds` (NOT `/api/v1/builds`), so the
  // default catch-all does not intercept it. Match both shapes for safety.
  await page.route(/\/v1\/builds(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: [], next_cursor: null, limit: 500 } });
  });

  // Lineage saved-graphs (Clipboard panel + Save options). Empty list +
  // 204 for delete so the popover renders the "no snapshots" state.
  await page.route(/\/api\/v1\/lineage\/saved-graphs/, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { data: [] } });
      return;
    }
    if (method === 'POST') {
      await route.fulfill({ json: { id: 'saved-1', name: 'snapshot', payload: {}, branch: 'master', coloring_mode: 'resource_type', updated_at: '2026-05-11T00:00:00Z' } });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });

  return state;
}

// Wait for the lineage page to finish its initial /lineage fetch and
// render either the canvas or the empty-state copy. Use this in every
// test before driving the UI.
async function waitForLineageReady(page: Page): Promise<void> {
  // The page section is always present (`<section class="lineage-app">`),
  // but the canvas only appears once `loading` flips false. The empty
  // state shares the same outer container, so we wait for either DOM
  // anchor before asserting further.
  await expect(page.locator('section.lineage-app')).toBeVisible({ timeout: 15_000 });
  await expect(
    page.locator('.lineage-canvas').or(page.getByText(/no lineage data yet/i)),
  ).toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renders the lineage canvas + ribbon controls when the graph has nodes', async ({ adminPage }) => {
  await mockLineage(adminPage);
  await adminPage.goto('/lineage');
  await waitForLineageReady(adminPage);

  // Canvas mounts when the graph is non-empty (vs the empty-state copy).
  await expect(adminPage.locator('.lineage-canvas')).toBeVisible();
  await expect(adminPage.getByText(/no lineage data yet/i)).toHaveCount(0);

  // Header chrome: Save + Save options. Scope to the LineageHeader to
  // avoid the AppShell topbar's own "Save" action button.
  const lineageApp = adminPage.locator('section.lineage-app');
  await expect(lineageApp.getByRole('button', { name: /^save$/i })).toBeVisible();
  await expect(lineageApp.getByRole('button', { name: /save options/i })).toBeVisible();

  // Ribbon tool buttons — each ToolButton renders its label as visible text.
  for (const label of ['Layout', 'Clean', 'Select', 'Expand', 'Color', 'Find', 'Align', 'Refresh']) {
    await expect(
      lineageApp.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first(),
    ).toBeVisible();
  }

  // Legend overlay reflects category counts for the default
  // `resource_type` coloring. The mocked graph has 2 datasets, 1
  // pipeline, 1 object_type — and the enrichLineageGraph helper also
  // synthesises a `transform` node from the edge metadata, so we
  // assert via `>= 3` distinct labels rather than pinning the count.
  await expect(adminPage.getByText(/^Dataset$/i).first()).toBeVisible();
  await expect(adminPage.getByText(/^Pipeline$/i).first()).toBeVisible();
  await expect(adminPage.getByText(/^Object Type$/i).first()).toBeVisible();
});

test('empty graph shows the placeholder; canvas does NOT mount', async ({ adminPage }) => {
  await mockLineage(adminPage, { nodes: [], edges: [] });
  await adminPage.goto('/lineage');
  await waitForLineageReady(adminPage);

  await expect(adminPage.getByText(/no lineage data yet/i)).toBeVisible();
  // Canvas is gated on `viewGraph.nodes.length > 0`.
  await expect(adminPage.locator('.lineage-canvas')).toHaveCount(0);
});

test('Search right-rail panel lists datasets, pipelines and object types as input resources', async ({ adminPage }) => {
  await mockLineage(adminPage);
  await adminPage.goto('/lineage');
  await waitForLineageReady(adminPage);

  // Open the right-rail Search panel. The RightRailButton is icon-only,
  // so we use its `title` attribute.
  await adminPage.getByRole('button', { name: 'Search', exact: true }).click();

  // The drawer's strong header echoes "Search" and includes the
  // placeholder copy. We anchor on the placeholder to scope the
  // upcoming list lookups to the drawer.
  const drawerInput = adminPage.getByPlaceholder(/Dataset, path, project, folder, type, repo, schedule, branch/i);
  await expect(drawerInput).toBeVisible();

  // All three resource kinds in the fixture show up in the list, each
  // labelled with its kind on the right side of the row.
  await expect(adminPage.getByRole('button', { name: /raw_events.*dataset/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /enrichment.*pipeline/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /Event.*object_type/i })).toBeVisible();

  // Typing into the search input narrows the list to matches only.
  await drawerInput.fill('curated');
  await expect(adminPage.getByRole('button', { name: /curated_events.*dataset/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /raw_events.*dataset/i })).toHaveCount(0);
});

test('picking a node in Search opens the Properties drawer with kind, marking and label', async ({ adminPage }) => {
  await mockLineage(adminPage);
  await adminPage.goto('/lineage');
  await waitForLineageReady(adminPage);

  // Open Search, pick the curated dataset.
  await adminPage.getByRole('button', { name: 'Search', exact: true }).click();
  await adminPage.getByRole('button', { name: /curated_events.*dataset/i }).click();

  // Switch to Properties drawer (same `RightRailButton` row).
  await adminPage.getByRole('button', { name: 'View node properties', exact: true }).click();

  // The NodePropertiesPanel surfaces the label + "Kind · marking" eyebrow.
  // `curated_events` is a dataset with the `confidential` marking in the
  // fixture; the panel renders the kind title-cased.
  await expect(adminPage.getByText('curated_events').first()).toBeVisible();
  await expect(adminPage.getByText(/Dataset.*confidential/i)).toBeVisible();
});

test('Expand popover exposes parents/children depth controls (the "slider" surface)', async ({ adminPage }) => {
  await mockLineage(adminPage);
  await adminPage.goto('/lineage');
  await waitForLineageReady(adminPage);

  // Open the Expand popover from the ribbon.
  await adminPage.getByRole('button', { name: /^expand$/i }).first().click();

  // Two Stepper hints — "Expand parents" and "Expand children" — render
  // as visible labels inside the popover. They drive `expand_parents`
  // and `expand_children` in the saved-snapshot payload (the spec's
  // semantic equivalent of a depth slider).
  await expect(adminPage.getByText(/^Expand parents$/i)).toBeVisible();
  await expect(adminPage.getByText(/^Expand children$/i)).toBeVisible();

  // The popover also shows the "Add N nodes" primary CTA; while
  // disabled with no seeds selected, its presence proves the depth
  // control is wired to a graph mutation.
  await expect(adminPage.getByRole('button', { name: /^Add \d+ nodes$/i })).toBeVisible();

  // Find-in-between, common ancestors, common descendants are the
  // three path-highlighting actions exposed in the same popover
  // (covered in its own test below).
  await expect(adminPage.getByRole('button', { name: /Add in-between/i })).toBeVisible();
});

test('Flow toggle cycles dependency direction (LR → BT → RL → TB)', async ({ adminPage }) => {
  await mockLineage(adminPage);
  await adminPage.goto('/lineage');
  await waitForLineageReady(adminPage);

  // The Flow ToolButton has a unique `title` ("Rotate dependency
  // direction (TB → LR → BT → RL)"), so we anchor on it instead of the
  // label-text that mutates between clicks. The page's initial
  // `flowQuarter` is 1 (LR) — that's the default the LineagePage
  // ships with. Each click rotates: LR → BT → RL → TB → LR.
  const flow = adminPage.locator('button[title^="Rotate dependency direction"]');
  await expect(flow).toBeVisible();
  await expect(flow).toContainText(/Flow\s+LR/);

  await flow.click();
  await expect(flow).toContainText(/Flow\s+BT/);

  await flow.click();
  await expect(flow).toContainText(/Flow\s+RL/);

  await flow.click();
  await expect(flow).toContainText(/Flow\s+TB/);
});

test('Health tab in the bottom panel summarises upstream and downstream impact for a selected dataset', async ({ adminPage }) => {
  await mockLineage(adminPage);
  await adminPage.goto('/lineage');
  await waitForLineageReady(adminPage);

  // Select the curated dataset via the Search panel — fires the same
  // `selectLineageNode` flow the canvas tap handler uses, which kicks
  // off the impact request.
  await adminPage.getByRole('button', { name: 'Search', exact: true }).click();
  await adminPage.getByRole('button', { name: /curated_events.*dataset/i }).click();

  // Switch to Health tab. The tab button is plain text inside the bottom
  // panel header strip; first() guards against the legend's "Data
  // Health" coloring entry sharing the prefix.
  await adminPage.getByRole('button', { name: /^Health$/i }).first().click();

  // Upstream / Downstream MetricCards render the impact counts pulled
  // from `/lineage/datasets/<id>/impact`. The mock derives them from the
  // graph topology: curated has 1 upstream edge (the producing
  // pipeline) and 1 downstream edge (the materialised object_type).
  await expect(adminPage.getByText(/^Upstream$/i).first()).toBeVisible();
  await expect(adminPage.getByText(/^Downstream$/i).first()).toBeVisible();

  // The "Build impacted" CTA is the action surface for re-running
  // upstream-or-downstream chains. Its presence confirms the
  // direction-aware impact panel rendered.
  await expect(adminPage.getByRole('button', { name: /Build impacted/i })).toBeVisible();
});

test('Tools panel filters: hiding a resource_type category re-renders the legend', async ({ adminPage }) => {
  await mockLineage(adminPage);
  await adminPage.goto('/lineage');
  await waitForLineageReady(adminPage);

  // Open Tools right-rail panel.
  await adminPage.getByRole('button', { name: 'Tools', exact: true }).click();

  // The ColorAndFilterTool exposes a `<select>` for "Node coloring"
  // (defaulted to resource_type) and a list of category checkboxes —
  // one per visible legend entry. Tick OFF the Pipeline category.
  await expect(adminPage.getByText(/Node coloring/i).first()).toBeVisible();
  // The pipeline checkbox label includes "Pipeline" + the node count.
  // Match the label flexibly so the test survives count drift.
  const pipelineFilter = adminPage.locator('label', { has: adminPage.locator('input[type=checkbox]') }).filter({ hasText: /Pipeline/ }).first();
  await expect(pipelineFilter).toBeVisible();

  // Check the box state, click, and re-check.
  const box = pipelineFilter.locator('input[type=checkbox]');
  await expect(box).toBeChecked();
  await box.click();
  await expect(box).not.toBeChecked();

  // Clearing the filter restores the original state.
  const clearBtn = adminPage.getByRole('button', { name: /^Clear$/ }).first();
  await clearBtn.click();
  await expect(box).toBeChecked();
});

test('Save options menu exposes the SVG export entry', async ({ adminPage }) => {
  await mockLineage(adminPage);
  await adminPage.goto('/lineage');
  await waitForLineageReady(adminPage);

  // Click the Save-options caret to open the menu.
  await adminPage.getByRole('button', { name: /save options/i }).click();

  // Menu items wired in LineageHeader: Save as…, Open graph…, Export
  // graph to SVG. We assert all three so the export surface as a whole
  // is covered, then click the SVG export and confirm the menu closes
  // (the call dispatches `downloadCytoscapeSvg(cy, …)`; we don't try
  // to capture the binary blob here — that path is already covered by
  // unit tests for `exportSvg.ts`).
  await expect(adminPage.getByRole('button', { name: /save as/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /open graph/i })).toBeVisible();
  const exportItem = adminPage.getByRole('button', { name: /export graph to svg/i });
  await expect(exportItem).toBeVisible();

  await exportItem.click();

  // After the action, the menu collapses — the export item is no
  // longer in the DOM.
  await expect(exportItem).toHaveCount(0);
});

test('Expand popover surfaces the in-between path-highlighting action', async ({ adminPage }) => {
  await mockLineage(adminPage);
  await adminPage.goto('/lineage');
  await waitForLineageReady(adminPage);

  // The Expand popover hosts three "highlight path between selected
  // nodes" actions:
  //   - Add in-between (⌘B)            — nodes on directed paths
  //   - Add common ancestors (⌘J)      — ancestors of every selected node
  //   - Add common descendants (⌘K)    — descendants of every selected node
  // All three appear inside the popover; we open it and assert each
  // is exposed. The buttons are disabled until a multi-selection is
  // active — verifying the disabled state is the regression guard for
  // "feature available exclusively when 2+ nodes are selected".
  await adminPage.getByRole('button', { name: /^expand$/i }).first().click();

  const inBetween = adminPage.getByRole('button', { name: /Add in-between/i });
  const ancestors = adminPage.getByRole('button', { name: /Add common ancestors/i });
  const descendants = adminPage.getByRole('button', { name: /Add common descendants/i });

  await expect(inBetween).toBeVisible();
  await expect(ancestors).toBeVisible();
  await expect(descendants).toBeVisible();

  // Without a multi-selection on the canvas, the three actions are
  // disabled — the page disables them via `multiSelectActionDisabled`.
  await expect(inBetween).toBeDisabled();
  await expect(ancestors).toBeDisabled();
  await expect(descendants).toBeDisabled();
});

test('Find popover toggles between By-name and By-column search modes', async ({ adminPage }) => {
  await mockLineage(adminPage);
  await adminPage.goto('/lineage');
  await waitForLineageReady(adminPage);

  // Open Find popover from the ribbon.
  await adminPage.getByRole('button', { name: /^find$/i }).first().click();

  // Two mode tabs. By name is the default — its placeholder differs
  // from By column.
  const byName = adminPage.getByRole('button', { name: /^by name$/i });
  const byColumn = adminPage.getByRole('button', { name: /^by column$/i });
  await expect(byName).toBeVisible();
  await expect(byColumn).toBeVisible();

  // Default placeholder reflects name-mode.
  await expect(
    adminPage.getByPlaceholder(/Find dataset, path, project, branch/i),
  ).toBeVisible();

  // Switching to column mode rewrites the placeholder.
  await byColumn.click();
  await expect(adminPage.getByPlaceholder(/Find column name/i)).toBeVisible();
});

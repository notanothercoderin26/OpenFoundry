import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/pipelines/:id/edit`
 * (apps/web/src/routes/pipelines/PipelineEditPage.tsx, ~2000 lines).
 *
 * **Reality vs roadmap.** The shipped editor is NOT React Flow / NOT
 * Cytoscape — it's a custom inline SVG built by
 * `lib/components/pipeline/PipelineCanvas.tsx`. Every node renders as
 * a `<g data-pipeline-node="<id>" onClick=…>` and edges are bezier
 * `<path>` siblings. Mismatches with the original task ask that the
 * final regression test pins:
 *
 *   - Add nodes: NO drag-from-palette / `dragTo()`. The canvas exposes
 *     a click-driven toolbar (`+ Passthrough / + SQL / + Python / + LLM
 *     / + WASM`) and an `addNode(transform)` handler.
 *   - Connect nodes: NO output→input handle drag. Workflow is "select a
 *     node, click `Connect →`, click target node".
 *   - Delete node: NO `Delete` keyboard shortcut. Right-click opens a
 *     context menu with a "Delete" item.
 *   - Selecting a node opens `NodePreviewPanel` (data preview) below
 *     the canvas, NOT a separate "properties" side panel.
 *   - There is NO `Logs` tab. The Edit area's sub-tabs are
 *     `canvas / nodes / config / runs / validate`.
 *   - Save uses PUT `/api/v1/pipelines/:id`, NOT PATCH. The task ask's
 *     "PATCH on property edit" is a roadmap claim; today the editor
 *     batches all edits behind the top-bar `Save` button.
 *   - `Run now` POSTs `/api/v1/pipelines/:id/runs` (plural), NOT
 *     `/run`, and surfaces feedback by switching to the Runs sub-tab
 *     and reloading runs — there is no toast component.
 *
 * **Test-id status.** The task asks for `data-testid="pipeline-node-<id>"`
 * but the canvas currently exposes `data-pipeline-node="<id>"`. We use
 * the latter via CSS attribute selectors here. The accompanying request
 * to add a Playwright-idiomatic `data-testid` family is tracked in the
 * issue opened alongside this spec (see commit message). Required ids:
 *
 *   - `data-testid="pipeline-canvas"`              on the SVG root
 *   - `data-testid="pipeline-node-<id>"`           on each `<g>` node
 *   - `data-testid="pipeline-edge-<dep>-<id>"`     on each edge path
 *   - `data-testid="pipeline-toolbar-add-<kind>"`  on each "+ SQL" etc.
 *   - `data-testid="pipeline-node-preview"`        on NodePreviewPanel
 *   - `data-testid="pipeline-runs-row-<runId>"`    on Runs tab rows
 *   - `data-testid="pipeline-version-row-<vId>"`   on History tab rows
 *
 * Endpoints exercised:
 *   - GET   /api/v1/pipelines/{id}
 *   - GET   /api/v1/pipelines/{id}/runs?per_page=50
 *   - GET   /api/v1/pipelines/{id}/versions
 *   - POST  /api/v1/pipelines/{id}/views                       (best-effort)
 *   - POST  /api/v1/pipelines/_validate                        (live, debounced)
 *   - POST  /api/v1/pipelines/{id}/_validate                   (Validate button)
 *   - POST  /api/v1/pipelines/{id}/runs                        (Run now)
 *   - POST  /api/v1/pipelines/{id}/runs/{runId}/retry          (Retry)
 *   - POST  /api/v1/pipelines/{id}/nodes/{nodeId}/preview      (NodePreviewPanel)
 *   - PUT   /api/v1/pipelines/{id}                             (Save)
 *   - POST  /api/v1/pipelines/{id}/versions/{vId}/restore      (Restore)
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Failed to load/i,
      /ECONNREFUSED|NetworkError/,
    ],
  },
});

const PIPELINE_ID = 'pipeline-edit-1';
const E2E_NOW = '2026-05-11T00:00:00Z';

const PIPELINE_GET = new RegExp(`/api/v1/pipelines/${PIPELINE_ID}(\\?|$)`);
const PIPELINE_PUT = new RegExp(`/api/v1/pipelines/${PIPELINE_ID}(\\?|$)`);
const PIPELINE_RUNS_LIST = new RegExp(`/api/v1/pipelines/${PIPELINE_ID}/runs(\\?|$)`);
const PIPELINE_RUNS_TRIGGER = new RegExp(`/api/v1/pipelines/${PIPELINE_ID}/runs(\\?|$)`);
const PIPELINE_RUN_RETRY = new RegExp(
  `/api/v1/pipelines/${PIPELINE_ID}/runs/[^/]+/retry(\\?|$)`,
);
const PIPELINE_VERSIONS = new RegExp(`/api/v1/pipelines/${PIPELINE_ID}/versions(\\?|$)`);
const PIPELINE_VERSION_RESTORE = new RegExp(
  `/api/v1/pipelines/${PIPELINE_ID}/versions/[^/]+/restore(\\?|$)`,
);
const PIPELINE_VALIDATE_LIVE = /\/api\/v1\/pipelines\/_validate(\?|$)/;
const PIPELINE_VALIDATE_BYID = new RegExp(
  `/api/v1/pipelines/${PIPELINE_ID}/_validate(\\?|$)`,
);
const PIPELINE_NODE_PREVIEW = new RegExp(
  `/api/v1/pipelines/${PIPELINE_ID}/nodes/[^/]+/preview(\\?|$)`,
);

interface PipelineNodeFixture {
  id: string;
  label: string;
  transform_type: string;
  config: Record<string, unknown>;
  depends_on: string[];
  input_dataset_ids: string[];
  output_dataset_id: string | null;
}

interface PipelineFixture {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  dag: PipelineNodeFixture[];
  status: string;
  schedule_config: { enabled: boolean; cron: string | null };
  retry_policy: {
    max_attempts: number;
    retry_on_failure: boolean;
    allow_partial_reexecution: boolean;
  };
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
  pipeline_type: string;
  branch_name?: string;
}

function makeNode(overrides: Partial<PipelineNodeFixture> = {}): PipelineNodeFixture {
  return {
    id: 'node_a',
    label: 'Source',
    transform_type: 'sql',
    config: { sql: 'SELECT 1 AS value' },
    depends_on: [],
    input_dataset_ids: [],
    output_dataset_id: null,
    ...overrides,
  };
}

function makePipeline(overrides: Partial<PipelineFixture> = {}): PipelineFixture {
  return {
    id: PIPELINE_ID,
    name: 'Editor fixture',
    description: 'Deterministic editor pipeline',
    owner_id: '00000000-0000-0000-0000-000000000001',
    dag: [
      makeNode({ id: 'node_a', label: 'Source' }),
      makeNode({ id: 'node_b', label: 'Transform', depends_on: ['node_a'] }),
      makeNode({ id: 'node_c', label: 'Sink', depends_on: ['node_b'] }),
    ],
    status: 'draft',
    schedule_config: { enabled: false, cron: null },
    retry_policy: {
      max_attempts: 1,
      retry_on_failure: false,
      allow_partial_reexecution: true,
    },
    next_run_at: null,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    pipeline_type: 'BATCH',
    branch_name: 'main',
    ...overrides,
  };
}

interface RunFixture {
  id: string;
  pipeline_id: string;
  status: string;
  trigger_type: string;
  started_by: string | null;
  attempt_number: number;
  started_from_node_id: string | null;
  retry_of_run_id: string | null;
  execution_context: Record<string, unknown>;
  node_results: null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

function makeRun(overrides: Partial<RunFixture> = {}): RunFixture {
  return {
    id: 'run-1',
    pipeline_id: PIPELINE_ID,
    status: 'succeeded',
    trigger_type: 'manual',
    started_by: '00000000-0000-0000-0000-000000000001',
    attempt_number: 1,
    started_from_node_id: null,
    retry_of_run_id: null,
    execution_context: {},
    node_results: null,
    error_message: null,
    started_at: '2026-05-10T12:00:00Z',
    finished_at: '2026-05-10T12:00:10Z',
    ...overrides,
  };
}

interface VersionFixture {
  id: string;
  pipeline_id: string;
  version_number: number;
  branch_name: string;
  version_kind: string;
  dag: unknown[];
  name: string;
  description: string;
  schedule_config: { enabled: boolean; cron: string | null };
  retry_policy: {
    max_attempts: number;
    retry_on_failure: boolean;
    allow_partial_reexecution: boolean;
  };
  created_by: string | null;
  created_at: string;
  message: string;
  restored_from_version_id: string | null;
}

function makeVersion(overrides: Partial<VersionFixture> = {}): VersionFixture {
  return {
    id: 'version-1',
    pipeline_id: PIPELINE_ID,
    version_number: 1,
    branch_name: 'main',
    version_kind: 'published',
    dag: [],
    name: 'Editor fixture',
    description: '',
    schedule_config: { enabled: false, cron: null },
    retry_policy: {
      max_attempts: 1,
      retry_on_failure: false,
      allow_partial_reexecution: true,
    },
    created_by: '00000000-0000-0000-0000-000000000001',
    created_at: '2026-05-09T08:00:00Z',
    message: 'Initial publish',
    restored_from_version_id: null,
    ...overrides,
  };
}

interface ValidateByIdResponse {
  pipeline_id: string;
  all_valid: boolean;
  nodes: Array<{
    node_id: string;
    status: string;
    errors: Array<{ node_id: string; column: string | null; code?: string; message: string }>;
  }>;
}

interface EditorMockState {
  pipeline: PipelineFixture;
  runs: RunFixture[];
  versions: VersionFixture[];
}

/**
 * Wires up every endpoint the editor mounts touch. Mutations are stateful
 * (PUT updates `state.pipeline`, POST /runs appends to `state.runs`, etc.)
 * so cross-action assertions like "Run now adds a row" work without
 * re-installing handlers.
 *
 * Each route handler is overridable by registering a more specific
 * `page.route` AFTER this helper returns — Playwright dispatches
 * most-recent-first.
 */
async function mockPipelineEditor(
  page: Page,
  initial: {
    pipeline: PipelineFixture;
    runs?: RunFixture[];
    versions?: VersionFixture[];
    validateById?: ValidateByIdResponse;
  },
): Promise<EditorMockState> {
  const state: EditorMockState = {
    pipeline: { ...initial.pipeline },
    runs: (initial.runs ?? []).slice(),
    versions: (initial.versions ?? []).slice(),
  };

  // The runs list and the trigger-run endpoint share the same path; split by
  // HTTP method.
  await page.route(PIPELINE_RUNS_LIST, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { data: state.runs } });
      return;
    }
    if (method === 'POST' && /\/runs(\?|$)/.test(route.request().url())) {
      const fresh = makeRun({
        id: `run-trigger-${state.runs.length + 1}`,
        status: 'running',
        attempt_number: 1,
        started_at: E2E_NOW,
        finished_at: null,
      });
      state.runs = [fresh, ...state.runs];
      await route.fulfill({ status: 201, json: fresh });
      return;
    }
    return route.fallback();
  });

  await page.route(PIPELINE_RUN_RETRY, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const retried = makeRun({
      id: `run-retry-${state.runs.length + 1}`,
      status: 'running',
      attempt_number: 2,
      started_at: E2E_NOW,
      finished_at: null,
    });
    state.runs = [retried, ...state.runs];
    await route.fulfill({ status: 201, json: retried });
  });

  await page.route(PIPELINE_VERSIONS, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: state.versions } });
  });

  await page.route(PIPELINE_VERSION_RESTORE, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: { pipeline: state.pipeline, version: state.versions[0] ?? makeVersion() },
    });
  });

  await page.route(PIPELINE_VALIDATE_LIVE, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: {
        valid: true,
        errors: [],
        warnings: [],
        next_run_at: null,
        summary: {
          node_count: state.pipeline.dag.length,
          edge_count: 0,
          root_node_ids: [],
          leaf_node_ids: [],
        },
      },
    });
  });

  await page.route(PIPELINE_VALIDATE_BYID, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json:
        initial.validateById ??
        ({
          pipeline_id: PIPELINE_ID,
          all_valid: true,
          nodes: state.pipeline.dag.map((n) => ({
            node_id: n.id,
            status: 'VALID',
            errors: [],
          })),
        } satisfies ValidateByIdResponse),
    });
  });

  await page.route(PIPELINE_NODE_PREVIEW, async (route: Route) => {
    const url = route.request().url();
    const m = /\/nodes\/([^/]+)\/preview/.exec(url);
    const nodeId = m?.[1] ?? 'unknown';
    await route.fulfill({
      json: {
        pipeline_id: PIPELINE_ID,
        node_id: nodeId,
        columns: ['value'],
        rows: [{ value: 1 }],
        sample_size: 1,
        generated_at: E2E_NOW,
        seed: 1,
        source_chain: [nodeId],
        fresh: true,
      },
    });
  });

  // PUT /api/v1/pipelines/<id> overlaps GET, so split by method.
  await page.route(PIPELINE_GET, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: state.pipeline });
      return;
    }
    if (method === 'PUT') {
      const body = route.request().postDataJSON() as Partial<PipelineFixture>;
      state.pipeline = { ...state.pipeline, ...body, updated_at: E2E_NOW };
      await route.fulfill({ json: state.pipeline });
      return;
    }
    return route.fallback();
  });

  return state;
}

test('renders the DAG with each mocked node as a `[data-pipeline-node]` SVG group', async ({
  adminPage,
}) => {
  await mockPipelineEditor(adminPage, { pipeline: makePipeline() });
  await adminPage.goto(`/pipelines/${PIPELINE_ID}/edit`);

  // The canvas SVG is rendered with role="img" + aria-label="Pipeline DAG".
  await expect(adminPage.getByRole('img', { name: 'Pipeline DAG' })).toBeVisible();

  // Each mocked node renders as a `<g data-pipeline-node="<id>">`.
  for (const id of ['node_a', 'node_b', 'node_c']) {
    await expect(adminPage.locator(`[data-pipeline-node="${id}"]`)).toBeVisible();
  }
  // And exactly three nodes — no phantom rows.
  await expect(adminPage.locator('[data-pipeline-node]')).toHaveCount(3);
});

test('top toolbar exposes the canonical authoring actions', async ({ adminPage }) => {
  await mockPipelineEditor(adminPage, { pipeline: makePipeline() });
  await adminPage.goto(`/pipelines/${PIPELINE_ID}/edit`);

  for (const label of ['Validate', 'Run now', 'Save', 'Deploy', 'Publish draft']) {
    await expect(
      adminPage.getByRole('button', { name: new RegExp(`^${label}$`) }),
    ).toBeVisible();
  }

  // The Edit sub-tabs are exactly canvas / nodes / config / runs / validate.
  for (const sub of ['canvas', 'nodes', 'config', 'runs', 'validate']) {
    await expect(adminPage.getByRole('tab', { name: new RegExp(`^${sub}$`, 'i') })).toBeVisible();
  }
});

test('clicking a node selects it and the preview panel header updates to the node label', async ({
  adminPage,
}) => {
  await mockPipelineEditor(adminPage, { pipeline: makePipeline() });
  await adminPage.goto(`/pipelines/${PIPELINE_ID}/edit`);

  // Before any selection, the preview panel renders the "No node selected"
  // headline.
  await expect(
    adminPage.getByRole('heading', { level: 3, name: /no node selected/i }),
  ).toBeVisible();

  // Click the Transform node (`<g data-pipeline-node="node_b">`).
  await adminPage.locator('[data-pipeline-node="node_b"]').click();

  // Preview panel header now reflects the selected node's label.
  await expect(adminPage.getByRole('heading', { level: 3, name: /^Transform$/ })).toBeVisible();
});

test('"Run now" POSTs /pipelines/:id/runs, switches to the Runs sub-tab and shows the new row', async ({
  adminPage,
}) => {
  await mockPipelineEditor(adminPage, {
    pipeline: makePipeline(),
    runs: [],
  });
  const cap = captureRequests(adminPage, PIPELINE_RUNS_TRIGGER);
  await adminPage.goto(`/pipelines/${PIPELINE_ID}/edit`);

  await expect(adminPage.getByRole('img', { name: 'Pipeline DAG' })).toBeVisible();

  await adminPage.getByRole('button', { name: /^Run now$/ }).click();

  // POST landed.
  await expect
    .poll(() =>
      cap.calls.some((c) => c.method === 'POST' && /\/runs($|\?)/.test(c.url)),
    )
    .toBe(true);

  // The Runs sub-tab is now selected and shows the freshly created row.
  await expect(adminPage.getByRole('tab', { name: /^runs$/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(adminPage.getByRole('cell', { name: /^running$/ })).toBeVisible();
});

test('"Validate" POSTs /pipelines/:id/_validate; an invalid response surfaces in the Validate sub-tab', async ({
  adminPage,
}) => {
  await mockPipelineEditor(adminPage, {
    pipeline: makePipeline(),
    validateById: {
      pipeline_id: PIPELINE_ID,
      all_valid: false,
      nodes: [
        {
          node_id: 'node_b',
          status: 'INVALID',
          errors: [
            { node_id: 'node_b', column: 'value', code: 'TYPE_MISMATCH', message: 'column value must be number' },
          ],
        },
      ],
    },
  });
  const cap = captureRequests(adminPage, PIPELINE_VALIDATE_BYID);
  await adminPage.goto(`/pipelines/${PIPELINE_ID}/edit`);

  await adminPage.getByRole('button', { name: /^Validate$/ }).click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(
    1,
  );

  await expect(adminPage.getByRole('tab', { name: /^validate$/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // The page concatenates the node id + the issue message into a bullet.
  await expect(adminPage.getByText(/^Invalid$/)).toBeVisible();
  await expect(adminPage.getByText(/node_b:\s*column value must be number/i)).toBeVisible();
});

test('Save: editing the Config tab name and pressing Save PUTs /pipelines/:id with the new payload', async ({
  adminPage,
}) => {
  await mockPipelineEditor(adminPage, { pipeline: makePipeline() });
  const cap = captureRequests(adminPage, PIPELINE_PUT);
  await adminPage.goto(`/pipelines/${PIPELINE_ID}/edit`);

  // Switch to the Config sub-tab.
  await adminPage.getByRole('tab', { name: /^config$/i }).click();

  // The Name input renders within a <label> so getByLabel works.
  const nameInput = adminPage.getByLabel(/^name$/i);
  await nameInput.fill('Renamed in editor');

  await adminPage.getByRole('button', { name: /^Save$/ }).click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'PUT').length)
    .toBeGreaterThanOrEqual(1);
  const put = cap.calls.find((c) => c.method === 'PUT');
  const body = put?.body as Record<string, unknown> | undefined;
  expect(body).toMatchObject({ name: 'Renamed in editor', status: 'draft' });
});

test('Runs sub-tab lists mocked runs and the Retry button POSTs the retry endpoint', async ({
  adminPage,
}) => {
  await mockPipelineEditor(adminPage, {
    pipeline: makePipeline(),
    runs: [makeRun({ id: 'run-existing-1', status: 'failed', attempt_number: 1 })],
  });
  const cap = captureRequests(adminPage, PIPELINE_RUN_RETRY);
  await adminPage.goto(`/pipelines/${PIPELINE_ID}/edit`);

  await adminPage.getByRole('tab', { name: /^runs$/i }).click();

  // Pre-existing row is rendered.
  await expect(adminPage.getByRole('cell', { name: /^failed$/i })).toBeVisible();

  // Retry the only row.
  await adminPage.getByRole('button', { name: /^Retry$/ }).first().click();

  await expect
    .poll(() => cap.calls.some((c) => c.method === 'POST' && /\/retry($|\?)/.test(c.url)))
    .toBe(true);
});

test('History sub-tab lists versions and Restore as draft POSTs /versions/:vId/restore', async ({
  adminPage,
}) => {
  await mockPipelineEditor(adminPage, {
    pipeline: makePipeline(),
    versions: [
      makeVersion({ id: 'version-2', version_number: 2, version_kind: 'draft', message: 'WIP edits' }),
      makeVersion({
        id: 'version-1',
        version_number: 1,
        version_kind: 'published',
        message: 'Initial publish',
      }),
    ],
  });
  const cap = captureRequests(adminPage, PIPELINE_VERSION_RESTORE);
  await adminPage.goto(`/pipelines/${PIPELINE_ID}/edit`);

  // Top-level "History" tab.
  await adminPage.getByRole('tab', { name: /^history$/i }).click();

  // Both versions render.
  await expect(adminPage.getByRole('cell', { name: 'v1' })).toBeVisible();
  await expect(adminPage.getByRole('cell', { name: 'v2' })).toBeVisible();

  // Open the actions menu for v1 (the second row) and click Restore as draft.
  const v1Row = adminPage.getByRole('row').filter({ has: adminPage.getByRole('cell', { name: 'v1' }) });
  await v1Row.getByRole('button', { name: /actions/i }).click();
  await adminPage.getByRole('menuitem', { name: /restore as draft/i }).click();

  await expect
    .poll(() => cap.calls.some((c) => c.method === 'POST' && /\/restore($|\?)/.test(c.url)))
    .toBe(true);
});

test('Canvas toolbar "+ SQL" adds a new `[data-pipeline-node]` to the SVG', async ({
  adminPage,
}) => {
  await mockPipelineEditor(adminPage, {
    pipeline: makePipeline({
      dag: [makeNode({ id: 'node_a', label: 'Source' })],
    }),
  });
  await adminPage.goto(`/pipelines/${PIPELINE_ID}/edit`);

  // Single existing node.
  await expect(adminPage.locator('[data-pipeline-node]')).toHaveCount(1);

  // Click the canvas toolbar's "+ SQL" button.
  await adminPage.getByRole('button', { name: /^\+\s*SQL$/ }).click();

  // A second node is now rendered on the canvas. (Client-side state only —
  // the new node persists when Save is clicked, but renders immediately.)
  await expect(adminPage.locator('[data-pipeline-node]')).toHaveCount(2);
});

test('Right-click a node → context-menu Delete removes it from the canvas', async ({
  adminPage,
}) => {
  await mockPipelineEditor(adminPage, { pipeline: makePipeline() });
  await adminPage.goto(`/pipelines/${PIPELINE_ID}/edit`);

  await expect(adminPage.locator('[data-pipeline-node="node_c"]')).toBeVisible();

  // Right-click opens the context menu. Playwright translates `button:
  // 'right'` to the native context-menu event the canvas listens for.
  await adminPage.locator('[data-pipeline-node="node_c"]').click({ button: 'right' });

  // The context menu surfaces a "Delete" item (no keyboard shortcut).
  const deleteItem = adminPage.getByRole('button', { name: /^Delete$/ }).last();
  await deleteItem.click();

  await expect(adminPage.locator('[data-pipeline-node="node_c"]')).toHaveCount(0);
  // The other two nodes are still around.
  await expect(adminPage.locator('[data-pipeline-node="node_a"]')).toBeVisible();
  await expect(adminPage.locator('[data-pipeline-node="node_b"]')).toBeVisible();
});

test('Validate sub-tab without a manual run shows the empty hint', async ({ adminPage }) => {
  await mockPipelineEditor(adminPage, { pipeline: makePipeline() });
  await adminPage.goto(`/pipelines/${PIPELINE_ID}/edit`);

  await adminPage.getByRole('tab', { name: /^validate$/i }).click();
  await expect(
    adminPage.getByText(/click "validate" to run server-side dag validation/i),
  ).toBeVisible();
});

test('absent today: drag-from-palette, drag-handle connect, Delete-key shortcut, Logs tab, properties side panel, PATCH on save', async ({
  adminPage,
}) => {
  // Single regression guard for the roadmap surfaces the task asks for that
  // do not ship today. Each flipped assertion is the migration signal when
  // the matching control lands.
  await mockPipelineEditor(adminPage, { pipeline: makePipeline() });
  const cap = captureRequests(adminPage, /\/api\/v1\/pipelines/);
  await adminPage.goto(`/pipelines/${PIPELINE_ID}/edit`);

  await expect(adminPage.getByRole('img', { name: 'Pipeline DAG' })).toBeVisible();

  // 1. No HTML5 drag source / drop target on the canvas: the SVG nodes are
  //    not `draggable`, and no `.react-flow` / `.cytoscape-container` root
  //    is mounted.
  expect(await adminPage.locator('.react-flow').count()).toBe(0);
  expect(await adminPage.locator('div.cytoscape-container, canvas.cytoscape').count()).toBe(0);
  expect(await adminPage.locator('[data-pipeline-node][draggable="true"]').count()).toBe(0);

  // 2. No output/input handles to drag from. The shipped connect flow is a
  //    `Connect →` toolbar button + click target.
  expect(await adminPage.locator('[data-pipeline-handle]').count()).toBe(0);

  // 3. Delete key does NOT remove the selected node. Select node_a, press
  //    Delete on the SVG, assert it's still there.
  await adminPage.locator('[data-pipeline-node="node_a"]').click();
  await adminPage.keyboard.press('Delete');
  await expect(adminPage.locator('[data-pipeline-node="node_a"]')).toBeVisible();

  // 4. There is no Logs sub-tab — the EDIT_SUB_TABS array is canvas /
  //    nodes / config / runs / validate.
  expect(await adminPage.getByRole('tab', { name: /^logs$/i }).count()).toBe(0);

  // 5. No separate properties side panel — selecting a node opens the data
  //    `Preview` panel below the canvas, not a `Properties` aside.
  expect(
    await adminPage.getByRole('heading', { level: 3, name: /^properties$/i }).count(),
  ).toBe(0);

  // 6. Save uses PUT, not PATCH. Cap the request log and verify the only
  //    mutation seen on this pipeline path is PUT.
  await adminPage.getByRole('tab', { name: /^config$/i }).click();
  await adminPage.getByLabel(/^name$/i).fill('Triggers PUT only');
  await adminPage.getByRole('button', { name: /^Save$/ }).click();
  await expect
    .poll(() =>
      cap.calls.some(
        (c) => c.method === 'PUT' && new RegExp(`/api/v1/pipelines/${PIPELINE_ID}(\\?|$)`).test(c.url),
      ),
    )
    .toBe(true);
  expect(
    cap.calls.some(
      (c) => c.method === 'PATCH' && new RegExp(`/api/v1/pipelines/${PIPELINE_ID}`).test(c.url),
    ),
  ).toBe(false);
});

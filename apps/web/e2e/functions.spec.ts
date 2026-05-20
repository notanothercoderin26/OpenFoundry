import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/compute-modules`
 * (apps/web/src/routes/functions/FunctionsPage.tsx — the route `/functions`
 * redirects here).
 *
 * Reality check before the assertions:
 *
 *   - The shipped page edits a single "function package" at a time. It has
 *     a left-hand list of packages, a right-hand editor (display name,
 *     description, source, capabilities JSON), an invocation panel
 *     (validate / simulate), and a "recent runs" panel.
 *   - "Test function" maps to the Validate + Simulate buttons on the
 *     invocation panel — both fire POSTs and render the response as a
 *     pretty-printed JSON `<pre>`.
 *   - "Versioning" is read-only after create: the version is shown in
 *     the list row as `<name> - v<version>` and is editable from the
 *     create modal but not from the detail editor.
 *   - The shipped UI does NOT have explicit Deploy / Undeploy controls
 *     (the package lifecycle is Save / Delete + Simulate; production
 *     deploys live elsewhere). That gap is pinned by the regression
 *     guard at the bottom of this file.
 *   - The code editor is a plain `<textarea>`, not Monaco — Monaco is
 *     used for other surfaces (notebooks, code repos). When the editor
 *     migrates, the create-flow assertions need to switch to the Monaco
 *     locator.
 *   - Delete is a native `window.confirm("Delete this function
 *     package?")` — handled here with `page.on('dialog')`.
 *
 * Endpoints exercised:
 *   - GET   /api/v1/ontology/functions/authoring-surface
 *   - GET   /api/v1/ontology/types?per_page=200          (object-type dropdown)
 *   - GET   /api/v1/ontology/functions?per_page=200
 *   - POST  /api/v1/ontology/functions                   (create)
 *   - PATCH /api/v1/ontology/functions/{id}              (save edits)
 *   - DELETE /api/v1/ontology/functions/{id}             (remove)
 *   - GET   /api/v1/ontology/functions/{id}/runs?per_page=50&status=
 *   - GET   /api/v1/ontology/functions/{id}/metrics
 *   - POST  /api/v1/ontology/functions/{id}/validate
 *   - POST  /api/v1/ontology/functions/{id}/simulate
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
    ],
  },
});

const E2E_NOW = '2026-05-11T00:00:00Z';

const FUNCTIONS_LIST_OR_CREATE = /\/api\/v1\/ontology\/functions(\?|$)/;
const FUNCTION_DETAIL = /\/api\/v1\/ontology\/functions\/[^/]+(\?|$)/;
const FUNCTION_RUNS = /\/api\/v1\/ontology\/functions\/[^/]+\/runs(\?|$)/;
const FUNCTION_METRICS = /\/api\/v1\/ontology\/functions\/[^/]+\/metrics(\?|$)/;
const FUNCTION_VALIDATE = /\/api\/v1\/ontology\/functions\/[^/]+\/validate(\?|$)/;
const FUNCTION_SIMULATE = /\/api\/v1\/ontology\/functions\/[^/]+\/simulate(\?|$)/;
const AUTHORING_SURFACE = /\/api\/v1\/ontology\/functions\/authoring-surface(\?|$)/;
const OBJECT_TYPES_LIST = /\/api\/v1\/ontology\/types(\?|$)/;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface CapabilitiesFixture {
  allow_ontology_read: boolean;
  allow_ontology_write: boolean;
  allow_ai: boolean;
  allow_network: boolean;
  timeout_seconds: number;
  max_source_bytes: number;
}

interface FunctionFixture {
  id: string;
  name: string;
  version: string;
  display_name: string;
  description: string;
  runtime: string;
  source: string;
  entrypoint: string;
  capabilities: CapabilitiesFixture;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

function makeFunction(overrides: Partial<FunctionFixture> = {}): FunctionFixture {
  return {
    id: 'fn-1',
    name: 'compute_score',
    version: '0.1.0',
    display_name: 'Compute score',
    description: 'Deterministic E2E function',
    runtime: 'python',
    source: 'def handler(context):\n    return {"output": {}}\n',
    entrypoint: 'handler',
    capabilities: {
      allow_ontology_read: true,
      allow_ontology_write: false,
      allow_ai: false,
      allow_network: false,
      timeout_seconds: 15,
      max_source_bytes: 65536,
    },
    owner_id: 'user-1',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

interface RunFixture {
  id: string;
  function_package_id: string;
  function_package_name: string;
  function_package_version: string;
  runtime: string;
  status: 'success' | 'failure';
  invocation_kind: 'simulation' | 'action';
  action_id: string | null;
  action_name: string | null;
  object_type_id: string | null;
  target_object_id: string | null;
  actor_id: string;
  duration_ms: number;
  error_message: string | null;
  started_at: string;
  completed_at: string;
}

function makeRun(overrides: Partial<RunFixture> = {}): RunFixture {
  return {
    id: 'run-1',
    function_package_id: 'fn-1',
    function_package_name: 'compute_score',
    function_package_version: '0.1.0',
    runtime: 'python',
    status: 'success',
    invocation_kind: 'simulation',
    action_id: null,
    action_name: null,
    object_type_id: 'object-type-1',
    target_object_id: null,
    actor_id: 'user-1',
    duration_ms: 142,
    error_message: null,
    started_at: E2E_NOW,
    completed_at: E2E_NOW,
    ...overrides,
  };
}

const COMPUTE_SCORE = makeFunction();
const TRANSFORM_DATA = makeFunction({
  id: 'fn-2',
  name: 'transform_data',
  display_name: 'Transform data',
  description: 'TypeScript transform',
  runtime: 'typescript',
  version: '2.3.4',
  source: 'export default async function handler(ctx) { return { output: {} }; }\n',
});

const RUN_SUCCESS = makeRun({ id: 'run-1', status: 'success', duration_ms: 142 });
const RUN_FAILURE = makeRun({
  id: 'run-2',
  status: 'failure',
  duration_ms: 510,
  error_message: 'TypeError: boom',
  invocation_kind: 'action',
  action_id: 'action-1',
  action_name: 'edit_aircraft',
});

// ---------------------------------------------------------------------------
// Stateful mock — supports list / detail / runs / metrics / validate /
// simulate / create / update / delete. Sub-paths must be routed BEFORE the
// generic `/functions/:id` regex (Playwright dispatches handlers
// most-recent-first, so we register sub-paths last).
// ---------------------------------------------------------------------------

interface FunctionsMockState {
  packages: FunctionFixture[];
  runs: RunFixture[];
}

async function mockFunctions(
  page: Page,
  initial: { packages?: FunctionFixture[]; runs?: RunFixture[] } = {},
): Promise<FunctionsMockState> {
  const state: FunctionsMockState = {
    packages: (initial.packages ?? [COMPUTE_SCORE]).slice(),
    runs: (initial.runs ?? []).slice(),
  };

  // Authoring surface — empty templates so the modal's "Template" select is
  // hidden and the form defaults stay deterministic (`python` / `handler` /
  // python starter source).
  await page.route(AUTHORING_SURFACE, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { templates: [], sdk_packages: [], cli_commands: [] },
    });
  });

  // Object types — the invocation panel's "Object type" dropdown reads this.
  await page.route(OBJECT_TYPES_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        data: [
          {
            id: 'object-type-1',
            name: 'aircraft',
            display_name: 'Aircraft',
            plural: 'Aircraft',
            description: '',
            icon: '',
            color: '#0f766e',
            primary_key: 'id',
            properties: [],
            created_at: E2E_NOW,
            updated_at: E2E_NOW,
          },
        ],
        total: 1,
        page: 1,
        per_page: 200,
      },
    });
  });

  // GET list + POST create (both target `/functions`).
  await page.route(FUNCTIONS_LIST_OR_CREATE, async (route: Route) => {
    const method = route.request().method();
    const url = route.request().url();
    if (url.includes('/authoring-surface')) return route.fallback();

    if (method === 'GET') {
      await route.fulfill({
        json: {
          data: state.packages,
          total: state.packages.length,
          page: 1,
          per_page: 200,
        },
      });
      return;
    }
    if (method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as Partial<FunctionFixture>;
      const created: FunctionFixture = makeFunction({
        id: `fn-new-${state.packages.length + 1}`,
        name: body.name ?? 'new_function',
        version: body.version ?? '0.1.0',
        display_name: body.display_name ?? body.name ?? 'New function',
        description: body.description ?? '',
        runtime: body.runtime ?? 'python',
        source: body.source ?? '',
        entrypoint: body.entrypoint ?? 'handler',
      });
      state.packages.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    return route.fallback();
  });

  // Sub-paths first (they're matched BEFORE the generic detail regex below
  // because we register them later — Playwright dispatches handlers in
  // most-recent-first order).

  // Runs — supports `?status=` filter.
  await page.route(FUNCTION_RUNS, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const status = url.searchParams.get('status');
    const kind = url.searchParams.get('invocation_kind');
    let filtered = state.runs;
    if (status) filtered = filtered.filter((run) => run.status === status);
    if (kind) filtered = filtered.filter((run) => run.invocation_kind === kind);
    await route.fulfill({
      json: { data: filtered, total: filtered.length, page: 1, per_page: 50 },
    });
  });

  // Metrics.
  await page.route(FUNCTION_METRICS, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = route.request().url();
    const match = /\/functions\/([^/?#]+)\/metrics(?:\?|$)/.exec(url);
    const id = match?.[1] ?? '';
    const pkg = state.packages.find((entry) => entry.id === id) ?? state.packages[0] ?? COMPUTE_SCORE;
    const successCount = state.runs.filter((run) => run.status === 'success').length;
    const failureCount = state.runs.filter((run) => run.status === 'failure').length;
    const total = state.runs.length;
    await route.fulfill({
      json: {
        package: {
          id: pkg.id,
          name: pkg.name,
          version: pkg.version,
          display_name: pkg.display_name,
          runtime: pkg.runtime,
          entrypoint: pkg.entrypoint,
          capabilities: pkg.capabilities,
        },
        total_runs: total,
        successful_runs: successCount,
        failed_runs: failureCount,
        simulation_runs: state.runs.filter((r) => r.invocation_kind === 'simulation').length,
        action_runs: state.runs.filter((r) => r.invocation_kind === 'action').length,
        success_rate: total ? successCount / total : 0,
        avg_duration_ms: total ? 142 : null,
        p95_duration_ms: total ? 142 : null,
        max_duration_ms: total ? 510 : null,
        last_run_at: state.runs[0]?.started_at ?? null,
        last_success_at: state.runs.find((r) => r.status === 'success')?.completed_at ?? null,
        last_failure_at: state.runs.find((r) => r.status === 'failure')?.completed_at ?? null,
      },
    });
  });

  // Validate.
  await page.route(FUNCTION_VALIDATE, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const url = route.request().url();
    const match = /\/functions\/([^/?#]+)\/validate(?:\?|$)/.exec(url);
    const id = match?.[1] ?? '';
    const pkg = state.packages.find((entry) => entry.id === id) ?? state.packages[0] ?? COMPUTE_SCORE;
    await route.fulfill({
      json: {
        valid: true,
        package: {
          id: pkg.id,
          name: pkg.name,
          version: pkg.version,
          display_name: pkg.display_name,
          runtime: pkg.runtime,
          entrypoint: pkg.entrypoint,
          capabilities: pkg.capabilities,
        },
        preview: { source_bytes: pkg.source.length },
        errors: [],
      },
    });
  });

  // Simulate.
  await page.route(FUNCTION_SIMULATE, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const url = route.request().url();
    const match = /\/functions\/([^/?#]+)\/simulate(?:\?|$)/.exec(url);
    const id = match?.[1] ?? '';
    const pkg = state.packages.find((entry) => entry.id === id) ?? state.packages[0] ?? COMPUTE_SCORE;
    const body = (route.request().postDataJSON() ?? {}) as { parameters?: Record<string, unknown> };
    state.runs = [
      makeRun({
        id: `run-${state.runs.length + 1}`,
        function_package_id: pkg.id,
        function_package_name: pkg.name,
        function_package_version: pkg.version,
        runtime: pkg.runtime,
        status: 'success',
      }),
      ...state.runs,
    ];
    await route.fulfill({
      json: {
        package: {
          id: pkg.id,
          name: pkg.name,
          version: pkg.version,
          display_name: pkg.display_name,
          runtime: pkg.runtime,
          entrypoint: pkg.entrypoint,
          capabilities: pkg.capabilities,
        },
        preview: { source_bytes: pkg.source.length },
        result: { output: { echoed_parameters: body.parameters ?? {} } },
      },
    });
  });

  // Detail: PATCH (save) + DELETE (remove). Skip routes that match the
  // sub-paths above — Playwright tries the most-recent handler first, but a
  // belt-and-braces guard keeps things robust if we add more sub-paths
  // later.
  await page.route(FUNCTION_DETAIL, async (route: Route) => {
    const method = route.request().method();
    const url = route.request().url();
    if (/\/(runs|metrics|validate|simulate|authoring-surface)(\?|$)/.test(url)) {
      return route.fallback();
    }
    const match = /\/functions\/([^/?#]+)(?:\?|$)/.exec(url);
    const id = match?.[1] ?? '';

    if (method === 'PATCH') {
      const body = (route.request().postDataJSON() ?? {}) as Partial<FunctionFixture>;
      const idx = state.packages.findIndex((entry) => entry.id === id);
      if (idx >= 0) {
        state.packages[idx] = { ...state.packages[idx], ...body, updated_at: E2E_NOW };
        await route.fulfill({ json: state.packages[idx] });
      } else {
        await route.fulfill({ status: 404, json: { error: 'not found' } });
      }
      return;
    }
    if (method === 'DELETE') {
      state.packages = state.packages.filter((entry) => entry.id !== id);
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    return route.fallback();
  });

  return state;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renders the heading and lists function packages with their runtime + version', async ({
  adminPage,
}) => {
  await mockFunctions(adminPage, { packages: [COMPUTE_SCORE, TRANSFORM_DATA] });
  await adminPage.goto('/compute-modules');

  // h1 heading and the ONT-016 eyebrow text identify the page.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^functions$/i }),
  ).toBeVisible();
  await expect(adminPage.getByText('ONT-016').first()).toBeVisible();

  // Both rows render their display name + the "name - vX.Y.Z" hint.
  const list = adminPage.getByRole('table').first();
  await expect(list.getByText('Compute score')).toBeVisible();
  await expect(list.getByText('Transform data')).toBeVisible();
  await expect(list.getByText('compute_score - v0.1.0')).toBeVisible();
  await expect(list.getByText('transform_data - v2.3.4')).toBeVisible();

  // Runtime chips show each package's runtime.
  await expect(list.getByText('python', { exact: true }).first()).toBeVisible();
  await expect(list.getByText('typescript', { exact: true }).first()).toBeVisible();
});

test('creates a function: opens the modal, POSTs name + runtime + source + version', async ({
  adminPage,
}) => {
  await mockFunctions(adminPage, { packages: [COMPUTE_SCORE] });
  const create = captureRequests(adminPage, FUNCTIONS_LIST_OR_CREATE);
  await adminPage.goto('/compute-modules');

  // Wait for the list to render so the initial GET doesn't race with our
  // POST capture. The display name appears as a row `<strong>` AND as the
  // auto-selected package's `<h2>` heading, so scope by role.
  await expect(adminPage.getByRole('heading', { level: 2, name: /compute score/i })).toBeVisible();

  await adminPage.getByRole('button', { name: /^function$/i }).click();

  const dialog = adminPage.getByRole('dialog', { name: /new function/i });
  await expect(dialog).toBeVisible();

  // Override the prefilled name + version + source, switch the runtime to
  // typescript (the create modal exposes python / typescript / javascript by
  // default — see FALLBACK_RUNTIMES). The source textarea retains the
  // python starter because setRuntime() only fills it when blank, which is
  // fine: we only care that the body carries our explicit value. We use
  // `getByRole` rather than `getByLabel` because the form controls live
  // inside a `<label>` via an intermediate `<span>` — implicit label
  // association is flaky for `<textarea>` / `<select>` in Playwright.
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('custom_func');
  await dialog.getByRole('textbox', { name: 'Version', exact: true }).fill('1.2.3');
  await dialog.getByRole('textbox', { name: 'Display name', exact: true }).fill('Custom function');
  await dialog.getByRole('combobox', { name: 'Runtime', exact: true }).selectOption('typescript');
  await dialog.getByRole('textbox', { name: 'Source', exact: true }).fill('export default async function handler() { return { output: {} }; }');

  await dialog.getByRole('button', { name: /create function/i }).click();

  // Modal closes after a successful POST.
  await expect(dialog).toBeHidden();

  // Find the actual POST among the captured calls (GETs share the URL).
  await expect.poll(() => create.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(1);
  const post = create.calls.find((c) => c.method === 'POST');
  expect(post).toBeTruthy();
  expect(post!.body).toMatchObject({
    name: 'custom_func',
    version: '1.2.3',
    display_name: 'Custom function',
    runtime: 'typescript',
    // setRuntime() updates the entrypoint to defaultEntrypoint(runtime):
    // 'handler' for python, 'default' for everything else.
    entrypoint: 'default',
  });
  expect(typeof (post!.body as { source: string }).source).toBe('string');
  expect((post!.body as { source: string }).source.length).toBeGreaterThan(0);

  // Capabilities are sent along (they're set via the modal's capability
  // toggles; the defaults match DEFAULT_CAPABILITIES).
  const capabilities = (post!.body as { capabilities: CapabilitiesFixture }).capabilities;
  expect(capabilities).toMatchObject({
    allow_ontology_read: true,
    timeout_seconds: 15,
    max_source_bytes: 65536,
  });
});

test('test function: simulate POSTs the parameters JSON and renders the mock response', async ({
  adminPage,
}) => {
  await mockFunctions(adminPage, { packages: [COMPUTE_SCORE] });
  const simulate = captureRequests(adminPage, FUNCTION_SIMULATE);
  await adminPage.goto('/compute-modules');

  // The first package auto-selects on load (FunctionsPage.refreshPackages),
  // so the detail + invocation panels appear immediately.
  await expect(adminPage.getByRole('heading', { level: 2, name: /compute score/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^simulate$/i })).toBeEnabled();

  // The Parameters JSON editor is a JsonEditor — `getByLabel` doesn't bind
  // (the inner <label> isn't associated to the textarea), so walk up from
  // the visible "Parameters JSON" caption to the surrounding card.
  const paramsBlock = adminPage
    .getByText('Parameters JSON', { exact: true })
    .locator('xpath=ancestor::div[1]/..');
  await paramsBlock.getByRole('textbox').fill('{"score":42,"label":"e2e"}');

  await adminPage.getByRole('button', { name: /^simulate$/i }).click();

  await expect.poll(() => simulate.count()).toBeGreaterThanOrEqual(1);
  const body = simulate.last()?.body as {
    object_type_id?: string;
    parameters?: Record<string, unknown>;
  };
  expect(body.object_type_id).toBe('object-type-1');
  expect(body.parameters).toEqual({ score: 42, label: 'e2e' });

  // Simulation result panel becomes visible with the JSON body echoed back.
  // Scope to the result `<pre>` because the params we just typed also appear
  // in the JsonEditor textarea above the result.
  await expect(adminPage.getByText(/Simulation result/i)).toBeVisible();
  const resultPre = adminPage.locator('pre').filter({ hasText: /echoed_parameters/i });
  await expect(resultPre).toBeVisible();
  await expect(resultPre).toContainText(/"score":\s*42/);
});

test('versioning: the version is displayed in the list and is configurable in the create modal', async ({
  adminPage,
}) => {
  // Two packages with different versions exercise the per-row version
  // rendering; the modal version input pins the editable-on-create
  // contract.
  await mockFunctions(adminPage, { packages: [COMPUTE_SCORE, TRANSFORM_DATA] });
  await adminPage.goto('/compute-modules');

  // List rows show "<name> - v<version>" — use `exact: true` so the row
  // `<div>` is the only match (the detail subheader appends " - <runtime>").
  await expect(adminPage.getByText('compute_score - v0.1.0', { exact: true })).toBeVisible();
  await expect(adminPage.getByText('transform_data - v2.3.4', { exact: true })).toBeVisible();

  // The selected-package subheader echoes the same "name - v<version> - <runtime>"
  // contract for the auto-selected first package.
  await expect(
    adminPage.getByText(/compute_score - v0\.1\.0 - python/i),
  ).toBeVisible();

  // Open the create modal and confirm the version input is present and
  // pre-filled with the default `0.1.0` from draftFromTemplate(undefined).
  await adminPage.getByRole('button', { name: /^function$/i }).click();
  const dialog = adminPage.getByRole('dialog', { name: /new function/i });
  const version = dialog.getByRole('textbox', { name: 'Version', exact: true });
  await expect(version).toBeVisible();
  await expect(version).toHaveValue('0.1.0');

  // The version input is editable.
  await version.fill('9.9.9');
  await expect(version).toHaveValue('9.9.9');
});

test('logs of executions: the Recent runs panel shows status, kind, and duration', async ({
  adminPage,
}) => {
  await mockFunctions(adminPage, {
    packages: [COMPUTE_SCORE],
    runs: [RUN_SUCCESS, RUN_FAILURE],
  });
  await adminPage.goto('/compute-modules');

  // The Recent runs panel header is unique on the page.
  await expect(adminPage.getByText(/Recent runs/i)).toBeVisible();
  await expect(adminPage.getByText('2 loaded')).toBeVisible();

  // Both run rows are rendered in the runs table. Use the second table on
  // the page (the first is the packages list).
  const runsTable = adminPage.getByRole('table').nth(1);
  await expect(runsTable.getByRole('cell', { name: 'success' })).toBeVisible();
  await expect(runsTable.getByRole('cell', { name: 'failure' })).toBeVisible();
  await expect(runsTable.getByRole('cell', { name: 'simulation' })).toBeVisible();
  await expect(runsTable.getByRole('cell', { name: 'action' })).toBeVisible();

  // The duration is rendered through formatDuration (`<1000` → `Nms`).
  await expect(runsTable.getByRole('cell', { name: '142ms' })).toBeVisible();
  await expect(runsTable.getByRole('cell', { name: 'TypeError: boom' })).toBeVisible();
});

test('logs filter: switching the run-status filter refetches with status=failure', async ({
  adminPage,
}) => {
  await mockFunctions(adminPage, {
    packages: [COMPUTE_SCORE],
    runs: [RUN_SUCCESS, RUN_FAILURE],
  });
  const runsCap = captureRequests(adminPage, FUNCTION_RUNS);
  await adminPage.goto('/compute-modules');

  await expect(adminPage.getByText('2 loaded')).toBeVisible();

  // The status filter is the first <select> inside the Recent runs panel
  // header. Use its option-set ("All statuses" / "Success" / "Failure") to
  // disambiguate from the kind filter.
  const statusFilter = adminPage.getByRole('combobox').filter({ hasText: /all statuses/i });
  await statusFilter.selectOption('failure');

  await expect.poll(() => runsCap.calls.filter((c) => c.url.includes('status=failure')).length).toBeGreaterThanOrEqual(1);

  // Only the failure row remains.
  await expect(adminPage.getByText('1 loaded')).toBeVisible();
  const runsTable = adminPage.getByRole('table').nth(1);
  await expect(runsTable.getByRole('cell', { name: 'failure' })).toBeVisible();
  await expect(runsTable.getByRole('cell', { name: 'success' })).toHaveCount(0);
});

test('save edits: PATCH the selected package with the edited display name + description', async ({
  adminPage,
}) => {
  await mockFunctions(adminPage, { packages: [COMPUTE_SCORE] });
  const patches = captureRequests(adminPage, FUNCTION_DETAIL);
  await adminPage.goto('/compute-modules');

  await expect(adminPage.getByRole('heading', { level: 2, name: /compute score/i })).toBeVisible();

  // The detail editor exposes a Display name input + Description textarea.
  // Use the role+name pattern — `getByLabel` is flaky for the textarea
  // because the `<label>` wraps the textarea via an intermediate `<span>`
  // and the accessible name only resolves through the role lookup.
  await adminPage.getByRole('textbox', { name: 'Display name', exact: true }).fill('Compute score v2');
  await adminPage.getByRole('textbox', { name: 'Description', exact: true }).fill('Updated by E2E');

  await adminPage.getByRole('button', { name: /save package/i }).click();

  await expect.poll(() => patches.calls.filter((c) => c.method === 'PATCH').length).toBeGreaterThanOrEqual(1);
  const patch = patches.calls.find((c) => c.method === 'PATCH');
  expect(patch?.url).toMatch(/\/functions\/fn-1$/);
  expect(patch?.body).toMatchObject({
    display_name: 'Compute score v2',
    description: 'Updated by E2E',
  });

  // The page shows a success toast after the PATCH resolves.
  await expect(adminPage.getByText(/function package updated/i)).toBeVisible();
});

test('delete: accepts the native confirm and DELETEs the selected package', async ({
  adminPage,
}) => {
  await mockFunctions(adminPage, { packages: [COMPUTE_SCORE, TRANSFORM_DATA] });
  const deletes = captureRequests(adminPage, FUNCTION_DETAIL);
  await adminPage.goto('/compute-modules');

  // First package auto-selects; the Delete button targets it.
  await expect(adminPage.getByRole('heading', { level: 2, name: /compute score/i })).toBeVisible();

  // The page calls window.confirm; pre-register an accept handler.
  adminPage.once('dialog', (dialog) => {
    expect(dialog.message()).toMatch(/delete this function package/i);
    void dialog.accept();
  });

  await adminPage.getByRole('button', { name: /^delete$/i }).click();

  await expect.poll(() => deletes.calls.filter((c) => c.method === 'DELETE').length).toBeGreaterThanOrEqual(1);
  const del = deletes.calls.find((c) => c.method === 'DELETE');
  expect(del?.url).toMatch(/\/functions\/fn-1$/);

  // The row disappears (stateful mock + refreshPackages on success). Use
  // `exact: true` — after refreshPackages auto-selects fn-2, the selected-
  // package subheader text "transform_data - v2.3.4 - typescript" would
  // otherwise also match.
  await expect(adminPage.getByText('compute_score - v0.1.0', { exact: true })).toHaveCount(0);
  await expect(adminPage.getByText('transform_data - v2.3.4', { exact: true })).toBeVisible();

  // And the success toast confirms the deletion.
  await expect(adminPage.getByText(/function package deleted/i)).toBeVisible();
});

test('deploy / undeploy: pins absence — the shipped page has no Deploy lifecycle controls', async ({
  adminPage,
}) => {
  // FunctionsPage exposes Save / Delete / Validate / Simulate but NO
  // explicit Deploy or Undeploy buttons — package "publication" is handled
  // elsewhere. This regression guard flips the day a Deploy button lands so
  // we know to write a real assertion.
  await mockFunctions(adminPage, { packages: [COMPUTE_SCORE] });
  await adminPage.goto('/compute-modules');

  await expect(adminPage.getByRole('heading', { level: 2, name: /compute score/i })).toBeVisible();

  expect(await adminPage.getByRole('button', { name: /^deploy$/i }).count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^undeploy$/i }).count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^publish$/i }).count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^unpublish$/i }).count()).toBe(0);

  // The shipped lifecycle controls remain in place — sanity-check that the
  // pin isn't masking a deeper regression.
  await expect(adminPage.getByRole('button', { name: /save package/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^validate$/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^simulate$/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^delete$/i })).toBeVisible();
});

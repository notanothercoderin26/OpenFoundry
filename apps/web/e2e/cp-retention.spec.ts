import { type Page, type Route } from '@playwright/test';
import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for the global admin `/control-panel/retention-policies`
 * (apps/web/src/routes/control-panel/RetentionPoliciesPage.tsx).
 *
 * This is the **global / organization-scope** retention admin (the
 * per-dataset/per-project surface is covered elsewhere). The page
 * composes:
 *
 *   - 4 metric cells: Policies / Recommended / Custom / Legacy.
 *   - "New Policy" form: Name, Policy type (custom / legacy YAML-
 *     style), Space ID, Target (transactions / datasets), Retention
 *     days, Dataset selector (all / dataset_rids / folder_rids /
 *     derived / trash) + Dataset/folder RID, Transaction selector
 *     (older_than / transaction_count / view_count / only_branch /
 *     not_branch / aborted) + conditional Branch / Count / Age days
 *     inputs, Legacy YAML textarea (when policy_type=legacy), and
 *     three destructive-acknowledgement checkboxes
 *     (allow_latest_view_deletion, abort_open_transactions, a
 *     "danger ack" gate that has to be checked before either
 *     destructive flag can submit).
 *   - "SG.37 execution" panel: Dataset RID + As-of days + Dry-run +
 *     "Run retention execution" button (POSTs /retention/executions)
 *     + the per-execution table.
 *   - Policies table at the bottom (Name / Type / Scope / Selectors
 *     / Retention / Warnings).
 *
 * The spec pins the real behaviour and adds regression guards for
 * the typical retention controls that are NOT shipped here today —
 * per-row Edit/Delete, legal-hold toggle, scope filter, per-project
 * binding UI, audit-log surface.
 *
 * Endpoints (mirrors `src/lib/api/datasets.ts`):
 *   - GET  /api/v1/retention/policies      → RetentionPolicy[]
 *   - GET  /api/v1/retention/executions    → RetentionExecutionRun[]
 *   - POST /api/v1/retention/policies      → RetentionPolicy
 *   - POST /api/v1/retention/executions    → RetentionExecutionRun
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /^console\.error: %o$/,
    ],
  },
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const E2E_NOW = '2026-05-11T00:00:00Z';

interface RetentionPolicy {
  id: string;
  name: string;
  org_id?: string | null;
  scope: string;
  target_kind: 'dataset' | 'transaction' | string;
  retention_days: number;
  legal_hold: boolean;
  purge_mode: string;
  rules: string[];
  is_system: boolean;
  selector: Record<string, unknown>;
  criteria: Record<string, unknown>;
  grace_period_minutes: number;
  policy_type?: 'recommended' | 'custom' | 'legacy' | string;
  space_id?: string | null;
  legacy_deprecation_status?: string;
  legacy_config_yaml?: string;
  dataset_selectors?: { mode: string; kind: string }[];
  transaction_selectors?: { kind: string }[];
  allow_latest_view_deletion?: boolean;
  abort_open_transactions?: boolean;
  danger_acknowledgement?: string;
  warnings?: { code: string; severity: 'info' | 'warning' | 'critical' | string; message: string }[];
  last_applied_at?: string | null;
  next_run_at?: string | null;
  created_at: string;
  updated_at: string;
  active: boolean;
}

interface RetentionExecutionRun {
  id: string;
  org_id?: string | null;
  dataset_rid: string;
  status: string;
  dry_run: boolean;
  marked_transaction_count: number;
  swept_transaction_count: number;
  delete_transaction_count: number;
  recovery_window_days: number;
  remediation_deadline?: string | null;
  irreversible_after?: string | null;
  warnings: string[];
  items: unknown[];
  created_by: string;
  created_at: string;
  completed_at?: string | null;
}

function makePolicy(overrides: Partial<RetentionPolicy> = {}): RetentionPolicy {
  return {
    id: 'pol-1',
    name: 'Default retention',
    org_id: 'org-1',
    scope: 'organization',
    target_kind: 'transaction',
    retention_days: 90,
    legal_hold: false,
    purge_mode: 'soft',
    rules: [],
    is_system: false,
    selector: { all_datasets: true },
    criteria: {},
    grace_period_minutes: 60,
    policy_type: 'custom',
    space_id: null,
    dataset_selectors: [{ mode: 'select', kind: 'all' }],
    transaction_selectors: [{ kind: 'older_than' }],
    allow_latest_view_deletion: false,
    abort_open_transactions: false,
    danger_acknowledgement: '',
    warnings: [],
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    active: true,
    ...overrides,
  };
}

const POLICY_RECOMMENDED = makePolicy({
  id: 'pol-rec-1',
  name: 'Recommended defaults',
  policy_type: 'recommended',
  is_system: true,
});
const POLICY_CUSTOM = makePolicy({
  id: 'pol-custom-1',
  name: 'Custom 30-day transactions',
  policy_type: 'custom',
  retention_days: 30,
  warnings: [
    { code: 'aggressive_retention', severity: 'warning', message: '30 days is tight.' },
  ],
});
const POLICY_LEGACY = makePolicy({
  id: 'pol-legacy-1',
  name: 'Legacy YAML carry-over',
  policy_type: 'legacy',
  legacy_deprecation_status: 'deprecated',
  warnings: [
    { code: 'legacy_yaml', severity: 'critical', message: 'Migrate off YAML.' },
  ],
});

const EXEC_RUN: RetentionExecutionRun = {
  id: 'run-1',
  org_id: 'org-1',
  dataset_rid: 'ri.datasets.main.alpha',
  status: 'completed',
  dry_run: true,
  marked_transaction_count: 7,
  swept_transaction_count: 0,
  delete_transaction_count: 0,
  recovery_window_days: 7,
  remediation_deadline: '2026-05-18T00:00:00Z',
  irreversible_after: '2026-05-25T00:00:00Z',
  warnings: [],
  items: [],
  created_by: 'admin-user',
  created_at: E2E_NOW,
  completed_at: E2E_NOW,
};

// Endpoint patterns
const POLICIES_LIST = /\/api\/v1\/retention\/policies(?:\?|$)/;
const EXECUTIONS_LIST = /\/api\/v1\/retention\/executions$/;

interface MocksOpts {
  policies?: RetentionPolicy[];
  executions?: RetentionExecutionRun[];
}

async function mockRetention(page: Page, opts: MocksOpts = {}) {
  const policies = opts.policies ?? [];
  const executions = opts.executions ?? [];

  await page.route(POLICIES_LIST, async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: policies });
      return;
    }
    await route.fallback();
  });

  await page.route(EXECUTIONS_LIST, async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: executions });
      return;
    }
    await route.fallback();
  });

  return {
    policiesCap: captureRequests(page, POLICIES_LIST),
    executionsCap: captureRequests(page, EXECUTIONS_LIST),
  };
}

async function waitForPost(
  cap: ReturnType<typeof captureRequests>,
): Promise<{ method: string; body: unknown }> {
  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);
  const posts = cap.calls.filter((c) => c.method === 'POST');
  return posts[posts.length - 1];
}

// ---------------------------------------------------------------------------
// Case — list policies + executions + metric cells
// ---------------------------------------------------------------------------

test('renders metric cells + policies table + executions table from the mocked payload', async ({
  adminPage,
}) => {
  await mockRetention(adminPage, {
    policies: [POLICY_RECOMMENDED, POLICY_CUSTOM, POLICY_LEGACY],
    executions: [EXEC_RUN],
  });
  await adminPage.goto('/control-panel/retention-policies');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^retention policies$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /back to control panel/i }),
  ).toHaveAttribute('href', /\/control-panel$/);

  // Metric strip: Policies=3, Recommended=1, Custom=1, Legacy=1.
  // The Metric component wraps each cell in `.of-panel-muted`; scope
  // by that class so the assertion doesn't collide with the same
  // words appearing inside the policies table below.
  const metricCells = adminPage.locator('.of-panel-muted');
  await expect(metricCells.filter({ hasText: 'Policies' })).toContainText('3');
  await expect(metricCells.filter({ hasText: 'Recommended' })).toContainText('1');
  await expect(metricCells.filter({ hasText: 'Custom' })).toContainText('1');
  await expect(metricCells.filter({ hasText: 'Legacy' })).toContainText('1');

  // Policies table — one row per policy, with type / scope / warnings.
  await expect(adminPage.getByRole('row', { name: /recommended defaults/i })).toContainText(/recommended/i);
  await expect(adminPage.getByRole('row', { name: /custom 30-day transactions/i })).toContainText(
    /aggressive_retention/,
  );
  // Legacy policy renders with its deprecation status + critical warning.
  const legacyRow = adminPage.getByRole('row', { name: /legacy yaml carry-over/i });
  await expect(legacyRow).toContainText(/legacy.*deprecated/i);
  await expect(legacyRow).toContainText(/legacy_yaml/);

  // Executions table renders the mocked run with its dry-run status.
  const execRow = adminPage.getByRole('row', { name: /ri\.datasets\.main\.alpha/i });
  await expect(execRow).toContainText(/completed.*dry-run/i);
  await expect(execRow).toContainText(/7d.*irreversible/i);
});

// ---------------------------------------------------------------------------
// Case — Create custom policy (POST body parses selectors + retention)
// ---------------------------------------------------------------------------

test('create custom policy: POSTs name + retention_days + selectors + dataset_rid', async ({
  adminPage,
}) => {
  await mockRetention(adminPage);
  const cap = captureRequests(adminPage, POLICIES_LIST);
  await adminPage.route(POLICIES_LIST, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: makePolicy({
        id: 'pol-new-1',
        name: 'Quarterly purge',
        retention_days: 365,
      }),
    });
  });

  await adminPage.goto('/control-panel/retention-policies');
  await expect(
    adminPage.getByText(/^new policy$/i).first(),
  ).toBeVisible();

  await adminPage.getByRole('textbox', { name: /^name$/i }).fill('Quarterly purge');
  await adminPage
    .getByRole('spinbutton', { name: /retention days/i })
    .fill('365');

  // Dataset selector → dataset_rids (enables the RID input).
  await adminPage
    .getByRole('combobox', { name: /dataset selector/i })
    .selectOption('dataset_rids');
  await adminPage
    .getByRole('textbox', { name: /dataset or folder rid/i })
    .fill('ri.datasets.main.alpha');

  // Transaction selector → older_than is the default; bump age days.
  await adminPage.getByRole('spinbutton', { name: /age days/i }).fill('120');

  await adminPage.getByRole('button', { name: /^create policy$/i }).click();

  const post = await waitForPost(cap);
  expect(post.body).toMatchObject({
    name: 'Quarterly purge',
    policy_type: 'custom',
    target_kind: 'transaction',
    retention_days: 365,
    selector: { dataset_rid: 'ri.datasets.main.alpha' },
    transaction_selectors: [{ kind: 'older_than', duration_seconds: 120 * 24 * 60 * 60 }],
    dataset_selectors: [{ mode: 'select', kind: 'dataset_rids', dataset_rids: ['ri.datasets.main.alpha'] }],
    grace_period_minutes: 60,
    updated_by: 'control-panel',
  });

  // Success banner echoes the new policy name.
  await expect(adminPage.locator('.of-status-success').first()).toContainText(
    /created retention policy "quarterly purge"/i,
  );
});

// ---------------------------------------------------------------------------
// Case — Dangerous flags gate the POST behind the acknowledgement
// ---------------------------------------------------------------------------

test('dangerous flags: create is blocked without the acknowledgement and unblocked once checked', async ({
  adminPage,
}) => {
  await mockRetention(adminPage);
  const cap = captureRequests(adminPage, POLICIES_LIST);
  await adminPage.route(POLICIES_LIST, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: makePolicy({
        id: 'pol-danger-1',
        name: 'Aggressive sweep',
        allow_latest_view_deletion: true,
        abort_open_transactions: true,
        danger_acknowledgement: 'DELETE_CURRENT_DATA',
      }),
    });
  });

  await adminPage.goto('/control-panel/retention-policies');

  await adminPage.getByRole('textbox', { name: /^name$/i }).fill('Aggressive sweep');
  await adminPage
    .getByRole('checkbox', { name: /allow current\/latest-view transaction deletion/i })
    .check();
  await adminPage
    .getByRole('checkbox', { name: /allow aborting open transactions/i })
    .check();

  // First click WITHOUT acknowledging the danger → error banner, no POST.
  await adminPage.getByRole('button', { name: /^create policy$/i }).click();
  await expect(adminPage.locator('.of-status-danger').first()).toContainText(
    /confirm the destructive retention warning/i,
  );
  expect(cap.calls.filter((c) => c.method === 'POST').length).toBe(0);

  // Check the acknowledgement (only renders AFTER either destructive flag is on).
  await adminPage
    .getByRole('checkbox', { name: /i understand this can delete current data/i })
    .check();
  await adminPage.getByRole('button', { name: /^create policy$/i }).click();

  const post = await waitForPost(cap);
  expect(post.body).toMatchObject({
    name: 'Aggressive sweep',
    allow_latest_view_deletion: true,
    abort_open_transactions: true,
    danger_acknowledgement: 'DELETE_CURRENT_DATA',
  });
});

// ---------------------------------------------------------------------------
// Case — Run retention execution (POST /retention/executions)
// ---------------------------------------------------------------------------

test('run retention execution: POSTs /retention/executions with dataset_rid + dry_run + as_of_days', async ({
  adminPage,
}) => {
  await mockRetention(adminPage, { executions: [] });
  const cap = captureRequests(adminPage, EXECUTIONS_LIST);
  await adminPage.route(EXECUTIONS_LIST, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: {
        ...EXEC_RUN,
        id: 'run-fresh-1',
        dataset_rid: 'ri.datasets.main.beta',
        marked_transaction_count: 12,
        swept_transaction_count: 0,
        dry_run: true,
      },
    });
  });

  await adminPage.goto('/control-panel/retention-policies');
  await expect(
    adminPage.getByText(/mark-and-sweep execution and recovery windows/i),
  ).toBeVisible();

  await adminPage
    .getByRole('textbox', { name: /^dataset rid$/i })
    .fill('ri.datasets.main.beta');
  await adminPage.getByRole('spinbutton', { name: /as-of days/i }).fill('30');
  // Dry-run is checked by default; leave it on.

  await adminPage.getByRole('button', { name: /^run retention execution$/i }).click();

  const post = await waitForPost(cap);
  expect(post.body).toMatchObject({
    dataset_rid: 'ri.datasets.main.beta',
    as_of_days: 30,
    dry_run: true,
    recovery_window_days: 7,
  });

  await expect(adminPage.locator('.of-status-success').first()).toContainText(
    /retention execution run-fresh-1 completed: marked 12, swept 0\./i,
  );
  // The freshly-pushed row surfaces in the executions table.
  await expect(
    adminPage.getByRole('row', { name: /ri\.datasets\.main\.beta/i }),
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// Validation — dataset RID empty rejects the execution before the network
// ---------------------------------------------------------------------------

test('run retention execution: empty Dataset RID surfaces the validation error without POSTing', async ({
  adminPage,
}) => {
  await mockRetention(adminPage);
  const cap = captureRequests(adminPage, EXECUTIONS_LIST);

  await adminPage.goto('/control-panel/retention-policies');
  await adminPage.getByRole('button', { name: /^run retention execution$/i }).click();

  await expect(adminPage.locator('.of-status-danger').first()).toContainText(
    /dataset rid is required to execute retention\./i,
  );
  expect(cap.calls.filter((c) => c.method === 'POST').length).toBe(0);
});

// ---------------------------------------------------------------------------
// Absent-today guards — per-row mutation surface, legal-hold, scope filter,
// per-project binding, audit log are NOT on this page today
// ---------------------------------------------------------------------------

test('absent today: per-row edit/delete, legal-hold toggle, scope filter, per-project binding, audit log', async ({
  adminPage,
}) => {
  await mockRetention(adminPage, {
    policies: [POLICY_CUSTOM],
    executions: [EXEC_RUN],
  });
  await adminPage.goto('/control-panel/retention-policies');
  await expect(
    adminPage.getByRole('row', { name: /custom 30-day transactions/i }),
  ).toBeVisible();

  // 1. No per-row Edit / Delete buttons. The policies table is render-
  //    only today (the api exposes PUT/DELETE — `updateRetentionPolicy`,
  //    `deleteRetentionPolicy` — but neither is wired into the UI).
  expect(
    await adminPage.getByRole('row', { name: /custom 30-day transactions/i }).getByRole('button', { name: /^edit$|^delete$|^remove$/i }).count(),
  ).toBe(0);

  // 2. No legal-hold toggle on the create form. `legal_hold` is set
  //    to `false` in the request body but no checkbox exists in the
  //    UI to flip it.
  expect(
    await adminPage.getByRole('checkbox', { name: /legal hold/i }).count(),
  ).toBe(0);

  // 3. No scope / type filter combobox on the policies table.
  expect(
    await adminPage.getByRole('combobox', { name: /filter by scope|filter by type|policy type filter/i }).count(),
  ).toBe(0);

  // 4. No per-project binding surface. Scoping is encoded into the
  //    Space ID textbox + the `scope` string ('organization' /
  //    'space:<id>'); there is no project picker / "Bind to project"
  //    CTA.
  expect(
    await adminPage.getByRole('button', { name: /bind to project|assign to project|attach to project/i }).count(),
  ).toBe(0);

  // 5. No audit-log surface. The page exposes executions (mark-and-
  //    sweep runs), NOT a CRUD audit history of policy edits.
  expect(
    await adminPage.getByRole('heading', { name: /audit (log|history|events)$/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /load audit|view audit|audit log/i }).count(),
  ).toBe(0);
});

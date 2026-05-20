import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { E2E_NOW } from './fixtures/mocks';
import { MachineryPage } from './pages';

/**
 * E2E coverage for `/machinery`
 * (apps/web/src/routes/machinery/MachineryPage.tsx).
 *
 * **Domain.** The shipped page is a *read-only* orchestration inspector
 * that sits across two services:
 *
 *   - Ontology "machinery" — `OntologyRule`s with their effect schedules,
 *     `MachineryInsight` aggregates, and the pending `MachineryQueue`.
 *   - Workflow engine — `WorkflowDefinition`s (the platform's
 *     state-machine analogue: each has `steps[] + trigger_type`), their
 *     `WorkflowRun`s, and pending `WorkflowApproval`s.
 *
 * The page itself ONLY renders panels — there is no create / edit form
 * and no "Trigger transition" button. The `MachineryPage` page object
 * declares `newMachineButton` + `triggerButton` locators, but those
 * controls don't exist in today's DOM; the absent-today test below pins
 * that gap so a half-shipped CRUD/trigger feature surfaces here first.
 *
 * Endpoints exercised on mount + selector changes:
 *   - GET /api/v1/ontology/types?page=1&per_page=100
 *   - GET /api/v1/workflows?per_page=200
 *   - GET /api/v1/ontology/rules?object_type_id=...&per_page=100
 *   - GET /api/v1/ontology/rules/insights?object_type_id=...
 *   - GET /api/v1/ontology/rules/machinery/queue?object_type_id=...
 *   - GET /api/v1/workflows/approvals?per_page=50&workflow_id=...
 *   - GET /api/v1/workflows/{id}/runs?per_page=30
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /^console\.error: %o$/,
      /Failed to load/i,
    ],
  },
});

// ---------------------------------------------------------------------------
// Mock state + builders
// ---------------------------------------------------------------------------

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
}

interface OntologyRuleFixture {
  id: string;
  name: string;
  display_name: string;
  description: string;
  object_type_id: string;
  evaluation_mode: 'advisory' | 'automatic';
  trigger_spec: Record<string, unknown>;
  effect_spec: Record<string, unknown>;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

interface MachineryInsightFixture {
  rule_id: string;
  name: string;
  display_name: string;
  evaluation_mode: 'advisory' | 'automatic';
  matched_runs: number;
  total_runs: number;
  pending_schedules: number;
  overdue_schedules: number;
  avg_schedule_lead_hours: number | null;
  dynamic_pressure: string;
  last_matched_at: string | null;
  last_object_id: string | null;
}

interface MachineryQueueFixture {
  object_type_id: string | null;
  data: unknown[];
  recommendation: {
    generated_at: string;
    strategy: string;
    queue_depth: number;
    overdue_count: number;
    total_estimated_minutes: number;
    next_due_at: string | null;
    recommended_order: string[];
    capability_load: Array<{
      capability: string;
      pending_count: number;
      total_estimated_minutes: number;
    }>;
  };
}

interface WorkflowDefinitionFixture {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  status: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  steps: Array<{
    id: string;
    name: string;
    step_type: string;
    description: string;
    config: Record<string, unknown>;
    next_step_id: string | null;
    branches: unknown[];
  }>;
  webhook_secret: string | null;
  next_run_at: string | null;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkflowApprovalFixture {
  id: string;
  workflow_id: string;
  workflow_run_id: string;
  step_id: string;
  title: string;
  instructions: string;
  assigned_to: string | null;
  status: string;
  decision: string | null;
  payload: Record<string, unknown>;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

interface WorkflowRunFixture {
  id: string;
  workflow_id: string;
  trigger_type: string;
  status: string;
  started_by: string | null;
  current_step_id: string | null;
  context: Record<string, unknown>;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

const AIRCRAFT: ObjectTypeFixture = {
  id: 'object-type-aircraft',
  name: 'aircraft',
  display_name: 'Aircraft',
  description: 'Operational fleet',
  primary_key_property: 'tail_number',
  icon: 'plane',
  color: '#0f766e',
  owner_id: 'user-1',
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
};

const VEHICLE: ObjectTypeFixture = {
  id: 'object-type-vehicle',
  name: 'vehicle',
  display_name: 'Vehicle',
  description: 'Ground fleet',
  primary_key_property: 'vin',
  icon: 'truck',
  color: '#d97706',
  owner_id: 'user-1',
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
};

const RULE_INSPECT: OntologyRuleFixture = {
  id: 'rule-inspect',
  name: 'inspect_aircraft',
  display_name: 'Schedule inspection',
  description: 'Schedules a 100h inspection on flight-hour threshold',
  object_type_id: AIRCRAFT.id,
  evaluation_mode: 'automatic',
  trigger_spec: { numeric_gte: { flight_hours: 100 } },
  effect_spec: {
    schedule: {
      property_name: 'flight_hours',
      offset_hours: 24,
      priority_score: 5,
      estimated_duration_minutes: 60,
      required_capability: 'aircraft-mechanic',
    },
  },
  owner_id: 'user-1',
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
};

const RULE_REFUEL: OntologyRuleFixture = {
  id: 'rule-refuel',
  name: 'refuel_aircraft',
  display_name: 'Refuel below 20%',
  description: 'Trigger refuel work order when fuel drops under 20%',
  object_type_id: AIRCRAFT.id,
  evaluation_mode: 'advisory',
  trigger_spec: { numeric_lte: { fuel_pct: 20 } },
  effect_spec: { alert: { severity: 'medium', title: 'Refuel needed' } },
  owner_id: 'user-1',
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
};

const INSIGHT_INSPECT: MachineryInsightFixture = {
  rule_id: RULE_INSPECT.id,
  name: RULE_INSPECT.name,
  display_name: RULE_INSPECT.display_name,
  evaluation_mode: 'automatic',
  matched_runs: 7,
  total_runs: 12,
  pending_schedules: 3,
  overdue_schedules: 1,
  avg_schedule_lead_hours: 18,
  dynamic_pressure: 'elevated',
  last_matched_at: E2E_NOW,
  last_object_id: 'aircraft-1',
};

const QUEUE: MachineryQueueFixture = {
  object_type_id: AIRCRAFT.id,
  data: [],
  recommendation: {
    generated_at: E2E_NOW,
    strategy: 'priority-first',
    queue_depth: 4,
    overdue_count: 1,
    total_estimated_minutes: 240,
    next_due_at: E2E_NOW,
    recommended_order: [RULE_INSPECT.id],
    capability_load: [
      { capability: 'aircraft-mechanic', pending_count: 3, total_estimated_minutes: 180 },
      { capability: 'avionics-tech', pending_count: 1, total_estimated_minutes: 60 },
    ],
  },
};

const WORKFLOW_DISPATCH: WorkflowDefinitionFixture = {
  id: 'workflow-dispatch',
  name: 'Dispatch maintenance crew',
  description: 'Two-step approval + dispatch',
  owner_id: 'user-1',
  status: 'active',
  trigger_type: 'event',
  trigger_config: {},
  steps: [
    {
      id: 'step-approve',
      name: 'Approve',
      step_type: 'approval',
      description: 'Ops lead approval',
      config: {},
      next_step_id: 'step-dispatch',
      branches: [],
    },
    {
      id: 'step-dispatch',
      name: 'Dispatch',
      step_type: 'action',
      description: 'Page the on-call mechanic',
      config: {},
      next_step_id: null,
      branches: [],
    },
  ],
  webhook_secret: null,
  next_run_at: null,
  last_triggered_at: E2E_NOW,
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
};

const APPROVAL_PENDING: WorkflowApprovalFixture = {
  id: 'approval-1',
  workflow_id: WORKFLOW_DISPATCH.id,
  workflow_run_id: 'run-1',
  step_id: 'step-approve',
  title: 'Approve dispatch for tail N123AB',
  instructions: 'Confirm crew availability before dispatch.',
  assigned_to: 'user-1',
  status: 'pending',
  decision: null,
  payload: {},
  requested_at: E2E_NOW,
  decided_at: null,
  decided_by: null,
};

const RUN_SUCCESS: WorkflowRunFixture = {
  id: 'run-1',
  workflow_id: WORKFLOW_DISPATCH.id,
  trigger_type: 'manual',
  status: 'succeeded',
  started_by: 'user-1',
  current_step_id: null,
  context: { object_id: 'aircraft-1' },
  error_message: null,
  started_at: E2E_NOW,
  finished_at: E2E_NOW,
};

interface MachineryMocks {
  objectTypes: ObjectTypeFixture[];
  rulesByType: Record<string, OntologyRuleFixture[]>;
  insightsByType: Record<string, MachineryInsightFixture[]>;
  queueByType: Record<string, MachineryQueueFixture>;
  workflows: WorkflowDefinitionFixture[];
  approvalsByWorkflow: Record<string, WorkflowApprovalFixture[]>;
  runsByWorkflow: Record<string, WorkflowRunFixture[]>;
}

/**
 * Wire up every read endpoint the MachineryPage hits. Each handler keys
 * its response off the `object_type_id` / `workflow_id` query param so
 * the selector-change tests can assert the filter param round-trips.
 */
async function installMachineryMocks(page: Page, mocks: MachineryMocks): Promise<void> {
  await page.route(/\/api\/v1\/ontology\/types(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: mocks.objectTypes, total: mocks.objectTypes.length, page: 1, per_page: 100 },
    });
  });

  await page.route(/\/api\/v1\/ontology\/rules\/machinery\/queue(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const filter = url.searchParams.get('object_type_id') ?? '';
    const queue =
      mocks.queueByType[filter] ??
      ({
        object_type_id: filter || null,
        data: [],
        recommendation: {
          generated_at: E2E_NOW,
          strategy: 'idle',
          queue_depth: 0,
          overdue_count: 0,
          total_estimated_minutes: 0,
          next_due_at: null,
          recommended_order: [],
          capability_load: [],
        },
      } satisfies MachineryQueueFixture);
    await route.fulfill({ json: queue });
  });

  await page.route(/\/api\/v1\/ontology\/rules\/insights(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const filter = url.searchParams.get('object_type_id') ?? '';
    await route.fulfill({
      json: {
        object_type_id: filter || null,
        data: mocks.insightsByType[filter] ?? [],
      },
    });
  });

  await page.route(/\/api\/v1\/ontology\/rules(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const filter = url.searchParams.get('object_type_id') ?? '';
    const rules = mocks.rulesByType[filter] ?? [];
    await route.fulfill({
      json: { data: rules, total: rules.length, page: 1, per_page: 100 },
    });
  });

  await page.route(/\/api\/v1\/workflows\/approvals(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const filter = url.searchParams.get('workflow_id') ?? '';
    const approvals = mocks.approvalsByWorkflow[filter] ?? [];
    await route.fulfill({
      json: { data: approvals, total: approvals.length, page: 1, per_page: 50 },
    });
  });

  await page.route(/\/api\/v1\/workflows\/[^/]+\/runs(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const match = /\/workflows\/([^/]+)\/runs/.exec(route.request().url());
    const workflowId = match?.[1] ?? '';
    const runs = mocks.runsByWorkflow[workflowId] ?? [];
    await route.fulfill({
      json: { data: runs, total: runs.length, page: 1, per_page: 30 },
    });
  });

  await page.route(/\/api\/v1\/workflows(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: mocks.workflows, total: mocks.workflows.length, page: 1, per_page: 200, total_pages: 1 },
    });
  });
}

function defaultMocks(): MachineryMocks {
  return {
    objectTypes: [AIRCRAFT, VEHICLE],
    rulesByType: { [AIRCRAFT.id]: [RULE_INSPECT, RULE_REFUEL], [VEHICLE.id]: [] },
    insightsByType: { [AIRCRAFT.id]: [INSIGHT_INSPECT], [VEHICLE.id]: [] },
    queueByType: { [AIRCRAFT.id]: QUEUE },
    workflows: [WORKFLOW_DISPATCH],
    approvalsByWorkflow: { [WORKFLOW_DISPATCH.id]: [APPROVAL_PENDING] },
    runsByWorkflow: { [WORKFLOW_DISPATCH.id]: [RUN_SUCCESS] },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renders the Machinery heading + object-type + workflow selectors', async ({ adminPage }) => {
  await installMachineryMocks(adminPage, defaultMocks());
  const machinery = new MachineryPage(adminPage);
  await machinery.goto();
  await machinery.expectLoaded();

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^machinery$/i }),
  ).toBeVisible();

  // Both labelled selectors are present and populated from the mocked
  // /ontology/types + /workflows lists.
  const objectTypeSelect = adminPage.getByLabel(/object type/i);
  const workflowSelect = adminPage.getByLabel(/^workflow/i);
  await expect(objectTypeSelect).toBeVisible();
  await expect(workflowSelect).toBeVisible();

  // The first mocked object type is auto-selected on load.
  await expect(objectTypeSelect).toHaveValue(AIRCRAFT.id);
  // The workflow picker stays on its empty sentinel until the user
  // picks one (matches the `setSelectedWorkflowId('')` initial state).
  await expect(workflowSelect).toHaveValue('');

  // Workflow option is available even before selection.
  await expect(
    workflowSelect.locator('option', { hasText: WORKFLOW_DISPATCH.name }),
  ).toHaveCount(1);
});

test('lists ontology rules, insights and queue summary for the auto-selected object type', async ({
  adminPage,
}) => {
  await installMachineryMocks(adminPage, defaultMocks());
  const machinery = new MachineryPage(adminPage);
  await machinery.goto();

  // Rules panel shows the rule display names + their evaluation mode.
  // The mocked rules are the platform's "state machine" surface — each
  // OntologyRule wires a trigger (predicate over object props) to an
  // effect (schedule / alert / patch). Each <li> row has the shape
  // "<display_name> · <evaluation_mode>" — using the combined text
  // keeps the assertion unique against the insights panel below, which
  // also echoes the rule's display_name.
  await expect(adminPage.getByText(/^rules \(2\)/i)).toBeVisible();
  await expect(
    adminPage.getByText(`${RULE_INSPECT.display_name} · automatic`),
  ).toBeVisible();
  await expect(
    adminPage.getByText(`${RULE_REFUEL.display_name} · advisory`),
  ).toBeVisible();

  // Insights panel shows the matched / total counts and the dynamic
  // pressure label.
  await expect(adminPage.getByText(/^insights \(1\)/i)).toBeVisible();
  await expect(
    adminPage.getByText(/elevated · matched 7\/12/i),
  ).toBeVisible();

  // Queue summary chips render — these are the "transitions in flight"
  // for the selected object type.
  await expect(adminPage.getByText(/^queue summary$/i)).toBeVisible();
  await expect(adminPage.getByText(/^Depth 4$/)).toBeVisible();
  await expect(adminPage.getByText(/^Overdue 1$/)).toBeVisible();
  await expect(adminPage.getByText(/^Total minutes 240$/)).toBeVisible();
  await expect(adminPage.getByText(/^Strategy priority-first$/)).toBeVisible();

  // Capability load lists one entry per capability bucket.
  await expect(
    adminPage.getByText(/aircraft-mechanic · 3 pending · 180m/i),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/avionics-tech · 1 pending · 60m/i),
  ).toBeVisible();
});

test('switching the object-type selector re-queries rules / insights / queue with the new filter', async ({
  adminPage,
}) => {
  await installMachineryMocks(adminPage, defaultMocks());
  const rulesCalls = captureRequests(adminPage, /\/api\/v1\/ontology\/rules(\?|$)/);
  const insightsCalls = captureRequests(
    adminPage,
    /\/api\/v1\/ontology\/rules\/insights(\?|$)/,
  );
  const queueCalls = captureRequests(
    adminPage,
    /\/api\/v1\/ontology\/rules\/machinery\/queue(\?|$)/,
  );

  const machinery = new MachineryPage(adminPage);
  await machinery.goto();

  // Wait for the auto-selected fetch (object_type_id=aircraft).
  await expect(
    adminPage.getByText(`${RULE_INSPECT.display_name} · automatic`),
  ).toBeVisible();
  const baseline = {
    rules: rulesCalls.count(),
    insights: insightsCalls.count(),
    queue: queueCalls.count(),
  };

  // Switching to a type with no mocked rules clears every panel via the
  // mocked empty responses keyed off object_type_id=vehicle.
  await adminPage.getByLabel(/object type/i).selectOption(VEHICLE.id);

  await expect.poll(() => rulesCalls.count()).toBeGreaterThan(baseline.rules);
  await expect.poll(() => insightsCalls.count()).toBeGreaterThan(baseline.insights);
  await expect.poll(() => queueCalls.count()).toBeGreaterThan(baseline.queue);

  // Every follow-up call carries the new filter param.
  for (const cap of [rulesCalls, insightsCalls, queueCalls]) {
    const last = cap.last();
    expect(last?.method).toBe('GET');
    expect(last?.url).toMatch(/[?&]object_type_id=object-type-vehicle\b/);
  }

  // The rules / insights headers reflect the empty result.
  await expect(adminPage.getByText(/^rules \(0\)/i)).toBeVisible();
  await expect(adminPage.getByText(/^insights \(0\)/i)).toBeVisible();
});

test('selecting a workflow reveals the pending approvals + recent runs panels', async ({
  adminPage,
}) => {
  await installMachineryMocks(adminPage, defaultMocks());
  const approvalsCalls = captureRequests(
    adminPage,
    /\/api\/v1\/workflows\/approvals(\?|$)/,
  );
  const runsCalls = captureRequests(
    adminPage,
    new RegExp(`/api/v1/workflows/${WORKFLOW_DISPATCH.id}/runs`),
  );

  const machinery = new MachineryPage(adminPage);
  await machinery.goto();

  // Before any workflow is selected, the approvals + runs panels are
  // gated off (see `{selectedWorkflowId && (...)}` in MachineryPage).
  await expect(adminPage.getByText(/pending approvals/i)).toHaveCount(0);
  await expect(adminPage.getByText(/recent runs/i)).toHaveCount(0);
  expect(approvalsCalls.count()).toBe(0);
  expect(runsCalls.count()).toBe(0);

  await adminPage
    .getByLabel(/^workflow/i)
    .selectOption(WORKFLOW_DISPATCH.id);

  // Approvals + runs both fetched and rendered.
  await expect.poll(() => approvalsCalls.count()).toBeGreaterThanOrEqual(1);
  await expect.poll(() => runsCalls.count()).toBeGreaterThanOrEqual(1);
  expect(approvalsCalls.last()?.url).toMatch(
    new RegExp(`[?&]workflow_id=${WORKFLOW_DISPATCH.id}\\b`),
  );

  await expect(adminPage.getByText(/^pending approvals \(1\)/i)).toBeVisible();
  await expect(adminPage.getByText(APPROVAL_PENDING.title)).toBeVisible();
  await expect(adminPage.getByText(/^recent runs \(1\)/i)).toBeVisible();
  // A run row encodes "trigger · status · started_at" — assert the
  // trigger + status pair we mocked (the formatted timestamp is locale
  // dependent so we leave it alone).
  await expect(
    adminPage.getByText(/manual · succeeded/i).first(),
  ).toBeVisible();
});

test('absent today: no create / edit / manual-trigger controls in the MachineryPage UI', async ({
  adminPage,
}) => {
  // Regression guard. The page is purely a read-only inspector — the
  // declared `MachineryPage.newMachineButton` / `triggerButton`
  // locators are aspirational. When create/edit and a "Trigger run"
  // CTA finally ship, every assertion in this test flips and forces
  // the spec to grow real coverage for them.
  await installMachineryMocks(adminPage, defaultMocks());
  const machinery = new MachineryPage(adminPage);
  await machinery.goto();
  await machinery.expectLoaded();

  // Wait for the page to settle so absent-control assertions are not
  // racing the initial render.
  await expect(
    adminPage.getByText(`${RULE_INSPECT.display_name} · automatic`),
  ).toBeVisible();

  // No "New / Create" CTA at all — neither for rules nor for workflows.
  expect(
    await adminPage
      .getByRole('button', { name: /^(new|create|add)\b/i })
      .count(),
  ).toBe(0);

  // No row-level edit controls.
  expect(
    await adminPage.getByRole('button', { name: /^edit\b/i }).count(),
  ).toBe(0);

  // No manual-trigger button (the workflows API exposes
  // POST /workflows/:id/runs/manual but the UI does not wire it up).
  await adminPage
    .getByLabel(/^workflow/i)
    .selectOption(WORKFLOW_DISPATCH.id);
  await expect(adminPage.getByText(/^pending approvals/i)).toBeVisible();
  expect(
    await adminPage
      .getByRole('button', { name: /trigger|fire|run (now|workflow)|start run/i })
      .count(),
  ).toBe(0);

  // No mutating call has slipped out either — every request the page
  // makes during this scenario is a GET.
  const mutating = captureRequests(adminPage, /\/api\/v1\/.+/);
  await adminPage.waitForTimeout(250);
  for (const call of mutating.calls) {
    expect(call.method).toBe('GET');
  }
});

import { type Page, type Route } from '@playwright/test';

import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/object-monitors`
 * (apps/web/src/routes/object-monitors/ObjectMonitorsPage.tsx).
 *
 * **Reality vs roadmap.** Object monitors are a *thin lens* over the
 * workflow API: the page lists workflow definitions whose
 * `trigger_config.monitor_surface === 'object_monitors'`, and the
 * create modal builds a workflow with a notification step (always
 * `channels: ['in_app']`) plus an optional submit-action step. Every
 * mutating call funnels through the workflows REST surface:
 *
 *     GET    /api/v1/workflows
 *     POST   /api/v1/workflows
 *     PATCH  /api/v1/workflows/{id}       (pause / resume)
 *     DELETE /api/v1/workflows/{id}
 *     POST   /api/v1/workflows/{id}/runs/manual
 *     GET    /api/v1/workflows/{id}/runs
 *     GET    /api/v1/workflows/approvals?workflow_id=...
 *
 * Wishlist items that DO ship today are exercised below. Two wishlist
 * items DON'T ship and are pinned by the regression guard at the end:
 *
 *   - The action picker only surfaces "Notification only" (the
 *     hardcoded in-app notification step) + ontology Submit action.
 *     There is no Email / Webhook channel selector — the
 *     `buildMonitorPayload` helper always emits `channels:
 *     ['in_app']`.
 *   - The cron schedule field is a plain `<input>` (monospace text
 *     entry of the cron expression); there is no visual picker
 *     (minute/hour/day comboboxes).
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Failed to load object monitors/,
      /Failed to load monitor activity/,
    ],
  },
});

const E2E_NOW = '2026-05-11T00:00:00Z';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface WorkflowStepFixture {
  id: string;
  name: string;
  step_type: string;
  description: string;
  config: Record<string, unknown>;
  next_step_id: string | null;
  branches: unknown[];
}

interface WorkflowFixture {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  status: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  steps: WorkflowStepFixture[];
  webhook_secret: string | null;
  next_run_at: string | null;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

function makeNotificationStep(name = 'Notify owners'): WorkflowStepFixture {
  return {
    id: 'step-notify-1',
    name,
    step_type: 'notification',
    description: '',
    config: { title: `${name} fired`, message: 'Object monitor condition matched.', channels: ['in_app'], severity: 'medium' },
    next_step_id: null,
    branches: [],
  };
}

function makeMonitor(overrides: Partial<WorkflowFixture> = {}): WorkflowFixture {
  return {
    id: 'monitor-1',
    name: 'High value orders monitor',
    description: 'Alert on every new high-value order.',
    owner_id: 'user-1',
    status: 'active',
    trigger_type: 'event',
    trigger_config: {
      monitor_surface: 'object_monitors',
      target_kind: 'object_set',
      severity: 'high',
      object_set_id: 'object-set-1',
      event_name: 'ontology.object.updated',
    },
    steps: [makeNotificationStep('Notify high-value owners')],
    webhook_secret: null,
    next_run_at: null,
    last_triggered_at: E2E_NOW,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

const MONITOR_ACTIVE = makeMonitor({
  id: 'monitor-active-1',
  name: 'Active orders monitor',
  status: 'active',
  trigger_config: {
    monitor_surface: 'object_monitors',
    target_kind: 'object_set',
    severity: 'high',
    object_set_id: 'object-set-1',
    event_name: 'ontology.object.updated',
  },
});

const MONITOR_PAUSED = makeMonitor({
  id: 'monitor-paused-1',
  name: 'Paused fleet monitor',
  status: 'paused',
  trigger_type: 'cron',
  trigger_config: {
    monitor_surface: 'object_monitors',
    target_kind: 'object_type',
    severity: 'medium',
    object_type_id: 'object-type-aircraft',
    cron: '*/15 * * * *',
  },
});

const MONITOR_DRAFT = makeMonitor({
  id: 'monitor-draft-1',
  name: 'Draft compliance monitor',
  status: 'draft',
  trigger_type: 'manual',
  trigger_config: {
    monitor_surface: 'object_monitors',
    target_kind: 'object_type',
    severity: 'low',
    object_type_id: 'object-type-aircraft',
  },
});

const OBJECT_SETS = [
  { id: 'object-set-1', name: 'High value orders' },
  { id: 'object-set-2', name: 'Aircraft fleet' },
];

const OBJECT_TYPES = [
  { id: 'object-type-aircraft', name: 'aircraft', display_name: 'Aircraft' },
  { id: 'object-type-order', name: 'order', display_name: 'Order' },
];

const ACTION_TYPES = [
  { id: 'action-1', name: 'rotate_aircraft', display_name: 'Rotate aircraft', object_type_id: 'object-type-aircraft' },
];

const SAMPLE_RUNS = [
  {
    id: 'run-1',
    workflow_id: MONITOR_ACTIVE.id,
    trigger_type: 'event',
    status: 'succeeded',
    started_by: 'user-1',
    current_step_id: null,
    context: {},
    error_message: null,
    started_at: E2E_NOW,
    finished_at: E2E_NOW,
  },
  {
    id: 'run-2',
    workflow_id: MONITOR_ACTIVE.id,
    trigger_type: 'manual',
    status: 'failed',
    started_by: 'user-1',
    current_step_id: null,
    context: {},
    error_message: 'Mock failure',
    started_at: '2026-05-10T22:14:55Z',
    finished_at: '2026-05-10T22:15:01Z',
  },
];

// ---------------------------------------------------------------------------
// Mock installers
// ---------------------------------------------------------------------------

const WORKFLOWS_LIST_URL = /\/api\/v1\/workflows(\?[^/]*)?$/;
const WORKFLOWS_APPROVALS_URL = /\/api\/v1\/workflows\/approvals(\?[^/]*)?$/;

function workflowDetailUrl(id: string): RegExp {
  return new RegExp(`/api/v1/workflows/${id}$`);
}
function workflowRunsUrl(id: string): RegExp {
  return new RegExp(`/api/v1/workflows/${id}/runs(\\?[^/]*)?$`);
}
function workflowManualRunUrl(id: string): RegExp {
  return new RegExp(`/api/v1/workflows/${id}/runs/manual$`);
}

async function mockMonitors(page: Page, monitors: WorkflowFixture[]): Promise<void> {
  await page.route(WORKFLOWS_LIST_URL, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        json: { data: monitors, page: 1, per_page: 200, total: monitors.length, total_pages: 1 },
      });
      return;
    }
    return route.fallback();
  });

  // approvals: empty list
  await page.route(WORKFLOWS_APPROVALS_URL, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: [], page: 1, per_page: 50, total: 0 } });
  });
}

async function mockDependencies(page: Page): Promise<void> {
  // Object types
  await page.route(/\/api\/v1\/ontology\/types(\?[^/]*)?$/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: OBJECT_TYPES, total: OBJECT_TYPES.length, page: 1, per_page: 200 },
    });
  });
  // Object sets
  await page.route(/\/api\/v1\/ontology\/object-sets(\?[^/]*)?$/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: OBJECT_SETS, next_token: null } });
  });
  // Action types
  await page.route(/\/api\/v1\/ontology\/actions(\?[^/]*)?$/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: ACTION_TYPES, total: ACTION_TYPES.length, page: 1, per_page: 200 },
    });
  });
  // Function packages
  await page.route(/\/api\/v1\/ontology\/functions(\?[^/]*)?$/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: [], total: 0, page: 1, per_page: 200 } });
  });
  // Audit anomalies (returns plain array, NOT a `{data}` envelope).
  await page.route(/\/api\/v1\/audit\/anomalies(\?[^/]*)?$/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: [] });
  });
  // Audit events (returns `{ items: [] }`, NOT a `{data}` envelope).
  await page.route(/\/api\/v1\/audit\/events(\?[^/]*)?$/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { items: [] } });
  });
}

async function mockMonitorRuns(page: Page, monitorId: string, runs: typeof SAMPLE_RUNS): Promise<void> {
  await page.route(workflowRunsUrl(monitorId), async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: runs, page: 1, per_page: 30, total: runs.length } });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renders the header, stats chips, and the "+ Monitor" CTA', async ({ adminPage }) => {
  await mockDependencies(adminPage);
  await mockMonitors(adminPage, [MONITOR_ACTIVE, MONITOR_PAUSED]);
  await adminPage.goto('/object-monitors');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^object monitors$/i }),
  ).toBeVisible();

  // Header CTAs.
  await expect(adminPage.getByRole('button', { name: /^refresh$/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^\+ monitor$/i })).toBeVisible();

  // Stats chips reflect the mock totals: 2 monitors, 1 active, 1 paused.
  await expect(adminPage.getByText(/^monitors\s*2$/i)).toBeVisible();
  await expect(adminPage.getByText(/^active\s*1$/i)).toBeVisible();
  await expect(adminPage.getByText(/^paused\s*1$/i)).toBeVisible();
  await expect(adminPage.getByText(/^object types\s*\d+$/i)).toBeVisible();
  await expect(adminPage.getByText(/^object sets\s*\d+$/i)).toBeVisible();
});

test('registry renders one row per monitor with a status chip and per-row Pause/Resume button', async ({
  adminPage,
}) => {
  await mockDependencies(adminPage);
  await mockMonitors(adminPage, [MONITOR_ACTIVE, MONITOR_PAUSED, MONITOR_DRAFT]);
  await mockMonitorRuns(adminPage, MONITOR_ACTIVE.id, []);
  await adminPage.goto('/object-monitors');

  // Each mocked monitor's name shows up at least once in the registry
  // (the auto-selected active monitor also renders its name as the
  // detail-panel heading — use `.first()` to allow either match).
  await expect(adminPage.getByText(MONITOR_ACTIVE.name).first()).toBeVisible();
  await expect(adminPage.getByText(MONITOR_PAUSED.name)).toBeVisible();
  await expect(adminPage.getByText(MONITOR_DRAFT.name)).toBeVisible();

  // Status chips render (one per row). Scope to the chip class so the
  // assertion does not match the hidden `<option value="active">Active</option>`
  // inside the status-filter dropdown.
  await expect(adminPage.locator('.of-chip').filter({ hasText: /^active$/i }).first()).toBeVisible();
  await expect(adminPage.locator('.of-chip').filter({ hasText: /^paused$/i }).first()).toBeVisible();
  await expect(adminPage.locator('.of-chip').filter({ hasText: /^draft$/i }).first()).toBeVisible();

  // The first row (active monitor, auto-selected) has a row-level Pause
  // button; the second (paused) has Resume.
  await expect(adminPage.getByRole('button', { name: /^pause$/i }).first()).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^resume$/i }).first()).toBeVisible();
});

test('status filter dropdown narrows the registry to monitors matching the selected status', async ({
  adminPage,
}) => {
  await mockDependencies(adminPage);
  await mockMonitors(adminPage, [MONITOR_ACTIVE, MONITOR_PAUSED, MONITOR_DRAFT]);
  await mockMonitorRuns(adminPage, MONITOR_ACTIVE.id, []);
  await adminPage.goto('/object-monitors');

  await expect(adminPage.getByText(MONITOR_ACTIVE.name).first()).toBeVisible();

  await adminPage.getByRole('combobox').filter({ hasText: /all status/i }).selectOption('paused');

  // Only the paused monitor row remains; the registry chip reflects "1 shown".
  // (The active monitor was previously auto-selected, so its name might
  // still appear in the detail-panel heading until selection changes —
  // assert via row absence using the registry `<strong>` element.)
  await expect(adminPage.getByText(MONITOR_PAUSED.name).first()).toBeVisible();
  await expect(adminPage.locator('strong').filter({ hasText: MONITOR_ACTIVE.name })).toHaveCount(0);
  await expect(adminPage.locator('strong').filter({ hasText: MONITOR_DRAFT.name })).toHaveCount(0);
  await expect(adminPage.getByText(/^1 shown$/i)).toBeVisible();
});

test('"+ Monitor" opens the create modal with the schema-driven form, and toggling Trigger to "Cron" shows the cron input', async ({
  adminPage,
}) => {
  await mockDependencies(adminPage);
  await mockMonitors(adminPage, []);
  await adminPage.goto('/object-monitors');

  await adminPage.getByRole('button', { name: /^\+ monitor$/i }).click();

  const modal = adminPage.getByRole('dialog', { name: /create monitor/i });
  await expect(modal).toBeVisible();

  // Required fields render: Name, Status, Description, Target type,
  // Trigger, Severity, Submit action. The form uses
  // `<label><span>X</span><control/></label>` so we look up controls
  // by role + accessible name rather than via getByLabel. `exact: true`
  // is required because Playwright's name matching is substring by
  // default and several labels are prefixes of each other (e.g. Name
  // vs Event name).
  await expect(modal.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible();
  await expect(modal.getByRole('combobox', { name: 'Status', exact: true })).toBeVisible();
  await expect(modal.getByRole('textbox', { name: 'Description', exact: true })).toBeVisible();
  await expect(modal.getByRole('combobox', { name: 'Target type', exact: true })).toBeVisible();
  await expect(modal.getByRole('combobox', { name: 'Trigger', exact: true })).toBeVisible();
  await expect(modal.getByRole('combobox', { name: 'Severity', exact: true })).toBeVisible();
  await expect(modal.getByRole('combobox', { name: 'Submit action', exact: true })).toBeVisible();

  // The default trigger is "Event" — the Event name input is shown.
  await expect(modal.getByRole('textbox', { name: 'Event name', exact: true })).toBeVisible();

  // Switching the trigger to "Cron" reveals the cron text input.
  await modal.getByRole('combobox', { name: 'Trigger', exact: true }).selectOption('cron');
  await expect(modal.getByRole('textbox', { name: 'Cron', exact: true })).toBeVisible();
  // The default cron schedule prefilled is the page's emptyDraft value.
  await expect(modal.getByRole('textbox', { name: 'Cron', exact: true })).toHaveValue('*/15 * * * *');

  // Switching to Manual hides both the event input and the cron input.
  await modal.getByRole('combobox', { name: 'Trigger', exact: true }).selectOption('manual');
  await expect(modal.getByRole('textbox', { name: 'Event name', exact: true })).toHaveCount(0);
  await expect(modal.getByRole('textbox', { name: 'Cron', exact: true })).toHaveCount(0);
});

test('Create monitor: submitting POSTs /workflows with monitor_surface + steps + trigger config', async ({
  adminPage,
}) => {
  await mockDependencies(adminPage);
  await mockMonitors(adminPage, []);

  const cap = captureRequests(adminPage, WORKFLOWS_LIST_URL);

  // Echo back a deterministic created workflow so the page can refresh
  // its registry without a 204 crash.
  await adminPage.route(WORKFLOWS_LIST_URL, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      json: {
        ...MONITOR_ACTIVE,
        id: 'monitor-new-1',
        name: (body.name as string) ?? 'New monitor',
        description: (body.description as string) ?? '',
        status: (body.status as string) ?? 'active',
        trigger_type: (body.trigger_type as string) ?? 'event',
        trigger_config: (body.trigger_config as Record<string, unknown>) ?? {},
        steps: (body.steps as WorkflowStepFixture[]) ?? [],
      },
    });
  });

  await adminPage.goto('/object-monitors');
  await adminPage.getByRole('button', { name: /^\+ monitor$/i }).click();

  const modal = adminPage.getByRole('dialog', { name: /create monitor/i });
  await modal.getByRole('textbox', { name: 'Name', exact: true }).fill('High value orders monitor');
  await modal.getByRole('textbox', { name: 'Description', exact: true }).fill('Alert on every new high-value order.');
  await modal.getByRole('combobox', { name: 'Severity', exact: true }).selectOption('high');

  // Submit.
  await modal.getByRole('button', { name: /^create monitor$/i }).click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(1);
  const postCall = cap.calls.find((c) => c.method === 'POST');
  expect(postCall?.body).toMatchObject({
    name: 'High value orders monitor',
    description: 'Alert on every new high-value order.',
    trigger_type: 'event',
    trigger_config: {
      monitor_surface: 'object_monitors',
      target_kind: 'object_set',
      severity: 'high',
      object_set_id: OBJECT_SETS[0].id,
      event_name: 'ontology.object.updated',
    },
  });
  // The page emits exactly one default notification step + no submit
  // action (the dropdown is left at "Notification only").
  const steps = (postCall?.body as { steps?: Array<{ step_type: string; config: Record<string, unknown> }> })?.steps ?? [];
  expect(steps).toHaveLength(1);
  expect(steps[0]).toMatchObject({ step_type: 'notification', config: { channels: ['in_app'], severity: 'high' } });
});

test('Per-row Pause button PATCHes /workflows/{id} with status: paused', async ({ adminPage }) => {
  await mockDependencies(adminPage);
  await mockMonitors(adminPage, [MONITOR_ACTIVE]);
  await mockMonitorRuns(adminPage, MONITOR_ACTIVE.id, []);

  const cap = captureRequests(adminPage, workflowDetailUrl(MONITOR_ACTIVE.id));

  await adminPage.route(workflowDetailUrl(MONITOR_ACTIVE.id), async (route: Route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      json: { ...MONITOR_ACTIVE, status: (body.status as string) ?? 'paused' },
    });
  });

  await adminPage.goto('/object-monitors');
  await expect(adminPage.getByText(MONITOR_ACTIVE.name).first()).toBeVisible();

  // Scope to the registry row that wraps the active monitor.
  await adminPage.getByRole('button', { name: /^pause$/i }).first().click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'PATCH').length).toBeGreaterThanOrEqual(1);
  const patch = cap.calls.find((c) => c.method === 'PATCH');
  expect(patch?.body).toMatchObject({ status: 'paused' });
});

test('Detail panel: selected monitor exposes the Run / Pause / Delete actions + Recent runs from /workflows/{id}/runs', async ({
  adminPage,
}) => {
  await mockDependencies(adminPage);
  await mockMonitors(adminPage, [MONITOR_ACTIVE]);
  await mockMonitorRuns(adminPage, MONITOR_ACTIVE.id, SAMPLE_RUNS);

  await adminPage.goto('/object-monitors');
  await expect(adminPage.getByText(MONITOR_ACTIVE.name).first()).toBeVisible();

  // The active monitor is auto-selected (first in the registry).
  await expect(
    adminPage.getByRole('heading', { level: 2, name: MONITOR_ACTIVE.name }),
  ).toBeVisible();

  // Detail action buttons.
  await expect(adminPage.getByRole('button', { name: /^run monitor$/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^fire event$/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^pause monitor$/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^delete$/i })).toBeVisible();

  // Recent runs list from the mock — 2 runs render with their status
  // labels.
  await expect(adminPage.getByText(/^recent runs \(2\)$/i)).toBeVisible();
  await expect(adminPage.getByText('succeeded')).toBeVisible();
  await expect(adminPage.getByText('failed')).toBeVisible();
});

test('Detail panel: "Run monitor" POSTs /workflows/{id}/runs/manual with initiated_from = object-monitors', async ({
  adminPage,
}) => {
  await mockDependencies(adminPage);
  await mockMonitors(adminPage, [MONITOR_ACTIVE]);
  await mockMonitorRuns(adminPage, MONITOR_ACTIVE.id, []);

  const cap = captureRequests(adminPage, workflowManualRunUrl(MONITOR_ACTIVE.id));

  await adminPage.route(workflowManualRunUrl(MONITOR_ACTIVE.id), async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: {
        id: 'run-new-1',
        workflow_id: MONITOR_ACTIVE.id,
        trigger_type: 'manual',
        status: 'queued',
        started_by: 'user-1',
        current_step_id: null,
        context: { initiated_from: 'object-monitors' },
        error_message: null,
        started_at: E2E_NOW,
        finished_at: null,
      },
    });
  });

  await adminPage.goto('/object-monitors');
  await expect(adminPage.getByText(MONITOR_ACTIVE.name).first()).toBeVisible();

  await adminPage.getByRole('button', { name: /^run monitor$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.body).toMatchObject({ context: { initiated_from: 'object-monitors' } });
});

test('Detail panel: Delete confirms via window.confirm and DELETEs /workflows/{id} on accept', async ({
  adminPage,
}) => {
  await mockDependencies(adminPage);
  await mockMonitors(adminPage, [MONITOR_ACTIVE]);
  await mockMonitorRuns(adminPage, MONITOR_ACTIVE.id, []);

  const cap = captureRequests(adminPage, workflowDetailUrl(MONITOR_ACTIVE.id));

  await adminPage.route(workflowDetailUrl(MONITOR_ACTIVE.id), async (route: Route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    await route.fulfill({ status: 204, body: '' });
  });

  // Auto-accept the native confirm() prompt.
  adminPage.on('dialog', (dialog) => {
    expect(dialog.message()).toMatch(/delete this monitor/i);
    void dialog.accept();
  });

  await adminPage.goto('/object-monitors');
  await expect(adminPage.getByText(MONITOR_ACTIVE.name).first()).toBeVisible();

  await adminPage.getByRole('button', { name: /^delete$/i }).click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'DELETE').length).toBeGreaterThanOrEqual(1);
});

test('absent today: no Email / Webhook channel pickers in the create modal; cron is a plain text input (no visual picker)', async ({
  adminPage,
}) => {
  // Single regression guard for the wishlist controls the page does
  // not surface today. When any of these ships, the matching
  // assertion flips and forces an update.
  await mockDependencies(adminPage);
  await mockMonitors(adminPage, []);

  await adminPage.goto('/object-monitors');
  await adminPage.getByRole('button', { name: /^\+ monitor$/i }).click();

  const modal = adminPage.getByRole('dialog', { name: /create monitor/i });

  // 1. The notification step always emits `channels: ['in_app']` — no
  //    user-facing email / webhook channel selector exists.
  expect(await modal.getByLabel(/^email$/i).count()).toBe(0);
  expect(await modal.getByLabel(/^webhook$/i).count()).toBe(0);
  expect(await modal.getByRole('checkbox', { name: /email|webhook/i }).count()).toBe(0);
  expect(await modal.getByRole('combobox', { name: /^channels?$/i }).count()).toBe(0);

  // 2. Toggle to Cron — confirm the cron field is a plain `<input>`,
  //    not a multi-field picker (minute / hour / day comboboxes).
  await modal.getByRole('combobox', { name: 'Trigger', exact: true }).selectOption('cron');
  await expect(modal.getByRole('textbox', { name: 'Cron', exact: true })).toBeVisible();
  expect(await modal.getByRole('combobox', { name: /minute/i }).count()).toBe(0);
  expect(await modal.getByRole('combobox', { name: /hour/i }).count()).toBe(0);
  expect(await modal.getByRole('combobox', { name: /day/i }).count()).toBe(0);
  expect(await modal.getByRole('button', { name: /every (minute|hour|day)/i }).count()).toBe(0);
});

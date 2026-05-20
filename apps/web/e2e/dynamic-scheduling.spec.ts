import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { E2E_NOW } from './fixtures/mocks';
import { DynamicSchedulingPage } from './pages';

/**
 * E2E coverage for `/dynamic-scheduling`
 * (apps/web/src/routes/dynamic-scheduling/DynamicSchedulingPage.tsx).
 *
 * **Surface.** The page turns the ontology machinery queue into a
 * scheduling board: object-type selector + view mode (week / day /
 * agenda) + horizon-start date, a KPI strip ("Queue depth",
 * "Overdue", "Capacity load", "Next due"), a drag-and-drop board of
 * pucks across resource lanes, an inline validation/insights panel,
 * and a per-selected-puck aside with operational queue actions
 * (Start / Complete / Reset / Cancel).
 *
 * The page's "policies" lever is the *object-type selector* — the
 * scheduling surface is scoped to one ontology type at a time, and
 * each change refetches queue + insights + rules. "Impact on builds"
 * surfaces through (a) the KPI strip (queue depth, overdue count,
 * capacity load minutes, next-due timestamp); (b) the per-lane
 * utilization bars; and (c) the recommendation-rank chips.
 *
 * Endpoints exercised:
 *   - GET   /api/v1/ontology/types?page=1&per_page=100
 *   - GET   /api/v1/ontology/rules?object_type_id=...&per_page=100
 *   - GET   /api/v1/ontology/rules/insights?object_type_id=...
 *   - GET   /api/v1/ontology/rules/machinery/queue?object_type_id=...
 *   - PATCH /api/v1/ontology/rules/machinery/queue/{id}
 *
 * The `DynamicSchedulingPage` page object declares
 * `newPolicyButton` + `previewButton` locators — neither ships
 * today; pinned in the absent-today guard.
 */

test.use({
  freezeTime: true,
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
// Fixture data
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

interface QueueItemFixture {
  id: string;
  rule_id: string;
  rule_run_id: string;
  object_id: string;
  rule_name: string;
  rule_display_name: string;
  object_type_id: string;
  status: string;
  scheduled_for: string;
  priority_score: number;
  estimated_duration_minutes: number;
  required_capability: string | null;
  constraint_snapshot: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface QueueResponseFixture {
  object_type_id: string | null;
  data: QueueItemFixture[];
  recommendation: {
    generated_at: string;
    strategy: string;
    queue_depth: number;
    overdue_count: number;
    total_estimated_minutes: number;
    next_due_at: string | null;
    recommended_order: string[];
    capability_load: Array<{ capability: string; pending_count: number; total_estimated_minutes: number }>;
  };
}

interface InsightFixture {
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

interface RuleFixture {
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

const QUEUE_ITEM_INSPECT: QueueItemFixture = {
  id: 'queue-item-inspect',
  rule_id: 'rule-inspect',
  rule_run_id: 'rule-run-1',
  object_id: 'aircraft-1',
  rule_name: 'inspect_aircraft',
  rule_display_name: 'Schedule 100h inspection',
  object_type_id: AIRCRAFT.id,
  status: 'pending',
  scheduled_for: '2026-05-12T14:00:00.000Z',
  priority_score: 80,
  estimated_duration_minutes: 90,
  required_capability: 'aircraft-mechanic',
  constraint_snapshot: { hangar: 'EU-1' },
  created_by: 'user-1',
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
  started_at: null,
  completed_at: null,
};

const QUEUE_ITEM_REFUEL: QueueItemFixture = {
  id: 'queue-item-refuel',
  rule_id: 'rule-refuel',
  rule_run_id: 'rule-run-2',
  object_id: 'aircraft-2',
  rule_name: 'refuel_aircraft',
  rule_display_name: 'Refuel low-fuel aircraft',
  object_type_id: AIRCRAFT.id,
  status: 'in_progress',
  scheduled_for: '2026-05-13T09:30:00.000Z',
  priority_score: 60,
  estimated_duration_minutes: 45,
  required_capability: 'fuel-ops',
  constraint_snapshot: {},
  created_by: 'user-1',
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
  started_at: E2E_NOW,
  completed_at: null,
};

const QUEUE_AIRCRAFT: QueueResponseFixture = {
  object_type_id: AIRCRAFT.id,
  data: [QUEUE_ITEM_INSPECT, QUEUE_ITEM_REFUEL],
  recommendation: {
    generated_at: E2E_NOW,
    strategy: 'priority-first',
    queue_depth: 4,
    overdue_count: 1,
    total_estimated_minutes: 240,
    next_due_at: '2026-05-12T14:00:00.000Z',
    recommended_order: [QUEUE_ITEM_INSPECT.id, QUEUE_ITEM_REFUEL.id],
    capability_load: [
      { capability: 'aircraft-mechanic', pending_count: 3, total_estimated_minutes: 180 },
      { capability: 'fuel-ops', pending_count: 1, total_estimated_minutes: 60 },
    ],
  },
};

const QUEUE_VEHICLE: QueueResponseFixture = {
  object_type_id: VEHICLE.id,
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
};

const INSIGHT_AIRCRAFT: InsightFixture = {
  rule_id: 'rule-inspect',
  name: 'inspect_aircraft',
  display_name: 'Schedule 100h inspection',
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

const RULE_AIRCRAFT: RuleFixture = {
  id: 'rule-inspect',
  name: 'inspect_aircraft',
  display_name: 'Schedule 100h inspection',
  description: '',
  object_type_id: AIRCRAFT.id,
  evaluation_mode: 'automatic',
  trigger_spec: {},
  effect_spec: {},
  owner_id: 'user-1',
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
};

// ---------------------------------------------------------------------------
// Mock state + route handlers
// ---------------------------------------------------------------------------

interface SchedulingMocks {
  objectTypes: ObjectTypeFixture[];
  queueByType: Record<string, QueueResponseFixture>;
  insightsByType: Record<string, InsightFixture[]>;
  rulesByType: Record<string, RuleFixture[]>;
}

function defaultMocks(): SchedulingMocks {
  return {
    objectTypes: [AIRCRAFT, VEHICLE],
    queueByType: { [AIRCRAFT.id]: QUEUE_AIRCRAFT, [VEHICLE.id]: QUEUE_VEHICLE },
    insightsByType: { [AIRCRAFT.id]: [INSIGHT_AIRCRAFT], [VEHICLE.id]: [] },
    rulesByType: { [AIRCRAFT.id]: [RULE_AIRCRAFT], [VEHICLE.id]: [] },
  };
}

async function installSchedulingMocks(page: Page, mocks: SchedulingMocks): Promise<void> {
  // Patch handler for /ontology/rules/machinery/queue/{id} — registered
  // first so subsequent (more general) handlers don't shadow it.
  await page.route(
    /\/api\/v1\/ontology\/rules\/machinery\/queue\/[^/?#]+(?:$|\?)/,
    async (route: Route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      const id = /\/queue\/([^/?#]+)/.exec(route.request().url())?.[1] ?? '';
      const body = (route.request().postDataJSON() ?? {}) as { status?: string };
      // Echo the change back in the same shape `MachineryQueueItem`
      // expects.
      const stub = { ...QUEUE_ITEM_INSPECT, id, status: body.status ?? 'pending', updated_at: E2E_NOW };
      await route.fulfill({ json: stub });
    },
  );

  await page.route(
    /\/api\/v1\/ontology\/rules\/machinery\/queue(\?|$)/,
    async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const url = new URL(route.request().url());
      const filter = url.searchParams.get('object_type_id') ?? '';
      const queue = mocks.queueByType[filter] ?? QUEUE_VEHICLE;
      await route.fulfill({ json: queue });
    },
  );

  await page.route(
    /\/api\/v1\/ontology\/rules\/insights(\?|$)/,
    async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const url = new URL(route.request().url());
      const filter = url.searchParams.get('object_type_id') ?? '';
      await route.fulfill({
        json: { object_type_id: filter || null, data: mocks.insightsByType[filter] ?? [] },
      });
    },
  );

  await page.route(/\/api\/v1\/ontology\/rules(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const filter = url.searchParams.get('object_type_id') ?? '';
    const rules = mocks.rulesByType[filter] ?? [];
    await route.fulfill({
      json: { data: rules, total: rules.length, page: 1, per_page: 100 },
    });
  });

  await page.route(/\/api\/v1\/ontology\/types(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: mocks.objectTypes, total: mocks.objectTypes.length, page: 1, per_page: 100 },
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renders the hero, control bar, KPI strip, and scheduling board with the mocked queue', async ({
  adminPage,
}) => {
  await installSchedulingMocks(adminPage, defaultMocks());
  const page = new DynamicSchedulingPage(adminPage);
  await page.goto();
  await page.expectLoaded();

  // Hero copy.
  await expect(adminPage.getByText(/^Dynamic scheduling$/)).toBeVisible();
  await expect(
    adminPage.getByRole('heading', {
      level: 1,
      name: /Schedule ontology work across resource lanes/i,
    }),
  ).toBeVisible();

  // Object-type selector auto-selects the first mocked type.
  const typeSelect = adminPage.getByLabel(/Schedule object type/i);
  await expect(typeSelect).toBeVisible();
  await expect(typeSelect).toHaveValue(AIRCRAFT.id);

  // View toggles + horizon controls. The first button in the View
  // group inherits the wrapping <label>'s textContent as its
  // accessible name ("View day agenda"); the others get their own
  // visible text. Match by visible text directly to side-step the
  // accessibility-name quirk.
  for (const view of ['week', 'day', 'agenda']) {
    await expect(adminPage.getByText(new RegExp(`^${view}$`, 'i')).first()).toBeVisible();
  }
  await expect(adminPage.getByRole('button', { name: /^Previous$/ })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^Today$/ })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^Next$/ })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^Refresh queue$/ })).toBeVisible();

  // KPI strip values come from the mocked recommendation.
  const kpiStrip = adminPage.locator('article.of-panel', {
    has: adminPage.getByText(/^Queue depth$/),
  });
  await expect(kpiStrip.getByText(/^4$/)).toBeVisible();
  const overdueCard = adminPage.locator('article.of-panel', {
    has: adminPage.getByText(/^Overdue$/),
  });
  await expect(overdueCard.getByText(/^1$/)).toBeVisible();
  const loadCard = adminPage.locator('article.of-panel', {
    has: adminPage.getByText(/^Capacity load$/),
  });
  await expect(loadCard.getByText(/^240m$/)).toBeVisible();

  // Scheduling board header + capability chips reflect the load
  // breakdown.
  await expect(adminPage.getByText(/^Scheduling board$/)).toBeVisible();
  await expect(adminPage.getByText(/Aircraft-mechanic 3/i)).toBeVisible();
  await expect(adminPage.getByText(/Fuel-ops 1/i)).toBeVisible();

  // Both queue items render as pucks (rendered as button elements with
  // the rule_display_name as accessible text). Match the puck in the
  // board, not the optional aside copy.
  await expect(
    adminPage.getByRole('button', { name: /Schedule 100h inspection/i }).first(),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('button', { name: /Refuel low-fuel aircraft/i }).first(),
  ).toBeVisible();
});

test('switching the Schedule object type re-fetches queue / insights / rules with the new filter', async ({
  adminPage,
}) => {
  await installSchedulingMocks(adminPage, defaultMocks());
  const queueCalls = captureRequests(
    adminPage,
    /\/api\/v1\/ontology\/rules\/machinery\/queue(\?|$)/,
  );
  const insightCalls = captureRequests(
    adminPage,
    /\/api\/v1\/ontology\/rules\/insights(\?|$)/,
  );
  const ruleCalls = captureRequests(adminPage, /\/api\/v1\/ontology\/rules(\?|$)/);

  const page = new DynamicSchedulingPage(adminPage);
  await page.goto();
  // Wait for the initial fetch to settle.
  await expect(
    adminPage.getByRole('button', { name: /Schedule 100h inspection/i }).first(),
  ).toBeVisible();
  const baseline = {
    queue: queueCalls.count(),
    insights: insightCalls.count(),
    rules: ruleCalls.count(),
  };

  // Switching the selector triggers `refreshSurface(<new id>)`.
  await adminPage.getByLabel(/Schedule object type/i).selectOption(VEHICLE.id);

  await expect.poll(() => queueCalls.count()).toBeGreaterThan(baseline.queue);
  await expect.poll(() => insightCalls.count()).toBeGreaterThan(baseline.insights);
  await expect.poll(() => ruleCalls.count()).toBeGreaterThan(baseline.rules);

  for (const cap of [queueCalls, insightCalls, ruleCalls]) {
    const last = cap.last();
    expect(last?.method).toBe('GET');
    expect(last?.url).toMatch(/[?&]object_type_id=object-type-vehicle\b/);
  }

  // The Vehicle queue is empty in the mocks, so the board switches to
  // its empty-state copy and the KPI strip drops to zero.
  await expect(
    adminPage.getByText(/No scheduling queue items are available yet/i),
  ).toBeVisible();
  const queueDepth = adminPage.locator('article.of-panel', {
    has: adminPage.getByText(/^Queue depth$/),
  });
  await expect(queueDepth.getByText(/^0$/)).toBeVisible();
});

test('switching to the Agenda view swaps the timeline grid for a per-item list', async ({
  adminPage,
}) => {
  await installSchedulingMocks(adminPage, defaultMocks());
  const page = new DynamicSchedulingPage(adminPage);
  await page.goto();

  // Pre-state: week view renders the drop-zone grid — each segment
  // exposes a `role="button"` with the "Drop {capability} puck at
  // {time}" aria-label. ("Resource rows" text alone also appears as
  // a Core-concepts card up in the hero, so we anchor on the
  // drop-zone aria-label which only ships in week / day view.)
  await expect(adminPage.getByRole('button', { name: /^Drop .* puck at/i }).first()).toBeVisible();

  await adminPage.getByRole('button', { name: /^agenda$/i }).click();

  // Drop zones vanish — agenda mode renders a flat list of articles,
  // not the lane grid.
  await expect(adminPage.getByRole('button', { name: /^Drop .* puck at/i })).toHaveCount(0);

  // Each queue item renders as an agenda row with the rule display
  // name button + the status / capability / duration chips. The
  // "Rank 1" chip surfaces from the recommendation order on the
  // first item.
  await expect(
    adminPage.getByRole('button', { name: /Schedule 100h inspection/i }).first(),
  ).toBeVisible();
  await expect(adminPage.getByText(/^Rank 1$/)).toBeVisible();
  await expect(adminPage.getByText(/^in progress$/i)).toBeVisible();
  await expect(adminPage.getByText(/^pending$/i).first()).toBeVisible();
});

test('selecting a puck reveals the selected-puck aside with validation rules + operational actions', async ({
  adminPage,
}) => {
  await installSchedulingMocks(adminPage, defaultMocks());
  const page = new DynamicSchedulingPage(adminPage);
  await page.goto();

  // refreshSurface auto-selects the first queue item, so the aside is
  // already populated. Pin every actionable button.
  await expect(adminPage.getByText(/^Selected puck$/)).toBeVisible();
  await expect(adminPage.getByText(/^Validation rules$/i)).toBeVisible();
  // No conflicts on the seed data — the "No overlap" success
  // validation surfaces.
  await expect(adminPage.getByText(/^No overlap$/i)).toBeVisible();
  // Constraint metadata is attached → the info validation surfaces.
  await expect(adminPage.getByText(/^Constraint snapshot$/i)).toBeVisible();

  // Switch agenda mode + select the second puck. Verify the aside
  // updates to that item's name.
  await adminPage.getByRole('button', { name: /^agenda$/i }).click();
  await adminPage.getByRole('button', { name: /Refuel low-fuel aircraft/i }).first().click();
  const aside = adminPage.locator('section.of-panel', {
    has: adminPage.getByText(/^Selected puck$/),
  });
  await expect(aside.getByText(/Refuel low-fuel aircraft/i)).toBeVisible();
  await expect(aside.getByText(/^Fuel-ops$/)).toBeVisible();

  // Operational-action buttons are wired up.
  for (const action of ['Start', 'Complete', 'Reset', 'Cancel']) {
    await expect(aside.getByRole('button', { name: new RegExp(`^${action}$`) })).toBeVisible();
  }
});

test('"Start" PATCHes /ontology/rules/machinery/queue/{id} with status=in_progress and refetches the queue', async ({
  adminPage,
}) => {
  await installSchedulingMocks(adminPage, defaultMocks());
  const patchCalls = captureRequests(
    adminPage,
    /\/api\/v1\/ontology\/rules\/machinery\/queue\/[^/?#]+(?:$|\?)/,
  );
  const queueCalls = captureRequests(
    adminPage,
    /\/api\/v1\/ontology\/rules\/machinery\/queue(\?|$)/,
  );
  const page = new DynamicSchedulingPage(adminPage);
  await page.goto();
  await expect(
    adminPage.getByRole('button', { name: /Schedule 100h inspection/i }).first(),
  ).toBeVisible();
  const queueBaseline = queueCalls.count();

  await adminPage.getByRole('button', { name: /^agenda$/i }).click();
  // Force the inspection row to be the selected puck so the aside's
  // operational actions target it.
  await adminPage.getByRole('button', { name: /Schedule 100h inspection/i }).first().click();

  const aside = adminPage.locator('section.of-panel', {
    has: adminPage.getByText(/^Selected puck$/),
  });
  await aside.getByRole('button', { name: /^Start$/ }).click();

  // The PATCH fires with the expected body.
  await expect.poll(() => patchCalls.count()).toBeGreaterThanOrEqual(1);
  const call = patchCalls.last();
  expect(call?.method).toBe('PATCH');
  expect(call?.url).toMatch(new RegExp(`/queue/${QUEUE_ITEM_INSPECT.id}$`));
  expect(call?.body).toEqual({ status: 'in_progress' });

  // After the PATCH, transitionItemStatus calls refreshSurface which
  // re-runs the queue GET — verify the additional fetch.
  await expect.poll(() => queueCalls.count()).toBeGreaterThan(queueBaseline);
  expect(queueCalls.last()?.method).toBe('GET');
});

test('absent today: no "New policy" / "Simulate" CTAs in the DynamicSchedulingPage UI', async ({
  adminPage,
}) => {
  // Regression guard. The DynamicSchedulingPage page object declares
  // `newPolicyButton` + `previewButton` locators that match nothing
  // in today's DOM — the shipped surface scopes scheduling through
  // the object-type selector + view toggles + operational queue
  // transitions, not a policy editor. When a real policy-authoring
  // flow lands, these absent-today checks flip and force the spec to
  // grow real coverage for it.
  await installSchedulingMocks(adminPage, defaultMocks());
  const page = new DynamicSchedulingPage(adminPage);
  await page.goto();
  await page.expectLoaded();
  await expect(adminPage.getByText(/^Scheduling board$/)).toBeVisible();

  expect(
    await adminPage.getByRole('button', { name: /^new policy$|^create policy$/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /^simulate$|^preview$/i }).count(),
  ).toBe(0);
});

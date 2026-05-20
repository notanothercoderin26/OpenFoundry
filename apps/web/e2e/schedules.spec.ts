import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/schedules/new` and `/schedules/:rid`
 * (apps/web/src/routes/schedules/{NewSchedulePage,ScheduleDetailPage}.tsx).
 *
 * **Reality vs roadmap.** The shipped pages are Foundry-parity build
 * schedules — not generic cron jobs:
 *
 *   - `NewSchedulePage` is a single-screen form with Name + Project RID
 *     + Description + Folder + Branch + Build strategy + Scope/Run-as +
 *     a "Target dataset sets" repeater + a Trigger panel (Time / Dataset
 *     event). Time trigger exposes a free-text `Cron` input and a
 *     free-text `Time zone` input. Submit is `Create schedule`.
 *   - `ScheduleDetailPage` exposes `data-testid` hooks already
 *     (`schedule-detail-page`, `schedule-run-now`, `schedule-pause`,
 *     `schedule-resume`) plus four tabs: `Overview`, `Run history`,
 *     `Versions`, `Raw JSON`. Pause / Resume go through dedicated
 *     `:pause` / `:resume` endpoints; Delete prompts `window.confirm`
 *     and navigates back to `/build-schedules`.
 *
 * Mismatches with the original task ask, pinned in the final guard test:
 *   - NO "next executions" preview. The right-hand panel shows lineage-
 *     resolved build targets + best-practice guardrails + a raw JSON
 *     dump of the trigger/target.
 *   - NO inline cron/target editor on the detail page. `patchSchedule`
 *     exists in the API client but no UI calls it.
 *   - The timezone is a free-text `<input>`, NOT a true picker
 *     (combobox/listbox).
 *
 * Endpoints exercised:
 *   - GET    /api/v1/lineage                                                   (mount)
 *   - GET    /api/v1/data-integration/v1/schedules?files=…                     (overlap probe)
 *   - GET    /api/v1/data-integration/v1/schedules/{rid}                       (detail mount)
 *   - GET    /api/v1/data-integration/v1/schedules/{rid}/runs?limit=50
 *   - GET    /api/v1/data-integration/v1/schedules/{rid}/versions?limit=20
 *   - POST   /api/v1/data-integration/v1/schedules                             (create)
 *   - POST   /api/v1/data-integration/v1/schedules/{rid}:pause
 *   - POST   /api/v1/data-integration/v1/schedules/{rid}:resume
 *   - DELETE /api/v1/data-integration/v1/schedules/{rid}
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Failed to load/i,
    ],
  },
});

const E2E_NOW = '2026-05-11T00:00:00Z';
const SCHEDULES_BASE = '/api/v1/data-integration/v1/schedules';

const LINEAGE = /\/api\/v1\/lineage(\?|$)/;
const SCHEDULES_LIST_OR_CREATE = new RegExp(
  `^https?://[^/]+${SCHEDULES_BASE.replace(/\//g, '\\/')}(\\?|$)`,
);
const SCHEDULE_DETAIL = new RegExp(
  `${SCHEDULES_BASE.replace(/\//g, '\\/')}/[^/?#:]+(?:\\?|$)`,
);
const SCHEDULE_RUNS = new RegExp(
  `${SCHEDULES_BASE.replace(/\//g, '\\/')}/[^/?#]+/runs(\\?|$)`,
);
const SCHEDULE_VERSIONS = new RegExp(
  `${SCHEDULES_BASE.replace(/\//g, '\\/')}/[^/?#]+/versions(\\?|$)`,
);
const SCHEDULE_PAUSE = new RegExp(
  `${SCHEDULES_BASE.replace(/\//g, '\\/')}/[^/?#]+:pause(\\?|$)`,
);
const SCHEDULE_RESUME = new RegExp(
  `${SCHEDULES_BASE.replace(/\//g, '\\/')}/[^/?#]+:resume(\\?|$)`,
);

interface ScheduleFixture {
  id: string;
  rid: string;
  project_rid: string;
  folder_rid: string | null;
  name: string;
  description: string;
  trigger: {
    kind: { time: { cron: string; time_zone: string; flavor: string } };
  };
  target: { kind: Record<string, unknown> };
  target_rids: string[];
  branch: string;
  build_strategy: string;
  paused: boolean;
  paused_reason: string | null;
  paused_at: string | null;
  auto_pause_exempt: boolean;
  pending_re_run: boolean;
  active_run_id: string | null;
  version: number;
  created_by: string;
  owner: string;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  scope_kind: 'USER' | 'PROJECT_SCOPED';
  project_scope_rids: string[];
  run_as_user_id: string | null;
  service_principal_id: string | null;
  run_as_identity: string | null;
  last_updated_by: string;
}

function makeSchedule(overrides: Partial<ScheduleFixture> = {}): ScheduleFixture {
  return {
    id: 'schedule-1',
    rid: 'ri.foundry.main.schedule.demo',
    project_rid: 'ri.foundry.main.project.default',
    folder_rid: null,
    name: 'Demo schedule',
    description: '',
    trigger: {
      kind: { time: { cron: '0 * * * *', time_zone: 'UTC', flavor: 'UNIX_5' } },
    },
    target: {
      kind: { single: { dataset_rid: 'ri.foundry.main.dataset.demo' } },
    },
    target_rids: ['ri.foundry.main.dataset.demo'],
    branch: 'master',
    build_strategy: 'STALE_ONLY',
    paused: false,
    paused_reason: null,
    paused_at: null,
    auto_pause_exempt: false,
    pending_re_run: false,
    active_run_id: null,
    version: 1,
    created_by: 'user-1',
    owner: 'user-1',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    last_run_at: null,
    scope_kind: 'USER',
    project_scope_rids: [],
    run_as_user_id: null,
    service_principal_id: null,
    run_as_identity: null,
    last_updated_by: 'user-1',
    ...overrides,
  };
}

interface ScheduleRunFixture {
  id: string;
  rid: string;
  schedule_id: string;
  outcome: 'SUCCEEDED' | 'IGNORED' | 'FAILED';
  build_rid: string | null;
  failure_reason: string | null;
  triggered_at: string;
  finished_at: string | null;
  trigger_snapshot: Record<string, string>;
  trigger_type: string;
  diagnostics: Record<string, string>;
  schedule_version: number;
}

function makeRun(overrides: Partial<ScheduleRunFixture> = {}): ScheduleRunFixture {
  return {
    id: 'run-1',
    rid: 'ri.foundry.main.schedule-run.1',
    schedule_id: 'schedule-1',
    outcome: 'SUCCEEDED',
    build_rid: 'ri.foundry.main.build.42',
    failure_reason: null,
    triggered_at: '2026-05-10T10:00:00Z',
    finished_at: '2026-05-10T10:00:30Z',
    trigger_snapshot: {},
    trigger_type: 'TIME',
    diagnostics: {},
    schedule_version: 1,
    ...overrides,
  };
}

interface ScheduleVersionFixture {
  id: string;
  schedule_id: string;
  version: number;
  name: string;
  description: string;
  trigger_json: unknown;
  target_json: unknown;
  edited_by: string;
  edited_at: string;
  comment: string;
}

function makeVersion(overrides: Partial<ScheduleVersionFixture> = {}): ScheduleVersionFixture {
  return {
    id: 'version-1',
    schedule_id: 'schedule-1',
    version: 1,
    name: 'Demo schedule',
    description: '',
    trigger_json: {},
    target_json: {},
    edited_by: 'user-1',
    edited_at: E2E_NOW,
    comment: 'Initial commit',
    ...overrides,
  };
}

interface DetailMockState {
  schedule: ScheduleFixture;
  runs: ScheduleRunFixture[];
  versions: ScheduleVersionFixture[];
}

/**
 * Wires up GET for an existing schedule + its runs + versions, plus pause /
 * resume / delete. Stateful so action handlers reflect on the follow-up
 * `refresh()` GET. Routes that overlap on path are split by suffix order,
 * so register pause/resume/runs/versions BEFORE the bare detail handler.
 */
async function mockScheduleDetail(
  page: Page,
  initial: {
    schedule: ScheduleFixture;
    runs?: ScheduleRunFixture[];
    versions?: ScheduleVersionFixture[];
  },
): Promise<DetailMockState> {
  const state: DetailMockState = {
    schedule: { ...initial.schedule },
    runs: (initial.runs ?? []).slice(),
    versions: (initial.versions ?? []).slice(),
  };

  await page.route(SCHEDULE_PAUSE, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    state.schedule = { ...state.schedule, paused: true, paused_reason: 'Manually paused' };
    await route.fulfill({ json: state.schedule });
  });

  await page.route(SCHEDULE_RESUME, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    state.schedule = { ...state.schedule, paused: false, paused_reason: null };
    await route.fulfill({ json: state.schedule });
  });

  await page.route(SCHEDULE_RUNS, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        schedule_rid: state.schedule.rid,
        data: state.runs,
        total: state.runs.length,
      },
    });
  });

  await page.route(SCHEDULE_VERSIONS, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        schedule_rid: state.schedule.rid,
        current_version: state.schedule.version,
        data: state.versions,
      },
    });
  });

  await page.route(SCHEDULE_DETAIL, async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();
    // Don't swallow the per-rid suffix routes registered above (Playwright
    // dispatches most-recent-first, so this is fine if those win first).
    if (/[:]/.test(url.split('/').pop() ?? '') || /\/(runs|versions)(\?|$)/.test(url)) {
      return route.fallback();
    }
    if (method === 'GET') {
      await route.fulfill({ json: state.schedule });
      return;
    }
    if (method === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    return route.fallback();
  });

  return state;
}

async function mockLineageEmpty(page: Page): Promise<void> {
  await page.route(LINEAGE, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { nodes: [], edges: [] } });
  });
}

// ===========================================================================
// /schedules/new
// ===========================================================================

test('NewSchedulePage: renders the header and the canonical Name / Project / Cron / Time zone / Target inputs', async ({
  adminPage,
}) => {
  await mockLineageEmpty(adminPage);
  await adminPage.goto('/schedules/new');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^new schedule$/i }),
  ).toBeVisible();

  // The implicit <label><span>Name</span><input/></label> wrapping gives each
  // input an accessible name we can target via getByLabel.
  await expect(adminPage.getByLabel(/^Name$/)).toHaveValue('New build schedule');
  await expect(adminPage.getByLabel(/^Project RID$/)).toHaveValue(
    'ri.foundry.main.project.default',
  );
  await expect(adminPage.getByLabel(/^Cron$/)).toHaveValue('0 * * * *');
  await expect(adminPage.getByLabel(/^Time zone$/)).toHaveValue('UTC');
  await expect(adminPage.getByLabel(/^Dataset RID$/)).toBeVisible();

  // Submit is disabled until at least one target resolves.
  await expect(
    adminPage.getByRole('button', { name: /^create schedule$/i }),
  ).toBeDisabled();
});

test('NewSchedulePage: switching the trigger to "Dataset event" hides cron/timezone and shows the event fields', async ({
  adminPage,
}) => {
  await mockLineageEmpty(adminPage);
  await adminPage.goto('/schedules/new');

  // Cron + timezone are visible while trigger is Time.
  await expect(adminPage.getByLabel(/^Cron$/)).toBeVisible();
  await expect(adminPage.getByLabel(/^Time zone$/)).toBeVisible();

  // The trigger select is unlabeled in the DOM — locate it by its option
  // text (it's the only select with a "Dataset event" option on the page).
  const triggerSelect = adminPage.locator('select').filter({ hasText: /Dataset event/i });
  await triggerSelect.selectOption('event');

  // Time-specific fields collapse, event-specific fields surface.
  await expect(adminPage.getByLabel(/^Cron$/)).toHaveCount(0);
  await expect(adminPage.getByLabel(/^Time zone$/)).toHaveCount(0);
  await expect(adminPage.getByLabel(/^Event$/)).toBeVisible();
  await expect(adminPage.getByLabel(/^Event dataset RID$/)).toBeVisible();
});

test('NewSchedulePage: "Create schedule" POSTs the form payload and navigates to /schedules/:rid', async ({
  adminPage,
}) => {
  await mockLineageEmpty(adminPage);
  const cap = captureRequests(adminPage, SCHEDULES_LIST_OR_CREATE);

  await adminPage.route(SCHEDULES_LIST_OR_CREATE, async (route: Route) => {
    const method = route.request().method();
    if (method === 'POST') {
      await route.fulfill({
        status: 201,
        json: makeSchedule({
          rid: 'ri.foundry.main.schedule.created',
          name: 'Generated schedule',
        }),
      });
      return;
    }
    if (method === 'GET') {
      // Overlap probe — the page calls this after the target preview
      // changes. Return an empty envelope.
      await route.fulfill({ json: { data: [], total: 0 } });
      return;
    }
    return route.fallback();
  });

  // Also handle the detail GET / runs / versions for the post-create
  // navigation so the destination page doesn't crash.
  await mockScheduleDetail(adminPage, {
    schedule: makeSchedule({
      rid: 'ri.foundry.main.schedule.created',
      name: 'Generated schedule',
    }),
  });

  await adminPage.goto('/schedules/new');

  // Filling the dataset RID with a value not in the lineage graph still
  // resolves as a "manual target" under the default `single` strategy,
  // which is enough to flip canSubmit from false to true.
  await adminPage
    .getByLabel(/^Dataset RID$/)
    .fill('ri.foundry.main.dataset.target');

  const submit = adminPage.getByRole('button', { name: /^create schedule$/i });
  await expect(submit).toBeEnabled();
  await submit.click();

  // POST landed with the expected nested trigger + project fields.
  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);
  const post = cap.calls.find((c) => c.method === 'POST');
  const body = post?.body as Record<string, unknown> | undefined;
  expect(body).toMatchObject({
    project_rid: 'ri.foundry.main.project.default',
    name: 'New build schedule',
    branch: 'master',
    build_strategy: 'STALE_ONLY',
    trigger: { kind: { time: { cron: '0 * * * *', time_zone: 'UTC' } } },
  });

  // The page navigates to /schedules/<encoded-rid> on success.
  await expect(adminPage).toHaveURL(
    /\/schedules\/ri\.foundry\.main\.schedule\.created/,
  );
});

// ===========================================================================
// /schedules/:rid
// ===========================================================================

const ACTIVE_SCHEDULE = makeSchedule({
  rid: 'ri.foundry.main.schedule.demo',
  name: 'Nightly orders refresh',
  description: 'Refreshes the orders pipeline every hour on the hour.',
});

test('ScheduleDetailPage: renders the header, four tabs, and the action buttons', async ({
  adminPage,
}) => {
  await mockScheduleDetail(adminPage, {
    schedule: ACTIVE_SCHEDULE,
    runs: [makeRun()],
    versions: [makeVersion()],
  });

  await adminPage.goto(`/schedules/${encodeURIComponent(ACTIVE_SCHEDULE.rid)}`);

  // Page is keyed off the existing data-testid hook so we don't depend on
  // the dynamic schedule name in the smoke assertion.
  await expect(adminPage.getByTestId('schedule-detail-page')).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { level: 1, name: ACTIVE_SCHEDULE.name }),
  ).toBeVisible();

  // All four tabs render under the "Schedule detail tabs" tablist.
  const tablist = adminPage.getByRole('tablist', { name: /schedule detail tabs/i });
  for (const label of ['Overview', 'Run history', 'Versions', 'Raw JSON']) {
    await expect(tablist.getByRole('tab', { name: label })).toBeVisible();
  }

  // Pre-baked data-testid hooks for the top-bar actions.
  await expect(adminPage.getByTestId('schedule-run-now')).toBeVisible();
  await expect(adminPage.getByTestId('schedule-pause')).toBeVisible();
});

test('ScheduleDetailPage: "Pause" POSTs :pause and the badge flips to Paused', async ({
  adminPage,
}) => {
  const state = await mockScheduleDetail(adminPage, {
    schedule: { ...ACTIVE_SCHEDULE, paused: false },
  });
  const cap = captureRequests(adminPage, SCHEDULE_PAUSE);

  await adminPage.goto(`/schedules/${encodeURIComponent(ACTIVE_SCHEDULE.rid)}`);
  await expect(adminPage.getByTestId('schedule-pause')).toBeVisible();

  await adminPage.getByTestId('schedule-pause').click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(1);
  const post = cap.calls.find((c) => c.method === 'POST');
  expect(post?.url).toMatch(/:pause(\?|$)/);

  // The state mutated through the route handler — the next GET surfaces
  // paused: true, which flips the top-bar action from Pause to Resume.
  await expect(adminPage.getByTestId('schedule-resume')).toBeVisible();
  // (And the stateful mock confirms our handler wired everything correctly.)
  expect(state.schedule.paused).toBe(true);
});

test('ScheduleDetailPage: "Resume" (rendered when paused) POSTs :resume', async ({
  adminPage,
}) => {
  await mockScheduleDetail(adminPage, {
    schedule: { ...ACTIVE_SCHEDULE, paused: true, paused_reason: 'Manually paused' },
  });
  const cap = captureRequests(adminPage, SCHEDULE_RESUME);

  await adminPage.goto(`/schedules/${encodeURIComponent(ACTIVE_SCHEDULE.rid)}`);
  await expect(adminPage.getByTestId('schedule-resume')).toBeVisible();
  // The Pause button is hidden while the schedule is paused.
  await expect(adminPage.getByTestId('schedule-pause')).toHaveCount(0);

  await adminPage.getByTestId('schedule-resume').click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.url).toMatch(/:resume(\?|$)/);
});

test('ScheduleDetailPage: "Delete" via window.confirm DELETEs and navigates to /build-schedules', async ({
  adminPage,
}) => {
  await mockScheduleDetail(adminPage, { schedule: ACTIVE_SCHEDULE });
  const cap = captureRequests(adminPage, SCHEDULE_DETAIL);

  adminPage.on('dialog', (dialog) => void dialog.accept());

  await adminPage.goto(`/schedules/${encodeURIComponent(ACTIVE_SCHEDULE.rid)}`);

  // The Delete button has no `data-testid`; locate by accessible name.
  await adminPage.getByRole('button', { name: /^Delete$/ }).first().click();

  await expect
    .poll(() => cap.calls.some((c) => c.method === 'DELETE'))
    .toBe(true);

  await expect(adminPage).toHaveURL(/\/build-schedules$/);
});

test('ScheduleDetailPage: "Run history" tab lists the mocked runs', async ({ adminPage }) => {
  await mockScheduleDetail(adminPage, {
    schedule: ACTIVE_SCHEDULE,
    runs: [
      makeRun({ id: 'run-ok', outcome: 'SUCCEEDED', build_rid: 'ri.foundry.main.build.1' }),
      makeRun({
        id: 'run-fail',
        outcome: 'FAILED',
        failure_reason: 'Transient executor failure',
        build_rid: null,
        triggered_at: '2026-05-09T22:00:00Z',
      }),
    ],
  });

  await adminPage.goto(`/schedules/${encodeURIComponent(ACTIVE_SCHEDULE.rid)}`);

  await adminPage.getByRole('tab', { name: /^Run history$/ }).click();
  await expect(adminPage.getByRole('tab', { name: /^Run history$/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // Header summarises run count and the table shows both runs' outcomes.
  await expect(adminPage.getByText(/^2 run\(s\)$/)).toBeVisible();
  await expect(adminPage.getByRole('cell', { name: /SUCCEEDED/ })).toBeVisible();
  await expect(adminPage.getByRole('cell', { name: /FAILED/ })).toBeVisible();
  await expect(adminPage.getByText(/Transient executor failure/)).toBeVisible();
});

test('ScheduleDetailPage: "Versions" tab lists the mocked version history', async ({
  adminPage,
}) => {
  await mockScheduleDetail(adminPage, {
    schedule: ACTIVE_SCHEDULE,
    versions: [
      makeVersion({ id: 'v-2', version: 2, comment: 'Adjust cron to 5-minute cadence' }),
      makeVersion({ id: 'v-1', version: 1, comment: 'Initial commit' }),
    ],
  });

  await adminPage.goto(`/schedules/${encodeURIComponent(ACTIVE_SCHEDULE.rid)}`);

  await adminPage.getByRole('tab', { name: /^Versions$/ }).click();
  await expect(adminPage.getByText(/^2 version\(s\)$/)).toBeVisible();
  await expect(adminPage.getByRole('cell', { name: 'v1' })).toBeVisible();
  await expect(adminPage.getByRole('cell', { name: 'v2' })).toBeVisible();
  await expect(adminPage.getByText(/Adjust cron to 5-minute cadence/)).toBeVisible();
});

test('absent today: cron next-execution preview, inline cron/target edit on detail page, true timezone picker', async ({
  adminPage,
}) => {
  // Single regression guard for the roadmap surfaces the task asks for that
  // do not ship today.

  // ── /schedules/new ───────────────────────────────────────────────────────
  await mockLineageEmpty(adminPage);
  await adminPage.goto('/schedules/new');

  // 1. No "next executions" preview list. The right-hand aside is the
  //    "Definition preview" + lineage targets + guardrails, NOT a cron
  //    runner.
  expect(await adminPage.getByText(/next (run|execution|fires|trigger)/i).count()).toBe(0);
  expect(
    await adminPage.getByRole('heading', { name: /next \d+ (runs|executions|fires)/i }).count(),
  ).toBe(0);

  // 2. Time zone is a free-text <input>, not a combobox/listbox picker.
  const tz = adminPage.getByLabel(/^Time zone$/);
  await expect(tz).toBeVisible();
  expect(await tz.evaluate((node) => node.tagName)).toBe('INPUT');
  expect(await tz.getAttribute('list')).toBeNull();

  // ── /schedules/:rid ──────────────────────────────────────────────────────
  await mockScheduleDetail(adminPage, { schedule: ACTIVE_SCHEDULE });
  await adminPage.goto(`/schedules/${encodeURIComponent(ACTIVE_SCHEDULE.rid)}`);

  // 3. No inline edit of cron/target on the detail page. Specifically: no
  //    "Edit schedule" / "Edit cron" / "Edit target" button anywhere on
  //    the page.
  expect(
    await adminPage.getByRole('button', { name: /^edit( schedule| cron| target)?$/i }).count(),
  ).toBe(0);
  // And the Overview tab doesn't expose a cron input that could be saved.
  expect(await adminPage.getByLabel(/^Cron$/).count()).toBe(0);
});

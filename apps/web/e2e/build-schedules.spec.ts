import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/build-schedules` and `/build-schedules/sweep`
 * (apps/web/src/routes/build-schedules/{BuildSchedulesPage,SweepPage}.tsx).
 *
 * **Reality vs roadmap.** The build-schedules surface is split between
 * three pages: the inventory list (`/build-schedules`), the
 * `EditScheduleDialog` modal it opens, and the sweep linter
 * (`/build-schedules/sweep`). The shipped pages divide responsibilities
 * differently from the task ask:
 *
 *   - **Create** is NOT inline on `BuildSchedulesPage` — the header has
 *     a `New schedule` Link that routes to `/schedules/new`
 *     (NewSchedulePage). The task ask's "target pipeline + cron + retry
 *     config" creation flow is split: create on /schedules/new (no
 *     retry config there), retry config edited later through
 *     `EditScheduleDialog`.
 *   - **Edit** opens `EditScheduleDialog` (modal, `role="dialog"`,
 *     `aria-labelledby="edit-schedule-title"`) with Name + Time zone +
 *     Description + Cron flavor + ScheduleConfig + Retry policy
 *     (`max_attempts`, `retry_on_failure`, `allow_partial_reexecution`)
 *     + Change comment. Save calls PATCH
 *     `/data-integration/v1/schedules/{rid}`.
 *   - **SweepPage** is a Foundry-parity linter ("SCH-001 through
 *     SCH-007"), NOT a generic "select schedules + bulk pause/delete"
 *     panel. It runs `runSweep({production})` for findings, lets you
 *     pick which findings to act on (selection is over LINTER FINDINGS,
 *     not raw schedules), and calls `applySweep({finding_ids, report})`.
 *     The recommended_action is encoded per finding
 *     (`Notify | Pause | Archive | Delete`); only Delete actions prompt
 *     `window.confirm` before apply.
 *   - **There is no separate "Dry-run" toggle.** Running the sweep IS
 *     the preview — findings render with their suggested actions and
 *     stay client-side until the user clicks Apply.
 *
 * Existing test-id hooks the spec leans on:
 *   - `data-testid="build-schedules-page"` on the list root
 *   - `data-testid="schedule-card"` on each schedule article
 *   - `data-testid="filters-sidebar"` on the left rail
 *   - `data-testid="schedule-sweep-page"` on the sweep root
 *   - `data-testid="sweep-run-button"` / `"sweep-apply-button"`
 *   - `data-testid="sweep-findings-table"` on each rule-grouped table
 *
 * Endpoints exercised:
 *   - GET   /api/v1/data-integration/v1/schedules?…                            (list)
 *   - GET   /api/v1/data-integration/v1/schedules/{rid}/runs?limit=10
 *   - GET   /api/v1/data-integration/v1/schedules/{rid}/versions?limit=12
 *   - PATCH /api/v1/data-integration/v1/schedules/{rid}                         (edit save)
 *   - POST  /api/v1/data-integration/v1/scheduling-linter/sweep[?production=…]  (run)
 *   - POST  /api/v1/data-integration/v1/scheduling-linter/sweep:apply           (apply)
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
const LINTER_BASE = '/api/v1/data-integration/v1/scheduling-linter';

const SCHEDULES_LIST = new RegExp(`${SCHEDULES_BASE.replace(/\//g, '\\/')}(\\?|$)`);
const SCHEDULE_BY_RID = new RegExp(`${SCHEDULES_BASE.replace(/\//g, '\\/')}/[^/?#:]+(\\?|$)`);
const SCHEDULE_RUNS = new RegExp(`${SCHEDULES_BASE.replace(/\//g, '\\/')}/[^/?#]+/runs(\\?|$)`);
const SCHEDULE_VERSIONS = new RegExp(
  `${SCHEDULES_BASE.replace(/\//g, '\\/')}/[^/?#]+/versions(\\?|$)`,
);
const SWEEP_RUN = new RegExp(`${LINTER_BASE.replace(/\//g, '\\/')}\\/sweep(\\?|$)`);
const SWEEP_APPLY = new RegExp(`${LINTER_BASE.replace(/\//g, '\\/')}\\/sweep:apply(\\?|$)`);

interface ScheduleFixture {
  id: string;
  rid: string;
  project_rid: string;
  folder_rid: string | null;
  name: string;
  description: string;
  trigger: {
    kind:
      | { time: { cron: string; time_zone: string; flavor: 'UNIX_5' | 'QUARTZ_6' } }
      | { event: { type: string; target_rid: string } };
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
  last_run_outcome: 'SUCCEEDED' | 'IGNORED' | 'FAILED' | null;
  last_run_build_rid: string | null;
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
    rid: 'ri.foundry.main.schedule.alpha',
    project_rid: 'ri.foundry.main.project.default',
    folder_rid: null,
    name: 'Alpha schedule',
    description: '',
    trigger: {
      kind: { time: { cron: '0 * * * *', time_zone: 'UTC', flavor: 'UNIX_5' } },
    },
    target: {
      kind: { single: { dataset_rid: 'ri.foundry.main.dataset.alpha' } },
    },
    target_rids: ['ri.foundry.main.dataset.alpha'],
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
    last_run_at: '2026-05-10T10:00:00Z',
    last_run_outcome: 'SUCCEEDED',
    last_run_build_rid: 'ri.foundry.main.build.1',
    scope_kind: 'USER',
    project_scope_rids: [],
    run_as_user_id: null,
    service_principal_id: null,
    run_as_identity: null,
    last_updated_by: 'user-1',
    ...overrides,
  };
}

interface LinterFindingFixture {
  id: string;
  rule_id:
    | 'Sch001InactiveLastNinety'
    | 'Sch002PausedLongerThanThirty'
    | 'Sch003HighFailureRate'
    | 'Sch004OwnerInactive'
    | 'Sch005UserScopeOwnerStale'
    | 'Sch006HighFrequencyCron'
    | 'Sch007EventTriggerWithoutBranchFilter';
  severity: 'Info' | 'Warning' | 'Error';
  schedule_rid: string;
  project_rid: string;
  message: string;
  recommended_action: 'Notify' | 'Pause' | 'Delete' | 'Archive';
}

function makeFinding(overrides: Partial<LinterFindingFixture> = {}): LinterFindingFixture {
  return {
    id: 'finding-1',
    rule_id: 'Sch001InactiveLastNinety',
    severity: 'Warning',
    schedule_rid: 'ri.foundry.main.schedule.alpha',
    project_rid: 'ri.foundry.main.project.default',
    message: 'Schedule has not fired in the last 90 days.',
    recommended_action: 'Pause',
    ...overrides,
  };
}

interface ListMockState {
  schedules: ScheduleFixture[];
}

async function mockSchedulesList(
  page: Page,
  initial: { schedules: ScheduleFixture[] },
): Promise<ListMockState> {
  const state: ListMockState = { schedules: initial.schedules.slice() };

  await page.route(SCHEDULE_RUNS, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { schedule_rid: state.schedules[0]?.rid ?? '', data: [], total: 0 },
    });
  });

  await page.route(SCHEDULE_VERSIONS, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { schedule_rid: state.schedules[0]?.rid ?? '', current_version: 1, data: [] },
    });
  });

  await page.route(SCHEDULE_BY_RID, async (route: Route) => {
    const method = route.request().method();
    const url = route.request().url();
    // Don't swallow /runs or /versions — those routes are registered above
    // and would otherwise drop into this handler since they share the
    // same prefix.
    if (/\/(runs|versions)(\?|$)/.test(url)) return route.fallback();
    const m = /\/schedules\/([^/?#]+?)(?:\?|$)/.exec(url);
    const rid = m?.[1] ? decodeURIComponent(m[1]) : '';
    if (method === 'GET') {
      const found = state.schedules.find((s) => s.rid === rid) ?? state.schedules[0];
      if (!found) return route.fallback();
      await route.fulfill({ json: found });
      return;
    }
    if (method === 'PATCH') {
      const body = route.request().postDataJSON() as Partial<ScheduleFixture>;
      const idx = state.schedules.findIndex((s) => s.rid === rid);
      if (idx >= 0) {
        state.schedules[idx] = {
          ...state.schedules[idx],
          ...body,
          updated_at: E2E_NOW,
          version: state.schedules[idx].version + 1,
        };
        await route.fulfill({ json: state.schedules[idx] });
        return;
      }
      await route.fulfill({ status: 404, json: {} });
      return;
    }
    return route.fallback();
  });

  await page.route(SCHEDULES_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: state.schedules, total: state.schedules.length },
    });
  });

  return state;
}

const ALPHA = makeSchedule({
  rid: 'ri.foundry.main.schedule.alpha',
  name: 'Alpha schedule',
});
const BRAVO = makeSchedule({
  id: 'schedule-2',
  rid: 'ri.foundry.main.schedule.bravo',
  name: 'Bravo paused schedule',
  paused: true,
  paused_reason: 'Manually paused',
  paused_at: '2026-05-09T10:00:00Z',
  trigger: {
    kind: { time: { cron: '*/5 * * * *', time_zone: 'UTC', flavor: 'UNIX_5' } },
  },
  target: {
    kind: { single: { dataset_rid: 'ri.foundry.main.dataset.bravo' } },
  },
  target_rids: ['ri.foundry.main.dataset.bravo'],
  last_run_outcome: 'FAILED',
  last_run_build_rid: 'ri.foundry.main.build.2',
});

// ===========================================================================
// /build-schedules
// ===========================================================================

test('BuildSchedulesPage renders the header, filters sidebar and a schedule card per mocked entry', async ({
  adminPage,
}) => {
  await mockSchedulesList(adminPage, { schedules: [ALPHA, BRAVO] });
  await adminPage.goto('/build-schedules');

  await expect(adminPage.getByTestId('build-schedules-page')).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^build schedules$/i }),
  ).toBeVisible();

  // Sidebar exists and surfaces the search-criteria heading.
  await expect(adminPage.getByTestId('filters-sidebar')).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /search criteria/i }),
  ).toBeVisible();

  // Owner-only banner shows because no filters are applied.
  await expect(adminPage.getByTestId('owner-only-banner')).toBeVisible();

  // Each schedule renders as a `data-testid="schedule-card"`.
  await expect(adminPage.getByTestId('schedule-card')).toHaveCount(2);
  await expect(
    adminPage.getByRole('heading', { level: 2, name: ALPHA.name }).first(),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { level: 2, name: BRAVO.name }).first(),
  ).toBeVisible();

  // Header CTA links to the dedicated create + sweep routes.
  await expect(adminPage.getByRole('link', { name: /sweep schedules/i })).toHaveAttribute(
    'href',
    '/build-schedules/sweep',
  );
  await expect(adminPage.getByRole('link', { name: /^new schedule$/i })).toHaveAttribute(
    'href',
    '/schedules/new',
  );
});

test('schedule-card exposes the per-row actions (Edit / Pause·Resume / Run now / Delete / Metrics)', async ({
  adminPage,
}) => {
  await mockSchedulesList(adminPage, { schedules: [ALPHA, BRAVO] });
  await adminPage.goto('/build-schedules');

  const alphaCard = adminPage.getByTestId('schedule-card').filter({ hasText: ALPHA.name });
  await expect(alphaCard.getByRole('button', { name: /^Edit schedule$/ })).toBeVisible();
  // Active schedule → Pause button. Paused schedule → Resume button.
  await expect(alphaCard.getByRole('button', { name: /^Pause$/ })).toBeVisible();
  await expect(alphaCard.getByRole('button', { name: /^Run now$/ })).toBeVisible();
  await expect(alphaCard.getByRole('button', { name: /^Delete$/ })).toBeVisible();
  await expect(alphaCard.getByRole('link', { name: /^Metrics$/ })).toHaveAttribute(
    'href',
    `/schedules/${ALPHA.rid}`,
  );

  const bravoCard = adminPage.getByTestId('schedule-card').filter({ hasText: BRAVO.name });
  await expect(bravoCard.getByRole('button', { name: /^Resume$/ })).toBeVisible();
  await expect(bravoCard.getByRole('button', { name: /^Pause$/ })).toHaveCount(0);
});

test('Edit dialog: opening it pre-fills Name + Time zone + Retry policy; Save PATCHes /schedules/:rid', async ({
  adminPage,
}) => {
  const state = await mockSchedulesList(adminPage, { schedules: [ALPHA, BRAVO] });
  const cap = captureRequests(adminPage, SCHEDULE_BY_RID);
  await adminPage.goto('/build-schedules');

  // Open the dialog from Alpha's card. (There's also an "Edit selected"
  // button in the header — equivalent — but the per-card button is the
  // narrowest selector.)
  const alphaCard = adminPage.getByTestId('schedule-card').filter({ hasText: ALPHA.name });
  await alphaCard.getByRole('button', { name: /^Edit schedule$/ }).click();

  const dialog = adminPage.getByRole('dialog', { name: /edit schedule/i });
  await expect(dialog).toBeVisible();

  // Pre-filled fields.
  await expect(dialog.getByLabel(/^Name$/)).toHaveValue(ALPHA.name);
  await expect(dialog.getByLabel(/^Time zone$/)).toHaveValue('UTC');
  await expect(dialog.getByLabel(/^Max attempts$/)).toHaveValue('1');

  // Edit name + bump max attempts so we can assert on the PATCH body.
  await dialog.getByLabel(/^Name$/).fill('Alpha schedule (renamed)');
  await dialog.getByLabel(/^Max attempts$/).fill('3');
  await dialog.getByLabel(/^Change comment$/i).fill('e2e edit');

  await dialog.getByRole('button', { name: /^save schedule$/i }).click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'PATCH').length)
    .toBeGreaterThanOrEqual(1);
  const patch = cap.calls.find((c) => c.method === 'PATCH');
  const body = patch?.body as Record<string, unknown> | undefined;
  expect(body).toMatchObject({
    name: 'Alpha schedule (renamed)',
    change_comment: 'e2e edit',
  });
  // The mock applied the patch — the next refresh would surface the new name.
  expect(state.schedules[0].name).toBe('Alpha schedule (renamed)');
});

// ===========================================================================
// /build-schedules/sweep
// ===========================================================================

test('SweepPage: clicking "Run sweep" POSTs /scheduling-linter/sweep and renders findings + stats', async ({
  adminPage,
}) => {
  await adminPage.route(SWEEP_RUN, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: {
        findings: [
          makeFinding({
            id: 'f-1',
            rule_id: 'Sch001InactiveLastNinety',
            severity: 'Warning',
            message: 'Schedule has not fired in the last 90 days.',
            recommended_action: 'Pause',
          }),
          makeFinding({
            id: 'f-2',
            rule_id: 'Sch003HighFailureRate',
            severity: 'Error',
            message: '6/7 recent runs failed.',
            recommended_action: 'Notify',
          }),
        ],
        dry_run: true,
        by_rule: ['Sch001InactiveLastNinety:1', 'Sch003HighFailureRate:1'],
      },
    });
  });
  const cap = captureRequests(adminPage, SWEEP_RUN);

  await adminPage.goto('/build-schedules/sweep');
  await expect(adminPage.getByTestId('schedule-sweep-page')).toBeVisible();

  // Before running, no report is loaded.
  await expect(adminPage.getByText(/no sweep report loaded/i)).toBeVisible();

  await adminPage.getByTestId('sweep-run-button').click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);

  // Stats panel + a findings table per rule group are now visible.
  await expect(adminPage.getByText(/^Findings$/)).toBeVisible();
  // (We don't depend on a specific stat value — the report shape pin
  // is enforced by the post-Run assertion immediately below.)
  await expect(adminPage.getByTestId('sweep-findings-table')).toHaveCount(2);
  await expect(adminPage.getByText(/Schedule has not fired in the last 90 days/)).toBeVisible();
  await expect(adminPage.getByText(/6\/7 recent runs failed/)).toBeVisible();
});

test('SweepPage: Apply POSTs /scheduling-linter/sweep:apply with the selected finding IDs + report', async ({
  adminPage,
}) => {
  const findings = [
    makeFinding({ id: 'f-pause', rule_id: 'Sch001InactiveLastNinety', recommended_action: 'Pause' }),
    makeFinding({ id: 'f-notify', rule_id: 'Sch003HighFailureRate', recommended_action: 'Notify' }),
  ];
  await adminPage.route(SWEEP_RUN, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: { findings, dry_run: true, by_rule: [] },
    });
  });
  await adminPage.route(SWEEP_APPLY, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: {
        applied: [
          { finding_id: 'f-pause', schedule_rid: findings[0].schedule_rid, action: 'Pause' },
          { finding_id: 'f-notify', schedule_rid: findings[1].schedule_rid, action: 'Notify' },
        ],
      },
    });
  });
  const cap = captureRequests(adminPage, SWEEP_APPLY);

  await adminPage.goto('/build-schedules/sweep');
  await adminPage.getByTestId('sweep-run-button').click();

  // The default selection auto-includes non-Delete findings, so we can
  // click Apply without first toggling checkboxes.
  await expect(adminPage.getByTestId('sweep-findings-table')).toHaveCount(2);
  await adminPage.getByTestId('sweep-apply-button').click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);
  const post = cap.calls.find((c) => c.method === 'POST');
  const body = post?.body as { finding_ids?: string[]; report?: { findings?: unknown[] } };
  expect(body?.finding_ids).toEqual(expect.arrayContaining(['f-pause', 'f-notify']));
  expect(Array.isArray(body?.report?.findings)).toBe(true);

  // The "Last apply" panel surfaces the applied actions.
  await expect(adminPage.getByText(/^Last apply$/)).toBeVisible();
});

test('SweepPage: applying a Delete-action finding prompts window.confirm; cancelling aborts the apply', async ({
  adminPage,
}) => {
  await adminPage.route(SWEEP_RUN, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: {
        findings: [
          makeFinding({
            id: 'f-delete',
            rule_id: 'Sch002PausedLongerThanThirty',
            recommended_action: 'Delete',
            message: 'Paused 45 days ago; safe to delete.',
            severity: 'Error',
          }),
        ],
        dry_run: true,
        by_rule: [],
      },
    });
  });
  const apply = captureRequests(adminPage, SWEEP_APPLY);

  await adminPage.goto('/build-schedules/sweep');
  await adminPage.getByTestId('sweep-run-button').click();
  await expect(adminPage.getByText(/Paused 45 days ago; safe to delete/)).toBeVisible();

  // Delete findings are NOT pre-selected by `defaultSelectedFindings`, so
  // explicitly check the row checkbox first.
  await adminPage
    .getByRole('checkbox', { name: /^Select finding f-delete$/ })
    .check();

  // Hook the confirm dialog to DISMISS the first prompt, then ACCEPT
  // subsequent ones.
  let dialogCount = 0;
  adminPage.on('dialog', (dialog) => {
    dialogCount += 1;
    if (dialogCount === 1) {
      void dialog.dismiss();
    } else {
      void dialog.accept();
    }
  });

  await adminPage.getByTestId('sweep-apply-button').click();
  // The confirm was dismissed → no POST :apply fired.
  await adminPage.waitForTimeout(150);
  expect(apply.calls.filter((c) => c.method === 'POST')).toHaveLength(0);

  // Second click accepts; the POST goes through.
  await adminPage.route(SWEEP_APPLY, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: {
        applied: [
          { finding_id: 'f-delete', schedule_rid: 'ri.foundry.main.schedule.alpha', action: 'Delete' },
        ],
      },
    });
  });
  await adminPage.getByTestId('sweep-apply-button').click();
  await expect
    .poll(() => apply.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);
});

test('absent today: no inline create on /build-schedules, no separate "Dry-run" toggle on /sweep', async ({
  adminPage,
}) => {
  // ── /build-schedules ──────────────────────────────────────────────────────
  await mockSchedulesList(adminPage, { schedules: [ALPHA] });
  await adminPage.goto('/build-schedules');

  // 1. Create is delegated to /schedules/new. No inline form, no "Create
  //    schedule" modal-style submit button on the list page itself.
  expect(
    await adminPage.getByRole('dialog', { name: /create.*schedule|new schedule/i }).count(),
  ).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^create schedule$/i }).count()).toBe(0);
  // The path is the link in the header — not a button.
  await expect(adminPage.getByRole('link', { name: /^new schedule$/i })).toHaveAttribute(
    'href',
    '/schedules/new',
  );

  // ── /build-schedules/sweep ────────────────────────────────────────────────
  await adminPage.goto('/build-schedules/sweep');
  await expect(adminPage.getByTestId('schedule-sweep-page')).toBeVisible();

  // 2. No separate "Dry run" toggle / checkbox. The sweep itself is the
  //    preview, and Apply is the commit step.
  expect(await adminPage.getByLabel(/^dry.?run$/i).count()).toBe(0);
  expect(await adminPage.getByRole('switch', { name: /dry.?run/i }).count()).toBe(0);
  expect(await adminPage.getByRole('checkbox', { name: /dry.?run/i }).count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^dry.?run$/i }).count()).toBe(0);
});

import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/builds` and `/builds/:rid`
 * (apps/web/src/routes/builds/{BuildsPage,BuildDetailPage}.tsx).
 *
 * **Reality vs roadmap.** The builds surface is backed by the Foundry-
 * aligned `/v1/builds` API in `lib/api/buildsV1.ts`, which talks to
 * `pipeline-build-service` directly via native `fetch` (NOT the
 * `/api/v1` proxy), so the route patterns here intentionally start with
 * `/v1/...`. Build states are the canonical Foundry vocabulary
 * (`BUILD_RESOLUTION` / `BUILD_QUEUED` / `BUILD_RUNNING` / `BUILD_ABORTING`
 * / `BUILD_FAILED` / `BUILD_ABORTED` / `BUILD_COMPLETED`) — there is no
 * `queued`/`running`/`success`/`failed` shorthand.
 *
 * Mismatches with the original task ask, pinned in the final guard test:
 *   - NO "Retry" button on failed builds. The `/v1/builds/:rid` surface
 *     has no `:retry` endpoint; failures are re-run by submitting a new
 *     build request through `Run build` on the list page.
 *   - The cancel endpoint is `POST /v1/builds/{rid}:abort`, NOT `/cancel`.
 *     The UI button is `Abort` and prompts a `ConfirmDialog`.
 *   - NO "Download logs" affordance — the Logs tab only exposes Refresh
 *     and per-level filter chips.
 *   - NO SSE / WebSocket. The logs panel polls every 5s via
 *     `setInterval` while the job is in a live state.
 *   - The Overview "Timeline" is the four build-lifecycle timestamps
 *     (Created / Queued / Started / Finished) — NOT a per-step timeline.
 *     Per-job state lives in the Jobs panel.
 *
 * Endpoints exercised:
 *   - GET   /v1/builds?status=…&branch=…&pipeline_rid=…&since=…&until=…
 *   - GET   /v1/builds/{rid}
 *   - POST  /v1/builds/{rid}:abort
 *   - GET   /v1/jobs/{jobRid}/logs?levels=…
 *   - GET   /v1/jobs/{jobRid}/outputs
 *   - GET   /v1/jobs/{jobRid}/input-resolutions
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

const BUILDS_LIST = /\/v1\/builds(\?|$)/;
const BUILD_ABORT = /\/v1\/builds\/[^/?#]+:abort(\?|$)/;
const BUILD_DETAIL = /\/v1\/builds\/[^/?#:]+(\?|$)/;
const JOB_LOGS = /\/v1\/jobs\/[^/?#]+\/logs(\?|$)/;
const JOB_OUTPUTS = /\/v1\/jobs\/[^/?#]+\/outputs(\?|$)/;
const JOB_INPUT_RESOLUTIONS = /\/v1\/jobs\/[^/?#]+\/input-resolutions(\?|$)/;

interface BuildFixture {
  id: string;
  rid: string;
  pipeline_rid: string;
  build_branch: string;
  job_spec_fallback: string[];
  state:
    | 'BUILD_RESOLUTION'
    | 'BUILD_QUEUED'
    | 'BUILD_RUNNING'
    | 'BUILD_ABORTING'
    | 'BUILD_FAILED'
    | 'BUILD_ABORTED'
    | 'BUILD_COMPLETED';
  trigger_kind: 'MANUAL' | 'SCHEDULED' | 'FORCE';
  force_build: boolean;
  abort_policy: 'DEPENDENT_ONLY' | 'ALL_NON_DEPENDENT';
  queued_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  requested_by: string;
  created_at: string;
  jobs?: JobFixture[];
}

interface JobFixture {
  id: string;
  rid: string;
  build_id: string;
  job_spec_rid: string;
  state: 'WAITING' | 'RUN_PENDING' | 'RUNNING' | 'ABORT_PENDING' | 'ABORTED' | 'FAILED' | 'COMPLETED';
  output_transaction_rids: string[];
  state_changed_at: string;
  attempt: number;
  stale_skipped: boolean;
  failure_reason: string | null;
  output_content_hash: string | null;
  created_at: string;
}

function makeJob(overrides: Partial<JobFixture> = {}): JobFixture {
  return {
    id: 'job-1',
    rid: 'ri.build.main.job.1',
    build_id: 'build-1',
    job_spec_rid: 'ri.build.main.job-spec.1',
    state: 'COMPLETED',
    output_transaction_rids: ['ri.dataset.main.transaction.1'],
    state_changed_at: E2E_NOW,
    attempt: 1,
    stale_skipped: false,
    failure_reason: null,
    output_content_hash: 'sha256:deadbeef',
    created_at: E2E_NOW,
    ...overrides,
  };
}

function makeBuild(overrides: Partial<BuildFixture> = {}): BuildFixture {
  return {
    id: 'build-1',
    rid: 'ri.build.main.build.1',
    pipeline_rid: 'ri.pipeline.main.pipeline.1',
    build_branch: 'master',
    job_spec_fallback: ['master'],
    state: 'BUILD_COMPLETED',
    trigger_kind: 'MANUAL',
    force_build: false,
    abort_policy: 'DEPENDENT_ONLY',
    queued_at: '2026-05-10T09:00:00Z',
    started_at: '2026-05-10T09:00:05Z',
    finished_at: '2026-05-10T09:01:00Z',
    error_message: null,
    requested_by: 'user-1',
    created_at: '2026-05-10T08:59:55Z',
    jobs: [makeJob()],
    ...overrides,
  };
}

interface BuildsMockState {
  builds: BuildFixture[];
}

/**
 * Wires up the list endpoint + per-build detail + per-job logs/outputs/
 * input-resolutions, all against the `/v1/...` paths (no `/api/v1` proxy).
 * Stateful: POST `:abort` flips the build's state in-place so the
 * follow-up refresh GET surfaces the new value.
 */
async function mockBuilds(
  page: Page,
  initial: { builds: BuildFixture[] },
): Promise<BuildsMockState> {
  const state: BuildsMockState = { builds: initial.builds.slice() };

  // Register narrow handlers BEFORE broader ones so Playwright's most-
  // recent-first dispatch picks them up.
  await page.route(BUILD_ABORT, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const m = /\/v1\/builds\/([^/?#:]+):abort/.exec(route.request().url());
    const rid = m?.[1] ? decodeURIComponent(m[1]) : '';
    const found = state.builds.find((b) => b.rid === rid);
    const nextState: BuildFixture['state'] = 'BUILD_ABORTING';
    if (found) found.state = nextState;
    await route.fulfill({ json: { rid, state: nextState } });
  });

  await page.route(JOB_LOGS, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const levels = url.searchParams.get('levels');
    // Echo the requested level back as the level on each entry so tests
    // can verify the filter actually narrowed the request.
    const lvls = (levels?.split(',').filter(Boolean) ?? ['INFO']) as string[];
    const data = lvls.map((lvl, idx) => ({
      sequence: idx + 1,
      ts: `2026-05-10T09:00:${String(10 + idx).padStart(2, '0')}Z`,
      level: lvl,
      message: `${lvl} entry ${idx + 1}`,
      job_rid: 'ri.build.main.job.1',
      attempt: 1,
      params: {},
    }));
    await route.fulfill({ json: { data, next_cursor: null, limit: data.length } });
  });

  await page.route(JOB_OUTPUTS, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        rid: 'ri.build.main.job.1',
        outputs: [
          {
            output_dataset_rid: 'ri.dataset.main.dataset.orders',
            transaction_rid: 'ri.dataset.main.transaction.42',
            committed: true,
            aborted: false,
          },
        ],
      },
    });
  });

  await page.route(JOB_INPUT_RESOLUTIONS, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        rid: 'ri.build.main.job.1',
        input_view_resolutions: [],
      },
    });
  });

  await page.route(BUILD_DETAIL, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = route.request().url();
    if (/:abort/.test(url)) return route.fallback();
    const m = /\/v1\/builds\/([^/?#]+?)(?:\?|$)/.exec(url);
    const rid = m?.[1] ? decodeURIComponent(m[1]) : '';
    const found = state.builds.find((b) => b.rid === rid) ?? state.builds[0];
    if (!found) return route.fallback();
    await route.fulfill({ json: found });
  });

  await page.route(BUILDS_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    let filtered = state.builds;
    const status = url.searchParams.get('status');
    const branch = url.searchParams.get('branch');
    const pipeline = url.searchParams.get('pipeline_rid');
    if (status) filtered = filtered.filter((b) => b.state === status);
    if (branch) filtered = filtered.filter((b) => b.build_branch === branch);
    if (pipeline) filtered = filtered.filter((b) => b.pipeline_rid === pipeline);
    await route.fulfill({
      json: { data: filtered, next_cursor: null, limit: filtered.length },
    });
  });

  return state;
}

const RUNNING = makeBuild({
  id: 'build-running',
  rid: 'ri.build.main.build.running',
  pipeline_rid: 'ri.pipeline.main.pipeline.alpha',
  build_branch: 'master',
  state: 'BUILD_RUNNING',
  trigger_kind: 'SCHEDULED',
  started_at: '2026-05-11T08:00:00Z',
  finished_at: null,
  jobs: [makeJob({ rid: 'ri.build.main.job.running', state: 'RUNNING' })],
});
const COMPLETED = makeBuild({
  id: 'build-completed',
  rid: 'ri.build.main.build.completed',
  pipeline_rid: 'ri.pipeline.main.pipeline.beta',
  build_branch: 'staging',
  state: 'BUILD_COMPLETED',
});
const FAILED = makeBuild({
  id: 'build-failed',
  rid: 'ri.build.main.build.failed',
  pipeline_rid: 'ri.pipeline.main.pipeline.gamma',
  build_branch: 'master',
  state: 'BUILD_FAILED',
  error_message: 'Transient executor failure',
});

// ===========================================================================
// /builds
// ===========================================================================

test('BuildsPage: renders heading, stats panel, filters form, and a row per mocked build', async ({
  adminPage,
}) => {
  await mockBuilds(adminPage, { builds: [RUNNING, COMPLETED, FAILED] });
  await adminPage.goto('/builds');

  await expect(adminPage.getByRole('heading', { level: 1, name: /^builds$/i })).toBeVisible();

  // Stats reflect the three mocked builds.
  await expect(adminPage.getByText(/^Total$/).locator('xpath=following-sibling::strong[1]'))
    .toHaveText('3');
  await expect(adminPage.getByText(/^In flight$/).locator('xpath=following-sibling::strong[1]'))
    .toHaveText('1');
  await expect(adminPage.getByText(/^Completed$/).locator('xpath=following-sibling::strong[1]'))
    .toHaveText('1');
  await expect(adminPage.getByText(/^Failed$/).locator('xpath=following-sibling::strong[1]'))
    .toHaveText('1');

  // Each build renders a row whose Link is the build RID.
  for (const build of [RUNNING, COMPLETED, FAILED]) {
    // The link's visible text is truncated (`formatRid` slices to 18 chars
    // + ellipsis); the row's RID is exposed via `aria-label={build.rid}`
    // so getByRole resolves uniquely per build.
    const link = adminPage.getByRole('link', { name: build.rid });
    await expect(link).toHaveAttribute(
      'href',
      `/builds/${encodeURIComponent(build.rid)}`,
    );
  }

  // The filter form has the State select, branch + pipeline + datetime inputs.
  await expect(adminPage.getByLabel(/^State$/)).toBeVisible();
  await expect(adminPage.getByLabel(/^Branch$/)).toBeVisible();
  await expect(adminPage.getByLabel(/^Pipeline RID$/)).toBeVisible();
  await expect(adminPage.getByLabel(/^Since$/)).toBeVisible();
  await expect(adminPage.getByLabel(/^Until$/)).toBeVisible();
});

test('BuildsPage: applying the State filter updates the URL and re-queries /v1/builds with status=…', async ({
  adminPage,
}) => {
  await mockBuilds(adminPage, { builds: [RUNNING, COMPLETED, FAILED] });
  const cap = captureRequests(adminPage, BUILDS_LIST);
  await adminPage.goto('/builds');

  // Wait for the initial render so we can measure the post-Apply call.
  await expect(adminPage.getByRole('link', { name: /^ri\.build\.main\.build\.run/ }).first()).toBeVisible();
  const initialGets = cap.calls.filter((c) => c.method === 'GET').length;

  await adminPage.getByLabel(/^State$/).selectOption('BUILD_RUNNING');
  await adminPage.getByRole('button', { name: /^Apply$/ }).click();

  // URL has the encoded filter.
  await expect(adminPage).toHaveURL(/[?&]state=BUILD_RUNNING\b/);

  // A new GET with status=BUILD_RUNNING fired.
  await expect
    .poll(() =>
      cap.calls.some(
        (c) => c.method === 'GET' && /[?&]status=BUILD_RUNNING\b/.test(c.url),
      ),
    )
    .toBe(true);
  expect(cap.calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(initialGets);

  // Only the running build is visible after the server-side filter.
  await expect(
    adminPage.getByRole('link', { name: /^ri\.build\.main\.build\.completed/ }),
  ).toHaveCount(0);
  await expect(
    adminPage.getByRole('link', { name: /^ri\.build\.main\.build\.failed/ }),
  ).toHaveCount(0);
});

test('BuildsPage: branch + pipeline filters round-trip via search params and the API call', async ({
  adminPage,
}) => {
  await mockBuilds(adminPage, { builds: [RUNNING, COMPLETED, FAILED] });
  const cap = captureRequests(adminPage, BUILDS_LIST);
  await adminPage.goto('/builds');

  await adminPage.getByLabel(/^Branch$/).fill('staging');
  await adminPage.getByLabel(/^Pipeline RID$/).fill('ri.pipeline.main.pipeline.beta');
  await adminPage.getByRole('button', { name: /^Apply$/ }).click();

  await expect(adminPage).toHaveURL(/[?&]branch=staging\b/);
  await expect(adminPage).toHaveURL(/[?&]pipeline_rid=ri\.pipeline\.main\.pipeline\.beta\b/);

  await expect
    .poll(() =>
      cap.calls.some(
        (c) =>
          c.method === 'GET' &&
          /[?&]branch=staging\b/.test(c.url) &&
          /[?&]pipeline_rid=ri\.pipeline\.main\.pipeline\.beta\b/.test(c.url),
      ),
    )
    .toBe(true);

  // Only the matching build is left.
  await expect(
    adminPage.getByRole('link', { name: /^ri\.build\.main\.build\.completed/ }).first(),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /^ri\.build\.main\.build\.run/ }),
  ).toHaveCount(0);
});

test('BuildsPage: clicking a row Link navigates to /builds/:rid', async ({ adminPage }) => {
  await mockBuilds(adminPage, { builds: [RUNNING] });
  await adminPage.goto('/builds');

  await adminPage.getByRole('link', { name: /^ri\.build\.main\.build\.run/ }).first().click();

  await expect(adminPage).toHaveURL(
    new RegExp(`/builds/${encodeURIComponent(RUNNING.rid).replace(/\./g, '\\.')}`),
  );
});

test('BuildsPage: in-flight builds expose an Abort action that confirms then POSTs :abort', async ({
  adminPage,
}) => {
  await mockBuilds(adminPage, { builds: [RUNNING, COMPLETED] });
  const cap = captureRequests(adminPage, BUILD_ABORT);
  await adminPage.goto('/builds');

  // Find the row whose `data-abortable="true"` marker is set on the <tr>.
  const abortableRow = adminPage.locator('tr[data-abortable="true"]');
  await expect(abortableRow).toHaveCount(1);

  await abortableRow.getByRole('button', { name: /^Abort$/ }).click();

  // ConfirmDialog opens. Accept it.
  const dialog = adminPage.getByRole('dialog', { name: /^Abort build$/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^Abort$/ }).click();

  await expect
    .poll(() => cap.calls.some((c) => c.method === 'POST' && /:abort/.test(c.url)))
    .toBe(true);
});

// ===========================================================================
// /builds/:rid
// ===========================================================================

test('BuildDetailPage: renders the header, status badge, four tabs and the Jobs panel', async ({
  adminPage,
}) => {
  await mockBuilds(adminPage, { builds: [COMPLETED] });
  await adminPage.goto(`/builds/${encodeURIComponent(COMPLETED.rid)}`);

  // Header surfaces the build detail eyebrow + the truncated RID + the
  // canonical state badge.
  await expect(adminPage.getByText(/^Build detail$/)).toBeVisible();
  await expect(adminPage.getByText('BUILD_COMPLETED')).toBeVisible();

  // Four tabs render via the shared Tabs component (role="tab").
  for (const label of ['Overview', 'Logs', 'Artifacts', 'Raw']) {
    await expect(adminPage.getByRole('tab', { name: label })).toBeVisible();
  }

  // Jobs panel shows the seeded job RID.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^1 job$/ }),
  ).toBeVisible();
});

test('BuildDetailPage: Logs tab loads /v1/jobs/:rid/logs and the level filter buttons re-fetch with levels=…', async ({
  adminPage,
}) => {
  await mockBuilds(adminPage, { builds: [COMPLETED] });
  const cap = captureRequests(adminPage, JOB_LOGS);

  await adminPage.goto(`/builds/${encodeURIComponent(COMPLETED.rid)}`);
  await adminPage.getByRole('tab', { name: /^Logs$/ }).click();

  // Default "All" level renders the INFO entry from the mock.
  await expect(adminPage.getByText(/INFO entry 1/)).toBeVisible();

  // Click the "WARN" level button — fires a new GET with levels=WARN.
  await adminPage.getByRole('button', { name: /^WARN$/ }).click();

  await expect
    .poll(() =>
      cap.calls.some(
        (c) => c.method === 'GET' && /[?&]levels=WARN\b/.test(c.url),
      ),
    )
    .toBe(true);

  await expect(adminPage.getByText(/WARN entry 1/)).toBeVisible();
});

test('BuildDetailPage: Artifacts tab renders the output transactions table from /v1/jobs/:rid/outputs', async ({
  adminPage,
}) => {
  await mockBuilds(adminPage, { builds: [COMPLETED] });
  await adminPage.goto(`/builds/${encodeURIComponent(COMPLETED.rid)}`);

  await adminPage.getByRole('tab', { name: /^Artifacts$/ }).click();

  // The Artifacts header surfaces the mock counts.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^Output transactions$/i }),
  ).toBeVisible();
  await expect(adminPage.getByText(/1 outputs · 1 committed · 0 aborted/)).toBeVisible();

  // Output row from the mock is visible (Dataset link + transaction RID).
  await expect(
    adminPage.getByRole('link', { name: /^ri\.dataset\.main/ }).first(),
  ).toBeVisible();
});

test('BuildDetailPage: header Abort action on a RUNNING build opens ConfirmDialog and POSTs :abort', async ({
  adminPage,
}) => {
  const state = await mockBuilds(adminPage, { builds: [RUNNING] });
  const cap = captureRequests(adminPage, BUILD_ABORT);

  await adminPage.goto(`/builds/${encodeURIComponent(RUNNING.rid)}`);

  await adminPage.getByRole('button', { name: /^Abort$/ }).click();
  const dialog = adminPage.getByRole('dialog', { name: /^Abort build$/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^Abort$/ }).click();

  await expect
    .poll(() => cap.calls.some((c) => c.method === 'POST' && /:abort/.test(c.url)))
    .toBe(true);

  // The stateful mock flipped the build to BUILD_ABORTING; the post-abort
  // refresh GET surfaces the new state in the badge.
  expect(state.builds[0].state).toBe('BUILD_ABORTING');
  await expect(adminPage.getByText('BUILD_ABORTING').first()).toBeVisible();
});

test('absent today: no Retry on failed builds, no Download-logs button, abort endpoint is `:abort` (not `/cancel`), no SSE/WS', async ({
  adminPage,
}) => {
  // Negative-assertion guard for the roadmap surfaces the task asks for
  // that do not ship today. Each flipped assertion is the migration signal
  // when the matching control lands.
  let websocketOpened = false;
  adminPage.on('websocket', (ws) => {
    // Ignore Vite's HMR websocket (always present in dev) — we only care
    // about app-opened WebSockets to the builds API.
    if (/\/api\/|\/v1\//.test(ws.url())) {
      websocketOpened = true;
    }
  });

  await mockBuilds(adminPage, { builds: [FAILED, COMPLETED, RUNNING] });
  const buildCalls = captureRequests(adminPage, /\/v1\/builds\//);
  await adminPage.goto('/builds');

  // 1. No Retry button on failed builds (or anywhere on the list). The
  //    list exposes "Open" (link) + "Abort" (only on in-flight rows).
  expect(await adminPage.getByRole('button', { name: /^Retry$/i }).count()).toBe(0);
  // The failed row still renders, just without retry affordance.
  await expect(
    adminPage.getByRole('link', { name: /^ri\.build\.main\.build\.failed/ }).first(),
  ).toBeVisible();

  // 2. The detail page Logs tab has no Download button.
  await adminPage.goto(`/builds/${encodeURIComponent(COMPLETED.rid)}`);
  await adminPage.getByRole('tab', { name: /^Logs$/ }).click();
  await expect(adminPage.getByText(/Run logs/)).toBeVisible();
  expect(
    await adminPage.getByRole('button', { name: /^(Download|Export) logs$/i }).count(),
  ).toBe(0);
  expect(await adminPage.getByRole('link', { name: /^(Download|Export) logs$/i }).count()).toBe(0);

  // 3. Aborts go through `:abort` — verify no `/cancel` endpoint is hit.
  await adminPage.goto('/builds');
  const abortableRow = adminPage.locator('tr[data-abortable="true"]');
  await abortableRow.getByRole('button', { name: /^Abort$/ }).click();
  await adminPage.getByRole('dialog', { name: /^Abort build$/i }).getByRole('button', { name: /^Abort$/ }).click();
  await expect
    .poll(() => buildCalls.calls.some((c) => c.method === 'POST' && /:abort/.test(c.url)))
    .toBe(true);
  expect(
    buildCalls.calls.some((c) => c.method === 'POST' && /\/cancel(\?|$)/.test(c.url)),
  ).toBe(false);

  // 4. No WebSocket connection was opened during the session. (The Logs
  //    panel uses 5s `setInterval` polling, not SSE/WS.)
  expect(websocketOpened).toBe(false);
});

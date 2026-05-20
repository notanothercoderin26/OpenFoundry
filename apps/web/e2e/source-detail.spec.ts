import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { SourceDetailPage } from './pages';

/**
 * E2E coverage for `/data-connection/sources/:id`
 * (apps/web/src/routes/data-connection/SourceDetailPage.tsx).
 *
 * **Reality vs roadmap.** The shipped page is a 16-tab `Tabs`
 * navigator that does NOT use the roadmap vocabulary. The roadmap
 * calls for "Overview / Tables / Sync history / Schema / Settings".
 * The shipped tab ids are:
 *
 *   overview · health · retries · configuration · credentials ·
 *   networking · explore · syncs · streams · exports · webhooks ·
 *   virtual-tables · code-imports · permissions · history ·
 *   capabilities  ( · media-syncs when supported)
 *
 * Mapping the roadmap onto reality:
 *
 *   - Overview      → ships as `overview` tab.
 *   - Tables        → not a tab. Table exploration lives inside the
 *                     `explore` tab; table-syncs in the `syncs` tab.
 *   - Sync history  → not a tab. Per-sync run history renders
 *                     inline in the `syncs` tab; the `history` tab
 *                     is for source-governance audit events.
 *   - Schema        → not a tab. Schema metadata sits inside
 *                     individual syncs / explore previews.
 *   - Settings      → not a tab. The header "Edit" button opens an
 *                     inline metadata panel; connection config has
 *                     its own `configuration` tab.
 *
 *   - "Sync now"           → ships as per-row "Run sync" button.
 *   - "Pause / resume sync" → NOT shipped for batch syncs. The only
 *                             per-row controls are "Run sync" +
 *                             "Refresh runs". Streaming syncs have
 *                             start/stop, which is different.
 *   - "Edit credentials + re-test" → ships as the credentials-tab
 *                             form + the header "Test connection"
 *                             button. There is no per-credential
 *                             inline test.
 *   - "Delete with dataset-dependency warning" → ships as the
 *                             header "Delete" button with a bare
 *                             `window.confirm('Delete source?')`.
 *                             No dependent-dataset count is
 *                             surfaced today.
 *   - "Sync logs"          → ship inline under each run row in
 *                             the `syncs` tab — the last 2 log
 *                             entries per run render as
 *                             "{timestamp} · {level}: {message}".
 *
 * Endpoints exercised:
 *   - GET    /api/v1/data-connection/sources/{id}
 *   - GET    /api/v1/data-connection/sources/{id}/credentials
 *   - GET    /api/v1/data-connection/sources/{id}/syncs
 *   - GET    /api/v1/data-connection/sources/{id}/egress-policies
 *   - GET    /api/v1/data-connection/syncs/{syncId}/runs
 *   - POST   /api/v1/data-connection/sources/{id}/credentials
 *   - POST   /api/v1/data-connection/sources/{id}/test-connection
 *   - POST   /api/v1/data-connection/syncs/{syncId}/run
 *   - DELETE /api/v1/data-connection/sources/{id}
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

const SOURCE_ID = 'source-1';
const SYNC_ID = 'sync-1';
const E2E_NOW = '2026-05-11T00:00:00Z';

const SOURCE_GET = new RegExp(`/api/v1/data-connection/sources/${SOURCE_ID}$`);
const SOURCE_DELETE = new RegExp(`/api/v1/data-connection/sources/${SOURCE_ID}$`);
const CREDS_COLLECTION = new RegExp(`/api/v1/data-connection/sources/${SOURCE_ID}/credentials$`);
const TEST_CONNECTION = new RegExp(`/api/v1/data-connection/sources/${SOURCE_ID}/test-connection$`);
const SYNCS_LIST = new RegExp(`/api/v1/data-connection/sources/${SOURCE_ID}/syncs$`);
const SOURCE_EGRESS = new RegExp(`/api/v1/data-connection/sources/${SOURCE_ID}/egress-policies$`);
const SYNC_RUN = new RegExp(`/api/v1/data-connection/syncs/${SYNC_ID}/run$`);
const SYNC_RUNS_LIST = new RegExp(`/api/v1/data-connection/syncs/${SYNC_ID}/runs$`);

interface SourceFixture {
  id: string;
  name: string;
  description?: string | null;
  connector_type: string;
  worker: 'foundry' | 'agent';
  status: 'healthy' | 'degraded' | 'error' | 'configuring' | 'draft';
  last_sync_at: string | null;
  organization_id?: string | null;
  default_output_location?: string | null;
  created_at: string;
  updated_at: string;
}

function makeSource(overrides: Partial<SourceFixture> = {}): SourceFixture {
  return {
    id: SOURCE_ID,
    name: 'Production Postgres',
    description: 'Primary warehouse source.',
    connector_type: 'postgresql',
    worker: 'foundry',
    status: 'healthy',
    last_sync_at: E2E_NOW,
    organization_id: null,
    default_output_location: null,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

interface SyncFixture {
  id: string;
  source_id: string;
  capability_type?: string;
  output_kind?: string;
  output_dataset_id?: string | null;
  source_selector?: string | null;
  source_table?: string | null;
  write_mode?: string;
  transaction_mode?: string;
  file_glob: string | null;
  schedule_cron: string | null;
  created_at: string;
}

function makeSync(overrides: Partial<SyncFixture> = {}): SyncFixture {
  return {
    id: SYNC_ID,
    source_id: SOURCE_ID,
    capability_type: 'batch_sync',
    output_kind: 'dataset',
    output_dataset_id: 'dataset-orders',
    source_selector: 'public.orders',
    source_table: 'orders',
    write_mode: 'append',
    transaction_mode: 'snapshot',
    file_glob: null,
    schedule_cron: '0 6 * * *',
    created_at: E2E_NOW,
    ...overrides,
  };
}

interface SyncRunFixture {
  id: string;
  sync_def_id: string;
  status: string;
  queued_at?: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms?: number | null;
  bytes_written: number;
  files_written: number;
  rows_written?: number | null;
  retry_count?: number;
  worker?: string | null;
  error: string | null;
  logs?: Array<{ timestamp: string; level: string; message: string }>;
}

function makeRun(overrides: Partial<SyncRunFixture> = {}): SyncRunFixture {
  return {
    id: 'run-1',
    sync_def_id: SYNC_ID,
    status: 'completed',
    queued_at: E2E_NOW,
    started_at: E2E_NOW,
    finished_at: E2E_NOW,
    duration_ms: 12_345,
    bytes_written: 65_536,
    files_written: 1,
    rows_written: 1_024,
    retry_count: 0,
    worker: 'foundry',
    error: null,
    logs: [
      { timestamp: '2026-05-11T00:00:01Z', level: 'info', message: 'Sync started' },
      { timestamp: '2026-05-11T00:00:02Z', level: 'info', message: 'Wrote 1024 rows' },
    ],
    ...overrides,
  };
}

/**
 * Bind the minimum mocks the page needs to render past `Loading source…`.
 * Per-tab data (credentials, syncs, …) still defaults to empty arrays so
 * specs can layer on the routes they actually exercise.
 */
async function installBaseMocks(
  page: Page,
  source: SourceFixture = makeSource(),
): Promise<void> {
  await page.route(SOURCE_GET, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: source });
  });
  // Per-source endpoints that return bare arrays — the default
  // catch-all returns an envelope object instead, which breaks
  // `arr.map`/`arr.length` consumers. Override with `[]`.
  for (const pattern of [CREDS_COLLECTION, SYNCS_LIST, SOURCE_EGRESS]) {
    await page.route(pattern, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({ json: [] });
    });
  }
}

test('shipped tabs render via role=tab; the roadmap names (Tables / Sync history / Schema / Settings) are absent', async ({
  adminPage,
}) => {
  await installBaseMocks(adminPage);
  const detail = new SourceDetailPage(adminPage, SOURCE_ID);
  await detail.goto();
  await detail.expectLoaded();

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /Production Postgres/i }),
  ).toBeVisible();

  const tablist = adminPage.getByRole('tablist');
  await expect(tablist).toBeVisible();

  // Overview is the only roadmap name that maps onto a shipped tab.
  await expect(tablist.getByRole('tab', { name: /^overview$/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // Other shipped tabs (sample of the 16).
  for (const name of [/^credentials$/i, /^Syncs$/, /^history$/i, /^configuration$/i, /^capabilities$/i]) {
    await expect(tablist.getByRole('tab', { name })).toBeVisible();
  }

  // Regression guards: the roadmap-named tabs do NOT ship.
  expect(await tablist.getByRole('tab', { name: /^tables$/i }).count()).toBe(0);
  expect(await tablist.getByRole('tab', { name: /^sync history$/i }).count()).toBe(0);
  expect(await tablist.getByRole('tab', { name: /^schema$/i }).count()).toBe(0);
  expect(await tablist.getByRole('tab', { name: /^settings$/i }).count()).toBe(0);
});

test('Run sync (shell-level "Sync now") POSTs to /syncs/:id/run from the Syncs tab', async ({
  adminPage,
}) => {
  await installBaseMocks(adminPage);
  await adminPage.route(SYNCS_LIST, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: [makeSync()] });
  });
  await adminPage.route(SYNC_RUNS_LIST, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: [] });
  });

  const runCalls: string[] = [];
  await adminPage.route(SYNC_RUN, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    runCalls.push(route.request().url());
    await route.fulfill({
      json: { ...makeRun({ id: 'run-fresh', status: 'queued' }) },
    });
  });

  await new SourceDetailPage(adminPage, SOURCE_ID).goto();
  await adminPage.getByRole('tab', { name: /^Syncs$/ }).click();

  // The sync row renders the dataset id metadata before the action row.
  await expect(adminPage.getByText(/dataset-orders/)).toBeVisible();

  await adminPage.getByRole('button', { name: /^Run sync$/i }).click();
  await expect.poll(() => runCalls.length).toBeGreaterThanOrEqual(1);
  expect(runCalls[0]).toMatch(/\/syncs\/sync-1\/run$/);
});

test('Pause / Resume sync controls are not shipped for batch syncs in the Syncs tab', async ({
  adminPage,
}) => {
  // Regression guard. The roadmap calls for per-sync pause/resume.
  // The shipped UI offers only "Run sync" + "Refresh runs" on each
  // batch sync row. (Streaming syncs use a separate start/stop pair,
  // which is a different surface and not what the roadmap asks for.)
  await installBaseMocks(adminPage);
  await adminPage.route(SYNCS_LIST, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: [makeSync()] });
  });

  await new SourceDetailPage(adminPage, SOURCE_ID).goto();
  await adminPage.getByRole('tab', { name: /^Syncs$/ }).click();

  // Per-row shipped CTAs.
  await expect(adminPage.getByRole('button', { name: /^Run sync$/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^Refresh runs$/i })).toBeVisible();

  // Pause / Resume / Stop sync / Disable sync — all absent today.
  expect(await adminPage.getByRole('button', { name: /^pause( sync)?$/i }).count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^resume( sync)?$/i }).count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^stop sync$/i }).count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: /disable sync/i }).count()).toBe(0);
});

test('Credentials tab: Save credential metadata POSTs to /credentials; header "Test connection" re-tests against /test-connection', async ({
  adminPage,
}) => {
  await installBaseMocks(adminPage);

  // Egress validation expects at least one active matching policy
  // before testConnection() fires the API call. Return one.
  await adminPage.route(SOURCE_EGRESS, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: [
        {
          id: 'policy-direct',
          name: 'Default direct egress',
          description: '',
          kind: 'direct',
          address: { kind: 'host', value: 'warehouse.example.com' },
          port: { kind: 'single', value: '443' },
          protocol: 'https',
          state: 'active',
          status: 'active',
          is_global: false,
          allowed_organizations: [],
          permissions: [],
          created_at: E2E_NOW,
          updated_at: E2E_NOW,
        },
      ],
    });
  });

  const credPosts = captureRequests(adminPage, CREDS_COLLECTION);
  const testPosts = captureRequests(adminPage, TEST_CONNECTION);

  await adminPage.route(TEST_CONNECTION, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        message: 'Connected to Production Postgres',
        latency_ms: 17,
        tested_at: E2E_NOW,
      },
    });
  });

  await new SourceDetailPage(adminPage, SOURCE_ID).goto();
  await adminPage.getByRole('tab', { name: /^credentials$/i }).click();

  // Default kind = 'api_key', storage = 'encrypted_secret'. Fill the
  // value to enable Save.
  await adminPage.getByLabel(/^Value/i).fill('secret-value-123');
  await adminPage
    .getByRole('button', { name: /^Save credential metadata$/i })
    .click();

  await expect
    .poll(() => credPosts.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);
  const credPost = credPosts.calls.find((c) => c.method === 'POST');
  expect(credPost?.body).toMatchObject({
    kind: 'api_key',
    storage_mode: 'encrypted_secret',
    value: 'secret-value-123',
  });

  // Header "Test connection" re-runs the validation against the
  // freshly-saved credential.
  await adminPage.getByRole('button', { name: /^Test connection$/i }).click();
  await expect
    .poll(() => testPosts.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);

  // Success banner surfaces the API message.
  await expect(adminPage.getByText(/Connected to Production Postgres/i)).toBeVisible();
});

test('Delete confirms via window.confirm("Delete source?") — the dependent-dataset warning the roadmap calls for is NOT in the prompt today', async ({
  adminPage,
}) => {
  await installBaseMocks(adminPage);

  const deleteCalls: string[] = [];
  await adminPage.route(SOURCE_DELETE, async (route) => {
    if (route.request().method() !== 'DELETE') {
      await route.fallback();
      return;
    }
    deleteCalls.push(route.request().url());
    await route.fulfill({ status: 204, body: '' });
  });

  await new SourceDetailPage(adminPage, SOURCE_ID).goto();

  // Capture the confirm dialog *message* exactly. The shipped copy
  // is the bare "Delete source?" — no count of dependent datasets,
  // no list of downstream consumers, no cascade warning.
  let dialogMessage = '';
  adminPage.once('dialog', (dialog) => {
    dialogMessage = dialog.message();
    expect(dialog.type()).toBe('confirm');
    void dialog.accept();
  });

  await adminPage.getByRole('button', { name: /^Delete$/i }).click();

  await expect.poll(() => deleteCalls.length).toBeGreaterThanOrEqual(1);
  expect(deleteCalls[0]).toMatch(new RegExp(`/sources/${SOURCE_ID}$`));

  // Regression guards: today's confirm copy has none of these.
  expect(dialogMessage).toBe('Delete source?');
  expect(dialogMessage).not.toMatch(/dependent (dataset|datasets)/i);
  expect(dialogMessage).not.toMatch(/downstream/i);
  expect(dialogMessage).not.toMatch(/will be (deleted|removed|cascaded)/i);

  // After a successful delete the page navigates back to the list.
  await expect(adminPage).toHaveURL(/\/data-connection(\?|#|$)/);
});

test('Sync logs render inline under each run row in the Syncs tab', async ({
  adminPage,
}) => {
  await installBaseMocks(adminPage);
  await adminPage.route(SYNCS_LIST, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: [makeSync()] });
  });
  await adminPage.route(SYNC_RUNS_LIST, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: [
        makeRun({
          logs: [
            { timestamp: '2026-05-11T00:00:01Z', level: 'info', message: 'Sync started' },
            { timestamp: '2026-05-11T00:00:02Z', level: 'warn', message: '1 row skipped' },
          ],
        }),
      ],
    });
  });

  await new SourceDetailPage(adminPage, SOURCE_ID).goto();
  await adminPage.getByRole('tab', { name: /^Syncs$/ }).click();
  await adminPage.getByRole('button', { name: /^Refresh runs$/i }).click();

  // Run summary line.
  await expect(adminPage.getByText(/65536 bytes/)).toBeVisible();
  await expect(adminPage.getByText(/rows 1024/)).toBeVisible();

  // Last 2 log entries render as "{timestamp} · {level}: {message}".
  await expect(adminPage.getByText(/info: Sync started/i)).toBeVisible();
  await expect(adminPage.getByText(/warn: 1 row skipped/i)).toBeVisible();
});

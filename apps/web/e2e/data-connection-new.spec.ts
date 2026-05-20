import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { NewSourcePage, NewStreamingSourcePage } from './pages';

/**
 * E2E coverage for the two source-creation wizards:
 *   - `/data-connection/new`             (apps/web/src/routes/data-connection/NewSourcePage.tsx)
 *   - `/data-connection/new/streaming`   (apps/web/src/routes/data-connection/NewStreamingSourcePage.tsx)
 *
 * **Reality vs roadmap.** Both wizards ship today but with a shape
 * that differs from the roadmap in two notable ways:
 *
 *   - The batch wizard's three steps are Connector → Configure → Test
 *     (validate). The "Test" step is reached AFTER the source is
 *     POSTed; the Test Connection call is a per-source validation
 *     against the just-created source. There is NO "Schedule sync"
 *     step in the wizard — sync schedules are set up later from
 *     `/data-connection/sources/:id`.
 *
 *   - The streaming wizard is 3 chips (Connector / Configure /
 *     Create). It has NO per-connector "test consumer" call; the
 *     "Create streaming source" button is the only action that
 *     advances. Consumer-side validation happens after creation on
 *     the source detail page.
 *
 * Endpoints exercised:
 *   - GET   /api/v1/data-connection/catalog
 *   - GET   /api/v1/data-connection/streaming-sources
 *   - POST  /api/v1/data-connection/sources
 *   - POST  /api/v1/data-connection/sources/{id}/test-connection
 *   - POST  /api/v1/data-connection/sources/{id}/registrations/discover
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

const SOURCES_POST = /\/api\/v1\/data-connection\/sources(\?|$)/;
const TEST_CONNECTION = /\/api\/v1\/data-connection\/sources\/[^/]+\/test-connection$/;
const DISCOVER = /\/api\/v1\/data-connection\/sources\/[^/]+\/registrations\/discover$/;
const E2E_NOW = '2026-05-11T00:00:00Z';

/** Mock POST /sources to return a deterministic id so subsequent
 *  per-source calls (test-connection, discover) resolve cleanly. */
async function mockCreateSource(
  page: Page,
  id = 'source-new',
): Promise<{ getPostBody: () => unknown | undefined }> {
  let lastBody: unknown | undefined;
  await page.route(SOURCES_POST, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    lastBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      json: {
        id,
        name: 'Created source',
        connector_type: 'postgresql',
        worker: 'foundry',
        status: 'configuring',
        last_sync_at: null,
        created_at: E2E_NOW,
        updated_at: E2E_NOW,
      },
    });
  });
  return { getPostBody: () => lastBody };
}

// ===========================================================================
// /data-connection/new — batch / standard wizard
// ===========================================================================

test('NewSource: catalog gallery lists Postgres / S3 / MySQL connector cards', async ({
  adminPage,
}) => {
  // The page calls `getCatalog()`; the default mock returns an
  // envelope that doesn't match `{ connectors }`, the page's `.catch`
  // falls back to `FALLBACK_CONNECTOR_CATALOG`. That fallback ships
  // with Postgres / MySQL / S3 / Snowflake / BigQuery / etc, so this
  // test rides on the local catalog.
  const newSource = new NewSourcePage(adminPage);
  await newSource.goto();
  await newSource.expectLoaded();

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^new source$/i }),
  ).toBeVisible();

  // Wizard step nav: 3 steps, "Connector" active by default.
  await expect(adminPage.getByRole('button', { name: /^1\. connector$/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^2\. configure$/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^3\. test$/i })).toBeVisible();

  // Connector cards. Each card is a `<button>` whose first text is
  // the connector display name, so a leading-anchor regex is
  // sufficient to disambiguate.
  await expect(adminPage.getByRole('button', { name: /^PostgreSQL/ })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^Amazon S3/ })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^MySQL/ })).toBeVisible();
});

test('NewSource: picking PostgreSQL advances to Configure with SQL host / port / credentials fields', async ({
  adminPage,
}) => {
  await new NewSourcePage(adminPage).goto();
  await adminPage.getByRole('button', { name: /^PostgreSQL/ }).click();

  // Configure step shows the SQL template fields.
  await expect(adminPage.getByText(/^Configure PostgreSQL$/i)).toBeVisible();
  await expect(adminPage.getByLabel(/^Source name$/i)).toHaveValue('PostgreSQL source');
  await expect(adminPage.getByLabel(/^Worker$/i)).toBeVisible();

  // SQL template config fields.
  await expect(adminPage.getByLabel(/^Host/i)).toBeVisible();
  await expect(adminPage.getByLabel(/^Port/i)).toBeVisible();
  await expect(adminPage.getByLabel(/^Database$/i)).toBeVisible();
  await expect(adminPage.getByLabel(/^Schema$/i)).toBeVisible();

  // SQL template credential fields (CredentialsPanel).
  await expect(adminPage.getByText(/^Credentials$/i)).toBeVisible();
  await expect(adminPage.getByLabel(/^User$/i)).toBeVisible();
  await expect(adminPage.getByLabel(/^Password/i)).toBeVisible();
});

test('NewSource: Test connection returns 200 → "Connected" status surfaces', async ({
  adminPage,
}) => {
  await mockCreateSource(adminPage, 'source-pg');
  await adminPage.route(TEST_CONNECTION, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        message: 'Connected to PostgreSQL',
        latency_ms: 42,
        tested_at: E2E_NOW,
      },
    });
  });

  await new NewSourcePage(adminPage).goto();
  await adminPage.getByRole('button', { name: /^PostgreSQL/ }).click();
  await adminPage.getByLabel(/^Host/i).fill('warehouse.example.com');
  await adminPage.getByRole('button', { name: /^Create source$/i }).click();

  // Advanced to the Test step.
  await expect(adminPage.getByRole('button', { name: /^Test connection$/i })).toBeVisible();
  await adminPage.getByRole('button', { name: /^Test connection$/i }).click();

  await expect(adminPage.getByText(/^Connected$/)).toBeVisible();
  await expect(adminPage.getByText(/Connected to PostgreSQL/)).toBeVisible();
});

test('NewSource: Test connection 400 surfaces the error banner', async ({
  adminPage,
}) => {
  await mockCreateSource(adminPage, 'source-pg');
  await adminPage.route(TEST_CONNECTION, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 400,
      json: { error: 'authentication failed', message: 'authentication failed' },
    });
  });

  await new NewSourcePage(adminPage).goto();
  await adminPage.getByRole('button', { name: /^PostgreSQL/ }).click();
  await adminPage.getByLabel(/^Host/i).fill('warehouse.example.com');
  await adminPage.getByRole('button', { name: /^Create source$/i }).click();
  await adminPage.getByRole('button', { name: /^Test connection$/i }).click();

  // The page renders a `.of-status-danger` banner with the API message.
  await expect(adminPage.locator('.of-status-danger')).toBeVisible();
  await expect(adminPage.locator('.of-status-danger')).toContainText(/authentication failed/i);

  // No "Connected" success copy.
  expect(await adminPage.getByText(/^Connected$/).count()).toBe(0);
});

test('NewSource: Discover sources renders a checklist of discovered selectors', async ({
  adminPage,
}) => {
  await mockCreateSource(adminPage, 'source-pg');
  await adminPage.route(DISCOVER, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        sources: [
          { selector: 'public.orders', source_kind: 'table', supports_sync: true },
          { selector: 'public.customers', source_kind: 'table', supports_sync: true },
        ],
      },
    });
  });

  await new NewSourcePage(adminPage).goto();
  await adminPage.getByRole('button', { name: /^PostgreSQL/ }).click();
  await adminPage.getByLabel(/^Host/i).fill('warehouse.example.com');
  await adminPage.getByRole('button', { name: /^Create source$/i }).click();
  await adminPage.getByRole('button', { name: /^Discover sources$/i }).click();

  // Each discovered selector renders with a leading checkbox.
  await expect(adminPage.getByText('public.orders')).toBeVisible();
  await expect(adminPage.getByText('public.customers')).toBeVisible();
  await expect(adminPage.getByRole('checkbox')).toHaveCount(2);

  // Tick one and confirm "Register selected" is wired.
  await adminPage.getByRole('checkbox').first().check();
  await expect(adminPage.getByRole('button', { name: /^Register selected$/i })).toBeEnabled();
});

test('NewSource: wizard has Connector / Configure / Test steps only — no Schedule-of-sync step ships today', async ({
  adminPage,
}) => {
  // The roadmap calls for a "Schedule de sync" step in this wizard.
  // The shipped flow has none: schedules live on the source detail
  // page (`createSync`/`createSchedule`). This test pins the absence
  // so a half-shipped step is caught.
  await new NewSourcePage(adminPage).goto();
  await adminPage.getByRole('button', { name: /^PostgreSQL/ }).click();

  // No step button or panel labelled "Schedule".
  expect(
    await adminPage.getByRole('button', { name: /schedule|cron/i }).count(),
  ).toBe(0);
  expect(await adminPage.getByLabel(/cron expression|schedule/i).count()).toBe(0);
  expect(
    await adminPage.getByRole('heading', { name: /schedule.*sync|sync schedule/i }).count(),
  ).toBe(0);
});

test('NewSource: Create source POSTs to /sources with the configured connector_type, worker, and config', async ({
  adminPage,
}) => {
  const create = await mockCreateSource(adminPage, 'source-pg');

  await new NewSourcePage(adminPage).goto();
  await adminPage.getByRole('button', { name: /^PostgreSQL/ }).click();
  await adminPage.getByLabel(/^Host/i).fill('warehouse.example.com');
  await adminPage.getByLabel(/^Port/i).fill('5432');
  await adminPage.getByLabel(/^Database$/i).fill('analytics');

  await adminPage.getByRole('button', { name: /^Create source$/i }).click();

  // Capture POST body via the mocked route.
  await expect.poll(() => create.getPostBody()).toBeTruthy();
  expect(create.getPostBody()).toMatchObject({
    name: 'PostgreSQL source',
    connector_type: 'postgresql',
    worker: 'foundry',
    config: {
      host: 'warehouse.example.com',
      port: 5432,
      database: 'analytics',
    },
  });

  // Wizard advances to the validate step with the source-detail link.
  await expect(
    adminPage.getByRole('link', { name: /^source detail$/i }),
  ).toHaveAttribute('href', /\/data-connection\/sources\/source-pg$/);
});

// ===========================================================================
// /data-connection/new/streaming — streaming wizard
// ===========================================================================

test('NewStreaming: catalog lists Kafka / Kinesis / Pub/Sub / SQS contracts', async ({
  adminPage,
}) => {
  const streaming = new NewStreamingSourcePage(adminPage);
  await streaming.goto();
  await streaming.expectLoaded();

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^new streaming source$/i }),
  ).toBeVisible();

  // FALLBACK_STREAMING_SOURCE_CONTRACTS supplies these four when the
  // /streaming-sources endpoint returns no data.
  await expect(adminPage.getByRole('button', { name: /Apache Kafka/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /Amazon Kinesis/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /Google Cloud Pub\/Sub/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /Amazon SQS/i })).toBeVisible();
});

test('NewStreaming: picking Apache Kafka reveals Kafka-specific config fields', async ({
  adminPage,
}) => {
  await new NewStreamingSourcePage(adminPage).goto();
  await adminPage.getByRole('button', { name: /Apache Kafka/i }).click();

  await expect(adminPage.getByLabel(/^Source name$/i)).toHaveValue(
    /Apache Kafka streaming source/i,
  );

  // Kafka contract fields.
  await expect(adminPage.getByLabel(/^bootstrap_servers/i)).toBeVisible();
  await expect(adminPage.getByLabel(/^topic\s*\*?$/i)).toBeVisible();
  await expect(adminPage.getByLabel(/^consumer_group/i)).toBeVisible();
  await expect(adminPage.getByLabel(/^auto_offset_reset/i)).toHaveValue('latest');

  // Shared streaming controls.
  await expect(adminPage.getByLabel(/^Target stream RID/i)).toBeVisible();
  await expect(adminPage.getByLabel(/^Batch size/i)).toHaveValue('100');
  await expect(adminPage.getByLabel(/^Poll interval/i)).toHaveValue('1000');
});

test('NewStreaming: no "Test consumer" CTA — the shipped wizard goes straight from Configure to Create', async ({
  adminPage,
}) => {
  // Roadmap item: per-connector "test consumer". The streaming
  // wizard has no test step and no test/dry-run button; consumer
  // validation happens after creation on the source detail page.
  await new NewStreamingSourcePage(adminPage).goto();
  await adminPage.getByRole('button', { name: /Apache Kafka/i }).click();

  expect(
    await adminPage.getByRole('button', { name: /test consumer|test connection|dry[- ]?run/i }).count(),
  ).toBe(0);

  // Confirm the only forward action is "Create streaming source".
  await expect(
    adminPage.getByRole('button', { name: /^Create streaming source$/i }),
  ).toBeVisible();
});

test('NewStreaming: Create streaming source POSTs to /sources with connector_type=kafka and the contract config', async ({
  adminPage,
}) => {
  const create = await mockCreateSource(adminPage, 'source-kafka');

  await new NewStreamingSourcePage(adminPage).goto();
  await adminPage.getByRole('button', { name: /Apache Kafka/i }).click();

  await adminPage.getByLabel(/^bootstrap_servers/i).fill('broker-1:9092,broker-2:9092');
  await adminPage.getByLabel(/^topic\s*\*?$/i).fill('orders.raw');
  await adminPage.getByLabel(/^consumer_group/i).fill('openfoundry-orders');

  await adminPage.getByRole('button', { name: /^Create streaming source$/i }).click();

  await expect.poll(() => create.getPostBody()).toBeTruthy();
  const body = create.getPostBody();
  expect(body).toMatchObject({
    connector_type: 'kafka',
    worker: 'foundry',
    config: {
      streaming_source_kind: 'streaming_kafka',
      bootstrap_servers: 'broker-1:9092,broker-2:9092',
      topic: 'orders.raw',
      topics: ['orders.raw'],
      consumer_group: 'openfoundry-orders',
      batch_size: 100,
      poll_interval_ms: 1000,
      schema_inference: true,
    },
  });

  // On success the page navigates to /data-connection/sources/:id.
  await expect(adminPage).toHaveURL(/\/data-connection\/sources\/source-kafka(\?|#|$)/);
});

test('NewStreaming: /streaming-sources endpoint is queried on mount', async ({ adminPage }) => {
  // Regression guard for the contract-fetch — if the lazy chunk
  // skipped this call (eg. via accidental SSR-only effect) we'd
  // silently fall back to the local FALLBACK contracts forever.
  const calls = captureRequests(adminPage, /\/api\/v1\/data-connection\/streaming-sources/);
  await new NewStreamingSourcePage(adminPage).goto();
  await expect(adminPage.getByRole('button', { name: /Apache Kafka/i })).toBeVisible();
  expect(calls.count()).toBeGreaterThanOrEqual(1);
});

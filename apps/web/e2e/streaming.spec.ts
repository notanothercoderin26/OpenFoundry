import { type Page } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/streaming` and `/streaming/:id`
 * (apps/web/src/routes/streaming/StreamingPage.tsx,
 *  apps/web/src/routes/streaming/StreamingDetailPage.tsx).
 *
 * **Reality vs roadmap.** Both pages are JSON-editor surfaces over the
 * streaming-service contract. The shipped list page has FIVE tabs
 * (Overview / Streams / Windows / Topologies / Connectors) implemented
 * as plain `<button>` elements — not `role="tab"`. Each stream row is
 * rendered as `<li><strong>name</strong> · connector_type · status</li>`;
 * there is NO badge component for the status field. The shipped detail
 * page is keyed by `/streaming/:id` but resolves the id against the
 * **topologies** list (not streams) and renders three labelled `<pre>`
 * panels — Topology JSON, Runtime snapshot, Live tail — with a single
 * "Run topology" CTA. There is NO Overview / Messages / Consumers /
 * Schema / Settings tab layout, NO live SSE / WebSocket tail (a
 * one-shot GET on mount), NO Pause / Resume control, NO
 * Replay-from-timestamp form, and NO schema-evolution UI (the
 * `resetStream` / `listStreamViews` clients exist but are not wired).
 *
 * The roadmap controls below are folded into "absent today" regression
 * guards. When the implementation lands, those tests will fail loudly
 * and surface a checklist for the developer adding the feature.
 *
 * Endpoints exercised by the list page:
 *   - GET  /api/v1/streaming/overview
 *   - GET  /api/v1/streaming/streams
 *   - GET  /api/v1/streaming/windows
 *   - GET  /api/v1/streaming/topologies
 *   - GET  /api/v1/streaming/connectors
 *   - POST /api/v1/streaming/streams                       (create)
 *
 * Endpoints exercised by the detail page:
 *   - GET  /api/v1/streaming/topologies
 *   - GET  /api/v1/streaming/topologies/{id}/runtime
 *   - GET  /api/v1/streaming/live-tail
 *   - POST /api/v1/streaming/topologies/{id}/run           (Run CTA)
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Failed to load streaming/i,
      /Failed to load topology/i,
    ],
  },
});

const E2E_NOW = '2026-05-11T00:00:00Z';

const OVERVIEW = /\/api\/v1\/streaming\/overview(\?|$)/;
const STREAMS_LIST = /\/api\/v1\/streaming\/streams(\?|$)/;
const TOPOLOGIES_LIST = /\/api\/v1\/streaming\/topologies(\?|$)/;
const TOPOLOGY_RUNTIME = /\/api\/v1\/streaming\/topologies\/[^/]+\/runtime(\?|$)/;
const TOPOLOGY_REPLAY = /\/api\/v1\/streaming\/topologies\/[^/]+\/replay(\?|$)/;
const LIVE_TAIL = /\/api\/v1\/streaming\/live-tail(\?|$)/;
const STREAM_VIEWS = /\/api\/v1\/streaming\/streams\/[^/]+\/views(\?|$)/;
const STREAM_RESET = /\/api\/v1\/streaming\/streams\/[^/]+\/reset(\?|$)/;

interface StreamFixture {
  id: string;
  name: string;
  description: string;
  status: string;
  schema: {
    fields: Array<{ name: string; data_type: string; nullable: boolean; semantic_role: string }>;
    primary_key: string | null;
    watermark_field: string | null;
  };
  source_binding: {
    connector_type: string;
    endpoint: string;
    format: string;
    config: Record<string, unknown>;
  };
  retention_hours: number;
  partitions: number;
  consistency_guarantee: string;
  stream_profile: { high_throughput: boolean; compressed: boolean; partitions: number | null };
  stream_type: string;
  compression: boolean;
  ingest_consistency: string;
  pipeline_consistency: string;
  checkpoint_interval_ms: number;
  kind: string;
  created_at: string;
  updated_at: string;
}

function makeStream(overrides: Partial<StreamFixture> = {}): StreamFixture {
  return {
    id: 'stream-1',
    name: 'orders.events',
    description: 'Sample stream',
    status: 'active',
    schema: { fields: [], primary_key: null, watermark_field: null },
    source_binding: {
      connector_type: 'kafka',
      endpoint: 'kafka://orders',
      format: 'json',
      config: {},
    },
    retention_hours: 24,
    partitions: 1,
    consistency_guarantee: 'AT_LEAST_ONCE',
    stream_profile: { high_throughput: false, compressed: false, partitions: null },
    stream_type: 'STANDARD',
    compression: false,
    ingest_consistency: 'AT_LEAST_ONCE',
    pipeline_consistency: 'AT_LEAST_ONCE',
    checkpoint_interval_ms: 10_000,
    kind: 'INGEST',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

interface TopologyFixture {
  id: string;
  name: string;
  description: string;
  status: string;
  state_backend: string;
  source_stream_ids: string[];
  nodes: unknown[];
  edges: unknown[];
  join_definition: unknown | null;
  cep_definition: unknown | null;
  backpressure_policy: {
    max_in_flight: number;
    queue_capacity: number;
    throttle_strategy: string;
  };
  sink_bindings: unknown[];
  created_at: string;
  updated_at: string;
}

function makeTopology(overrides: Partial<TopologyFixture> = {}): TopologyFixture {
  return {
    id: 'topology-1',
    name: 'Revenue pipeline',
    description: 'Sample topology',
    status: 'active',
    state_backend: 'rocksdb',
    source_stream_ids: ['stream-1'],
    nodes: [],
    edges: [],
    join_definition: null,
    cep_definition: null,
    backpressure_policy: {
      max_in_flight: 100,
      queue_capacity: 1000,
      throttle_strategy: 'block',
    },
    sink_bindings: [],
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

async function mockOverview(page: Page): Promise<void> {
  await page.route(OVERVIEW, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        stream_count: 0,
        active_topology_count: 0,
        window_count: 0,
        connector_count: 0,
        running_topology_count: 0,
        backpressured_topology_count: 0,
        live_event_count: 0,
      },
    });
  });
}

async function mockStreamsList(page: Page, streams: StreamFixture[]): Promise<void> {
  await page.route(STREAMS_LIST, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: streams, next_cursor: null, total: streams.length },
    });
  });
}

async function mockTopologiesList(page: Page, topologies: TopologyFixture[]): Promise<void> {
  await page.route(TOPOLOGIES_LIST, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: topologies, next_cursor: null, total: topologies.length },
    });
  });
}

async function mockTopologyRuntime(page: Page, topology: TopologyFixture): Promise<void> {
  await page.route(TOPOLOGY_RUNTIME, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        topology,
        latest_run: null,
        preview: null,
        connector_statuses: [],
        latest_events: [],
        latest_matches: [],
      },
    });
  });
}

async function mockLiveTail(
  page: Page,
  events: Array<Record<string, unknown>> = [],
): Promise<void> {
  await page.route(LIVE_TAIL, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { events, matches: [] } });
  });
}

// ===========================================================================
// LIST PAGE — /streaming
// ===========================================================================

test.describe('list page (/streaming)', () => {
  test('Streams tab lists the stream rows fetched from GET /streaming/streams', async ({
    adminPage,
  }) => {
    const streams = [
      makeStream({ id: 'stream-1', name: 'orders.events', status: 'active' }),
      makeStream({
        id: 'stream-2',
        name: 'inventory.updates',
        status: 'paused',
        source_binding: {
          connector_type: 'kinesis',
          endpoint: 'kinesis://inventory',
          format: 'json',
          config: {},
        },
      }),
      makeStream({
        id: 'stream-3',
        name: 'payments.dlq',
        status: 'error',
        source_binding: {
          connector_type: 'pulsar',
          endpoint: 'pulsar://payments',
          format: 'json',
          config: {},
        },
      }),
    ];
    await mockOverview(adminPage);
    await mockStreamsList(adminPage, streams);
    const listCalls = captureRequests(adminPage, STREAMS_LIST);

    await adminPage.goto('/streaming');
    await expect(
      adminPage.getByRole('heading', { level: 1, name: /^streaming$/i }),
    ).toBeVisible();

    // The tabs are plain <button>s, not role="tab". Pick the nav tab by
    // anchored name so the "Create stream" CTA below doesn't false-match.
    await adminPage.getByRole('button', { name: /^streams$/i }).click();

    await expect(adminPage.getByText(/Streams \(3\)/i)).toBeVisible();
    await expect(adminPage.getByText('orders.events')).toBeVisible();
    await expect(adminPage.getByText('inventory.updates')).toBeVisible();
    await expect(adminPage.getByText('payments.dlq')).toBeVisible();

    // Both connector type and status are rendered inline next to the name.
    await expect(adminPage.getByText(/orders\.events.*kafka.*active/)).toBeVisible();
    await expect(adminPage.getByText(/inventory\.updates.*kinesis.*paused/)).toBeVisible();
    await expect(adminPage.getByText(/payments\.dlq.*pulsar.*error/)).toBeVisible();

    expect(listCalls.calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(0);
  });

  test('Create stream submits POST /streaming/streams with the editor JSON', async ({
    adminPage,
  }) => {
    await mockOverview(adminPage);
    await mockStreamsList(adminPage, []);
    const calls = captureRequests(adminPage, STREAMS_LIST);

    await adminPage.goto('/streaming');
    await adminPage.getByRole('button', { name: /^streams$/i }).click();
    await expect(adminPage.getByText(/Streams \(0\)/i)).toBeVisible();

    // The Create button submits the textarea JSON; the default mocks
    // catch-all returns 201 for POSTs that no test handler intercepts.
    await adminPage.getByRole('button', { name: /^create stream$/i }).click();

    await expect
      .poll(() => calls.calls.filter((c) => c.method === 'POST').length)
      .toBe(1);

    const post = calls.calls.find((c) => c.method === 'POST');
    // The shipped page pre-fills "Orders Ingress" as the default stream
    // name. If that default ever changes, update this assertion.
    expect(post?.body).toMatchObject({ name: 'Orders Ingress' });
  });

  test('status renders as plain text — badge component absent today', async ({
    adminPage,
  }) => {
    // Pin reality: status is just text appended after a "·" separator
    // ("name · connector_type · status"). When a Badge component lands,
    // replace the regression guards below with positive assertions for
    // the new element (role="status", data-status="...", or whatever
    // selector the new component exposes).
    const streams = [
      makeStream({ id: 'stream-active', name: 'active.events', status: 'active' }),
      makeStream({ id: 'stream-paused', name: 'paused.events', status: 'paused' }),
      makeStream({ id: 'stream-error', name: 'error.events', status: 'error' }),
    ];
    await mockOverview(adminPage);
    await mockStreamsList(adminPage, streams);

    await adminPage.goto('/streaming');
    await adminPage.getByRole('button', { name: /^streams$/i }).click();
    await expect(adminPage.getByText(/Streams \(3\)/i)).toBeVisible();

    // All three statuses appear inline as plain text alongside the name.
    await expect(adminPage.getByText(/active\.events.*active/)).toBeVisible();
    await expect(adminPage.getByText(/paused\.events.*paused/)).toBeVisible();
    await expect(adminPage.getByText(/error\.events.*error/)).toBeVisible();

    // Likely future selectors for a status-badge component — none exist
    // today. The error-banner uses `.of-status-danger` and lives outside
    // the list, so it's left out on purpose.
    expect(
      await adminPage
        .locator('[data-status="active"], [data-status="paused"], [data-status="error"]')
        .count(),
    ).toBe(0);
    expect(
      await adminPage
        .locator('.badge, .of-badge, [data-testid*="status-badge"]')
        .count(),
    ).toBe(0);
  });
});

// ===========================================================================
// DETAIL PAGE — /streaming/:id
// ===========================================================================

test.describe('detail page (/streaming/:id)', () => {
  test('absent today: Overview / Messages / Consumers / Schema / Settings tabs', async ({
    adminPage,
  }) => {
    const topology = makeTopology({ id: 'topology-1', name: 'Revenue pipeline' });
    await mockTopologiesList(adminPage, [topology]);
    await mockTopologyRuntime(adminPage, topology);
    await mockLiveTail(adminPage);

    await adminPage.goto('/streaming/topology-1');
    await expect(
      adminPage.getByRole('heading', { level: 1, name: /revenue pipeline/i }),
    ).toBeVisible();

    // The roadmap expects role="tab" elements with these names. The
    // shipped detail page renders three labelled <pre> panels instead.
    for (const label of [
      /^overview$/i,
      /^messages$/i,
      /^consumers$/i,
      /^schema$/i,
      /^settings$/i,
    ]) {
      expect(await adminPage.getByRole('tab', { name: label }).count()).toBe(0);
    }

    // The three "section" panels visible today (eyebrow labels).
    await expect(adminPage.getByText(/^topology json$/i)).toBeVisible();
    await expect(adminPage.getByText(/^runtime snapshot$/i)).toBeVisible();
    await expect(adminPage.getByText(/^live tail$/i)).toBeVisible();
  });

  test('live tail is a one-shot GET — no SSE or WebSocket streaming today', async ({
    adminPage,
  }) => {
    const topology = makeTopology({ id: 'topology-1' });
    await mockTopologiesList(adminPage, [topology]);
    await mockTopologyRuntime(adminPage, topology);
    await mockLiveTail(adminPage, [{ sequence_no: 1, msg: 'hello' }]);
    const tailCalls = captureRequests(adminPage, LIVE_TAIL);

    // Trap any WebSocket the page might open — the roadmap calls for a
    // live tail over SSE / WS, but the shipped page only fetches once.
    const wsConnections: string[] = [];
    adminPage.on('websocket', (ws) => wsConnections.push(ws.url()));

    await adminPage.goto('/streaming/topology-1');
    await expect(
      adminPage.getByRole('heading', { level: 1, name: /revenue pipeline/i }),
    ).toBeVisible();

    // Give a tail loop a chance to fire — none should.
    await adminPage.waitForTimeout(750);

    expect(tailCalls.calls.filter((c) => c.method === 'GET').length).toBe(1);
    expect(
      wsConnections.filter((u) => /live-tail|streaming/i.test(u)).length,
    ).toBe(0);
    expect(await adminPage.getByText(/event source|server-sent/i).count()).toBe(0);

    // The mocked payload makes it through to the rendered JSON dump.
    await expect(
      adminPage.locator('pre').filter({ hasText: /"msg":\s*"hello"/ }).first(),
    ).toBeVisible();
  });

  test('absent today: pause / resume controls (only Run topology is wired)', async ({
    adminPage,
  }) => {
    const topology = makeTopology({ id: 'topology-1', status: 'active' });
    await mockTopologiesList(adminPage, [topology]);
    await mockTopologyRuntime(adminPage, topology);
    await mockLiveTail(adminPage);

    await adminPage.goto('/streaming/topology-1');
    await expect(
      adminPage.getByRole('heading', { level: 1, name: /revenue pipeline/i }),
    ).toBeVisible();

    // The shipped CTA — kept passing as a positive assertion so a
    // future refactor that removes/renames it surfaces here too.
    await expect(adminPage.getByRole('button', { name: /run topology/i })).toBeVisible();

    // Roadmap controls — absent today.
    expect(await adminPage.getByRole('button', { name: /^pause$/i }).count()).toBe(0);
    expect(await adminPage.getByRole('button', { name: /^resume$/i }).count()).toBe(0);
    expect(
      await adminPage.getByRole('button', { name: /pause (stream|topology)/i }).count(),
    ).toBe(0);
    expect(
      await adminPage.getByRole('button', { name: /resume (stream|topology)/i }).count(),
    ).toBe(0);
  });

  test('absent today: replay-from-timestamp form', async ({ adminPage }) => {
    const topology = makeTopology({ id: 'topology-1' });
    await mockTopologiesList(adminPage, [topology]);
    await mockTopologyRuntime(adminPage, topology);
    await mockLiveTail(adminPage);
    const replayCalls = captureRequests(adminPage, TOPOLOGY_REPLAY);

    await adminPage.goto('/streaming/topology-1');
    await expect(
      adminPage.getByRole('heading', { level: 1, name: /revenue pipeline/i }),
    ).toBeVisible();

    // `replayTopology` is wired in lib/api/streaming.ts but has no UI.
    expect(await adminPage.getByRole('button', { name: /^replay$/i }).count()).toBe(0);
    expect(
      await adminPage.getByRole('button', { name: /replay from/i }).count(),
    ).toBe(0);
    expect(
      await adminPage.getByLabel(/from timestamp|replay from/i).count(),
    ).toBe(0);
    expect(await adminPage.locator('input[type="datetime-local"]').count()).toBe(0);

    // No POST to /replay should fire automatically on mount.
    await adminPage.waitForTimeout(500);
    expect(replayCalls.calls.filter((c) => c.method === 'POST').length).toBe(0);
  });

  test('absent today: schema-evolution UI', async ({ adminPage }) => {
    const topology = makeTopology({ id: 'topology-1' });
    await mockTopologiesList(adminPage, [topology]);
    await mockTopologyRuntime(adminPage, topology);
    await mockLiveTail(adminPage);

    // Both `resetStream` (POST /streams/:id/reset) and `listStreamViews`
    // (GET /streams/:id/views) are wired in lib/api/streaming.ts but
    // neither has a UI on the detail page today.
    const viewsCalls = captureRequests(adminPage, STREAM_VIEWS);
    const resetCalls = captureRequests(adminPage, STREAM_RESET);

    await adminPage.goto('/streaming/topology-1');
    await expect(
      adminPage.getByRole('heading', { level: 1, name: /revenue pipeline/i }),
    ).toBeVisible();

    await adminPage.waitForTimeout(500);

    expect(
      await adminPage
        .getByRole('button', { name: /reset schema|evolve schema|new schema version/i })
        .count(),
    ).toBe(0);
    expect(
      await adminPage
        .getByRole('heading', { name: /schema (history|evolution|versions)/i })
        .count(),
    ).toBe(0);
    expect(
      await adminPage
        .locator('[data-testid*="schema-evolution"], [data-testid*="schema-history"]')
        .count(),
    ).toBe(0);
    expect(viewsCalls.count()).toBe(0);
    expect(resetCalls.count()).toBe(0);
  });
});

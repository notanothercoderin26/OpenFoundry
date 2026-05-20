import { type Page, type Route } from '@playwright/test';
import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/control-panel/streaming-profiles`
 * (apps/web/src/routes/control-panel/StreamingProfilesPage.tsx).
 *
 * **Reality check.** Per ADR-0046 these are reusable **streaming-
 * pipeline templates** (connector + parallelism + watermark policy +
 * source JSON), not Kafka-topic profiles. The page composes:
 *
 *   - Header + "+ New profile" button.
 *   - Two filter selects: Status (`active|paused|error|draft`),
 *     Connector type (Kafka/Kinesis/SQS/PubSub/Aveva PI/External).
 *   - Profiles `<table>` — Name (clickable, opens edit modal) /
 *     Connector / Status badge / Last event / Throughput / Updated /
 *     Actions (Edit, Pause/Resume, Delete).
 *   - `ProfileFormModal` (create + edit, gated by client-side
 *     validation — Name required, source_config must be a JSON
 *     object) → POST or PATCH.
 *   - `ConfirmDialog` for Delete that surfaces the "Pipelines that
 *     reference this profile id will fail until reattached" copy
 *     and then DELETEs.
 *
 * The page exposes connector + parallelism + watermark + checkpoint
 * interval + JSON source_config — there is NO compression / retention
 * / partitions field today (those live inside the connector-specific
 * `source_config` JSON when the underlying broker supports them).
 * The spec PINS the shipped form + table behaviour and adds an
 * absent-today regression guard for those typed fields.
 *
 * Endpoints (mirrors `src/lib/api/control-panel.ts`):
 *   - GET    /api/v1/control-panel/streaming-profiles[?status=…&connector_type=…]
 *   - POST   /api/v1/control-panel/streaming-profiles
 *   - PATCH  /api/v1/control-panel/streaming-profiles/:id
 *   - DELETE /api/v1/control-panel/streaming-profiles/:id
 *   - POST   /api/v1/control-panel/streaming-profiles/:id:pause
 *   - POST   /api/v1/control-panel/streaming-profiles/:id:resume
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

type StreamingProfileStatus = 'active' | 'paused' | 'error' | 'draft';
type StreamingProfileConnectorType =
  | 'streaming_kafka'
  | 'streaming_kinesis'
  | 'streaming_sqs'
  | 'streaming_pubsub'
  | 'streaming_aveva_pi'
  | 'streaming_external';

interface StreamingProfile {
  id: string;
  name: string;
  description?: string;
  connector_type: StreamingProfileConnectorType;
  status: StreamingProfileStatus;
  parallelism: number;
  watermark_policy: 'none' | 'bounded_out_of_orderness' | 'monotonic_event_time' | 'ingestion_time';
  checkpoint_interval_ms: number;
  source_config: Record<string, unknown>;
  destination_dataset_id?: string;
  last_event_at?: string;
  throughput_eps?: number;
  created_by?: string;
  created_at?: string;
  updated_by?: string;
  updated_at?: string;
}

const E2E_NOW = '2026-05-11T00:00:00Z';

function makeProfile(overrides: Partial<StreamingProfile> = {}): StreamingProfile {
  return {
    id: 'profile-1',
    name: 'Customer events',
    description: 'Kafka stream from ext.customers',
    connector_type: 'streaming_kafka',
    status: 'active',
    parallelism: 4,
    watermark_policy: 'bounded_out_of_orderness',
    checkpoint_interval_ms: 30000,
    source_config: { brokers: ['kafka:9092'], topic: 'customers' },
    destination_dataset_id: 'ri.dataset.cust',
    last_event_at: '2026-05-10T22:00:00Z',
    throughput_eps: 12.5,
    created_by: 'admin-user',
    created_at: E2E_NOW,
    updated_by: 'admin-user',
    updated_at: E2E_NOW,
    ...overrides,
  };
}

const KAFKA_ACTIVE = makeProfile({
  id: 'p-kafka',
  name: 'Customer events',
  connector_type: 'streaming_kafka',
  status: 'active',
});
const KINESIS_PAUSED = makeProfile({
  id: 'p-kinesis',
  name: 'Order stream',
  description: 'Kinesis ingest from prod-orders',
  connector_type: 'streaming_kinesis',
  status: 'paused',
  parallelism: 2,
  watermark_policy: 'monotonic_event_time',
  checkpoint_interval_ms: 10000,
  source_config: { stream_name: 'prod-orders', shard_count: 4 },
});
const PUBSUB_ERROR = makeProfile({
  id: 'p-pubsub',
  name: 'Sensor telemetry',
  connector_type: 'streaming_pubsub',
  status: 'error',
  last_event_at: undefined,
  throughput_eps: undefined,
});

// Endpoint patterns
const PROFILES_LIST = /\/api\/v1\/control-panel\/streaming-profiles(?:\?|$)/;
const PROFILE_PATCH_DELETE = (id: string) =>
  new RegExp(`/api/v1/control-panel/streaming-profiles/${id}$`);
const PROFILE_PAUSE = (id: string) =>
  new RegExp(`/api/v1/control-panel/streaming-profiles/${id}:pause$`);
const PROFILE_RESUME = (id: string) =>
  new RegExp(`/api/v1/control-panel/streaming-profiles/${id}:resume$`);

interface MockOpts {
  profiles?: StreamingProfile[];
}

async function mockProfiles(page: Page, opts: MockOpts = {}) {
  const profiles = opts.profiles ?? [];
  await page.route(PROFILES_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const status = url.searchParams.get('status') ?? '';
    const connector = url.searchParams.get('connector_type') ?? '';
    let filtered = profiles.slice();
    if (status) filtered = filtered.filter((p) => p.status === status);
    if (connector) filtered = filtered.filter((p) => p.connector_type === connector);
    await route.fulfill({ json: { items: filtered, total: filtered.length } });
  });
  return captureRequests(page, PROFILES_LIST);
}

async function waitForRequest(
  cap: ReturnType<typeof captureRequests>,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
): Promise<{ method: string; body: unknown; url: string }> {
  await expect
    .poll(() => cap.calls.filter((c) => c.method === method).length)
    .toBeGreaterThanOrEqual(1);
  const matching = cap.calls.filter((c) => c.method === method);
  return matching[matching.length - 1];
}

function profileRow(page: Page, name: string) {
  return page.getByRole('row', { name: new RegExp(name) });
}

// ---------------------------------------------------------------------------
// List + filters
// ---------------------------------------------------------------------------

test('lists streaming profiles + status / connector filters narrow the GET request', async ({
  adminPage,
}) => {
  const cap = await mockProfiles(adminPage, {
    profiles: [KAFKA_ACTIVE, KINESIS_PAUSED, PUBSUB_ERROR],
  });
  await adminPage.goto('/control-panel/streaming-profiles');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^streaming profiles$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /^← control panel$/i }),
  ).toHaveAttribute('href', /\/control-panel$/);

  // All 3 rows render with the connector label (mapped from the
  // ENUM value via CONNECTOR_LABELS).
  await expect(profileRow(adminPage, 'Customer events')).toContainText('Apache Kafka');
  await expect(profileRow(adminPage, 'Order stream')).toContainText('Amazon Kinesis');
  await expect(profileRow(adminPage, 'Sensor telemetry')).toContainText('Google Cloud Pub/Sub');

  // Status badges per row.
  await expect(profileRow(adminPage, 'Customer events')).toContainText('active');
  await expect(profileRow(adminPage, 'Order stream')).toContainText('paused');
  await expect(profileRow(adminPage, 'Sensor telemetry')).toContainText('error');

  // Throughput formatted as "12.5 eps"; absent on the pubsub row → "—".
  await expect(profileRow(adminPage, 'Customer events')).toContainText('12.5 eps');
  await expect(profileRow(adminPage, 'Sensor telemetry')).toContainText('—');

  const before = cap.calls.length;

  // Status filter exposes the four shipped values.
  const statusSelect = adminPage.getByLabel(/status filter/i);
  const statusValues = await statusSelect.locator('option').evaluateAll((els) =>
    (els as HTMLOptionElement[]).map((el) => el.value),
  );
  expect(statusValues).toEqual(['', 'active', 'paused', 'error', 'draft']);

  // Filter by paused → request carries `status=paused` and only Kinesis row remains.
  await statusSelect.selectOption('paused');
  await expect.poll(() => cap.calls.length).toBeGreaterThan(before);
  expect(cap.last()?.url).toContain('status=paused');
  await expect(profileRow(adminPage, 'Order stream')).toBeVisible();
  await expect(profileRow(adminPage, 'Customer events')).toHaveCount(0);

  // Connector filter exposes the six shipped values.
  const connectorSelect = adminPage.getByLabel(/connector type filter/i);
  const connectorValues = await connectorSelect.locator('option').evaluateAll((els) =>
    (els as HTMLOptionElement[]).map((el) => el.value),
  );
  expect(connectorValues).toEqual([
    '',
    'streaming_kafka',
    'streaming_kinesis',
    'streaming_sqs',
    'streaming_pubsub',
    'streaming_aveva_pi',
    'streaming_external',
  ]);
});

// ---------------------------------------------------------------------------
// Create — opens the modal, validates source_config JSON, then POSTs
// ---------------------------------------------------------------------------

test('create profile: opens modal, validates source_config JSON, POSTs body on submit', async ({
  adminPage,
}) => {
  const cap = await mockProfiles(adminPage, { profiles: [] });
  await adminPage.route(PROFILES_LIST, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: makeProfile({
        id: 'p-new-1',
        name: 'New ingest',
        connector_type: 'streaming_sqs',
      }),
    });
  });

  await adminPage.goto('/control-panel/streaming-profiles');
  await adminPage.getByRole('button', { name: /^\+ new profile$/i }).click();

  // The modal title is rendered as a `<div className="of-heading-sm">`
  // (not a semantic <h*>) but is wired via `aria-labelledby` to the
  // dialog — so the dialog's accessible name carries the title.
  const dialog = adminPage.getByRole('dialog', { name: /new streaming profile/i });
  await expect(dialog).toBeVisible();

  // Source_config invalidation surfaces inline + blocks submit.
  const sourceField = dialog.getByRole('textbox', { name: /source config/i });
  await sourceField.fill('not json');
  await expect(dialog.getByText(/source_config must be valid json/i)).toBeVisible();

  // Fix it + fill the rest. Name is required (form-level validation).
  await sourceField.fill(JSON.stringify({ queue_url: 'https://sqs/.../prod-events' }));
  await dialog.getByRole('textbox', { name: /^name$/i }).fill('New ingest');
  await dialog.getByRole('textbox', { name: /^description$/i }).fill('SQS ingest pipeline.');
  await dialog
    .getByRole('combobox', { name: /^connector type$/i })
    .selectOption('streaming_sqs');
  await dialog
    .getByRole('combobox', { name: /^initial status$/i })
    .selectOption('draft');
  await dialog
    .getByRole('spinbutton', { name: /^parallelism$/i })
    .fill('8');
  await dialog
    .getByRole('spinbutton', { name: /checkpoint interval/i })
    .fill('60000');
  await dialog
    .getByRole('combobox', { name: /watermark policy/i })
    .selectOption('ingestion_time');
  await dialog
    .getByRole('textbox', { name: /destination dataset id/i })
    .fill('ri.dataset.events');

  await dialog.getByRole('button', { name: /^create$/i }).click();

  const post = await waitForRequest(cap, 'POST');
  expect(post.body).toMatchObject({
    name: 'New ingest',
    description: 'SQS ingest pipeline.',
    connector_type: 'streaming_sqs',
    status: 'draft',
    parallelism: 8,
    watermark_policy: 'ingestion_time',
    checkpoint_interval_ms: 60000,
    source_config: { queue_url: 'https://sqs/.../prod-events' },
    destination_dataset_id: 'ri.dataset.events',
  });

  // Modal closes after success; the list refreshes (another GET fires).
  await expect(adminPage.getByRole('dialog')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Edit — clicking the row name opens the edit modal, PATCH on submit
// ---------------------------------------------------------------------------

test('edit profile: row click opens the edit modal pre-populated; submit PATCHes /streaming-profiles/:id', async ({
  adminPage,
}) => {
  await mockProfiles(adminPage, { profiles: [KAFKA_ACTIVE] });
  const cap = captureRequests(adminPage, PROFILE_PATCH_DELETE(KAFKA_ACTIVE.id));
  await adminPage.route(PROFILE_PATCH_DELETE(KAFKA_ACTIVE.id), async (route: Route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await route.fulfill({
      json: makeProfile({ ...KAFKA_ACTIVE, parallelism: 16 }),
    });
  });

  await adminPage.goto('/control-panel/streaming-profiles');
  await profileRow(adminPage, 'Customer events').getByRole('button', { name: /^edit$/i }).click();

  // Same dialog-name pattern as the create test — the modal title is
  // a class-styled `<div>`, exposed via `aria-labelledby`.
  const dialog = adminPage.getByRole('dialog', { name: /edit streaming profile/i });
  await expect(dialog).toBeVisible();
  // Fields pre-populated from the profile (round-trip the JSON via
  // JSON.stringify in profileToForm).
  await expect(dialog.getByRole('textbox', { name: /^name$/i })).toHaveValue('Customer events');
  await expect(dialog.getByRole('spinbutton', { name: /^parallelism$/i })).toHaveValue('4');

  // In edit mode the status is rendered as plain text (use pause/resume
  // to change it) — pin the absence of the Initial-status select.
  expect(await dialog.getByRole('combobox', { name: /^initial status$/i }).count()).toBe(0);
  await expect(dialog.getByText(/status \(use pause\/resume to change\)/i)).toBeVisible();

  // Bump parallelism + Save.
  await dialog.getByRole('spinbutton', { name: /^parallelism$/i }).fill('16');
  await dialog.getByRole('button', { name: /^save$/i }).click();

  const patch = await waitForRequest(cap, 'PATCH');
  expect(patch.body).toMatchObject({
    name: 'Customer events',
    connector_type: 'streaming_kafka',
    parallelism: 16,
    watermark_policy: 'bounded_out_of_orderness',
    checkpoint_interval_ms: 30000,
    source_config: { brokers: ['kafka:9092'], topic: 'customers' },
  });
});

// ---------------------------------------------------------------------------
// Pause / Resume — both endpoints round-trip
// ---------------------------------------------------------------------------

test('pause + resume: row action POSTs to :pause / :resume and refreshes the list', async ({
  adminPage,
}) => {
  await mockProfiles(adminPage, { profiles: [KAFKA_ACTIVE, KINESIS_PAUSED] });
  const pauseCap = captureRequests(adminPage, PROFILE_PAUSE(KAFKA_ACTIVE.id));
  const resumeCap = captureRequests(adminPage, PROFILE_RESUME(KINESIS_PAUSED.id));
  await adminPage.route(PROFILE_PAUSE(KAFKA_ACTIVE.id), async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({ json: makeProfile({ ...KAFKA_ACTIVE, status: 'paused' }) });
  });
  await adminPage.route(PROFILE_RESUME(KINESIS_PAUSED.id), async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({ json: makeProfile({ ...KINESIS_PAUSED, status: 'active' }) });
  });

  await adminPage.goto('/control-panel/streaming-profiles');

  // Active row shows "Pause"; paused row shows "Resume".
  await expect(profileRow(adminPage, 'Customer events').getByRole('button', { name: /^pause$/i })).toBeVisible();
  await expect(profileRow(adminPage, 'Order stream').getByRole('button', { name: /^resume$/i })).toBeVisible();

  await profileRow(adminPage, 'Customer events').getByRole('button', { name: /^pause$/i }).click();
  await expect.poll(() => pauseCap.count()).toBeGreaterThanOrEqual(1);
  expect(pauseCap.last()?.method).toBe('POST');

  await profileRow(adminPage, 'Order stream').getByRole('button', { name: /^resume$/i }).click();
  await expect.poll(() => resumeCap.count()).toBeGreaterThanOrEqual(1);
  expect(resumeCap.last()?.method).toBe('POST');
});

test('pause / resume button is disabled for profiles in error status', async ({
  adminPage,
}) => {
  await mockProfiles(adminPage, { profiles: [PUBSUB_ERROR] });
  await adminPage.goto('/control-panel/streaming-profiles');

  const row = profileRow(adminPage, 'Sensor telemetry');
  // Error-status row exposes "Pause" (default label) but the button is disabled.
  await expect(row.getByRole('button', { name: /^pause$/i })).toBeDisabled();
});

// ---------------------------------------------------------------------------
// Delete — opens ConfirmDialog → DELETE
// ---------------------------------------------------------------------------

test('delete profile: opens the confirm dialog with the cascading-pipelines copy + DELETEs on confirm', async ({
  adminPage,
}) => {
  await mockProfiles(adminPage, { profiles: [KAFKA_ACTIVE] });
  const cap = captureRequests(adminPage, PROFILE_PATCH_DELETE(KAFKA_ACTIVE.id));
  await adminPage.route(PROFILE_PATCH_DELETE(KAFKA_ACTIVE.id), async (route: Route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    await route.fulfill({ status: 204, body: '' });
  });

  await adminPage.goto('/control-panel/streaming-profiles');
  await profileRow(adminPage, 'Customer events').getByRole('button', { name: /^delete$/i }).click();

  // The ConfirmDialog renders with the dataset-pipeline warning copy.
  const confirmDialog = adminPage
    .getByRole('dialog', { name: /delete streaming profile/i });
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog).toContainText(
    /delete "customer events"\?\s+pipelines that reference this profile id will fail/i,
  );

  await confirmDialog.getByRole('button', { name: /^delete$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('DELETE');
  await expect(adminPage.getByRole('dialog', { name: /delete streaming profile/i })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Absent today — the requested compression / retention / partitions fields
// ---------------------------------------------------------------------------

test('absent today: typed compression / retention / partitions inputs on the profile form', async ({
  adminPage,
}) => {
  await mockProfiles(adminPage, { profiles: [KAFKA_ACTIVE] });
  await adminPage.goto('/control-panel/streaming-profiles');
  await adminPage.getByRole('button', { name: /^\+ new profile$/i }).click();
  const dialog = adminPage.getByRole('dialog', { name: /new streaming profile/i });
  await expect(dialog).toBeVisible();

  // The shipped knobs are: connector_type, status, parallelism,
  // watermark_policy, checkpoint_interval_ms, source_config (JSON),
  // destination_dataset_id. Per-broker compression / retention /
  // partition counts live inside the connector-specific source_config
  // JSON — there is no dedicated typed field for them today.
  expect(
    await dialog.getByRole('combobox', { name: /^compression$|compression codec/i }).count(),
  ).toBe(0);
  expect(
    await dialog.getByRole('textbox', { name: /^compression$|compression codec/i }).count(),
  ).toBe(0);
  expect(
    await dialog.getByRole('spinbutton', { name: /retention( hours| ms| days)?$|retention_(hours|ms|days)/i }).count(),
  ).toBe(0);
  expect(
    await dialog.getByRole('spinbutton', { name: /partitions|partition count|num_partitions/i }).count(),
  ).toBe(0);

  // Sanity: the JSON source_config field IS the canonical surface for
  // these broker-specific options today.
  await expect(
    dialog.getByRole('textbox', { name: /source config/i }),
  ).toBeVisible();
});

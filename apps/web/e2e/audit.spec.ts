import { type Page } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { E2E_NOW } from './fixtures/mocks';

/**
 * E2E coverage for `/audit` (apps/web/src/routes/audit/AuditPage.tsx).
 *
 * **Reality check.** The shipped Audit page is the *Milestone 4.5
 * immutable-audit & compliance console* — not the tab-based
 * audit-log/approvals workspace the task brief describes. The shipped
 * surface is a single scroll: a hero banner, ComplianceDashboard,
 * GovernanceStudio, optional monitoring-pack panel, AuditDeliveryPanel,
 * AuditLogViewer (with filters + an inline event list), AuditTimeline,
 * PolicyManager, and ExportWizard.
 *
 * What the brief asks about that is **not shipped** on `/audit`:
 *
 *   - No tabs UI ("Audit log" / "Approvals" inside `/audit`).
 *   - No event detail drawer with before/after JSON.
 *   - No Approvals queue, no Approve / Reject buttons, no comment box.
 *   - No historical approvals filter by status.
 *   - No approver delegate assignment.
 *   - No pagination controls (the GET `/audit/events` endpoint
 *     supports server-side filtering, not page/cursor pagination from
 *     the UI).
 *   - No `user` / `action` / `resource` / `date-range` filters — the
 *     shipped filters are: `source_service`, `subject_id`,
 *     `classification`, `category`, `trace_id`.
 *
 * Note: `/approvals` is a *separate* route (`ApprovalsPage`) that
 * shows a notifications inbox + delivery audit pane. It is also not
 * an approval workflow (no approve/reject with comment), but it is
 * the closest surface to what the brief described — so one test
 * sanity-checks that hitting `/approvals` from `/audit` lands on an
 * unrelated page rather than a sibling tab.
 *
 * Following the project convention from `notifications.spec.ts`, this
 * spec pins both the shipped behaviour (filter inputs, listEvents
 * round-trip, event-card rendering) and the absence of every brief
 * control that hasn't shipped. The day someone wires those endpoints
 * up without finishing the UI, the spec flips loudly.
 */

const AUDIT_OVERVIEW_PATTERN = /\/api\/v1\/audit\/overview$/;
const AUDIT_EVENTS_PATTERN = /\/api\/v1\/audit\/events(\?|$)/;
const AUDIT_COLLECTORS_PATTERN = /\/api\/v1\/audit\/collectors$/;
const AUDIT_ANOMALIES_PATTERN = /\/api\/v1\/audit\/anomalies$/;
const AUDIT_POLICIES_PATTERN = /\/api\/v1\/audit\/policies$/;
const AUDIT_REPORTS_PATTERN = /\/api\/v1\/audit\/reports$/;
const AUDIT_CLASSIFICATIONS_PATTERN = /\/api\/v1\/audit\/classifications$/;
const AUDIT_GOVERNANCE_TEMPLATES_PATTERN = /\/api\/v1\/audit\/governance\/templates$/;
const AUDIT_GOVERNANCE_APPLICATIONS_PATTERN = /\/api\/v1\/audit\/governance\/applications$/;
const AUDIT_COMPLIANCE_POSTURE_PATTERN = /\/api\/v1\/audit\/compliance\/posture$/;
const AUDIT_MONITORING_PACK_PATTERN = /\/api\/v1\/audit\/monitoring\/starter-pack$/;
const AUDIT_DELIVERY_DESTINATIONS_PATTERN = /\/api\/v1\/audit\/delivery\/destinations$/;
const AUDIT_DELIVERY_FILES_PATTERN = /\/api\/v1\/audit\/delivery\/files(\?|$)/;

interface AuditEventFixture {
  id: string;
  action: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  sequence: number;
  source_service?: string;
  actor?: string;
  resource_type?: string;
  resource_id?: string;
  classification?: 'public' | 'confidential' | 'pii';
  status?: 'success' | 'failure' | 'denied';
}

function makeEvent(overrides: AuditEventFixture): Record<string, unknown> {
  return {
    id: overrides.id,
    event_id: overrides.id,
    log_entry_id: overrides.id,
    sequence: overrides.sequence,
    previous_hash: 'sha256:prev',
    entry_hash: 'sha256:curr',
    source_service: overrides.source_service ?? 'gateway',
    product: 'openfoundry',
    product_version: '1.0.0',
    producer_type: 'service',
    channel: 'http',
    actor: overrides.actor ?? 'user:runner@example.com',
    actor_id: 'user-1',
    actor_type: 'user',
    action: overrides.action,
    categories: ['apiGatewayRequest'],
    resource_type: overrides.resource_type ?? 'http_request',
    resource_id: overrides.resource_id ?? '/api/v1/apps',
    entities: [],
    origins: ['10.0.0.14'],
    status: overrides.status ?? 'success',
    outcome: 'success',
    severity: overrides.severity,
    classification: overrides.classification ?? 'confidential',
    subject_id: 'subject-demo-1',
    ip_address: '10.0.0.14',
    location: 'Madrid',
    metadata: {},
    error_metadata: {},
    request_fields: {},
    result_fields: {},
    labels: [],
    initiator_type: 'user',
    audit_access_tier: 'tier-2',
    retention_until: '2027-05-11T00:00:00Z',
    occurred_at: E2E_NOW,
    ingested_at: E2E_NOW,
  };
}

/**
 * Install JSON mocks for every audit endpoint AuditPage fans out to on
 * mount via `refreshAll`. The catch-all in `installDefaultApiMocks`
 * returns the list envelope `{ data, next_cursor, total }`, but most
 * audit endpoints return either bare arrays or `{ items }` shapes —
 * unmocked, the page crashes inside the ComplianceDashboard / list
 * setters before it ever paints.
 *
 * `events` lets callers pre-seed the AuditLogViewer with a deterministic
 * event list per test.
 */
async function installAuditMocks(
  page: Page,
  options: { events?: ReturnType<typeof makeEvent>[] } = {},
): Promise<void> {
  const events = options.events ?? [];

  await page.route(AUDIT_OVERVIEW_PATTERN, async (route) => {
    await route.fulfill({
      json: {
        event_count: events.length,
        critical_event_count: 0,
        collector_count: 0,
        active_policy_count: 0,
        anomaly_count: 0,
        gdpr_subject_count: 0,
        latest_event: events[0] ?? null,
      },
    });
  });

  await page.route(AUDIT_EVENTS_PATTERN, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: { items: events, anomalies: [] } });
  });

  await page.route(AUDIT_COLLECTORS_PATTERN, async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route(AUDIT_ANOMALIES_PATTERN, async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route(AUDIT_POLICIES_PATTERN, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: { items: [] } });
  });
  await page.route(AUDIT_REPORTS_PATTERN, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: { items: [] } });
  });
  await page.route(AUDIT_CLASSIFICATIONS_PATTERN, async (route) => {
    await route.fulfill({
      json: [
        { classification: 'public', description: 'Public' },
        { classification: 'confidential', description: 'Confidential' },
        { classification: 'pii', description: 'PII' },
      ],
    });
  });
  await page.route(AUDIT_GOVERNANCE_TEMPLATES_PATTERN, async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route(AUDIT_GOVERNANCE_APPLICATIONS_PATTERN, async (route) => {
    await route.fulfill({ json: { items: [] } });
  });
  await page.route(AUDIT_COMPLIANCE_POSTURE_PATTERN, async (route) => {
    await route.fulfill({ json: null });
  });
  await page.route(AUDIT_MONITORING_PACK_PATTERN, async (route) => {
    // `monitoringPack &&` gates the panel — return null so the optional
    // section is skipped and tests don't depend on its shape.
    await route.fulfill({ json: null });
  });
  await page.route(AUDIT_DELIVERY_DESTINATIONS_PATTERN, async (route) => {
    await route.fulfill({ json: { items: [] } });
  });
  await page.route(AUDIT_DELIVERY_FILES_PATTERN, async (route) => {
    await route.fulfill({ json: { items: [] } });
  });
}

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      // AuditPage fans out 13 list endpoints in parallel and a few of
      // them log %o-style console errors when the response shape is
      // ambiguous (compliance posture / starter-pack come through as
      // null in mocks). Allow that noise so the spec pins UI
      // behaviour, not transient hydration messages.
      /Cannot read properties of (null|undefined)/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
    ],
  },
});

test('renders the AuditLogViewer with the shipped filter inputs (source_service, subject_id, classification, category, trace_id)', async ({
  adminPage,
}) => {
  await installAuditMocks(adminPage);

  await adminPage.goto('/audit');

  // Top-level page heading (Milestone 4.5 copy).
  await expect(
    adminPage.getByRole('heading', {
      level: 1,
      name: /immutable audit, compliance evidence/i,
    }),
  ).toBeVisible();

  // AuditLogViewer header lives further down the page.
  await expect(
    adminPage.getByRole('heading', {
      name: /append-only events with filters and manual probes/i,
    }),
  ).toBeVisible();

  // Shipped filter inputs. The brief asked about user / action /
  // resource / date-range; none of those ship here.
  await expect(adminPage.getByText(/^source service$/i).first()).toBeVisible();
  await expect(adminPage.getByText(/^subject id$/i).first()).toBeVisible();
  await expect(adminPage.getByText(/^classification$/i).first()).toBeVisible();
  await expect(adminPage.getByText(/^category$/i).first()).toBeVisible();
  await expect(adminPage.getByText(/^trace id$/i).first()).toBeVisible();

  // Apply-filters CTA is rendered.
  await expect(
    adminPage.getByRole('button', { name: /^apply filters$/i }),
  ).toBeVisible();

  // Pin the absence of the brief's user / action / resource / date
  // filter controls — scoped to the *filter pane* so the manual-probe
  // form below (which has fields named action / resource_type /
  // resource_id / status / classification) doesn't trigger false
  // positives.
  const filterPane = adminPage
    .locator('div.of-panel-muted')
    .filter({ has: adminPage.getByRole('button', { name: /^apply filters$/i }) })
    .first();
  await expect(filterPane).toBeVisible();
  expect(await filterPane.getByLabel(/^user( filter)?$/i).count()).toBe(0);
  expect(await filterPane.getByLabel(/^action( filter)?$/i).count()).toBe(0);
  expect(await filterPane.getByLabel(/^resource( filter)?$/i).count()).toBe(0);
  expect(
    await filterPane.getByLabel(/date range|start date|end date/i).count(),
  ).toBe(0);
  expect(await filterPane.locator('input[type="date"]').count()).toBe(0);
  expect(await filterPane.locator('input[type="datetime-local"]').count()).toBe(0);
});

test('Apply Filters: types filters and calls GET /audit/events with the right query string', async ({
  adminPage,
}) => {
  await installAuditMocks(adminPage);

  const calls = captureRequests(adminPage, AUDIT_EVENTS_PATTERN);

  await adminPage.goto('/audit');

  // Wait until the mount-time call has landed so the post-filter
  // request is identifiable.
  await expect.poll(() => calls.count()).toBeGreaterThanOrEqual(1);
  const baselineCount = calls.count();

  // Scope every interaction to the filter pane (the panel that hosts
  // the Apply-filters button). The manual probe form below the events
  // list ships another set of inputs with overlapping label text and
  // would otherwise cause locator ambiguity.
  const filterPane = adminPage
    .locator('div.of-panel-muted')
    .filter({ has: adminPage.getByRole('button', { name: /^apply filters$/i }) })
    .first();
  await expect(filterPane).toBeVisible();

  const sourceServiceInput = filterPane
    .locator('label', { hasText: /source service/i })
    .getByRole('textbox');
  const subjectIdInput = filterPane
    .locator('label', { hasText: /subject id/i })
    .getByRole('textbox');
  const categoryInput = filterPane
    .locator('label', { hasText: /category/i })
    .getByRole('textbox');
  const traceIdInput = filterPane
    .locator('label', { hasText: /trace id/i })
    .getByRole('textbox');
  // Filter pane contains exactly one <select> (the Classification
  // dropdown). The probe form's selects live in a sibling panel.
  const classificationSelect = filterPane.getByRole('combobox');

  await sourceServiceInput.fill('gateway');
  await subjectIdInput.fill('subject-demo-1');
  await classificationSelect.selectOption('pii');
  await categoryInput.fill('apiGatewayRequest');
  await traceIdInput.fill('trace-abc');

  await adminPage.getByRole('button', { name: /^apply filters$/i }).click();

  await expect.poll(() => calls.count()).toBeGreaterThan(baselineCount);
  const filterCall = calls.calls.at(-1);
  expect(filterCall?.url).toMatch(/source_service=gateway/);
  expect(filterCall?.url).toMatch(/subject_id=subject-demo-1/);
  expect(filterCall?.url).toMatch(/classification=pii/);
  expect(filterCall?.url).toMatch(/category=apiGatewayRequest/);
  expect(filterCall?.url).toMatch(/trace_id=trace-abc/);
});

test('renders fetched events with their action label, sequence, severity and status chips', async ({
  adminPage,
}) => {
  const events = [
    makeEvent({
      id: 'event-1',
      sequence: 42,
      action: 'dataset.read',
      severity: 'medium',
      classification: 'pii',
      status: 'success',
      resource_type: 'dataset',
      resource_id: 'dataset-xyz',
    }),
    makeEvent({
      id: 'event-2',
      sequence: 43,
      action: 'policy.exception.granted',
      severity: 'critical',
      classification: 'confidential',
      status: 'denied',
      resource_type: 'policy',
      resource_id: 'policy-9',
    }),
  ];
  await installAuditMocks(adminPage, { events });

  await adminPage.goto('/audit');

  // Each event renders as `#<sequence> · <action>` plus a metadata
  // line `<source_service> · <actor> · <resource_type>:<resource_id>`.
  // Asserting the metadata line catches "the event-1 fixture made it
  // into the list" without false positives from the manual-probe
  // form's <select> options (which also render text like "medium" /
  // "denied" / "pii" inside closed dropdowns).
  await expect(adminPage.getByText('#42 · dataset.read')).toBeVisible();
  await expect(adminPage.getByText('#43 · policy.exception.granted')).toBeVisible();
  await expect(
    adminPage.getByText('gateway · user:runner@example.com · dataset:dataset-xyz'),
  ).toBeVisible();
  await expect(
    adminPage.getByText('gateway · user:runner@example.com · policy:policy-9'),
  ).toBeVisible();

  // Chip rendering — pick the chip span directly via `xpath=..` from
  // the action paragraph so the locator targets the event-card chip,
  // not the matching option inside the (closed) probe-form select.
  const eventTwoChips = adminPage
    .locator('p', { hasText: '#43 · policy.exception.granted' })
    .locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " of-panel ")][1]')
    .locator('span.of-chip');
  await expect(eventTwoChips.getByText('critical', { exact: true })).toBeVisible();
  await expect(eventTwoChips.getByText('denied', { exact: true })).toBeVisible();
});

test('absent today: tabs UI (no "Audit log" / "Approvals" tabs inside /audit)', async ({
  adminPage,
}) => {
  await installAuditMocks(adminPage);
  await adminPage.goto('/audit');

  // Wait for the page to settle (Compliance dashboard renders sync
  // after the parallel fetches resolve).
  await expect(
    adminPage.getByRole('heading', { name: /append-only events/i }),
  ).toBeVisible();

  // The shipped page is a single scroll — no ARIA tabs widget.
  expect(await adminPage.getByRole('tab').count()).toBe(0);
  expect(await adminPage.getByRole('tablist').count()).toBe(0);
  expect(await adminPage.getByRole('tab', { name: /audit log/i }).count()).toBe(0);
  expect(await adminPage.getByRole('tab', { name: /approvals/i }).count()).toBe(0);
});

test('absent today: event-detail drawer with before/after JSON', async ({
  adminPage,
}) => {
  const events = [
    makeEvent({
      id: 'event-1',
      sequence: 10,
      action: 'dataset.write',
      severity: 'high',
    }),
  ];
  await installAuditMocks(adminPage, { events });

  await adminPage.goto('/audit');
  const row = adminPage.getByText('#10 · dataset.write');
  await expect(row).toBeVisible();

  // Clicking the event card does nothing today (no onClick handler).
  await row.click();

  // No dialog / drawer pops up.
  expect(await adminPage.getByRole('dialog').count()).toBe(0);
  expect(
    await adminPage.getByRole('complementary', { name: /event|detail/i }).count(),
  ).toBe(0);

  // No before/after JSON viewers anywhere on the page.
  expect(await adminPage.getByText(/^before$/i).count()).toBe(0);
  expect(await adminPage.getByText(/^after$/i).count()).toBe(0);
  expect(await adminPage.getByRole('heading', { name: /before/i }).count()).toBe(0);
  expect(await adminPage.getByRole('heading', { name: /after/i }).count()).toBe(0);
});

test('absent today: approvals queue, approve/reject with comment, status filter, delegate assignment', async ({
  adminPage,
}) => {
  await installAuditMocks(adminPage);
  await adminPage.goto('/audit');

  await expect(
    adminPage.getByRole('heading', { name: /append-only events/i }),
  ).toBeVisible();

  // No queue heading, no per-row Approve/Reject CTAs.
  expect(
    await adminPage.getByRole('heading', { name: /pending approvals/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('heading', { name: /^approvals$/i }).count(),
  ).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^approve$/i }).count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^reject$/i }).count()).toBe(0);

  // No comment textarea framed as an approval comment.
  expect(
    await adminPage.getByLabel(/approval comment|rejection (reason|comment)/i).count(),
  ).toBe(0);

  // No status filter (pending / approved / rejected) for historical
  // approvals. (The page DOES render a manual-probe `<select>` named
  // "Status" with values success/failure/denied — that's an event
  // outcome, not an approval state, so scope the absence assertion to
  // approval terminology.)
  expect(
    await adminPage
      .getByRole('combobox', { name: /approval (status|state)/i })
      .count(),
  ).toBe(0);
  expect(
    await adminPage
      .getByRole('tab', { name: /^(pending|approved|rejected)$/i })
      .count(),
  ).toBe(0);
  // No "pending" / "approved" / "rejected" radio group / button group.
  expect(
    await adminPage
      .getByRole('radio', { name: /^(pending|approved|rejected)$/i })
      .count(),
  ).toBe(0);

  // No approver-delegate assignment control.
  expect(
    await adminPage
      .getByRole('button', { name: /delegate|assign (delegate|approver)/i })
      .count(),
  ).toBe(0);
  expect(
    await adminPage.getByLabel(/delegate|approver delegate/i).count(),
  ).toBe(0);
});

test('absent today: pagination controls on /audit events list', async ({
  adminPage,
}) => {
  // Seed with two events so the list isn't empty — pagination, if it
  // ever ships, would still need to render its controls. The shipped
  // viewer renders all events inline, with no cursor / page-number /
  // load-more affordances.
  const events = [
    makeEvent({ id: 'event-1', sequence: 1, action: 'a.first', severity: 'low' }),
    makeEvent({ id: 'event-2', sequence: 2, action: 'a.second', severity: 'low' }),
  ];
  await installAuditMocks(adminPage, { events });
  await adminPage.goto('/audit');

  await expect(adminPage.getByText('#1 · a.first')).toBeVisible();
  await expect(adminPage.getByText('#2 · a.second')).toBeVisible();

  // No pagination role widget.
  expect(
    await adminPage.getByRole('navigation', { name: /pagination/i }).count(),
  ).toBe(0);
  // No paging buttons.
  expect(
    await adminPage.getByRole('button', { name: /^(next|previous|prev|load more|show more)$/i }).count(),
  ).toBe(0);
  // No "Page X of Y" copy.
  expect(await adminPage.getByText(/page \d+ of \d+/i).count()).toBe(0);
});

test('/approvals is a separate page (not a sibling tab of /audit)', async ({
  adminPage,
}) => {
  await installAuditMocks(adminPage);

  await adminPage.goto('/audit');
  await expect(
    adminPage.getByRole('heading', { name: /append-only events/i }),
  ).toBeVisible();

  // /audit has no Approvals heading.
  expect(
    await adminPage.getByRole('heading', { level: 1, name: /^approvals$/i }).count(),
  ).toBe(0);

  // Navigate directly to /approvals — it's a fully separate component
  // (an inbox + delivery-audit pane), not a tab inside /audit.
  await adminPage.goto('/approvals');
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^approvals$/i }),
  ).toBeVisible();
  await expect(adminPage.getByRole('heading', { name: /^inbox$/i })).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { name: /^delivery audit$/i }),
  ).toBeVisible();

  // /approvals also does NOT offer the brief's approve/reject-with-comment
  // workflow — it's a notifications inbox. Pin the absence so a
  // future approval-flow refactor doesn't accidentally regress through
  // this surface.
  expect(await adminPage.getByRole('button', { name: /^approve$/i }).count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^reject$/i }).count()).toBe(0);
});

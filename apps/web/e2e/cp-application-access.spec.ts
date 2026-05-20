import { type Page, type Route } from '@playwright/test';
import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/control-panel/application-access`
 * (apps/web/src/routes/control-panel/ApplicationAccessPage.tsx).
 *
 * **Reality check.** The page composes:
 *
 *   - A "UX scope only" warning panel — application access controls
 *     the launcher / sidebar / nav visibility only; server-side
 *     permissions still govern every API call.
 *   - "Snapshot" — five aggregate metrics (Status, Default,
 *     Applications, Rules, Pending).
 *   - "Configuration JSON" — single `JsonEditor` over the whole
 *     `application_access` slice of the control-panel payload, with
 *     an "Add block rule" helper (templates a new block rule from
 *     the Evaluate form's inputs) and a "Request or apply change"
 *     button that PUTs `/control-panel`.
 *   - "Evaluate visibility" — App ID + User ID + Org ID + Group IDs
 *     + Lifecycle stage, POSTs `/application-access/evaluate`, then
 *     renders per-application decision cards (visible / hidden +
 *     matched rules).
 *   - "Change requests" — pending / approved / rejected list with
 *     Approve / Reject buttons on pending entries (POSTs
 *     `/control-panel/application-access/change-requests/:id/decision`).
 *   - "History" — read-only audit list of past decisions.
 *
 * Mapping the requested cases:
 *
 *   - Case 1 (matriz de acceso por aplicación) ⚠️ — the page has
 *     aggregate Snapshot + per-app Evaluate cards, NOT a
 *     `apps × users/groups` grid. The configuration lives in JSON.
 *   - Case 2 (conceder/revocar acceso a usuario/grupo por app)
 *     ⚠️ — "Add block rule" templates a rule + Save persists it;
 *     pending change requests can be Approved or Rejected. There is
 *     NO typed per-(user, app) grant/revoke form.
 *   - Case 3 (filtros) ⚠️ — the Evaluate form acts as a query
 *     (returns decisions for one app at a time). The Change-requests
 *     / History lists have no filter inputs.
 *
 * Endpoints (mirrors `src/lib/api/control-panel.ts`):
 *   - GET   /api/v1/control-panel                                           → ControlPanelSettings
 *   - PUT   /api/v1/control-panel                                           → ControlPanelSettings
 *   - GET   /api/v1/control-panel/application-access/change-requests        → ApplicationAccessChangeRequestsResponse
 *   - POST  /api/v1/control-panel/application-access/change-requests/:id/decision → ApplicationAccessConfig
 *   - POST  /api/v1/application-access/evaluate                              → ApplicationAccessEvaluateResponse
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

interface AppAccessApplication {
  id: string;
  name: string;
  description?: string;
  category: string;
  lifecycle_stage: string;
  enabled: boolean;
}

interface AppAccessRule {
  id: string;
  name: string;
  effect: 'allow' | 'block';
  application_ids: string[];
  organization_ids: string[];
  user_ids: string[];
  group_ids: string[];
  lifecycle_stages: string[];
  enabled: boolean;
  reason?: string;
}

interface AppAccessChangeRequest {
  id: string;
  kind: string;
  status: string;
  summary: string;
  warning: string;
  requested_by: string;
  requested_at: string;
  decided_by?: string;
  decided_at?: string;
  applied_at?: string;
  comment?: string;
  proposed_config: ApplicationAccessConfig;
}

interface AppAccessHistoryEvent {
  id: string;
  request_id: string;
  kind: string;
  action: string;
  actor: string;
  timestamp: string;
  summary: string;
  warning: string;
  rule_count: number;
  application_count: number;
}

interface ApplicationAccessConfig {
  enabled: boolean;
  default_visibility: 'visible' | 'hidden';
  warning: string;
  applications: AppAccessApplication[];
  rules: AppAccessRule[];
  approval_policy: {
    mode: 'self_approve' | 'review_required';
    reviewer_user_ids: string[];
    reviewer_group_ids: string[];
    require_distinct_reviewer_for_policy: boolean;
    instructions?: string;
  };
  change_requests: AppAccessChangeRequest[];
  history: AppAccessHistoryEvent[];
}

const E2E_NOW = '2026-05-11T00:00:00Z';

const SEED_APPLICATIONS: AppAccessApplication[] = [
  { id: 'control-panel', name: 'Control panel', category: 'admin', lifecycle_stage: 'ga', enabled: true },
  { id: 'ai', name: 'AI assist', category: 'ai', lifecycle_stage: 'beta', enabled: true },
  { id: 'workshop', name: 'Workshop', category: 'apps', lifecycle_stage: 'ga', enabled: true },
];

const SEED_RULES: AppAccessRule[] = [
  {
    id: 'block-rule-1',
    name: 'Block rule 1',
    effect: 'block',
    application_ids: ['ai'],
    organization_ids: [],
    user_ids: [],
    group_ids: ['restricted-users'],
    lifecycle_stages: [],
    enabled: true,
    reason: 'AI assist disabled for restricted-users.',
  },
];

const PENDING_REQUEST: AppAccessChangeRequest = {
  id: 'req-1',
  kind: 'update_rules',
  status: 'pending',
  summary: 'Block "ai" for restricted-users',
  warning: 'Server-side permissions still apply.',
  requested_by: 'admin-user-1',
  requested_at: '2026-05-10T12:00:00Z',
  proposed_config: {
    enabled: true,
    default_visibility: 'visible',
    warning: '',
    applications: SEED_APPLICATIONS,
    rules: SEED_RULES,
    approval_policy: {
      mode: 'review_required',
      reviewer_user_ids: ['reviewer-1'],
      reviewer_group_ids: [],
      require_distinct_reviewer_for_policy: true,
    },
    change_requests: [],
    history: [],
  },
};

const APPROVED_REQUEST: AppAccessChangeRequest = {
  ...PENDING_REQUEST,
  id: 'req-old',
  status: 'approved',
  summary: 'Enable AI assist',
  decided_by: 'reviewer-1',
  decided_at: '2026-05-09T10:00:00Z',
  applied_at: '2026-05-09T10:01:00Z',
};

const SEED_HISTORY: AppAccessHistoryEvent[] = [
  {
    id: 'hist-1',
    request_id: 'req-old',
    kind: 'update_rules',
    action: 'approved',
    actor: 'reviewer-1',
    timestamp: '2026-05-09T10:01:00Z',
    summary: 'Enable AI assist',
    warning: '',
    rule_count: 1,
    application_count: 3,
  },
];

const DEFAULT_APPLICATION_ACCESS: ApplicationAccessConfig = {
  enabled: true,
  default_visibility: 'visible',
  warning: 'Application access controls UX scope only; server-side permissions still apply.',
  applications: SEED_APPLICATIONS,
  rules: SEED_RULES,
  approval_policy: {
    mode: 'review_required',
    reviewer_user_ids: ['reviewer-1'],
    reviewer_group_ids: [],
    require_distinct_reviewer_for_policy: true,
    instructions: 'Review against the runbook.',
  },
  change_requests: [PENDING_REQUEST, APPROVED_REQUEST],
  history: SEED_HISTORY,
};

/**
 * Minimum-viable ControlPanelSettings — the page only reads
 * `application_access`. Other fields are stubbed with empty defaults.
 */
function buildControlPanelSettings(
  applicationAccess: ApplicationAccessConfig = DEFAULT_APPLICATION_ACCESS,
) {
  return {
    platform_name: 'OpenFoundry E2E',
    support_email: 'support@example.com',
    docs_url: '',
    status_page_url: '',
    announcement_banner: '',
    maintenance_mode: false,
    release_channel: 'stable',
    default_region: 'us-east-1',
    deployment_mode: 'cloud',
    allow_self_signup: false,
    supported_locales: ['en'],
    default_locale: 'en',
    allowed_email_domains: [],
    default_app_branding: {
      display_name: 'OpenFoundry',
      primary_color: '#0a0a0a',
      accent_color: '#3b82f6',
      logo_url: null,
      favicon_url: null,
      show_powered_by: true,
    },
    restricted_operations: [],
    identity_provider_mappings: [],
    resource_management_policies: [],
    upgrade_assistant: {
      current_version: '2026.05.10',
      target_version: '2026.05.10',
      maintenance_window: '',
      rollback_channel: 'stable',
      preflight_checks: [],
      rollout_stages: [],
      rollback_steps: [],
    },
    scoped_sessions: {
      enabled: false,
      allow_no_scoped_session: true,
      always_show_selector: false,
      allowed_bypass_groups: [],
      presets: [],
    },
    application_access: applicationAccess,
    member_discovery: {
      default_discover_users: true,
      default_discover_groups: true,
      warning: '',
      organizations: [],
      history: [],
    },
    file_access_presets: {
      enabled: false,
      warning: '',
      guest_organization_behavior: 'primary_organization',
      presets: [],
      history: [],
    },
    updated_by: 'admin@example.com',
    updated_at: E2E_NOW,
  };
}

// Endpoint patterns
const CONTROL_PANEL = /\/api\/v1\/control-panel$/;
const APP_ACCESS_CHANGE_REQUESTS =
  /\/api\/v1\/control-panel\/application-access\/change-requests$/;
const APP_ACCESS_DECISION = (id: string) =>
  new RegExp(
    `/api/v1/control-panel/application-access/change-requests/${id}/decision$`,
  );
const APP_ACCESS_EVALUATE = /\/api\/v1\/application-access\/evaluate$/;

interface MocksOpts {
  applicationAccess?: ApplicationAccessConfig;
}

async function mockApplicationAccess(page: Page, opts: MocksOpts = {}) {
  const cfg = opts.applicationAccess ?? DEFAULT_APPLICATION_ACCESS;

  await page.route(CONTROL_PANEL, async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: buildControlPanelSettings(cfg) });
      return;
    }
    if (route.request().method() === 'PUT') {
      const raw = route.request().postDataJSON() as {
        application_access?: ApplicationAccessConfig;
      };
      await route.fulfill({
        json: buildControlPanelSettings(raw.application_access ?? cfg),
      });
      return;
    }
    await route.fallback();
  });

  await page.route(APP_ACCESS_CHANGE_REQUESTS, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        change_requests: cfg.change_requests,
        history: cfg.history,
        warning: cfg.warning,
      },
    });
  });

  return captureRequests(page, CONTROL_PANEL);
}

async function waitForPut(
  cap: ReturnType<typeof captureRequests>,
): Promise<{ method: string; body: unknown }> {
  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'PUT').length)
    .toBeGreaterThanOrEqual(1);
  const puts = cap.calls.filter((c) => c.method === 'PUT');
  return puts[puts.length - 1];
}

// ---------------------------------------------------------------------------
// Case 1 — render snapshot + change requests + history
// ---------------------------------------------------------------------------

test('renders snapshot, warning banner, change-requests + history lists', async ({
  adminPage,
}) => {
  await mockApplicationAccess(adminPage);
  await adminPage.goto('/control-panel/application-access');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^application access$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /back to control panel/i }),
  ).toHaveAttribute('href', /\/control-panel$/);

  // Warning banner at the top — "UX scope only" badge + a sentence
  // about server-side permissions.
  await expect(adminPage.getByText(/^ux scope only$/i)).toBeVisible();
  await expect(
    adminPage.getByText(/server-side permissions still apply/i).first(),
  ).toBeVisible();

  // Snapshot metrics: 5 cells with the seeded values.
  const snapshot = adminPage
    .getByText(/^snapshot$/i)
    .locator('xpath=ancestor::section[1]');
  await expect(snapshot.getByText('Status').locator('xpath=following-sibling::*[1]'))
    .toContainText(/^enabled$/i);
  await expect(snapshot.getByText('Default').locator('xpath=following-sibling::*[1]'))
    .toContainText('visible');
  // Applications count = 3 fixture apps.
  await expect(snapshot.getByText('Applications').locator('xpath=following-sibling::*[1]'))
    .toContainText('3');
  // Rules = 1.
  await expect(snapshot.getByText('Rules').locator('xpath=following-sibling::*[1]'))
    .toContainText('1');
  // Pending change requests = 1 (PENDING_REQUEST).
  await expect(snapshot.getByText('Pending').locator('xpath=following-sibling::*[1]'))
    .toContainText('1');

  // Change-requests section shows BOTH the pending + the approved
  // request, with status badges.
  const requests = adminPage
    .getByText(/^change requests$/i)
    .locator('xpath=ancestor::section[1]');
  await expect(requests.getByText(/block "ai" for restricted-users/i)).toBeVisible();
  await expect(requests.getByText(/enable ai assist/i)).toBeVisible();
  await expect(requests.getByText(/^pending$/i).first()).toBeVisible();
  await expect(requests.getByText(/^approved$/i).first()).toBeVisible();

  // History section lists the past event.
  const history = adminPage
    .getByText(/^history$/i)
    .locator('xpath=ancestor::section[1]');
  await expect(history.getByText(/enable ai assist/i)).toBeVisible();
  await expect(history.getByText(/3\s+apps,\s+1\s+rules/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Case 1 — Evaluate visibility (the per-app "matrix" probe)
// ---------------------------------------------------------------------------

test('evaluate visibility: POSTs the request body and renders the decision card', async ({
  adminPage,
}) => {
  await mockApplicationAccess(adminPage);
  const cap = captureRequests(adminPage, APP_ACCESS_EVALUATE);
  await adminPage.route(APP_ACCESS_EVALUATE, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: {
        warning: 'evaluated',
        decisions: [
          {
            application_id: 'ai',
            visible: false,
            decision: 'blocked',
            reason: 'matched block rule "Block rule 1"',
            lifecycle_stage: 'beta',
            matched_rule_ids: ['block-rule-1'],
            matched_rule_names: ['Block rule 1'],
            default_visibility: 'visible',
            ux_scope_only: true,
          },
        ],
      },
    });
  });

  await adminPage.goto('/control-panel/application-access');

  // Fill the Evaluate form. The Application ID input pre-fills with
  // `control-panel`; overwrite it.
  await adminPage.getByRole('textbox', { name: /application id/i }).fill('ai');
  await adminPage.getByRole('textbox', { name: /user id/i }).fill('user-1');
  await adminPage.getByRole('textbox', { name: /organization id/i }).fill('org-1');
  await adminPage.getByRole('textbox', { name: /group ids/i }).fill('restricted-users, qa');
  await adminPage.getByRole('textbox', { name: /lifecycle stage/i }).fill('beta');

  await adminPage.getByRole('button', { name: /^evaluate$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.body).toMatchObject({
    application_id: 'ai',
    user_id: 'user-1',
    organization_id: 'org-1',
    group_ids: ['restricted-users', 'qa'],
    lifecycle_stage: 'beta',
  });

  // Decision card renders the visibility badge + matched rule label.
  // The article's text includes "ai" (the app id), "hidden" (badge),
  // and "blocked - matched block rule …" (decision/reason).
  const decisionCard = adminPage
    .locator('article')
    .filter({ hasText: /matched block rule/i });
  await expect(decisionCard).toBeVisible();
  await expect(decisionCard).toContainText('hidden');
  await expect(decisionCard).toContainText(/rules:\s*block rule 1/i);
});

// ---------------------------------------------------------------------------
// Case 2 — Add block rule + Save PUTs /control-panel
// ---------------------------------------------------------------------------

test('add block rule + save: PUTs /control-panel with the rule appended to application_access', async ({
  adminPage,
}) => {
  const cap = await mockApplicationAccess(adminPage);

  await adminPage.goto('/control-panel/application-access');
  await expect(
    adminPage.getByText(/^configuration json$/i),
  ).toBeVisible();

  // Pre-fill the Evaluate form's Application ID + Group IDs because
  // the "Add block rule" helper templates a new rule from those inputs.
  await adminPage.getByRole('textbox', { name: /application id/i }).fill('workshop');
  await adminPage.getByRole('textbox', { name: /group ids/i }).fill('contractors');

  await adminPage.getByRole('button', { name: /^add block rule$/i }).click();

  // Snapshot's "Rules" cell ticks from 1 to 2.
  const snapshot = adminPage
    .getByText(/^snapshot$/i)
    .locator('xpath=ancestor::section[1]');
  await expect(snapshot.getByText('Rules').locator('xpath=following-sibling::*[1]'))
    .toContainText('2');

  await adminPage.getByRole('button', { name: /^request or apply change$/i }).click();

  const put = await waitForPut(cap);
  const body = put.body as { application_access: ApplicationAccessConfig };
  expect(body.application_access.rules).toHaveLength(2);
  expect(body.application_access.rules[1]).toMatchObject({
    id: 'block-rule-2',
    effect: 'block',
    application_ids: ['workshop'],
    group_ids: ['contractors'],
    enabled: true,
  });

  // After-save success banner — either "Saved and recorded" or
  // "Change request created" depending on whether the response added
  // a new pending request. Our mock echoes the request body without
  // adding requests, so the banner reads "Saved and recorded".
  await expect(adminPage.locator('.of-status-success').first()).toContainText(
    /saved and recorded|change request created/i,
  );
});

// ---------------------------------------------------------------------------
// Case 2 — Approve a pending change request (closest to "conceder/revocar")
// ---------------------------------------------------------------------------

test('approve pending change request: POSTs /decision with approved + refreshes the list', async ({
  adminPage,
}) => {
  await mockApplicationAccess(adminPage);
  const cap = captureRequests(adminPage, APP_ACCESS_DECISION(PENDING_REQUEST.id));
  await adminPage.route(APP_ACCESS_DECISION(PENDING_REQUEST.id), async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    // Server returns the patched ApplicationAccessConfig with the
    // pending request flipped to approved.
    await route.fulfill({
      json: {
        ...DEFAULT_APPLICATION_ACCESS,
        change_requests: [
          { ...PENDING_REQUEST, status: 'approved', decided_at: E2E_NOW },
          APPROVED_REQUEST,
        ],
      },
    });
  });

  await adminPage.goto('/control-panel/application-access');

  // Find the pending row (it carries the "Approve" + "Reject" buttons).
  const pendingCard = adminPage
    .locator('article')
    .filter({ hasText: PENDING_REQUEST.summary })
    .filter({ has: adminPage.getByRole('button', { name: /^approve$/i }) });
  await expect(pendingCard).toBeVisible();

  await pendingCard.getByRole('button', { name: /^approve$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('POST');
  expect(cap.last()?.body).toMatchObject({ decision: 'approved' });

  // After approval the success banner appears and the Approve button
  // disappears (the row's status flipped to approved, which doesn't
  // render the action buttons).
  await expect(adminPage.locator('.of-status-success').first()).toContainText(
    /change request approved and applied/i,
  );
  await expect(
    adminPage.locator('article').filter({ hasText: PENDING_REQUEST.summary }).getByRole('button', { name: /^approve$/i }),
  ).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Absent-today guards — cases 1 + 2 + 3 partial
// ---------------------------------------------------------------------------

test('absent today: per-(user, app) grant form, apps × principals matrix grid, list filters', async ({
  adminPage,
}) => {
  await mockApplicationAccess(adminPage);
  await adminPage.goto('/control-panel/application-access');
  await expect(adminPage.getByText(/^configuration json$/i)).toBeVisible();

  // 1. No `apps × users/groups` matrix grid. The page's "matrix"
  //    surface is the aggregate Snapshot + the Evaluate form (which
  //    returns decisions one app at a time); there is no role="grid".
  expect(await adminPage.getByRole('grid').count()).toBe(0);
  expect(
    await adminPage.getByRole('heading', { name: /access matrix|application matrix|permissions matrix/i }).count(),
  ).toBe(0);

  // 2. No typed "Grant access" or "Revoke access" CTAs. Mutation flows
  //    today are: edit the JSON, click "Add block rule" (templated
  //    block rule), or Approve/Reject pending change requests.
  expect(
    await adminPage.getByRole('button', { name: /^grant access|^revoke access|grant to user|revoke from user/i }).count(),
  ).toBe(0);

  // 3. No filter inputs on the Change requests or History lists. Pin
  //    that the existing textboxes are scoped to the Evaluate form
  //    (App ID / User ID / Org ID / Group IDs / Lifecycle stage) and
  //    none of them is labelled as a "filter" / "search".
  expect(
    await adminPage.getByRole('searchbox').count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('textbox', { name: /^filter|^search$|filter by/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('combobox', { name: /filter|status filter|kind filter/i }).count(),
  ).toBe(0);
});

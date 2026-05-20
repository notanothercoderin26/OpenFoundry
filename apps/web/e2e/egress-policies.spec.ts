import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { EgressPoliciesPage } from './pages';

/**
 * E2E coverage for `/data-connection/egress-policies`
 * (apps/web/src/routes/data-connection/EgressPoliciesPage.tsx).
 *
 * **Reality vs roadmap.** The shipped page is a high-density table
 * with a 4-tile metric strip and a "+ Egress policy" button that
 * opens the `CreateEgressPolicyModal`. Policies are **immutable
 * after creation** — the page explicitly states "Policies remain
 * immutable after creation; revoke instead of deleting." That maps
 * the roadmap CRUD verbs onto a different shape:
 *
 *   - "Edit" is intentionally NOT exposed (immutable). The closest
 *     thing is `updateEgressPolicySharing` for grant changes, and
 *     that surface is not wired into this page.
 *   - "Delete" is implemented as **Revoke** (a state transition to
 *     `revoked` via `PATCH /egress-policies/:id/state`). The button
 *     in the row is literally labelled "Revoke" and confirms via
 *     `window.confirm`.
 *   - "Test policy / dry-run" has no UI and no API. Source-level
 *     connection tests do validate egress policies indirectly
 *     (`validateEgressPoliciesForConnectionTest`) but the
 *     `/egress-policies` page itself ships no test/dry-run CTA.
 *   - Source attachment is NOT done from this page either. Sources
 *     bind to policies via `/data-connection/sources/:id` and the
 *     `sources/:id/egress-policies` endpoint. The only assignment
 *     this page can do at creation time is the agent_proxy "Agent
 *     IDs" textarea (which pins agents to the policy, not sources).
 *
 * Endpoints exercised:
 *   - GET   /api/v1/data-connection/egress-policies
 *   - GET   /api/v1/data-connection/egress-policies/approvals?status=pending
 *   - POST  /api/v1/data-connection/egress-policies
 *   - PATCH /api/v1/data-connection/egress-policies/{id}/state
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

const POLICIES_LIST = /\/api\/v1\/data-connection\/egress-policies$/;
const POLICIES_COLLECTION = /\/api\/v1\/data-connection\/egress-policies(\?|$)/;
const APPROVALS_LIST = /\/api\/v1\/data-connection\/egress-policies\/approvals(\?|$)/;
const POLICY_STATE_PATCH = /\/api\/v1\/data-connection\/egress-policies\/[^/]+\/state$/;
const E2E_NOW = '2026-05-11T00:00:00Z';

type PolicyKind = 'direct' | 'agent_proxy' | 'same_region_bucket';
type PolicyState = 'pending_approval' | 'active' | 'paused' | 'revoked';

interface PolicyFixture {
  id: string;
  name: string;
  description: string;
  kind: PolicyKind;
  address: { kind: 'host' | 'ip' | 'cidr'; value: string };
  port: { kind: 'single' | 'range' | 'any'; value: string };
  protocol: 'tcp' | 'tls' | 'http' | 'https';
  proxy_mode: 'none' | 'http_connect' | 'socks5' | 'mtls_tunnel';
  sni_behavior: 'verify' | 'disabled' | 'passthrough';
  agents: string[];
  state: PolicyState;
  status: PolicyState;
  is_global: boolean;
  allowed_organizations: string[];
  importer_grants: string[];
  viewer_grants: string[];
  admin_grants: string[];
  permissions: string[];
  importer_grants_high_risk: boolean;
  risk_warnings: unknown[];
  egress_ip_ranges: string[];
  agent_hosts: string[];
  overlap_policy_ids: string[];
  bucket_policy_requirements: unknown[];
  approval_tasks: unknown[];
  workload_usages: unknown[];
  audit_events: unknown[];
  created_at: string;
  updated_at: string;
}

function makePolicy(overrides: Partial<PolicyFixture> = {}): PolicyFixture {
  return {
    id: 'policy-1',
    name: 'Sample policy',
    description: 'Sample egress destination',
    kind: 'direct',
    address: { kind: 'host', value: 'api.example.com' },
    port: { kind: 'single', value: '443' },
    protocol: 'https',
    proxy_mode: 'none',
    sni_behavior: 'verify',
    agents: [],
    state: 'active',
    status: 'active',
    is_global: false,
    allowed_organizations: [],
    importer_grants: ['group:warehouse-importers'],
    viewer_grants: [],
    admin_grants: [],
    permissions: ['group:warehouse-importers'],
    importer_grants_high_risk: false,
    risk_warnings: [],
    egress_ip_ranges: [],
    agent_hosts: [],
    overlap_policy_ids: [],
    bucket_policy_requirements: [],
    approval_tasks: [],
    workload_usages: [],
    audit_events: [],
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

async function mockEgressData(
  page: Page,
  policies: PolicyFixture[],
): Promise<{ getListCount: () => number }> {
  let calls = 0;
  // The page calls `listEgressPolicies()` which returns a bare array.
  // The default catch-all returns `{ data, next_cursor, total }` which
  // would break `policies.length` / `policies.filter`, so we override.
  await page.route(POLICIES_LIST, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    calls += 1;
    await route.fulfill({ json: policies });
  });
  await page.route(APPROVALS_LIST, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: [] });
  });
  return { getListCount: () => calls };
}

const ACTIVE_DIRECT = makePolicy({
  id: 'policy-direct',
  name: 'Analytics warehouse',
  kind: 'direct',
  address: { kind: 'host', value: 'warehouse.example.com' },
  port: { kind: 'single', value: '443' },
  state: 'active',
  status: 'active',
  importer_grants: ['group:warehouse-importers'],
  permissions: ['group:warehouse-importers'],
});

const PENDING_PROXY = makePolicy({
  id: 'policy-proxy',
  name: 'Legacy SaaS proxy',
  kind: 'agent_proxy',
  address: { kind: 'host', value: 'saas.example.com' },
  port: { kind: 'single', value: '8443' },
  protocol: 'tls',
  proxy_mode: 'http_connect',
  state: 'pending_approval',
  status: 'pending_approval',
  agents: ['agent-east-1'],
});

test('renders the policies table + 4 metric tiles with policy rows', async ({
  adminPage,
}) => {
  await mockEgressData(adminPage, [ACTIVE_DIRECT, PENDING_PROXY]);
  const policies = new EgressPoliciesPage(adminPage);
  await policies.goto();
  await policies.expectLoaded();

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^egress policies$/i }),
  ).toBeVisible();

  // 4 metric tiles by label.
  for (const label of [/^policies$/i, /^active$/i, /pending approvals/i, /export workloads/i]) {
    await expect(adminPage.getByText(label).first()).toBeVisible();
  }

  // Table headers.
  for (const header of [/^name$/i, /^kind$/i, /^address$/i, /^port$/i, /^runtime$/i, /importer grants/i]) {
    await expect(adminPage.getByRole('columnheader', { name: header })).toBeVisible();
  }

  // Two policy rows surface name + kind + the formatted address.
  await expect(adminPage.getByRole('cell', { name: /^analytics warehouse$/i })).toBeVisible();
  await expect(adminPage.getByText(/host:warehouse\.example\.com/i)).toBeVisible();
  await expect(adminPage.getByRole('cell', { name: /^legacy saas proxy$/i })).toBeVisible();
  await expect(adminPage.getByText(/host:saas\.example\.com/i)).toBeVisible();

  // Runtime state pills surface the per-policy state.
  await expect(adminPage.getByText(/^active$/i).first()).toBeVisible();
  await expect(adminPage.getByText(/^pending_approval$/i).first()).toBeVisible();

  // Importer grants column renders the resolved list.
  await expect(adminPage.getByText(/group:warehouse-importers/i)).toBeVisible();
});

test('"+ Egress policy" opens the modal and POSTs a direct policy with the filled rules', async ({
  adminPage,
}) => {
  await mockEgressData(adminPage, []);
  const captured = captureRequests(adminPage, POLICIES_COLLECTION);

  await new EgressPoliciesPage(adminPage).goto();
  await adminPage.getByRole('button', { name: /\+ egress policy/i }).click();

  const dialog = adminPage.getByRole('dialog', { name: /create egress policy/i });
  await expect(dialog).toBeVisible();

  // Fill the required fields. The two text inputs we touch have
  // unique placeholders, which is the cleanest selector through
  // the wrapping <Field><label>{name *}<input/></label></Field>.
  await dialog.getByPlaceholder(/^analytics warehouse$/i).fill('Production warehouse');
  await dialog.getByPlaceholder(/^api\.example\.com$/i).fill('warehouse.example.com');

  // Defaults already match: kind=direct, port=443 (single), protocol=https,
  // address kind=host.
  await dialog.getByRole('button', { name: /^create policy$/i }).click();

  await expect
    .poll(() => captured.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);

  const post = captured.calls.find((c) => c.method === 'POST');
  expect(post?.url).toMatch(POLICIES_LIST);
  expect(post?.body).toMatchObject({
    name: 'Production warehouse',
    kind: 'direct',
    protocol: 'https',
    address: { kind: 'host', value: 'warehouse.example.com' },
    port: { kind: 'single', value: '443' },
  });
});

test('agent_proxy kind reveals Proxy mode + Agent IDs; submit assigns the agents — no source-attach UI ships on this page', async ({
  adminPage,
}) => {
  await mockEgressData(adminPage, []);
  const captured = captureRequests(adminPage, POLICIES_COLLECTION);

  await new EgressPoliciesPage(adminPage).goto();
  await adminPage.getByRole('button', { name: /\+ egress policy/i }).click();

  const dialog = adminPage.getByRole('dialog', { name: /create egress policy/i });
  await expect(dialog).toBeVisible();

  // Pin the absence of source-attach UI inside the create modal:
  // sources are bound from `/data-connection/sources/:id`, not here.
  expect(
    await dialog.getByRole('button', { name: /attach (a )?source|assign source/i }).count(),
  ).toBe(0);
  expect(
    await dialog.getByLabel(/source( ids?| rid)/i).count(),
  ).toBe(0);

  // Switch to agent_proxy via the Policy kind select. Proxy mode flips
  // to `http_connect` automatically and the Agent IDs textarea appears.
  await dialog
    .locator('select')
    .filter({ has: dialog.locator('option', { hasText: /direct egress/i }) })
    .selectOption('agent_proxy');

  await expect(dialog.getByPlaceholder(/agent-east-1/)).toBeVisible();

  await dialog.getByPlaceholder(/^analytics warehouse$/i).fill('Legacy SaaS proxy');
  await dialog.getByPlaceholder(/^api\.example\.com$/i).fill('saas.example.com');
  await dialog
    .getByPlaceholder(/agent-east-1/)
    .fill('agent-east-1\nagent-west-2');

  await dialog.getByRole('button', { name: /^create policy$/i }).click();

  await expect
    .poll(() => captured.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);

  const post = captured.calls.find((c) => c.method === 'POST');
  expect(post?.body).toMatchObject({
    name: 'Legacy SaaS proxy',
    kind: 'agent_proxy',
    proxy_mode: 'http_connect',
    address: { kind: 'host', value: 'saas.example.com' },
    agents: ['agent-east-1', 'agent-west-2'],
  });

  // Pin the absence of a *source* assignment field in the request.
  expect(post?.body).not.toHaveProperty('source_id');
  expect(post?.body).not.toHaveProperty('source_ids');
});

test('Revoke (the shipped delete-substitute) confirms via window.confirm and PATCHes state to revoked', async ({
  adminPage,
}) => {
  await mockEgressData(adminPage, [ACTIVE_DIRECT]);

  const stateCalls: { url: string; body: unknown }[] = [];
  await adminPage.route(POLICY_STATE_PATCH, async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.fallback();
      return;
    }
    stateCalls.push({
      url: route.request().url(),
      body: route.request().postDataJSON(),
    });
    await route.fulfill({ json: { ...ACTIVE_DIRECT, state: 'revoked', status: 'revoked' } });
  });

  await new EgressPoliciesPage(adminPage).goto();
  await expect(adminPage.getByRole('cell', { name: /^analytics warehouse$/i })).toBeVisible();

  // Accept the native window.confirm — the message names the policy
  // and warns that revocation is terminal.
  adminPage.once('dialog', (dialog) => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('Analytics warehouse');
    expect(dialog.message()).toMatch(/cannot be reactivated/i);
    void dialog.accept();
  });

  await adminPage.getByRole('button', { name: /^revoke$/i }).click();

  await expect.poll(() => stateCalls.length).toBeGreaterThanOrEqual(1);
  expect(stateCalls[0].url).toMatch(/\/egress-policies\/policy-direct\/state$/);
  expect(stateCalls[0].body).toMatchObject({ state: 'revoked' });

  // Pin the absence of a hard "Delete" CTA — the shipped flow is
  // Revoke + the explanatory banner above.
  expect(
    await adminPage.getByRole('button', { name: /^delete( policy)?$/i }).count(),
  ).toBe(0);
  await expect(
    adminPage.getByText(/policies remain immutable after creation/i),
  ).toBeVisible();
});

test('empty state renders "No egress policies."', async ({ adminPage }) => {
  await mockEgressData(adminPage, []);
  await new EgressPoliciesPage(adminPage).goto();

  await expect(adminPage.getByText(/^no egress policies\.?$/i)).toBeVisible();

  // The "+ Egress policy" CTA stays visible even with zero rows.
  await expect(
    adminPage.getByRole('button', { name: /\+ egress policy/i }),
  ).toBeVisible();
});

test('absent today: edit (policies are immutable) and test / dry-run controls', async ({
  adminPage,
}) => {
  await mockEgressData(adminPage, [ACTIVE_DIRECT]);
  await new EgressPoliciesPage(adminPage).goto();
  await expect(adminPage.getByRole('cell', { name: /^analytics warehouse$/i })).toBeVisible();

  // No edit / rename CTA at the row or page level. Policies are
  // immutable; the only mutation is the state machine.
  expect(
    await adminPage.getByRole('button', { name: /^edit( policy)?$/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /^rename$/i }).count(),
  ).toBe(0);

  // No test/dry-run CTA. The page does not expose a /test endpoint
  // for policies — source-level connection tests live elsewhere.
  expect(
    await adminPage.getByRole('button', { name: /^test( policy)?$|dry[- ]?run|simulate/i }).count(),
  ).toBe(0);
});

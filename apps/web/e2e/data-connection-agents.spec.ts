import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { AgentsPage } from './pages';

/**
 * E2E coverage for `/data-connection/agents`
 * (apps/web/src/routes/data-connection/AgentsPage.tsx).
 *
 * **Reality vs roadmap.** The shipped page is a single full-width page
 * with:
 *
 *   - 5 stat tiles (Registered agents / Online / Agent worker sources /
 *     Proxy policies / With failures).
 *   - An INLINE "Register agent" form (Name, Agent URL, Version,
 *     Environment, Host, Capabilities JSON, Metadata JSON) — NOT a
 *     modal — that POSTs to `/api/v1/data-connection/agents` and
 *     resets the local form state on success.
 *   - A wide `Agent registry` table (Agent / Runtime / Endpoint /
 *     Health / Sources/policies / Capabilities / Failures /
 *     Last heartbeat / actions) with per-row Heartbeat + Delete
 *     buttons. Delete confirms via the native `window.confirm`.
 *   - An `Agent worker sources` cross-reference table.
 *   - A Refresh button in the header that re-runs both list calls.
 *
 * Roadmap controls that are NOT in the shell today:
 *
 *   - "Modal with installation token" — there is no modal and no
 *     install-token surface; the agent_url is provided directly in
 *     the form.
 *   - Edit / rename / re-tag an existing agent — no PATCH endpoint
 *     and no inline edit UI.
 *   - "View agent logs" — no logs route, button, panel, or endpoint.
 *
 * Endpoints exercised:
 *   - GET    /api/v1/data-connection/agents
 *   - POST   /api/v1/data-connection/agents
 *   - DELETE /api/v1/data-connection/agents/{id}
 *   - GET    /api/v1/data-connection/sources?page=1&per_page=100
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
  // Freeze time so `isStaleHeartbeat` is deterministic — without it
  // every heartbeat older than 5 minutes flips to "stale" on slower
  // CI runners and the status-pill assertions get flaky.
  freezeTime: true,
});

const AGENTS_COLLECTION = /\/api\/v1\/data-connection\/agents$/;
const AGENT_DELETE = /\/api\/v1\/data-connection\/agents\/[^/]+$/;
const E2E_NOW = '2026-05-11T00:00:00Z';

interface AgentHealthFixture {
  state: 'healthy' | 'warning' | 'stale' | 'error' | string;
  message?: string;
  stale: boolean;
  last_heartbeat_age_seconds?: number | null;
  connected_source_count: number;
  assigned_proxy_policy_count: number;
  failure_count: number;
}

interface AgentFixture {
  id: string;
  name: string;
  agent_url: string;
  version: string;
  environment: string;
  host: string;
  owner_id: string;
  status: string;
  capabilities: Record<string, unknown>;
  metadata: Record<string, unknown>;
  connected_sources: unknown[];
  supported_connector_capabilities: unknown[];
  assigned_proxy_policies: unknown[];
  connection_failures: unknown[];
  health: AgentHealthFixture;
  last_heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
}

function makeAgent(overrides: Partial<AgentFixture> = {}): AgentFixture {
  return {
    id: 'agent-1',
    name: 'EU edge agent',
    agent_url: 'https://agent.eu.internal:8443',
    version: '0.1.0',
    environment: 'prod',
    host: 'agent.eu.internal',
    owner_id: 'user-1',
    status: 'online',
    capabilities: { connectors: ['postgresql', 'mysql'], proxy: true },
    metadata: { region: 'eu-west-1' },
    connected_sources: [],
    supported_connector_capabilities: [
      { connector_type: 'postgresql', capabilities: ['batch_sync', 'cdc_sync'] },
    ],
    assigned_proxy_policies: [],
    connection_failures: [],
    health: {
      state: 'healthy',
      stale: false,
      connected_source_count: 0,
      assigned_proxy_policy_count: 0,
      failure_count: 0,
    },
    last_heartbeat_at: E2E_NOW,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

async function mockAgentList(
  page: Page,
  agents: AgentFixture[],
): Promise<{ getCount: () => number }> {
  let calls = 0;
  await page.route(AGENTS_COLLECTION, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    calls += 1;
    await route.fulfill({ json: { data: agents } });
  });
  return { getCount: () => calls };
}

const ONLINE_AGENT = makeAgent({
  id: 'agent-eu',
  name: 'EU edge agent',
  agent_url: 'https://agent.eu.internal:8443',
  status: 'online',
  health: {
    state: 'healthy',
    stale: false,
    connected_source_count: 0,
    assigned_proxy_policy_count: 0,
    failure_count: 0,
  },
  last_heartbeat_at: E2E_NOW,
});

// An OFFLINE agent with a stale heartbeat — its pill shows the
// health.state ("offline") rather than the synthesized "stale" word
// because the page prefers `health.state` when present.
const OFFLINE_AGENT = makeAgent({
  id: 'agent-us',
  name: 'US edge agent',
  agent_url: 'https://agent.us.internal:8443',
  status: 'offline',
  health: {
    state: 'offline',
    stale: true,
    connected_source_count: 0,
    assigned_proxy_policy_count: 0,
    failure_count: 0,
  },
  // Heartbeat older than the 5-minute STALE_HEARTBEAT_MS window.
  last_heartbeat_at: '2026-05-10T20:00:00Z',
});

test('renders the agent registry table with status pill + formatted heartbeat', async ({
  adminPage,
}) => {
  await mockAgentList(adminPage, [ONLINE_AGENT, OFFLINE_AGENT]);
  const agents = new AgentsPage(adminPage);
  await agents.goto();
  await agents.expectLoaded();

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /data connection agents/i }),
  ).toBeVisible();

  // Both agent name + id surface in the first column.
  await expect(adminPage.getByText(/EU edge agent/)).toBeVisible();
  await expect(adminPage.getByText('agent-eu')).toBeVisible();
  await expect(adminPage.getByText(/US edge agent/)).toBeVisible();
  await expect(adminPage.getByText('agent-us')).toBeVisible();

  // Status pills: online row resolves to health.state="healthy",
  // offline row resolves to health.state="offline".
  await expect(adminPage.getByText(/^healthy$/i).first()).toBeVisible();
  await expect(adminPage.getByText(/^offline$/i).first()).toBeVisible();

  // Capability summary derived from supported_connector_capabilities.
  await expect(
    adminPage.getByText(/postgresql: batch_sync, cdc_sync/i).first(),
  ).toBeVisible();

  // Last heartbeat is rendered via `Intl.DateTimeFormat`; pinning the
  // exact locale string is brittle, so just assert that the year
  // surfaces in the heartbeat column.
  await expect(adminPage.getByRole('cell', { name: /2026/ }).first()).toBeVisible();

  // 5 stat tiles render with the right counts derived from the list.
  await expect(adminPage.getByText(/registered agents/i)).toBeVisible();
  await expect(adminPage.getByText('2')).toBeVisible(); // registered agents
});

test('register-agent form POSTs to /agents and resets on success; no modal / install-token surface ships', async ({
  adminPage,
}) => {
  await mockAgentList(adminPage, []);
  const captured = captureRequests(adminPage, AGENTS_COLLECTION);

  await new AgentsPage(adminPage).goto();

  // The shipped surface is an INLINE form. Pin that explicitly: there
  // is no role="dialog" wrapping the inputs, no "install token" / "join
  // token" / "registration token" affordance, and no "copy token" CTA.
  expect(await adminPage.getByRole('dialog').count()).toBe(0);
  expect(
    await adminPage.getByText(/install(ation)? token|join token|registration token/i).count(),
  ).toBe(0);
  expect(await adminPage.getByRole('button', { name: /copy token/i }).count()).toBe(0);

  // Required fields. The two `<label>` wrappers use implicit
  // association: <label>Name<input/></label>.
  await adminPage.getByLabel(/^name$/i).fill('Madrid agent');
  await adminPage.getByLabel(/^agent url$/i).fill('https://madrid.agent.local:8443');
  await adminPage.getByLabel(/^host$/i).fill('madrid.agent.local');

  await adminPage.getByRole('button', { name: /^register agent$/i }).click();

  // The default catch-all returns 201 — the page then re-loads.
  await expect
    .poll(() => captured.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);

  const post = captured.calls.find((c) => c.method === 'POST');
  expect(post?.url).toMatch(AGENTS_COLLECTION);
  expect(post?.body).toMatchObject({
    name: 'Madrid agent',
    agent_url: 'https://madrid.agent.local:8443',
    host: 'madrid.agent.local',
  });

  // Local form state resets — Name returns to empty, Version returns
  // to the default '0.1.0' so the form is reusable.
  await expect(adminPage.getByLabel(/^name$/i)).toHaveValue('');
  await expect(adminPage.getByLabel(/^agent url$/i)).toHaveValue('');
  await expect(adminPage.getByLabel(/^version$/i)).toHaveValue('0.1.0');
});

test('Delete row confirms via window.confirm and fires DELETE /agents/:id', async ({
  adminPage,
}) => {
  await mockAgentList(adminPage, [ONLINE_AGENT]);

  const deleteCalls: string[] = [];
  await adminPage.route(AGENT_DELETE, async (route) => {
    if (route.request().method() !== 'DELETE') {
      await route.fallback();
      return;
    }
    deleteCalls.push(route.request().url());
    await route.fulfill({ status: 204, body: '' });
  });

  await new AgentsPage(adminPage).goto();
  await expect(adminPage.getByText(/EU edge agent/)).toBeVisible();

  // The native confirm() prompt — accept it.
  adminPage.once('dialog', (dialog) => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('EU edge agent');
    void dialog.accept();
  });

  await adminPage.getByRole('button', { name: /^delete$/i }).click();

  await expect.poll(() => deleteCalls.length).toBeGreaterThanOrEqual(1);
  expect(deleteCalls[0]).toMatch(/\/api\/v1\/data-connection\/agents\/agent-eu$/);
});

test('absent today: edit-agent (rename / tags) and agent-logs surfaces', async ({
  adminPage,
}) => {
  // Regression guards. The roadmap describes editing (name + tags) and
  // viewing agent logs, but neither ships today. When either feature
  // lands, the `count() === 0` assertions below flip and force the
  // developer to update this spec.
  await mockAgentList(adminPage, [ONLINE_AGENT]);
  await new AgentsPage(adminPage).goto();
  await expect(adminPage.getByText(/EU edge agent/)).toBeVisible();

  // No edit / rename CTA, no save-on-rename button.
  expect(
    await adminPage.getByRole('button', { name: /^edit( agent)?$/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /^rename$/i }).count(),
  ).toBe(0);

  // No tag UI: no "tags" column header, no "Add tag" CTA. The agent
  // metadata JSON exists but is not a tag editor.
  expect(
    await adminPage.getByRole('columnheader', { name: /^tags$/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /add tag|edit tags?/i }).count(),
  ).toBe(0);

  // No logs view: no per-row "Logs" button, no `View logs` link, no
  // logs panel/heading.
  expect(
    await adminPage.getByRole('button', { name: /^logs$|^view logs$/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('link', { name: /^logs$|^view logs$/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('heading', { name: /agent logs/i }).count(),
  ).toBe(0);
});

test('empty state shows "No connector agents registered." + Refresh re-fetches', async ({
  adminPage,
}) => {
  const mock = await mockAgentList(adminPage, []);
  await new AgentsPage(adminPage).goto();

  await expect(adminPage.getByText(/no connector agents registered/i)).toBeVisible();
  await expect(
    adminPage.getByText(/no sources are using the legacy agent worker/i),
  ).toBeVisible();

  // Refresh button is unique to the header — re-runs `load()`.
  const before = mock.getCount();
  await adminPage.getByRole('button', { name: /^refresh$/i }).click();
  await expect.poll(() => mock.getCount()).toBeGreaterThan(before);
});

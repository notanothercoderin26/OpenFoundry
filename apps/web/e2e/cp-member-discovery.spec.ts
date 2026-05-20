import { type Page, type Route } from '@playwright/test';
import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/control-panel/member-discovery`
 * (apps/web/src/routes/control-panel/MemberDiscoveryPage.tsx).
 *
 * **Reality check.** The page heading is "User and group visibility"
 * — it is NOT an LDAP / SCIM / directory-sync surface. It configures
 * `settings.member_discovery` on the control-panel payload:
 *
 *   - "Discovery scope only" warning banner.
 *   - Defaults section: two checkboxes (Discover users / groups by
 *     default).
 *   - Organization overrides: per-org cards with 3 toggles
 *     (discover_users, discover_groups, consumer_mode_boundary) +
 *     notes input. New override is added via "Select organization"
 *     `<select>` + "Add override" button.
 *   - History (read-only audit list).
 *   - One "Save visibility controls" button that PUTs `/control-panel`.
 *
 * Mapping the requested cases:
 *
 *   - Case 1 ("config de discovery (LDAP, SCIM, directorio)") ❌
 *     — there is no LDAP/SCIM connector config here. The page only
 *     controls whether the existing directory is discoverable per
 *     organization.
 *   - Case 2 (test sync) ❌
 *   - Case 3 (mappings) ❌
 *   - Case 4 (manual sync now) ❌
 *
 * This spec pins what's actually shipped — defaults toggles,
 * per-organization override CRUD, history — and adds a regression
 * guard that none of the LDAP/SCIM/sync surfaces have shipped yet.
 *
 * Endpoints (mirrors `src/lib/api/control-panel.ts` + `tenancy.ts`):
 *   - GET   /api/v1/control-panel       → ControlPanelSettings
 *   - PUT   /api/v1/control-panel       → ControlPanelSettings
 *   - GET   /api/v1/organizations       → { items: Organization[] }
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

interface MemberDiscoveryOrganizationConfig {
  organization_id: string;
  organization_slug?: string;
  discover_users: boolean;
  discover_groups: boolean;
  consumer_mode_boundary: boolean;
  notes?: string;
  updated_by?: string;
  updated_at?: string;
}

interface MemberDiscoveryHistoryEvent {
  id: string;
  organization_id: string;
  organization_slug?: string;
  actor: string;
  timestamp: string;
  discover_users: boolean;
  discover_groups: boolean;
  consumer_mode_boundary: boolean;
  warning: string;
}

interface MemberDiscoveryConfig {
  default_discover_users: boolean;
  default_discover_groups: boolean;
  warning: string;
  organizations: MemberDiscoveryOrganizationConfig[];
  history: MemberDiscoveryHistoryEvent[];
}

interface Organization {
  id: string;
  slug: string;
  display_name: string;
  description: string;
  contact_email: string | null;
  organization_type: string;
  default_workspace: string | null;
  tenant_tier: string | null;
  status: string;
  metadata: Record<string, unknown>;
  settings: Record<string, unknown>;
  quotas: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const E2E_NOW = '2026-05-11T00:00:00Z';

const ORG_ACME: Organization = {
  id: 'org-acme',
  slug: 'acme',
  display_name: 'Acme Corporation',
  description: '',
  contact_email: null,
  organization_type: 'tenant',
  default_workspace: 'default',
  tenant_tier: 'enterprise',
  status: 'active',
  metadata: {},
  settings: {},
  quotas: {},
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
};

const ORG_GLOBEX: Organization = {
  ...ORG_ACME,
  id: 'org-globex',
  slug: 'globex',
  display_name: 'Globex Industries',
};

const ORG_CONSUMER: Organization = {
  ...ORG_ACME,
  id: 'org-consumer',
  slug: 'consumer-app',
  display_name: 'Consumer App',
  organization_type: 'consumer',
};

const DEFAULT_MEMBER_DISCOVERY: MemberDiscoveryConfig = {
  default_discover_users: true,
  default_discover_groups: true,
  warning:
    'User and group visibility controls only restrict discovery surfaces. Existing permissions and access rights remain unchanged.',
  organizations: [
    {
      organization_id: ORG_ACME.id,
      organization_slug: ORG_ACME.slug,
      discover_users: true,
      discover_groups: false,
      consumer_mode_boundary: false,
      notes: 'Acme exposes users but hides groups for governance.',
      updated_by: 'admin-user',
      updated_at: '2026-05-10T08:00:00Z',
    },
  ],
  history: [
    {
      id: 'hist-1',
      organization_id: ORG_ACME.id,
      organization_slug: ORG_ACME.slug,
      actor: 'admin-user',
      timestamp: '2026-05-10T08:00:00Z',
      discover_users: true,
      discover_groups: false,
      consumer_mode_boundary: false,
      warning: '',
    },
  ],
};

function buildControlPanelSettings(
  memberDiscovery: MemberDiscoveryConfig = DEFAULT_MEMBER_DISCOVERY,
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
    application_access: {
      enabled: false,
      default_visibility: 'visible',
      warning: '',
      applications: [],
      rules: [],
      approval_policy: {
        mode: 'self_approve',
        reviewer_user_ids: [],
        reviewer_group_ids: [],
        require_distinct_reviewer_for_policy: false,
      },
      change_requests: [],
      history: [],
    },
    member_discovery: memberDiscovery,
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
const ORGS_LIST = /\/api\/v1\/organizations(?:\?|$)/;

interface MocksOpts {
  memberDiscovery?: MemberDiscoveryConfig;
  organizations?: Organization[];
}

async function mockMemberDiscovery(page: Page, opts: MocksOpts = {}) {
  const cfg = opts.memberDiscovery ?? DEFAULT_MEMBER_DISCOVERY;
  const orgs = opts.organizations ?? [ORG_ACME, ORG_GLOBEX, ORG_CONSUMER];

  await page.route(CONTROL_PANEL, async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: buildControlPanelSettings(cfg) });
      return;
    }
    if (route.request().method() === 'PUT') {
      const raw = route.request().postDataJSON() as {
        member_discovery?: MemberDiscoveryConfig;
      };
      await route.fulfill({ json: buildControlPanelSettings(raw.member_discovery ?? cfg) });
      return;
    }
    await route.fallback();
  });

  await page.route(ORGS_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { items: orgs } });
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

function orgCard(page: Page, displayName: string) {
  return page
    .locator('article')
    .filter({ hasText: displayName })
    .first();
}

// ---------------------------------------------------------------------------
// Renders defaults + warning + existing org override + history
// ---------------------------------------------------------------------------

test('renders defaults, warning banner, the seeded organization override, and history', async ({
  adminPage,
}) => {
  await mockMemberDiscovery(adminPage);
  await adminPage.goto('/control-panel/member-discovery');

  // Page chrome.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^user and group visibility$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /back to control panel/i }),
  ).toHaveAttribute('href', /\/control-panel$/);

  // Discovery-scope warning copy.
  await expect(
    adminPage.getByText(/discovery scope only\.\s+permissions are unchanged\./i),
  ).toBeVisible();

  // Defaults checkboxes hydrate from the seeded config (both true).
  await expect(
    adminPage.getByRole('checkbox', { name: /discover users by default/i }),
  ).toBeChecked();
  await expect(
    adminPage.getByRole('checkbox', { name: /discover groups by default/i }),
  ).toBeChecked();

  // Seeded ACME override renders as its own card with the right
  // toggles + the muted note about the org.
  const acmeCard = orgCard(adminPage, 'Acme Corporation');
  await expect(acmeCard).toBeVisible();
  // Status badge is "partial" (users discoverable but groups hidden).
  await expect(acmeCard.getByText(/^partial$/i)).toBeVisible();
  await expect(
    acmeCard.getByRole('checkbox', { name: /^discover users$/i }),
  ).toBeChecked();
  await expect(
    acmeCard.getByRole('checkbox', { name: /^discover groups$/i }),
  ).not.toBeChecked();
  await expect(
    acmeCard.getByRole('checkbox', { name: /consumer-mode boundary/i }),
  ).not.toBeChecked();
  await expect(
    acmeCard.getByRole('textbox', { name: /^notes$/i }),
  ).toHaveValue('Acme exposes users but hides groups for governance.');

  // History entry surfaces with the actor + the "discoverable / private" copy.
  const history = adminPage
    .getByText(/^history$/i)
    .locator('xpath=ancestor::section[1]');
  await expect(history).toContainText(/acme/i);
  await expect(history).toContainText(/users discoverable.*groups private/i);
});

// ---------------------------------------------------------------------------
// Add an organization override → preset stub + Save PUT
// ---------------------------------------------------------------------------

test('add organization override: appends a card; Save PUTs the new entry', async ({
  adminPage,
}) => {
  const cap = await mockMemberDiscovery(adminPage);
  await adminPage.goto('/control-panel/member-discovery');
  await expect(orgCard(adminPage, 'Acme Corporation')).toBeVisible();

  // The "Select organization" combobox auto-picks the first available
  // (non-overridden) org — Globex with our fixture. Confirm + add.
  const orgSelect = adminPage.getByRole('combobox');
  await orgSelect.selectOption(ORG_GLOBEX.id);
  await adminPage.getByRole('button', { name: /^add override$/i }).click();

  // New Globex card appears, both discovery toggles default OFF, the
  // status badge is "private", and consumer_mode_boundary stays off
  // (tenant-type org).
  const globexCard = orgCard(adminPage, 'Globex Industries');
  await expect(globexCard).toBeVisible();
  await expect(globexCard.getByText(/^private$/i)).toBeVisible();
  await expect(
    globexCard.getByRole('checkbox', { name: /^discover users$/i }),
  ).not.toBeChecked();
  await expect(
    globexCard.getByRole('checkbox', { name: /^discover groups$/i }),
  ).not.toBeChecked();
  await expect(
    globexCard.getByRole('checkbox', { name: /consumer-mode boundary/i }),
  ).not.toBeChecked();

  await adminPage.getByRole('button', { name: /^save visibility controls$/i }).click();

  const put = await waitForPut(cap);
  const body = put.body as { member_discovery: MemberDiscoveryConfig };
  expect(body.member_discovery.organizations).toHaveLength(2);
  expect(body.member_discovery.organizations[1]).toMatchObject({
    organization_id: ORG_GLOBEX.id,
    organization_slug: ORG_GLOBEX.slug,
    discover_users: false,
    discover_groups: false,
    consumer_mode_boundary: false,
  });

  await expect(adminPage.locator('.of-status-success').first()).toContainText(/^saved$/i);
});

// ---------------------------------------------------------------------------
// Adding a consumer-mode org defaults consumer_mode_boundary = true
// ---------------------------------------------------------------------------

test('add consumer-mode org: consumer_mode_boundary defaults on + notes seed with the privacy copy', async ({
  adminPage,
}) => {
  const cap = await mockMemberDiscovery(adminPage, {
    memberDiscovery: { ...DEFAULT_MEMBER_DISCOVERY, organizations: [] },
  });
  await adminPage.goto('/control-panel/member-discovery');

  // Wait for the form to settle, then add the Consumer App org. The
  // auto-selected org might be ACME (alphabetically first available);
  // explicitly pick the consumer-type org.
  const orgSelect = adminPage.getByRole('combobox');
  await orgSelect.selectOption(ORG_CONSUMER.id);
  await adminPage.getByRole('button', { name: /^add override$/i }).click();

  const consumerCard = orgCard(adminPage, 'Consumer App');
  await expect(consumerCard).toBeVisible();
  await expect(
    consumerCard.getByRole('checkbox', { name: /consumer-mode boundary/i }),
  ).toBeChecked();
  await expect(
    consumerCard.getByRole('textbox', { name: /^notes$/i }),
  ).toHaveValue('Consumer-mode privacy boundary');

  await adminPage.getByRole('button', { name: /^save visibility controls$/i }).click();

  const put = await waitForPut(cap);
  const body = put.body as { member_discovery: MemberDiscoveryConfig };
  expect(body.member_discovery.organizations[0]).toMatchObject({
    organization_id: ORG_CONSUMER.id,
    consumer_mode_boundary: true,
    notes: 'Consumer-mode privacy boundary',
  });
});

// ---------------------------------------------------------------------------
// Toggle defaults + remove override → Save PUT reflects both
// ---------------------------------------------------------------------------

test('flip defaults + remove the seeded override: Save PUTs the patched config', async ({
  adminPage,
}) => {
  const cap = await mockMemberDiscovery(adminPage);
  await adminPage.goto('/control-panel/member-discovery');

  // Wait for the ACME card so the defaults section is rendered.
  await expect(orgCard(adminPage, 'Acme Corporation')).toBeVisible();

  await adminPage
    .getByRole('checkbox', { name: /discover users by default/i })
    .uncheck();
  await adminPage
    .getByRole('checkbox', { name: /discover groups by default/i })
    .uncheck();

  // Remove the existing ACME override.
  await orgCard(adminPage, 'Acme Corporation')
    .getByRole('button', { name: /^remove override$/i })
    .click();
  await expect(orgCard(adminPage, 'Acme Corporation')).toHaveCount(0);

  await adminPage.getByRole('button', { name: /^save visibility controls$/i }).click();

  const put = await waitForPut(cap);
  const body = put.body as { member_discovery: MemberDiscoveryConfig };
  expect(body.member_discovery).toMatchObject({
    default_discover_users: false,
    default_discover_groups: false,
    organizations: [],
  });
});

// ---------------------------------------------------------------------------
// Absent-today guards — cases 1/2/3/4 all map to LDAP/SCIM/sync surfaces
// that this page does NOT expose.
// ---------------------------------------------------------------------------

test('absent today: no LDAP / SCIM / directory connector config, no sync controls, no attribute mappings', async ({
  adminPage,
}) => {
  await mockMemberDiscovery(adminPage);
  await adminPage.goto('/control-panel/member-discovery');
  await expect(orgCard(adminPage, 'Acme Corporation')).toBeVisible();

  // 1. No LDAP / SCIM connector config. The page is about visibility,
  //    not directory ingest.
  expect(
    await adminPage.getByRole('heading', { name: /ldap|scim|directory sync|directory connector/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('textbox', { name: /ldap (url|base dn|bind dn)|scim (endpoint|token)/i }).count(),
  ).toBe(0);

  // 2. No "Test sync" / "Test connection" CTA.
  expect(
    await adminPage.getByRole('button', { name: /test sync|test connection|run sync test/i }).count(),
  ).toBe(0);

  // 3. No attribute mappings UI. The org override only exposes 3
  //    toggles + a free-text Notes input — no `claim → group / field`
  //    rule builder, no JSON editor labelled "mappings".
  expect(
    await adminPage.getByRole('heading', { name: /attribute mappings|claim mappings|field mappings/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /add mapping|add rule/i }).count(),
  ).toBe(0);

  // 4. No "Sync now" / "Sync directory" button.
  expect(
    await adminPage.getByRole('button', { name: /sync now|sync directory|refresh directory/i }).count(),
  ).toBe(0);
});

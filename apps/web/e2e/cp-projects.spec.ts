import { type Page, type Route } from '@playwright/test';
import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/control-panel/projects`
 * (apps/web/src/routes/control-panel/ProjectsPage.tsx).
 *
 * **Reality check.** The page heading is "Projects (security
 * boundary)" — it is the SG.6 project-security admin, not a global
 * project catalog with quotas / ownership transfer / archive. It
 * composes:
 *
 *   - Project pill switcher (auto-selects the first project).
 *   - Per-project detail header (ID / slug / owner) + a typed edit
 *     form (default_role, point_of_contact user_id / email,
 *     propagate_view_requirements toggle, references JSON) →
 *     PATCH /projects/:id.
 *   - Propagation jobs list (read-only).
 *   - Group memberships (upsert / delete).
 *   - Viewer/Editor/Owner group-bootstrap shortcut.
 *   - Resource grants (project + folder scopes, user/group principals).
 *   - Effective-access probe (POST /effective-access).
 *   - Access-request form settings (groups, required markings).
 *   - Access requests list (Approve / Deny gated by a
 *     `window.prompt()` for an optional reason; Cancel).
 *
 * Mapping the requested cases:
 *
 *   - Case 1 (vista admin de todos los proyectos) ✅
 *   - Case 2 (transferir ownership) ❌ — owner is rendered as
 *     `<code>` only; `updateProject` accepts no `owner_id` patch.
 *   - Case 3 (archivar / unarchive) ❌ — no archive field on
 *     `OntologyProject`, no toggle in the form.
 *   - Case 4 (ver quotas y uso) ❌ — quotas live on /control-panel/
 *     tenancy per-organization, not on this page.
 *
 * Endpoints (mirrors `src/lib/api/tenancy.ts`):
 *   - GET   /api/v1/projects?per_page=100              → { data: OntologyProject[] }
 *   - PATCH /api/v1/projects/:id                        → OntologyProject
 *   - GET   /api/v1/projects/:id/propagate-view-requirements/jobs → { data: [] }
 *   - GET   /api/v1/projects/:id/group-memberships     → { data: [] }
 *   - PUT   /api/v1/projects/:id/group-memberships     → ProjectGroupMembership
 *   - GET   /api/v1/projects/:id/resource-grants       → { data: [] }
 *   - GET   /api/v1/projects/:id/access-request-form   → ProjectAccessRequestForm
 *   - GET   /api/v1/projects/:id/access-requests?…     → { data: [] }
 *   - POST  /api/v1/projects/:id/access-requests/:rid/decision → 204
 *   - POST  /api/v1/projects/:id/effective-access      → EffectiveAccessResponse
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

const E2E_NOW = '2026-05-11T00:00:00Z';

type ProjectRole = 'discoverer' | 'viewer' | 'editor' | 'owner';

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'project-acme',
    rid: 'ri.projects.acme',
    slug: 'acme',
    display_name: 'Acme Analytics',
    description: '',
    workspace_slug: 'default',
    owner_id: 'user-owner-1',
    default_role: 'viewer' as ProjectRole,
    point_of_contact_user_id: 'user-poc-1',
    point_of_contact_email: 'poc@acme.example',
    references: [],
    marking_rids: [],
    propagate_view_requirements_enabled: false,
    propagate_view_requirements_disabled_at: null,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

const PROJECT_ACME = makeProject({
  id: 'project-acme',
  slug: 'acme',
  display_name: 'Acme Analytics',
});

const PROJECT_BETA = makeProject({
  id: 'project-beta',
  slug: 'beta',
  display_name: 'Beta Insights',
  owner_id: 'user-owner-2',
  default_role: 'discoverer',
});

const PENDING_REQUEST = {
  id: 'req-pending-1',
  project_id: PROJECT_ACME.id,
  requested_by: 'user-requester-1',
  request_type: 'additional_project_access',
  requested_for_user_ids: [],
  requested_role: 'editor',
  reason: 'Onboarding new data engineer.',
  scope_resource_kind: null,
  scope_resource_id: null,
  status: 'pending',
  decided_by: null,
  decision_reason: null,
  created_at: E2E_NOW,
  decided_at: null,
  completed_at: null,
  tasks: [],
};

// Endpoint patterns
const PROJECTS_LIST = /\/api\/v1\/projects(?:\?|$)/;
const PROJECT_PATCH = (id: string) => new RegExp(`/api/v1/projects/${id}$`);
const PROJECT_GROUP_MEMBERSHIPS = (id: string) =>
  new RegExp(`/api/v1/projects/${id}/group-memberships$`);
const PROJECT_ACCESS_REQUEST_FORM = (id: string) =>
  new RegExp(`/api/v1/projects/${id}/access-request-form$`);
const PROJECT_ACCESS_REQUESTS = (id: string) =>
  new RegExp(`/api/v1/projects/${id}/access-requests(?:\\?|$)`);
const PROJECT_ACCESS_REQUEST_DECIDE = (id: string, rid: string) =>
  new RegExp(`/api/v1/projects/${id}/access-requests/${rid}/decision$`);
const PROJECT_EFFECTIVE_ACCESS = (id: string) =>
  new RegExp(`/api/v1/projects/${id}/effective-access`);

interface MockOpts {
  projects?: ReturnType<typeof makeProject>[];
  accessRequests?: typeof PENDING_REQUEST[];
}

async function mockProjects(page: Page, opts: MockOpts = {}) {
  const projects = opts.projects ?? [];
  const accessRequests = opts.accessRequests ?? [];

  await page.route(PROJECTS_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: projects } });
  });

  // The page reads `form.groups.length` and `form.required_markings.map(…)`,
  // so the catch-all envelope would crash. Return the empty-form shape
  // for every project.
  for (const project of projects) {
    await page.route(PROJECT_ACCESS_REQUEST_FORM(project.id), async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({ json: { groups: [], required_markings: [] } });
    });
    await page.route(PROJECT_ACCESS_REQUESTS(project.id), async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({ json: { data: accessRequests } });
    });
  }
}

async function waitForRequest(
  cap: ReturnType<typeof captureRequests>,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
) {
  await expect
    .poll(() => cap.calls.filter((c) => c.method === method).length)
    .toBeGreaterThanOrEqual(1);
  const matching = cap.calls.filter((c) => c.method === method);
  return matching[matching.length - 1];
}

// ---------------------------------------------------------------------------
// Case 1 — list projects + auto-select first + detail header
// ---------------------------------------------------------------------------

test('lists projects as pills, auto-selects the first, renders the detail header', async ({
  adminPage,
}) => {
  await mockProjects(adminPage, { projects: [PROJECT_ACME, PROJECT_BETA] });
  await adminPage.goto('/control-panel/projects');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^projects \(security boundary\)$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /^← control panel$/i }),
  ).toHaveAttribute('href', /\/control-panel$/);

  // Both project pills render.
  await expect(
    adminPage.getByRole('button', { name: /Acme Analytics\s*\(acme\)/ }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('button', { name: /Beta Insights\s*\(beta\)/ }),
  ).toBeVisible();

  // First project (Acme) is auto-selected; its detail header shows
  // ID / slug / owner.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^Acme Analytics$/ }),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/ID\s+project-acme.*slug\s+acme.*owner\s+user-owner-1/),
  ).toBeVisible();

  // Default role select hydrates from the project.
  await expect(
    adminPage.getByRole('combobox', { name: /default role/i }),
  ).toHaveValue('viewer');
  await expect(
    adminPage.getByRole('textbox', { name: /point of contact \(user id\)/i }),
  ).toHaveValue('user-poc-1');
});

// ---------------------------------------------------------------------------
// Save default_role + POC PATCHes /projects/:id
// ---------------------------------------------------------------------------

test('save: PATCH /projects/:id with default_role + point_of_contact_user_id + email + references', async ({
  adminPage,
}) => {
  await mockProjects(adminPage, { projects: [PROJECT_ACME] });
  const cap = captureRequests(adminPage, PROJECT_PATCH(PROJECT_ACME.id));
  await adminPage.route(PROJECT_PATCH(PROJECT_ACME.id), async (route: Route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await route.fulfill({
      json: makeProject({ ...PROJECT_ACME, default_role: 'editor' }),
    });
  });

  await adminPage.goto('/control-panel/projects');
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^Acme Analytics$/ }),
  ).toBeVisible();

  await adminPage
    .getByRole('combobox', { name: /default role/i })
    .selectOption('editor');
  await adminPage
    .getByRole('textbox', { name: /point of contact \(user id\)/i })
    .fill('user-poc-99');
  await adminPage
    .getByRole('textbox', { name: /point of contact \(email\)/i })
    .fill('new-poc@acme.example');

  // Scope into the per-project edit panel to avoid colliding with
  // the top-bar Workshop "Save" chrome button.
  const editPanel = adminPage
    .getByRole('heading', { level: 2, name: /^Acme Analytics$/ })
    .locator('xpath=ancestor::section[1]');
  await editPanel.getByRole('button', { name: /^save$/i }).click();

  const patch = await waitForRequest(cap, 'PATCH');
  expect(patch.body).toMatchObject({
    default_role: 'editor',
    point_of_contact_user_id: 'user-poc-99',
    point_of_contact_email: 'new-poc@acme.example',
    references: [],
    propagate_view_requirements_enabled: false,
  });
});

// ---------------------------------------------------------------------------
// Bind a group to a role (PUT /projects/:id/group-memberships)
// ---------------------------------------------------------------------------

test('bind group: PUT /projects/:id/group-memberships with group_id + role', async ({
  adminPage,
}) => {
  await mockProjects(adminPage, { projects: [PROJECT_ACME] });
  const cap = captureRequests(adminPage, PROJECT_GROUP_MEMBERSHIPS(PROJECT_ACME.id));
  await adminPage.route(PROJECT_GROUP_MEMBERSHIPS(PROJECT_ACME.id), async (route: Route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    await route.fulfill({
      json: {
        project_id: PROJECT_ACME.id,
        group_id: 'group-engineers',
        role: 'editor',
        granted_by: null,
        created_at: E2E_NOW,
        updated_at: E2E_NOW,
      },
    });
  });

  await adminPage.goto('/control-panel/projects');
  // Scope into the Group-memberships section. The "Group ID" textbox
  // appears in 4 sections (memberships, bootstrap, access-request
  // form, resource-grants); pick the one inside the section whose
  // h3 is "Group memberships".
  const groupSection = adminPage
    .getByRole('heading', { level: 3, name: /^group memberships$/i })
    .locator('xpath=ancestor::section[1]');

  await groupSection.getByRole('textbox', { name: /^group id$/i }).fill('group-engineers');
  await groupSection.getByRole('combobox', { name: /^role$/i }).selectOption('editor');
  await groupSection.getByRole('button', { name: /^bind group$/i }).click();

  const put = await waitForRequest(cap, 'PUT');
  expect(put.body).toMatchObject({ group_id: 'group-engineers', role: 'editor' });
});

// ---------------------------------------------------------------------------
// Approve a pending access request (window.prompt → POST /decision)
// ---------------------------------------------------------------------------

test('approve access request: window.prompt for reason → POST /decision with approved + reason', async ({
  adminPage,
}) => {
  await mockProjects(adminPage, {
    projects: [PROJECT_ACME],
    accessRequests: [PENDING_REQUEST],
  });
  const cap = captureRequests(adminPage, PROJECT_ACCESS_REQUEST_DECIDE(PROJECT_ACME.id, PENDING_REQUEST.id));
  await adminPage.route(
    PROJECT_ACCESS_REQUEST_DECIDE(PROJECT_ACME.id, PENDING_REQUEST.id),
    async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({ status: 204, body: '' });
    },
  );

  // The decide() handler calls `window.prompt(...)`. Auto-respond
  // with the reason text.
  adminPage.once('dialog', (dialog) => {
    expect(dialog.type()).toBe('prompt');
    expect(dialog.message()).toMatch(/reason for approved\?/i);
    void dialog.accept('Approved during onboarding sync.');
  });

  await adminPage.goto('/control-panel/projects');

  // The pending request row carries Approve/Deny/Cancel buttons; pick the
  // Approve button.
  const requestRow = adminPage
    .locator('li')
    .filter({ hasText: /onboarding new data engineer/i });
  await expect(requestRow).toBeVisible();
  await requestRow.getByRole('button', { name: /^approve$/i }).click();

  const post = await waitForRequest(cap, 'POST');
  expect(post.body).toMatchObject({
    decision: 'approved',
    reason: 'Approved during onboarding sync.',
  });
});

// ---------------------------------------------------------------------------
// Effective access probe — POST + result panel
// ---------------------------------------------------------------------------

test('effective access probe: GETs /effective-access with the query params + renders resolved role', async ({
  adminPage,
}) => {
  await mockProjects(adminPage, { projects: [PROJECT_ACME] });
  const cap = captureRequests(adminPage, PROJECT_EFFECTIVE_ACCESS(PROJECT_ACME.id));
  await adminPage.route(PROJECT_EFFECTIVE_ACCESS(PROJECT_ACME.id), async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        user_id: 'user-engineer-1',
        resolved_role: 'editor',
        sources: [
          { kind: 'group_membership', role: 'editor', group_id: 'group-engineers' },
        ],
      },
    });
  });

  await adminPage.goto('/control-panel/projects');
  const section = adminPage
    .getByRole('heading', { level: 3, name: /^effective access \(sg\.8\)$/i })
    .locator('xpath=ancestor::section[1]');

  await section.getByRole('textbox', { name: /^user id$/i }).fill('user-engineer-1');
  await section.getByRole('textbox', { name: /group ids/i }).fill('group-engineers');
  await section.getByRole('button', { name: /^resolve$/i }).click();

  // The probe is a GET — params live in the URL, not the body.
  await expect.poll(() => cap.calls.filter((c) => c.method === 'GET').length).toBeGreaterThanOrEqual(1);
  const get = cap.calls.filter((c) => c.method === 'GET').slice(-1)[0];
  expect(get.url).toContain('user_id=user-engineer-1');
  expect(get.url).toContain('scope_kind=project');
  expect(get.url).toContain('group_ids=group-engineers');

  // Result block renders the resolved role + the contributing source.
  await expect(section.getByText(/resolved role:/i)).toContainText('editor');
  await expect(section.getByText(/group_membership/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Absent-today — cases 2, 3, 4
// ---------------------------------------------------------------------------

test('absent today: transfer ownership, archive / unarchive, quotas and usage panels', async ({
  adminPage,
}) => {
  await mockProjects(adminPage, { projects: [PROJECT_ACME] });
  await adminPage.goto('/control-panel/projects');
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^Acme Analytics$/ }),
  ).toBeVisible();

  // 1. No transfer-ownership control. Owner is read-only `<code>`.
  expect(
    await adminPage.getByRole('button', { name: /transfer ownership|change owner|reassign owner/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('combobox', { name: /^owner$|new owner/i }).count(),
  ).toBe(0);

  // 2. No archive / unarchive toggle. `updateProject` doesn't accept
  //    an `archived` patch.
  expect(
    await adminPage.getByRole('button', { name: /^archive$|unarchive|archive project/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('checkbox', { name: /^archived$/i }).count(),
  ).toBe(0);

  // 3. No quotas / usage panels. Quotas live on the tenancy page
  //    (per-organization), not on the project security boundary.
  expect(
    await adminPage.getByRole('heading', { name: /^quotas$|usage|storage quota|compute quota/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByText(/\b(used|consumed|quota)\b\s*\d+\s*\/\s*\d+/i).count(),
  ).toBe(0);
});

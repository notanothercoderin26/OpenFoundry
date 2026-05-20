import { type Page, type Route } from '@playwright/test';
import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/control-panel/role-sets`
 * (apps/web/src/routes/control-panel/RoleSetsPage.tsx).
 *
 * **Reality check.** The page composes four sections:
 *
 *   - "Filter by context" — `<select>` over `all | project | ontology |
 *     restricted_view | platform_admin` that re-fires
 *     `GET /role-sets?context=...`.
 *   - "Create role set" — POSTs `{ slug, name, context, description? }`.
 *     Note: there is NO role-or-permission picker on create; roles are
 *     added one-at-a-time later via the per-card form.
 *   - "Delegation check" — picks a role set + target role + (optional)
 *     grantor user id, POSTs `/role-sets/:id/delegation:check`, then
 *     pretty-prints the response.
 *   - "Role sets" list — one `<article>` per role set with the rank-
 *     ordered role rows (Remove per row), an Add-role form
 *     (Role ID + Rank), and a Delete button gated by native `confirm()`.
 *   - "Operation catalog" — read-only `<dl>`-like grid grouping
 *     `resource:action` tokens by resource.
 *
 * Mapping the requested cases:
 *
 *   - Case 1 (list role sets) ✅
 *   - Case 2 ("crear: nombre + roles (matriz de permisos)") ⚠️ partial
 *     — create takes name/context only; roles are POSTed one-by-one
 *     after creation. There is NO matrix-style permissions picker.
 *   - Case 3 ("editar matriz") ⚠️ partial — only add/remove role
 *     rows is wired. `updateRoleSet` (name/description) exists in
 *     `lib/api/role-sets.ts` but is NOT imported here. There is no
 *     permissions-matrix editor.
 *   - Case 4 ("asignar a usuarios/grupos") ❌ not exposed. The
 *     closest surface is the Delegation check probe (read-only).
 *   - Case 5 (eliminar) ✅
 *
 * Endpoints (mirrors `src/lib/api/role-sets.ts`):
 *   - GET    /api/v1/role-sets[?context=...]              → RoleSetResponse[]
 *   - POST   /api/v1/role-sets                            → RoleSetResponse
 *   - DELETE /api/v1/role-sets/:id                        → 204
 *   - POST   /api/v1/role-sets/:id/roles                  → RoleSetRole
 *   - DELETE /api/v1/role-sets/:id/roles/:rid             → 204
 *   - POST   /api/v1/role-sets/:id/delegation:check       → CheckDelegationResponse
 *   - GET    /api/v1/operations                           → { items: OperationCatalogEntry[] }
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

type RoleSetContext = 'project' | 'ontology' | 'restricted_view' | 'platform_admin';

interface RoleSetRole {
  role_set_id: string;
  role_id: string;
  role_name: string;
  rank: number;
  created_at: string;
}

interface RoleSetResponse {
  id: string;
  tenant_id: string | null;
  slug: string;
  name: string;
  context: RoleSetContext;
  description: string | null;
  created_at: string;
  updated_at: string;
  roles: RoleSetRole[];
}

interface OperationCatalogEntry {
  id: string;
  resource: string;
  action: string;
  description: string | null;
}

const E2E_NOW = '2026-05-11T00:00:00Z';

function makeRoleSet(overrides: Partial<RoleSetResponse> = {}): RoleSetResponse {
  return {
    id: 'rs-1',
    tenant_id: null,
    slug: 'project-default',
    name: 'Project defaults',
    context: 'project',
    description: 'Owner / Editor / Viewer / Discoverer bundle.',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    roles: [
      { role_set_id: 'rs-1', role_id: 'role-owner', role_name: 'Owner', rank: 100, created_at: E2E_NOW },
      { role_set_id: 'rs-1', role_id: 'role-editor', role_name: 'Editor', rank: 60, created_at: E2E_NOW },
      { role_set_id: 'rs-1', role_id: 'role-viewer', role_name: 'Viewer', rank: 30, created_at: E2E_NOW },
    ],
    ...overrides,
  };
}

const PROJECT_DEFAULTS = makeRoleSet({
  id: 'rs-1',
  slug: 'project-default',
  name: 'Project defaults',
  context: 'project',
});

const ONTOLOGY_DEFAULTS = makeRoleSet({
  id: 'rs-2',
  slug: 'ontology-default',
  name: 'Ontology defaults',
  context: 'ontology',
  description: 'Ontology Owner / Editor / Viewer bundle.',
  roles: [
    { role_set_id: 'rs-2', role_id: 'onto-owner', role_name: 'OntologyOwner', rank: 100, created_at: E2E_NOW },
    { role_set_id: 'rs-2', role_id: 'onto-editor', role_name: 'OntologyEditor', rank: 60, created_at: E2E_NOW },
  ],
});

const OPERATIONS: OperationCatalogEntry[] = [
  { id: 'op-1', resource: 'project', action: 'read', description: 'Read project metadata.' },
  { id: 'op-2', resource: 'project', action: 'write', description: 'Write project metadata.' },
  { id: 'op-3', resource: 'dataset', action: 'read', description: null },
];

// Endpoint patterns
const ROLE_SETS_LIST = /\/api\/v1\/role-sets(?:\?|$)/;
const OPERATIONS_LIST = /\/api\/v1\/operations$/;
const ROLE_SET_DELETE = (id: string) => new RegExp(`/api/v1/role-sets/${id}$`);
const ROLE_SET_ADD_ROLE = (id: string) =>
  new RegExp(`/api/v1/role-sets/${id}/roles$`);
const ROLE_SET_REMOVE_ROLE = (id: string, rid: string) =>
  new RegExp(`/api/v1/role-sets/${id}/roles/${rid}$`);
const ROLE_SET_DELEGATION_CHECK = (id: string) =>
  new RegExp(`/api/v1/role-sets/${id}/delegation:check$`);

/**
 * Install the two GET mocks the page reads on mount. The mock for
 * /role-sets honours the `context` query param so the filter test
 * can assert the request fires AND returns a filtered subset.
 */
async function mockCatalog(
  page: Page,
  roleSets: RoleSetResponse[],
  ops: OperationCatalogEntry[] = OPERATIONS,
) {
  await page.route(ROLE_SETS_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const ctx = url.searchParams.get('context');
    const filtered = ctx ? roleSets.filter((rs) => rs.context === ctx) : roleSets;
    await route.fulfill({ json: filtered });
  });
  await page.route(OPERATIONS_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { items: ops } });
  });
  return captureRequests(page, ROLE_SETS_LIST);
}

// ---------------------------------------------------------------------------
// Case 1 — list role sets with their roles
// ---------------------------------------------------------------------------

test('lists role sets as cards with their rank-ordered roles', async ({
  adminPage,
}) => {
  await mockCatalog(adminPage, [PROJECT_DEFAULTS, ONTOLOGY_DEFAULTS]);
  await adminPage.goto('/control-panel/role-sets');

  // Page chrome.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^role sets & operations$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /^← control panel$/i }),
  ).toHaveAttribute('href', /\/control-panel$/);

  // Both role sets render. The card's strong is the name; the muted
  // meta line carries context + slug + ID.
  for (const rs of [PROJECT_DEFAULTS, ONTOLOGY_DEFAULTS]) {
    const card = adminPage
      .locator('article')
      .filter({ hasText: rs.name })
      .filter({ hasText: rs.slug });
    await expect(card).toBeVisible();
    await expect(card).toContainText(rs.context);
    // Each role row carries the role name, rank label and the role_id.
    for (const r of rs.roles) {
      await expect(card).toContainText(r.role_name);
      await expect(card).toContainText(`rank ${r.rank}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Filter by context — pins context option set + request behaviour
// ---------------------------------------------------------------------------

test('filter by context: select fires GET /role-sets?context=ontology and narrows the list', async ({
  adminPage,
}) => {
  const cap = await mockCatalog(adminPage, [PROJECT_DEFAULTS, ONTOLOGY_DEFAULTS]);
  await adminPage.goto('/control-panel/role-sets');

  // Wait for the initial load → both cards visible.
  await expect(
    adminPage.locator('article').filter({ hasText: PROJECT_DEFAULTS.name }),
  ).toBeVisible();
  await expect(
    adminPage.locator('article').filter({ hasText: ONTOLOGY_DEFAULTS.name }),
  ).toBeVisible();
  const before = cap.calls.length;

  // The filter combobox exposes exactly `all | project | ontology |
  // restricted_view | platform_admin`. Pin the option set so a future
  // context addition surfaces here.
  const contextSelect = adminPage.getByRole('combobox', { name: /filter by context/i });
  const values = await contextSelect.locator('option').evaluateAll((els) =>
    (els as HTMLOptionElement[]).map((el) => el.value),
  );
  expect(values).toEqual(['', 'project', 'ontology', 'restricted_view', 'platform_admin']);

  await contextSelect.selectOption('ontology');

  // Only Ontology defaults remains.
  await expect(
    adminPage.locator('article').filter({ hasText: ONTOLOGY_DEFAULTS.name }),
  ).toBeVisible();
  await expect(
    adminPage.locator('article').filter({ hasText: PROJECT_DEFAULTS.name }),
  ).toHaveCount(0);

  await expect.poll(() => cap.calls.length).toBeGreaterThan(before);
  expect(cap.last()?.url).toContain('context=ontology');
});

// ---------------------------------------------------------------------------
// Case 2 (partial) — create role set (no role/permission matrix)
// ---------------------------------------------------------------------------

test('create role set: POSTs slug + name + context + description', async ({
  adminPage,
}) => {
  await mockCatalog(adminPage, []);
  const cap = captureRequests(adminPage, ROLE_SETS_LIST);
  await adminPage.route(ROLE_SETS_LIST, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: makeRoleSet({
        id: 'rs-new-1',
        slug: 'restricted-default',
        name: 'Restricted defaults',
        context: 'restricted_view',
        description: 'Read-only carve-out.',
        roles: [],
      }),
    });
  });

  await adminPage.goto('/control-panel/role-sets');
  await expect(
    adminPage.getByRole('heading', { name: /^create role set$/i }),
  ).toBeVisible();

  await adminPage.getByRole('textbox', { name: /^slug$/i }).fill('restricted-default');
  await adminPage.getByRole('textbox', { name: /^name$/i }).fill('Restricted defaults');
  // Default context is `project` — switch to `restricted_view` to
  // assert the select binds to the body.
  await adminPage
    .getByRole('combobox', { name: /^context$/i })
    .selectOption('restricted_view');
  await adminPage
    .getByRole('textbox', { name: /^description$/i })
    .fill('Read-only carve-out.');

  await adminPage.getByRole('button', { name: /^create role set$/i }).click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);
  const post = cap.calls.filter((c) => c.method === 'POST').slice(-1)[0];
  expect(post.body).toMatchObject({
    slug: 'restricted-default',
    name: 'Restricted defaults',
    context: 'restricted_view',
    description: 'Read-only carve-out.',
  });
});

// ---------------------------------------------------------------------------
// Cases 2 + 3 — add role row (the closest thing to "matrix editing")
// ---------------------------------------------------------------------------

test('add role to a role set: POSTs { role_id, rank } to /role-sets/:id/roles', async ({
  adminPage,
}) => {
  await mockCatalog(adminPage, [PROJECT_DEFAULTS]);
  const cap = captureRequests(adminPage, ROLE_SET_ADD_ROLE(PROJECT_DEFAULTS.id));
  await adminPage.route(ROLE_SET_ADD_ROLE(PROJECT_DEFAULTS.id), async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: {
        role_set_id: PROJECT_DEFAULTS.id,
        role_id: 'role-discoverer',
        role_name: 'Discoverer',
        rank: 10,
        created_at: E2E_NOW,
      },
    });
  });

  await adminPage.goto('/control-panel/role-sets');
  const card = adminPage.locator('article').filter({ hasText: PROJECT_DEFAULTS.name });
  await expect(card).toBeVisible();

  await card.getByRole('textbox', { name: /^role id$/i }).fill('role-discoverer');
  // The rank input is `<input type="number">` so role is `spinbutton`.
  await card.getByRole('spinbutton', { name: /^rank$/i }).fill('10');
  await card.getByRole('button', { name: /^add role$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('POST');
  expect(cap.last()?.body).toMatchObject({ role_id: 'role-discoverer', rank: 10 });
});

// ---------------------------------------------------------------------------
// Case 3 — remove role row
// ---------------------------------------------------------------------------

test('remove role from a role set: DELETEs /role-sets/:id/roles/:rid', async ({
  adminPage,
}) => {
  await mockCatalog(adminPage, [PROJECT_DEFAULTS]);
  const cap = captureRequests(
    adminPage,
    ROLE_SET_REMOVE_ROLE(PROJECT_DEFAULTS.id, 'role-viewer'),
  );
  await adminPage.route(
    ROLE_SET_REMOVE_ROLE(PROJECT_DEFAULTS.id, 'role-viewer'),
    async (route: Route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      await route.fulfill({ status: 204, body: '' });
    },
  );

  await adminPage.goto('/control-panel/role-sets');
  const card = adminPage.locator('article').filter({ hasText: PROJECT_DEFAULTS.name });

  // Locate the Viewer row by the role name + click its Remove button.
  const viewerRow = card.locator('li').filter({ hasText: 'Viewer' });
  await viewerRow.getByRole('button', { name: /^remove$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('DELETE');
});

// ---------------------------------------------------------------------------
// Case 5 — Delete role set (with native confirm)
// ---------------------------------------------------------------------------

test('delete role set: confirms then DELETEs /role-sets/:id', async ({
  adminPage,
}) => {
  await mockCatalog(adminPage, [PROJECT_DEFAULTS]);
  const cap = captureRequests(adminPage, ROLE_SET_DELETE(PROJECT_DEFAULTS.id));
  await adminPage.route(ROLE_SET_DELETE(PROJECT_DEFAULTS.id), async (route: Route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    await route.fulfill({ status: 204, body: '' });
  });

  let dialogMessage = '';
  adminPage.once('dialog', (dialog) => {
    dialogMessage = dialog.message();
    void dialog.accept();
  });

  await adminPage.goto('/control-panel/role-sets');
  const card = adminPage.locator('article').filter({ hasText: PROJECT_DEFAULTS.name });
  await card.getByRole('button', { name: /^delete$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('DELETE');

  // Confirm copy names the role set. No member-count, no
  // "type the name to confirm" pattern today.
  expect(dialogMessage).toMatch(/delete role set "Project defaults"\?/i);
});

// ---------------------------------------------------------------------------
// Case 4 (closest surface) — Delegation check probe
// ---------------------------------------------------------------------------

test('delegation check: POSTs target_role_id + grantor_id and renders the result JSON', async ({
  adminPage,
}) => {
  await mockCatalog(adminPage, [PROJECT_DEFAULTS]);
  const cap = captureRequests(adminPage, ROLE_SET_DELEGATION_CHECK(PROJECT_DEFAULTS.id));
  await adminPage.route(
    ROLE_SET_DELEGATION_CHECK(PROJECT_DEFAULTS.id),
    async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({
        json: {
          allowed: true,
          grantor_role_id: 'role-owner',
          grantor_rank: 100,
          target_role_id: 'role-editor',
          target_rank: 60,
          reason: 'grantor rank ≥ target rank',
        },
      });
    },
  );

  await adminPage.goto('/control-panel/role-sets');
  const section = adminPage
    .getByRole('heading', { name: /^delegation check$/i })
    .locator('xpath=ancestor::section[1]');

  // Pick the role set, then the target role (the target combobox
  // hydrates from the selected set's roles), then the grantor user.
  await section.getByRole('combobox', { name: /^role set$/i }).selectOption(PROJECT_DEFAULTS.id);
  await section.getByRole('combobox', { name: /^target role$/i }).selectOption('role-editor');
  await section.getByRole('textbox', { name: /grantor user id/i }).fill('user-admin-1');

  await section.getByRole('button', { name: /^check delegation$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('POST');
  expect(cap.last()?.body).toMatchObject({
    target_role_id: 'role-editor',
    grantor_id: 'user-admin-1',
  });

  // Result pretty-prints the response into a `<pre>` inside the section.
  await expect(section.locator('pre')).toContainText('"allowed": true');
  await expect(section.locator('pre')).toContainText('"grantor_rank": 100');
});

// ---------------------------------------------------------------------------
// Absent-today guards — cases 3 partial + 4 missing
// ---------------------------------------------------------------------------

test('absent today: name/description edit form, permissions-matrix editor, user/group assignment UI', async ({
  adminPage,
}) => {
  await mockCatalog(adminPage, [PROJECT_DEFAULTS]);
  await adminPage.goto('/control-panel/role-sets');
  const card = adminPage.locator('article').filter({ hasText: PROJECT_DEFAULTS.name });
  await expect(card).toBeVisible();

  // 1. No edit form for name / description on the role-set card. The
  //    `updateRoleSet` API exists in `lib/api/role-sets.ts` but the
  //    page never imports it. The card only exposes Delete +
  //    Add-role / Remove-role.
  expect(await card.getByRole('button', { name: /^edit$/i }).count()).toBe(0);
  expect(await card.getByRole('button', { name: /rename|edit name|edit description/i }).count()).toBe(0);

  // 2. No permissions-matrix editor. The CreateForm has slug / name /
  //    context / description only; adding a role takes Role ID + Rank,
  //    NOT a checkbox grid of `resource:action` operations. Pin the
  //    absence of a matrix-style picker.
  const createPanel = adminPage
    .getByRole('heading', { name: /^create role set$/i })
    .locator('xpath=ancestor::section[1]');
  expect(
    await createPanel.getByRole('checkbox', { name: /:|read|write|delete|create/i }).count(),
  ).toBe(0);
  expect(
    await createPanel.getByRole('grid').count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('heading', { name: /permissions matrix|capability matrix|role matrix/i }).count(),
  ).toBe(0);

  // 3. No assign-to-users / assign-to-groups surface. Role sets are
  //    bound to identities elsewhere (project security pages, the
  //    cedar policy engine). Pin no membership/binding UI lives here.
  expect(
    await adminPage.getByRole('button', { name: /assign to (user|group)|add (user|group) binding|manage members/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('heading', { name: /members|user bindings|group bindings/i }).count(),
  ).toBe(0);

  // 4. Sanity: the Operation catalog is read-only (no per-row
  //    selection, no "add operation" CTA).
  const opsPanel = adminPage
    .getByRole('heading', { name: /^operation catalog$/i })
    .locator('xpath=ancestor::section[1]');
  await expect(opsPanel).toBeVisible();
  expect(
    await opsPanel.getByRole('button', { name: /add operation|edit operation/i }).count(),
  ).toBe(0);
  expect(
    await opsPanel.getByRole('checkbox').count(),
  ).toBe(0);
});

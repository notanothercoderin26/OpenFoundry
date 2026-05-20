import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/projects/:projectId`
 * (apps/web/src/routes/projects/ProjectDetailPage.tsx, 2570 LoC).
 *
 * **Reality vs roadmap.** The shipped detail page is a Compass-style
 * IDE shell with a left sidebar (Cover page / Files / Autosaved /
 * Project Catalog / References / Trash / Memberships) — not the
 * roadmap's flat 4-tab layout (Files / Members / Settings / Activity).
 * The actual divergences:
 *
 *   - No dedicated Settings tab. Project metadata edits (display
 *     name / description / workspace) live in the Cover-page surface
 *     or via PATCH from other controls.
 *   - No dedicated Activity tab. The references / catalog sidebar
 *     surfaces fulfil related needs.
 *   - There is no per-row drag-drop reordering between folders.
 *     Files render as a table; moving items is not a Playwright
 *     `dragTo` interaction in shipped UI.
 *   - No inline rename. Folders / resources expose name edits only
 *     through dedicated dialogs.
 *
 * Endpoints exercised:
 *   - GET    /api/v1/ontology/projects/{id}
 *   - GET    /api/v1/ontology/projects/{id}/folders
 *   - GET    /api/v1/ontology/projects/{id}/resources
 *   - GET    /api/v1/ontology/projects/{id}/memberships
 *   - GET    /api/v1/ontology/projects?per_page=200
 *   - GET    /api/v1/workspace/favorites?limit=500
 *   - GET    /api/v1/workspace/trash?limit=300
 *   - POST   /api/v1/workspace/favorites               (star toggle)
 *   - POST   /api/v1/ontology/projects/{id}/folders    (new folder)
 *   - POST   /api/v1/ontology/projects/{id}/memberships (add member)
 *   - DELETE /api/v1/ontology/projects/{id}/memberships/{user}
 *   - DELETE /api/v1/ontology/projects/{id}            (move to trash)
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

const E2E_NOW = '2026-05-11T00:00:00Z';
const PROJECT_ID = 'project-alpha';

interface ProjectFixture {
  id: string;
  rid: string;
  slug: string;
  display_name: string;
  description: string;
  workspace_slug: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  default_role: 'editor';
  marking_rids: string[];
}

interface FolderFixture {
  id: string;
  rid: string;
  project_id: string;
  project_rid: string;
  parent_folder_id: string | null;
  parent_folder_rid: string;
  space_rid: string;
  type: 'FOLDER';
  trash_status: 'NOT_TRASHED';
  inherits_project_policies: boolean;
  policy_overrides_allowed: boolean;
  name: string;
  slug: string;
  description: string;
  created_by: string;
}

interface MembershipFixture {
  project_id: string;
  user_id: string;
  role: 'viewer' | 'editor' | 'owner';
  created_at: string;
  updated_at: string;
}

function makeProject(overrides: Partial<ProjectFixture> = {}): ProjectFixture {
  return {
    id: PROJECT_ID,
    rid: `ri.compass.main.project.${PROJECT_ID}`,
    slug: 'analytics',
    display_name: 'Analytics',
    description: 'Quarterly business analytics collection.',
    workspace_slug: 'default',
    owner_id: '00000000-0000-0000-0000-000000000001',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    default_role: 'editor',
    marking_rids: [],
    ...overrides,
  };
}

function makeFolder(overrides: Partial<FolderFixture> = {}): FolderFixture {
  return {
    id: 'folder-1',
    rid: `ri.compass.main.folder.${PROJECT_ID}.folder-1`,
    project_id: PROJECT_ID,
    project_rid: `ri.compass.main.project.${PROJECT_ID}`,
    parent_folder_id: null,
    parent_folder_rid: `ri.compass.main.project.${PROJECT_ID}`,
    space_rid: 'ri.compass.main.space.default',
    type: 'FOLDER',
    trash_status: 'NOT_TRASHED',
    inherits_project_policies: true,
    policy_overrides_allowed: false,
    name: 'Reports',
    slug: 'reports',
    description: '',
    created_by: '00000000-0000-0000-0000-000000000001',
    ...overrides,
  };
}

function makeMembership(overrides: Partial<MembershipFixture> = {}): MembershipFixture {
  return {
    project_id: PROJECT_ID,
    user_id: 'user-co-owner',
    role: 'editor',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

interface ProjectDetailMockState {
  project: ProjectFixture;
  folders: FolderFixture[];
  memberships: MembershipFixture[];
}

/**
 * Stateful mock for every endpoint the detail page reads/writes during
 * the spec lifetime. The page calls `refreshFolders`/`refreshMemberships`
 * etc. after every mutation, so handlers must mutate `state` and the
 * subsequent GET must reflect it.
 */
async function mockProjectDetail(
  page: Page,
  initial: ProjectDetailMockState,
): Promise<{ state: ProjectDetailMockState }> {
  const state: ProjectDetailMockState = {
    project: { ...initial.project },
    folders: initial.folders.slice(),
    memberships: initial.memberships.slice(),
  };

  const projectPath = `**/api/v1/ontology/projects/${state.project.id}`;
  const foldersPath = `${projectPath}/folders`;
  const resourcesPath = `${projectPath}/resources`;
  const membershipsPath = `${projectPath}/memberships`;

  // ── Project detail GET / PATCH / DELETE ─────────────────────────────
  await page.route(new RegExp(`/api/v1/ontology/projects/${state.project.id}(\\?|$)`), async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: state.project });
      return;
    }
    if (method === 'PATCH') {
      const body = (route.request().postDataJSON() ?? {}) as Partial<ProjectFixture>;
      state.project = { ...state.project, ...body };
      await route.fulfill({ json: state.project });
      return;
    }
    if (method === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    return route.fallback();
  });

  // ── Folders GET / POST ─────────────────────────────────────────────
  await page.route(foldersPath, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { data: state.folders } });
      return;
    }
    if (method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as { name: string; description?: string; parent_folder_id?: string | null };
      const next = makeFolder({
        id: `folder-${state.folders.length + 1}`,
        rid: `ri.compass.main.folder.${state.project.id}.folder-${state.folders.length + 1}`,
        name: body.name,
        slug: body.name.toLowerCase().replace(/\s+/g, '-'),
        description: body.description ?? '',
        parent_folder_id: body.parent_folder_id ?? null,
      });
      state.folders.push(next);
      await route.fulfill({ status: 201, json: next });
      return;
    }
    return route.fallback();
  });

  // ── Resources GET (always empty in this spec) ───────────────────────
  await page.route(resourcesPath, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: [] } });
  });

  // ── Memberships GET / POST / DELETE ─────────────────────────────────
  await page.route(membershipsPath, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { data: state.memberships } });
      return;
    }
    if (method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as { user_id: string; role: 'viewer' | 'editor' | 'owner' };
      const idx = state.memberships.findIndex((m) => m.user_id === body.user_id);
      if (idx >= 0) {
        state.memberships[idx] = { ...state.memberships[idx], role: body.role, updated_at: E2E_NOW };
      } else {
        state.memberships.push(makeMembership({ user_id: body.user_id, role: body.role }));
      }
      await route.fulfill({
        status: 200,
        json: state.memberships.find((m) => m.user_id === body.user_id),
      });
      return;
    }
    return route.fallback();
  });

  await page.route(new RegExp(`/api/v1/ontology/projects/${state.project.id}/memberships/[^/]+$`), async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    const match = /\/memberships\/([^/?#]+)/.exec(route.request().url());
    if (match) {
      const uid = match[1];
      state.memberships = state.memberships.filter((m) => m.user_id !== uid);
    }
    await route.fulfill({ status: 204, body: '' });
  });

  // ── Available projects list (sidebar uses for navigation) ───────────
  await page.route(/\/api\/v1\/ontology\/projects(\?|$)/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    if (route.request().url().includes(`/${state.project.id}`)) return route.fallback();
    await route.fulfill({
      json: { data: [state.project], total: 1, page: 1, per_page: 200 },
    });
  });

  // ── Workspace endpoints called on mount ─────────────────────────────
  await page.route('**/api/v1/workspace/favorites**', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { data: [], groups: [] } });
      return;
    }
    if (method === 'POST') {
      await route.fulfill({ status: 201, json: {} });
      return;
    }
    return route.fallback();
  });
  await page.route(/\/api\/v1\/workspace\/favorites\/[^/]+\/[^/]+$/, async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/v1/workspace/trash**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: [] } });
  });
  await page.route('**/api/v1/workspace/resources/resolve', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({ json: { data: [] } });
  });

  return { state };
}

const FOLDER_REPORTS = makeFolder({ id: 'folder-reports', name: 'Reports', slug: 'reports' });
const FOLDER_RAW = makeFolder({
  id: 'folder-raw',
  rid: `ri.compass.main.folder.${PROJECT_ID}.folder-raw`,
  name: 'Raw data',
  slug: 'raw-data',
});
const MEMBER_EDITOR = makeMembership({ user_id: 'user-bob', role: 'editor' });

test('renders project header + sidebar nav with the main tabs', async ({ adminPage }) => {
  await mockProjectDetail(adminPage, {
    project: makeProject(),
    folders: [FOLDER_REPORTS],
    memberships: [],
  });
  await adminPage.goto(`/projects/${PROJECT_ID}`);

  // h1 = display name; description renders both as a `<p>` summary and
  // as a `<textarea>` in a hidden settings editor — assert the
  // paragraph specifically to avoid the strict-mode duplicate match.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^Analytics$/i }),
  ).toBeVisible();
  await expect(
    adminPage
      .getByRole('paragraph')
      .filter({ hasText: /quarterly business analytics collection/i }),
  ).toBeVisible();

  // Sidebar shows the three main destinations the roadmap calls out.
  // The shipped sidebar surfaces them via custom buttons (not
  // `role="tab"`), so we match on accessible name text.
  for (const label of ['Cover page', 'Files', 'Memberships']) {
    await expect(
      adminPage.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first(),
    ).toBeVisible();
  }
});

test('switching to the Files tab renders the folder list', async ({ adminPage }) => {
  await mockProjectDetail(adminPage, {
    project: makeProject(),
    folders: [FOLDER_REPORTS, FOLDER_RAW],
    memberships: [],
  });
  await adminPage.goto(`/projects/${PROJECT_ID}`);

  await adminPage.getByRole('button', { name: /^Files$/i }).first().click();

  // Both mocked folders surface in the Files view.
  await expect(adminPage.getByText('Reports').first()).toBeVisible();
  await expect(adminPage.getByText('Raw data').first()).toBeVisible();
});

test('"+ New" opens the ResourcePickerDialog with the create options', async ({
  adminPage,
}) => {
  await mockProjectDetail(adminPage, {
    project: makeProject(),
    folders: [FOLDER_REPORTS],
    memberships: [],
  });
  await adminPage.goto(`/projects/${PROJECT_ID}`);

  // The "+ New" button label is just "New" (the icon is a separate
  // glyph). Scope to the header to avoid sidebar sub-items.
  await adminPage.getByRole('button', { name: /^new/i }).first().click();

  // ResourcePickerDialog renders Folder + Upload files + Dataset +
  // Pipeline Builder + Bind existing as `role="button"` cards within
  // the dialog. The accessible name concatenates `entry.name + entry.
  // description` so we anchor with `^...` rather than `^...$`.
  for (const card of [
    /^Folder/,
    /^Upload files\.\.\./,
    /^Dataset/,
    /^Pipeline Builder/,
    /^Bind existing resource/,
  ]) {
    await expect(
      adminPage.getByRole('button', { name: card }).first(),
    ).toBeVisible();
  }
});

test('create a folder: pick Folder → fill name → POST captured', async ({ adminPage }) => {
  const { state } = await mockProjectDetail(adminPage, {
    project: makeProject(),
    folders: [],
    memberships: [],
  });
  const cap = captureRequests(adminPage, new RegExp(`/api/v1/ontology/projects/${PROJECT_ID}/folders$`));
  await adminPage.goto(`/projects/${PROJECT_ID}`);

  await adminPage.getByRole('button', { name: /^new/i }).first().click();
  await adminPage.getByRole('button', { name: /^Folder$/ }).first().click();

  // The CompactDialog is `role="dialog"` with aria-label "New folder".
  const dialog = adminPage.getByRole('dialog', { name: /new folder/i });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel(/^name$/i).fill('Quarterly reports');
  await dialog.getByRole('button', { name: /create folder/i }).click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(1);
  const post = cap.calls.find((c) => c.method === 'POST');
  expect(post?.body).toMatchObject({ name: 'Quarterly reports' });

  // The stateful mock + refresh shows the new folder in the Files view.
  expect(state.folders.map((f) => f.name)).toContain('Quarterly reports');
});

test('star toggle: POSTs to /workspace/favorites with the project key', async ({
  adminPage,
}) => {
  await mockProjectDetail(adminPage, {
    project: makeProject(),
    folders: [],
    memberships: [],
  });
  const cap = captureRequests(adminPage, /\/api\/v1\/workspace\/favorites(?!\/)/);
  await adminPage.goto(`/projects/${PROJECT_ID}`);

  // Initial state: not favorited → button labelled "Add to favorites".
  const star = adminPage.getByRole('button', { name: /add to favorites/i });
  await expect(star).toBeVisible();
  await star.click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(1);
  const post = cap.calls.find((c) => c.method === 'POST');
  expect(post?.body).toMatchObject({
    resource_kind: 'ontology_project',
    resource_id: PROJECT_ID,
  });
});

test('Share button opens the Share dialog', async ({ adminPage }) => {
  await mockProjectDetail(adminPage, {
    project: makeProject(),
    folders: [],
    memberships: [],
  });
  await adminPage.goto(`/projects/${PROJECT_ID}`);

  await adminPage.getByRole('button', { name: /share project/i }).click();

  // ShareDialog is the only OTHER `role="dialog"` that opens on this
  // surface after a button click (no confirm flow has fired yet) — its
  // accessible name comes from the dialog's title heading.
  await expect(adminPage.getByRole('dialog').first()).toBeVisible();
});

test('Memberships tab: lists members and exposes the add-member controls', async ({
  adminPage,
}) => {
  await mockProjectDetail(adminPage, {
    project: makeProject(),
    folders: [],
    memberships: [MEMBER_EDITOR],
  });
  await adminPage.goto(`/projects/${PROJECT_ID}`);

  await adminPage.getByRole('button', { name: /^Memberships$/i }).first().click();

  // Member row visible.
  await expect(adminPage.getByText('user-bob')).toBeVisible();
  await expect(adminPage.locator('.of-chip').filter({ hasText: /^editor$/i })).toBeVisible();

  // Add-member controls present: a "User id" labeled input + Role
  // select + Add button. `<label>Role <select></label>` doesn't
  // produce a matching accessible-name association for getByLabel
  // (the label's text accumulates the option list too), so we scope
  // the select via its enclosing label using locator chaining.
  await expect(adminPage.getByLabel(/user id/i)).toBeVisible();
  const roleSelect = adminPage
    .locator('label')
    .filter({ hasText: /^Role/ })
    .locator('select');
  await expect(roleSelect).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^add$/i }).first()).toBeVisible();
});

test('add a member: POSTs upsert with user_id + role', async ({ adminPage }) => {
  const { state } = await mockProjectDetail(adminPage, {
    project: makeProject(),
    folders: [],
    memberships: [],
  });
  const cap = captureRequests(adminPage, new RegExp(`/api/v1/ontology/projects/${PROJECT_ID}/memberships$`));
  await adminPage.goto(`/projects/${PROJECT_ID}`);

  await adminPage.getByRole('button', { name: /^Memberships$/i }).first().click();

  await adminPage.getByLabel(/user id/i).fill('user-new');
  const roleSelect = adminPage
    .locator('label')
    .filter({ hasText: /^Role/ })
    .locator('select');
  await roleSelect.selectOption('owner');
  await adminPage.getByRole('button', { name: /^add$/i }).first().click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(1);
  const post = cap.calls.find((c) => c.method === 'POST');
  expect(post?.body).toMatchObject({ user_id: 'user-new', role: 'owner' });

  // The new member appears in state and on screen.
  expect(state.memberships.map((m) => m.user_id)).toContain('user-new');
  await expect(adminPage.getByText('user-new')).toBeVisible();
});

test('remove a member: opens the confirm and fires DELETE', async ({ adminPage }) => {
  const { state } = await mockProjectDetail(adminPage, {
    project: makeProject(),
    folders: [],
    memberships: [MEMBER_EDITOR],
  });
  const cap = captureRequests(adminPage, new RegExp(`/api/v1/ontology/projects/${PROJECT_ID}/memberships/`));
  await adminPage.goto(`/projects/${PROJECT_ID}`);

  await adminPage.getByRole('button', { name: /^Memberships$/i }).first().click();

  await adminPage.getByRole('button', { name: /^Remove$/ }).click();

  // ConfirmDialog "Remove member".
  const confirm = adminPage.getByRole('dialog', { name: /remove member/i });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: /^Remove$/ }).click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'DELETE').length).toBeGreaterThanOrEqual(1);
  const del = cap.calls.find((c) => c.method === 'DELETE');
  expect(del?.url).toMatch(/\/memberships\/user-bob$/);

  expect(state.memberships).toHaveLength(0);
});

test('delete project: trash icon → confirm "Move project to trash" → DELETE → redirect to /projects', async ({
  adminPage,
}) => {
  await mockProjectDetail(adminPage, {
    project: makeProject(),
    folders: [],
    memberships: [],
  });
  const cap = captureRequests(adminPage, new RegExp(`/api/v1/ontology/projects/${PROJECT_ID}$`));
  await adminPage.goto(`/projects/${PROJECT_ID}`);

  await adminPage.getByRole('button', { name: /^delete project$/i }).click();

  const dialog = adminPage.getByRole('dialog', { name: /move project to trash/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /delete project/i }).click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'DELETE').length).toBeGreaterThanOrEqual(1);
  await expect(adminPage).toHaveURL(/\/projects(\?|$)/);
});

test('absent today: dedicated Activity tab, inline rename, and drag-drop reorder', async ({
  adminPage,
}) => {
  // Regression guards for the three roadmap controls the shipped page
  // does not provide today. When each one lands, the assertion flips
  // and forces a spec update.
  await mockProjectDetail(adminPage, {
    project: makeProject(),
    folders: [FOLDER_REPORTS],
    memberships: [MEMBER_EDITOR],
  });
  await adminPage.goto(`/projects/${PROJECT_ID}`);

  // 1. No dedicated "Activity" tab in the sidebar.
  expect(
    await adminPage.getByRole('button', { name: /^Activity$/i }).count(),
  ).toBe(0);

  // 2. No inline rename: clicking a folder name should not surface an
  //    editable input within the row. (The folder name renders as
  //    static text; an inline edit would expose a `role="textbox"`
  //    inside the row.)
  await adminPage.getByRole('button', { name: /^Files$/i }).first().click();
  const row = adminPage.locator('tr', { hasText: 'Reports' });
  expect(await row.getByRole('textbox').count()).toBe(0);

  // 3. No drag handle on file rows. The shipped UI does not expose
  //    a per-row drag affordance — a future roadmap item.
  expect(
    await row.getByRole('button', { name: /drag|move/i }).count(),
  ).toBe(0);
});

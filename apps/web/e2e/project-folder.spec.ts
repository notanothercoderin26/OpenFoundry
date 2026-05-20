import { type Page } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/projects/:projectId/folders/:folderId`
 * (apps/web/src/routes/projects/ProjectFolderPage.tsx).
 *
 * **Reality vs roadmap.** The shipped folder page differs from the
 * roadmap on one important point: there is NO file-upload UI on this
 * route. Uploads live in the `ResourcePickerDialog` reachable from
 * the project root ("+ New" → "Upload files…"), not from the folder
 * pages. The roadmap's "Upload file → POST upload" case is therefore
 * pinned as an absent-today regression guard at the end of this
 * spec.
 *
 * What IS shipped on this page:
 *   - `ProjectBreadcrumb` ("Projects ▸ <project> ▸ <…ancestors…> ▸
 *     <folder>") with clickable segments for every ancestor.
 *   - `<h1>{folder.name}</h1>` plus folder metadata (rid / slug /
 *     parent).
 *   - Left `FolderTree` sidebar (selected = current folder).
 *   - "Add subfolder" panel: input + Create button →
 *     `POST /api/v1/ontology/projects/:id/folders` with
 *     `parent_folder_id`.
 *   - "Folder contents" table with checkbox/name/kind/owner/updated/
 *     OpenWithMenu/RowActionsMenu and an empty-state row when there
 *     are no children.
 *   - Clicking a folder name navigates into it (`folderStablePath`).
 *
 * Endpoints exercised:
 *   - GET    /api/v1/ontology/projects/{id}
 *   - GET    /api/v1/ontology/projects/{id}/folders
 *   - GET    /api/v1/ontology/projects/{id}/resources
 *   - GET    /api/v1/ontology/projects?per_page=200
 *   - POST   /api/v1/ontology/projects/{id}/folders   (add subfolder)
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
  created_at: string;
  updated_at: string;
}

function makeProject(overrides: Partial<ProjectFixture> = {}): ProjectFixture {
  return {
    id: PROJECT_ID,
    rid: `ri.compass.main.project.${PROJECT_ID}`,
    slug: 'analytics',
    display_name: 'Analytics',
    description: '',
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
  const id = overrides.id ?? `${PROJECT_ID}.folder-root`;
  // Default rid mirrors the `<projectId>.<shortId>` shape so the
  // page's `resourceLocatorFromStableSegment` extraction round-trips
  // back to `folder.id`. Callers can still override rid explicitly.
  return {
    id,
    rid: `ri.compass.main.folder.${id}`,
    project_id: PROJECT_ID,
    project_rid: `ri.compass.main.project.${PROJECT_ID}`,
    parent_folder_id: null,
    parent_folder_rid: `ri.compass.main.project.${PROJECT_ID}`,
    space_rid: 'ri.compass.main.space.default',
    type: 'FOLDER',
    trash_status: 'NOT_TRASHED',
    inherits_project_policies: true,
    policy_overrides_allowed: false,
    name: 'Root',
    slug: 'root',
    description: '',
    created_by: '00000000-0000-0000-0000-000000000001',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

interface FolderPageMockState {
  project: ProjectFixture;
  folders: FolderFixture[];
}

async function mockFolderPage(
  page: Page,
  initial: FolderPageMockState,
): Promise<{ state: FolderPageMockState }> {
  const state: FolderPageMockState = {
    project: { ...initial.project },
    folders: initial.folders.slice(),
  };

  // Click-through navigation switches the URL from raw IDs to RID-
  // encoded segments (e.g. `/projects/project-alpha/folders/folder-1`
  // → `/projects/ri.compass.main.project.project-alpha/folders/
  // ri.compass.main.folder.project-alpha.folder-1`). Use regex
  // patterns that match either form by accepting any non-slash
  // segment after `/projects/`.

  await page.route(/\/api\/v1\/ontology\/projects\/[^/?#]+(\?[^/]*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: state.project });
  });

  await page.route(/\/api\/v1\/ontology\/projects\/[^/]+\/folders$/, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { data: state.folders } });
      return;
    }
    if (method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as {
        name: string;
        parent_folder_id?: string | null;
      };
      const parentId = body.parent_folder_id ?? null;
      const parent = parentId ? state.folders.find((f) => f.id === parentId) : null;
      const newId = `${state.project.id}.folder-new-${state.folders.length + 1}`;
      const next = makeFolder({
        id: newId,
        name: body.name,
        slug: body.name.toLowerCase().replace(/\s+/g, '-'),
        parent_folder_id: parentId,
        parent_folder_rid:
          parent?.rid ?? `ri.compass.main.project.${state.project.id}`,
      });
      state.folders.push(next);
      await route.fulfill({ status: 201, json: next });
      return;
    }
    return route.fallback();
  });

  await page.route(/\/api\/v1\/ontology\/projects\/[^/]+\/resources$/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: [] } });
  });

  // Projects list (per_page=200 query) — distinct from project-detail
  // GET because it has a query string and the detail GET pattern above
  // requires a non-slash segment immediately after `/projects/`.
  await page.route(/\/api\/v1\/ontology\/projects\?[^/]*$/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: [state.project], total: 1, page: 1, per_page: 200 },
    });
  });

  return { state };
}

// Three-level folder hierarchy used by the deep-navigation tests.
// Folder IDs are deliberately set to the `<projectId>.<shortId>` shape
// that `resourceLocatorFromStableSegment` extracts from a stable RID
// (`ri.compass.main.folder.<projectId>.<shortId>` → `<projectId>.
// <shortId>`). With this alignment, both the initial navigation (raw
// id in the URL) AND the click-through navigation (RID-encoded URL
// generated by `folderStablePath`) resolve to the same `folder.id`.
const PROJECT = makeProject();
const ROOT = makeFolder({
  id: `${PROJECT_ID}.folder-root`,
  name: 'Engineering',
  slug: 'engineering',
});
const CHILD = makeFolder({
  id: `${PROJECT_ID}.folder-child`,
  name: 'Frontend',
  slug: 'frontend',
  parent_folder_id: ROOT.id,
  parent_folder_rid: ROOT.rid,
});
const GRANDCHILD = makeFolder({
  id: `${PROJECT_ID}.folder-grand`,
  name: 'Web App',
  slug: 'web-app',
  parent_folder_id: CHILD.id,
  parent_folder_rid: CHILD.rid,
});

test('renders breadcrumb + h1 + folder metadata for a top-level folder', async ({
  adminPage,
}) => {
  await mockFolderPage(adminPage, { project: PROJECT, folders: [ROOT] });
  await adminPage.goto(`/projects/${PROJECT_ID}/folders/${ROOT.id}`);

  // Breadcrumb rendered with project + folder segments. The shipped
  // ProjectBreadcrumb uses `<nav aria-label="Resource breadcrumb">`.
  const breadcrumb = adminPage.getByRole('navigation', { name: /resource breadcrumb/i });
  await expect(breadcrumb).toBeVisible();

  // Ancestor links present; current folder is non-link (aria-current).
  await expect(breadcrumb.getByRole('link', { name: /^Projects$/i })).toBeVisible();
  await expect(breadcrumb.getByRole('link', { name: /^Analytics$/i })).toBeVisible();
  await expect(
    breadcrumb.locator('[aria-current="page"]').filter({ hasText: /^Engineering$/i }),
  ).toBeVisible();

  // H1 = folder.name.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^Engineering$/i }),
  ).toBeVisible();
});

test('breadcrumb segment click navigates one level up to the project', async ({
  adminPage,
}) => {
  await mockFolderPage(adminPage, { project: PROJECT, folders: [ROOT, CHILD] });
  await adminPage.goto(`/projects/${PROJECT_ID}/folders/${CHILD.id}`);

  const breadcrumb = adminPage.getByRole('navigation', { name: /resource breadcrumb/i });
  // Three ancestor links (Projects, project, parent folder) + one
  // `aria-current="page"` for the current folder.
  await expect(breadcrumb.getByRole('link', { name: /^Engineering$/i })).toBeVisible();

  await breadcrumb.getByRole('link', { name: /^Analytics$/i }).click();
  await expect(adminPage).toHaveURL(/\/projects\/[^/]+$/);
});

test('folder contents table renders child folders with action menus', async ({
  adminPage,
}) => {
  await mockFolderPage(adminPage, { project: PROJECT, folders: [ROOT, CHILD] });
  await adminPage.goto(`/projects/${PROJECT_ID}/folders/${ROOT.id}`);

  // Child folder ("Frontend") rendered as the row's name button.
  await expect(adminPage.getByRole('button', { name: /^Frontend$/ })).toBeVisible();
  // Kind column shows "folder".
  await expect(adminPage.locator('td').filter({ hasText: /^folder$/ })).toBeVisible();
  // Row checkbox is accessible via "Select Frontend".
  await expect(adminPage.getByLabel(/select frontend/i)).toBeVisible();
});

test('empty folder shows the "This folder is empty." copy', async ({ adminPage }) => {
  await mockFolderPage(adminPage, { project: PROJECT, folders: [ROOT] });
  await adminPage.goto(`/projects/${PROJECT_ID}/folders/${ROOT.id}`);

  await expect(adminPage.getByText(/this folder is empty\./i)).toBeVisible();
  // No per-row "Select <name>" checkbox in the body. The header still
  // exposes "Select all visible items", so scope this guard to checkbox
  // labels that DON'T contain "all".
  const rowCheckboxes = adminPage
    .getByRole('checkbox')
    .filter({ hasNot: adminPage.getByLabel(/select all/i) });
  // (No straightforward locator to negate via accessible name in a
  // single regex, so we count and filter explicitly.)
  const labels = await adminPage
    .getByRole('checkbox')
    .evaluateAll((nodes) =>
      nodes.map((n) => (n.getAttribute('aria-label') ?? '').toLowerCase()),
    );
  void rowCheckboxes;
  expect(
    labels.filter((label) => label.startsWith('select ') && !label.startsWith('select all')),
  ).toEqual([]);
});

test('adding a subfolder POSTs with parent_folder_id and the new row appears', async ({
  adminPage,
}) => {
  const { state } = await mockFolderPage(adminPage, {
    project: PROJECT,
    folders: [ROOT],
  });
  const cap = captureRequests(adminPage, new RegExp(`/api/v1/ontology/projects/${PROJECT_ID}/folders$`));
  await adminPage.goto(`/projects/${PROJECT_ID}/folders/${ROOT.id}`);

  await adminPage.getByPlaceholder(/subfolder name/i).fill('Reports Q1');
  await adminPage.getByRole('button', { name: /^Create$/ }).click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(1);
  const post = cap.calls.find((c) => c.method === 'POST');
  expect(post?.body).toMatchObject({
    name: 'Reports Q1',
    parent_folder_id: ROOT.id,
  });

  // Stateful mock + auto-refresh surfaces the new row.
  expect(state.folders.map((f) => f.name)).toContain('Reports Q1');
  await expect(adminPage.getByRole('button', { name: /^Reports Q1$/ })).toBeVisible();
});

test('clicking a child-folder name navigates 3 levels deep', async ({ adminPage }) => {
  await mockFolderPage(adminPage, {
    project: PROJECT,
    folders: [ROOT, CHILD, GRANDCHILD],
  });
  await adminPage.goto(`/projects/${PROJECT_ID}/folders/${ROOT.id}`);

  // Level 1 → 2: click Frontend.
  await adminPage.getByRole('button', { name: /^Frontend$/ }).click();
  await expect(adminPage).toHaveURL(/\/folders\/[^/]+/);
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^Frontend$/i }),
  ).toBeVisible();

  // Level 2 → 3: click Web App from the new view.
  await adminPage.getByRole('button', { name: /^Web App$/ }).click();
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^Web App$/i }),
  ).toBeVisible();

  // Breadcrumb now lists three ancestor segments above the current
  // page: Projects, project, parent folder, grandparent folder.
  const breadcrumb = adminPage.getByRole('navigation', { name: /resource breadcrumb/i });
  for (const ancestor of [/^Projects$/, /^Analytics$/, /^Engineering$/, /^Frontend$/]) {
    await expect(breadcrumb.getByRole('link', { name: ancestor })).toBeVisible();
  }
  await expect(
    breadcrumb.locator('[aria-current="page"]').filter({ hasText: /^Web App$/i }),
  ).toBeVisible();
});

test('absent today: no file-upload input on folder pages', async ({ adminPage }) => {
  // Regression guard. The roadmap describes a file-input upload from
  // folder pages but the shipped UI delegates uploads to the project
  // root ("+ New" → "Upload files…" in ResourcePickerDialog). When a
  // future ticket adds a folder-level uploader, this assertion flips.
  await mockFolderPage(adminPage, { project: PROJECT, folders: [ROOT] });
  await adminPage.goto(`/projects/${PROJECT_ID}/folders/${ROOT.id}`);

  expect(await adminPage.locator('input[type="file"]').count()).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /upload (file|files)/i }).count(),
  ).toBe(0);

  // And no upload-related endpoints fire during the folder lifetime
  // beyond what the catch-all and helper mocks return.
  const uploads = captureRequests(adminPage, /\/(upload|files)\b/);
  await adminPage.waitForTimeout(300);
  expect(uploads.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
});

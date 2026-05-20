import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { E2E_NOW } from './fixtures/mocks';
import { CodeReposPage } from './pages';

/**
 * E2E coverage for `/code-repos`
 * (apps/web/src/routes/code-repos/CodeReposPage.tsx).
 *
 * **Surface.** A six-pane workspace for OpenFoundry's *object-backed*
 * code repos (not a GitHub/GitLab integration). The page composes:
 *
 *   - Hero with overview KPIs (repos / open MRs / files / CI runs).
 *   - RepoExplorer — repository list + metadata draft (visibility,
 *     backend, package kind, settings JSON).
 *   - FileViewer — tree + Monaco-style editor.
 *   - DiffViewer — branch picker + patch.
 *   - BranchManager — branches, switch / merge / delete, tags.
 *   - CommitHistory — commit list + atomic commit draft + Trigger CI.
 *   - MergeRequestList / Detail — MR lifecycle.
 *
 * Wire endpoints exercised:
 *   - GET   /api/v1/code-repos/overview
 *   - GET   /api/v1/code-repos/repositories
 *   - GET   /api/v1/code-repos/repositories/{id}/branches
 *   - GET   /api/v1/code-repos/repositories/{id}/commits
 *   - GET   /api/v1/code-repos/repositories/{id}/files
 *   - GET   /api/v1/code-repos/repositories/{id}/ci
 *   - GET   /api/v1/code-repos/repositories/{id}/diff?branch=...
 *   - GET   /api/v1/code-repos/repositories/{id}/tags
 *   - GET   /api/v1/code-repos/merge-requests?repository_id=...
 *   - POST  /api/v1/code-repos/repositories                  (new repo)
 *   - POST  /api/v1/code-repos/repositories/{id}/ci          (trigger CI)
 *
 * Note that this is NOT a GitHub/GitLab OAuth integration — the
 * "connect" surface is purely a metadata form against OpenFoundry's
 * own backend. The shipped UI has no provider chooser, no OAuth
 * handshake, no provider-specific URL prefill, and no
 * device-authorisation flow; pinned in the absent-today guard. The
 * `CodeReposPage` page-object's `connectRepoButton` / `branchSelect`
 * / `browseFilesButton` locators are aspirational labels.
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /^console\.error: %o$/,
      /Failed to load/i,
    ],
  },
});

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

interface RepositoryFixture {
  id: string;
  name: string;
  slug: string;
  description: string;
  owner: string;
  default_branch: string;
  visibility: 'public' | 'private';
  object_store_backend: string;
  git_storage_path: string;
  git_http_url: string;
  git_ssh_url: string;
  git_ssh_enabled: boolean;
  package_kind: string;
  tags: string[];
  settings: Record<string, unknown>;
  compass_project_rid: string;
  compass_folder_rid: string;
  acl: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
  trashed_at: null;
  trashed_by: null;
}

interface BranchFixture {
  id: string;
  repository_id: string;
  name: string;
  head_sha: string;
  base_branch: string | null;
  is_default: boolean;
  protected: boolean;
  ahead_by: number;
  pending_reviews: number;
  updated_at: string;
}

interface CommitFixture {
  id: string;
  repository_id: string;
  branch_name: string;
  sha: string;
  parent_sha: string | null;
  title: string;
  description: string;
  author_name: string;
  author_email: string;
  files_changed: number;
  additions: number;
  deletions: number;
  created_at: string;
}

interface RepositoryFileFixture {
  id: string;
  repository_id: string;
  path: string;
  branch_name: string;
  language: string;
  size_bytes: number;
  content: string;
  last_commit_sha: string;
}

interface CiRunFixture {
  id: string;
  repository_id: string;
  branch_name: string;
  commit_sha: string;
  pipeline_name: string;
  status: string;
  trigger: string;
  started_at: string;
  completed_at: string | null;
  checks: string[];
}

const WIDGET_KIT: RepositoryFixture = {
  id: 'repo-widget-kit',
  name: 'Foundry Widget Kit',
  slug: 'foundry-widget-kit',
  description: 'Shared widget primitives ready for marketplace publication.',
  owner: 'Platform UI',
  default_branch: 'main',
  visibility: 'private',
  object_store_backend: 'gitoxide-pack',
  git_storage_path: '/var/git/foundry-widget-kit.git',
  git_http_url: 'https://git.openfoundry.local/foundry-widget-kit.git',
  git_ssh_url: 'git@git.openfoundry.local:foundry-widget-kit.git',
  git_ssh_enabled: true,
  package_kind: 'widget',
  tags: ['widgets', 'ui'],
  settings: { default_path: 'src/lib.rs', ci_required: true, allow_direct_commits_on_protected: false },
  compass_project_rid: 'ri.compass.project.widget-kit',
  compass_folder_rid: 'ri.compass.folder.widget-kit',
  acl: {},
  created_by: 'user-1',
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
  trashed_at: null,
  trashed_by: null,
};

const CONNECTOR_PACK: RepositoryFixture = {
  id: 'repo-connector-pack',
  name: 'Foundry Connector Pack',
  slug: 'foundry-connector-pack',
  description: 'Source connectors for the Foundry data plane.',
  owner: 'Data Connections',
  default_branch: 'main',
  visibility: 'private',
  object_store_backend: 'gitoxide-pack',
  git_storage_path: '/var/git/foundry-connector-pack.git',
  git_http_url: 'https://git.openfoundry.local/foundry-connector-pack.git',
  git_ssh_url: 'git@git.openfoundry.local:foundry-connector-pack.git',
  git_ssh_enabled: true,
  package_kind: 'connector',
  tags: ['connector', 'ingest'],
  settings: { default_path: 'src/lib.rs', ci_required: true, allow_direct_commits_on_protected: false },
  compass_project_rid: 'ri.compass.project.connector-pack',
  compass_folder_rid: 'ri.compass.folder.connector-pack',
  acl: {},
  created_by: 'user-1',
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
  trashed_at: null,
  trashed_by: null,
};

const BRANCH_MAIN: BranchFixture = {
  id: 'branch-main',
  repository_id: WIDGET_KIT.id,
  name: 'main',
  head_sha: 'abc123',
  base_branch: null,
  is_default: true,
  protected: true,
  ahead_by: 0,
  pending_reviews: 0,
  updated_at: E2E_NOW,
};

const BRANCH_FEATURE: BranchFixture = {
  id: 'branch-feature',
  repository_id: WIDGET_KIT.id,
  name: 'feature/widget-card',
  head_sha: 'def456',
  base_branch: 'main',
  is_default: false,
  protected: false,
  ahead_by: 3,
  pending_reviews: 1,
  updated_at: E2E_NOW,
};

const COMMIT_INITIAL: CommitFixture = {
  id: 'commit-1',
  repository_id: WIDGET_KIT.id,
  branch_name: 'main',
  sha: 'abc12345',
  parent_sha: null,
  title: 'Initial widget kit scaffold',
  description: 'Stand up the package skeleton and manifest defaults.',
  author_name: 'Casey Author',
  author_email: 'casey@example.com',
  files_changed: 12,
  additions: 320,
  deletions: 0,
  created_at: E2E_NOW,
};

const COMMIT_REFINE: CommitFixture = {
  id: 'commit-2',
  repository_id: WIDGET_KIT.id,
  branch_name: 'feature/widget-card',
  sha: 'def45678',
  parent_sha: 'abc12345',
  title: 'Refine widget card metadata',
  description: 'Tightens metadata + manifest defaults ahead of publication.',
  author_name: 'Casey Author',
  author_email: 'casey@example.com',
  files_changed: 4,
  additions: 48,
  deletions: 12,
  created_at: E2E_NOW,
};

const FILE_LIB: RepositoryFileFixture = {
  id: 'file-1',
  repository_id: WIDGET_KIT.id,
  path: 'src/lib.rs',
  branch_name: 'main',
  language: 'rust',
  size_bytes: 256,
  content: 'pub fn entrypoint() {}\n',
  last_commit_sha: 'abc12345',
};

const FILE_MANIFEST: RepositoryFileFixture = {
  id: 'file-2',
  repository_id: WIDGET_KIT.id,
  path: 'manifest.toml',
  branch_name: 'main',
  language: 'toml',
  size_bytes: 96,
  content: '[package]\nname = "widget-kit"\n',
  last_commit_sha: 'abc12345',
};

const CI_RUN_LATEST: CiRunFixture = {
  id: 'ci-run-1',
  repository_id: WIDGET_KIT.id,
  branch_name: 'main',
  commit_sha: 'abc12345',
  pipeline_name: 'package-validation',
  status: 'passed',
  trigger: 'manual',
  started_at: E2E_NOW,
  completed_at: E2E_NOW,
  checks: ['lint', 'test', 'build'],
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

interface CodeRepoMocks {
  repositories: RepositoryFixture[];
  branchesByRepoId: Record<string, BranchFixture[]>;
  commitsByRepoId: Record<string, CommitFixture[]>;
  filesByRepoId: Record<string, RepositoryFileFixture[]>;
  ciRunsByRepoId: Record<string, CiRunFixture[]>;
  overview: {
    repository_count: number;
    private_repository_count: number;
    package_kind_mix: string[];
    open_merge_request_count: number;
    latest_merge_request: null;
  };
}

function defaultMocks(): CodeRepoMocks {
  return {
    repositories: [WIDGET_KIT, CONNECTOR_PACK],
    branchesByRepoId: { [WIDGET_KIT.id]: [BRANCH_MAIN, BRANCH_FEATURE] },
    commitsByRepoId: { [WIDGET_KIT.id]: [COMMIT_INITIAL, COMMIT_REFINE] },
    filesByRepoId: { [WIDGET_KIT.id]: [FILE_LIB, FILE_MANIFEST] },
    ciRunsByRepoId: { [WIDGET_KIT.id]: [CI_RUN_LATEST] },
    overview: {
      repository_count: 2,
      private_repository_count: 2,
      package_kind_mix: ['widget', 'connector'],
      open_merge_request_count: 0,
      latest_merge_request: null,
    },
  };
}

async function installCodeRepoMocks(page: Page, mocks: CodeRepoMocks): Promise<void> {
  await page.route(/\/api\/v1\/code-repos\/overview$/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: mocks.overview });
  });

  await page.route(/\/api\/v1\/code-repos\/repositories\/[^/]+\/branches(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const id = /\/repositories\/([^/]+)\/branches/.exec(route.request().url())?.[1] ?? '';
    await route.fulfill({ json: { items: mocks.branchesByRepoId[id] ?? [] } });
  });

  await page.route(/\/api\/v1\/code-repos\/repositories\/[^/]+\/commits(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const id = /\/repositories\/([^/]+)\/commits/.exec(route.request().url())?.[1] ?? '';
    await route.fulfill({ json: { items: mocks.commitsByRepoId[id] ?? [] } });
  });

  await page.route(/\/api\/v1\/code-repos\/repositories\/[^/]+\/files(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const id = /\/repositories\/([^/]+)\/files/.exec(route.request().url())?.[1] ?? '';
    await route.fulfill({ json: { items: mocks.filesByRepoId[id] ?? [] } });
  });

  await page.route(/\/api\/v1\/code-repos\/repositories\/[^/]+\/ci(\?|$)/, async (route: Route) => {
    const method = route.request().method();
    const id = /\/repositories\/([^/]+)\/ci/.exec(route.request().url())?.[1] ?? '';
    if (method === 'GET') {
      await route.fulfill({ json: { items: mocks.ciRunsByRepoId[id] ?? [] } });
      return;
    }
    if (method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as { branch_name?: string };
      await route.fulfill({
        json: {
          id: 'ci-run-new',
          repository_id: id,
          branch_name: body.branch_name ?? 'main',
          commit_sha: 'new12345',
          pipeline_name: 'package-validation',
          status: 'queued',
          trigger: 'manual',
          started_at: E2E_NOW,
          completed_at: null,
          checks: ['lint', 'test', 'build'],
        },
      });
      return;
    }
    await route.fallback();
  });

  await page.route(/\/api\/v1\/code-repos\/repositories\/[^/]+\/diff(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const branch = url.searchParams.get('branch') ?? 'main';
    await route.fulfill({
      json: { branch_name: branch, patch: `--- a/manifest.toml\n+++ b/manifest.toml\n@@ -1 +1 @@\n-name = "old"\n+name = "new"\n` },
    });
  });

  await page.route(/\/api\/v1\/code-repos\/repositories\/[^/]+\/tags(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { items: [] } });
  });

  await page.route(/\/api\/v1\/code-repos\/merge-requests(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { items: [] } });
  });

  // Repository list/create (register last so a more-specific per-id
  // route stays unshadowed by the bare-list URL).
  await page.route(/\/api\/v1\/code-repos\/repositories(\?|$)/, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { items: mocks.repositories } });
      return;
    }
    if (method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        json: {
          ...WIDGET_KIT,
          id: 'repo-new-1',
          name: (body.name as string) ?? 'New repo',
          slug: (body.slug as string) ?? 'new-repo',
          description: (body.description as string) ?? '',
          owner: (body.owner as string) ?? 'Platform UI',
          tags: ((body.tags as string[]) ?? []),
          settings: (body.settings as Record<string, unknown>) ?? {},
        },
      });
      return;
    }
    await route.fallback();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/**
 * The shipped page does NOT auto-select the first repo on load (the
 * `selectedRepositoryId ?? items[0]?.id` fallback short-circuits
 * because the initial state is an empty string, not nullish). Tests
 * that need branches / commits / files / ci data populated call this
 * helper after `goto()` to seed the workspace state.
 */
async function selectFirstRepo(adminPage: Page): Promise<void> {
  await adminPage
    .getByRole('combobox', { name: /Repositories/i })
    .selectOption(WIDGET_KIT.id);
}

test('renders the hero, KPI strip, and every workspace section after the initial load', async ({
  adminPage,
}) => {
  await installCodeRepoMocks(adminPage, defaultMocks());
  const page = new CodeReposPage(adminPage);
  await page.goto();
  await page.expectLoaded();

  // Hero copy.
  await expect(adminPage.getByText(/^Code Repositories$/)).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /Object-backed repos, branches, commits, CI, and merge reviews/i }),
  ).toBeVisible();

  // KPI labels render in both the hero strip AND the RepoExplorer
  // metadata card — using `.first()` is enough to prove the hero
  // chips ship. "CI Runs" is unique to the hero; everything else
  // doubles.
  await expect(adminPage.getByText(/^Repos$/i).first()).toBeVisible();
  await expect(adminPage.getByText(/^Open MRs$/i).first()).toBeVisible();
  await expect(adminPage.getByText(/^Files$/i).first()).toBeVisible();
  await expect(adminPage.getByText(/^CI Runs$/i)).toBeVisible();

  // Every workspace section header lands.
  for (const h of [
    'Object-backed repos, package kinds, and owner metadata',
    'Monaco file tree and multi-tab editor',
    'Protected bases and feature streams',
    'History, pipeline triggers, and atomic file commits',
  ]) {
    await expect(adminPage.getByRole('heading', { name: h })).toBeVisible();
  }
});

test('lists the connected repositories in the RepoExplorer and selecting one fetches its branches', async ({
  adminPage,
}) => {
  await installCodeRepoMocks(adminPage, {
    ...defaultMocks(),
    branchesByRepoId: {
      [WIDGET_KIT.id]: [BRANCH_MAIN, BRANCH_FEATURE],
      [CONNECTOR_PACK.id]: [{ ...BRANCH_MAIN, repository_id: CONNECTOR_PACK.id, id: 'branch-connector-main' }],
    },
  });
  const branchCalls = captureRequests(
    adminPage,
    /\/api\/v1\/code-repos\/repositories\/[^/]+\/branches(\?|$)/,
  );

  const page = new CodeReposPage(adminPage);
  await page.goto();

  // Each mocked repo renders as a clickable row button inside the
  // RepoExplorer's Repositories panel — pin the rows via the
  // role-button accessible name, which is built from the repo
  // display copy.
  await expect(
    adminPage.getByRole('button', { name: new RegExp(`^${WIDGET_KIT.name}\\b`) }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('button', { name: new RegExp(`^${CONNECTOR_PACK.name}\\b`) }),
  ).toBeVisible();

  // Selecting via the Repositories <select> triggers
  // `loadRepositoryContext`, which fetches branches for that repo.
  // The page does not auto-select on initial load.
  const beforeBranchCalls = branchCalls.count();
  await adminPage
    .getByRole('combobox', { name: /Repositories/i })
    .selectOption(CONNECTOR_PACK.id);

  await expect.poll(() => branchCalls.count()).toBeGreaterThan(beforeBranchCalls);
  expect(branchCalls.last()?.url).toMatch(new RegExp(`/repositories/${CONNECTOR_PACK.id}/branches`));
});

test('Branches panel renders the mocked branch list with Default/Feature chips + per-row actions', async ({
  adminPage,
}) => {
  await installCodeRepoMocks(adminPage, defaultMocks());
  const page = new CodeReposPage(adminPage);
  await page.goto();
  await selectFirstRepo(adminPage);

  await expect(
    adminPage.getByRole('heading', { name: /Protected bases and feature streams/i }),
  ).toBeVisible();

  const branchesSection = adminPage.locator('section.of-panel', {
    has: adminPage.getByRole('heading', { name: /Protected bases and feature streams/i }),
  });

  // Both branches surface inside the Branches panel.
  await expect(branchesSection.getByText(BRANCH_MAIN.name, { exact: true })).toBeVisible();
  await expect(branchesSection.getByText(BRANCH_FEATURE.name, { exact: true })).toBeVisible();

  // Default + Feature chips are present.
  await expect(branchesSection.getByText(/^Default$/i)).toBeVisible();
  await expect(branchesSection.getByText(/^Feature$/i)).toBeVisible();
  // Protected / Writable chips per row.
  await expect(branchesSection.getByText(/^Protected$/i)).toBeVisible();
  await expect(branchesSection.getByText(/^Writable$/i)).toBeVisible();

  // Per-row Switch / Merge / Delete buttons are wired up (Delete is
  // disabled on the default branch row, but it still renders).
  await expect(branchesSection.getByRole('button', { name: /^Switch$/ }).first()).toBeVisible();
  await expect(branchesSection.getByRole('button', { name: /^Merge$/ }).first()).toBeVisible();
  await expect(branchesSection.getByRole('button', { name: /^Delete$/ }).first()).toBeVisible();
});

test('FileViewer renders the file tree and CommitHistory renders the mocked commits', async ({
  adminPage,
}) => {
  await installCodeRepoMocks(adminPage, defaultMocks());
  const page = new CodeReposPage(adminPage);
  await page.goto();
  await selectFirstRepo(adminPage);

  // FileViewer's "File Browser" eyebrow anchors the file tree
  // section. Both mocked file paths render as buttons inside the
  // tree, plus the selected file appears in the dark editor card
  // and the tab strip — pin one instance per path with `.first()`.
  await expect(
    adminPage.getByRole('heading', { name: /Monaco file tree and multi-tab editor/i }),
  ).toBeVisible();
  await expect(adminPage.getByText(FILE_LIB.path).first()).toBeVisible();
  await expect(adminPage.getByText(FILE_MANIFEST.path).first()).toBeVisible();

  // CommitHistory renders the commit titles + the files-changed
  // chip + the diff summary.
  const commitSection = adminPage.locator('section.of-panel', {
    has: adminPage.getByRole('heading', { name: /History, pipeline triggers, and atomic file commits/i }),
  });
  await expect(commitSection.getByText(COMMIT_INITIAL.title)).toBeVisible();
  await expect(commitSection.getByText(COMMIT_REFINE.title)).toBeVisible();
  // "12 files" + "4 files" chips from files_changed.
  await expect(commitSection.getByText(/^12 files$/)).toBeVisible();
  await expect(commitSection.getByText(/^4 files$/)).toBeVisible();
  // Additions / deletions chips.
  await expect(commitSection.getByText(/^\+320$/)).toBeVisible();
  await expect(commitSection.getByText(/^-12$/)).toBeVisible();
});

test('Trigger CI POSTs to /code-repos/repositories/{id}/ci with the active commit-draft branch (connect-to-pipeline)', async ({
  adminPage,
}) => {
  await installCodeRepoMocks(adminPage, defaultMocks());
  const ciCalls = captureRequests(
    adminPage,
    new RegExp(`/api/v1/code-repos/repositories/${WIDGET_KIT.id}/ci(\\?|$)`),
  );

  const page = new CodeReposPage(adminPage);
  await page.goto();
  await selectFirstRepo(adminPage);
  // Wait until the workspace has settled.
  await expect(adminPage.getByText(COMMIT_INITIAL.title)).toBeVisible();
  const baselineGets = ciCalls.calls.filter((c) => c.method === 'GET').length;

  // The "Trigger CI" button lives in the CommitHistory panel header.
  const commitSection = adminPage.locator('section.of-panel', {
    has: adminPage.getByRole('heading', { name: /History, pipeline triggers, and atomic file commits/i }),
  });
  await commitSection.getByRole('button', { name: /^Trigger CI$/ }).click();

  // Filter the captures to POSTs only — triggerCiAction does not
  // call refreshAll, but the route is shared with the GET so we
  // still need to disambiguate.
  const posts = () => ciCalls.calls.filter((c) => c.method === 'POST');
  await expect.poll(() => posts().length).toBeGreaterThanOrEqual(1);
  const call = posts().at(-1);
  expect(call?.url).toMatch(new RegExp(`/repositories/${WIDGET_KIT.id}/ci$`));
  // The default `commitDraft.branch_name` is the first writable
  // branch — "feature/widget-card" (BRANCH_MAIN is protected).
  expect(call?.body).toEqual({ branch_name: BRANCH_FEATURE.name });

  // GETs do not change as a side effect (triggerCiAction prepends
  // the run locally rather than re-fetching).
  expect(ciCalls.calls.filter((c) => c.method === 'GET').length).toBe(baselineGets);
});

test('"New draft" → "Create repo" POSTs the form payload to /code-repos/repositories', async ({
  adminPage,
}) => {
  await installCodeRepoMocks(adminPage, defaultMocks());
  const repoCalls = captureRequests(adminPage, /\/api\/v1\/code-repos\/repositories(\?|$)/);

  const page = new CodeReposPage(adminPage);
  await page.goto();
  // The repo list renders without selecting one (page does not
  // auto-select) — the form already shows "Create repo" because no
  // repo is loaded into the draft. Locate the RepoExplorer.
  const repoExplorer = adminPage.locator('section.of-panel', {
    has: adminPage.getByRole('heading', { name: /Object-backed repos, package kinds, and owner metadata/i }),
  });
  await expect(repoExplorer.getByRole('button', { name: /^Create repo$/ })).toBeVisible();

  await repoExplorer.getByRole('button', { name: /^Create repo$/ }).click();

  // Filter to POST — the chained refreshAll() also fires GETs.
  const posts = () => repoCalls.calls.filter((c) => c.method === 'POST');
  await expect.poll(() => posts().length).toBeGreaterThanOrEqual(1);
  const body = posts().at(-1)?.body as Record<string, unknown> | undefined;
  // The default emptyRepoDraft seeds the form, so the POST carries
  // the demo "Foundry Widget Kit" payload + a parsed settings JSON.
  expect(body).toMatchObject({
    name: 'Foundry Widget Kit',
    slug: 'foundry-widget-kit',
    owner: 'Platform UI',
    default_branch: 'main',
    visibility: 'private',
    package_kind: 'widget',
  });
  // tags_text → parsed CSV.
  expect(body?.tags).toEqual(['widgets', 'ui', 'marketplace']);
  // settings_text → parsed JSON.
  expect(body?.settings).toMatchObject({ ci_required: true });
});

test('absent today: no GitHub / GitLab / OAuth provider chooser, no device-authorisation flow', async ({
  adminPage,
}) => {
  // Regression guard. The CodeReposPage page object's
  // `connectRepoButton` regex (/connect|add repo/i) is aspirational
  // — the shipped page is purely an internal "object-backed" repo
  // workspace with no third-party OAuth integration. When a real
  // provider connector lands (Connect GitHub / Connect GitLab /
  // OAuth handshake / device-code prompt), each absent-today
  // assertion below flips and forces real coverage.
  await installCodeRepoMocks(adminPage, defaultMocks());
  const page = new CodeReposPage(adminPage);
  await page.goto();
  await page.expectLoaded();
  // Wait for the workspace to fully render (the RepoExplorer is the
  // last panel mounted as `loading` flips off).
  await expect(
    adminPage.getByRole('heading', { name: /Object-backed repos, package kinds, and owner metadata/i }),
  ).toBeVisible();

  // No "Connect GitHub" / "Connect GitLab" / "Connect Bitbucket"
  // CTAs.
  expect(
    await adminPage.getByRole('button', { name: /connect (github|gitlab|bitbucket)/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('link', { name: /connect (github|gitlab|bitbucket)/i }).count(),
  ).toBe(0);

  // No provider chooser/select (e.g. `<select>` whose options
  // include "GitHub" or "GitLab").
  await expect(adminPage.locator('option', { hasText: /^GitHub$/ })).toHaveCount(0);
  await expect(adminPage.locator('option', { hasText: /^GitLab$/ })).toHaveCount(0);

  // No OAuth handshake links (we'd expect /api/v1/auth/oauth or
  // /oauth/authorize to show up somewhere if the flow shipped).
  expect(
    await adminPage.getByRole('link', { name: /sign in with (github|gitlab|bitbucket)/i }).count(),
  ).toBe(0);

  // No device-code / "Authorize this device" copy from a device-
  // authorisation grant.
  expect(
    await adminPage.getByText(/enter device code|authorize this device/i).count(),
  ).toBe(0);

  // The page object's `connectRepoButton` regex
  // (/connect|add repo/i) is greedy enough to match any string
  // containing the word "connect" — in this fixture it
  // false-positives on a repo named "Foundry Connector Pack" and a
  // "Data Connections" owner cell. Pin the absence using a
  // narrower regex anchored on the word boundary so a real
  // provider-connect CTA still flips the assertion when it lands.
  expect(
    await adminPage
      .getByRole('button', { name: /^\s*Connect (a |new )?repo(sitory)?\b/i })
      .count(),
  ).toBe(0);
});

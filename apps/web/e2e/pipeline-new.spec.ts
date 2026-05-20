import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/pipelines/new`
 * (apps/web/src/routes/pipelines/PipelineNewPage.tsx).
 *
 * **Reality vs roadmap.** The shipped page is NOT a multi-step wizard. It is
 * a single-screen "Configuration" card (Foundry's "New pipeline" pattern):
 *
 *   - Section 1: name input + a `Select location` button that opens
 *     `ChoosePipelineLocationDialog` (which lists ontology projects).
 *   - Section 2: two primary type cards — "Batch pipeline" and
 *     "Streaming pipeline" — with `aria-pressed`. For BATCH, a sub-grid of
 *     compute variants (Standard / Lightweight·Faster / Spark·Flink
 *     distributed / External). INCREMENTAL is reachable only via the
 *     `?virtual_table=…` query string.
 *   - Footer: `← Back` (router back) + `Create pipeline` (disabled until
 *     both name and projectId are set).
 *
 * Mismatches with the original task ask, pinned in the final guard test:
 *   - No per-step wizard. No dataset selector. No transform/code picker.
 *   - No output-dataset configuration step.
 *   - No schedule UI (the POST always writes `schedule_config: { enabled:
 *     false, cron: null }`).
 *   - No separate "Save as draft" button — the only submit is `Create
 *     pipeline`, and it always writes `status: 'draft'`.
 *
 * Endpoints exercised:
 *   - GET  /api/v1/ontology/projects?per_page=100   (mount + dialog)
 *   - POST /api/v1/pipelines                        (submit)
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

const PROJECTS_LIST = /\/api\/v1\/ontology\/projects(\?|$)/;
const PIPELINES_CREATE = /\/api\/v1\/pipelines(\?|$)/;
const E2E_NOW = '2026-05-11T00:00:00Z';

interface ProjectFixture {
  id: string;
  slug: string;
  display_name: string;
  description: string;
  workspace_slug: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

function makeProject(overrides: Partial<ProjectFixture> = {}): ProjectFixture {
  return {
    id: 'project-1',
    slug: 'analytics',
    display_name: 'Analytics',
    description: '',
    workspace_slug: 'default',
    owner_id: '00000000-0000-0000-0000-000000000001',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

async function mockProjects(page: Page, projects: ProjectFixture[]): Promise<void> {
  await page.route(PROJECTS_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    // Templates sub-path belongs to other flows — let other handlers (or the
    // catch-all) deal with it.
    if (route.request().url().includes('/templates')) return route.fallback();
    await route.fulfill({
      json: { data: projects, total: projects.length, page: 1, per_page: 100 },
    });
  });
}

interface CreatedPipelineOverrides {
  id?: string;
  name?: string;
  pipeline_type?: string;
  project_id?: string;
}

async function mockCreatePipelineSuccess(
  page: Page,
  overrides: CreatedPipelineOverrides = {},
): Promise<void> {
  await page.route(PIPELINES_CREATE, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: {
        id: overrides.id ?? 'new-pipeline-1',
        name: overrides.name ?? 'New pipeline',
        description: '',
        owner_id: '00000000-0000-0000-0000-000000000001',
        dag: [],
        status: 'draft',
        schedule_config: { enabled: false, cron: null },
        retry_policy: {
          max_attempts: 1,
          retry_on_failure: false,
          allow_partial_reexecution: true,
        },
        next_run_at: null,
        created_at: E2E_NOW,
        updated_at: E2E_NOW,
        pipeline_type: overrides.pipeline_type ?? 'BATCH',
        lifecycle: 'DRAFT',
        project_id: overrides.project_id ?? 'project-1',
      },
    });
  });
}

test('renders the Configuration card and both primary pipeline-type cards', async ({
  adminPage,
}) => {
  await mockProjects(adminPage, []);
  await adminPage.goto('/pipelines/new');

  // Header + breadcrumb.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^configuration$/i }),
  ).toBeVisible();
  await expect(adminPage.getByRole('link', { name: /^Pipelines$/ })).toBeVisible();

  // Both primary type cards render as aria-pressed buttons; BATCH is the
  // default selection.
  const batch = adminPage.getByRole('button', { name: /batch pipeline/i });
  const streaming = adminPage.getByRole('button', { name: /streaming pipeline/i });
  await expect(batch).toBeVisible();
  await expect(streaming).toBeVisible();
  await expect(batch).toHaveAttribute('aria-pressed', 'true');
  await expect(streaming).toHaveAttribute('aria-pressed', 'false');

  // The BATCH default also reveals the compute sub-grid.
  await expect(
    adminPage.getByRole('button', { name: /^Standard/ }),
  ).toBeVisible();
});

test('default name input is pre-filled with the "New pipeline (…)" timestamp', async ({
  adminPage,
}) => {
  await mockProjects(adminPage, []);
  await adminPage.goto('/pipelines/new');

  const nameInput = adminPage.getByLabel(/^pipeline name$/i);
  await expect(nameInput).toBeVisible();
  // Exact format depends on the runner's locale/timezone; pin just the prefix.
  await expect(nameInput).toHaveValue(/^New pipeline \(/);

  // Location is empty until a project is chosen.
  await expect(adminPage.getByText(/no location selected/i)).toBeVisible();
});

test('"Create pipeline" button is disabled until a project location is chosen', async ({
  adminPage,
}) => {
  await mockProjects(adminPage, []);
  await adminPage.goto('/pipelines/new');

  const submit = adminPage.getByRole('button', { name: /^create pipeline$/i });
  await expect(submit).toBeVisible();
  // Name has a default value but projectId is empty — validation gate
  // blocks the submit.
  await expect(submit).toBeDisabled();

  // Clearing the name keeps it disabled (both fields are required).
  await adminPage.getByLabel(/^pipeline name$/i).fill('');
  await expect(submit).toBeDisabled();
});

test('selecting a BATCH compute sub-card toggles aria-pressed', async ({ adminPage }) => {
  await mockProjects(adminPage, []);
  await adminPage.goto('/pipelines/new');

  const standard = adminPage.getByRole('button', { name: /^Standard/ });
  const faster = adminPage.getByRole('button', { name: /lightweight \/ faster/i });

  // Standard is the default-selected compute.
  await expect(standard).toHaveAttribute('aria-pressed', 'true');
  await expect(faster).toHaveAttribute('aria-pressed', 'false');

  await faster.click();
  await expect(faster).toHaveAttribute('aria-pressed', 'true');
  await expect(standard).toHaveAttribute('aria-pressed', 'false');
});

test('switching to "Streaming pipeline" hides the BATCH compute sub-grid', async ({
  adminPage,
}) => {
  await mockProjects(adminPage, []);
  await adminPage.goto('/pipelines/new');

  // BATCH sub-grid is visible by default.
  await expect(adminPage.getByRole('button', { name: /^Standard/ })).toBeVisible();
  await expect(
    adminPage.getByRole('button', { name: /lightweight \/ faster/i }),
  ).toBeVisible();

  // Pick Streaming as the primary family.
  await adminPage.getByRole('button', { name: /streaming pipeline/i }).click();
  await expect(
    adminPage.getByRole('button', { name: /streaming pipeline/i }),
  ).toHaveAttribute('aria-pressed', 'true');

  // The sub-grid disappears (the JSX guards it behind `primary === 'BATCH'`).
  await expect(adminPage.getByRole('button', { name: /^Standard/ })).toHaveCount(0);
  await expect(
    adminPage.getByRole('button', { name: /lightweight \/ faster/i }),
  ).toHaveCount(0);
});

test('"Select location" → pick a project → Save updates the location and enables submit', async ({
  adminPage,
}) => {
  await mockProjects(adminPage, [
    makeProject({ id: 'project-alpha', slug: 'alpha', display_name: 'Alpha analytics' }),
    makeProject({ id: 'project-bravo', slug: 'bravo', display_name: 'Bravo trading' }),
  ]);
  await adminPage.goto('/pipelines/new');

  const submit = adminPage.getByRole('button', { name: /^create pipeline$/i });
  await expect(submit).toBeDisabled();

  // Open the location dialog (initial view is the "roots" list).
  await adminPage.getByRole('button', { name: /select location/i }).click();
  const dialog = adminPage.getByRole('dialog', { name: /choose pipeline location/i });
  await expect(dialog).toBeVisible();

  // Drill into "All projects" → the dialog fires the projects fetch.
  await dialog.getByRole('button', { name: /^all projects$/i }).click();

  // Pick a project, then click Save.
  await dialog.getByRole('button', { name: /alpha analytics/i }).click();
  await dialog.getByRole('button', { name: /^save$/i }).click();

  // Dialog closes; the displayed location now shows the project label.
  await expect(dialog).toHaveCount(0);
  await expect(adminPage.getByText(/^Alpha analytics$/)).toBeVisible();

  // Submit is now enabled because both name and projectId are populated.
  await expect(submit).toBeEnabled();
});

test('submit POSTs /api/v1/pipelines with status="draft" and redirects to the editor', async ({
  adminPage,
}) => {
  await mockProjects(adminPage, [
    makeProject({ id: 'project-alpha', slug: 'alpha', display_name: 'Alpha analytics' }),
  ]);
  await mockCreatePipelineSuccess(adminPage, {
    id: 'new-pipeline-1',
    project_id: 'project-alpha',
  });
  const cap = captureRequests(adminPage, PIPELINES_CREATE);

  // Seed the project via the query string so we skip the location dialog
  // and focus the test on the POST contract.
  await adminPage.goto('/pipelines/new?project_id=project-alpha');

  // Wait for the mount-time listProjects to resolve the project label, which
  // is what unlocks the submit button (canCreate = name && projectId).
  const submit = adminPage.getByRole('button', { name: /^create pipeline$/i });
  await expect(submit).toBeEnabled();

  // Force a deterministic name so we can assert on it.
  await adminPage.getByLabel(/^pipeline name$/i).fill('Quarterly batch');

  await submit.click();

  // Exactly one POST fired with the expected payload.
  await expect.poll(() => cap.calls.filter((c) => c.method === 'POST').length).toBe(1);
  const body = cap.last()?.body as Record<string, unknown> | undefined;
  expect(body).toMatchObject({
    name: 'Quarterly batch',
    status: 'draft',
    pipeline_type: 'BATCH',
    project_id: 'project-alpha',
    schedule_config: { enabled: false, cron: null },
  });
  expect(Array.isArray(body?.nodes)).toBe(true);

  // Page navigates to the editor for the created pipeline id.
  await expect(adminPage).toHaveURL(/\/pipelines\/new-pipeline-1\/edit$/);
});

test('server-side create failure surfaces in the error banner and stays on /pipelines/new', async ({
  adminPage,
}) => {
  await mockProjects(adminPage, [
    makeProject({ id: 'project-alpha', slug: 'alpha', display_name: 'Alpha analytics' }),
  ]);
  // Override the create POST with a 400.
  await adminPage.route(PIPELINES_CREATE, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 400,
      json: { error: 'name already taken' },
    });
  });

  await adminPage.goto('/pipelines/new?project_id=project-alpha');

  const submit = adminPage.getByRole('button', { name: /^create pipeline$/i });
  await expect(submit).toBeEnabled();
  await submit.click();

  // Error banner surfaces and we stay put.
  await expect(adminPage.getByText(/name already taken/i)).toBeVisible();
  await expect(adminPage).toHaveURL(/\/pipelines\/new(\?|$)/);
});

test('`?virtual_table=…` query string pre-fills an incremental pipeline + source banner', async ({
  adminPage,
}) => {
  await mockProjects(adminPage, []);
  await adminPage.goto('/pipelines/new?virtual_table=ri.ontology/vt/transactions');

  // Banner shows the source RID.
  await expect(adminPage.getByText(/source virtual table:/i)).toBeVisible();
  await expect(adminPage.getByText('ri.ontology/vt/transactions')).toBeVisible();

  // Default name reflects the virtual-table tail, not the timestamp template.
  await expect(adminPage.getByLabel(/^pipeline name$/i)).toHaveValue(
    /^Incremental pipeline for transactions$/,
  );
});

test('absent today: multi-step wizard, dataset/transform/output steps, schedule UI, separate "Save as draft" button', async ({
  adminPage,
}) => {
  // Single regression guard for the wizard surfaces the task asks for that
  // do not ship today. Flipping each assertion is the migration signal when
  // the corresponding control lands.
  await mockProjects(adminPage, [makeProject({ id: 'project-1', display_name: 'Default' })]);
  await adminPage.goto('/pipelines/new');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^configuration$/i }),
  ).toBeVisible();

  // 1. No `role="tab"` step list and no Next / Previous wizard buttons.
  expect(await adminPage.getByRole('tab').count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^next$/i }).count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^previous$/i }).count()).toBe(0);
  expect(await adminPage.getByText(/step\s*\d+\s*of\s*\d+/i).count()).toBe(0);

  // 2. No dataset input picker, no transform/code picker, no output-dataset
  //    configurator. Pipeline nodes are seeded by `defaultNodes()` server-
  //    side; the form only collects name + project + pipeline type.
  expect(
    await adminPage
      .getByRole('button', { name: /(select|choose|add) (input |source )?dataset/i })
      .count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /(select|choose) transform/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /(configure )?output dataset/i }).count(),
  ).toBe(0);

  // 3. No schedule UI in the new-pipeline form. Schedule is configured later
  //    inside the editor.
  expect(await adminPage.getByLabel(/cron/i).count()).toBe(0);
  expect(await adminPage.getByRole('switch', { name: /schedule/i }).count()).toBe(0);

  // 4. The only submit button is "Create pipeline". There is no separate
  //    "Save as draft" — the regular submit already writes `status: 'draft'`.
  await expect(
    adminPage.getByRole('button', { name: /^create pipeline$/i }),
  ).toBeVisible();
  expect(await adminPage.getByRole('button', { name: /save as draft/i }).count()).toBe(0);
});

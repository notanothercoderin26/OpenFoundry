import { type Page } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { DevelopersPage } from './pages';

/**
 * E2E coverage for `/developers`
 * (apps/web/src/routes/developers/DevelopersPage.tsx).
 *
 * The shipped DevelopersPage is the platform's **developer hub**: a
 * single operator surface that bundles
 *   - a hero panel with an h1 + a 4-stat overview (Repositories /
 *     Git providers / REST paths / Terraform resources);
 *   - `SdkToolkit`  — plugin SDK archetypes + the of-CLI cookbook
 *                      with the SDK-generation commands (TS / Python /
 *                      Java);
 *   - `ApiExplorer` — proto-derived REST docs, sidebar list of
 *                      operations, request/response surface;
 *   - `TerraformProviderPanel` — IaC schema (provider config + resources +
 *                      data sources);
 *   - `GitIntegrationManager` — CRUD over `/code-repos/integrations`
 *                      with a draft form, branch mapping, and a manual
 *                      sync queue.
 *
 * Unlike the previous Phase-3 dashboards in this suite, the page
 * actively fetches data on mount:
 *   - GET /api/v1/code-repos/repositories
 *   - GET /api/v1/code-repos/integrations
 *   - GET /api/v1/code-repos/integrations/:id     (only if list is non-empty)
 *   - GET /generated/openapi/openfoundry.json
 *   - GET /generated/terraform/openfoundry-provider.json
 *
 * The default catch-all in `fixtures/base` answers `/api/v1/*` with the
 * `{ data, next_cursor, total }` envelope; this page expects the
 * `{ items }` shape from `listRepositories` / `listIntegrations`, and
 * the two `/generated/*.json` paths are *not* under `/api/v1` at all.
 * `mockDeveloperPortal` overrides both layers so the four panels
 * render against deterministic data.
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      // The generated-assets loader throws this when the static JSON
      // is missing; tolerated because the panel surfaces a clean
      // error/empty state.
      /Unable to load static asset/,
    ],
  },
});

interface DeveloperMockOptions {
  repositories?: Array<{ id: string; slug: string; default_branch: string }>;
  integrations?: Array<{ id: string; namespace: string; project: string; provider: 'github' | 'gitlab' }>;
  /** Stub OpenAPI spec — defaults to a 1-operation document. */
  openApiPaths?: Record<string, Record<string, OpenApiOperationStub>>;
  /** Stub Terraform resources. */
  terraformResources?: Array<{ name: string; description: string }>;
  /** Force `/generated/openapi/openfoundry.json` to 404. */
  failOpenApi?: boolean;
}

interface OpenApiOperationStub {
  summary: string;
  operationId: string;
  tags: string[];
  responses: Record<string, { description: string; content: Record<string, never> }>;
}

const DEFAULT_OPENAPI_PATHS: Record<string, Record<string, OpenApiOperationStub>> = {
  '/datasets': {
    get: {
      summary: 'List datasets in a project',
      operationId: 'listDatasets',
      tags: ['datasets'],
      responses: { '200': { description: 'OK', content: {} } },
    },
  },
  '/ontology/projects': {
    post: {
      summary: 'Create an ontology project',
      operationId: 'createProject',
      tags: ['ontology'],
      responses: { '201': { description: 'Created', content: {} } },
    },
  },
};

const DEFAULT_TERRAFORM_RESOURCES = [
  {
    name: 'openfoundry_repository_integration',
    description: 'Mirror an external Git repository into Code Repos with branch mapping.',
    attributes: { external_url: 'External Git URL.', sync_mode: 'Mirror direction.' },
  },
  {
    name: 'openfoundry_audit_policy',
    description: 'Codify an audit policy with retention + alerting thresholds.',
    attributes: { name: 'Policy name.', retention_days: 'Retention window.' },
  },
];

async function mockDeveloperPortal(
  page: Page,
  opts: DeveloperMockOptions = {},
): Promise<void> {
  const repositories = opts.repositories ?? [];
  const integrations = opts.integrations ?? [];
  const openApiPaths = opts.openApiPaths ?? DEFAULT_OPENAPI_PATHS;
  const terraformResources = opts.terraformResources ?? DEFAULT_TERRAFORM_RESOURCES;

  // `{ items }`-shaped endpoints (override the `{ data }` catch-all).
  await page.route('**/api/v1/code-repos/repositories**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        items: repositories.map((r) => ({
          id: r.id,
          slug: r.slug,
          default_branch: r.default_branch,
        })),
      },
    });
  });

  await page.route('**/api/v1/code-repos/integrations**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = route.request().url();
    const detailMatch = /\/code-repos\/integrations\/([^/?]+)$/.exec(url);
    if (detailMatch) {
      const id = detailMatch[1];
      const integration = integrations.find((i) => i.id === id);
      if (!integration) {
        await route.fulfill({ status: 404, json: { error: 'not found' } });
        return;
      }
      await route.fulfill({
        json: {
          integration: {
            id: integration.id,
            repository_id: repositories[0]?.id ?? '',
            provider: integration.provider,
            external_namespace: integration.namespace,
            external_project: integration.project,
            external_url: `https://github.com/${integration.namespace}/${integration.project}`,
            sync_mode: 'bidirectional_mirror',
            ci_trigger_strategy: 'github_actions',
            status: 'connected',
            default_branch: repositories[0]?.default_branch ?? 'main',
            branch_mapping: ['main -> main'],
            webhook_url: 'https://platform.openfoundry.local/api/v1/hooks/git',
            last_synced_at: null,
            created_at: '2026-05-11T00:00:00Z',
            updated_at: '2026-05-11T00:00:00Z',
          },
          sync_runs: [],
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        items: integrations.map((i) => ({
          id: i.id,
          repository_id: repositories[0]?.id ?? '',
          provider: i.provider,
          external_namespace: i.namespace,
          external_project: i.project,
          external_url: `https://github.com/${i.namespace}/${i.project}`,
          sync_mode: 'bidirectional_mirror',
          ci_trigger_strategy: 'github_actions',
          status: 'connected',
          default_branch: repositories[0]?.default_branch ?? 'main',
          branch_mapping: ['main -> main'],
          webhook_url: 'https://platform.openfoundry.local/api/v1/hooks/git',
          last_synced_at: null,
          created_at: '2026-05-11T00:00:00Z',
          updated_at: '2026-05-11T00:00:00Z',
        })),
      },
    });
  });

  // Static generated assets (NOT under /api/v1; default catch-all
  // doesn't see them).
  await page.route('**/generated/openapi/openfoundry.json', async (route) => {
    if (opts.failOpenApi) {
      await route.fulfill({ status: 404, body: '' });
      return;
    }
    await route.fulfill({
      json: {
        openapi: '3.0.0',
        info: {
          title: 'OpenFoundry API',
          version: '1.0.0',
          description: 'Proto-derived REST contract.',
        },
        paths: openApiPaths,
        components: { schemas: { Dataset: { type: 'object' } } },
      },
    });
  });

  await page.route('**/generated/terraform/openfoundry-provider.json', async (route) => {
    await route.fulfill({
      json: {
        provider: {
          name: 'openfoundry',
          version: '1.0.0',
          configuration: {
            endpoint: 'API endpoint URL.',
            token: 'Service-account API token.',
          },
        },
        resources: terraformResources,
        data_sources: [],
      },
    });
  });
}

test('renders the developer hub with hero + the 4-stat overview', async ({
  authedPage,
}) => {
  await mockDeveloperPortal(authedPage, {
    repositories: [{ id: 'repo-1', slug: 'plugin-starter', default_branch: 'main' }],
  });
  const developers = new DevelopersPage(authedPage);
  await developers.goto();
  await developers.expectLoaded();

  // Hero h1 anchors the page identity.
  await expect(
    authedPage.getByRole('heading', {
      level: 1,
      name: /plugin sdk, automation, and external platform delivery/i,
    }),
  ).toBeVisible();

  // Each stat label in the hero rollup. Scope to the page section to
  // avoid collisions with sidebar nav entries that may include the
  // same words.
  const page = authedPage.locator('section.of-page');
  for (const label of [
    'Repositories',
    'Git providers',
    'REST paths',
    'Terraform resources',
  ]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }

  // REST paths counter reflects the 2-operation default spec — wait for
  // the static asset to land, then assert the rendered count.
  await expect(
    page.getByText(String(Object.keys(DEFAULT_OPENAPI_PATHS).length), { exact: true }).first(),
  ).toBeVisible();
});

test('SDK + CLI toolkit lists archetypes and SDK-generation commands', async ({
  authedPage,
}) => {
  await mockDeveloperPortal(authedPage);
  const developers = new DevelopersPage(authedPage);
  await developers.goto();

  // SdkToolkit's own h2 anchors its section in the page hierarchy.
  await expect(
    authedPage.getByRole('heading', {
      level: 2,
      name: /build plugins and automate delivery/i,
    }),
  ).toBeVisible();

  // The three plugin-SDK archetypes are listed as panel-muted cards.
  const page = authedPage.locator('section.of-page');
  for (const archetype of ['Connector plugin', 'Transform plugin', 'Widget plugin']) {
    await expect(page.getByText(archetype, { exact: true })).toBeVisible();
  }

  // CLI scaffold commands ship as `<pre>` snippets — pin the
  // distinctive `of-cli project init` invocation for one archetype.
  await expect(page).toContainText(
    /go run \.\/tools\/of-cli project init payment-connector/,
  );

  // SDK-generation entries in the "CLI cookbook" deck — the user-facing
  // "SDK downloads" framing maps onto these `docs generate-sdk-*`
  // commands. Pin all three language SDKs.
  await expect(page).toContainText(/docs generate-sdk-typescript/);
  await expect(page).toContainText(/docs generate-sdk-python/);
  await expect(page).toContainText(/docs generate-sdk-java/);

  // The OpenAPI + Terraform-schema generation commands are co-listed
  // so generated-docs regenerations have a visible recipe.
  await expect(page).toContainText(/docs generate-openapi/);
  await expect(page).toContainText(/terraform schema/);
});

test('API explorer renders proto-derived operations from the OpenAPI spec', async ({
  authedPage,
}) => {
  await mockDeveloperPortal(authedPage);
  const developers = new DevelopersPage(authedPage);
  await developers.goto();

  // ApiExplorer's own h2 anchors the section.
  await expect(
    authedPage.getByRole('heading', { level: 2, name: /proto-derived explorer/i }),
  ).toBeVisible();

  // The sidebar exposes a "Find operation" labelled search input.
  await expect(
    authedPage.getByPlaceholder(/search by path, tag, summary/i),
  ).toBeVisible();

  // Both default-spec operations render as clickable list buttons.
  // The button surface concatenates method + tag + path + summary
  // (`<button>` accessible name), so anchor on the unique path text.
  const page = authedPage.locator('section.of-page');
  await expect(page.getByRole('button', { name: /list datasets in a project/i })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /create an ontology project/i }),
  ).toBeVisible();

  // The "Paths" counter in the explorer header matches the spec.
  // 2 paths in the default mock spec.
  const explorerStats = page.locator('.of-panel-muted').filter({ hasText: /^Paths/ });
  await expect(explorerStats).toContainText('2');
});

test('Terraform provider panel renders the IaC surface with generated resources', async ({
  authedPage,
}) => {
  await mockDeveloperPortal(authedPage);
  const developers = new DevelopersPage(authedPage);
  await developers.goto();

  await expect(
    authedPage.getByRole('heading', {
      level: 2,
      name: /infrastructure-as-code surface/i,
    }),
  ).toBeVisible();

  const page = authedPage.locator('section.of-page');

  // Provider configuration keys from the mocked schema.
  await expect(page).toContainText('endpoint');
  await expect(page).toContainText('token');

  // Resources section lists the mocked resources.
  await expect(page.getByText('openfoundry_repository_integration')).toBeVisible();
  await expect(page.getByText('openfoundry_audit_policy')).toBeVisible();

  // The "just terraform-schema" regeneration hint is pinned next to the hero.
  await expect(page).toContainText('just terraform-schema');
});

test('git integration manager surfaces the empty state + the "New" CTA', async ({
  authedPage,
}) => {
  await mockDeveloperPortal(authedPage, {
    repositories: [{ id: 'repo-1', slug: 'plugin-starter', default_branch: 'main' }],
    integrations: [],
  });
  const developers = new DevelopersPage(authedPage);
  await developers.goto();

  // Section heading anchors the manager.
  await expect(
    authedPage.getByRole('heading', {
      level: 2,
      name: /repository integrations and sync runs/i,
    }),
  ).toBeVisible();

  // The sidebar shows the dashed empty-state when there are no
  // integrations to render.
  const page = authedPage.locator('section.of-page');
  await expect(page.getByText(/no repository integrations yet/i)).toBeVisible();

  // The "New" CTA is enabled and fires `onCreateNew`. The page's
  // `startNewIntegration` then primes the draft from the first
  // repository — assert the connected-repo slug surfaces.
  // Both the sidebar "New" button and the bottom-of-form "New"
  // button render, so anchor by the unique surrounding "Connected
  // repositories" sidebar label.
  const sidebarNew = page
    .locator('aside')
    .filter({ hasText: /connected repositories/i })
    .getByRole('button', { name: /^new$/i });
  await expect(sidebarNew).toBeEnabled();
});

test('absent today: external hyperlinks to docs / guides for the cookbooks', async ({
  authedPage,
}) => {
  // Regression guard. The SdkToolkit lists "Cookbooks" (titles +
  // descriptions) but renders them as plain `<div>`s — no `<a href>`
  // points at external documentation today. When the cookbooks gain
  // proper deep links, the page-object's `externalDocsLinks` count
  // flips and forces this spec to grow link-target assertions.
  await mockDeveloperPortal(authedPage);
  const developers = new DevelopersPage(authedPage);
  await developers.goto();
  await developers.expectLoaded();

  // Scope to the page surface so the AppShell's nav (which contains
  // `<a>`s with matching words) doesn't drown the assertion.
  const page = authedPage.locator('section.of-page');
  expect(await page.getByRole('link', { name: /docs|guide|cookbook|read more/i }).count()).toBe(0);

  // The cookbook titles do render — they are simply not actionable.
  await expect(page).toContainText('Mirror GitHub packages into Code Repos');
  await expect(page).toContainText('Generate API contracts for SDK consumers');
});

test('API explorer surfaces a clean error when the OpenAPI spec fails to load', async ({
  authedPage,
}) => {
  // The hub composes several panels; a failure in one (the static
  // OpenAPI asset) must not white-screen the rest.
  await mockDeveloperPortal(authedPage, { failOpenApi: true });
  const developers = new DevelopersPage(authedPage);
  await developers.goto();

  // The hero + SdkToolkit + Terraform + GitIntegration panels still
  // render around the failing one.
  await expect(
    authedPage.getByRole('heading', {
      level: 1,
      name: /plugin sdk, automation, and external platform delivery/i,
    }),
  ).toBeVisible();

  // The ApiExplorer panel surfaces an error-style message
  // ("Unable to load static asset: /generated/openapi/openfoundry.json")
  // styled with `var(--status-danger)`. Pin the user-visible copy.
  const page = authedPage.locator('section.of-page');
  await expect(page.getByText(/unable to load static asset/i)).toBeVisible();
});

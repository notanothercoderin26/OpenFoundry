import type { Route } from '@playwright/test';

import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/ontology-manager`
 * (apps/web/src/routes/ontology-manager/OntologyManagerPage.tsx).
 *
 * The page is a 17-section shell around one ontology: every Ontology
 * Manager workflow (object types, links, import/export, history,
 * branches, …) is a `setSection(…)` tab in the same single-page view.
 *
 * Endpoints exercised on mount (`refresh()`):
 *   - GET /api/v1/ontology/types          (object types)
 *   - GET /api/v1/ontology/actions        (action types)
 *   - GET /api/v1/ontology/interfaces
 *   - GET /api/v1/ontology/shared-property-types
 *   - GET /api/v1/ontology/links          (link types)
 *   - GET /api/v1/ontology/object-type-groups
 *   - GET /api/v1/ontology/object-views
 *   - GET /api/v1/ontology/projects
 *   - GET /api/v1/ontology/projects/:id/memberships
 *   - GET /api/v1/ontology/projects/:id/resources
 *   - GET /api/v1/ontology/projects/:id/working-state
 *   - GET /api/v1/ontology/projects/:id/saved-changes
 *
 * Everything else (audit log, marketplace, global branches, …) falls
 * through to the default empty-envelope catch-all installed by
 * `installDefaultApiMocks`.
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      // The page's refresh() reports "Failed to load" via setError(...)
      // when an unexpected mock shape leaks through; we don't gate on it.
      /Failed to load/i,
      /Cannot read properties of undefined/,
    ],
  },
});

const E2E_NOW = '2026-05-11T00:00:00Z';

interface ObjectTypeFixture {
  id: string;
  name: string;
  display_name: string;
  description: string;
  primary_key_property: string | null;
  icon: string | null;
  color: string | null;
  status: string;
  visibility: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  version: number;
}

function makeObjectType(overrides: Partial<ObjectTypeFixture> = {}): ObjectTypeFixture {
  return {
    id: 'object-type-aircraft',
    name: 'aircraft',
    display_name: 'Aircraft',
    description: 'Fleet vehicle records used by the operations ontology.',
    primary_key_property: 'tail_number',
    icon: 'plane',
    color: '#0f766e',
    status: 'active',
    visibility: 'normal',
    owner_id: 'user-1',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    version: 1,
    ...overrides,
  };
}

interface LinkTypeFixture {
  id: string;
  name: string;
  display_name: string;
  source_type_id: string;
  target_type_id: string;
  cardinality: string;
  visibility: string;
  forward_label?: string;
  reverse_label?: string;
  created_at: string;
  updated_at: string;
  version: number;
}

function makeLinkType(overrides: Partial<LinkTypeFixture> = {}): LinkTypeFixture {
  return {
    id: 'link-aircraft-route',
    name: 'aircraft_route',
    display_name: 'Operates route',
    source_type_id: 'object-type-aircraft',
    target_type_id: 'object-type-route',
    cardinality: 'one_to_many',
    visibility: 'normal',
    forward_label: 'operates',
    reverse_label: 'operated by',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    version: 1,
    ...overrides,
  };
}

interface InterfaceFixture {
  id: string;
  name: string;
  display_name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

function makeInterface(overrides: Partial<InterfaceFixture> = {}): InterfaceFixture {
  return {
    id: 'interface-asset',
    name: 'asset',
    display_name: 'Asset',
    description: 'Common interface for trackable assets.',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

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
    id: 'project-ontology',
    slug: 'ontology',
    display_name: 'Ontology root',
    description: 'Primary ontology project for fleet operations.',
    workspace_slug: 'default',
    owner_id: 'user-1',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

const AIRCRAFT = makeObjectType();
const ROUTE = makeObjectType({
  id: 'object-type-route',
  name: 'route',
  display_name: 'Route',
  description: 'Scheduled origin/destination pair.',
  primary_key_property: 'route_id',
  icon: 'route',
  color: '#1d4ed8',
});
const LINK = makeLinkType();
const ASSET = makeInterface();
const PROJECT = makeProject();

/**
 * Install the ontology-specific list mocks. Everything else falls
 * through to `installDefaultApiMocks` (empty envelopes / 204s).
 */
async function mockOntologyManager(
  page: import('@playwright/test').Page,
  options: {
    objectTypes?: ObjectTypeFixture[];
    linkTypes?: LinkTypeFixture[];
    interfaces?: InterfaceFixture[];
    projects?: ProjectFixture[];
    workingChanges?: Array<Record<string, unknown>>;
    savedChanges?: Array<Record<string, unknown>>;
  } = {},
): Promise<void> {
  const objectTypes = options.objectTypes ?? [AIRCRAFT, ROUTE];
  const linkTypes = options.linkTypes ?? [LINK];
  const interfaces = options.interfaces ?? [ASSET];
  const projects = options.projects ?? [PROJECT];
  const workingChanges = options.workingChanges ?? [];
  const savedChanges = options.savedChanges ?? [];

  await page.route(/\/api\/v1\/ontology\/types(\?|$)/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: objectTypes, total: objectTypes.length, page: 1, per_page: 200 },
    });
  });

  await page.route(/\/api\/v1\/ontology\/links(\?|$)/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: linkTypes, total: linkTypes.length },
    });
  });

  await page.route(/\/api\/v1\/ontology\/interfaces(\?|$)/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: interfaces, total: interfaces.length, page: 1, per_page: 200 },
    });
  });

  await page.route(/\/api\/v1\/ontology\/projects(\?|$)/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: projects, total: projects.length, page: 1, per_page: 200 },
    });
  });

  for (const project of projects) {
    await page.route(
      new RegExp(`/api/v1/ontology/projects/${project.id}/resources$`),
      async (route: Route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        await route.fulfill({ json: { data: [] } });
      },
    );
    await page.route(
      new RegExp(`/api/v1/ontology/projects/${project.id}/working-state$`),
      async (route: Route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            json: {
              project_id: project.id,
              changes: workingChanges,
              updated_by: 'user-1',
              updated_at: E2E_NOW,
            },
          });
          return;
        }
        if (route.request().method() === 'PUT') {
          await route.fulfill({
            json: {
              project_id: project.id,
              changes: workingChanges,
              updated_by: 'user-1',
              updated_at: E2E_NOW,
            },
          });
          return;
        }
        return route.fallback();
      },
    );
    await page.route(
      new RegExp(`/api/v1/ontology/projects/${project.id}/saved-changes$`),
      async (route: Route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        await route.fulfill({ json: { data: savedChanges } });
      },
    );
    await page.route(
      new RegExp(`/api/v1/ontology/projects/${project.id}/memberships$`),
      async (route: Route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        await route.fulfill({ json: { data: [] } });
      },
    );
  }
}

test('renders the page shell with the object-types nav and the mocked types list', async ({
  adminPage,
}) => {
  await mockOntologyManager(adminPage);
  await adminPage.goto('/ontology-manager');

  // Top-level heading proves the page mounted (vs error boundary).
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /ontology manager/i }),
  ).toBeVisible();

  // The side nav is rendered as a `<nav aria-label="Ontology Manager sections">`
  // of buttons. The labels render as `<strong>` inside the button, so the
  // accessible name concatenates label + description — match by partial.
  const nav = adminPage.getByRole('navigation', { name: /ontology manager sections/i });
  await expect(nav).toBeVisible();
  for (const label of ['Object types', 'Link types', 'Interfaces', 'History', 'Import / export']) {
    await expect(nav.getByRole('button', { name: new RegExp(label, 'i') })).toBeVisible();
  }

  // Stats panel on the Discover/overview tab reports the loaded counts —
  // these come from the mocked endpoints, so they're a tight contract.
  await expect(adminPage.getByText(/^2 object types$/i)).toBeVisible();
  await expect(adminPage.getByText(/^1 link types$/i)).toBeVisible();
  await expect(adminPage.getByText(/^1 interfaces$/i)).toBeVisible();

  // Switch to the Object types section and confirm both rows render.
  await nav.getByRole('button', { name: /^Object types/i }).click();
  await expect(adminPage.getByText('Aircraft').first()).toBeVisible();
  await expect(adminPage.getByText('Route').first()).toBeVisible();
  // pk markers ("pk: <name>") prove the rich row template renders.
  await expect(adminPage.getByText(/pk:\s*tail_number/)).toBeVisible();
  await expect(adminPage.getByText(/pk:\s*route_id/)).toBeVisible();
});

test('"New" menu opens the Create Object Type wizard', async ({ adminPage }) => {
  await mockOntologyManager(adminPage);
  await adminPage.goto('/ontology-manager');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /ontology manager/i }),
  ).toBeVisible();

  // The "New" top-bar button toggles a `role="menu"` popover with the
  // Object type / Link type / Action type entries.
  await adminPage.getByRole('button', { name: /^new\b/i }).click();
  const menu = adminPage.getByRole('menu');
  await expect(menu).toBeVisible();
  // The Object type item is the only enabled one (the rest are
  // intentionally rendered as disabled placeholders). The accessible
  // name on each NewMenuItem button concatenates label + description,
  // so we anchor on the "Object type " label prefix to avoid matching
  // sibling rows whose descriptions mention "object types".
  const objectTypeItem = menu.getByRole('button', { name: /^Object type\b/ });
  await expect(objectTypeItem).toBeEnabled();

  await objectTypeItem.click();

  // CreateObjectTypeWizard mounts as a labelled modal dialog.
  const wizard = adminPage.getByRole('dialog', { name: /create a new object type/i });
  await expect(wizard).toBeVisible();
  await expect(
    wizard.getByRole('heading', { name: /create a new object type/i }),
  ).toBeVisible();
});

test('Import / export panel exports selected resources as a JSON bundle and validates pasted JSON', async ({
  adminPage,
}) => {
  await mockOntologyManager(adminPage);
  await adminPage.goto('/ontology-manager');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /ontology manager/i }),
  ).toBeVisible();

  // Switch to the Import / export section.
  await adminPage
    .getByRole('navigation', { name: /ontology manager sections/i })
    .getByRole('button', { name: /import \/ export/i })
    .click();

  const importExport = adminPage.getByText(/Export resources/i);
  await expect(importExport).toBeVisible();

  // The panel renders a "Select all" toggle that flips to "Clear" once
  // every resource option is checked, so the easiest deterministic
  // selection is to click it.
  await adminPage.getByRole('button', { name: /^select all$/i }).click();
  await expect(adminPage.getByRole('button', { name: /^clear$/i })).toBeVisible();

  // Export JSON triggers a `Blob` download via `URL.createObjectURL`.
  const downloadPromise = adminPage.waitForEvent('download');
  await adminPage.getByRole('button', { name: /^export json$/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^openfoundry-ontology-bundle-.*\.json$/);

  // The textarea is now populated with the exported bundle JSON.
  const bundleTextarea = adminPage.locator('textarea.of-input').first();
  const exportedText = await bundleTextarea.inputValue();
  expect(exportedText.length).toBeGreaterThan(0);
  expect(() => JSON.parse(exportedText)).not.toThrow();
  const exportedBundle = JSON.parse(exportedText);
  expect(Array.isArray(exportedBundle.resources)).toBe(true);
  expect(exportedBundle.resources.length).toBeGreaterThan(0);

  // Validate the same bundle: the panel surfaces the per-resource
  // validation summary with errors / warnings / staged-changes counts.
  await adminPage.getByRole('button', { name: /^validate$/i }).click();
  await expect(
    adminPage.getByText(/Validation · \d+ errors · \d+ warnings · \d+ staged changes/i),
  ).toBeVisible();
});

test('branch dropdown opens the Create branch dialog and switches the active version', async ({
  adminPage,
}) => {
  await mockOntologyManager(adminPage);
  await adminPage.goto('/ontology-manager');

  // Top-bar branch chooser starts on the implicit `Main` branch.
  // The AppShell also renders a decorative "Main" indicator in its own
  // topbar (`.of-topbar__branch`); scope to the page header's button to
  // pick up only the interactive dropdown.
  const branchToggle = adminPage
    .locator('button.of-button')
    .filter({ hasText: /^\s*Main\s*$/ });
  await expect(branchToggle).toBeVisible();

  await branchToggle.click();
  // The branch popover renders a "Create branch" CTA at the bottom.
  await adminPage.getByRole('button', { name: /^create branch$/i }).click();

  // CreateBranchDialog is a labelled modal — defaults to a placeholder
  // name; we replace it with a deterministic value before submitting.
  const dialog = adminPage.getByRole('dialog', { name: /create branch/i });
  await expect(dialog).toBeVisible();
  const nameInput = dialog.locator('input').first();
  await expect(nameInput).toBeFocused();
  await nameInput.fill('release/2026-05');

  await dialog.getByRole('button', { name: /^create branch$/i }).click();

  // The dialog dismisses and the page-header toggle now reflects the
  // new branch.
  await expect(dialog).toBeHidden();
  await expect(
    adminPage
      .locator('button.of-button')
      .filter({ hasText: /^\s*release\/2026-05\s*$/ }),
  ).toBeVisible();
  // The original `Main` page-header toggle is gone.
  await expect(
    adminPage.locator('button.of-button').filter({ hasText: /^\s*Main\s*$/ }),
  ).toHaveCount(0);
});

test('unsaved changes section surfaces working-state edits ready for the Save (publish) flow', async ({
  adminPage,
}) => {
  // Simulate a draft edit pending publish: one staged change in the
  // project's working state. The Review-edits modal is the only path
  // that publishes the draft to the saved/published store, so we
  // assert that the staged change is visible and the OntologyEditsButton
  // surfaces the "1 edit" indicator that opens it.
  const stagedChange = {
    id: 'change-1',
    kind: 'object_type',
    action: 'update',
    label: 'Aircraft',
    description: 'Renamed Aircraft → Fleet aircraft (draft)',
    targetId: AIRCRAFT.id,
    payload: { display_name: 'Fleet aircraft' },
    warnings: [],
    errors: [],
    source: 'ontology-manager',
    author: 'user-1',
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: E2E_NOW,
  };
  await mockOntologyManager(adminPage, { workingChanges: [stagedChange] });

  await adminPage.goto('/ontology-manager');
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /ontology manager/i }),
  ).toBeVisible();

  // Switch to "Unsaved changes" — the section nav label is "Unsaved changes"
  // and shows the staged-change count.
  const nav = adminPage.getByRole('navigation', { name: /ontology manager sections/i });
  await nav.getByRole('button', { name: /unsaved changes/i }).click();

  // Section header reports the staged change count.
  await expect(adminPage.getByText(/Unsaved changes \(1\)/i)).toBeVisible();

  // The staged change row references the resource being published.
  // The "Change" cell stacks the resource label + action/source line, so
  // we match by partial text inside the row rather than by cell name.
  const stagedRow = adminPage.getByRole('row').filter({ hasText: 'Aircraft' });
  await expect(stagedRow).toBeVisible();
  await expect(stagedRow.getByText(/update · ontology-manager/i)).toBeVisible();
  await expect(stagedRow.getByText(/object_type · object-type-aircraft/i)).toBeVisible();
});

test('History section renders saved-change records with per-resource diff details', async ({
  adminPage,
}) => {
  // Two saved batches simulate a v1 → v2 → v3 progression so the
  // history table can render the per-resource diff summary the user
  // would compare to decide whether to restore (= rollback the diff).
  const savedV2 = {
    id: 'saved-change-2',
    project_id: PROJECT.id,
    change_ids: ['change-v2'],
    resources: [{ kind: 'object_type', id: AIRCRAFT.id, label: AIRCRAFT.display_name }],
    changes: [
      {
        id: 'change-v2',
        kind: 'object_type',
        action: 'update',
        label: AIRCRAFT.display_name,
        description: 'Bumped icon from plane → jet for the v2 cut.',
        targetId: AIRCRAFT.id,
        payload: { icon: 'jet' },
        warnings: [],
        errors: [],
        source: 'ontology-manager',
        author: 'user-1',
        createdBy: 'user-1',
        updatedBy: 'user-1',
        createdAt: '2026-05-01T12:00:00Z',
      },
    ],
    branch_id: null,
    proposal_id: null,
    status: 'saved' as const,
    validation_errors: [],
    note: 'Promoted draft to v2.',
    saved_by: 'user-1',
    saved_at: '2026-05-01T12:00:00Z',
  };
  const savedV3 = {
    ...savedV2,
    id: 'saved-change-3',
    change_ids: ['change-v3'],
    changes: [
      {
        ...savedV2.changes[0],
        id: 'change-v3',
        description: 'Renamed Aircraft → Fleet Aircraft for the v3 cut.',
        payload: { display_name: 'Fleet Aircraft' },
        createdAt: '2026-05-10T12:00:00Z',
      },
    ],
    note: 'Promoted draft to v3.',
    saved_at: '2026-05-10T12:00:00Z',
  };
  await mockOntologyManager(adminPage, { savedChanges: [savedV3, savedV2] });

  await adminPage.goto('/ontology-manager');
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /ontology manager/i }),
  ).toBeVisible();

  await adminPage
    .getByRole('navigation', { name: /ontology manager sections/i })
    .getByRole('button', { name: /^History/i })
    .click();

  // Global saved-changes table renders both versioned batches.
  await expect(adminPage.getByText(/Ontology history \(2\)/i)).toBeVisible();
  await expect(adminPage.getByText(/Promoted draft to v3\./i)).toBeVisible();
  await expect(adminPage.getByText(/Promoted draft to v2\./i)).toBeVisible();
  // The "Details" column shows a per-change diff summary (action ·
  // changed-property list) — this is the inter-version diff the user
  // inspects before restoring an older version.
  await expect(adminPage.getByText(/update · display_name/i)).toBeVisible();
  await expect(adminPage.getByText(/update · icon/i)).toBeVisible();

  // Restore buttons gate the "rollback to this version" affordance.
  // We don't click them — restoring stages a PUT through
  // replaceProjectWorkingState and lands in the next test surface —
  // but we assert they are present and enabled so the diff workflow
  // is wired end-to-end.
  const restoreButtons = adminPage.getByRole('button', { name: /^restore$/i });
  await expect(restoreButtons.first()).toBeVisible();
  expect(await restoreButtons.count()).toBeGreaterThanOrEqual(2);
});

test('search filter triggers a re-query against the ontology types endpoint', async ({
  adminPage,
}) => {
  await mockOntologyManager(adminPage);
  const cap = captureRequests(adminPage, /\/api\/v1\/ontology\/types(\?|$)/);
  await adminPage.goto('/ontology-manager');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /ontology manager/i }),
  ).toBeVisible();
  // Wait for the initial fetch so we can count the search-driven one.
  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  const initialGets = cap.calls.filter((c) => c.method === 'GET').length;

  await adminPage
    .getByPlaceholder(/Search ontology resources/i)
    .fill('aircraft');
  await adminPage.getByRole('button', { name: /^apply$/i }).click();

  // The Apply button calls refresh() which re-fetches with `search=aircraft`.
  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'GET' && c.url.includes('search=aircraft')).length)
    .toBeGreaterThanOrEqual(1);
  expect(cap.calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(initialGets);
});

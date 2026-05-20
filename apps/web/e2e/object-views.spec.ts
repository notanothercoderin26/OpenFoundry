import { type Page, type Route } from '@playwright/test';

import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/object-views`
 * (apps/web/src/routes/object-views/ObjectViewsPage.tsx).
 *
 * **Reality vs roadmap.** Despite the route name, the shipped page is
 * an **Object View editor + version catalog** for the ontology
 * runtime, not a "saved query/dashboard" CRUD list. The only mutating
 * API is `POST /api/v1/object-views` (used for every save / publish);
 * there is no `PATCH`, no delete, no duplicate, no share, no public
 * toggle on this surface. The wishlist controls listed below are
 * pinned by the regression guard at the bottom of this file:
 *
 *   - No row-level "Edit" affordance on the saved-views list. To
 *     change an existing view the user must click `Load` (which
 *     hydrates the editor) and then "Save draft" / "Publish" — a NEW
 *     version is POSTed each time; there is no PUT/PATCH path.
 *   - No "Duplicate" button.
 *   - No "Share" or per-view permissions UI (the page surfaces a
 *     read-only "Edit allowed / Edit blocked" chip based on the
 *     principal's ontology permissions, but no user/role grants).
 *   - No "Public" toggle (only a free-form `branch_label` field on
 *     the create modal).
 *   - No "Delete" button on the saved-views list.
 *
 * What IS shipped and exercised here:
 *   - Page header + "+ Object view" CTA → CreateObjectViewModal with
 *     name, API name, base object type, form factor, description,
 *     branch label, "Start from current editor configuration"
 *     checkbox → POST `/object-views`.
 *   - Stats chips + the configuration toolbar (Object type / Object /
 *     Host / Object View mode / Form factor selects).
 *   - Editor / Saved views / Publish editor-level tabs.
 *   - Saved views tab: lists the mocked Object View definitions with
 *     "Load" buttons.
 *   - "Load" hydrates the editor and switches back to the Editor tab.
 *   - Publish tab "Publish current configuration" CTA POSTs another
 *     `/object-views` with `published: true`.
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Failed to load object types/,
      /Failed to load type details/,
      /Failed to load preview/,
    ],
  },
});

const E2E_NOW = '2026-05-11T00:00:00Z';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface ObjectTypeFixture {
  id: string;
  rid: string;
  name: string;
  display_name: string;
  description: string;
  primary_key_property: string | null;
  icon: string | null;
  color: string | null;
  status: string;
  visibility: string;
  editable: boolean;
  properties: Array<{
    id: string;
    object_type_id: string;
    name: string;
    display_name: string;
    description: string;
    property_type: string;
    required: boolean;
    unique_constraint: boolean;
    time_dependent: boolean;
    default_value: unknown;
    validation_rules: unknown;
    filterable: boolean;
    sortable: boolean;
    created_at: string;
    updated_at: string;
  }>;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

function makeProperty(id: string, name: string, displayName: string, type = 'string') {
  return {
    id,
    object_type_id: 'object-type-aircraft',
    name,
    display_name: displayName,
    description: '',
    property_type: type,
    required: false,
    unique_constraint: false,
    time_dependent: false,
    default_value: null,
    validation_rules: null,
    filterable: true,
    sortable: true,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
  };
}

function makeObjectType(overrides: Partial<ObjectTypeFixture> = {}): ObjectTypeFixture {
  const id = overrides.id ?? 'object-type-aircraft';
  return {
    id,
    rid: `ri.ontology.main.object-type.${id}`,
    name: 'aircraft',
    display_name: 'Aircraft',
    description: 'Aircraft objects',
    primary_key_property: 'tail_number',
    icon: 'plane',
    color: '#0f766e',
    status: 'active',
    visibility: 'normal',
    editable: true,
    properties: [
      makeProperty(`${id}-prop-1`, 'tail_number', 'Tail #'),
      makeProperty(`${id}-prop-2`, 'capacity', 'Capacity', 'integer'),
    ],
    owner_id: 'user-1',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

const AIRCRAFT = makeObjectType();
const FLIGHT = makeObjectType({
  id: 'object-type-flight',
  name: 'flight',
  display_name: 'Flight',
  primary_key_property: 'flight_id',
});

interface ObjectViewFixture {
  id: string;
  name: string;
  display_name: string;
  description: string;
  object_type_id: string;
  mode: 'configured' | 'standard';
  form_factor: 'full' | 'panel';
  branch_label: string;
  published: boolean;
  status?: string;
  config: Record<string, unknown>;
  owner_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function makeObjectView(overrides: Partial<ObjectViewFixture> = {}): ObjectViewFixture {
  return {
    id: 'object-view-1',
    name: 'aircraft-default-full',
    display_name: 'Aircraft default full view',
    description: 'Auto-generated default configured view.',
    object_type_id: AIRCRAFT.id,
    mode: 'configured',
    form_factor: 'full',
    branch_label: 'main',
    published: true,
    status: 'default_synced',
    config: {
      object_view_version: 1,
      branch_label: 'main',
      auto_publish: false,
      tabs: [],
      prominent_properties: ['tail_number'],
      panel_properties: ['tail_number'],
      sections: [],
    },
    owner_id: 'user-1',
    created_by: 'user-1',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

const SAVED_FULL_VIEW = makeObjectView({
  id: 'object-view-1',
  name: 'aircraft-fleet-summary',
  display_name: 'Aircraft fleet summary',
  description: 'Curated full-page view for fleet operators.',
  status: undefined,
});
const SAVED_PANEL_VIEW = makeObjectView({
  id: 'object-view-2',
  name: 'aircraft-panel',
  display_name: 'Aircraft side panel',
  form_factor: 'panel',
  status: undefined,
});

// ---------------------------------------------------------------------------
// Mock installers
// ---------------------------------------------------------------------------

const TYPES_LIST_URL = /\/api\/v1\/ontology\/types(\?[^/]*)?$/;
const OBJECT_VIEWS_URL = /\/api\/v1\/object-views(\?[^/]*)?$/;

async function mockObjectTypes(page: Page, types: ObjectTypeFixture[]): Promise<void> {
  await page.route(TYPES_LIST_URL, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: types, total: types.length, page: 1, per_page: 100 },
    });
  });
}

async function mockObjectViews(page: Page, views: ObjectViewFixture[]): Promise<void> {
  await page.route(OBJECT_VIEWS_URL, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: views, total: views.length, page: 1, per_page: 200 },
    });
  });
}

async function mockProperties(page: Page, typeId: string, properties: ObjectTypeFixture['properties']): Promise<void> {
  await page.route(new RegExp(`/api/v1/ontology/types/${typeId}/properties$`), async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: properties } });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('initial load: renders the heading, "+ Object view" CTA, and the three editor-level tabs', async ({
  adminPage,
}) => {
  await mockObjectTypes(adminPage, [AIRCRAFT, FLIGHT]);
  await mockObjectViews(adminPage, [SAVED_FULL_VIEW]);
  await mockProperties(adminPage, AIRCRAFT.id, AIRCRAFT.properties);
  await adminPage.goto('/object-views');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^object views$/i }),
  ).toBeVisible();

  // Header has a primary CTA labelled "+ Object view".
  await expect(adminPage.getByRole('button', { name: /^\+ object view$/i })).toBeVisible();

  // The editor-level tabbar lists Editor, "Saved views", and Publish.
  // Scope to the tabbar so the assertion does not collide with the
  // matching Publish action button further down the page.
  const tabbar = adminPage.locator('.of-tabbar').first();
  await expect(tabbar.getByRole('button', { name: /^editor$/i })).toBeVisible();
  await expect(tabbar.getByRole('button', { name: /^saved views$/i })).toBeVisible();
  await expect(tabbar.getByRole('button', { name: /^publish$/i })).toBeVisible();
});

test('stats chips surface the totals returned by the mocked APIs', async ({ adminPage }) => {
  await mockObjectTypes(adminPage, [AIRCRAFT, FLIGHT]);
  await mockObjectViews(adminPage, [SAVED_FULL_VIEW, SAVED_PANEL_VIEW]);
  await mockProperties(adminPage, AIRCRAFT.id, AIRCRAFT.properties);
  await adminPage.goto('/object-views');

  // Object types chip reflects the mocked list (2 types).
  await expect(adminPage.getByText(/object types\s*2/i)).toBeVisible();
  // Properties chip reflects the mocked properties for the selected type.
  await expect(adminPage.getByText(/^properties\s*2$/i)).toBeVisible();
  // Object views chip reflects the mocked saved-view total (>=2, plus the
  // auto-generated default views the page synthesises).
  await expect(adminPage.getByText(/object views\s*\d+/i).first()).toBeVisible();
});

test('"+ Object view" header CTA opens the create modal with the schema-driven form', async ({
  adminPage,
}) => {
  await mockObjectTypes(adminPage, [AIRCRAFT, FLIGHT]);
  await mockObjectViews(adminPage, [SAVED_FULL_VIEW]);
  await mockProperties(adminPage, AIRCRAFT.id, AIRCRAFT.properties);
  await adminPage.goto('/object-views');

  await adminPage.getByRole('button', { name: /^\+ object view$/i }).click();

  const modal = adminPage.getByRole('dialog', { name: /create object view/i });
  await expect(modal).toBeVisible();

  // The form surfaces the required fields via labelled form controls.
  await expect(modal.getByRole('combobox', { name: /object type/i })).toBeVisible();
  await expect(modal.getByRole('combobox', { name: /form factor/i })).toBeVisible();
  await expect(modal.getByLabel(/display name/i)).toBeVisible();
  await expect(modal.getByLabel(/api name/i)).toBeVisible();
  await expect(modal.getByLabel(/description/i)).toBeVisible();
  await expect(modal.getByLabel(/branch label/i)).toBeVisible();
  await expect(
    modal.getByRole('checkbox', { name: /start from current editor configuration/i }),
  ).toBeVisible();

  // The submit button is labelled "+ Object view" (same accessible name
  // as the header CTA — scope the assertion to the modal).
  await expect(modal.getByRole('button', { name: /^\+ object view$/i })).toBeVisible();
});

test('create modal: submitting POSTs /object-views with the form values', async ({ adminPage }) => {
  await mockObjectTypes(adminPage, [AIRCRAFT, FLIGHT]);
  await mockObjectViews(adminPage, [SAVED_FULL_VIEW]);
  await mockProperties(adminPage, AIRCRAFT.id, AIRCRAFT.properties);

  const cap = captureRequests(adminPage, OBJECT_VIEWS_URL);

  // Intercept the POST with a deterministic response so the page can
  // chain into the post-create state without crashing on the 204
  // catch-all.
  await adminPage.route(OBJECT_VIEWS_URL, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON() as { object_type_id?: string; form_factor?: string; display_name?: string; name?: string };
    await route.fulfill({
      status: 201,
      json: {
        id: 'object-view-new-1',
        name: body.name ?? 'new-view',
        display_name: body.display_name ?? 'New view',
        description: '',
        object_type_id: body.object_type_id ?? AIRCRAFT.id,
        mode: 'configured',
        form_factor: body.form_factor ?? 'full',
        branch_label: 'main',
        published: false,
        owner_id: 'user-1',
        created_by: 'user-1',
        created_at: E2E_NOW,
        updated_at: E2E_NOW,
        config: {
          object_view_version: 1,
          branch_label: 'main',
          auto_publish: false,
          tabs: [],
          prominent_properties: [],
          panel_properties: [],
          sections: [],
        },
      },
    });
  });

  await adminPage.goto('/object-views');

  await adminPage.getByRole('button', { name: /^\+ object view$/i }).click();
  const modal = adminPage.getByRole('dialog', { name: /create object view/i });

  // Override the auto-filled display name.
  await modal.getByLabel(/display name/i).fill('Fleet operator view');

  await modal.getByRole('button', { name: /^\+ object view$/i }).click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(1);
  const postCall = cap.calls.find((c) => c.method === 'POST');
  expect(postCall?.body).toMatchObject({
    object_type_id: AIRCRAFT.id,
    form_factor: 'full',
    mode: 'configured',
    display_name: 'Fleet operator view',
  });
});

test('"Saved views" tab lists the mocked Object View definitions with a "Load" button per row', async ({
  adminPage,
}) => {
  await mockObjectTypes(adminPage, [AIRCRAFT]);
  await mockObjectViews(adminPage, [SAVED_FULL_VIEW]);
  await mockProperties(adminPage, AIRCRAFT.id, AIRCRAFT.properties);

  await adminPage.goto('/object-views');
  await adminPage.getByRole('button', { name: /^saved views$/i }).click();

  // The "Saved object views" eyebrow renders with the count chip.
  await expect(adminPage.getByText(/saved object views \(\d+\)/i)).toBeVisible();

  // The mocked saved view's display name renders on the row.
  await expect(adminPage.getByText('Aircraft fleet summary')).toBeVisible();
  await expect(adminPage.getByText('Curated full-page view for fleet operators.')).toBeVisible();

  // Every saved-view row exposes a Load button.
  const loadButtons = adminPage.getByRole('button', { name: /^load$/i });
  await expect(loadButtons.first()).toBeVisible();
});

test('"Saved views" → click "Load" hydrates the editor and surfaces the success notice', async ({
  adminPage,
}) => {
  await mockObjectTypes(adminPage, [AIRCRAFT]);
  await mockObjectViews(adminPage, [SAVED_FULL_VIEW]);
  await mockProperties(adminPage, AIRCRAFT.id, AIRCRAFT.properties);

  await adminPage.goto('/object-views');
  await adminPage.getByRole('button', { name: /^saved views$/i }).click();

  // Scope to the panel that wraps "Aircraft fleet summary" — there are
  // multiple Load buttons because the page also surfaces auto-generated
  // core + default views alongside the mocked saved view.
  const targetRow = adminPage
    .locator('.of-panel-muted')
    .filter({ hasText: 'Aircraft fleet summary' });
  await expect(targetRow).toBeVisible();
  await targetRow.getByRole('button', { name: /^load$/i }).click();

  // The page sets a success notice referencing the loaded view's name
  // and switches back to the Editor tab.
  await expect(
    adminPage.getByText(/loaded "aircraft fleet summary" into the editor/i),
  ).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^editor$/i })).toHaveClass(/of-tab-active/);
});

test('Object type selector changes the editor target type and re-fetches its dependencies', async ({
  adminPage,
}) => {
  await mockObjectTypes(adminPage, [AIRCRAFT, FLIGHT]);
  await mockObjectViews(adminPage, [SAVED_FULL_VIEW]);
  await mockProperties(adminPage, AIRCRAFT.id, AIRCRAFT.properties);
  await mockProperties(adminPage, FLIGHT.id, FLIGHT.properties);

  const cap = captureRequests(adminPage, new RegExp(`/api/v1/ontology/types/${FLIGHT.id}/properties$`));

  await adminPage.goto('/object-views');
  // The first object-type select on the page is the editor-level one
  // (after the chip row).
  const typeSelect = adminPage.locator('label').filter({ hasText: /^object type:$/i }).getByRole('combobox');
  await expect(typeSelect).toBeVisible();
  await typeSelect.selectOption(FLIGHT.id);

  // Switching types triggers the dependent-data fetch for the new type.
  await expect.poll(() => cap.calls.filter((c) => c.method === 'GET').length).toBeGreaterThanOrEqual(1);

  // Eyebrow now references Flight.
  await expect(
    adminPage.getByText(/openfoundry ontology \/ flight \//i),
  ).toBeVisible();
});

test('Publish tab: "Publish current configuration" POSTs /object-views with published: true', async ({
  adminPage,
}) => {
  await mockObjectTypes(adminPage, [AIRCRAFT]);
  await mockObjectViews(adminPage, [SAVED_FULL_VIEW]);
  await mockProperties(adminPage, AIRCRAFT.id, AIRCRAFT.properties);

  const cap = captureRequests(adminPage, OBJECT_VIEWS_URL);
  await adminPage.route(OBJECT_VIEWS_URL, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      json: {
        id: 'object-view-published-1',
        name: (body.name as string) ?? 'published-view',
        display_name: (body.display_name as string) ?? 'Published view',
        description: (body.description as string) ?? '',
        object_type_id: AIRCRAFT.id,
        mode: 'configured',
        form_factor: 'full',
        branch_label: 'main',
        published: true,
        owner_id: 'user-1',
        created_by: 'user-1',
        created_at: E2E_NOW,
        updated_at: E2E_NOW,
        config: (body.config as Record<string, unknown>) ?? {},
      },
    });
  });

  await adminPage.goto('/object-views');
  // The editor-level tablist owns the "publish" tab button — scope the
  // click so it doesn't collide with the Publish action button that
  // also exists on the Editor tab.
  await adminPage
    .locator('[role="tablist"], .of-tabbar')
    .first()
    .getByRole('button', { name: /^publish$/i })
    .click();

  const publishBtn = adminPage.getByRole('button', {
    name: /^(publish current configuration|save and publish current configuration)$/i,
  });
  await expect(publishBtn).toBeVisible();
  // The button is enabled once selectedTypeId resolves + admin has
  // edit permission via the principal's role.
  await expect(publishBtn).toBeEnabled();
  await publishBtn.click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(1);
  const postCall = cap.calls.find((c) => c.method === 'POST');
  expect(postCall?.body).toMatchObject({
    object_type_id: AIRCRAFT.id,
    mode: 'configured',
    form_factor: 'full',
    published: true,
  });
});

test('absent today: Edit / Duplicate / Share / Public-toggle / Delete on saved-views list', async ({
  adminPage,
}) => {
  // Single regression guard for the wishlist controls that the page
  // does not surface. When any of these ships, the matching assertion
  // flips and forces an update.
  await mockObjectTypes(adminPage, [AIRCRAFT]);
  await mockObjectViews(adminPage, [SAVED_FULL_VIEW]);
  await mockProperties(adminPage, AIRCRAFT.id, AIRCRAFT.properties);

  await adminPage.goto('/object-views');
  await adminPage.getByRole('button', { name: /^saved views$/i }).click();
  await expect(adminPage.getByText('Aircraft fleet summary')).toBeVisible();

  // Scope to the page's `<section class="of-page">` so the AppShell
  // chrome (which has its own Share / Save buttons in the topbar) is
  // not pulled into the assertions.
  const page = adminPage.locator('section.of-page');

  // 1. No per-row Edit button.
  expect(await page.getByRole('button', { name: /^edit$/i }).count()).toBe(0);
  // 2. No Duplicate button.
  expect(await page.getByRole('button', { name: /^duplicate$/i }).count()).toBe(0);
  // 3. No Share / Permissions button.
  expect(await page.getByRole('button', { name: /^share$/i }).count()).toBe(0);
  expect(await page.getByRole('button', { name: /^permissions$/i }).count()).toBe(0);
  expect(await page.getByRole('button', { name: /manage access/i }).count()).toBe(0);
  // 4. No Public / Private toggle (the create modal uses a free-form
  //    branch_label; no public/private radio or checkbox exists).
  expect(await page.getByRole('switch', { name: /public/i }).count()).toBe(0);
  expect(await page.getByLabel(/^make (this view )?public$/i).count()).toBe(0);
  // 5. No Delete button on the row.
  expect(await page.getByRole('button', { name: /^delete$/i }).count()).toBe(0);

  // 6. Sanity-check: the only saved-view row-level action is "Load".
  await expect(page.getByRole('button', { name: /^load$/i }).first()).toBeVisible();
});

import type { Page, Route } from '@playwright/test';

import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/ontology-manager/bindings`
 * (apps/web/src/routes/ontology-manager/BindingsWizardPage.tsx).
 *
 * The page is a 4-step wizard for binding a dataset to an object type:
 *
 *   1. Source — pick the object type (sidebar) + dataset + branch/version
 *   2. Map    — `SchemaMapper`: column ↔ property selects + PK radio
 *   3. Create — sync mode, default marking, preview limit + Create CTA
 *   4. Run    — dry-run + materialize, with a chip strip of run stats
 *
 * The page mounts a single API surface:
 *   - GET  /api/v1/ontology/types?per_page=200
 *   - GET  /api/v1/datasets?...
 *   - GET  /api/v1/ontology/types/:id/bindings
 *   - GET  /api/v1/ontology/types/:id/properties
 *   - GET  /api/v1/datasets/:id/preview?limit=25
 *   - POST /api/v1/ontology/types/:id/bindings
 *   - POST /api/v1/ontology/types/:id/bindings/:bid/materialize
 *
 * Mapping is implemented as dropdown selects (one `<select>` per
 * dataset column) plus a PK radio — there is no drag/drop, despite
 * what the ONTM-002 spec suggests.
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Failed to load/i,
      /Cannot read properties of undefined/,
    ],
  },
});

const E2E_NOW = '2026-05-11T00:00:00Z';

interface ObjectTypeFixture {
  id: string;
  rid?: string;
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
    description: 'Fleet vehicle records.',
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

interface PropertyFixture {
  id: string;
  object_type_id: string;
  name: string;
  display_name: string;
  description: string;
  property_type: string;
  required: boolean;
  primary_key_eligible?: boolean;
}

function makeProperty(overrides: Partial<PropertyFixture> = {}): PropertyFixture {
  return {
    id: 'property-1',
    object_type_id: 'object-type-aircraft',
    name: 'tail_number',
    display_name: 'Tail Number',
    description: '',
    property_type: 'string',
    required: true,
    primary_key_eligible: true,
    ...overrides,
  };
}

interface DatasetFixture {
  id: string;
  name: string;
  description: string;
  format: string;
  storage_path: string;
  size_bytes: number;
  row_count: number;
  owner_id: string;
  tags: string[];
  current_version: number;
  active_branch: string;
  created_at: string;
  updated_at: string;
}

function makeDataset(overrides: Partial<DatasetFixture> = {}): DatasetFixture {
  return {
    id: 'dataset-fleet',
    name: 'fleet_roster',
    description: 'Aircraft roster with tail numbers, models, status.',
    format: 'csv',
    storage_path: 's3://fleet/roster.csv',
    size_bytes: 4096,
    row_count: 12,
    owner_id: 'user-1',
    tags: [],
    current_version: 1,
    active_branch: 'main',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

const PROPERTIES: PropertyFixture[] = [
  // Required, also the PK. Auto-mapper matches column "tail_number".
  makeProperty({
    id: 'prop-tail',
    name: 'tail_number',
    display_name: 'Tail Number',
    required: true,
    primary_key_eligible: true,
  }),
  // Required, NOT in the dataset preview → drives the "required not mapped" warning.
  makeProperty({
    id: 'prop-model',
    name: 'model',
    display_name: 'Model',
    required: true,
  }),
  // Optional, present in the dataset.
  makeProperty({
    id: 'prop-status',
    name: 'status',
    display_name: 'Status',
    required: false,
  }),
];

const AIRCRAFT = makeObjectType();
const FLEET = makeDataset();

const PREVIEW_RESPONSE = {
  dataset_id: FLEET.id,
  version: 1,
  branch: 'main',
  format: 'csv',
  limit: 25,
  offset: 0,
  row_count: 2,
  total_rows: 12,
  columns: [
    { name: 'tail_number', field_type: 'STRING', data_type: 'string', nullable: false },
    { name: 'status', field_type: 'STRING', data_type: 'string', nullable: true },
    { name: 'manufactured_at', field_type: 'TIMESTAMP', data_type: 'timestamp', nullable: true },
  ],
  rows: [
    { tail_number: 'N12345', status: 'active', manufactured_at: '2018-01-01' },
    { tail_number: 'N67890', status: 'retired', manufactured_at: '2002-07-12' },
  ],
};

interface CreatedBinding {
  id: string;
  object_type_id: string;
  dataset_id: string;
  dataset_branch?: string | null;
  dataset_version?: number | null;
  primary_key_column: string;
  property_mapping: Array<{ source_field: string; target_property: string }>;
  sync_mode: 'snapshot' | 'incremental' | 'view';
  default_marking: string;
  preview_limit: number;
  owner_id: string;
  last_materialized_at: string | null;
  last_run_status: string | null;
  last_run_summary: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface MockOptions {
  /** Per-type binding listings (typeId → list). Defaults to empty. */
  existingBindings?: Record<string, CreatedBinding[]>;
}

/**
 * Install the binding-wizard route mocks. Everything else falls through
 * to `installDefaultApiMocks` (empty envelopes / 204s).
 */
async function mockBindingsWizard(page: Page, options: MockOptions = {}): Promise<void> {
  const bindingsByType = new Map<string, CreatedBinding[]>(
    Object.entries(options.existingBindings ?? {}),
  );

  // Pages mounts: object types + datasets in parallel.
  await page.route(/\/api\/v1\/ontology\/types(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: [AIRCRAFT], total: 1, page: 1, per_page: 200 },
    });
  });

  await page.route(/\/api\/v1\/datasets(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        data: [FLEET],
        page: 1,
        per_page: 200,
        total: 1,
        total_pages: 1,
      },
    });
  });

  // Per-type properties + bindings lookups (the page refetches when the
  // object type selector changes).
  await page.route(/\/api\/v1\/ontology\/types\/[^/]+\/properties$/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: PROPERTIES } });
  });

  await page.route(/\/api\/v1\/ontology\/types\/[^/]+\/bindings$/, async (route: Route) => {
    const match = /\/ontology\/types\/([^/]+)\/bindings$/.exec(route.request().url());
    const typeId = match?.[1] ?? '';
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: { data: bindingsByType.get(typeId) ?? [] },
      });
      return;
    }
    if (route.request().method() === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as {
        dataset_id?: string;
        dataset_branch?: string;
        dataset_version?: number;
        primary_key_column?: string;
        property_mapping?: Array<{ source_field: string; target_property: string }>;
        sync_mode?: 'snapshot' | 'incremental' | 'view';
        default_marking?: string;
        preview_limit?: number;
      };
      const created: CreatedBinding = {
        id: 'binding-new-1',
        object_type_id: typeId,
        dataset_id: body.dataset_id ?? FLEET.id,
        dataset_branch: body.dataset_branch ?? null,
        dataset_version: body.dataset_version ?? null,
        primary_key_column: body.primary_key_column ?? 'tail_number',
        property_mapping: body.property_mapping ?? [],
        sync_mode: body.sync_mode ?? 'snapshot',
        default_marking: body.default_marking ?? 'public',
        preview_limit: body.preview_limit ?? 1000,
        owner_id: 'user-1',
        last_materialized_at: null,
        last_run_status: null,
        last_run_summary: null,
        created_at: E2E_NOW,
        updated_at: E2E_NOW,
      };
      const existing = bindingsByType.get(typeId) ?? [];
      bindingsByType.set(typeId, [...existing, created]);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    return route.fallback();
  });

  // Dataset preview — returns deterministic columns + rows for step 2.
  await page.route(/\/api\/v1\/datasets\/[^/]+\/preview(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: PREVIEW_RESPONSE });
  });

  // Materialize endpoint — step 4 dry-run / commit.
  await page.route(
    /\/api\/v1\/ontology\/types\/[^/]+\/bindings\/[^/]+\/materialize$/,
    async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      const body = (route.request().postDataJSON() ?? {}) as { dry_run?: boolean };
      await route.fulfill({
        json: {
          binding_id: 'binding-new-1',
          status: 'completed',
          rows_read: 12,
          inserted: body.dry_run ? 0 : 12,
          updated: 0,
          skipped: 0,
          errors: 0,
          dry_run: body.dry_run ?? false,
          error_details: [],
        },
      });
    },
  );
}

test('renders the binding wizard shell with the 4-step nav and sidebar', async ({
  adminPage,
}) => {
  await mockBindingsWizard(adminPage);
  await adminPage.goto('/ontology-manager/bindings');

  // Heading + breadcrumb anchor the page-load gate (vs error boundary).
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /dataset to object type bindings/i }),
  ).toBeVisible();
  await expect(adminPage.getByRole('link', { name: /ontology manager/i }).first()).toBeVisible();
  await expect(adminPage.getByText(/ONTM-002/i)).toBeVisible();

  // The 4-step nav is rendered as a `<nav aria-label="Binding steps">`.
  const stepNav = adminPage.getByRole('navigation', { name: /binding steps/i });
  await expect(stepNav).toBeVisible();
  for (const label of ['1. Source', '2. Map', '3. Create', '4. Run']) {
    await expect(stepNav.getByRole('button', { name: label })).toBeVisible();
  }
  // Step 1 starts as the primary (active) button.
  await expect(stepNav.getByRole('button', { name: '1. Source' })).toHaveClass(/of-button--primary/);

  // The current-object-type sidebar select is pre-populated from the mock.
  await expect(adminPage.getByText(/^current object type$/i)).toBeVisible();
  await expect(adminPage.getByText(/^existing bindings$/i)).toBeVisible();
  await expect(adminPage.getByText(/no bindings for this type/i)).toBeVisible();

  // Header chip strip surfaces the loaded counts.
  await expect(adminPage.getByText(/^Types 1$/i)).toBeVisible();
  await expect(adminPage.getByText(/^Datasets 1$/i)).toBeVisible();
  await expect(adminPage.getByText(/^Bindings 0$/i)).toBeVisible();
});

test('step 1 picks a source dataset and loads the schema preview into step 2', async ({
  adminPage,
}) => {
  await mockBindingsWizard(adminPage);
  const previewCalls = captureRequests(adminPage, /\/api\/v1\/datasets\/[^/]+\/preview(\?|$)/);
  await adminPage.goto('/ontology-manager/bindings');

  await expect(
    adminPage.getByRole('heading', { level: 2, name: /dataset selection/i }),
  ).toBeVisible();

  // Pick the dataset by its labelled select.
  const datasetSelect = adminPage.getByLabel(/^dataset \(/i);
  await datasetSelect.selectOption(FLEET.id);

  // Selected-dataset chip strip renders only after a pick.
  await expect(adminPage.getByText(/^Format csv$/i)).toBeVisible();
  await expect(adminPage.getByText(/^Rows 12$/i)).toBeVisible();
  await expect(adminPage.getByText(/^Current v1$/i)).toBeVisible();

  // "Load schema" fires the preview + properties fetch and advances to step 2.
  const loadButton = adminPage.getByRole('button', { name: /^load schema$/i });
  await expect(loadButton).toBeEnabled();
  await loadButton.click();

  // GET /datasets/<id>/preview?limit=25 was issued.
  await expect.poll(() => previewCalls.count()).toBeGreaterThanOrEqual(1);
  expect(previewCalls.last()?.url).toContain(`/datasets/${FLEET.id}/preview`);
  expect(previewCalls.last()?.url).toContain('limit=25');

  // Step 2 panel shows up with the Schema-mapper heading + nav highlight.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /columns to properties/i }),
  ).toBeVisible();
  await expect(
    adminPage
      .getByRole('navigation', { name: /binding steps/i })
      .getByRole('button', { name: '2. Map' }),
  ).toHaveClass(/of-button--primary/);
});

test('step 2 maps columns to properties via select dropdowns and supports PK selection', async ({
  adminPage,
}) => {
  await mockBindingsWizard(adminPage);
  await adminPage.goto('/ontology-manager/bindings');

  await adminPage.getByLabel(/^dataset \(/i).selectOption(FLEET.id);
  await adminPage.getByRole('button', { name: /^load schema$/i }).click();
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /columns to properties/i }),
  ).toBeVisible();

  // Each preview column renders one row with a property `<select>`. The
  // auto-mapper already wired tail_number → tail_number from the
  // identical names. Match rows by their accessible name (`column
  // type sample`) since `hasText` would also catch sibling rows whose
  // `<select>` happens to include the "status (string)" option text.
  const statusRow = adminPage.getByRole('row', { name: /^status STRING/ });
  await expect(statusRow).toBeVisible();
  const statusSelect = statusRow.getByRole('combobox');
  await expect(statusSelect).toBeVisible();
  await statusSelect.selectOption('status');

  // Mapped-count chip in the SchemaMapper header advances every time a
  // mapping is added or removed.
  await expect(adminPage.getByText(/^Mapped 2$/i)).toBeVisible();

  // Switching the PK radio re-points the primary-key source column.
  const manufacturedRow = adminPage.getByRole('row', { name: /^manufactured_at TIMESTAMP/ });
  const pkRadio = manufacturedRow.getByRole('radio');
  await pkRadio.check();
  await expect(pkRadio).toBeChecked();
});

test('step 2 surfaces a required-properties warning when they are not yet mapped', async ({
  adminPage,
}) => {
  await mockBindingsWizard(adminPage);
  await adminPage.goto('/ontology-manager/bindings');

  await adminPage.getByLabel(/^dataset \(/i).selectOption(FLEET.id);
  await adminPage.getByRole('button', { name: /^load schema$/i }).click();
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /columns to properties/i }),
  ).toBeVisible();

  // The "model" property is required but no dataset column matches it,
  // so the SchemaMapper emits the required-not-mapped banner.
  await expect(adminPage.getByText(/Required properties not mapped:.*model/i)).toBeVisible();

  // The Continue button at the bottom of step 2 should NOT be blocked
  // by `requiredUnmapped` alone (it only checks `mappingIssues`), so
  // we instead assert the warning is the surface the user is shown.
  // To prove the issue gating works end-to-end, clear the mapping and
  // make sure Continue becomes disabled (zero-mappings is a blocking
  // issue, not just a warning).
  await adminPage.getByRole('button', { name: /^clear$/i }).click();
  await expect(adminPage.getByText(/Map at least one dataset column/i)).toBeVisible();
  const continueBtn = adminPage.getByRole('button', { name: /^continue$/i });
  await expect(continueBtn).toBeDisabled();
});

test('step 4 dry-runs the materialization and surfaces the result chips', async ({
  adminPage,
}) => {
  // Seed an existing binding so we can land on step 4 without going
  // through Create. selectExistingBinding(...) populates step 4 state
  // directly from the sidebar list, mirroring the "open the wizard for
  // an existing binding" entry path.
  const existing: CreatedBinding = {
    id: 'binding-existing-1',
    object_type_id: AIRCRAFT.id,
    dataset_id: FLEET.id,
    dataset_branch: 'main',
    dataset_version: 1,
    primary_key_column: 'tail_number',
    property_mapping: [
      { source_field: 'tail_number', target_property: 'tail_number' },
      { source_field: 'status', target_property: 'status' },
    ],
    sync_mode: 'snapshot',
    default_marking: 'public',
    preview_limit: 1000,
    owner_id: 'user-1',
    last_materialized_at: null,
    last_run_status: 'not run',
    last_run_summary: null,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
  };
  await mockBindingsWizard(adminPage, {
    existingBindings: { [AIRCRAFT.id]: [existing] },
  });
  const materializeCalls = captureRequests(
    adminPage,
    /\/api\/v1\/ontology\/types\/[^/]+\/bindings\/[^/]+\/materialize$/,
  );

  await adminPage.goto('/ontology-manager/bindings');

  // The sidebar lists the existing binding; clicking the row drops us
  // straight onto step 4.
  await adminPage
    .getByRole('button', { name: /fleet_roster \(csv\)/i })
    .click();
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /materialize binding/i }),
  ).toBeVisible();

  // Dry-run path keeps the binding read-only on the server side.
  await adminPage.getByRole('button', { name: /^dry run$/i }).click();

  // POST /materialize fired with dry_run: true.
  await expect.poll(() => materializeCalls.count()).toBeGreaterThanOrEqual(1);
  const dryRunBody = materializeCalls.last()?.body as
    | { dry_run?: boolean }
    | undefined;
  expect(dryRunBody?.dry_run).toBe(true);

  // The "Last materialization" summary panel renders with the chip strip.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^completed$/i }),
  ).toBeVisible();
  await expect(adminPage.getByText(/^dry run$/).first()).toBeVisible();
  await expect(adminPage.getByText(/^Rows 12$/i)).toBeVisible();
  await expect(adminPage.getByText(/^Inserted 0$/i)).toBeVisible();
  await expect(adminPage.getByText(/^Errors 0$/i)).toBeVisible();
});

test('submitting the wizard creates the binding via POST and advances to step 4', async ({
  adminPage,
}) => {
  await mockBindingsWizard(adminPage);
  const bindingPosts = captureRequests(adminPage, /\/api\/v1\/ontology\/types\/[^/]+\/bindings$/);
  await adminPage.goto('/ontology-manager/bindings');

  // Step 1 — source picker.
  await adminPage.getByLabel(/^dataset \(/i).selectOption(FLEET.id);
  await adminPage.getByRole('button', { name: /^load schema$/i }).click();
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /columns to properties/i }),
  ).toBeVisible();

  // Step 2 — the auto-mapper already wired the PK property and the
  // `status` column from identical names, so we just confirm the
  // expected mapping count before continuing. Rows are matched by
  // accessible name (`column type sample`) — `hasText` would also
  // match sibling rows whose select includes the "status (string)"
  // option.
  await expect(
    adminPage.getByRole('row', { name: /^status STRING/ }).getByRole('combobox'),
  ).toHaveValue('status');
  await expect(adminPage.getByText(/^Mapped 2$/i)).toBeVisible();
  await adminPage.getByRole('button', { name: /^continue$/i }).click();

  // Step 3 — defaults are populated; just hit Create. The "Create binding"
  // button is gated by `canCreate` (preview loaded + zero mappingIssues).
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /binding configuration/i }),
  ).toBeVisible();
  const createButton = adminPage.getByRole('button', { name: /^create binding$/i });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  // POST /api/v1/ontology/types/:id/bindings fired with our shape.
  await expect.poll(() => bindingPosts.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);
  const post = bindingPosts.calls.find((c) => c.method === 'POST');
  expect(post?.url).toContain(`/ontology/types/${AIRCRAFT.id}/bindings`);
  expect(post?.body).toMatchObject({
    dataset_id: FLEET.id,
    primary_key_column: 'tail_number',
    sync_mode: 'snapshot',
    default_marking: 'public',
  });
  const postBody = post?.body as
    | { property_mapping?: Array<{ source_field: string; target_property: string }> }
    | undefined;
  const mappingMap = new Map(
    (postBody?.property_mapping ?? []).map((m) => [m.source_field, m.target_property]),
  );
  expect(mappingMap.get('tail_number')).toBe('tail_number');
  expect(mappingMap.get('status')).toBe('status');

  // We're on step 4 with the success notice.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /materialize binding/i }),
  ).toBeVisible();
  await expect(adminPage.getByText(/^Binding created\.$/i)).toBeVisible();
  await expect(
    adminPage
      .getByRole('navigation', { name: /binding steps/i })
      .getByRole('button', { name: '4. Run' }),
  ).toHaveClass(/of-button--primary/);
});

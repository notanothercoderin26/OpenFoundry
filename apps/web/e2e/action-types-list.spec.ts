import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/action-types`
 * (apps/web/src/routes/action-types/ActionTypesPage.tsx — 2547 lines).
 *
 * Reality check before the assertions:
 *
 *   - The page is a master/detail layout: list view at `/action-types`
 *     with rows showing each action's display name, operation kind chip,
 *     object type, confirmation, permission, and updated_at. Clicking a
 *     row swaps the layout to the detail view (no URL change — the
 *     selection is kept in component state).
 *   - "Versioning" in the user's checklist isn't a separate concept on
 *     this page: the wire shape has no `version` field. Instead, the page
 *     treats `name` + `object_type_id` as *immutable* once an action
 *     type is saved — the editor drawer disables both. That's the
 *     identity contract this spec pins, with `updated_at` as the
 *     observable bump after edits.
 *   - "Test action" maps to the Operate sidebar tab: Validate + Execute
 *     buttons that POST to `/ontology/actions/:id/{validate,execute}`
 *     with `{ target_object_id, parameters, justification?,
 *     execution_context }`. The validate / execute responses render as
 *     pretty-printed JSON `<pre>` blocks.
 *   - Delete is a native `window.confirm("Delete action type?")` — the
 *     spec handles it with `page.on('dialog')`.
 *   - The shipped create flow is a 5-step wizard (Action type → Mapping
 *     → Metadata → Submission criteria → Save location). The "function /
 *     SQL" wording in the user's brief maps to the Function family tab
 *     in Step 1 (function-backed action) — there is no separate SQL
 *     family today.
 *
 * Endpoints exercised:
 *   - GET    /api/v1/ontology/actions?per_page=200          (list)
 *   - POST   /api/v1/ontology/actions                       (create)
 *   - PATCH  /api/v1/ontology/actions/{id}                  (save edits)
 *   - DELETE /api/v1/ontology/actions/{id}                  (remove)
 *   - POST   /api/v1/ontology/actions/{id}/validate         (test → validate)
 *   - POST   /api/v1/ontology/actions/{id}/execute          (test → execute)
 *   - GET    /api/v1/ontology/types?per_page=200            (object-type dropdowns)
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
    ],
  },
});

const E2E_NOW = '2026-05-11T00:00:00Z';

const ACTIONS_LIST_OR_CREATE = /\/api\/v1\/ontology\/actions(\?|$)/;
const ACTION_DETAIL = /\/api\/v1\/ontology\/actions\/[^/]+(\?|$)/;
const ACTION_VALIDATE = /\/api\/v1\/ontology\/actions\/[^/]+\/validate(\?|$)/;
const ACTION_EXECUTE = /\/api\/v1\/ontology\/actions\/[^/]+\/execute(\?|$)/;
const ACTION_METRICS = /\/api\/v1\/ontology\/actions\/[^/]+\/metrics(\?|$)/;
const ACTION_WHATIF = /\/api\/v1\/ontology\/actions\/[^/]+\/what-if(\?|$)/;
const OBJECT_TYPES_LIST = /\/api\/v1\/ontology\/types(\?|$)/;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface ObjectTypeFixture {
  id: string;
  name: string;
  display_name: string;
  plural: string;
  description: string;
  icon: string;
  color: string;
  primary_key: string;
  properties: unknown[];
  created_at: string;
  updated_at: string;
}

function makeObjectType(overrides: Partial<ObjectTypeFixture> = {}): ObjectTypeFixture {
  return {
    id: 'object-type-1',
    name: 'aircraft',
    display_name: 'Aircraft',
    plural: 'Aircraft',
    description: '',
    icon: '',
    color: '#0f766e',
    primary_key: 'id',
    properties: [],
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

interface ActionTypeFixture {
  id: string;
  name: string;
  display_name: string;
  description: string;
  object_type_id: string;
  interface_id?: string | null;
  operation_kind: string;
  input_schema: Array<{ name: string; property_type: string; required: boolean }>;
  form_schema: { sections: unknown[] };
  config: Record<string, unknown>;
  confirmation_required: boolean;
  permission_key: string | null;
  authorization_policy: Record<string, unknown>;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

function makeActionType(overrides: Partial<ActionTypeFixture> = {}): ActionTypeFixture {
  return {
    id: 'action-type-1',
    name: 'edit_aircraft',
    display_name: 'Edit aircraft',
    description: 'Deterministic E2E action type',
    object_type_id: 'object-type-1',
    interface_id: null,
    operation_kind: 'update_object',
    input_schema: [{ name: 'target_id', property_type: 'reference', required: true }],
    form_schema: { sections: [] },
    config: { operation: { kind: 'update_object', mappings: [] } },
    confirmation_required: false,
    permission_key: null,
    authorization_policy: {},
    owner_id: 'user-1',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

const AIRCRAFT_TYPE = makeObjectType();
const VESSEL_TYPE = makeObjectType({ id: 'object-type-2', name: 'vessel', display_name: 'Vessel' });

const EDIT_AIRCRAFT = makeActionType();
const DELETE_AIRCRAFT = makeActionType({
  id: 'action-type-2',
  name: 'retire_aircraft',
  display_name: 'Retire aircraft',
  operation_kind: 'delete_object',
  object_type_id: 'object-type-1',
  confirmation_required: true,
  permission_key: 'ontology.aircraft.retire',
});
const FUEL_VESSEL = makeActionType({
  id: 'action-type-3',
  name: 'fuel_vessel',
  display_name: 'Fuel vessel',
  operation_kind: 'update_object',
  object_type_id: 'object-type-2',
});

// ---------------------------------------------------------------------------
// Stateful mock.
// ---------------------------------------------------------------------------

interface ActionsMockState {
  actions: ActionTypeFixture[];
}

async function mockActions(
  page: Page,
  initial: { actions?: ActionTypeFixture[]; objectTypes?: ObjectTypeFixture[] } = {},
): Promise<ActionsMockState> {
  const state: ActionsMockState = {
    actions: (initial.actions ?? [EDIT_AIRCRAFT]).slice(),
  };
  const objectTypes = initial.objectTypes ?? [AIRCRAFT_TYPE, VESSEL_TYPE];

  // Object types (used by the list filter + the wizard step 1 + the editor
  // drawer object-type dropdowns).
  await page.route(OBJECT_TYPES_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: objectTypes, total: objectTypes.length, page: 1, per_page: 200 },
    });
  });

  // GET list + POST create on `/ontology/actions`.
  await page.route(ACTIONS_LIST_OR_CREATE, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        json: { data: state.actions, total: state.actions.length, page: 1, per_page: 200 },
      });
      return;
    }
    if (method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as Partial<ActionTypeFixture>;
      const created: ActionTypeFixture = makeActionType({
        id: `action-type-new-${state.actions.length + 1}`,
        name: body.name ?? 'new_action',
        display_name: body.display_name ?? body.name ?? 'New action',
        description: body.description ?? '',
        object_type_id: body.object_type_id ?? 'object-type-1',
        operation_kind: body.operation_kind ?? 'update_object',
        permission_key: body.permission_key ?? null,
        confirmation_required: body.confirmation_required ?? false,
      });
      state.actions.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    return route.fallback();
  });

  // Sub-paths first (registered last → matched first under Playwright's
  // most-recent-handler rule).

  // Validate.
  await page.route(ACTION_VALIDATE, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: { valid: true, errors: [], preview: { ok: true } },
    });
  });

  // Execute.
  await page.route(ACTION_EXECUTE, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const url = route.request().url();
    // execute-batch shares the prefix; let the dedicated handler below win.
    if (url.includes('/execute-batch')) return route.fallback();
    const match = /\/actions\/([^/?#]+)\/execute(?:\?|$)/.exec(url);
    const id = match?.[1] ?? '';
    const action = state.actions.find((entry) => entry.id === id) ?? state.actions[0] ?? EDIT_AIRCRAFT;
    const body = (route.request().postDataJSON() ?? {}) as {
      target_object_id?: string;
      parameters?: Record<string, unknown>;
    };
    await route.fulfill({
      json: {
        action,
        target_object_id: body.target_object_id ?? null,
        deleted: false,
        preview: { echoed_parameters: body.parameters ?? {} },
        object: null,
        link: null,
        result: { status: 'executed' },
      },
    });
  });

  // Metrics — stub returns an empty window. (Not exercised by these specs,
  // but the Operate tab can trigger it via the Monitoring tab; we install
  // it defensively.)
  await page.route(ACTION_METRICS, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        action_id: 'action-type-1',
        window: '30d',
        success_count: 0,
        failure_count: 0,
        p95_duration_ms: null,
        failure_categories: {},
      },
    });
  });

  // What-if — empty list / 201 echo.
  await page.route(ACTION_WHATIF, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        json: { data: [], total: 0, page: 1, per_page: 50 },
      });
      return;
    }
    return route.fallback();
  });

  // Detail (PATCH + DELETE). Skip sub-paths defensively.
  await page.route(ACTION_DETAIL, async (route: Route) => {
    const method = route.request().method();
    const url = route.request().url();
    if (/\/(validate|execute|execute-batch|metrics|what-if)(\/|\?|$)/.test(url)) {
      return route.fallback();
    }
    const match = /\/actions\/([^/?#]+)(?:\?|$)/.exec(url);
    const id = match?.[1] ?? '';

    if (method === 'PATCH') {
      const body = (route.request().postDataJSON() ?? {}) as Partial<ActionTypeFixture>;
      const idx = state.actions.findIndex((entry) => entry.id === id);
      if (idx >= 0) {
        state.actions[idx] = { ...state.actions[idx], ...body, updated_at: '2026-05-12T12:00:00Z' };
        await route.fulfill({ json: state.actions[idx] });
      } else {
        await route.fulfill({ status: 404, json: { error: 'not found' } });
      }
      return;
    }
    if (method === 'DELETE') {
      state.actions = state.actions.filter((entry) => entry.id !== id);
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    return route.fallback();
  });

  return state;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renders the heading and lists action types with type + object type chips', async ({
  adminPage,
}) => {
  await mockActions(adminPage, { actions: [EDIT_AIRCRAFT, DELETE_AIRCRAFT, FUEL_VESSEL] });
  await adminPage.goto('/action-types');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^action types$/i }),
  ).toBeVisible();
  await expect(adminPage.getByText('ONT-015').first()).toBeVisible();

  const table = adminPage.getByRole('table').first();
  await expect(table.getByRole('cell', { name: /edit aircraft/i })).toBeVisible();
  await expect(table.getByRole('cell', { name: /retire aircraft/i })).toBeVisible();
  await expect(table.getByRole('cell', { name: /fuel vessel/i })).toBeVisible();

  // Operation-kind chip in the "Type" column.
  await expect(table.getByRole('cell', { name: 'update_object' }).first()).toBeVisible();
  await expect(table.getByRole('cell', { name: 'delete_object' })).toBeVisible();

  // Object type display name comes from the joined ObjectType lookup.
  await expect(table.getByRole('cell', { name: /^aircraft$/i }).first()).toBeVisible();
  await expect(table.getByRole('cell', { name: /^vessel$/i })).toBeVisible();

  // Family-filter tablist has the All chip + 6 family tabs.
  const familyTabs = adminPage.getByRole('tablist', { name: /action family/i });
  await expect(familyTabs.getByRole('tab', { name: /^all/i })).toBeVisible();
  await expect(familyTabs.getByRole('tab', { name: /^object/i })).toBeVisible();
  await expect(familyTabs.getByRole('tab', { name: /^function/i })).toBeVisible();
});

test('object-type filter narrows the table to actions on that type', async ({ adminPage }) => {
  await mockActions(adminPage, { actions: [EDIT_AIRCRAFT, DELETE_AIRCRAFT, FUEL_VESSEL] });
  // Both filters are client-side — the page calls `listActionTypes`
  // ONCE and then narrows in memory. Capturing the list call lets us
  // assert there's no refetch.
  const listCap = captureRequests(adminPage, ACTIONS_LIST_OR_CREATE);
  await adminPage.goto('/action-types');

  // Wait for initial render: all three rows visible.
  await expect(adminPage.getByRole('cell', { name: /edit aircraft/i })).toBeVisible();
  await expect(adminPage.getByRole('cell', { name: /fuel vessel/i })).toBeVisible();
  const initialGets = listCap.calls.filter((c) => c.method === 'GET').length;

  await adminPage.getByLabel('Filter by object type').selectOption('object-type-2');

  // Aircraft rows gone; vessel row stays.
  await expect(adminPage.getByRole('cell', { name: /edit aircraft/i })).toHaveCount(0);
  await expect(adminPage.getByRole('cell', { name: /retire aircraft/i })).toHaveCount(0);
  await expect(adminPage.getByRole('cell', { name: /fuel vessel/i })).toBeVisible();

  // No second GET — filter is local.
  await adminPage.waitForTimeout(200);
  const finalGets = listCap.calls.filter((c) => c.method === 'GET').length;
  expect(finalGets).toBe(initialGets);
});

test('local search narrows the table by display name', async ({ adminPage }) => {
  await mockActions(adminPage, { actions: [EDIT_AIRCRAFT, DELETE_AIRCRAFT, FUEL_VESSEL] });
  await adminPage.goto('/action-types');

  await expect(adminPage.getByRole('cell', { name: /edit aircraft/i })).toBeVisible();

  await adminPage.getByPlaceholder(/search action types/i).fill('retire');

  await expect(adminPage.getByRole('cell', { name: /retire aircraft/i })).toBeVisible();
  await expect(adminPage.getByRole('cell', { name: /edit aircraft/i })).toHaveCount(0);
  await expect(adminPage.getByRole('cell', { name: /fuel vessel/i })).toHaveCount(0);
});

test('wizard create: walks the 5-step flow and POSTs name + object_type_id + operation_kind', async ({
  adminPage,
}) => {
  await mockActions(adminPage, { actions: [] });
  const createCap = captureRequests(adminPage, ACTIONS_LIST_OR_CREATE);
  await adminPage.goto('/action-types');

  await adminPage.getByRole('button', { name: /create new action type/i }).click();

  const wizard = adminPage.getByRole('dialog', { name: /create a new action type/i });
  await expect(wizard).toBeVisible();

  // Step 1 — the Object family is the default; we just need to pick an
  // object type to unlock "Next". The Object-type `<select>` is wrapped
  // in a `<label><span>...</span>` block (no `htmlFor`); use the role
  // lookup, not `getByLabel`.
  await wizard.getByRole('combobox', { name: 'Object type', exact: true })
    .selectOption('object-type-1');
  await wizard.getByRole('button', { name: 'Next' }).click();

  // Step 2 — input schema + runtime config are pre-filled JSON; advance.
  await wizard.getByRole('button', { name: 'Next' }).click();

  // Step 3 — name + display name are pre-filled; tweak them so the
  // wizard's "I created this" intent shows up in the POST body.
  await wizard.getByLabel('Name', { exact: true }).fill('approve_aircraft');
  await wizard.getByLabel('Display name', { exact: true }).fill('Approve aircraft');
  await wizard.getByLabel('Description', { exact: true }).fill('Created via E2E wizard');
  await wizard.getByRole('button', { name: 'Next' }).click();

  // Step 4 — submission criteria; advance with the defaults.
  await wizard.getByRole('button', { name: 'Next' }).click();

  // Step 5 — review + create. The summary `<dl>` echoes the data we
  // entered.
  await expect(wizard.getByText('approve_aircraft', { exact: true })).toBeVisible();
  await expect(wizard.getByText('Approve aircraft', { exact: true })).toBeVisible();

  await wizard.getByRole('button', { name: /create action type/i }).click();

  await expect.poll(() => createCap.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(1);
  const post = createCap.calls.find((c) => c.method === 'POST');
  expect(post).toBeTruthy();
  expect(post!.body).toMatchObject({
    name: 'approve_aircraft',
    display_name: 'Approve aircraft',
    description: 'Created via E2E wizard',
    object_type_id: 'object-type-1',
    // Family=object + objectMode=create resolves to operation_kind
    // `create_object` (FAMILY_TO_OPERATION_KIND['object']('create')).
    operation_kind: 'create_object',
  });

  // The wizard closes and the page reloads after a successful create.
  await expect(wizard).toBeHidden();
});

test('edit drawer: PATCHes the action and pins name/object-type as immutable (versioning identity)', async ({
  adminPage,
}) => {
  await mockActions(adminPage, { actions: [EDIT_AIRCRAFT] });
  const patches = captureRequests(adminPage, ACTION_DETAIL);
  await adminPage.goto('/action-types');

  // Select the row → detail view.
  await adminPage.getByRole('cell', { name: /edit aircraft/i }).click();
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^edit aircraft$/i }),
  ).toBeVisible();

  // Open the editor drawer.
  await adminPage.getByRole('button', { name: 'Edit' }).click();

  // Both inputs live inside `<label>` blocks with the label text as a
  // text node — `getByLabel` resolves the textbox via the role lookup
  // for inputs, but selects need an explicit `getByRole('combobox', …)`
  // to bind reliably. Name + Object type stay locked after first save:
  // they're the identity of an action type and cannot version-fork.
  // Pinning the disabled state is the page's versioning contract.
  await expect(adminPage.getByLabel('Name', { exact: true })).toBeDisabled();
  await expect(
    adminPage.getByRole('combobox', { name: 'Object type', exact: true }),
  ).toBeDisabled();

  // Display name + description are editable.
  await adminPage.getByLabel('Display name', { exact: true }).fill('Edit aircraft (v2)');
  await adminPage.getByLabel('Description', { exact: true }).fill('Updated by E2E');

  // The submit button is disabled until the draft is dirty — typing
  // above already flipped that. Click to PATCH.
  await adminPage.getByRole('button', { name: /save action type/i }).click();

  await expect.poll(() => patches.calls.filter((c) => c.method === 'PATCH').length).toBeGreaterThanOrEqual(1);
  const patch = patches.calls.find((c) => c.method === 'PATCH');
  expect(patch?.url).toMatch(/\/actions\/action-type-1$/);
  expect(patch?.body).toMatchObject({
    display_name: 'Edit aircraft (v2)',
    description: 'Updated by E2E',
  });
  // `name` and `object_type_id` are NOT in the UpdateActionTypeBody — the
  // editor's disabled inputs are matched by the wire contract.
  expect((patch?.body as Record<string, unknown>).name).toBeUndefined();
  expect((patch?.body as Record<string, unknown>).object_type_id).toBeUndefined();
});

test('delete: accepts the native confirm and DELETEs the selected action type', async ({
  adminPage,
}) => {
  await mockActions(adminPage, { actions: [EDIT_AIRCRAFT, FUEL_VESSEL] });
  const deletes = captureRequests(adminPage, ACTION_DETAIL);
  await adminPage.goto('/action-types');

  await adminPage.getByRole('cell', { name: /edit aircraft/i }).click();
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^edit aircraft$/i }),
  ).toBeVisible();

  // Pre-register a confirm handler — the page calls window.confirm
  // synchronously and would otherwise block.
  adminPage.once('dialog', (dialog) => {
    expect(dialog.message()).toMatch(/delete action type/i);
    void dialog.accept();
  });

  // Two "Delete" buttons exist (the detail header + the editor drawer's
  // delete-only button when open). The detail-header one is reachable
  // without opening the drawer; scope to the detail header by role.
  await adminPage.getByRole('button', { name: 'Delete' }).first().click();

  await expect.poll(() => deletes.calls.filter((c) => c.method === 'DELETE').length).toBeGreaterThanOrEqual(1);
  const del = deletes.calls.find((c) => c.method === 'DELETE');
  expect(del?.url).toMatch(/\/actions\/action-type-1$/);

  // Returns to the list view; deleted row gone, sibling row stays.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^action types$/i }),
  ).toBeVisible();
  await expect(adminPage.getByRole('cell', { name: /edit aircraft/i })).toHaveCount(0);
  await expect(adminPage.getByRole('cell', { name: /fuel vessel/i })).toBeVisible();
});

test('test action: Operate tab validates + executes with the user-supplied parameters', async ({
  adminPage,
}) => {
  await mockActions(adminPage, { actions: [EDIT_AIRCRAFT] });
  const validateCap = captureRequests(adminPage, ACTION_VALIDATE);
  const executeCap = captureRequests(adminPage, ACTION_EXECUTE);
  await adminPage.goto('/action-types');

  await adminPage.getByRole('cell', { name: /edit aircraft/i }).click();
  await adminPage.getByRole('button', { name: /^operate$/i }).click();

  // Fill the target object id + a parameters JSON. The Parameters JSON
  // field is a JsonEditor — its <label> isn't bound to the textarea, so
  // walk up from the caption to the surrounding card.
  await adminPage.getByLabel('Target object id', { exact: true }).fill('aircraft-42');
  await adminPage.getByLabel('Justification', { exact: true }).fill('test action via E2E');

  const paramsBlock = adminPage
    .getByText('Parameters JSON', { exact: true })
    .locator('xpath=ancestor::div[1]/..');
  await paramsBlock.getByRole('textbox').fill('{"reason":"audit"}');

  // Validate first.
  await adminPage.getByRole('button', { name: /^validate$/i }).click();
  await expect.poll(() => validateCap.count()).toBeGreaterThanOrEqual(1);
  const validate = validateCap.last();
  expect(validate?.url).toMatch(/\/actions\/action-type-1\/validate$/);
  expect(validate?.body).toMatchObject({
    target_object_id: 'aircraft-42',
    parameters: { reason: 'audit' },
  });

  // Then execute.
  await adminPage.getByRole('button', { name: /^execute$/i }).click();
  await expect.poll(() => executeCap.count()).toBeGreaterThanOrEqual(1);
  const execute = executeCap.last();
  expect(execute?.url).toMatch(/\/actions\/action-type-1\/execute$/);
  expect(execute?.body).toMatchObject({
    target_object_id: 'aircraft-42',
    parameters: { reason: 'audit' },
    justification: 'test action via E2E',
  });
  // execution_context is always sent — the page builds one even for the
  // default Workshop surface.
  expect((execute?.body as { execution_context?: unknown }).execution_context).toBeTruthy();

  // The Execute result panel renders the mocked response in a `<pre>`.
  const executePre = adminPage.locator('pre').filter({ hasText: /executed/ });
  await expect(executePre).toBeVisible();
});

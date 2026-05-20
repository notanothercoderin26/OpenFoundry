import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/action-types/:id`
 * (apps/web/src/routes/action-types/ActionTypeDetailPage.tsx — 530 lines).
 *
 * Reality vs the user's brief:
 *
 *   - The user's brief lists 5 tabs (Overview / Parameters / Behavior /
 *     Permissions / History). The shipped page is a SIDEBAR (not a
 *     tablist) with EIGHT entries: Overview, Rules, Parameters, User
 *     Interface, Capabilities, Security & Submission Criteria,
 *     Automations (disabled), and History. The labels don't match the
 *     brief; the spec pins the shipped sidebar verbatim.
 *   - Only the "User Interface" section is implemented (Default layout
 *     buttons + a toggle + a drag-and-drop "Field ordering" panel with
 *     "Remove parameter" buttons). Every other section renders the
 *     placeholder "<Label> settings coming soon." — the brief's
 *     parameter-type / required / default / validation editor, the
 *     Behavior code editor (Monaco), the per-role permissions matrix,
 *     and the history diff timeline are all UNshipped today. The spec
 *     pins those absences as regression guards so the day each lands,
 *     the matching assertion flips.
 *   - The closest analog to "History con diffs" is the "Review edits"
 *     modal that opens on Save (header `<h3>Review edits</h3>`). It
 *     diffs the original property mappings against the current ones and
 *     lists "Removed parameter <name>" / "Added parameter <name>" lines
 *     before a "Save to ontology" button issues the PATCH. This spec
 *     exercises that flow as the page's only built-in diff surface.
 *   - The default section on mount is `user-interface` — not
 *     `overview` — because the only implemented panel happens to live
 *     there.
 *
 * Endpoints exercised:
 *   - GET   /api/v1/ontology/actions/{id}                   (load detail)
 *   - PATCH /api/v1/ontology/actions/{id}                   (save edits)
 *   - GET   /api/v1/ontology/types/{typeId}                 (object type lookup)
 *   - GET   /api/v1/ontology/types/{typeId}/properties      (property names)
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
const ACTION_DETAIL = /\/api\/v1\/ontology\/actions\/[^/]+(\?|$)/;
const OBJECT_TYPE_DETAIL = /\/api\/v1\/ontology\/types\/[^/]+(\?|$)/;
const OBJECT_TYPE_PROPERTIES = /\/api\/v1\/ontology\/types\/[^/]+\/properties(\?|$)/;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface PropertyFixture {
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
  created_at: string;
  updated_at: string;
}

function makeProperty(overrides: Partial<PropertyFixture> = {}): PropertyFixture {
  return {
    id: 'property-1',
    object_type_id: 'object-type-1',
    name: 'status',
    display_name: 'Status',
    description: '',
    property_type: 'string',
    required: false,
    unique_constraint: false,
    time_dependent: false,
    default_value: null,
    validation_rules: null,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

interface ObjectTypeFixture {
  id: string;
  name: string;
  display_name: string;
  plural: string;
  description: string;
  icon: string;
  color: string;
  primary_key: string;
  properties: PropertyFixture[];
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

interface PropertyMapping {
  property_name: string;
  kind: 'parameter' | 'unique_id' | string;
  static_value?: string;
}

interface ActionTypeFixture {
  id: string;
  name: string;
  display_name: string;
  description: string;
  object_type_id: string;
  operation_kind: string;
  input_schema: Array<{ name: string; property_type: string; required: boolean }>;
  form_schema: { sections: unknown[] };
  config: {
    property_mappings?: PropertyMapping[];
    default_layout?: 'form' | 'table';
    allow_layout_switching?: boolean;
    [k: string]: unknown;
  };
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
    operation_kind: 'update_object',
    input_schema: [],
    form_schema: { sections: [] },
    config: {
      property_mappings: [
        { property_name: 'status', kind: 'parameter' },
        { property_name: 'priority', kind: 'parameter' },
      ],
      default_layout: 'form',
      allow_layout_switching: false,
    },
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
const STATUS_PROP = makeProperty({
  id: 'property-1',
  name: 'status',
  display_name: 'Status',
});
const PRIORITY_PROP = makeProperty({
  id: 'property-2',
  name: 'priority',
  display_name: 'Priority',
});

// ---------------------------------------------------------------------------
// Stateful mock — supports GET / PATCH of the action plus the object-type
// lookups the detail page fires on mount.
// ---------------------------------------------------------------------------

interface DetailMockState {
  action: ActionTypeFixture;
  objectType: ObjectTypeFixture;
  properties: PropertyFixture[];
}

async function mockDetail(
  page: Page,
  initial: {
    action?: ActionTypeFixture;
    objectType?: ObjectTypeFixture;
    properties?: PropertyFixture[];
  } = {},
): Promise<DetailMockState> {
  const state: DetailMockState = {
    action: initial.action ?? makeActionType(),
    objectType: initial.objectType ?? AIRCRAFT_TYPE,
    properties: initial.properties ?? [STATUS_PROP, PRIORITY_PROP],
  };

  // Properties endpoint MUST be registered after the object-type-detail
  // route below so Playwright's most-recent-handler rule lets it win.
  // We'll register it last in this function.

  // Object type detail.
  await page.route(OBJECT_TYPE_DETAIL, async (route: Route) => {
    const url = route.request().url();
    if (url.endsWith('/properties') || url.includes('/properties?')) {
      return route.fallback();
    }
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: state.objectType });
  });

  // Action detail (GET + PATCH).
  await page.route(ACTION_DETAIL, async (route: Route) => {
    const method = route.request().method();
    const url = route.request().url();
    if (/\/(validate|execute|execute-batch|metrics|what-if)(\/|\?|$)/.test(url)) {
      return route.fallback();
    }

    if (method === 'GET') {
      await route.fulfill({ json: state.action });
      return;
    }
    if (method === 'PATCH') {
      const body = (route.request().postDataJSON() ?? {}) as Partial<ActionTypeFixture>;
      state.action = {
        ...state.action,
        ...body,
        config: { ...(state.action.config ?? {}), ...(body.config ?? {}) },
        updated_at: '2026-05-12T12:00:00Z',
      };
      await route.fulfill({ json: state.action });
      return;
    }
    return route.fallback();
  });

  // Properties (registered last → matched first).
  await page.route(OBJECT_TYPE_PROPERTIES, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: state.properties } });
  });

  return state;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('sidebar pins 8 entries — labels deviate from the user-facing brief (regression guard)', async ({
  adminPage,
}) => {
  // The user's request lists 5 tabs (Overview / Parameters / Behavior /
  // Permissions / History). The shipped sidebar lists EIGHT entries, and
  // none of them are "Behavior" or "Permissions". This test pins the
  // current sidebar so a future re-labelling flips it.
  await mockDetail(adminPage);
  await adminPage.goto('/action-types/action-type-1');

  await expect(adminPage.getByRole('button', { name: 'Overview' })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Rules' })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Parameters' })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'User Interface' })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Capabilities' })).toBeVisible();
  await expect(
    adminPage.getByRole('button', { name: /security & submission criteria/i }),
  ).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Automations' })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'History' })).toBeVisible();

  // The "Automations" entry is disabled today — the page sets
  // `disabled` on its sidebar button.
  await expect(adminPage.getByRole('button', { name: 'Automations' })).toBeDisabled();

  // The brief's "Behavior" and "Permissions" labels do not exist as
  // sidebar entries — pin their absence as a regression guard.
  expect(await adminPage.getByRole('button', { name: 'Behavior', exact: true }).count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: 'Permissions', exact: true }).count()).toBe(0);
});

test('default section is User Interface (only fully-implemented section)', async ({
  adminPage,
}) => {
  // Out of the eight sidebar entries, only `user-interface` renders a
  // working panel today. The default section on mount is therefore
  // `user-interface`, not `overview` — which surprises readers who skim
  // the SIDEBAR constant order. Pin the default + the two panels that
  // make it the active section.
  await mockDetail(adminPage);
  await adminPage.goto('/action-types/action-type-1');

  // Both panel titles render on the page.
  await expect(adminPage.getByText('Action layout', { exact: true })).toBeVisible();
  await expect(adminPage.getByText('Field ordering', { exact: true })).toBeVisible();

  // Both layout cards (Form + Table) are clickable buttons inside the
  // Action layout panel.
  await expect(adminPage.getByRole('button', { name: /^Form$/ })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^Table$/ })).toBeVisible();

  // The configured property mappings (`status` + `priority`) render as
  // field-ordering rows alongside the object-type row. Scope to the
  // Field ordering panel because the back-nav button at the top of the
  // page sidebar also says "Aircraft" (the parent object type).
  const fieldOrdering = adminPage
    .getByText('Field ordering', { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"of-panel")][1]');
  await expect(fieldOrdering.getByText('Aircraft', { exact: true })).toBeVisible();
  await expect(fieldOrdering.getByText('Status', { exact: true })).toBeVisible();
  await expect(fieldOrdering.getByText('Priority', { exact: true })).toBeVisible();

  // Each non-object row exposes a "Remove parameter" trash button.
  await expect(adminPage.getByRole('button', { name: 'Remove parameter' })).toHaveCount(2);
});

test('switching the sidebar to non-UI sections renders the "coming soon" placeholder', async ({
  adminPage,
}) => {
  // The brief's Overview / Parameters / Behavior / Permissions / History
  // tabs do not have implementations today. Clicking each shipped
  // sidebar entry that maps to those concepts (Overview, Rules,
  // Parameters, Capabilities, Security, History) renders the page's
  // `<Label> settings coming soon.` placeholder.
  await mockDetail(adminPage);
  await adminPage.goto('/action-types/action-type-1');

  const placeholderSections: Array<string | RegExp> = [
    'Overview',
    'Rules',
    'Parameters',
    'Capabilities',
    /security & submission criteria/i,
    'History',
  ];
  for (const label of placeholderSections) {
    await adminPage.getByRole('button', { name: label }).click();
    // The placeholder text reads "<Label> settings coming soon." —
    // match the generic suffix so we don't have to spell each label.
    await expect(adminPage.getByText(/settings coming soon\.$/i)).toBeVisible();
  }
});

test('parameter editor (type / required / default / validation): absent today — regression guard', async ({
  adminPage,
}) => {
  // The brief asks for a parameter editor with type / required / default /
  // validation-rule controls. The shipped Parameters section is a
  // placeholder; the User Interface section's field-ordering UI only
  // reorders and removes mappings — no inline editor for any of those
  // fields exists. Pin the absences so they flip when the editor lands.
  await mockDetail(adminPage);
  await adminPage.goto('/action-types/action-type-1');

  // Both the Parameters and User Interface sections.
  for (const section of ['Parameters', 'User Interface']) {
    await adminPage.getByRole('button', { name: section }).click();

    // No "Required" checkbox / "Default value" input / "Validation rule"
    // textbox is rendered.
    expect(await adminPage.getByLabel(/required/i, { exact: false }).count()).toBe(0);
    expect(await adminPage.getByLabel(/default value/i).count()).toBe(0);
    expect(await adminPage.getByLabel(/validation rule/i).count()).toBe(0);

    // No type-picker `<select>` for the parameter type.
    expect(
      await adminPage.getByRole('combobox', { name: /parameter type|property type|type$/i }).count(),
    ).toBe(0);
  }
});

test('behavior code editor (Monaco): absent today — regression guard', async ({ adminPage }) => {
  // The brief asks for a Monaco editor on the Behavior tab. There is no
  // Behavior tab today, and no Monaco container renders on any sidebar
  // section. Pin the absence so the day a behavior editor lands here,
  // this assertion flips and forces an update.
  await mockDetail(adminPage);
  await adminPage.goto('/action-types/action-type-1');

  // Try the sidebar entries closest to "behavior" (Rules + Capabilities)
  // plus the default section. None should render Monaco / a code editor.
  for (const section of ['Rules', 'Capabilities', 'User Interface']) {
    await adminPage.getByRole('button', { name: section }).click();

    // Monaco mounts as `<div class="monaco-editor">` once initialised.
    expect(await adminPage.locator('.monaco-editor').count()).toBe(0);

    // No code-editor `<textarea>` either — the Field ordering rows are
    // drag-drop divs, not text inputs.
    expect(
      await adminPage.getByRole('textbox', { name: /code|behavior|source|function/i }).count(),
    ).toBe(0);
  }
});

test('per-role permissions: absent today — regression guard', async ({ adminPage }) => {
  // The brief asks for a per-role permission editor. The shipped
  // Security & Submission Criteria section is a placeholder.
  await mockDetail(adminPage);
  await adminPage.goto('/action-types/action-type-1');

  await adminPage.getByRole('button', { name: /security & submission criteria/i }).click();
  await expect(adminPage.getByText(/settings coming soon\.$/i)).toBeVisible();

  // No role-permission matrix renders — no rows tagged with the common
  // role names, no per-role grant/deny toggles, no "Add role" CTA.
  expect(await adminPage.getByRole('row', { name: /admin|editor|viewer|owner/i }).count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: /add role|grant|revoke/i }).count()).toBe(0);
});

test('history diff (Review edits modal): removing a parameter shows the diff and PATCHes the action', async ({
  adminPage,
}) => {
  // The closest shipped analog to "History con diffs" is the "Review
  // edits" modal that opens on Save. It diffs the original property
  // mappings against the current ones and renders a "Removed parameter
  // <name>" / "Added parameter <name>" list before issuing the PATCH.
  // No separate History timeline exists yet.
  await mockDetail(adminPage);
  const patches = captureRequests(adminPage, ACTION_DETAIL);
  await adminPage.goto('/action-types/action-type-1');

  // Field ordering renders the two parameter rows with "Remove
  // parameter" buttons. Click the first one to drop `status`.
  await expect(adminPage.getByText('Status', { exact: true })).toBeVisible();
  await adminPage.getByRole('button', { name: 'Remove parameter' }).first().click();

  // The dropped row disappears; the page becomes dirty so the green
  // Save button is enabled. Two "Save" buttons live on the screen: one
  // in the AppShell toolbar (always present, unrelated to the page) and
  // one in the detail page's header. Disambiguate via the unique
  // "Discard" sibling that only appears when the page is dirty.
  await expect(adminPage.getByText('Status', { exact: true })).toHaveCount(0);
  const discardButton = adminPage.getByRole('button', { name: /^discard$/i });
  await expect(discardButton).toBeVisible();
  const pageSave = discardButton.locator('xpath=following-sibling::button[1]');
  await expect(pageSave).toHaveText(/^Save$/);
  await expect(pageSave).toBeEnabled();

  await pageSave.click();

  // Review edits modal opens with the diff.
  const reviewDialog = adminPage.getByRole('dialog');
  await expect(reviewDialog).toBeVisible();
  await expect(reviewDialog.getByRole('heading', { name: /^review edits$/i })).toBeVisible();
  await expect(reviewDialog.getByText(/Removed parameter/i)).toBeVisible();
  await expect(reviewDialog.getByText('status', { exact: true })).toBeVisible();

  // "Save to ontology" issues the PATCH.
  await reviewDialog.getByRole('button', { name: /save to ontology/i }).click();

  await expect.poll(() => patches.calls.filter((c) => c.method === 'PATCH').length).toBeGreaterThanOrEqual(1);
  const patch = patches.calls.find((c) => c.method === 'PATCH');
  expect(patch?.url).toMatch(/\/actions\/action-type-1$/);
  const body = patch?.body as {
    config?: { property_mappings?: PropertyMapping[]; default_layout?: string };
    input_schema?: Array<{ name: string }>;
  };
  expect(body?.config?.property_mappings).toEqual([{ property_name: 'priority', kind: 'parameter' }]);
  expect(body?.config?.default_layout).toBe('form');
  expect(body?.input_schema?.map((item) => item.name)).toEqual(['priority']);

  // After save, the modal closes and the page is no longer dirty (the
  // Save button reverts to disabled).
  await expect(reviewDialog).toBeHidden();
});

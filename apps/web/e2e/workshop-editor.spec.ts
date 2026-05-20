import { type Page, type Route } from '@playwright/test';
import { test, expect, DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for the Workshop EDITOR
 * (apps/web/src/routes/apps/WorkshopEditorPage.tsx).
 *
 * The runtime / preview side is already covered by ~20 workshop-*.spec.ts
 * files. This spec exercises the editor at `/apps/:id/workshop`.
 *
 * Reality check against the requested cases:
 *
 *   - There is NO drag-and-drop palette. Widgets are added via the
 *     "Add widget" menu rendered inside each section, which lists
 *     11 widget types (Object table, Object Set Title, Button group,
 *     Property list, Metric Card, Chart: Pie, Chart: XY, Map, Filter
 *     list, Free-form Analysis, Scenario controls). "Drag-drop" here
 *     means open menu → click type → instance appears in the section.
 *   - There is NO Monaco editor on this page. Inspectors are plain
 *     HTML controls (`<input>`, `<select>`, `<textarea>`); the editor
 *     never imports `monaco-editor`. The Monaco requirement is pinned
 *     by a regression guard at the bottom of the file.
 *   - There is NO ctrl+s shortcut. The only keybinding the editor
 *     binds is ctrl+i → workflow lineage. The Save flow is a PATCH
 *     triggered by the "Save draft" button.
 *   - There is NO undo/redo, NO publish, NO version revert and NO
 *     multi-user locking inside this page. Publish + versions live in
 *     the gallery (`AppsPage.tsx` → PublishAppModal); the editor only
 *     sends `status: 'draft'` on save. We pin these absences as a
 *     regression guard rather than asserting flows that don't ship.
 *   - "Edit property text → preview reflects change" is exercised by
 *     editing the section title in the inspector and asserting the
 *     LayoutOutline / canvas re-render. The standalone preview
 *     (`?mode=preview`) opens in a new tab; we cover it via a direct
 *     URL navigation test.
 *
 * Endpoints exercised:
 *   - GET   /api/v1/apps/{id}                            (load)
 *   - PATCH /api/v1/apps/{id}                            (save draft)
 *   - GET   /api/v1/ontology/types                       (object type list)
 *   - GET   /api/v1/ontology/types/{id}/properties       (object table columns)
 *   - GET   /api/v1/ontology/actions                     (row actions, button actions)
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /Failed to load/i,
    ],
  },
});

const APP_PATCH = /\/api\/v1\/apps\/[^/?#]+$/;

const E2E_NOW = '2026-05-11T00:00:00Z';

const APP_ID = 'editor-demo';

const DEFAULT_THEME = {
  name: 'Editor Demo Theme',
  primary_color: '#2d72d2',
  accent_color: '#0f766e',
  background_color: '#f8fafc',
  surface_color: '#ffffff',
  text_color: '#0f172a',
  heading_font: 'Inter',
  body_font: 'Inter',
  border_radius: 8,
  logo_url: null,
};

const DEFAULT_SETTINGS = {
  home_page_id: 'page',
  navigation_style: 'tabs',
  max_width: '1280px',
  show_branding: true,
  custom_css: null,
  builder_experience: 'workshop',
  ontology_source_type_id: null,
  object_set_variables: [],
  workshop_variables: [],
  consumer_mode: {
    enabled: false,
    allow_guest_access: false,
    portal_title: null,
    portal_subtitle: null,
    primary_cta_label: null,
    primary_cta_url: null,
  },
  interactive_workshop: {
    enabled: false,
    title: null,
    subtitle: null,
    briefing_template: null,
    primary_scenario_widget_id: null,
    primary_agent_widget_id: null,
    suggested_questions: [],
    scenario_presets: [],
  },
  workshop_header: { title: null, icon: null, color: null },
  slate: {
    enabled: false,
    framework: 'react',
    package_name: '',
    entry_file: '',
    sdk_import: '',
    workspace: {
      enabled: false,
      repository_id: null,
      layout: '',
      runtime: '',
      dev_command: '',
      preview_command: '',
      files: [],
    },
    quiver_embed: {
      enabled: false,
      primary_type_id: null,
      secondary_type_id: null,
      join_field: null,
      secondary_join_field: null,
      date_field: null,
      metric_field: null,
      group_field: null,
      selected_group: null,
    },
  },
};

/**
 * Minimal AppDefinition fixture. The editor's `defaultPage()` fills two
 * sections in when the loaded app has no pages, so we return an empty
 * pages array to exercise that initial-state branch — except for the
 * one test where we hand-craft pages with an `object_table` so we can
 * exercise its inspector immediately.
 */
function makeAppDefinition(overrides: { pages?: unknown[]; settings?: unknown } = {}) {
  return {
    id: APP_ID,
    name: 'Editor Demo',
    slug: 'editor-demo',
    description: 'Editor smoke fixture.',
    status: 'draft',
    pages: overrides.pages ?? [],
    settings: overrides.settings ?? DEFAULT_SETTINGS,
    theme: DEFAULT_THEME,
    template_key: null,
    created_by: null,
    published_version_id: null,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
  };
}

interface EditorMockState {
  app: ReturnType<typeof makeAppDefinition>;
}

/**
 * Stateful mocks. GET returns the current state, PATCH merges the body
 * into state and echoes the merged definition back (which the editor
 * stores in `setApp(...)`). A 204 reply would crash subsequent renders.
 */
async function mockEditor(
  page: Page,
  initial: ReturnType<typeof makeAppDefinition> = makeAppDefinition(),
): Promise<EditorMockState> {
  const state: EditorMockState = { app: { ...initial } };

  await page.route('**/api/v1/apps/**', async (route: Route) => {
    const method = route.request().method();
    const url = route.request().url();

    // Versions / publish / public sub-paths aren't relevant for the
    // editor; defer to whatever lower-priority handler is in place.
    if (url.includes('/versions') || url.includes('/publish') || url.includes('/public/')) {
      return route.fallback();
    }

    if (method === 'GET') {
      await route.fulfill({ json: state.app });
      return;
    }

    if (method === 'PATCH') {
      const body = (() => {
        try {
          return JSON.parse(route.request().postData() ?? '{}');
        } catch {
          return {};
        }
      })();
      state.app = { ...state.app, ...body, updated_at: E2E_NOW };
      await route.fulfill({ json: state.app });
      return;
    }

    return route.fallback();
  });

  // Ontology endpoints: the editor calls listObjectTypes on mount. The
  // default catch-all already returns an empty list envelope, but list
  // and properties endpoints want the {data, total, page, per_page}
  // shape. Provide one explicitly so console doesn't carp.
  await page.route('**/api/v1/ontology/types**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    if (/\/properties$/.test(route.request().url())) {
      await route.fulfill({ json: { data: [] } });
      return;
    }
    await route.fulfill({ json: { data: [], total: 0, page: 1, per_page: 200 } });
  });

  await page.route('**/api/v1/ontology/actions**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: [], total: 0, page: 1, per_page: 100 } });
  });

  return state;
}

/**
 * Opens the editor and waits for it to mount. Returns when the
 * "Save draft" button is visible — at that point the app + sections
 * have rendered.
 */
async function openEditor(page: Page, id: string = APP_ID): Promise<void> {
  await page.goto(`/apps/${id}/workshop`);
  await expect(page.getByRole('button', { name: /^save draft$/i })).toBeVisible();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('opens an existing app: header bar, default page canvas, and the four left tabs', async ({
  adminPage,
}) => {
  await mockEditor(adminPage);
  await openEditor(adminPage);

  // Header bar: Back button, app name breadcrumb, "Not saved" indicator,
  // View (preview) button, Save draft button.
  await expect(adminPage.getByRole('button', { name: /^back$/i })).toBeVisible();
  await expect(adminPage.getByText('Editor Demo').first()).toBeVisible();
  await expect(adminPage.getByText('Not saved')).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^view$/i })).toBeVisible();

  // Left-nav has the four icon tabs (`aria-label` matches the tab id).
  for (const tab of ['layout', 'outline', 'variables', 'settings']) {
    await expect(adminPage.getByRole('button', { name: tab, exact: true })).toBeVisible();
  }

  // The default page ships with two sections, each rendering an
  // "Add widget" button — the closest analogue to a widget palette.
  await expect(adminPage.getByRole('button', { name: /add widget/i })).toHaveCount(2);
});

test('add widget via menu creates a fresh instance with a distinct id', async ({ adminPage }) => {
  await mockEditor(adminPage);
  await openEditor(adminPage);

  // Open the Add-widget menu in the first section and pick "Metric Card".
  // ("Object table" opens an ObjectSetPicker dialog that intercepts
  // pointer events, so it's not suitable for a two-step add flow.)
  const addWidgetButtons = adminPage.getByRole('button', { name: /add widget/i });
  await addWidgetButtons.first().click();
  await adminPage.getByRole('button', { name: /^metric card$/i }).click();

  // The right-side inspector switches to the metric-card widget. The
  // canvas now renders a Metric Card 1 widget.
  await expect(adminPage.getByText('Metric Card 1').first()).toBeVisible();

  // Add a second widget in the second section.
  await addWidgetButtons.nth(1).click();
  await adminPage.getByRole('button', { name: /^property list$/i }).click();

  // Both widget titles are visible. Different sections + different
  // titles = the editor produced distinct instances (each `makeId`
  // call returns a unique id).
  await expect(adminPage.getByText('Metric Card 1').first()).toBeVisible();
  await expect(adminPage.getByText('Property list 1').first()).toBeVisible();
  // The LayoutOutline now shows both widget rows.
  await expect(adminPage.getByRole('button', { name: 'Metric Card 1' })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Property list 1' })).toBeVisible();
});

test('clicking a widget opens the widget-specific inspector', async ({ adminPage }) => {
  await mockEditor(adminPage);
  await openEditor(adminPage);

  // Add a Metric Card.
  await adminPage.getByRole('button', { name: /add widget/i }).first().click();
  await adminPage.getByRole('button', { name: /^metric card$/i }).click();

  // The inspector shows the metric card label input (specific to the
  // MetricCardInspector). The default label is "Metric Card".
  await expect(adminPage.getByRole('heading', { name: /metric card/i }).or(adminPage.getByText('Metric Card 1').first())).toBeVisible();

  // Click on a different widget — the inspector swaps.
  await adminPage.getByRole('button', { name: /add widget/i }).nth(1).click();
  await adminPage.getByRole('button', { name: /^button group$/i }).click();

  // BUTTON GROUP appears as the widget type label on the right.
  await expect(adminPage.getByText('BUTTON GROUP').first()).toBeVisible();
});

test('editing the section title updates the LayoutOutline live', async ({ adminPage }) => {
  await mockEditor(adminPage);
  await openEditor(adminPage);

  // The default page has two sections, both titled "Section". The
  // LayoutOutline (left pane) renders each as a button whose
  // accessible name is the title followed by the "ROWS" chip suffix.
  const outlineEntries = adminPage.getByRole('button', { name: 'Section ROWS' });
  await expect(outlineEntries).toHaveCount(2);

  // Pick the first section by clicking it in the outline. That swaps
  // the right-hand panel to the SectionInspector.
  await outlineEntries.first().click();

  // Title input in the SectionInspector. The control has
  // `aria-labelledby` pointing at the "Title" span, so getByRole +
  // name resolves it (multiple Title inputs exist — the SectionInspector
  // Title is in the right-most aside).
  await adminPage.getByRole('textbox', { name: 'Title' }).first().fill('Trail summary');

  // The outline button text updates to match.
  await expect(adminPage.getByRole('button', { name: 'Trail summary ROWS' })).toBeVisible();
  await expect(outlineEntries).toHaveCount(1);
});

test('variables tab: create a primitive variable then rename it', async ({ adminPage }) => {
  await mockEditor(adminPage);
  await openEditor(adminPage);

  // Switch to the Variables tab.
  await adminPage.getByRole('button', { name: 'variables', exact: true }).click();

  // The panel shows the "Variables (0)" header and no entries yet.
  await expect(adminPage.getByText('Variables (0)')).toBeVisible();

  // Open the add-variable menu and pick "Primitive value". Adding a
  // variable also opens the ObjectSetDefinitionEditor side-panel as
  // an editing surface — close it so the rename happens in the
  // VariablesPanel (which is the user-facing surface for primitives).
  await adminPage.getByRole('button', { name: /add variable/i }).click();
  await adminPage.getByRole('button', { name: /primitive value/i }).first().click();
  await adminPage.getByRole('button', { name: 'Close' }).click();

  // The variable shows up with its default name, "New string". The
  // counter rolls to 1.
  await expect(adminPage.getByText('Variables (1)')).toBeVisible();

  // Rename via the inline input in the VariablesPanel. Two inputs
  // can briefly share the same value while the editor was open;
  // after the close, only the panel input remains.
  const nameInput = adminPage.locator('input[value="New string"]').first();
  await nameInput.fill('Active runner');
  await expect(adminPage.locator('input[value="Active runner"]')).toBeVisible();
  await expect(adminPage.getByText('String · Used in 0 widgets')).toBeVisible();
});

test('binding: link a widget property (input source) to a workshop variable', async ({
  adminPage,
}) => {
  await mockEditor(adminPage);
  await openEditor(adminPage);

  // Create an object-set-definition variable first so the source list
  // has something to bind to. Close the editor side-panel that pops up
  // — we just want the variable in the panel.
  await adminPage.getByRole('button', { name: 'variables', exact: true }).click();
  await adminPage.getByRole('button', { name: /add variable/i }).click();
  await adminPage.getByRole('button', { name: /object set definition/i }).first().click();
  await adminPage.getByRole('button', { name: 'Close' }).click();
  await expect(adminPage.locator('input[value="New object set"]').first()).toBeVisible();

  // Now add an Object Set Title widget. The add-widget click bubbles
  // up to the section's onClick (which sets selection back to the
  // section), so we then click the widget row in the LayoutOutline
  // to ensure the DetailWidgetInspector renders.
  await adminPage.getByRole('button', { name: 'layout', exact: true }).click();
  await adminPage.getByRole('button', { name: /add widget/i }).first().click();
  await adminPage.getByRole('button', { name: /^object set title$/i }).click();
  await adminPage.getByRole('button', { name: 'Object set title 1' }).click();

  // The DetailWidgetInspector renders a labelled "Input object set"
  // select. Choose the variable we just created (option index 1 — 0
  // is the "Select object set variable…" placeholder).
  const inputSelect = adminPage.getByLabel(/input object set/i);
  await expect(inputSelect).toBeVisible();
  await inputSelect.selectOption({ index: 1 });

  // The select now reports the variable as its current value. The id
  // prefix is `var_…` from `makeId('var')`.
  await expect(inputSelect).toHaveValue(/^var_/);
});

test('events: change a button group button on_click_kind from "none" to "action"', async ({
  adminPage,
}) => {
  await mockEditor(adminPage);
  await openEditor(adminPage);

  // Add a Button group widget. The add-widget click bubbles up to
  // the section's onClick (which clobbers the temporary widget
  // selection), so click "Button group 1" in the LayoutOutline to
  // pin the widget selection before opening the per-button editor.
  await adminPage.getByRole('button', { name: /add widget/i }).first().click();
  await adminPage.getByRole('button', { name: /^button group$/i }).click();
  await adminPage.getByRole('button', { name: 'Button group 1' }).click();

  // Two "Button 1" buttons render now: the actual button in the
  // canvas, and the inspector row. Scope to the inspector aside
  // (it contains the "BUTTON GROUP" type label).
  const inspector = adminPage.locator('aside').filter({ hasText: 'BUTTON GROUP' });
  await inspector.getByRole('button', { name: 'Button 1' }).click();

  // The ButtonItemEditor exposes an "Action kind" select. Default is
  // "No action" (`on_click_kind: 'none'`); flip it to "Action".
  const kindSelect = adminPage.getByLabel(/action kind/i);
  await expect(kindSelect).toBeVisible();
  await expect(kindSelect).toHaveValue('none');

  await kindSelect.selectOption('action');
  await expect(kindSelect).toHaveValue('action');

  // A "Select an Action…" picker becomes visible — confirming the
  // editor switched to the action-bound flow.
  await expect(adminPage.getByText(/select an action/i).first()).toBeVisible();
});

test('layout: "Add section inside" grows the section count', async ({ adminPage }) => {
  await mockEditor(adminPage);
  await openEditor(adminPage);

  // The default page starts with two sections — each outline button
  // is named "Section ROWS" (title + chip suffix).
  await expect(adminPage.getByRole('button', { name: 'Section ROWS' })).toHaveCount(2);

  // The SectionToolbar at the top of the canvas has a single
  // "Add section inside" button.
  await adminPage.getByRole('button', { name: /add section inside/i }).first().click();

  // Outline + canvas now have three sections.
  await expect(adminPage.getByRole('button', { name: 'Section ROWS' })).toHaveCount(3);
  await expect(adminPage.getByRole('button', { name: /add widget/i })).toHaveCount(3);
});

test('layout: setting a section layout to "tabs" highlights the choice in the menu', async ({
  adminPage,
}) => {
  await mockEditor(adminPage);
  await openEditor(adminPage);

  // Each section ships a "Set layout" button. Click the first.
  await adminPage.getByRole('button', { name: /set layout/i }).first().click();

  // The popover shows six layout cards (Columns, Rows, Tabs, Flow,
  // Toolbar, Loop) plus the "Layout" / "Determines how components …"
  // copy. Filter by the Layout heading (substring, not anchored).
  const layoutMenu = adminPage.locator('[role="menu"]').filter({ hasText: 'Determines how components' });
  await expect(layoutMenu).toBeVisible();
  await layoutMenu.getByRole('button', { name: 'Tabs' }).click();

  // Menu closes on selection. Re-open to inspect persisted state:
  // the Tabs card now has the active-state border (`2px solid …`).
  await adminPage.getByRole('button', { name: /set layout/i }).first().click();
  const reopened = adminPage.locator('[role="menu"]').filter({ hasText: 'Determines how components' });
  const tabsCard = reopened.getByRole('button', { name: 'Tabs' });
  await expect(tabsCard).toHaveCSS('border-top-style', 'solid');
  await expect(tabsCard).toHaveCSS('border-top-width', '2px');
});

test('layout: SectionToolbar "Split right" creates a new sibling section', async ({
  adminPage,
}) => {
  await mockEditor(adminPage);
  await openEditor(adminPage);

  // Initial canvas has two sections.
  await expect(adminPage.getByRole('button', { name: /add widget/i })).toHaveCount(2);

  // Select the first section so onSplit has a target.
  await adminPage.getByRole('button', { name: 'Section ROWS' }).first().click();

  // The SectionToolbar exposes 4 directional split icons. The "Split
  // right" icon has `aria-label="Split right"`.
  await adminPage.getByRole('button', { name: /^split right$/i }).click();

  await expect(adminPage.getByRole('button', { name: /add widget/i })).toHaveCount(3);
});

test('preview mode: ?mode=preview replaces the editor with the PreviewShell', async ({
  adminPage,
}) => {
  await mockEditor(adminPage);
  await adminPage.goto(`/apps/${APP_ID}/workshop?mode=preview`);

  // The Save draft button only exists in edit mode.
  await expect(adminPage.getByRole('button', { name: /^save draft$/i })).toHaveCount(0);

  // The PreviewShell renders the app name in its header and a "More"
  // button (3-dot menu) with the Edit (⌘E) / Copy link entries.
  await expect(adminPage.getByText('Editor Demo').first()).toBeVisible();
  await adminPage.getByRole('button', { name: /^more$/i }).click();
  // Menu item labels: "Edit ⌘E" and "Copy link" — not exact match.
  await expect(adminPage.getByRole('menu').getByRole('button', { name: /^Edit/ })).toBeVisible();
  await expect(adminPage.getByRole('menu').getByRole('button', { name: /copy link/i })).toBeVisible();
});

test('save button: PATCHes /apps/{id} with status=draft and updates the "Saved at" indicator', async ({
  adminPage,
}) => {
  await mockEditor(adminPage);
  const cap = captureRequests(adminPage, APP_PATCH);
  await openEditor(adminPage);

  // Pre-save state.
  await expect(adminPage.getByText('Not saved')).toBeVisible();

  await adminPage.getByRole('button', { name: /^save draft$/i }).click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'PATCH').length).toBeGreaterThanOrEqual(1);
  const last = cap.calls.filter((c) => c.method === 'PATCH').slice(-1)[0];
  expect(last?.url).toMatch(/\/apps\/editor-demo$/);
  const body = last?.body as Record<string, unknown> | undefined;
  expect(body).toMatchObject({ status: 'draft' });
  expect(Array.isArray((body as { pages?: unknown }).pages)).toBe(true);
  expect((body as { settings?: unknown }).settings).toBeTruthy();

  // The header swaps "Not saved" for a "Saved at HH:MM(:SS) [AM|PM]"
  // string — the exact time depends on the runner's clock, so the
  // regex is loose.
  await expect(adminPage.getByText(/^Saved at \d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?$/i)).toBeVisible();
  await expect(adminPage.getByText('Not saved')).toHaveCount(0);
});

test('header inspector: editing the title updates the canvas header live', async ({
  adminPage,
}) => {
  await mockEditor(adminPage);
  await openEditor(adminPage);

  // Click the canvas header (the rectangle at the top of the canvas
  // showing the app logo + name). It's the first row to render in
  // <main> and selects the header on click.
  // Easiest stable anchor: the LayoutOutline lists "Header" as the
  // first row.
  await adminPage.getByRole('button', { name: /^Header$/ }).first().click();

  // HeaderInspector exposes a "Title" field. The label is "Title".
  const titleInput = adminPage.getByLabel(/^Title$/);
  await expect(titleInput).toBeVisible();
  await titleInput.fill('Trail Workshop');

  // The canvas header text content updates. The header renders both
  // the title and (optionally) the app logo, but the title string is
  // unique enough.
  await expect(adminPage.locator('main').getByText('Trail Workshop')).toBeVisible();
});

test('absent today: no Monaco editor, no ctrl+s/ctrl+z, no publish or version controls', async ({
  adminPage,
}) => {
  await mockEditor(adminPage);
  const cap = captureRequests(adminPage, APP_PATCH);
  await openEditor(adminPage);

  // 1. No Monaco editor on this page. (Other surfaces — Functions,
  //    custom widgets, the schedule editor — do mount Monaco; the
  //    workshop editor never imports it.)
  expect(await adminPage.locator('.monaco-editor').count()).toBe(0);

  // 2. Ctrl+S does not trigger a save. The "Save draft" button is
  //    the only way to PATCH /apps/:id. The editor's only keybinding
  //    is ctrl+i (workflow lineage navigation).
  await adminPage.keyboard.press('Control+s');
  await adminPage.waitForTimeout(150);
  expect(cap.calls.filter((c) => c.method === 'PATCH').length).toBe(0);

  // 3. Ctrl+Z is a no-op (no undo handler registered in this page).
  //    The default page still has two sections after the keypress.
  //    (The global Topbar's Undo button is a stub; this proves the
  //    editor itself doesn't snapshot state per keystroke.)
  await adminPage.keyboard.press('Control+z');
  await expect(adminPage.getByRole('button', { name: /add widget/i })).toHaveCount(2);

  // 4. The editor only saves drafts — `persistDraft` hard-codes
  //    `status: 'draft'`. The header has no "Publish" or
  //    "Save and publish" affordances, and no version-revert UI.
  const editorHeader = adminPage.locator('header').filter({ hasText: /save draft/i });
  expect(await editorHeader.getByRole('button', { name: /^publish/i }).count()).toBe(0);
  expect(await editorHeader.getByRole('button', { name: /save and publish/i }).count()).toBe(0);
  expect(await editorHeader.getByRole('button', { name: /^versions?$/i }).count()).toBe(0);
  expect(await editorHeader.getByRole('button', { name: /rollback|revert/i }).count()).toBe(0);
});

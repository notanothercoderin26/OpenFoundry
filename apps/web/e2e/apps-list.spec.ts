import { type Page, type Route } from '@playwright/test';
import { test, expect, DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/apps`
 * (apps/web/src/routes/apps/AppsPage.tsx).
 *
 * Reality check against the requested cases:
 *
 *   - The Gallery cards have a Glyph icon (no real image thumbnail) plus
 *     name + status chip + description + page/widget/template chips.
 *     The "thumbnail" referenced in the case list is that glyph.
 *   - "Create app" is a single-step modal (CreateAppModal): the left
 *     sidebar lists templates plus a "Start from scratch" / blank entry
 *     and a Name + Slug + Description form on the right. Submitting
 *     POSTs to `/apps` (blank) or `/apps/from-template` (template key).
 *   - There is NO whole-app "Duplicate" affordance in the Gallery — the
 *     `duplicate` UI only exists per page / per widget / per overlay
 *     inside the builder. The Gallery `AppsPage` PO references a
 *     `duplicateButton` locator as a forward-looking hook, but no
 *     button currently matches. We pin that absence as a regression
 *     guard instead of asserting a flow that doesn't exist.
 *   - "Publish" opens PublishAppModal (gated by an ACK checkbox) and
 *     POSTs `/apps/:id/publish`. There is no "Unpublish" action — the
 *     shipped model uses versioned snapshots (promote / rollback in
 *     the Versions drawer), so this spec covers publish only.
 *   - "Share" is a ConfirmDialog that surfaces the runtime URL and
 *     attempts a clipboard write on confirm. It does NOT open a
 *     permission-management surface today.
 *   - "Delete" lives in the builder's SectionToolbar (trash icon
 *     `title="Delete app"`) → ConfirmDialog → `DELETE /apps/:id`.
 *   - Both the search box and the status pill-toggle filter LOCALLY;
 *     the status query string only ships on the initial list fetch.
 *
 * Endpoints exercised:
 *   - GET    /api/v1/apps?per_page=200[&status=...]
 *   - GET    /api/v1/apps/templates
 *   - GET    /api/v1/widgets/catalog
 *   - GET    /api/v1/apps/{id}
 *   - GET    /api/v1/apps/{id}/versions
 *   - POST   /api/v1/apps
 *   - POST   /api/v1/apps/from-template
 *   - POST   /api/v1/apps/{id}/publish
 *   - DELETE /api/v1/apps/{id}
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      // Builder-side renderer pulls heavy lazy chunks and ontology bits
      // that aren't relevant to the gallery flows we care about here.
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /Failed to load/i,
    ],
  },
});

const APPS_LIST = /\/api\/v1\/apps(\?|$)/;
const APP_CREATE = /\/api\/v1\/apps$/;
const APP_FROM_TEMPLATE = /\/api\/v1\/apps\/from-template$/;
const APP_DELETE = /\/api\/v1\/apps\/[^/?#]+$/;
const APP_PUBLISH = /\/api\/v1\/apps\/[^/?#]+\/publish$/;

const E2E_NOW = '2026-05-11T00:00:00Z';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface AppSummaryFixture {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: 'draft' | 'published' | 'archived';
  page_count: number;
  widget_count: number;
  template_key: string | null;
  published_version_id: string | null;
  created_at: string;
  updated_at: string;
}

function makeAppSummary(overrides: Partial<AppSummaryFixture> = {}): AppSummaryFixture {
  return {
    id: 'app-1',
    name: 'Sample app',
    slug: 'sample-app',
    description: 'Deterministic E2E app',
    status: 'draft',
    page_count: 1,
    widget_count: 0,
    template_key: null,
    published_version_id: null,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

const EMPTY_SETTINGS = {
  home_page_id: 'page-home',
  navigation_style: 'tabs',
  max_width: '1280px',
  show_branding: true,
  custom_css: null,
  builder_experience: 'workshop',
  ontology_source_type_id: null,
  object_set_variables: [],
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

const EMPTY_THEME = {
  name: 'Workshop App',
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

function makeAppDefinition(summary: AppSummaryFixture) {
  return {
    id: summary.id,
    name: summary.name,
    slug: summary.slug,
    description: summary.description,
    status: summary.status,
    pages: [
      {
        id: 'page-home',
        name: 'Home',
        path: '/',
        description: '',
        layout: { kind: 'grid', columns: 12, gap: '1rem', max_width: '1280px' },
        visible: true,
        widgets: [],
      },
    ],
    settings: EMPTY_SETTINGS,
    theme: EMPTY_THEME,
    template_key: summary.template_key,
    created_by: null,
    published_version_id: summary.published_version_id,
    created_at: summary.created_at,
    updated_at: summary.updated_at,
  };
}

interface AppsMockState {
  apps: AppSummaryFixture[];
}

/**
 * Installs the shared mocks every test in this file needs:
 *
 *  - `GET /apps`              → list envelope built from `state.apps`
 *  - `GET /apps/templates`    → the canned template list (incl. "operations")
 *  - `GET /widgets/catalog`   → empty array (gallery doesn't render widgets)
 *  - `GET /apps/{id}`         → full definition for the first matching app
 *  - `GET /apps/{id}/versions`→ empty version envelope
 *  - `DELETE /apps/{id}`      → removes the row from `state.apps`
 *
 * Each test layers per-test POST handlers on top.
 */
async function mockApps(
  page: Page,
  initial: { apps: AppSummaryFixture[] },
): Promise<AppsMockState> {
  const state: AppsMockState = { apps: initial.apps.slice() };

  // GET /apps and DELETE /apps/{id}. The list and delete patterns overlap
  // (templates is a sub-path of /apps, so we route by method + url).
  await page.route('**/api/v1/apps**', async (route: Route) => {
    const method = route.request().method();
    const url = route.request().url();

    if (url.includes('/apps/templates')) {
      if (method !== 'GET') return route.fallback();
      await route.fulfill({
        json: {
          data: [
            {
              id: 'template-ops',
              key: 'operations',
              name: 'Operations dashboard',
              description: 'KPI tiles, queues, and an action drawer.',
              category: 'workshop',
              preview_image_url: null,
              definition: {
                pages: [
                  {
                    id: 'page-home',
                    name: 'Home',
                    path: '/',
                    description: '',
                    layout: { kind: 'grid', columns: 12, gap: '1rem', max_width: '1280px' },
                    visible: true,
                    widgets: [],
                  },
                ],
                theme: EMPTY_THEME,
                settings: EMPTY_SETTINGS,
              },
              created_at: E2E_NOW,
            },
          ],
        },
      });
      return;
    }

    if (method === 'GET' && /\/apps\?/.test(url) || (method === 'GET' && /\/apps$/.test(url))) {
      await route.fulfill({
        json: {
          data: state.apps,
          total: state.apps.length,
        },
      });
      return;
    }

    // GET /apps/{id}/versions
    if (method === 'GET' && /\/apps\/[^/?#]+\/versions/.test(url)) {
      await route.fulfill({ json: { data: [] } });
      return;
    }

    // GET /apps/{id}
    const detailMatch = /\/apps\/([^/?#]+)(?:\?|$)/.exec(url);
    if (method === 'GET' && detailMatch) {
      const id = detailMatch[1];
      const target = state.apps.find((entry) => entry.id === id || entry.slug === id) ?? state.apps[0];
      if (!target) {
        await route.fulfill({ status: 404, json: { error: 'not found' } });
        return;
      }
      await route.fulfill({ json: makeAppDefinition(target) });
      return;
    }

    if (method === 'DELETE' && detailMatch) {
      const id = detailMatch[1];
      state.apps = state.apps.filter((entry) => entry.id !== id && entry.slug !== id);
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    // POST handlers are layered per-test; defer to whatever was registered later.
    return route.fallback();
  });

  await page.route('**/api/v1/widgets/catalog', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: [] });
  });

  return state;
}

const APP_ALPHA = makeAppSummary({
  id: 'app-alpha',
  name: 'Alpha Ops',
  slug: 'alpha-ops',
  description: 'Operational dashboard for Alpha.',
  status: 'draft',
  page_count: 3,
  widget_count: 12,
  template_key: 'operations',
});

const APP_BETA = makeAppSummary({
  id: 'app-beta',
  name: 'Beta Reports',
  slug: 'beta-reports',
  description: 'Quarterly published reports.',
  status: 'published',
  page_count: 1,
  widget_count: 4,
  template_key: null,
  published_version_id: 'version-7',
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('gallery renders each app card with its name, status, description and counts', async ({
  adminPage,
}) => {
  await mockApps(adminPage, { apps: [APP_ALPHA, APP_BETA] });
  await adminPage.goto('/apps');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /workshop apps/i }),
  ).toBeVisible();

  // The Alpha card.
  const alpha = adminPage.getByRole('button', { name: /alpha ops/i }).first();
  await expect(alpha).toBeVisible();
  await expect(alpha).toContainText('Alpha Ops');
  await expect(alpha).toContainText('Operational dashboard for Alpha.');
  await expect(alpha).toContainText('3 pages');
  await expect(alpha).toContainText('12 widgets');
  await expect(alpha).toContainText('operations'); // template chip
  await expect(alpha).toContainText('draft');

  // The Beta card — published, no template chip, falls back to slug for
  // description because the fixture still has a description, but counts
  // and status are distinct.
  const beta = adminPage.getByRole('button', { name: /beta reports/i }).first();
  await expect(beta).toContainText('Beta Reports');
  await expect(beta).toContainText('Quarterly published reports.');
  await expect(beta).toContainText('1 pages');
  await expect(beta).toContainText('4 widgets');
  await expect(beta).toContainText('published');

  // The header pill-toggle ships with the four documented statuses.
  const filter = adminPage.locator('[aria-label="Status filter"]');
  for (const status of ['all', 'draft', 'published', 'archived']) {
    await expect(filter.getByRole('button', { name: new RegExp(`^${status}$`, 'i') })).toBeVisible();
  }
});

test('create app (blank): POSTs /apps with the typed name and no template_key', async ({
  adminPage,
}) => {
  await mockApps(adminPage, { apps: [] });
  const cap = captureRequests(adminPage, APP_CREATE);

  // Layer a more specific POST handler on top of the catch-all.
  await adminPage.route('**/api/v1/apps', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: makeAppDefinition(
        makeAppSummary({
          id: 'app-new-1',
          name: 'Pricing tracker',
          slug: 'pricing-tracker',
          description: 'New blank app',
        }),
      ),
    });
  });

  await adminPage.goto('/apps');

  await adminPage.getByRole('button', { name: /new app/i }).click();
  const dialog = adminPage.getByRole('dialog', { name: /new app/i });
  await expect(dialog).toBeVisible();

  // "Start from scratch" is selected by default; just fill the form.
  await dialog.getByRole('button', { name: /start from scratch/i }).click();
  const nameInput = dialog.getByRole('textbox').first();
  await nameInput.fill('Pricing tracker');

  await dialog.getByRole('button', { name: /create app/i }).click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(1);
  const body = cap.last()?.body as Record<string, unknown> | undefined;
  expect(body).toMatchObject({ name: 'Pricing tracker' });
  expect(body).not.toHaveProperty('template_key');

  // After creating, the URL swaps to ?selected=<slug> (builder mode).
  await expect(adminPage).toHaveURL(/[?&]selected=pricing-tracker/);
});

test('create app (from existing template): POSTs /apps/from-template with template_key', async ({
  adminPage,
}) => {
  await mockApps(adminPage, { apps: [] });
  const cap = captureRequests(adminPage, APP_FROM_TEMPLATE);

  await adminPage.route('**/api/v1/apps/from-template', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: makeAppDefinition(
        makeAppSummary({
          id: 'app-new-2',
          name: 'Operations dashboard',
          slug: 'operations-dashboard',
          description: 'Created from the operations template',
          template_key: 'operations',
        }),
      ),
    });
  });

  await adminPage.goto('/apps');

  await adminPage.getByRole('button', { name: /new app/i }).click();
  const dialog = adminPage.getByRole('dialog', { name: /new app/i });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: /operations dashboard/i }).click();
  await dialog.getByRole('button', { name: /create app/i }).click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(1);
  const body = cap.last()?.body as Record<string, unknown> | undefined;
  expect(body).toMatchObject({ template_key: 'operations' });
  expect(body?.name).toBeTruthy();
});

test('local search filters the gallery without re-querying /apps', async ({ adminPage }) => {
  await mockApps(adminPage, { apps: [APP_ALPHA, APP_BETA] });
  const cap = captureRequests(adminPage, APPS_LIST);
  await adminPage.goto('/apps');

  // Wait for initial list render so the GET below is accounted for.
  await expect(adminPage.getByRole('button', { name: /alpha ops/i }).first()).toBeVisible();
  const initialGets = cap.calls.filter((c) => c.method === 'GET').length;

  await adminPage.getByPlaceholder(/search apps/i).fill('beta');

  await expect(adminPage.getByRole('button', { name: /alpha ops/i })).toHaveCount(0);
  await expect(adminPage.getByRole('button', { name: /beta reports/i }).first()).toBeVisible();

  // No extra fetch fired — the filter is local.
  await adminPage.waitForTimeout(200);
  expect(cap.calls.filter((c) => c.method === 'GET').length).toBe(initialGets);
});

test('status filter pills narrow the gallery to one status at a time', async ({ adminPage }) => {
  await mockApps(adminPage, { apps: [APP_ALPHA, APP_BETA] });
  await adminPage.goto('/apps');

  const filter = adminPage.locator('[aria-label="Status filter"]');

  // Default = "all": both apps are visible.
  await expect(adminPage.getByRole('button', { name: /alpha ops/i }).first()).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /beta reports/i }).first()).toBeVisible();

  // Draft only → Alpha stays, Beta hides.
  await filter.getByRole('button', { name: /^draft$/i }).click();
  await expect(adminPage.getByRole('button', { name: /alpha ops/i }).first()).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /beta reports/i })).toHaveCount(0);

  // Published only → flips the visibility.
  await filter.getByRole('button', { name: /^published$/i }).click();
  await expect(adminPage.getByRole('button', { name: /alpha ops/i })).toHaveCount(0);
  await expect(adminPage.getByRole('button', { name: /beta reports/i }).first()).toBeVisible();

  // Empty-state message when filter excludes everything.
  await filter.getByRole('button', { name: /^archived$/i }).click();
  await expect(adminPage.getByText(/no apps match the current filters/i)).toBeVisible();
});

test('publish flow: confirmation dialog ships POST /apps/{id}/publish with notes', async ({
  adminPage,
}) => {
  await mockApps(adminPage, { apps: [APP_ALPHA] });
  const cap = captureRequests(adminPage, APP_PUBLISH);

  await adminPage.route('**/api/v1/apps/*/publish', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: {
        id: 'version-new-1',
        app_id: APP_ALPHA.id,
        version_number: 1,
        status: 'published',
        notes: 'First release',
        created_by: null,
        created_at: E2E_NOW,
        published_at: E2E_NOW,
        app_snapshot: { ...makeAppDefinition(APP_ALPHA) },
      },
    });
  });

  await adminPage.goto(`/apps?selected=${APP_ALPHA.slug}`);

  // The builder's left-pane Overview heading is the most stable anchor
  // for "the app definition finished loading" (the toolbar also renders
  // the name as a non-heading <strong>).
  await expect(
    adminPage.getByRole('heading', { level: 2, name: 'Alpha Ops' }),
  ).toBeVisible();

  // Click the toolbar's primary "Save and publish" button.
  await adminPage.getByRole('button', { name: /^save and publish$/i }).first().click();

  // PublishAppModal opens with the version summary, notes, and an
  // ACK checkbox that must be ticked before the submit unlocks.
  const dialog = adminPage.getByRole('dialog', { name: /publish alpha ops/i });
  await expect(dialog).toBeVisible();
  const submit = dialog.getByRole('button', { name: /publish v1/i });
  await expect(submit).toBeDisabled();

  await dialog.getByRole('textbox').fill('First release');
  await dialog.getByRole('checkbox').check();
  await expect(submit).toBeEnabled();

  await submit.click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(1);
  const body = cap.last()?.body as Record<string, unknown> | undefined;
  expect(body).toMatchObject({ notes: 'First release' });
  expect(cap.last()?.url).toMatch(/\/apps\/app-alpha\/publish$/);
});

test('share dialog surfaces the runtime URL and dismisses on cancel', async ({ adminPage }) => {
  await mockApps(adminPage, { apps: [APP_BETA] });
  await adminPage.goto(`/apps?selected=${APP_BETA.slug}`);

  // Wait for the builder to mount — use the left-pane Overview heading.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: 'Beta Reports' }),
  ).toBeVisible();

  // The global Topbar also has a stub "Share" button rendered earlier
  // in DOM; the workshop toolbar Share renders later, so `.last()`
  // picks the right one. The toolbar button also has `title="Share app"`,
  // which makes for a stable second filter.
  await adminPage
    .getByRole('button', { name: /^share$/i })
    .last()
    .click();

  const dialog = adminPage.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Message ships the runtime URL and the permission-gate explanation.
  await expect(dialog).toContainText(/Runtime URL.*\/apps\/runtime\/beta-reports/);
  await expect(dialog).toContainText(/app\.public\.read/);

  // Cancel closes the dialog without firing any side-effects.
  await dialog.getByRole('button', { name: /^cancel$/i }).click();
  await expect(adminPage.getByRole('dialog')).toHaveCount(0);
});

test('delete: SectionToolbar trash icon opens the confirm and DELETEs the app', async ({
  adminPage,
}) => {
  const state = await mockApps(adminPage, { apps: [APP_ALPHA, APP_BETA] });
  const cap = captureRequests(adminPage, APP_DELETE);

  await adminPage.goto(`/apps?selected=${APP_ALPHA.slug}`);
  await expect(
    adminPage.getByRole('heading', { level: 2, name: 'Alpha Ops' }),
  ).toBeVisible();

  // The trash icon in the SectionToolbar carries `title="Delete app"`.
  await adminPage.getByRole('button', { name: /delete app/i }).first().click();

  const dialog = adminPage.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/Delete Alpha Ops/i);
  // ConfirmDialog renders the danger button with the configured label.
  await dialog.getByRole('button', { name: /^delete app$/i }).click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'DELETE').length).toBeGreaterThanOrEqual(1);
  // `cap.last()` mixes the DELETE with the post-delete GET refresh —
  // the pattern matches both. Pin the DELETE specifically.
  const deleteCalls = cap.calls.filter((c) => c.method === 'DELETE');
  expect(deleteCalls[deleteCalls.length - 1].url).toMatch(/\/apps\/app-alpha$/);

  // Stateful mock confirms the row is gone from the underlying list.
  expect(state.apps.map((a) => a.id)).toEqual(['app-beta']);
});

test('absent today: per-app "Duplicate" button in the gallery does not ship', async ({
  adminPage,
}) => {
  // The case list asks for a "Duplicate app" flow, but the only
  // `duplicate` affordances today are inside the builder (pages,
  // widgets, overlays — `duplicatePage`, `duplicateWidget`,
  // `duplicateOverlay` in `AppsPage.tsx`). The Gallery cards expose
  // one click handler each (open the app) and no row-level menu.
  // This guard pins that fact; when a whole-app duplicate ships, the
  // assertion flips and forces an update.
  await mockApps(adminPage, { apps: [APP_ALPHA, APP_BETA] });
  await adminPage.goto('/apps');

  await expect(adminPage.getByRole('button', { name: /alpha ops/i }).first()).toBeVisible();

  // No button or menuitem with a "Duplicate" name exists at the
  // gallery level.
  expect(await adminPage.getByRole('button', { name: /^duplicate( app)?$/i }).count()).toBe(0);
  expect(await adminPage.getByRole('menuitem', { name: /duplicate/i }).count()).toBe(0);

  // The Gallery cards expose a single click target (the card button
  // itself) — there is no per-card "..." menu or row-level toolbar.
  const card = adminPage.getByRole('button', { name: /alpha ops/i }).first();
  await expect(card).toBeVisible();
  // Nothing inside the card matches a "more actions" / "duplicate" hook.
  expect(await card.getByRole('button').count()).toBe(0);
});

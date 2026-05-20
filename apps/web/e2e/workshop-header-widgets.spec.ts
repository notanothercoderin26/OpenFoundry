import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';

const now = '2026-05-20T00:00:00Z';

const appResponse = {
  app: {
    id: 'header-widgets-demo',
    name: 'Header Widgets Demo',
    slug: 'header-widgets-demo',
    description: 'Button Group widget pinned to a vertical collapsible header.',
    status: 'published',
    pages: [
      {
        id: 'main',
        name: 'Main',
        path: '/',
        description: '',
        visible: true,
        layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '1280px' },
        widgets: [
          {
            id: 'body-text',
            widget_type: 'text',
            title: '',
            description: '',
            position: { x: 0, y: 0, width: 12, height: 1 },
            props: { content: 'Body content' },
            binding: null,
            events: [],
            children: [],
          },
        ],
        sections: [],
        overlays: [],
      },
    ],
    theme: {
      name: 'Header Widgets Demo',
      primary_color: '#0f766e',
      accent_color: '#c2410c',
      background_color: '#f8fafc',
      surface_color: '#ffffff',
      text_color: '#0f172a',
      heading_font: 'Inter',
      body_font: 'Inter',
      border_radius: 8,
      logo_url: null,
    },
    settings: {
      home_page_id: 'main',
      navigation_style: 'none',
      max_width: '1280px',
      show_branding: false,
      custom_css: null,
      builder_experience: 'workshop',
      ontology_source_type_id: null,
      object_set_variables: [],
      workshop_variables: [],
      consumer_mode: { enabled: false, allow_guest_access: false, portal_title: null, portal_subtitle: null, primary_cta_label: null, primary_cta_url: null },
      interactive_workshop: { enabled: false, title: null, subtitle: null, briefing_template: null, primary_scenario_widget_id: null, primary_agent_widget_id: null, suggested_questions: [], scenario_presets: [] },
      workshop_header: {
        enabled: true,
        orientation: 'vertical',
        width: 220,
        collapsible: true,
        collapsed_by_default: false,
        title: 'Workspace',
        widgets: [
          {
            id: 'header-btn-group',
            widget_type: 'button_group',
            title: 'Header buttons',
            description: '',
            position: { x: 0, y: 0, width: 12, height: 1 },
            props: {
              orientation: 'vertical',
              buttons: [
                {
                  id: 'btn-home',
                  label: 'Home',
                  on_click_kind: 'none',
                  action_type_id: '',
                  parameter_defaults: {},
                  default_layout: 'form',
                  switch_layout: false,
                  conditional_visibility: false,
                  icon: '⌂',
                },
                {
                  id: 'btn-search',
                  label: 'Search',
                  on_click_kind: 'none',
                  action_type_id: '',
                  parameter_defaults: {},
                  default_layout: 'form',
                  switch_layout: false,
                  conditional_visibility: false,
                  icon: '🔍',
                },
              ],
            },
            binding: null,
            events: [],
            children: [],
          },
        ],
      },
      slate: {
        enabled: false,
        framework: 'react',
        package_name: '',
        entry_file: '',
        sdk_import: '',
        workspace: { enabled: false, repository_id: null, layout: '', runtime: '', dev_command: '', preview_command: '', files: [] },
        quiver_embed: { enabled: false, primary_type_id: null, secondary_type_id: null, join_field: null, secondary_join_field: null, date_field: null, metric_field: null, group_field: null, selected_group: null },
      },
    },
    template_key: null,
    created_by: 'e2e',
    published_version_id: 'version-1',
    created_at: now,
    updated_at: now,
  },
  embed: { url: '/apps/runtime/header-widgets-demo', iframe_html: '' },
  published_version_number: 1,
  published_at: now,
};

test('A Button Group pinned to the header renders labels normally and switches to icons when collapsed', async ({ page }) => {
  await mockAuth(page, { user: { name: 'Header Tester' } });
  await page.route('**/api/v1/apps/public/header-widgets-demo', async (route) => {
    await route.fulfill({ json: appResponse });
  });

  await page.goto('/apps/runtime/header-widgets-demo');

  const header = page.locator('header.of-app-runtime__header').first();
  await expect(header).toHaveAttribute('data-orientation', 'vertical');
  await expect(header).toHaveAttribute('data-collapsed', 'false');

  const widgetsContainer = header.locator('[data-testid="app-header-widgets"]');
  await expect(widgetsContainer).toBeVisible();
  await expect(widgetsContainer).toContainText('Home');
  await expect(widgetsContainer).toContainText('Search');

  // Expand → no collapsed-mode markers.
  const collapsedBtnGroup = page.locator('[data-testid="button-group-header-btn-group-collapsed"]');
  await expect(collapsedBtnGroup).toHaveCount(0);

  // Collapse the header.
  const collapseBtn = header.locator('[data-testid="app-header-collapse-toggle"]');
  await collapseBtn.click();
  await expect(header).toHaveAttribute('data-collapsed', 'true');

  // The Button Group should now render in icon-only mode, with the configured
  // icons surfaced via data-button-id markers and accessible name preserved.
  await expect(collapsedBtnGroup).toBeVisible();
  await expect(collapsedBtnGroup).toHaveAttribute('data-collapsed', 'true');

  const homeBtn = collapsedBtnGroup.locator('[data-button-id="btn-home"]');
  const searchBtn = collapsedBtnGroup.locator('[data-button-id="btn-search"]');
  await expect(homeBtn).toBeVisible();
  await expect(searchBtn).toBeVisible();
  await expect(homeBtn).toHaveAttribute('data-icon-only', 'true');
  await expect(homeBtn).toHaveAttribute('aria-label', 'Home');
  await expect(homeBtn).toHaveAttribute('title', 'Home');
  await expect(homeBtn).toContainText('⌂');
  await expect(searchBtn).toContainText('🔍');

  // Expand again → labels return, icon-only markers disappear.
  await collapseBtn.click();
  await expect(header).toHaveAttribute('data-collapsed', 'false');
  await expect(collapsedBtnGroup).toHaveCount(0);
  await expect(widgetsContainer).toContainText('Home');
  await expect(widgetsContainer).toContainText('Search');
});

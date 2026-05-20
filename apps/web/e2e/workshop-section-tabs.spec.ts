import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';

const now = '2026-05-11T00:00:00Z';

const appResponse = {
  app: {
    id: 'section-tabs-demo',
    name: 'Section Tabs Demo',
    slug: 'section-tabs-demo',
    description: 'Exercises the Tabs section layout in the runtime.',
    status: 'published',
    pages: [
      {
        id: 'main',
        name: 'Main',
        path: '/',
        description: '',
        visible: true,
        layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '1280px' },
        widgets: [],
        sections: [
          {
            id: 'workflow-tabs',
            title: 'Workflow',
            description: 'Switch between workflow stages.',
            layout: { kind: 'tabs', columns: 12, gap: '16px', max_width: '' },
            widgets: [],
            sections: [
              {
                id: 'tab-overview',
                title: 'Overview',
                description: '',
                layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '' },
                widgets: [
                  {
                    id: 'overview-text',
                    widget_type: 'text',
                    title: 'Overview body',
                    description: '',
                    position: { x: 0, y: 0, width: 12, height: 1 },
                    props: { content: 'Overview pane is open.' },
                    binding: null,
                    events: [],
                    children: [],
                  },
                ],
                sections: [],
                visible: true,
              },
              {
                id: 'tab-details',
                title: 'Details',
                description: '',
                layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '' },
                widgets: [
                  {
                    id: 'details-text',
                    widget_type: 'text',
                    title: 'Details body',
                    description: '',
                    position: { x: 0, y: 0, width: 12, height: 1 },
                    props: { content: 'Details pane is open.' },
                    binding: null,
                    events: [],
                    children: [],
                  },
                ],
                sections: [],
                visible: true,
              },
              {
                id: 'tab-hidden',
                title: 'Hidden',
                description: '',
                layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '' },
                widgets: [],
                sections: [],
                visible: false,
              },
              {
                id: 'tab-untitled',
                title: '',
                description: '',
                layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '' },
                widgets: [
                  {
                    id: 'untitled-text',
                    widget_type: 'text',
                    title: 'Fallback label body',
                    description: '',
                    position: { x: 0, y: 0, width: 12, height: 1 },
                    props: { content: 'Untitled tab content.' },
                    binding: null,
                    events: [],
                    children: [],
                  },
                ],
                sections: [],
                visible: true,
              },
            ],
            visible: true,
          },
        ],
        overlays: [],
      },
    ],
    theme: {
      name: 'Section Tabs Demo',
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
      workshop_header: { title: null, icon: null, color: null },
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
  embed: { url: '/apps/runtime/section-tabs-demo', iframe_html: '' },
  published_version_number: 1,
  published_at: now,
};

test('Workshop Tabs layout switches active tab and hides invisible tabs', async ({ page }) => {
  await mockAuth(page, { user: { name: 'Layout Tester' } });
  await page.route('**/api/v1/apps/public/section-tabs-demo', async (route) => {
    await route.fulfill({ json: appResponse });
  });

  await page.goto('/apps/runtime/section-tabs-demo');

  const tabsSection = page.locator('section[data-section-id="workflow-tabs"]');
  await expect(tabsSection).toHaveAttribute('data-section-kind', 'tabs');

  const tablist = tabsSection.getByRole('tablist');
  await expect(tablist).toBeVisible();

  const overviewTab = tablist.locator('[data-tab-id="tab-overview"]');
  const detailsTab = tablist.locator('[data-tab-id="tab-details"]');
  const hiddenTab = tablist.locator('[data-tab-id="tab-hidden"]');
  const untitledTab = tablist.locator('[data-tab-id="tab-untitled"]');

  // Hidden tab is not rendered at all.
  await expect(hiddenTab).toHaveCount(0);

  // Untitled tab falls back to "Tab 3" (after Overview, Details — Hidden is skipped).
  await expect(untitledTab).toHaveText('Tab 3');

  // First visible tab is active by default.
  await expect(overviewTab).toHaveAttribute('aria-selected', 'true');
  await expect(detailsTab).toHaveAttribute('aria-selected', 'false');
  await expect(tabsSection).toContainText('Overview pane is open.');
  await expect(tabsSection).not.toContainText('Details pane is open.');

  // Click Details and verify the panel swaps.
  await detailsTab.click();
  await expect(detailsTab).toHaveAttribute('aria-selected', 'true');
  await expect(overviewTab).toHaveAttribute('aria-selected', 'false');
  await expect(tabsSection).toContainText('Details pane is open.');
  await expect(tabsSection).not.toContainText('Overview pane is open.');

  // Click the untitled tab and verify its content renders.
  await untitledTab.click();
  await expect(untitledTab).toHaveAttribute('aria-selected', 'true');
  await expect(tabsSection).toContainText('Untitled tab content.');
});

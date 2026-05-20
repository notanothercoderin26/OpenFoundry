import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';

const now = '2026-05-11T00:00:00Z';

const appResponse = {
  app: {
    id: 'section-layouts-demo',
    name: 'Section Layouts Demo',
    slug: 'section-layouts-demo',
    description: 'Exercises Columns / Rows / nested section layouts in the runtime.',
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
            id: 'top-columns',
            title: 'Side by side',
            description: 'Columns layout splits the section into two flex columns.',
            layout: { kind: 'columns', columns: 12, gap: '16px', max_width: '' },
            widgets: [
              {
                id: 'left-text',
                widget_type: 'text',
                title: 'Left',
                description: '',
                position: { x: 0, y: 0, width: 6, height: 2 },
                props: { content: 'Left column content' },
                binding: null,
                events: [],
                children: [],
              },
              {
                id: 'right-text',
                widget_type: 'text',
                title: 'Right',
                description: '',
                position: { x: 6, y: 0, width: 6, height: 2 },
                props: { content: 'Right column content' },
                binding: null,
                events: [],
                children: [],
              },
            ],
            sections: [],
            visible: true,
          },
          {
            id: 'stacked-rows',
            title: 'Stacked',
            description: 'Rows layout stacks the children vertically and enables scrolling.',
            layout: { kind: 'rows', columns: 12, gap: '12px', max_width: '', scrollable: true },
            widgets: [
              {
                id: 'row-1',
                widget_type: 'text',
                title: 'Row 1',
                description: '',
                position: { x: 0, y: 0, width: 12, height: 1 },
                props: { content: 'First row' },
                binding: null,
                events: [],
                children: [],
              },
              {
                id: 'row-2',
                widget_type: 'text',
                title: 'Row 2',
                description: '',
                position: { x: 0, y: 1, width: 12, height: 1 },
                props: { content: 'Second row' },
                binding: null,
                events: [],
                children: [],
              },
            ],
            sections: [],
            visible: true,
          },
          {
            id: 'hidden-section',
            title: 'Hidden',
            description: 'This section has visible=false and must not render.',
            layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '' },
            widgets: [],
            sections: [],
            visible: false,
          },
        ],
        overlays: [],
      },
    ],
    theme: {
      name: 'Section Layouts Demo',
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
  embed: { url: '/apps/runtime/section-layouts-demo', iframe_html: '' },
  published_version_number: 1,
  published_at: now,
};

test('Workshop runtime renders Columns and Rows section layouts and skips hidden sections', async ({ page }) => {
  await mockAuth(page, { user: { name: 'Layout Tester', email: 'runner@example.com' } });
  await page.route('**/api/v1/apps/public/section-layouts-demo', async (route) => {
    await route.fulfill({ json: appResponse });
  });

  await page.goto('/apps/runtime/section-layouts-demo');

  const columnsSection = page.locator('section[data-section-id="top-columns"]');
  const rowsSection = page.locator('section[data-section-id="stacked-rows"]');
  const hiddenSection = page.locator('section[data-section-id="hidden-section"]');

  await expect(columnsSection).toHaveAttribute('data-section-kind', 'columns');
  await expect(columnsSection).toContainText('Left column content');
  await expect(columnsSection).toContainText('Right column content');

  await expect(rowsSection).toHaveAttribute('data-section-kind', 'rows');
  await expect(rowsSection).toContainText('First row');
  await expect(rowsSection).toContainText('Second row');

  await expect(hiddenSection).toHaveCount(0);

  const columnsBody = columnsSection.locator('.of-app-section__body').first();
  await expect(columnsBody).toHaveCSS('flex-direction', 'row');

  const rowsBody = rowsSection.locator('.of-app-section__body').first();
  await expect(rowsBody).toHaveCSS('flex-direction', 'column');
  await expect(rowsBody).toHaveCSS('overflow-y', 'auto');
});

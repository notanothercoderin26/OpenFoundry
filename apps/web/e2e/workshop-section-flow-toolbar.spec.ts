import { expect, test } from '@playwright/test';

const now = '2026-05-11T00:00:00Z';

const appResponse = {
  app: {
    id: 'section-flow-toolbar-demo',
    name: 'Flow + Toolbar Demo',
    slug: 'section-flow-toolbar-demo',
    description: 'Exercises the Flow and Toolbar section layouts in the runtime.',
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
            id: 'top-toolbar',
            title: '',
            description: '',
            layout: { kind: 'toolbar', columns: 12, gap: '12px', max_width: '' },
            widgets: [
              {
                id: 'toolbar-text-1',
                widget_type: 'text',
                title: '',
                description: '',
                position: { x: 0, y: 0, width: 2, height: 1 },
                props: { content: 'Toolbar item A' },
                binding: null,
                events: [],
                children: [],
              },
              {
                id: 'toolbar-text-2',
                widget_type: 'text',
                title: '',
                description: '',
                position: { x: 2, y: 0, width: 2, height: 1 },
                props: { content: 'Toolbar item B' },
                binding: null,
                events: [],
                children: [],
              },
              {
                id: 'toolbar-text-3',
                widget_type: 'text',
                title: '',
                description: '',
                position: { x: 4, y: 0, width: 2, height: 1 },
                props: { content: 'Toolbar item C' },
                binding: null,
                events: [],
                children: [],
              },
            ],
            sections: [],
            visible: true,
          },
          {
            id: 'flow-feed',
            title: 'Activity feed',
            description: 'Flow sections scroll vertically.',
            layout: { kind: 'flow', columns: 12, gap: '10px', max_width: '' },
            widgets: Array.from({ length: 8 }, (_, index) => ({
              id: `feed-item-${index + 1}`,
              widget_type: 'text',
              title: '',
              description: '',
              position: { x: 0, y: index, width: 12, height: 1 },
              props: { content: `Feed item ${index + 1}` },
              binding: null,
              events: [],
              children: [],
            })),
            sections: [],
            visible: true,
          },
        ],
        overlays: [],
      },
    ],
    theme: {
      name: 'Flow + Toolbar Demo',
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
  embed: { url: '/apps/runtime/section-flow-toolbar-demo', iframe_html: '' },
  published_version_number: 1,
  published_at: now,
};

test('Workshop Flow and Toolbar section layouts render with correct flex semantics', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('of_access_token', 'e2e-token');
  });
  await page.route('**/api/v1/auth/bootstrap-status', async (route) => {
    await route.fulfill({ json: { requires_initial_admin: false } });
  });
  await page.route('**/api/v1/users/me', async (route) => {
    await route.fulfill({
      json: {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'runner@example.com',
        name: 'Layout Tester',
        is_active: true,
        roles: ['admin'],
        groups: [],
        permissions: ['*'],
        organization_id: null,
        attributes: {},
        mfa_enabled: false,
        mfa_enforced: false,
        auth_source: 'local',
        created_at: now,
      },
    });
  });
  await page.route('**/api/v1/apps/public/section-flow-toolbar-demo', async (route) => {
    await route.fulfill({ json: appResponse });
  });

  await page.goto('/apps/runtime/section-flow-toolbar-demo');

  const toolbarSection = page.locator('section[data-section-id="top-toolbar"]');
  const flowSection = page.locator('section[data-section-id="flow-feed"]');

  await expect(toolbarSection).toHaveAttribute('data-section-kind', 'toolbar');
  await expect(flowSection).toHaveAttribute('data-section-kind', 'flow');

  const toolbarBody = toolbarSection.locator('.of-app-section__body').first();
  await expect(toolbarBody).toHaveCSS('flex-direction', 'row');
  await expect(toolbarBody).toHaveCSS('flex-wrap', 'wrap');
  await expect(toolbarBody).toHaveCSS('align-items', 'center');
  await expect(toolbarSection).toContainText('Toolbar item A');
  await expect(toolbarSection).toContainText('Toolbar item B');
  await expect(toolbarSection).toContainText('Toolbar item C');

  const flowBody = flowSection.locator('.of-app-section__body').first();
  await expect(flowBody).toHaveCSS('flex-direction', 'column');
  await expect(flowBody).toHaveCSS('overflow-y', 'auto');
  await expect(flowSection).toContainText('Feed item 1');
  await expect(flowSection).toContainText('Feed item 8');
});

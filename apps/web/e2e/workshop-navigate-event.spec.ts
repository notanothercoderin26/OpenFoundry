import { expect, test } from '@playwright/test';

const now = '2026-05-11T00:00:00Z';

const appResponse = {
  app: {
    id: 'navigate-demo',
    name: 'Navigate Demo',
    slug: 'navigate-demo',
    description: 'Exercises widget-level navigate events between pages.',
    status: 'published',
    pages: [
      {
        id: 'page-home',
        name: 'Home',
        path: '/',
        description: '',
        visible: true,
        layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '1280px' },
        widgets: [
          {
            id: 'home-text',
            widget_type: 'text',
            title: '',
            description: '',
            position: { x: 0, y: 0, width: 12, height: 1 },
            props: { content: 'Home page body' },
            binding: null,
            events: [],
            children: [],
          },
          {
            id: 'go-detail',
            widget_type: 'button',
            title: '',
            description: '',
            position: { x: 0, y: 1, width: 4, height: 1 },
            props: { label: 'Open detail page' },
            binding: null,
            events: [
              {
                id: 'nav-evt',
                trigger: 'click',
                action: 'navigate',
                label: 'Navigate to detail',
                config: { page_id: 'page-detail' },
              },
            ],
            children: [],
          },
        ],
        sections: [],
        overlays: [],
      },
      {
        id: 'page-detail',
        name: 'Detail',
        path: '/detail',
        description: '',
        visible: true,
        layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '1280px' },
        widgets: [
          {
            id: 'detail-text',
            widget_type: 'text',
            title: '',
            description: '',
            position: { x: 0, y: 0, width: 12, height: 1 },
            props: { content: 'Detail page body' },
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
      name: 'Navigate Demo',
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
      home_page_id: 'page-home',
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
  embed: { url: '/apps/runtime/navigate-demo', iframe_html: '' },
  published_version_number: 1,
  published_at: now,
};

test('A button widget can navigate between Workshop pages via the navigate event', async ({ page }) => {
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
        name: 'Nav Tester',
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
  await page.route('**/api/v1/apps/public/navigate-demo', async (route) => {
    await route.fulfill({ json: appResponse });
  });

  await page.goto('/apps/runtime/navigate-demo');

  await expect(page.getByText('Home page body')).toBeVisible();
  await expect(page.getByText('Detail page body')).toHaveCount(0);

  await page.getByRole('button', { name: 'Open detail page' }).click();

  await expect(page.getByText('Detail page body')).toBeVisible();
  await expect(page.getByText('Home page body')).toHaveCount(0);
});

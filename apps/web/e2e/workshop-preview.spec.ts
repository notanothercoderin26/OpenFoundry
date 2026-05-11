import { expect, test } from '@playwright/test';

const now = '2026-05-11T00:00:00Z';

function textWidget(id: string, title: string, content: string) {
  return {
    id,
    widget_type: 'text',
    title,
    description: '',
    position: { x: 0, y: 0, width: 8, height: 2 },
    props: { content },
    binding: null,
    events: [],
    children: [],
  };
}

function appDefinition(status: 'draft' | 'published', content: string) {
  return {
    id: 'preview-demo-app',
    name: 'Workshop Preview Demo',
    slug: 'preview-demo',
    description: 'Draft preview semantics smoke.',
    status,
    pages: [
      {
        id: 'main',
        name: 'Main',
        path: '/',
        description: '',
        visible: true,
        layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '900px' },
        widgets: [textWidget(`${status}-text`, status === 'draft' ? 'Draft Text' : 'Published Text', content)],
      },
    ],
    theme: {
      name: 'Preview Demo',
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
      max_width: '900px',
      show_branding: false,
      custom_css: null,
      builder_experience: 'workshop',
      ontology_source_type_id: null,
      object_set_variables: [],
      workshop_variables: [
        {
          id: 'runner-param',
          kind: 'runtime_parameter',
          name: 'Runner',
          metadata: { runtime_parameter: 'runner' },
        },
      ],
      consumer_mode: { enabled: false, allow_guest_access: false, portal_title: null, portal_subtitle: null, primary_cta_label: null, primary_cta_url: null },
      interactive_workshop: { enabled: false, title: null, subtitle: null, briefing_template: null, primary_scenario_widget_id: null, primary_agent_widget_id: null, suggested_questions: [], scenario_presets: [] },
      workshop_header: { title: 'Workshop Preview Demo', icon: 'cube', color: '#0f766e' },
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
    published_version_id: status === 'published' ? 'version-1' : null,
    created_at: now,
    updated_at: now,
  };
}

test('editor preview renders draft state while public runtime renders the published snapshot', async ({ page }) => {
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
        name: 'Trail Runner',
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
  await page.route('**/api/v1/apps/preview-demo-app', async (route) => {
    await route.fulfill({ json: appDefinition('draft', 'Draft preview {{runner}}.') });
  });
  await page.route('**/api/v1/apps/public/preview-demo', async (route) => {
    await route.fulfill({
      json: {
        app: appDefinition('published', 'Published runtime {{runner}}.'),
        embed: { url: '/apps/runtime/preview-demo', iframe_html: '' },
        published_version_number: 1,
        published_at: now,
      },
    });
  });
  await page.route('**/api/v1/ontology/types**', async (route) => {
    await route.fulfill({ json: { data: [], total: 0, page: 1, per_page: 200 } });
  });

  await page.goto('/apps/preview-demo-app/workshop?mode=preview&runner=Mesa');
  await expect(page.locator('.of-app-runtime__page')).toBeVisible();
  await expect(page.getByText('Draft preview Mesa.')).toBeVisible();
  await expect(page.getByText('Published runtime Mesa.')).toHaveCount(0);

  await page.goto('/apps/runtime/preview-demo?runner=Mesa');
  await expect(page.locator('.of-app-runtime__page')).toBeVisible();
  await expect(page.getByText('Published runtime Mesa.')).toBeVisible();
  await expect(page.getByText('Draft preview Mesa.')).toHaveCount(0);
});

import { expect, test } from '@playwright/test';

const now = '2026-05-11T00:00:00Z';

const trailItems = [
  { id: 'mesa', label: 'Mesa Trail', miles: 6.07 },
  { id: 'walker', label: 'Walker Ranch', miles: 7.76 },
  { id: 'flatirons', label: 'Flatirons Loop', miles: 4.2 },
];

const appResponse = {
  app: {
    id: 'section-loop-demo',
    name: 'Section Loop Demo',
    slug: 'section-loop-demo',
    description: 'Exercises the Loop section layout over an inline array.',
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
            id: 'trail-cards',
            title: 'Trails',
            description: 'One card per trail.',
            layout: { kind: 'loop', columns: 12, gap: '12px', max_width: '' },
            widgets: [
              {
                id: 'trail-card-text',
                widget_type: 'text',
                title: '',
                description: '',
                position: { x: 0, y: 0, width: 12, height: 1 },
                props: { content: 'Trail #{{item_index}} — {{item.label}} ({{item.miles}} mi)' },
                binding: null,
                events: [],
                children: [],
              },
            ],
            sections: [],
            props: {
              loop_items: trailItems,
              loop_max_items: 10,
            },
            visible: true,
          },
          {
            id: 'empty-loop',
            title: 'No data',
            description: '',
            layout: { kind: 'loop', columns: 12, gap: '12px', max_width: '' },
            widgets: [],
            sections: [],
            props: { loop_items: [], loop_empty_message: 'No trails to display yet.' },
            visible: true,
          },
        ],
        overlays: [],
      },
    ],
    theme: {
      name: 'Section Loop Demo',
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
  embed: { url: '/apps/runtime/section-loop-demo', iframe_html: '' },
  published_version_number: 1,
  published_at: now,
};

test('Workshop Loop layout renders one iteration per inline item with interpolated content', async ({ page }) => {
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
  await page.route('**/api/v1/apps/public/section-loop-demo', async (route) => {
    await route.fulfill({ json: appResponse });
  });

  await page.goto('/apps/runtime/section-loop-demo');

  const loopSection = page.locator('section[data-section-id="trail-cards"]');
  await expect(loopSection).toHaveAttribute('data-section-kind', 'loop');

  const iterations = loopSection.locator('.of-app-section__loop-item');
  await expect(iterations).toHaveCount(3);

  // Each iteration interpolates {{item_index}} and {{item.label}}.
  await expect(iterations.nth(0)).toContainText('Trail #0 — Mesa Trail (6.07 mi)');
  await expect(iterations.nth(1)).toContainText('Trail #1 — Walker Ranch (7.76 mi)');
  await expect(iterations.nth(2)).toContainText('Trail #2 — Flatirons Loop (4.2 mi)');

  // data-loop-index attribute is present per iteration for selectors / a11y.
  await expect(iterations.nth(0)).toHaveAttribute('data-loop-index', '0');
  await expect(iterations.nth(2)).toHaveAttribute('data-loop-index', '2');

  // Empty loop falls back to the configurable empty message.
  const emptySection = page.locator('section[data-section-id="empty-loop"]');
  await expect(emptySection).toContainText('No trails to display yet.');
  await expect(emptySection.locator('.of-app-section__loop-item')).toHaveCount(0);
});

import { expect, test } from '@playwright/test';

const now = '2026-05-11T00:00:00Z';

const appResponse = {
  app: {
    id: 'event-demo-app',
    name: 'Workshop Event Demo',
    slug: 'workshop-event-demo',
    description: 'Runtime event engine smoke.',
    status: 'published',
    pages: [
      {
        id: 'main',
        name: 'Main',
        path: '/',
        description: '',
        visible: true,
        layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '960px' },
        widgets: [
          {
            id: 'event-buttons',
            widget_type: 'button_group',
            title: 'Event Buttons',
            description: '',
            position: { x: 0, y: 0, width: 4, height: 2 },
            props: {
              buttons: [
                {
                  id: 'plan-run',
                  label: 'Plan run',
                  on_click_kind: 'none',
                  action_type_id: '',
                  parameter_defaults: {},
                  default_layout: 'form',
                  switch_layout: false,
                  conditional_visibility: false,
                },
              ],
              orientation: 'horizontal',
              fill_horizontal: true,
            },
            binding: null,
            events: [
              {
                id: 'button-params',
                trigger: 'click',
                action: 'set_parameters',
                label: 'Button payload stored',
                config: { parameters: { source: 'button_group' } },
              },
              {
                id: 'button-navigate',
                trigger: 'click',
                action: 'navigate',
                label: 'Open button target',
                config: { page_id: 'button-target' },
              },
            ],
            children: [],
          },
          {
            id: 'event-table',
            widget_type: 'object_table',
            title: 'Trail Table',
            description: '',
            position: { x: 0, y: 2, width: 8, height: 3 },
            props: {
              source_variable_id: 'trail-set',
              columns: ['label', 'difficulty'],
              default_sort_property: '',
              default_sort_direction: 'asc',
            },
            binding: null,
            events: [
              {
                id: 'table-params',
                trigger: 'select',
                action: 'set_parameters',
                label: 'Trail payload stored',
                config: { parameters: { source: 'object_table' } },
              },
              {
                id: 'table-navigate',
                trigger: 'select',
                action: 'navigate',
                label: 'Open trail target',
                config: { page_id: 'trail-target' },
              },
            ],
            children: [],
          },
        ],
      },
      {
        id: 'button-target',
        name: 'Button Target',
        path: '/button',
        description: '',
        visible: true,
        layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '960px' },
        widgets: [
          {
            id: 'button-target-text',
            widget_type: 'text',
            title: 'Button Result',
            description: '',
            position: { x: 0, y: 0, width: 8, height: 2 },
            props: { content: 'Button event reached {{button_label}} from {{source}}.' },
            binding: null,
            events: [],
            children: [],
          },
        ],
      },
      {
        id: 'trail-target',
        name: 'Trail Target',
        path: '/trail',
        description: '',
        visible: true,
        layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '960px' },
        widgets: [
          {
            id: 'trail-target-text',
            widget_type: 'text',
            title: 'Trail Result',
            description: '',
            position: { x: 0, y: 0, width: 8, height: 2 },
            props: { content: 'Selected trail: {{label}} / {{difficulty}} from {{source}}.' },
            binding: null,
            events: [],
            children: [],
          },
        ],
      },
    ],
    theme: {
      name: 'Event Demo',
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
      max_width: '960px',
      show_branding: false,
      custom_css: null,
      builder_experience: 'workshop',
      ontology_source_type_id: null,
      object_set_variables: [],
      workshop_variables: [
        {
          id: 'trail-set',
          kind: 'object_set_definition',
          name: 'Trails',
          object_type_id: 'Trail',
        },
      ],
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
  embed: { url: '/apps/runtime/workshop-event-demo', iframe_html: '' },
  published_version_number: 1,
  published_at: now,
};

test('runs Button Group and Object Table event chains in declaration order', async ({ page }) => {
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
  await page.route('**/api/v1/apps/public/workshop-event-demo', async (route) => {
    await route.fulfill({ json: appResponse });
  });
  await page.route('**/api/v1/ontology/types/Trail/properties', async (route) => {
    await route.fulfill({
      json: {
        data: [
          { id: 'prop-label', object_type_id: 'Trail', name: 'label', display_name: 'Trail name', description: '', property_type: 'string', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
          { id: 'prop-difficulty', object_type_id: 'Trail', name: 'difficulty', display_name: 'Difficulty', description: '', property_type: 'string', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
        ],
      },
    });
  });
  await page.route('**/api/v1/ontology/types/Trail/objects**', async (route) => {
    await route.fulfill({
      json: {
        data: [
          {
            id: 'trail-1',
            object_type_id: 'Trail',
            properties: { label: 'Mesa Trail', difficulty: 'Easy' },
            created_by: 'e2e',
            created_at: now,
            updated_at: now,
          },
          {
            id: 'trail-2',
            object_type_id: 'Trail',
            properties: { label: 'Walker Ranch', difficulty: 'Hard' },
            created_by: 'e2e',
            created_at: now,
            updated_at: now,
          },
        ],
        total: 2,
        page: 1,
        per_page: 5000,
      },
    });
  });
  await page.route('**/api/v1/ontology/types', async (route) => {
    await route.fulfill({
      json: {
        data: [{ id: 'Trail', api_name: 'Trail', display_name: 'Trail', description: '', plural_display_name: 'Trails', primary_key: 'id', title_property: 'label', icon: null, visibility: 'normal', status: 'active', created_at: now, updated_at: now }],
        total: 1,
        page: 1,
        per_page: 200,
      },
    });
  });

  await page.goto('/apps/runtime/workshop-event-demo');

  await expect(page.getByRole('button', { name: 'Plan run' })).toBeVisible();
  await page.getByRole('button', { name: 'Plan run' }).click();
  await expect(page.getByText('Button event reached Plan run from button_group.')).toBeVisible();

  await page.goto('/apps/runtime/workshop-event-demo');
  await expect(page.getByText('Mesa Trail')).toBeVisible();
  await page.getByText('Mesa Trail').click();
  await expect(page.getByText('Selected trail: Mesa Trail / Easy from object_table.')).toBeVisible();
});

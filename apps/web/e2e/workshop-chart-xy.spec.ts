import { expect, test } from '@playwright/test';

const now = '2026-05-11T00:00:00Z';

const trailEstimateProperties = [
  { id: 'prop-trail', object_type_id: 'TrailEstimate', name: 'trail_name', display_name: 'Trail name', description: '', property_type: 'string', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
  { id: 'prop-difficulty', object_type_id: 'TrailEstimate', name: 'difficulty', display_name: 'Difficulty', description: '', property_type: 'string', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
  { id: 'prop-distance', object_type_id: 'TrailEstimate', name: 'distance_miles', display_name: 'Distance miles', description: '', property_type: 'float', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
  { id: 'prop-pace', object_type_id: 'TrailEstimate', name: 'est_pace_min_per_mile', display_name: 'Est pace min per mile', description: '', property_type: 'float', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
  { id: 'prop-hr', object_type_id: 'TrailEstimate', name: 'est_max_hr', display_name: 'Est max HR', description: '', property_type: 'integer', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
];

const trailEstimates = [
  {
    id: 'estimate-mesa-1',
    object_type_id: 'TrailEstimate',
    properties: { trail_name: 'Mesa Trail', difficulty: 'Moderate', distance_miles: 6.07, est_pace_min_per_mile: 9.2, est_max_hr: 158 },
    created_by: 'e2e',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'estimate-mesa-2',
    object_type_id: 'TrailEstimate',
    properties: { trail_name: 'Mesa Trail', difficulty: 'Moderate', distance_miles: 6.07, est_pace_min_per_mile: 9.8, est_max_hr: 162 },
    created_by: 'e2e',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'estimate-walker',
    object_type_id: 'TrailEstimate',
    properties: { trail_name: 'Walker Ranch', difficulty: 'Hard', distance_miles: 7.76, est_pace_min_per_mile: 11.3, est_max_hr: 172 },
    created_by: 'e2e',
    created_at: now,
    updated_at: now,
  },
];

const appResponse = {
  app: {
    id: 'chart-xy-demo',
    name: 'Chart XY Demo',
    slug: 'chart-xy-demo',
    description: 'Chart XY parity smoke.',
    status: 'published',
    pages: [
      {
        id: 'main',
        name: 'Main',
        path: '/',
        description: '',
        visible: true,
        layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '1040px' },
        widgets: [
          {
            id: 'pace-chart',
            widget_type: 'chart_xy',
            title: 'Trail Pace Chart',
            description: '',
            position: { x: 0, y: 0, width: 7, height: 4 },
            props: {
              layers: [
                {
                  id: 'pace-layer',
                  title: 'Estimated pace',
                  data_input: 'object_set',
                  source_variable_id: 'trail-estimates',
                  object_type_id: 'TrailEstimate',
                  layer_type: 'bar',
                  show_labels: true,
                  x_property: 'trail_name',
                  x_bucketing: 'exact',
                  x_limit: '',
                  series_metric: 'avg',
                  series_property: 'est_pace_min_per_mile',
                  cumulative_sum: false,
                  segment_by: 'difficulty',
                },
              ],
              show_title: true,
              show_legend: true,
              show_tooltips: true,
              bar_orientation: 'horizontal',
              sort_by: 'key_asc',
              output_filter_variable_id: 'chart-filter',
              selected_object_set_variable_id: 'chart-selection',
            },
            binding: null,
            events: [],
            children: [],
          },
          {
            id: 'estimate-table',
            widget_type: 'object_table',
            title: 'Filtered Trail Estimates',
            description: '',
            position: { x: 7, y: 0, width: 5, height: 4 },
            props: {
              source_variable_id: 'filtered-estimates',
              columns: ['trail_name', 'difficulty', 'est_pace_min_per_mile'],
              default_sort_property: 'trail_name',
              default_sort_direction: 'asc',
              multi_select: true,
            },
            binding: null,
            events: [],
            children: [],
          },
        ],
      },
    ],
    theme: {
      name: 'Chart XY Demo',
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
      max_width: '1040px',
      show_branding: false,
      custom_css: null,
      builder_experience: 'workshop',
      ontology_source_type_id: null,
      object_set_variables: [],
      workshop_variables: [
        { id: 'trail-estimates', kind: 'object_set_definition', name: 'Trail Estimates', object_type_id: 'TrailEstimate' },
        { id: 'chart-filter', kind: 'filter_output', name: 'Chart Selection Filter', object_type_id: 'TrailEstimate', source_widget_id: 'pace-chart' },
        { id: 'chart-selection', kind: 'object_set_selection', name: 'Chart Selected Objects', object_type_id: 'TrailEstimate', source_widget_id: 'pace-chart' },
        { id: 'filtered-estimates', kind: 'object_set_definition', name: 'Filtered Estimates', object_type_id: 'TrailEstimate', source_variable_id: 'trail-estimates', filter_variable_id: 'chart-filter' },
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
  embed: { url: '/apps/runtime/chart-xy-demo', iframe_html: '' },
  published_version_number: 1,
  published_at: now,
};

test('Chart XY aggregates TrailEstimate objects and publishes selection as a filter', async ({ page }) => {
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
  await page.route('**/api/v1/apps/public/chart-xy-demo', async (route) => {
    await route.fulfill({ json: appResponse });
  });
  await page.route('**/api/v1/ontology/types', async (route) => {
    await route.fulfill({
      json: {
        data: [{ id: 'TrailEstimate', api_name: 'TrailEstimate', display_name: 'Trail Estimate', description: '', plural_display_name: 'Trail Estimates', primary_key: 'id', title_property: 'trail_name', icon: null, visibility: 'normal', status: 'active', created_at: now, updated_at: now }],
        total: 1,
        page: 1,
        per_page: 200,
      },
    });
  });
  await page.route('**/api/v1/ontology/types/TrailEstimate/properties', async (route) => {
    await route.fulfill({ json: { data: trailEstimateProperties } });
  });
  await page.route('**/api/v1/ontology/types/TrailEstimate/objects**', async (route) => {
    await route.fulfill({ json: { data: trailEstimates, total: trailEstimates.length, page: 1, per_page: 5000 } });
  });
  await page.route('**/api/v1/ontology/types/TrailEstimate/query', async (route) => {
    await route.fulfill({ json: { data: trailEstimates, total: trailEstimates.length, page: 1, per_page: 5000 } });
  });

  await page.goto('/apps/runtime/chart-xy-demo');

  const chart = page.getByRole('heading', { name: 'Trail Pace Chart' }).locator('xpath=ancestor::article');
  await expect(chart.locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select Mesa Trail' })).toBeVisible();

  const table = page.getByRole('heading', { name: 'Filtered Trail Estimates' }).locator('xpath=ancestor::article');
  await expect(table).toContainText('Mesa Trail');
  await expect(table).toContainText('Walker Ranch');

  await page.getByRole('button', { name: 'Select Mesa Trail' }).click();
  await expect(table).toContainText('Mesa Trail');
  await expect(table).not.toContainText('Walker Ranch');

  await page.getByRole('button', { name: 'Clear selection' }).click();
  await expect(table).toContainText('Walker Ranch');
});

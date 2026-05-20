import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';

const now = '2026-05-11T00:00:00Z';
const effortFunctionId = '00000000-0000-0000-0000-000000000015';
const functionObjectTypeId = '00000000-0000-0000-0000-000000000042';

const appResponse = {
  app: {
    id: 'metric-card-demo',
    name: 'Metric Card Demo',
    slug: 'metric-card-demo',
    description: 'Metric Card parity smoke.',
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
            id: 'weather-metrics',
            widget_type: 'metric',
            title: 'Weather Conditions',
            description: '',
            position: { x: 0, y: 0, width: 12, height: 2 },
            props: {
              label: 'Weather Conditions in Boulder, CO',
              layout_style: 'card',
              direction: 'horizontal',
              template: 'stacked',
              metric_size: 'large',
              metrics: [
                {
                  id: 'temperature',
                  label: 'Current Temperature',
                  value_type: 'number',
                  variable_id: 'temperature',
                  format: { kind: 'unit', precision: 0, unit: 'Fahrenheit' },
                  conditional_formatting: [{ operator: 'gte', value: 80, tone: 'warning' }],
                },
                {
                  id: 'wind-speed',
                  label: 'Current Windspeed',
                  value_type: 'number',
                  variable_id: 'wind-speed',
                  format: { kind: 'unit', precision: 1, unit: 'mph' },
                },
                {
                  id: 'wind-direction',
                  label: 'Current Wind Direction',
                  value_type: 'number',
                  variable_id: 'wind-direction',
                  format: { kind: 'unit', precision: 0, suffix: ' degrees' },
                  secondary_metric: {
                    label: 'Summary',
                    value_type: 'string',
                    variable_id: 'condition',
                  },
                },
                {
                  id: 'effort-score',
                  label: 'Estimated Effort',
                  value_type: 'number',
                  variable_id: 'effort-score',
                  format: { kind: 'unit', precision: 0, unit: 'effort' },
                },
              ],
            },
            binding: null,
            events: [],
            children: [],
          },
        ],
      },
    ],
    theme: {
      name: 'Metric Card Demo',
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
        { id: 'temperature', kind: 'numeric', name: 'Current Temperature', object_type_id: '', default_value: 84 },
        { id: 'wind-speed', kind: 'numeric', name: 'Current Windspeed', object_type_id: '', default_value: 4.8 },
        { id: 'wind-direction', kind: 'numeric', name: 'Current Wind Direction', object_type_id: '', default_value: 62 },
        { id: 'condition', kind: 'string', name: 'Weather Summary', object_type_id: '', default_value: 'Clear' },
        {
          id: 'effort-score',
          kind: 'function_output',
          name: 'Effort estimator',
          object_type_id: functionObjectTypeId,
          metadata: {
            function_package_id: effortFunctionId,
            object_type_id: functionObjectTypeId,
            result_path: 'estimated_effort',
            parameters: [
              { name: 'distance_miles', value: 7.76 },
              { name: 'elevation_gain_ft', value: 776 },
              { name: 'temperature_f', variable_id: 'temperature' },
            ],
          },
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
  embed: { url: '/apps/runtime/metric-card-demo', iframe_html: '' },
  published_version_number: 1,
  published_at: now,
};

test('Metric Card renders grouped weather variables with formatting and conditional styling', async ({ page }) => {
  const functionRequests: unknown[] = [];
  await mockAuth(page, { user: { name: 'Trail Runner' } });
  await page.route('**/api/v1/apps/public/metric-card-demo', async (route) => {
    await route.fulfill({ json: appResponse });
  });
  await page.route('**/api/v1/ontology/types', async (route) => {
    await route.fulfill({ json: { data: [], total: 0, page: 1, per_page: 200 } });
  });
  await page.route(`**/api/v1/ontology/functions/${effortFunctionId}/simulate`, async (route) => {
    functionRequests.push(await route.request().postDataJSON());
    await route.fulfill({
      json: {
        package: {
          id: effortFunctionId,
          name: 'estimate_effort',
          version: '1.0.0',
          display_name: 'Estimate Effort',
          runtime: 'python',
          entrypoint: 'handler',
          capabilities: { allow_ontology_read: true, allow_ontology_write: false, allow_ai: false, allow_network: false, timeout_seconds: 5, max_source_bytes: 1024 },
        },
        preview: {},
        result: { estimated_effort: 158 },
      },
    });
  });

  await page.goto('/apps/runtime/metric-card-demo');

  const card = page.getByRole('heading', { name: 'Weather Conditions' }).locator('xpath=ancestor::article');
  await expect(card).toContainText('Weather Conditions in Boulder, CO');
  await expect(card).toContainText('Current Temperature');
  await expect(card).toContainText('84 Fahrenheit');
  await expect(card).toContainText('Current Windspeed');
  await expect(card).toContainText('4.8 mph');
  await expect(card).toContainText('Current Wind Direction');
  await expect(card).toContainText('62 degrees');
  await expect(card).toContainText('Summary: Clear');
  await expect(card).toContainText('Estimated Effort');
  await expect(card).toContainText('158 effort');
  expect(functionRequests.length).toBeGreaterThanOrEqual(1);
  expect(functionRequests[functionRequests.length - 1]).toMatchObject({
    object_type_id: functionObjectTypeId,
    parameters: { distance_miles: 7.76, elevation_gain_ft: 776, temperature_f: 84 },
  });

  const temperatureValue = card.getByText('84 Fahrenheit');
  await expect(temperatureValue).toHaveCSS('color', 'rgb(161, 98, 7)');
});

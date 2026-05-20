import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { defineWorkshopApp, mockWorkshopApp } from './fixtures/workshop';

const effortFunctionId = '00000000-0000-0000-0000-000000000015';
const functionObjectTypeId = '00000000-0000-0000-0000-000000000042';

const appResponse = defineWorkshopApp({
  id: 'metric-card-demo',
  slug: 'metric-card-demo',
  name: 'Metric Card Demo',
  description: 'Metric Card parity smoke.',
  maxWidth: '960px',
  variables: [
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
  pages: [
    {
      id: 'main',
      name: 'Main',
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
});

test('Metric Card renders grouped weather variables with formatting and conditional styling', async ({ page }) => {
  const functionRequests: unknown[] = [];
  await mockAuth(page, { user: { name: 'Trail Runner' } });
  await mockWorkshopApp(page, 'metric-card-demo', appResponse);
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

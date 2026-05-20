import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { defineWorkshopApp, mockWorkshopApp } from './fixtures/workshop';

const now = '2026-05-11T00:00:00Z';

const trailProperties = [
  { id: 'prop-label', object_type_id: 'Trail', name: 'label', display_name: 'Trail name', description: '', property_type: 'string', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
  { id: 'prop-difficulty', object_type_id: 'Trail', name: 'difficulty', display_name: 'Difficulty', description: '', property_type: 'string', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
  { id: 'prop-miles', object_type_id: 'Trail', name: 'miles', display_name: 'Miles', description: '', property_type: 'float', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
];

const trails = [
  { id: 'trail-mesa', object_type_id: 'Trail', properties: { label: 'Mesa Trail', difficulty: 'Moderate', miles: 6.07 }, created_by: 'e2e', created_at: now, updated_at: now },
  { id: 'trail-walker', object_type_id: 'Trail', properties: { label: 'Walker Ranch', difficulty: 'Hard', miles: 7.76 }, created_by: 'e2e', created_at: now, updated_at: now },
  { id: 'trail-betasso', object_type_id: 'Trail', properties: { label: 'Betasso Preserve', difficulty: 'Moderate', miles: 6.41 }, created_by: 'e2e', created_at: now, updated_at: now },
];

const appResponse = defineWorkshopApp({
  id: 'free-form-demo',
  slug: 'free-form-demo',
  name: 'Free-form Demo',
  description: 'Free-form Analysis parity smoke.',
  maxWidth: '1040px',
  variables: [
    { id: 'trail-set', kind: 'object_set_definition', name: 'Trails', object_type_id: 'Trail' },
    { id: 'analysis-output', kind: 'object_set_selection', name: 'Analysis output', object_type_id: 'Trail', source_widget_id: 'trail-analysis' },
  ],
  pages: [
    {
      id: 'main',
      name: 'Main',
      layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '1040px' },
      widgets: [
        {
          id: 'trail-analysis',
          widget_type: 'free_form_analysis',
          title: 'Trail Explorer',
          description: '',
          position: { x: 0, y: 0, width: 8, height: 5 },
          props: {
            source_variable_id: 'trail-set',
            output_variable_id: 'analysis-output',
            enable_path_saving: true,
            cards: [
              { id: 'rows', kind: 'table', title: 'Trail rows', columns: ['label', 'difficulty', 'miles'] },
              { id: 'count', kind: 'metric', title: 'Trail count', metric: 'count' },
            ],
          },
          binding: null,
          events: [],
          children: [],
        },
        {
          id: 'analysis-output-title',
          widget_type: 'object_set_title',
          title: 'Output Trails',
          description: '',
          position: { x: 8, y: 0, width: 4, height: 1 },
          props: {
            source_variable_id: 'analysis-output',
            show_icon: true,
            render_when_empty: true,
            empty_object_type_id: 'Trail',
            empty_title: 'No trails',
          },
          binding: null,
          events: [],
          children: [],
        },
      ],
    },
  ],
});

test('Free-form Analysis lets users filter, chart, save, and publish output object sets', async ({ page }) => {
  await mockAuth(page, { user: { name: 'Trail Runner', email: 'runner@example.com' } });
  await mockWorkshopApp(page, 'free-form-demo', appResponse);
  await page.route('**/api/v1/ontology/types', async (route) => {
    await route.fulfill({
      json: {
        data: [{ id: 'Trail', api_name: 'Trail', display_name: 'Trail', description: '', plural_display_name: 'Trails', primary_key: 'id', title_property: 'label', icon: 'walk', visibility: 'normal', status: 'active', created_at: now, updated_at: now }],
        total: 1,
        page: 1,
        per_page: 200,
      },
    });
  });
  await page.route('**/api/v1/ontology/types/Trail/properties', async (route) => {
    await route.fulfill({ json: { data: trailProperties } });
  });
  await page.route('**/api/v1/ontology/types/Trail/objects**', async (route) => {
    await route.fulfill({ json: { data: trails, total: trails.length, page: 1, per_page: 5000 } });
  });
  await page.route('**/api/v1/ontology/types/Trail/query', async (route) => {
    await route.fulfill({ json: { data: trails, total: trails.length, page: 1, per_page: 5000 } });
  });

  await page.goto('/apps/runtime/free-form-demo');

  const explorer = page.getByRole('heading', { name: 'Trail Explorer' }).locator('xpath=ancestor::article');
  await expect(explorer).toContainText('Mesa Trail');
  await expect(explorer).toContainText('Walker Ranch');
  await expect(explorer).toContainText('3 of 3 objects');

  await explorer.getByRole('button', { name: 'Add filter' }).click();
  await explorer.getByLabel('Filter property').selectOption('difficulty');
  await explorer.getByLabel('Filter operator').selectOption('equals');
  await explorer.getByLabel('Filter value').fill('Hard');
  await expect(explorer).toContainText('1 of 3 objects');
  await expect(explorer).toContainText('Walker Ranch');
  await expect(explorer).not.toContainText('Mesa Trail');

  await explorer.getByRole('button', { name: 'Add bar chart' }).click();
  await explorer.getByLabel('Chart category property').selectOption('label');
  await expect(explorer.locator('canvas')).toBeVisible();

  await explorer.getByRole('button', { name: 'Save path' }).click();
  await expect(explorer.getByRole('button', { name: 'Analysis 1' })).toBeVisible();
  await expect(page.getByTestId('object-set-title-widget')).toContainText('1');
});

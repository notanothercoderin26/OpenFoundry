import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { defineWorkshopApp, mockWorkshopApp } from './fixtures/workshop';

const now = '2026-05-11T00:00:00Z';

const trailProperties = [
  { id: 'prop-label', object_type_id: 'Trail', name: 'label', display_name: 'Trail name', description: '', property_type: 'string', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
  { id: 'prop-difficulty', object_type_id: 'Trail', name: 'difficulty', display_name: 'Difficulty', description: '', property_type: 'string', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
  { id: 'prop-miles', object_type_id: 'Trail', name: 'miles', display_name: 'Distance miles', description: '', property_type: 'float', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
  { id: 'prop-gain', object_type_id: 'Trail', name: 'gain_ft', display_name: 'Elevation gain ft', description: '', property_type: 'integer', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
  { id: 'prop-opened', object_type_id: 'Trail', name: 'opened_on', display_name: 'Opened on', description: '', property_type: 'timestamp', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
  { id: 'prop-notes', object_type_id: 'Trail', name: 'notes', display_name: 'Notes', description: '', property_type: 'string', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
];

const trails = [
  {
    id: 'trail-2',
    object_type_id: 'Trail',
    properties: { label: 'Walker Ranch', difficulty: 'Hard', miles: 7.76, gain_ft: 1527, opened_on: '2026-05-11T08:15:00Z', notes: null },
    created_by: 'e2e',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'trail-1',
    object_type_id: 'Trail',
    properties: { label: 'Mesa Trail', difficulty: 'Easy', miles: 6.07, gain_ft: 801, opened_on: '2026-05-10T06:30:00Z', notes: 'Shaded creek approach' },
    created_by: 'e2e',
    created_at: now,
    updated_at: now,
  },
];

const appResponse = defineWorkshopApp({
  id: 'property-list-demo',
  slug: 'property-list-demo',
  name: 'Property List Demo',
  description: 'Property List parity smoke.',
  maxWidth: '960px',
  variables: [
    { id: 'trail-set', kind: 'object_set_definition', name: 'Trails', object_type_id: 'Trail' },
    { id: 'trail-active', kind: 'object_set_active_object', name: 'Trail Table Active object', object_type_id: 'Trail', source_widget_id: 'trail-table' },
  ],
  pages: [
    {
      id: 'main',
      name: 'Main',
      layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '960px' },
      widgets: [
        {
          id: 'trail-table',
          widget_type: 'object_table',
          title: 'Trail Table',
          description: '',
          position: { x: 0, y: 0, width: 7, height: 4 },
          props: {
            source_variable_id: 'trail-set',
            columns: ['label', 'difficulty', 'miles'],
            default_sort_property: 'label',
            default_sort_direction: 'asc',
            active_object_variable_id: 'trail-active',
          },
          binding: null,
          events: [],
          children: [],
        },
        {
          id: 'trail-details',
          widget_type: 'property_list',
          title: 'Trail Details',
          description: '',
          position: { x: 7, y: 0, width: 5, height: 4 },
          props: {
            source_variable_id: 'trail-active',
            items: [{ id: 'details', property_names: ['label', 'difficulty', 'miles', 'gain_ft', 'opened_on', 'notes'] }],
            properties: ['label', 'difficulty', 'miles', 'gain_ft', 'opened_on', 'notes'],
            number_of_columns: 1,
            hide_nulls: true,
            value_layout: 'below',
            enable_value_wrapping: true,
          },
          binding: null,
          events: [],
          children: [],
        },
      ],
    },
  ],
});

test('Property List renders the active object, selected properties, formatting, and hidden nulls', async ({ page }) => {
  await mockAuth(page, { user: { name: 'Trail Runner' } });
  await mockWorkshopApp(page, 'property-list-demo', appResponse);
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
  await page.route('**/api/v1/ontology/types/Trail/properties', async (route) => {
    await route.fulfill({ json: { data: trailProperties } });
  });
  await page.route('**/api/v1/ontology/types/Trail/objects**', async (route) => {
    await route.fulfill({ json: { data: trails, total: trails.length, page: 1, per_page: 5000 } });
  });

  await page.goto('/apps/runtime/property-list-demo');

  const details = page.locator('section[aria-label="Trail Details"]');
  await expect(details).toContainText('Mesa Trail');
  await expect(details).toContainText('Easy');
  await expect(details).toContainText('6.07');
  await expect(details).toContainText('2026-05-10 06:30');
  await expect(details).toContainText('Notes');
  await expect(details).toContainText('Shaded creek approach');

  await page.getByText('Walker Ranch').click();
  await expect(details).toContainText('Walker Ranch');
  await expect(details).toContainText('Hard');
  await expect(details).toContainText('7.76');
  await expect(details).toContainText('1527');
  await expect(details).toContainText('2026-05-11 08:15');
  await expect(details).not.toContainText('Notes');
});

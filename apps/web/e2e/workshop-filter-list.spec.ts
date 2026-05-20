import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { defineWorkshopApp, mockWorkshopApp } from './fixtures/workshop';

const now = '2026-05-11T00:00:00Z';

const trails = [
  {
    id: 'trail-1',
    object_type_id: 'Trail',
    properties: { label: 'Mesa Trail', difficulty: 'Easy', miles: 6.07 },
    created_by: 'e2e',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'trail-2',
    object_type_id: 'Trail',
    properties: { label: 'Walker Ranch', difficulty: 'Hard', miles: 7.76 },
    created_by: 'e2e',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'trail-3',
    object_type_id: 'Trail',
    properties: { label: 'Green Mountain', difficulty: 'Moderate', miles: 4.86 },
    created_by: 'e2e',
    created_at: now,
    updated_at: now,
  },
];

const appResponse = defineWorkshopApp({
  id: 'filter-list-demo',
  slug: 'filter-list-demo',
  name: 'Filter List Demo',
  description: 'Filter List parity smoke.',
  maxWidth: '1040px',
  pages: [
    {
      id: 'main',
      name: 'Main',
      layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '1040px' },
      widgets: [
        {
          id: 'trail-filters',
          widget_type: 'filter_list',
          title: 'Trail Filters',
          description: '',
          position: { x: 0, y: 0, width: 4, height: 2 },
          props: {
            source_variable_id: 'trail-set',
            output_variable_id: 'trail-filter',
            layout: 'pills',
            allow_add_remove: true,
            filters: [
              {
                id: 'difficulty-filter',
                property_name: 'difficulty',
                display_name: 'Difficulty',
                component: 'multi_select',
                values: ['Easy'],
                range_min: '',
                range_max: '',
              },
            ],
          },
          binding: null,
          events: [],
          children: [],
        },
        {
          id: 'trail-table',
          widget_type: 'object_table',
          title: 'Filtered Trails',
          description: '',
          position: { x: 0, y: 2, width: 8, height: 4 },
          props: {
            source_variable_id: 'filtered-trails',
            columns: ['label', 'difficulty', 'miles'],
            default_sort_property: 'label',
            default_sort_direction: 'asc',
          },
          binding: null,
          events: [],
          children: [],
        },
        {
          id: 'trail-count',
          widget_type: 'object_set_title',
          title: 'Filtered Count',
          description: '',
          position: { x: 8, y: 0, width: 4, height: 1 },
          props: { source_variable_id: 'filtered-trails' },
          binding: null,
          events: [],
          children: [],
        },
        {
          id: 'trail-chart',
          widget_type: 'chart_pie',
          title: 'Difficulty Chart',
          description: '',
          position: { x: 8, y: 1, width: 4, height: 4 },
          props: {
            source_variable_id: 'filtered-trails',
            group_by_property: 'difficulty',
            aggregation_metric: 'count',
            padding: 'compact',
            show_legend: true,
            legend_position: 'next-to',
            legend_anchor: 'right',
          },
          binding: null,
          events: [],
          children: [],
        },
      ],
    },
  ],
  variables: [
    { id: 'trail-set', kind: 'object_set_definition', name: 'Trails', object_type_id: 'Trail' },
    { id: 'trail-filter', kind: 'filter_output', name: 'Trail filter', object_type_id: 'Trail', source_widget_id: 'trail-filters' },
    { id: 'filtered-trails', kind: 'object_set_definition', name: 'Filtered trails', object_type_id: 'Trail', source_variable_id: 'trail-set', filter_variable_id: 'trail-filter' },
  ],
});

test('Filter List defaults, runtime filters, and add/remove controls feed Object Table and Chart', async ({ page }) => {
  await mockAuth(page, { user: { name: 'Trail Runner' } });
  await mockWorkshopApp(page, 'filter-list-demo', appResponse);
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
    await route.fulfill({
      json: {
        data: [
          { id: 'prop-label', object_type_id: 'Trail', name: 'label', display_name: 'Trail name', description: '', property_type: 'string', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
          { id: 'prop-difficulty', object_type_id: 'Trail', name: 'difficulty', display_name: 'Difficulty', description: '', property_type: 'string', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
          { id: 'prop-miles', object_type_id: 'Trail', name: 'miles', display_name: 'Miles', description: '', property_type: 'float', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
        ],
      },
    });
  });
  await page.route('**/api/v1/ontology/types/Trail/objects**', async (route) => {
    if (route.request().method() === 'POST') {
      const body = await route.request().postDataJSON();
      const filtered = applyFilters(body.filters ?? []);
      await route.fulfill({ json: { data: filtered, total: filtered.length, page: 1, per_page: 5000 } });
      return;
    }
    await route.fulfill({ json: { data: trails, total: trails.length, page: 1, per_page: 5000 } });
  });

  await page.goto('/apps/runtime/filter-list-demo');
  const table = page.getByRole('table').first();

  await expect(page.getByLabel('Difficulty values')).toHaveValue('Easy');
  await expect(table).toContainText('Mesa Trail');
  await expect(table).not.toContainText('Walker Ranch');
  await expect(page.locator('canvas')).toBeVisible();

  await page.getByLabel('Difficulty values').fill('Hard');
  await expect(table).toContainText('Walker Ranch');
  await expect(table).not.toContainText('Mesa Trail');
  await expect(page.locator('canvas')).toBeVisible();

  await page.getByRole('button', { name: 'Add filter' }).click();
  await page.getByRole('menu').getByRole('button', { name: /Miles/ }).click();
  await page.getByLabel('Miles minimum').fill('8');
  await expect(table).toContainText('No objects.');

  await page.getByLabel('Remove Miles').click();
  await expect(table).toContainText('Walker Ranch');
});

function applyFilters(filters: Array<{ property_name: string; operator?: string; value: unknown }>) {
  return trails.filter((trail) => filters.every((filter) => {
    const actual = trail.properties[filter.property_name as keyof typeof trail.properties];
    const operator = filter.operator ?? 'equals';
    if (operator === 'contains') return String(actual).toLowerCase().includes(String(filter.value).toLowerCase());
    if (operator === 'in' && Array.isArray(filter.value)) return filter.value.map(String).includes(String(actual));
    if (operator === 'gte') return Number(actual) >= Number(filter.value);
    if (operator === 'lte') return Number(actual) <= Number(filter.value);
    return String(actual) === String(filter.value);
  }));
}

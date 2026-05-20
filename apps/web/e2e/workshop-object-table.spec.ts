import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { defineWorkshopApp, mockWorkshopApp } from './fixtures/workshop';

const now = '2026-05-11T00:00:00Z';

const trailProperties = [
  { id: 'prop-label', object_type_id: 'Trail', name: 'label', display_name: 'Trail name', description: '', property_type: 'string', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
  { id: 'prop-difficulty', object_type_id: 'Trail', name: 'difficulty', display_name: 'Difficulty', description: '', property_type: 'string', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, inline_edit_config: { enabled: true }, created_at: now, updated_at: now },
  { id: 'prop-miles', object_type_id: 'Trail', name: 'miles', display_name: 'Miles', description: '', property_type: 'float', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
];

const trails = [
  {
    id: 'trail-2',
    object_type_id: 'Trail',
    properties: { label: 'Walker Ranch', difficulty: 'Hard', miles: 7.76 },
    created_by: 'e2e',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'trail-1',
    object_type_id: 'Trail',
    properties: { label: 'Mesa Trail', difficulty: 'Easy', miles: 6.07 },
    created_by: 'e2e',
    created_at: now,
    updated_at: now,
  },
];

const reviewAction = {
  id: 'review-trail',
  name: 'review_trail',
  display_name: 'Review trail',
  description: 'Mark a trail as reviewed.',
  object_type_id: 'Trail',
  operation_kind: 'update_object',
  input_schema: [
    { name: 'object', display_name: 'Trail object', description: null, property_type: 'object_reference', required: true, default_value: null },
  ],
  form_schema: { sections: [], parameter_overrides: [] },
  config: { property_mappings: [], static_patch: null },
  confirmation_required: false,
  permission_key: null,
  authorization_policy: {},
  owner_id: '00000000-0000-0000-0000-000000000001',
  created_at: now,
  updated_at: now,
};

const appResponse = defineWorkshopApp({
  slug: 'object-table-demo',
  id: 'object-table-demo',
  name: 'Object Table Demo',
  description: 'Object Table parity smoke.',
  maxWidth: '960px',
  variables: [
    { id: 'trail-set', kind: 'object_set_definition', name: 'Trails', object_type_id: 'Trail' },
    { id: 'trail-active', kind: 'object_set_active_object', name: 'Trail Table Active object', object_type_id: 'Trail', source_widget_id: 'trail-table' },
    { id: 'trail-selected', kind: 'object_set_selection', name: 'Trail Table Selected objects', object_type_id: 'Trail', source_widget_id: 'trail-table' },
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
          position: { x: 0, y: 0, width: 8, height: 4 },
          props: {
            source_variable_id: 'trail-set',
            columns: ['label', 'difficulty', 'miles'],
            default_sort_property: 'label',
            default_sort_direction: 'asc',
            row_height_lines: 2,
            wrap_values: true,
            multi_select: true,
            active_object_variable_id: 'trail-active',
            selected_object_set_variable_id: 'trail-selected',
            enable_inline_edit: true,
            row_actions: [
              {
                id: 'review-row',
                label: 'Review',
                on_click_kind: 'action',
                action_type_id: 'review-trail',
                parameter_defaults: {
                  object: { kind: 'active_object', variable_id: 'trail-active', visibility: 'disabled' },
                },
                default_layout: 'form',
                switch_layout: false,
                conditional_visibility: false,
              },
            ],
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
          position: { x: 8, y: 0, width: 4, height: 2 },
          props: {
            source_variable_id: 'trail-active',
            items: [{ id: 'details', property_names: ['label', 'difficulty'] }],
            number_of_columns: 1,
          },
          binding: null,
          events: [],
          children: [],
        },
        {
          id: 'trail-selected-count',
          widget_type: 'object_set_title',
          title: 'Selected Trails',
          description: '',
          position: { x: 8, y: 2, width: 4, height: 1 },
          props: { source_variable_id: 'trail-selected' },
          binding: null,
          events: [],
          children: [],
        },
        {
          id: 'trail-active-title',
          widget_type: 'object_set_title',
          title: 'Active Trail Title',
          description: '',
          position: { x: 8, y: 3, width: 4, height: 1 },
          props: {
            source_variable_id: 'trail-active',
            contains_single_object: true,
            show_icon: true,
            render_when_empty: true,
            empty_object_type_id: 'Trail',
            empty_title: 'Select a trail',
          },
          binding: null,
          events: [],
          children: [],
        },
      ],
    },
  ],
});

test('Object Table sorts, selects, edits inline, and invokes row actions', async ({ page }) => {
  const inlineEditRequests: unknown[] = [];
  const executeRequests: unknown[] = [];

  await mockAuth(page, { user: { name: 'Trail Runner' } });
  await mockWorkshopApp(page, 'object-table-demo', appResponse);
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
  await page.route('**/api/v1/ontology/types/Trail/properties/prop-difficulty/objects/trail-1/inline-edit', async (route) => {
    inlineEditRequests.push(await route.request().postDataJSON());
    await route.fulfill({
      json: {
        action: null,
        target_object_id: 'trail-1',
        object: { ...trails[1], properties: { ...trails[1].properties, difficulty: 'Moderate' } },
      },
    });
  });
  await page.route('**/api/v1/ontology/actions/review-trail', async (route) => {
    await route.fulfill({ json: reviewAction });
  });
  await page.route('**/api/v1/ontology/actions/review-trail/validate', async (route) => {
    await route.fulfill({ json: { valid: true, errors: [], preview: { kind: 'update_object', target_object_id: 'trail-1' } } });
  });
  await page.route('**/api/v1/ontology/actions/review-trail/execute', async (route) => {
    executeRequests.push(await route.request().postDataJSON());
    await route.fulfill({
      json: {
        action: reviewAction,
        target_object_id: 'trail-1',
        deleted: false,
        preview: { kind: 'update_object', target_object_id: 'trail-1' },
        object: { ...trails[1], properties: { ...trails[1].properties, reviewed: true } },
        link: null,
        result: null,
      },
    });
  });

  await page.goto('/apps/runtime/object-table-demo');

  const table = page.getByRole('table').first();
  await expect(table.locator('tbody tr').first()).toContainText('Mesa Trail');

  await page.getByRole('button', { name: /Trail name/ }).click();
  await expect(table.locator('tbody tr').first()).toContainText('Walker Ranch');
  await page.getByRole('button', { name: /Trail name/ }).click();
  await expect(table.locator('tbody tr').first()).toContainText('Mesa Trail');

  await page.getByText('Walker Ranch').click();
  await expect(page.locator('span').filter({ hasText: /^Hard$/ })).toBeVisible();
  await expect(page.getByTestId('object-set-title-widget').filter({ hasText: 'Walker Ranch' })).toBeVisible();

  await page.getByLabel('Select Mesa Trail').check();
  await page.getByLabel('Select Walker Ranch').check();
  await expect(page.getByText('2 Trails')).toBeVisible();

  await page.getByRole('button', { name: 'Easy' }).dblclick();
  await page.locator('input[type="text"]').fill('Moderate');
  await page.locator('input[type="text"]').press('Enter');
  await expect.poll(() => inlineEditRequests.length).toBe(1);
  expect(inlineEditRequests[0]).toMatchObject({ value: 'Moderate' });
  await expect(page.getByRole('button', { name: 'Moderate' })).toBeVisible();

  await table.locator('tbody tr').filter({ hasText: 'Mesa Trail' }).getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByPlaceholder('Object id')).toHaveValue('trail-1');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect.poll(() => executeRequests.length).toBe(1);
  expect(executeRequests[0]).toMatchObject({
    target_object_id: 'trail-1',
    parameters: { object: 'trail-1' },
  });
});

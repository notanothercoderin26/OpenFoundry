import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { defineWorkshopApp, mockWorkshopApp } from './fixtures/workshop';

const now = '2026-05-11T00:00:00Z';

const editActionType = {
  id: 'edit-weather',
  name: 'edit_weather',
  display_name: 'Edit weather',
  description: 'Update current weather values.',
  object_type_id: 'Weather',
  operation_kind: 'update_object',
  input_schema: [
    { name: 'object', display_name: 'Weather object', description: null, property_type: 'object_reference', required: true, default_value: null },
    { name: 'temperature', display_name: 'Current temperature', description: null, property_type: 'double', required: true, default_value: null },
  ],
  form_schema: { sections: [], parameter_overrides: [] },
  config: {
    property_mappings: [{ property_name: 'temperature', input_name: 'temperature' }],
    static_patch: null,
  },
  confirmation_required: false,
  permission_key: null,
  authorization_policy: {},
  owner_id: '00000000-0000-0000-0000-000000000001',
  created_at: now,
  updated_at: now,
};

const webhookActionType = {
  ...editActionType,
  id: 'notify-weather',
  name: 'notify_weather',
  display_name: 'Notify weather',
  description: 'Send weather notification through a webhook.',
  operation_kind: 'invoke_webhook',
  input_schema: [
    { name: 'message', display_name: 'Message', description: null, property_type: 'string', required: true, default_value: null },
  ],
  config: { webhook_id: 'weather-webhook' },
};

const functionActionType = {
  ...editActionType,
  id: 'score-effort',
  name: 'score_effort',
  display_name: 'Score effort',
  description: 'Run a function-backed action.',
  operation_kind: 'invoke_function',
  input_schema: [
    { name: 'object', display_name: 'Weather object', description: null, property_type: 'object_reference', required: true, default_value: null },
    { name: 'effort', display_name: 'Effort score', description: null, property_type: 'double', required: true, default_value: null },
  ],
  config: { function_package_id: 'effort-function' },
};

const bulkActionType = {
  ...editActionType,
  id: 'bulk-weather',
  name: 'bulk_weather',
  display_name: 'Bulk review weather',
  description: 'Review multiple weather rows.',
  operation_kind: 'update_object',
  input_schema: [
    { name: 'objects', display_name: 'Weather objects', description: null, property_type: 'object_set', required: true, default_value: null },
    { name: 'status', display_name: 'Status', description: null, property_type: 'string', required: true, default_value: null },
  ],
  config: {
    target_object_input_name: 'objects',
    property_mappings: [{ property_name: 'status', input_name: 'status' }],
  },
};

const weatherObjects = [
  { id: 'weather-1', object_type_id: 'Weather', properties: { label: 'Boulder', temperature: 84, status: 'new' }, created_by: 'e2e', created_at: now, updated_at: now },
  { id: 'weather-2', object_type_id: 'Weather', properties: { label: 'Mesa', temperature: 79, status: 'new' }, created_by: 'e2e', created_at: now, updated_at: now },
  { id: 'weather-3', object_type_id: 'Weather', properties: { label: 'Green Mountain', temperature: 72, status: 'new' }, created_by: 'e2e', created_at: now, updated_at: now },
];

const appResponse = defineWorkshopApp({
  slug: 'workshop-action-demo',
  id: 'workshop-action-demo',
  name: 'Workshop Action Demo',
  description: 'Button Group action smoke.',
  maxWidth: '960px',
  themeOverrides: { name: 'Action Demo' },
  variables: [
    { id: 'weather-set', kind: 'object_set_definition', name: 'Weather set', object_type_id: 'Weather', source_widget_id: 'weather-table' },
    { id: 'weather-active', kind: 'object_set_active_object', name: 'Active weather', object_type_id: 'Weather', source_widget_id: 'weather-table' },
    { id: 'weather-selected', kind: 'object_set_selection', name: 'Selected weather', object_type_id: 'Weather', source_widget_id: 'weather-table' },
    { id: 'default-temperature', kind: 'number', name: 'Default temperature', default_value: 84 },
  ],
  pages: [
    {
      id: 'main',
      name: 'Main',
      layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '960px' },
      widgets: [
        {
          id: 'weather-table',
          widget_type: 'object_table',
          title: 'Weather Table',
          description: '',
          position: { x: 0, y: 0, width: 8, height: 4 },
          props: {
            source_variable_id: 'weather-set',
            columns: ['label', 'temperature', 'status'],
            default_sort_property: 'label',
            default_sort_direction: 'asc',
            row_height_lines: 1,
            wrap_values: false,
            multi_select: true,
            active_object_variable_id: 'weather-active',
            selected_object_set_variable_id: 'weather-selected',
            enable_inline_edit: false,
            row_actions: [
              {
                id: 'bulk-row-review',
                label: 'Bulk review',
                on_click_kind: 'action',
                action_type_id: 'bulk-weather',
                parameter_defaults: {
                  objects: { kind: 'variable', variable_id: 'weather-selected', visibility: 'disabled' },
                  status: { kind: 'static', static_value: 'reviewed', visibility: 'visible' },
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
          id: 'weather-actions',
          widget_type: 'button_group',
          title: 'Weather Actions',
          description: '',
          position: { x: 0, y: 0, width: 4, height: 2 },
          props: {
            buttons: [
              {
                id: 'update-weather',
                label: 'Update weather',
                on_click_kind: 'action',
                action_type_id: 'edit-weather',
                parameter_defaults: {
                  object: { kind: 'static', static_value: 'weather-1', visibility: 'disabled' },
                  temperature: { kind: 'variable', variable_id: 'default-temperature', visibility: 'visible' },
                },
                default_layout: 'form',
                switch_layout: false,
                conditional_visibility: false,
              },
              {
                id: 'notify-weather',
                label: 'Notify weather',
                on_click_kind: 'action',
                action_type_id: 'notify-weather',
                parameter_defaults: {
                  message: { kind: 'static', static_value: 'Heat advisory', visibility: 'visible' },
                },
                default_layout: 'form',
                switch_layout: false,
                conditional_visibility: false,
              },
              {
                id: 'score-effort',
                label: 'Score effort',
                on_click_kind: 'action',
                action_type_id: 'score-effort',
                parameter_defaults: {
                  object: { kind: 'static', static_value: 'weather-1', visibility: 'disabled' },
                  effort: { kind: 'static', static_value: '158', visibility: 'visible' },
                },
                default_layout: 'form',
                switch_layout: false,
                conditional_visibility: false,
              },
              {
                id: 'bulk-weather',
                label: 'Bulk review',
                on_click_kind: 'action',
                action_type_id: 'bulk-weather',
                parameter_defaults: {
                  objects: { kind: 'variable', variable_id: 'weather-selected', visibility: 'disabled' },
                  status: { kind: 'static', static_value: 'reviewed', visibility: 'visible' },
                },
                default_layout: 'form',
                switch_layout: false,
                conditional_visibility: false,
              },
            ],
            orientation: 'horizontal',
            fill_horizontal: true,
          },
          binding: null,
          events: [],
          children: [],
        },
      ],
    },
  ],
});

test('renders action forms with defaults, validation errors, and success states', async ({ page }) => {
  const validateRequests: Record<string, unknown[]> = {
    'edit-weather': [],
    'notify-weather': [],
    'score-effort': [],
    'bulk-weather': [],
  };
  const executeRequests: Record<string, unknown[]> = {
    'edit-weather': [],
    'notify-weather': [],
    'score-effort': [],
    'bulk-weather': [],
  };

  await mockAuth(page, { user: { name: 'Trail Runner' } });
  await mockWorkshopApp(page, 'workshop-action-demo', appResponse);
  await page.route('**/api/v1/ontology/types', async (route) => {
    await route.fulfill({
      json: {
        data: [{ id: 'Weather', api_name: 'Weather', display_name: 'Weather', description: '', plural_display_name: 'Weather', primary_key: 'id', title_property: 'label', icon: null, visibility: 'normal', status: 'active', created_at: now, updated_at: now }],
        total: 1,
        page: 1,
        per_page: 200,
      },
    });
  });
  await page.route('**/api/v1/ontology/types/Weather/properties', async (route) => {
    await route.fulfill({
      json: {
        data: [
          { id: 'label', object_type_id: 'Weather', name: 'label', display_name: 'Label', description: '', property_type: 'string', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
          { id: 'temperature', object_type_id: 'Weather', name: 'temperature', display_name: 'Temperature', description: '', property_type: 'double', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
          { id: 'status', object_type_id: 'Weather', name: 'status', display_name: 'Status', description: '', property_type: 'string', required: false, unique_constraint: false, time_dependent: false, default_value: null, validation_rules: null, created_at: now, updated_at: now },
        ],
      },
    });
  });
  await page.route('**/api/v1/ontology/types/Weather/objects?*', async (route) => {
    await route.fulfill({ json: { data: weatherObjects, total: weatherObjects.length, page: 1, per_page: 5000 } });
  });
  await page.route('**/api/v1/ontology/actions/edit-weather', async (route) => {
    await route.fulfill({ json: editActionType });
  });
  await page.route('**/api/v1/ontology/actions/edit-weather/validate', async (route) => {
    const body = await route.request().postDataJSON();
    validateRequests['edit-weather'].push(body);
    if (Number(body.parameters?.temperature) > 100) {
      await route.fulfill({ json: { valid: false, errors: ['Temperature must be below 100.'], preview: null } });
      return;
    }
    await route.fulfill({ json: { valid: true, errors: [], preview: { kind: 'update_object', target_object_id: 'weather-1' } } });
  });
  await page.route('**/api/v1/ontology/actions/edit-weather/execute', async (route) => {
    executeRequests['edit-weather'].push(await route.request().postDataJSON());
    await route.fulfill({
      json: {
        action: editActionType,
        target_object_id: 'weather-1',
        deleted: false,
        preview: { kind: 'update_object', target_object_id: 'weather-1' },
        object: { id: 'weather-1', object_type_id: 'Weather', properties: { temperature: 84 } },
        link: null,
        result: null,
      },
    });
  });
  await page.route('**/api/v1/ontology/actions/notify-weather', async (route) => {
    await route.fulfill({ json: webhookActionType });
  });
  await page.route('**/api/v1/ontology/actions/notify-weather/validate', async (route) => {
    validateRequests['notify-weather'].push(await route.request().postDataJSON());
    await route.fulfill({ json: { valid: true, errors: [], preview: { kind: 'invoke_webhook' } } });
  });
  await page.route('**/api/v1/ontology/actions/notify-weather/execute', async (route) => {
    executeRequests['notify-weather'].push(await route.request().postDataJSON());
    await route.fulfill({
      json: {
        action: webhookActionType,
        target_object_id: null,
        deleted: false,
        preview: { kind: 'invoke_webhook' },
        object: null,
        link: null,
        result: { delivered: true },
      },
    });
  });
  await page.route('**/api/v1/ontology/actions/score-effort', async (route) => {
    await route.fulfill({ json: functionActionType });
  });
  await page.route('**/api/v1/ontology/actions/score-effort/validate', async (route) => {
    validateRequests['score-effort'].push(await route.request().postDataJSON());
    await route.fulfill({ json: { valid: true, errors: [], preview: { kind: 'invoke_function' } } });
  });
  await page.route('**/api/v1/ontology/actions/score-effort/execute', async (route) => {
    executeRequests['score-effort'].push(await route.request().postDataJSON());
    await route.fulfill({
      json: {
        action: functionActionType,
        target_object_id: 'weather-1',
        deleted: false,
        preview: { kind: 'invoke_function' },
        object: null,
        link: null,
        result: { effort_score: 158 },
      },
    });
  });
  await page.route('**/api/v1/ontology/actions/bulk-weather', async (route) => {
    await route.fulfill({ json: bulkActionType });
  });
  await page.route('**/api/v1/ontology/actions/bulk-weather/validate', async (route) => {
    validateRequests['bulk-weather'].push(await route.request().postDataJSON());
    await route.fulfill({ json: { valid: true, errors: [], preview: { kind: 'update_object' } } });
  });
  await page.route('**/api/v1/ontology/actions/bulk-weather/execute-batch', async (route) => {
    executeRequests['bulk-weather'].push(await route.request().postDataJSON());
    await route.fulfill({
      json: {
        action: bulkActionType,
        total: 2,
        succeeded: 1,
        failed: 1,
        results: [
          { target_object_id: 'weather-1', status: 'succeeded', object: { ...weatherObjects[0], properties: { ...weatherObjects[0].properties, status: 'reviewed' } } },
          { target_object_id: 'weather-2', status: 'failed', error: 'object is locked' },
        ],
      },
    });
  });

  await page.goto('/apps/runtime/workshop-action-demo');
  await expect(page.getByText('Boulder')).toBeVisible();
  await page.getByLabel('Select Boulder').check();
  await page.getByLabel('Select Mesa').check();

  await page.getByRole('button', { name: 'Bulk review' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Bulk action over 2 selected objects.')).toBeVisible();
  await expect(page.getByPlaceholder('Weather objects')).toHaveValue(JSON.stringify(['weather-1', 'weather-2']));
  await expect(page.getByPlaceholder('Status')).toHaveValue('reviewed');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('alert')).toContainText('weather-2: object is locked');
  await expect(page.getByText('1 of 2 actions applied; 1 failed.')).toBeVisible();
  await expect.poll(() => executeRequests['bulk-weather'].length).toBe(1);
  expect(executeRequests['bulk-weather'][0]).toMatchObject({
    target_object_ids: ['weather-1', 'weather-2'],
    parameters: { objects: ['weather-1', 'weather-2'], status: 'reviewed' },
  });
  await page.getByRole('dialog').getByLabel('Close').click();

  await page.getByRole('button', { name: 'Update weather' }).click();

  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByPlaceholder('Object id')).toHaveValue('weather-1');
  await expect(page.getByPlaceholder('Current temperature')).toHaveValue('84');
  await page.getByPlaceholder('Current temperature').fill('101');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('alert')).toContainText('Temperature must be below 100.');
  await expect.poll(() => executeRequests['edit-weather'].length).toBe(0);

  await page.getByPlaceholder('Current temperature').fill('84');
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page.getByRole('status')).toContainText('Edits successfully applied.');
  await expect.poll(() => validateRequests['edit-weather'].length).toBe(2);
  await expect.poll(() => executeRequests['edit-weather'].length).toBe(1);
  expect(validateRequests['edit-weather'][1]).toMatchObject({
    target_object_id: 'weather-1',
    parameters: { object: 'weather-1', temperature: 84 },
  });
  expect(executeRequests['edit-weather'][0]).toMatchObject({
    target_object_id: 'weather-1',
    parameters: { object: 'weather-1', temperature: 84 },
  });
  await page.getByLabel('Dismiss').click();

  await page.getByRole('button', { name: 'Notify weather' }).click();
  await expect(page.getByPlaceholder('Message')).toHaveValue('Heat advisory');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('status')).toContainText('Webhook action successfully applied.');
  await expect.poll(() => executeRequests['notify-weather'].length).toBe(1);
  expect(executeRequests['notify-weather'][0]).toMatchObject({
    parameters: { message: 'Heat advisory' },
  });
  await page.getByLabel('Dismiss').click();

  await page.getByRole('button', { name: 'Score effort' }).click();
  await expect(page.getByPlaceholder('Object id')).toHaveValue('weather-1');
  await expect(page.getByPlaceholder('Effort score')).toHaveValue('158');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('status')).toContainText('Function action successfully applied.');
  await expect.poll(() => executeRequests['score-effort'].length).toBe(1);
  expect(executeRequests['score-effort'][0]).toMatchObject({
    target_object_id: 'weather-1',
    parameters: { object: 'weather-1', effort: 158 },
  });
});

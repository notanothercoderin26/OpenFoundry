import { test, expect } from './fixtures/base';
import { mockAuth, E2E_NOW } from './fixtures/mocks';
import { defineWorkshopApp, mockWorkshopApp, textWidget } from './fixtures/workshop';

const now = E2E_NOW;

const appResponse = defineWorkshopApp({
  slug: 'workshop-event-demo',
  name: 'Workshop Event Demo',
  description: 'Runtime event engine smoke.',
  maxWidth: '960px',
  themeOverrides: { name: 'Event Demo' },
  pages: [
    {
      id: 'main',
      name: 'Main',
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
      layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '960px' },
      widgets: [
        textWidget('button-target-text', 'Button event reached {{button_label}} from {{source}}.', {
          title: 'Button Result',
          position: { x: 0, y: 0, width: 8, height: 2 },
        }),
      ],
    },
    {
      id: 'trail-target',
      name: 'Trail Target',
      path: '/trail',
      layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '960px' },
      widgets: [
        textWidget('trail-target-text', 'Selected trail: {{label}} / {{difficulty}} from {{source}}.', {
          title: 'Trail Result',
          position: { x: 0, y: 0, width: 8, height: 2 },
        }),
      ],
    },
  ],
  variables: [
    {
      id: 'trail-set',
      kind: 'object_set_definition',
      name: 'Trails',
      object_type_id: 'Trail',
    },
  ],
});

test('runs Button Group and Object Table event chains in declaration order', async ({ page }) => {
  await mockAuth(page, { user: { name: 'Trail Runner' } });
  await mockWorkshopApp(page, 'workshop-event-demo', appResponse);
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

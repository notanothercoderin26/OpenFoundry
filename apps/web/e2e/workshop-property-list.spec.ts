import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';

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

const appResponse = {
  app: {
    id: 'property-list-demo',
    name: 'Property List Demo',
    slug: 'property-list-demo',
    description: 'Property List parity smoke.',
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
    theme: {
      name: 'Property List Demo',
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
        { id: 'trail-set', kind: 'object_set_definition', name: 'Trails', object_type_id: 'Trail' },
        { id: 'trail-active', kind: 'object_set_active_object', name: 'Trail Table Active object', object_type_id: 'Trail', source_widget_id: 'trail-table' },
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
  embed: { url: '/apps/runtime/property-list-demo', iframe_html: '' },
  published_version_number: 1,
  published_at: now,
};

test('Property List renders the active object, selected properties, formatting, and hidden nulls', async ({ page }) => {
  await mockAuth(page, { user: { name: 'Trail Runner' } });
  await page.route('**/api/v1/apps/public/property-list-demo', async (route) => {
    await route.fulfill({ json: appResponse });
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

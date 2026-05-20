import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';

const now = '2026-05-11T00:00:00Z';

const commitScenarioAction = {
  id: 'commit-scenario',
  name: 'commit_scenario',
  display_name: 'Commit scenario',
  description: 'Apply a what-if scenario to the ontology action path.',
  object_type_id: 'TrailScenario',
  operation_kind: 'invoke_webhook',
  input_schema: [
    { name: 'scenario_payload', display_name: 'Scenario payload', description: null, property_type: 'json', required: true, default_value: null },
  ],
  form_schema: { sections: [], parameter_overrides: [] },
  config: { webhook_id: 'scenario-webhook' },
  confirmation_required: false,
  permission_key: null,
  authorization_policy: {},
  owner_id: '00000000-0000-0000-0000-000000000001',
  created_at: now,
  updated_at: now,
};

const appResponse = {
  app: {
    id: 'scenario-demo',
    name: 'Scenario Demo',
    slug: 'scenario-demo',
    description: 'Scenario parity smoke.',
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
            id: 'trail-scenario',
            widget_type: 'scenario',
            title: 'Trail Scenario',
            description: '',
            position: { x: 0, y: 0, width: 5, height: 3 },
            props: {
              headline: 'Trail weather scenario',
              output_variable_id: 'scenario-values',
              apply_label: 'Apply scenario',
              reset_label: 'Reset',
              summary_template: 'Demand multiplier: {{demand_multiplier}}',
              parameters: [
                { name: 'demand_multiplier', label: 'Demand multiplier', type: 'number', default_value: '1.0', description: 'Demand adjustment for planning.' },
                { name: 'temperature_delta', label: 'Temperature delta', type: 'number', default_value: '0', description: 'Degrees added to baseline.' },
              ],
            },
            binding: null,
            events: [],
            children: [],
          },
          {
            id: 'scenario-table',
            widget_type: 'table',
            title: 'Scenario comparison',
            description: '',
            position: { x: 5, y: 0, width: 7, height: 3 },
            props: {
              columns: [
                { key: 'metric', label: 'Metric' },
                { key: 'value', label: 'Value' },
              ],
              page_size: 10,
            },
            binding: {
              source_type: 'query',
              source_id: '',
              query_text: "select 'Baseline demand' as metric, '100' as value union all select 'Scenario demand', '{{demand_multiplier}}'",
              limit: 10,
            },
            events: [],
            children: [],
          },
          {
            id: 'scenario-actions',
            widget_type: 'button_group',
            title: 'Scenario actions',
            description: '',
            position: { x: 0, y: 3, width: 5, height: 2 },
            props: {
              buttons: [
                {
                  id: 'commit-scenario-button',
                  label: 'Commit scenario',
                  on_click_kind: 'action',
                  action_type_id: 'commit-scenario',
                  parameter_defaults: {
                    scenario_payload: { kind: 'variable', variable_id: 'scenario-values', visibility: 'visible' },
                  },
                  default_layout: 'form',
                  switch_layout: false,
                  conditional_visibility: false,
                },
              ],
              orientation: 'horizontal',
              fill_horizontal: false,
            },
            binding: null,
            events: [],
            children: [],
          },
        ],
      },
    ],
    theme: {
      name: 'Scenario Demo',
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
        {
          id: 'scenario-values',
          kind: 'scenario',
          name: 'Scenario values',
          object_type_id: '',
          source_widget_id: 'trail-scenario',
          metadata: {
            parameters: [
              { name: 'demand_multiplier', label: 'Demand multiplier', default_value: '1.0' },
              { name: 'temperature_delta', label: 'Temperature delta', default_value: '0' },
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
  embed: { url: '/apps/runtime/scenario-demo', iframe_html: '' },
  published_version_number: 1,
  published_at: now,
};

test('Scenario variables update comparisons and can seed an Ontology action form', async ({ page }) => {
  const executed: unknown[] = [];
  const querySql: string[] = [];
  await mockAuth(page, { user: { name: 'Trail Runner' } });
  await page.route('**/api/v1/apps/public/scenario-demo', async (route) => {
    await route.fulfill({ json: appResponse });
  });
  await page.route('**/api/v1/ontology/types', async (route) => {
    await route.fulfill({ json: { data: [], total: 0, page: 1, per_page: 200 } });
  });
  await page.route('**/api/v1/queries/execute', async (route) => {
    const body = await route.request().postDataJSON();
    const sql = String(body.sql ?? '');
    querySql.push(sql);
    const match = sql.match(/Scenario demand', '([^']*)'/);
    const multiplier = Number(match?.[1] || 1);
    const scenarioDemand = Number.isFinite(multiplier) ? Math.round(100 * multiplier) : 100;
    await route.fulfill({
      json: {
        columns: [{ name: 'metric', data_type: 'text' }, { name: 'value', data_type: 'text' }],
        rows: [['Baseline demand', '100'], ['Scenario demand', String(scenarioDemand)]],
        total_rows: 2,
        execution_time_ms: 1,
      },
    });
  });
  await page.route('**/api/v1/ontology/actions/commit-scenario', async (route) => {
    await route.fulfill({ json: commitScenarioAction });
  });
  await page.route('**/api/v1/ontology/actions/commit-scenario/validate', async (route) => {
    await route.fulfill({ json: { valid: true, errors: [], preview: { kind: 'invoke_webhook' } } });
  });
  await page.route('**/api/v1/ontology/actions/commit-scenario/execute', async (route) => {
    executed.push(await route.request().postDataJSON());
    await route.fulfill({
      json: {
        action: commitScenarioAction,
        target_object_id: null,
        deleted: false,
        preview: { kind: 'invoke_webhook' },
        object: null,
        link: null,
        result: { committed: true },
      },
    });
  });

  await page.goto('/apps/runtime/scenario-demo');

  const table = page.getByRole('heading', { name: 'Scenario comparison' }).locator('xpath=ancestor::article');
  await expect(table).toContainText('Baseline demand');
  await expect(table).toContainText('Scenario demand');
  await expect(table).toContainText('100');

  await page.getByLabel('Demand multiplier').fill('1.30');
  await page.getByLabel('Temperature delta').fill('8');
  await page.getByRole('button', { name: 'Apply scenario' }).click();
  await expect(table).toContainText('130');
  await expect.poll(() => querySql.some((sql) => sql.includes("'1.30'"))).toBe(true);

  await page.getByRole('button', { name: 'Commit scenario' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const payloadField = page.getByPlaceholder('Scenario payload');
  await expect(payloadField).toHaveValue(/"demand_multiplier":"1\.30"/);
  await expect(payloadField).toHaveValue(/"temperature_delta":"8"/);
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page.getByRole('status')).toContainText('Webhook action successfully applied.');
  await expect.poll(() => executed.length).toBe(1);
  expect(executed[0]).toMatchObject({
    parameters: {
      scenario_payload: {
        kind: 'scenario',
        status: 'applied',
        values: { demand_multiplier: '1.30', temperature_delta: '8' },
      },
    },
  });
  await page.getByLabel('Dismiss').click();

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(table).toContainText('100');
});

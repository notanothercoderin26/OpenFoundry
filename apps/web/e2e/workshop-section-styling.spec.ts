import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';

const now = '2026-05-11T00:00:00Z';

const appResponse = {
  app: {
    id: 'section-styling-demo',
    name: 'Section Styling Demo',
    slug: 'section-styling-demo',
    description: 'Exercises section style formatting (header format / borders / padding / bg).',
    status: 'published',
    pages: [
      {
        id: 'main',
        name: 'Main',
        path: '/',
        description: '',
        visible: true,
        layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '1280px' },
        widgets: [],
        sections: [
          {
            id: 'bordered-compact',
            title: 'Bordered + compact',
            description: '',
            layout: { kind: 'grid', columns: 12, gap: '8px', max_width: '' },
            widgets: [
              {
                id: 't1',
                widget_type: 'text',
                title: '',
                description: '',
                position: { x: 0, y: 0, width: 12, height: 1 },
                props: { content: 'Bordered section body' },
                binding: null,
                events: [],
                children: [],
              },
            ],
            sections: [],
            props: {
              header_format: 'block',
              border_style: 'bordered',
              padding: 'compact',
              background_color: 'gray-1',
            },
            visible: true,
          },
          {
            id: 'shadow-large',
            title: 'Shadow + large padding',
            description: '',
            layout: { kind: 'grid', columns: 12, gap: '8px', max_width: '' },
            widgets: [
              {
                id: 't2',
                widget_type: 'text',
                title: '',
                description: '',
                position: { x: 0, y: 0, width: 12, height: 1 },
                props: { content: 'Shadow section body' },
                binding: null,
                events: [],
                children: [],
              },
            ],
            sections: [],
            props: {
              header_format: 'floating',
              border_style: 'outer-shadow',
              padding: 'large',
              background_color: '#0f172a',
            },
            visible: true,
          },
          {
            id: 'contained-custom',
            title: 'Contained header + custom padding',
            description: '',
            layout: { kind: 'grid', columns: 12, gap: '8px', max_width: '' },
            widgets: [
              {
                id: 't3',
                widget_type: 'text',
                title: '',
                description: '',
                position: { x: 0, y: 0, width: 12, height: 1 },
                props: { content: 'Contained section body' },
                binding: null,
                events: [],
                children: [],
              },
            ],
            sections: [],
            props: {
              header_format: 'contained',
              padding: 'custom',
              padding_custom: { top: 8, right: 24, bottom: 8, left: 24 },
              background_color: 'gray-2',
            },
            visible: true,
          },
          {
            id: 'borderless-transparent',
            title: 'Borderless + transparent',
            description: '',
            layout: { kind: 'grid', columns: 12, gap: '8px', max_width: '' },
            widgets: [
              {
                id: 't4',
                widget_type: 'text',
                title: '',
                description: '',
                position: { x: 0, y: 0, width: 12, height: 1 },
                props: { content: 'Borderless section body' },
                binding: null,
                events: [],
                children: [],
              },
            ],
            sections: [],
            props: {
              border_style: 'borderless',
              padding: 'none',
              background_color: 'transparent',
            },
            visible: true,
          },
        ],
        overlays: [],
      },
    ],
    theme: {
      name: 'Section Styling Demo',
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
      max_width: '1280px',
      show_branding: false,
      custom_css: null,
      builder_experience: 'workshop',
      ontology_source_type_id: null,
      object_set_variables: [],
      workshop_variables: [],
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
  embed: { url: '/apps/runtime/section-styling-demo', iframe_html: '' },
  published_version_number: 1,
  published_at: now,
};

test('Workshop section style formatting honors header format / border style / padding presets / bg', async ({ page }) => {
  await mockAuth(page, { user: { name: 'Styling Tester' } });
  await page.route('**/api/v1/apps/public/section-styling-demo', async (route) => {
    await route.fulfill({ json: appResponse });
  });

  await page.goto('/apps/runtime/section-styling-demo');

  const bordered = page.locator('section[data-section-id="bordered-compact"]');
  await expect(bordered).toHaveClass(/of-app-section--border-bordered/);
  await expect(bordered).toHaveClass(/of-app-section--padding-compact/);
  await expect(bordered).toHaveClass(/of-app-section--bg-gray-1/);
  await expect(bordered).toHaveCSS('padding', '16px');
  // border-bordered → 1px solid; computed shows non-empty border-top-width.
  await expect(bordered).toHaveCSS('border-top-style', 'solid');

  const shadow = page.locator('section[data-section-id="shadow-large"]');
  await expect(shadow).toHaveClass(/of-app-section--border-outer-shadow/);
  await expect(shadow).toHaveClass(/of-app-section--padding-large/);
  await expect(shadow).toHaveCSS('padding', '40px 62px');
  // Hex bg applied inline → rgb output.
  await expect(shadow).toHaveCSS('background-color', 'rgb(15, 23, 42)');
  // outer-shadow → box-shadow not "none".
  const shadowValue = await shadow.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadowValue).not.toBe('none');

  const contained = page.locator('section[data-section-id="contained-custom"]');
  await expect(contained).toHaveClass(/of-app-section--header-contained/);
  await expect(contained).toHaveCSS('padding', '8px 24px');
  // In contained mode, the header should be a DESCENDANT of the body container.
  const headerInsideBody = await contained
    .locator('.of-app-section__body > .of-app-section__header')
    .count();
  expect(headerInsideBody).toBe(1);

  const borderless = page.locator('section[data-section-id="borderless-transparent"]');
  await expect(borderless).toHaveClass(/of-app-section--border-borderless/);
  await expect(borderless).toHaveClass(/of-app-section--padding-none/);
  await expect(borderless).toHaveClass(/of-app-section--bg-transparent/);
  await expect(borderless).toHaveCSS('padding', '0px');
  // borderless → border-width 0 and box-shadow none.
  await expect(borderless).toHaveCSS('border-top-width', '0px');
  const borderlessShadow = await borderless.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(borderlessShadow).toBe('none');
});

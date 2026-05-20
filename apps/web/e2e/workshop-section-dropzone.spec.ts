import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';

const now = '2026-05-11T00:00:00Z';

const appResponse = {
  app: {
    id: 'dropzone-demo',
    name: 'Drop Zone Demo',
    slug: 'dropzone-demo',
    description: 'Section drop zone fires on_drop events that navigate.',
    status: 'published',
    pages: [
      {
        id: 'page-home',
        name: 'Home',
        path: '/',
        description: '',
        visible: true,
        layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '1280px' },
        widgets: [
          {
            id: 'home-text',
            widget_type: 'text',
            title: '',
            description: '',
            position: { x: 0, y: 0, width: 12, height: 1 },
            props: { content: 'Home body — drop something on the section below.' },
            binding: null,
            events: [],
            children: [],
          },
        ],
        sections: [
          {
            id: 'drop-target',
            title: 'Drop target',
            description: '',
            layout: { kind: 'grid', columns: 12, gap: '8px', max_width: '' },
            widgets: [
              {
                id: 'drop-hint',
                widget_type: 'text',
                title: '',
                description: '',
                position: { x: 0, y: 0, width: 12, height: 1 },
                props: { content: 'Drag something here.' },
                binding: null,
                events: [],
                children: [],
              },
            ],
            sections: [],
            props: { drop_zone: true },
            events: [
              {
                id: 'on-drop-navigate',
                trigger: 'on_drop',
                action: 'navigate',
                label: 'Navigate on drop',
                config: { page_id: 'page-detail' },
              },
            ],
            visible: true,
          },
        ],
        overlays: [],
      },
      {
        id: 'page-detail',
        name: 'Detail',
        path: '/detail',
        description: '',
        visible: true,
        layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '1280px' },
        widgets: [
          {
            id: 'detail-text',
            widget_type: 'text',
            title: '',
            description: '',
            position: { x: 0, y: 0, width: 12, height: 1 },
            props: { content: 'Detail page body — drop succeeded.' },
            binding: null,
            events: [],
            children: [],
          },
        ],
        sections: [],
        overlays: [],
      },
    ],
    theme: {
      name: 'Drop Zone Demo',
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
      home_page_id: 'page-home',
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
  embed: { url: '/apps/runtime/dropzone-demo', iframe_html: '' },
  published_version_number: 1,
  published_at: now,
};

test('Section drop zone exposes drop attributes and dispatches on_drop event when dropped', async ({ page }) => {
  await mockAuth(page, { user: { name: 'Drop Tester', email: 'runner@example.com' } });
  await page.route('**/api/v1/apps/public/dropzone-demo', async (route) => {
    await route.fulfill({ json: appResponse });
  });

  await page.goto('/apps/runtime/dropzone-demo');

  const section = page.locator('section[data-section-id="drop-target"]');
  await expect(section).toHaveClass(/of-app-section--drop-zone/);
  await expect(section).toHaveAttribute('data-drop-zone', 'true');
  await expect(section).toHaveAttribute('data-drop-target', 'false');

  // Initially home page is visible; detail page is not.
  await expect(page.getByText('Home body — drop something on the section below.')).toBeVisible();
  await expect(page.getByText('Detail page body — drop succeeded.')).toHaveCount(0);

  // Dispatch a synthetic drop event on the section with a JSON payload. We
  // synthesise it directly instead of using Playwright dragTo because the
  // HTML5 drag-and-drop API is hard to drive reliably across browsers — this
  // exercises the runtime listener exactly the same way a real drop would.
  await section.evaluate((element) => {
    const dt = new DataTransfer();
    dt.setData('application/json', JSON.stringify({ id: 'trail-1', label: 'Mesa Trail' }));
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', { value: dt });
    element.dispatchEvent(dropEvent);
  });

  // The on_drop event navigates to the detail page. Wait for the new content.
  await expect(page.getByText('Detail page body — drop succeeded.')).toBeVisible();
});

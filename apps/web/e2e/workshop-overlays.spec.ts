import { expect, test } from '@playwright/test';

const now = '2026-05-11T00:00:00Z';

const appResponse = {
  app: {
    id: 'overlays-demo',
    name: 'Overlays Demo',
    slug: 'overlays-demo',
    description: 'Exercises drawer + modal overlays driven by primitive variables.',
    status: 'published',
    pages: [
      {
        id: 'main',
        name: 'Main',
        path: '/',
        description: '',
        visible: true,
        layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '1280px' },
        widgets: [
          {
            id: 'open-drawer',
            widget_type: 'button',
            title: '',
            description: '',
            position: { x: 0, y: 0, width: 4, height: 1 },
            props: { label: 'Open drawer' },
            binding: null,
            events: [
              {
                id: 'open-drawer-evt',
                trigger: 'click',
                action: 'set_variable',
                label: 'Show drawer',
                config: { variable_id: 'show_drawer', value: true },
              },
            ],
            children: [],
          },
          {
            id: 'open-modal',
            widget_type: 'button',
            title: '',
            description: '',
            position: { x: 4, y: 0, width: 4, height: 1 },
            props: { label: 'Open modal' },
            binding: null,
            events: [
              {
                id: 'open-modal-evt',
                trigger: 'click',
                action: 'set_variable',
                label: 'Show modal',
                config: { variable_id: 'show_modal', value: true },
              },
            ],
            children: [],
          },
        ],
        sections: [],
        overlays: [
          {
            id: 'drawer-overlay',
            name: 'Detail drawer',
            overlay_type: 'drawer',
            visible_variable_id: 'show_drawer',
            layout: { kind: 'grid', columns: 12, gap: '12px', max_width: '' },
            widgets: [
              {
                id: 'drawer-text',
                widget_type: 'text',
                title: '',
                description: '',
                position: { x: 0, y: 0, width: 12, height: 1 },
                props: { content: 'Drawer body content' },
                binding: null,
                events: [],
                children: [],
              },
            ],
            sections: [],
            props: {
              position: 'right',
              size: 400,
              header_enabled: true,
              header_title: 'Trail detail',
              header_icon: '★',
              close_on_backdrop_click: false,
              show_backdrop: true,
              backdrop_opacity: 0.4,
            },
            events: [
              {
                id: 'drawer-close-evt',
                trigger: 'on_close',
                action: 'set_variable',
                label: 'Track drawer closed',
                config: { variable_id: 'drawer_was_closed', value: true },
              },
            ],
          },
          {
            id: 'modal-overlay',
            name: 'Confirm modal',
            overlay_type: 'modal',
            visible_variable_id: 'show_modal',
            layout: { kind: 'grid', columns: 12, gap: '12px', max_width: '' },
            widgets: [
              {
                id: 'modal-text',
                widget_type: 'text',
                title: '',
                description: '',
                position: { x: 0, y: 0, width: 12, height: 1 },
                props: { content: 'Modal body content' },
                binding: null,
                events: [],
                children: [],
              },
            ],
            sections: [],
            props: {
              size: 520,
              header_enabled: true,
              header_title: 'Are you sure?',
              close_on_backdrop_click: true,
              show_backdrop: true,
            },
          },
        ],
      },
    ],
    theme: {
      name: 'Overlays Demo',
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
      workshop_variables: [
        { id: 'show_drawer', kind: 'primitive', name: 'Show drawer', default_value: false },
        { id: 'show_modal', kind: 'primitive', name: 'Show modal', default_value: false },
        { id: 'drawer_was_closed', kind: 'primitive', name: 'Drawer closed tracker', default_value: false },
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
  embed: { url: '/apps/runtime/overlays-demo', iframe_html: '' },
  published_version_number: 1,
  published_at: now,
};

test('Workshop renders drawer and modal overlays driven by primitive variables', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('of_access_token', 'e2e-token');
  });
  await page.route('**/api/v1/auth/bootstrap-status', async (route) => {
    await route.fulfill({ json: { requires_initial_admin: false } });
  });
  await page.route('**/api/v1/users/me', async (route) => {
    await route.fulfill({
      json: {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'runner@example.com',
        name: 'Overlay Tester',
        is_active: true,
        roles: ['admin'],
        groups: [],
        permissions: ['*'],
        organization_id: null,
        attributes: {},
        mfa_enabled: false,
        mfa_enforced: false,
        auth_source: 'local',
        created_at: now,
      },
    });
  });
  await page.route('**/api/v1/apps/public/overlays-demo', async (route) => {
    await route.fulfill({ json: appResponse });
  });

  await page.goto('/apps/runtime/overlays-demo');

  const drawer = page.locator('[data-testid="app-overlay-drawer-overlay"]');
  const modal = page.locator('[data-testid="app-overlay-modal-overlay"]');

  // Neither overlay is visible initially.
  await expect(drawer).toHaveCount(0);
  await expect(modal).toHaveCount(0);

  // Open the drawer.
  await page.getByRole('button', { name: 'Open drawer' }).click();
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('Trail detail');
  await expect(drawer).toContainText('Drawer body content');

  // The drawer is configured close_on_backdrop_click: false — click backdrop does NOT close.
  const drawerBackdrop = page.locator('.of-app-overlay-backdrop[data-overlay-id="drawer-overlay"]');
  await drawerBackdrop.click({ position: { x: 5, y: 5 } });
  await expect(drawer).toBeVisible();

  // ESC closes it.
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);

  // Reopen and close via the X button.
  await page.getByRole('button', { name: 'Open drawer' }).click();
  await expect(drawer).toBeVisible();
  await page.locator('[data-testid="app-overlay-drawer-overlay-close"]').click();
  await expect(drawer).toHaveCount(0);

  // Open the modal — close-on-backdrop is true.
  await page.getByRole('button', { name: 'Open modal' }).click();
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Are you sure?');
  await expect(modal).toContainText('Modal body content');

  // Click the backdrop area (anywhere outside the modal box).
  const modalBackdrop = page.locator('.of-app-overlay-backdrop[data-overlay-id="modal-overlay"]');
  await modalBackdrop.click({ position: { x: 5, y: 5 } });
  await expect(modal).toHaveCount(0);
});

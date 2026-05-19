import { expect, test } from '@playwright/test';

const now = '2026-05-11T00:00:00Z';

function buildApp(workshopHeader: Record<string, unknown>) {
  return {
    app: {
      id: 'header-config-demo',
      name: 'Header Config Demo',
      slug: 'header-config-demo',
      description: 'Header subtitle text',
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
              id: 'placeholder',
              widget_type: 'text',
              title: '',
              description: '',
              position: { x: 0, y: 0, width: 12, height: 1 },
              props: { content: 'Body content' },
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
        name: 'Header Config Demo',
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
        workshop_header: workshopHeader,
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
    embed: { url: '/apps/runtime/header-config-demo', iframe_html: '' },
    published_version_number: 1,
    published_at: now,
  };
}

async function stubCommonRoutes(page: import('@playwright/test').Page) {
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
        name: 'Header Tester',
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
}

test('Workshop runtime renders a vertical, collapsible, icon-mode header with favoriting', async ({ page }) => {
  const appResponse = buildApp({
    orientation: 'vertical',
    width: 240,
    collapsible: true,
    collapsed_by_default: false,
    logo_mode: 'icon',
    icon: '★',
    icon_color: '#f59e0b',
    title: 'Mission Control',
    title_color: '#10b981',
    background_color: '#0f172a',
    favoriting_enabled: true,
    logo_position: 'top',
  });
  await stubCommonRoutes(page);
  await page.route('**/api/v1/apps/public/header-config-demo', async (route) => {
    await route.fulfill({ json: appResponse });
  });

  await page.goto('/apps/runtime/header-config-demo');

  const root = page.locator('.of-app-runtime').first();
  await expect(root).toHaveClass(/of-app-runtime--header-vertical/);

  const header = page.locator('header.of-app-runtime__header').first();
  await expect(header).toHaveAttribute('data-orientation', 'vertical');
  await expect(header).toHaveAttribute('data-collapsed', 'false');
  await expect(header).toContainText('Mission Control');

  // Icon-mode logo renders the icon character with its color applied.
  const icon = header.locator('.of-app-runtime__logo-icon');
  await expect(icon).toHaveAttribute('data-icon', '★');
  await expect(icon).toHaveCSS('color', 'rgb(245, 158, 11)');

  // Title color applied inline.
  const title = header.locator('h2').first();
  await expect(title).toHaveCSS('color', 'rgb(16, 185, 129)');

  // Vertical width honored.
  await expect(header).toHaveCSS('width', '240px');

  // Favoriting button starts un-favorited; click toggles aria-pressed.
  const favoriteBtn = header.locator('[data-testid="app-header-favorite"]');
  await expect(favoriteBtn).toHaveAttribute('aria-pressed', 'false');
  await favoriteBtn.click();
  await expect(favoriteBtn).toHaveAttribute('aria-pressed', 'true');

  // Collapse toggle reduces width and removes brand text.
  const collapseBtn = header.locator('[data-testid="app-header-collapse-toggle"]');
  await collapseBtn.click();
  await expect(header).toHaveAttribute('data-collapsed', 'true');
  await expect(header).toHaveCSS('width', '60px');
  await expect(header.locator('.of-app-runtime__brand-text')).toHaveCount(0);

  // Expand again restores full width.
  await collapseBtn.click();
  await expect(header).toHaveAttribute('data-collapsed', 'false');
  await expect(header).toHaveCSS('width', '240px');
});

test('Workshop runtime hides header entirely when workshop_header.enabled is false', async ({ page }) => {
  await stubCommonRoutes(page);
  await page.route('**/api/v1/apps/public/header-config-demo', async (route) => {
    await route.fulfill({ json: buildApp({ enabled: false }) });
  });

  await page.goto('/apps/runtime/header-config-demo');

  await expect(page.locator('header.of-app-runtime__header')).toHaveCount(0);
  // Body still renders.
  await expect(page.getByText('Body content')).toBeVisible();
});

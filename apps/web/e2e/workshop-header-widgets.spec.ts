import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { defineWorkshopApp, mockWorkshopApp } from './fixtures/workshop';

const appResponse = defineWorkshopApp({
  id: 'header-widgets-demo',
  slug: 'header-widgets-demo',
  name: 'Header Widgets Demo',
  description: 'Button Group widget pinned to a vertical collapsible header.',
  now: '2026-05-20T00:00:00Z',
  pages: [
    {
      id: 'main',
      name: 'Main',
      widgets: [
        {
          id: 'body-text',
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
  settingsOverrides: {
    workshop_header: {
      enabled: true,
      orientation: 'vertical',
      width: 220,
      collapsible: true,
      collapsed_by_default: false,
      title: 'Workspace',
      widgets: [
        {
          id: 'header-btn-group',
          widget_type: 'button_group',
          title: 'Header buttons',
          description: '',
          position: { x: 0, y: 0, width: 12, height: 1 },
          props: {
            orientation: 'vertical',
            buttons: [
              {
                id: 'btn-home',
                label: 'Home',
                on_click_kind: 'none',
                action_type_id: '',
                parameter_defaults: {},
                default_layout: 'form',
                switch_layout: false,
                conditional_visibility: false,
                icon: '⌂',
              },
              {
                id: 'btn-search',
                label: 'Search',
                on_click_kind: 'none',
                action_type_id: '',
                parameter_defaults: {},
                default_layout: 'form',
                switch_layout: false,
                conditional_visibility: false,
                icon: '🔍',
              },
            ],
          },
          binding: null,
          events: [],
          children: [],
        },
      ],
    },
  },
});

test('A Button Group pinned to the header renders labels normally and switches to icons when collapsed', async ({ page }) => {
  await mockAuth(page, { user: { name: 'Header Tester' } });
  await mockWorkshopApp(page, 'header-widgets-demo', appResponse);

  await page.goto('/apps/runtime/header-widgets-demo');

  const header = page.locator('header.of-app-runtime__header').first();
  await expect(header).toHaveAttribute('data-orientation', 'vertical');
  await expect(header).toHaveAttribute('data-collapsed', 'false');

  const widgetsContainer = header.locator('[data-testid="app-header-widgets"]');
  await expect(widgetsContainer).toBeVisible();
  await expect(widgetsContainer).toContainText('Home');
  await expect(widgetsContainer).toContainText('Search');

  // Expand → no collapsed-mode markers.
  const collapsedBtnGroup = page.locator('[data-testid="button-group-header-btn-group-collapsed"]');
  await expect(collapsedBtnGroup).toHaveCount(0);

  // Collapse the header.
  const collapseBtn = header.locator('[data-testid="app-header-collapse-toggle"]');
  await collapseBtn.click();
  await expect(header).toHaveAttribute('data-collapsed', 'true');

  // The Button Group should now render in icon-only mode, with the configured
  // icons surfaced via data-button-id markers and accessible name preserved.
  await expect(collapsedBtnGroup).toBeVisible();
  await expect(collapsedBtnGroup).toHaveAttribute('data-collapsed', 'true');

  const homeBtn = collapsedBtnGroup.locator('[data-button-id="btn-home"]');
  const searchBtn = collapsedBtnGroup.locator('[data-button-id="btn-search"]');
  await expect(homeBtn).toBeVisible();
  await expect(searchBtn).toBeVisible();
  await expect(homeBtn).toHaveAttribute('data-icon-only', 'true');
  await expect(homeBtn).toHaveAttribute('aria-label', 'Home');
  await expect(homeBtn).toHaveAttribute('title', 'Home');
  await expect(homeBtn).toContainText('⌂');
  await expect(searchBtn).toContainText('🔍');

  // Expand again → labels return, icon-only markers disappear.
  await collapseBtn.click();
  await expect(header).toHaveAttribute('data-collapsed', 'false');
  await expect(collapsedBtnGroup).toHaveCount(0);
  await expect(widgetsContainer).toContainText('Home');
  await expect(widgetsContainer).toContainText('Search');
});

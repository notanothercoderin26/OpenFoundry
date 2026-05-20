import type { Page } from '@playwright/test';

import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { defineWorkshopApp, mockWorkshopApp } from './fixtures/workshop';

function buildApp(workshopHeader: Record<string, unknown>) {
  return defineWorkshopApp({
    id: 'header-config-demo',
    slug: 'header-config-demo',
    name: 'Header Config Demo',
    description: 'Header subtitle text',
    pages: [
      {
        id: 'main',
        name: 'Main',
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
        overlays: [],
      },
    ],
    settingsOverrides: { workshop_header: workshopHeader },
  });
}

async function stubCommonRoutes(page: Page) {
  await mockAuth(page, { user: { name: 'Header Tester', email: 'runner@example.com' } });
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
  await mockWorkshopApp(page, 'header-config-demo', appResponse);

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
  await mockWorkshopApp(page, 'header-config-demo', buildApp({ enabled: false }));

  await page.goto('/apps/runtime/header-config-demo');

  await expect(page.locator('header.of-app-runtime__header')).toHaveCount(0);
  // Body still renders.
  await expect(page.getByText('Body content')).toBeVisible();
});

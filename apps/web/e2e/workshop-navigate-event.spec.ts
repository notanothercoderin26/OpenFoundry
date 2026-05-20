import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { defineWorkshopApp, mockWorkshopApp, textWidget, buttonWidget } from './fixtures/workshop';

const appResponse = defineWorkshopApp({
  id: 'navigate-demo',
  slug: 'navigate-demo',
  name: 'Navigate Demo',
  description: 'Exercises widget-level navigate events between pages.',
  pages: [
    {
      id: 'page-home',
      name: 'Home',
      widgets: [
        textWidget('home-text', 'Home page body'),
        buttonWidget('go-detail', 'Open detail page', [
          {
            id: 'nav-evt',
            trigger: 'click',
            action: 'navigate',
            label: 'Navigate to detail',
            config: { page_id: 'page-detail' },
          },
        ], { position: { x: 0, y: 1, width: 4, height: 1 } }),
      ],
      overlays: [],
    },
    {
      id: 'page-detail',
      name: 'Detail',
      path: '/detail',
      widgets: [textWidget('detail-text', 'Detail page body')],
      overlays: [],
    },
  ],
});

test('A button widget can navigate between Workshop pages via the navigate event', async ({ page }) => {
  await mockAuth(page, { user: { name: 'Nav Tester', email: 'runner@example.com' } });
  await mockWorkshopApp(page, 'navigate-demo', appResponse);

  await page.goto('/apps/runtime/navigate-demo');

  await expect(page.getByText('Home page body')).toBeVisible();
  await expect(page.getByText('Detail page body')).toHaveCount(0);

  await page.getByRole('button', { name: 'Open detail page' }).click();

  await expect(page.getByText('Detail page body')).toBeVisible();
  await expect(page.getByText('Home page body')).toHaveCount(0);
});

import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { defineWorkshopApp, mockWorkshopApp, textWidget } from './fixtures/workshop';

function buildApp(status: 'draft' | 'published', content: string) {
  return defineWorkshopApp({
    slug: 'preview-demo',
    name: 'Workshop Preview Demo',
    description: 'Draft preview semantics smoke.',
    status,
    maxWidth: '900px',
    publishedVersionId: status === 'published' ? 'version-1' : null,
    pages: [
      {
        id: 'main',
        name: 'Main',
        layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '900px' },
        widgets: [
          textWidget(
            `${status}-text`,
            content,
            {
              title: status === 'draft' ? 'Draft Text' : 'Published Text',
              position: { x: 0, y: 0, width: 8, height: 2 },
            },
          ),
        ],
      },
    ],
    variables: [
      {
        id: 'runner-param',
        kind: 'runtime_parameter',
        name: 'Runner',
        metadata: { runtime_parameter: 'runner' },
      },
    ],
    themeOverrides: { name: 'Preview Demo' },
    settingsOverrides: {
      workshop_header: { title: 'Workshop Preview Demo', icon: 'cube', color: '#0f766e' },
    },
  });
}

test('editor preview renders draft state while public runtime renders the published snapshot', async ({ page }) => {
  await mockAuth(page, { user: { name: 'Trail Runner', email: 'runner@example.com' } });
  const draftApp = buildApp('draft', 'Draft preview {{runner}}.');
  await page.route('**/api/v1/apps/preview-demo-app', async (route) => {
    await route.fulfill({ json: draftApp.app });
  });
  await mockWorkshopApp(page, 'preview-demo', buildApp('published', 'Published runtime {{runner}}.'));
  await page.route('**/api/v1/ontology/types**', async (route) => {
    await route.fulfill({ json: { data: [], total: 0, page: 1, per_page: 200 } });
  });

  await page.goto('/apps/preview-demo-app/workshop?mode=preview&runner=Mesa');
  await expect(page.locator('.of-app-runtime__page')).toBeVisible();
  await expect(page.getByText('Draft preview Mesa.')).toBeVisible();
  await expect(page.getByText('Published runtime Mesa.')).toHaveCount(0);

  await page.goto('/apps/runtime/preview-demo?runner=Mesa');
  await expect(page.locator('.of-app-runtime__page')).toBeVisible();
  await expect(page.getByText('Published runtime Mesa.')).toBeVisible();
  await expect(page.getByText('Draft preview Mesa.')).toHaveCount(0);
});

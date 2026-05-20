import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { defineWorkshopApp, mockWorkshopApp } from './fixtures/workshop';

const appResponse = defineWorkshopApp({
  id: 'dropzone-demo',
  slug: 'dropzone-demo',
  name: 'Drop Zone Demo',
  description: 'Section drop zone fires on_drop events that navigate.',
  pages: [
    {
      id: 'page-home',
      name: 'Home',
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
});

test('Section drop zone exposes drop attributes and dispatches on_drop event when dropped', async ({ page }) => {
  await mockAuth(page, { user: { name: 'Drop Tester', email: 'runner@example.com' } });
  await mockWorkshopApp(page, 'dropzone-demo', appResponse);

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

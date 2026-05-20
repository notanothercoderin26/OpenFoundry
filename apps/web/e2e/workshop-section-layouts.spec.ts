import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { defineWorkshopApp, mockWorkshopApp } from './fixtures/workshop';

const appResponse = defineWorkshopApp({
  id: 'section-layouts-demo',
  slug: 'section-layouts-demo',
  name: 'Section Layouts Demo',
  description: 'Exercises Columns / Rows / nested section layouts in the runtime.',
  pages: [
    {
      id: 'main',
      name: 'Main',
      widgets: [],
      sections: [
        {
          id: 'top-columns',
          title: 'Side by side',
          description: 'Columns layout splits the section into two flex columns.',
          layout: { kind: 'columns', columns: 12, gap: '16px', max_width: '' },
          widgets: [
            {
              id: 'left-text',
              widget_type: 'text',
              title: 'Left',
              description: '',
              position: { x: 0, y: 0, width: 6, height: 2 },
              props: { content: 'Left column content' },
              binding: null,
              events: [],
              children: [],
            },
            {
              id: 'right-text',
              widget_type: 'text',
              title: 'Right',
              description: '',
              position: { x: 6, y: 0, width: 6, height: 2 },
              props: { content: 'Right column content' },
              binding: null,
              events: [],
              children: [],
            },
          ],
          sections: [],
          visible: true,
        },
        {
          id: 'stacked-rows',
          title: 'Stacked',
          description: 'Rows layout stacks the children vertically and enables scrolling.',
          layout: { kind: 'rows', columns: 12, gap: '12px', max_width: '', scrollable: true },
          widgets: [
            {
              id: 'row-1',
              widget_type: 'text',
              title: 'Row 1',
              description: '',
              position: { x: 0, y: 0, width: 12, height: 1 },
              props: { content: 'First row' },
              binding: null,
              events: [],
              children: [],
            },
            {
              id: 'row-2',
              widget_type: 'text',
              title: 'Row 2',
              description: '',
              position: { x: 0, y: 1, width: 12, height: 1 },
              props: { content: 'Second row' },
              binding: null,
              events: [],
              children: [],
            },
          ],
          sections: [],
          visible: true,
        },
        {
          id: 'hidden-section',
          title: 'Hidden',
          description: 'This section has visible=false and must not render.',
          layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '' },
          widgets: [],
          sections: [],
          visible: false,
        },
      ],
      overlays: [],
    },
  ],
});

test('Workshop runtime renders Columns and Rows section layouts and skips hidden sections', async ({ page }) => {
  await mockAuth(page, { user: { name: 'Layout Tester', email: 'runner@example.com' } });
  await mockWorkshopApp(page, 'section-layouts-demo', appResponse);

  await page.goto('/apps/runtime/section-layouts-demo');

  const columnsSection = page.locator('section[data-section-id="top-columns"]');
  const rowsSection = page.locator('section[data-section-id="stacked-rows"]');
  const hiddenSection = page.locator('section[data-section-id="hidden-section"]');

  await expect(columnsSection).toHaveAttribute('data-section-kind', 'columns');
  await expect(columnsSection).toContainText('Left column content');
  await expect(columnsSection).toContainText('Right column content');

  await expect(rowsSection).toHaveAttribute('data-section-kind', 'rows');
  await expect(rowsSection).toContainText('First row');
  await expect(rowsSection).toContainText('Second row');

  await expect(hiddenSection).toHaveCount(0);

  const columnsBody = columnsSection.locator('.of-app-section__body').first();
  await expect(columnsBody).toHaveCSS('flex-direction', 'row');

  const rowsBody = rowsSection.locator('.of-app-section__body').first();
  await expect(rowsBody).toHaveCSS('flex-direction', 'column');
  await expect(rowsBody).toHaveCSS('overflow-y', 'auto');
});

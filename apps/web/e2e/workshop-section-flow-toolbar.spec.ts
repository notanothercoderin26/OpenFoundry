import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { defineWorkshopApp, mockWorkshopApp } from './fixtures/workshop';

const appResponse = defineWorkshopApp({
  id: 'section-flow-toolbar-demo',
  slug: 'section-flow-toolbar-demo',
  name: 'Flow + Toolbar Demo',
  description: 'Exercises the Flow and Toolbar section layouts in the runtime.',
  pages: [
    {
      id: 'main',
      name: 'Main',
      widgets: [],
      sections: [
        {
          id: 'top-toolbar',
          title: '',
          description: '',
          layout: { kind: 'toolbar', columns: 12, gap: '12px', max_width: '' },
          widgets: [
            {
              id: 'toolbar-text-1',
              widget_type: 'text',
              title: '',
              description: '',
              position: { x: 0, y: 0, width: 2, height: 1 },
              props: { content: 'Toolbar item A' },
              binding: null,
              events: [],
              children: [],
            },
            {
              id: 'toolbar-text-2',
              widget_type: 'text',
              title: '',
              description: '',
              position: { x: 2, y: 0, width: 2, height: 1 },
              props: { content: 'Toolbar item B' },
              binding: null,
              events: [],
              children: [],
            },
            {
              id: 'toolbar-text-3',
              widget_type: 'text',
              title: '',
              description: '',
              position: { x: 4, y: 0, width: 2, height: 1 },
              props: { content: 'Toolbar item C' },
              binding: null,
              events: [],
              children: [],
            },
          ],
          sections: [],
          visible: true,
        },
        {
          id: 'flow-feed',
          title: 'Activity feed',
          description: 'Flow sections scroll vertically.',
          layout: { kind: 'flow', columns: 12, gap: '10px', max_width: '' },
          widgets: Array.from({ length: 8 }, (_, index) => ({
            id: `feed-item-${index + 1}`,
            widget_type: 'text',
            title: '',
            description: '',
            position: { x: 0, y: index, width: 12, height: 1 },
            props: { content: `Feed item ${index + 1}` },
            binding: null,
            events: [],
            children: [],
          })),
          sections: [],
          visible: true,
        },
      ],
      overlays: [],
    },
  ],
});

test('Workshop Flow and Toolbar section layouts render with correct flex semantics', async ({ page }) => {
  await mockAuth(page, { user: { name: 'Layout Tester', email: 'runner@example.com' } });
  await mockWorkshopApp(page, 'section-flow-toolbar-demo', appResponse);

  await page.goto('/apps/runtime/section-flow-toolbar-demo');

  const toolbarSection = page.locator('section[data-section-id="top-toolbar"]');
  const flowSection = page.locator('section[data-section-id="flow-feed"]');

  await expect(toolbarSection).toHaveAttribute('data-section-kind', 'toolbar');
  await expect(flowSection).toHaveAttribute('data-section-kind', 'flow');

  const toolbarBody = toolbarSection.locator('.of-app-section__body').first();
  await expect(toolbarBody).toHaveCSS('flex-direction', 'row');
  await expect(toolbarBody).toHaveCSS('flex-wrap', 'wrap');
  await expect(toolbarBody).toHaveCSS('align-items', 'center');
  await expect(toolbarSection).toContainText('Toolbar item A');
  await expect(toolbarSection).toContainText('Toolbar item B');
  await expect(toolbarSection).toContainText('Toolbar item C');

  const flowBody = flowSection.locator('.of-app-section__body').first();
  await expect(flowBody).toHaveCSS('flex-direction', 'column');
  await expect(flowBody).toHaveCSS('overflow-y', 'auto');
  await expect(flowSection).toContainText('Feed item 1');
  await expect(flowSection).toContainText('Feed item 8');
});

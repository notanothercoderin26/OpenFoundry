import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { defineWorkshopApp, mockWorkshopApp } from './fixtures/workshop';

const trailItems = [
  { id: 'mesa', label: 'Mesa Trail', miles: 6.07 },
  { id: 'walker', label: 'Walker Ranch', miles: 7.76 },
  { id: 'flatirons', label: 'Flatirons Loop', miles: 4.2 },
];

const appResponse = defineWorkshopApp({
  id: 'section-loop-demo',
  slug: 'section-loop-demo',
  name: 'Section Loop Demo',
  description: 'Exercises the Loop section layout over an inline array.',
  pages: [
    {
      id: 'main',
      name: 'Main',
      widgets: [],
      sections: [
        {
          id: 'trail-cards',
          title: 'Trails',
          description: 'One card per trail.',
          layout: { kind: 'loop', columns: 12, gap: '12px', max_width: '' },
          widgets: [
            {
              id: 'trail-card-text',
              widget_type: 'text',
              title: '',
              description: '',
              position: { x: 0, y: 0, width: 12, height: 1 },
              props: { content: 'Trail #{{item_index}} — {{item.label}} ({{item.miles}} mi)' },
              binding: null,
              events: [],
              children: [],
            },
          ],
          sections: [],
          props: {
            loop_items: trailItems,
            loop_max_items: 10,
          },
          visible: true,
        },
        {
          id: 'empty-loop',
          title: 'No data',
          description: '',
          layout: { kind: 'loop', columns: 12, gap: '12px', max_width: '' },
          widgets: [],
          sections: [],
          props: { loop_items: [], loop_empty_message: 'No trails to display yet.' },
          visible: true,
        },
      ],
      overlays: [],
    },
  ],
});

test('Workshop Loop layout renders one iteration per inline item with interpolated content', async ({ page }) => {
  await mockAuth(page, { user: { name: 'Layout Tester', email: 'runner@example.com' } });
  await mockWorkshopApp(page, 'section-loop-demo', appResponse);

  await page.goto('/apps/runtime/section-loop-demo');

  const loopSection = page.locator('section[data-section-id="trail-cards"]');
  await expect(loopSection).toHaveAttribute('data-section-kind', 'loop');

  const iterations = loopSection.locator('.of-app-section__loop-item');
  await expect(iterations).toHaveCount(3);

  // Each iteration interpolates {{item_index}} and {{item.label}}.
  await expect(iterations.nth(0)).toContainText('Trail #0 — Mesa Trail (6.07 mi)');
  await expect(iterations.nth(1)).toContainText('Trail #1 — Walker Ranch (7.76 mi)');
  await expect(iterations.nth(2)).toContainText('Trail #2 — Flatirons Loop (4.2 mi)');

  // data-loop-index attribute is present per iteration for selectors / a11y.
  await expect(iterations.nth(0)).toHaveAttribute('data-loop-index', '0');
  await expect(iterations.nth(2)).toHaveAttribute('data-loop-index', '2');

  // Empty loop falls back to the configurable empty message.
  const emptySection = page.locator('section[data-section-id="empty-loop"]');
  await expect(emptySection).toContainText('No trails to display yet.');
  await expect(emptySection.locator('.of-app-section__loop-item')).toHaveCount(0);
});

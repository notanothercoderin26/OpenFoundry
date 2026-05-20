import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { defineWorkshopApp, mockWorkshopApp } from './fixtures/workshop';

const appResponse = defineWorkshopApp({
  id: 'section-tabs-demo',
  slug: 'section-tabs-demo',
  name: 'Section Tabs Demo',
  description: 'Exercises the Tabs section layout in the runtime.',
  pages: [
    {
      id: 'main',
      name: 'Main',
      widgets: [],
      sections: [
        {
          id: 'workflow-tabs',
          title: 'Workflow',
          description: 'Switch between workflow stages.',
          layout: { kind: 'tabs', columns: 12, gap: '16px', max_width: '' },
          widgets: [],
          sections: [
            {
              id: 'tab-overview',
              title: 'Overview',
              description: '',
              layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '' },
              widgets: [
                {
                  id: 'overview-text',
                  widget_type: 'text',
                  title: 'Overview body',
                  description: '',
                  position: { x: 0, y: 0, width: 12, height: 1 },
                  props: { content: 'Overview pane is open.' },
                  binding: null,
                  events: [],
                  children: [],
                },
              ],
              sections: [],
              visible: true,
            },
            {
              id: 'tab-details',
              title: 'Details',
              description: '',
              layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '' },
              widgets: [
                {
                  id: 'details-text',
                  widget_type: 'text',
                  title: 'Details body',
                  description: '',
                  position: { x: 0, y: 0, width: 12, height: 1 },
                  props: { content: 'Details pane is open.' },
                  binding: null,
                  events: [],
                  children: [],
                },
              ],
              sections: [],
              visible: true,
            },
            {
              id: 'tab-hidden',
              title: 'Hidden',
              description: '',
              layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '' },
              widgets: [],
              sections: [],
              visible: false,
            },
            {
              id: 'tab-untitled',
              title: '',
              description: '',
              layout: { kind: 'grid', columns: 12, gap: '16px', max_width: '' },
              widgets: [
                {
                  id: 'untitled-text',
                  widget_type: 'text',
                  title: 'Fallback label body',
                  description: '',
                  position: { x: 0, y: 0, width: 12, height: 1 },
                  props: { content: 'Untitled tab content.' },
                  binding: null,
                  events: [],
                  children: [],
                },
              ],
              sections: [],
              visible: true,
            },
          ],
          visible: true,
        },
      ],
      overlays: [],
    },
  ],
});

test('Workshop Tabs layout switches active tab and hides invisible tabs', async ({ page }) => {
  await mockAuth(page, { user: { name: 'Layout Tester' } });
  await mockWorkshopApp(page, 'section-tabs-demo', appResponse);

  await page.goto('/apps/runtime/section-tabs-demo');

  const tabsSection = page.locator('section[data-section-id="workflow-tabs"]');
  await expect(tabsSection).toHaveAttribute('data-section-kind', 'tabs');

  const tablist = tabsSection.getByRole('tablist');
  await expect(tablist).toBeVisible();

  const overviewTab = tablist.locator('[data-tab-id="tab-overview"]');
  const detailsTab = tablist.locator('[data-tab-id="tab-details"]');
  const hiddenTab = tablist.locator('[data-tab-id="tab-hidden"]');
  const untitledTab = tablist.locator('[data-tab-id="tab-untitled"]');

  // Hidden tab is not rendered at all.
  await expect(hiddenTab).toHaveCount(0);

  // Untitled tab falls back to "Tab 3" (after Overview, Details — Hidden is skipped).
  await expect(untitledTab).toHaveText('Tab 3');

  // First visible tab is active by default.
  await expect(overviewTab).toHaveAttribute('aria-selected', 'true');
  await expect(detailsTab).toHaveAttribute('aria-selected', 'false');
  await expect(tabsSection).toContainText('Overview pane is open.');
  await expect(tabsSection).not.toContainText('Details pane is open.');

  // Click Details and verify the panel swaps.
  await detailsTab.click();
  await expect(detailsTab).toHaveAttribute('aria-selected', 'true');
  await expect(overviewTab).toHaveAttribute('aria-selected', 'false');
  await expect(tabsSection).toContainText('Details pane is open.');
  await expect(tabsSection).not.toContainText('Overview pane is open.');

  // Click the untitled tab and verify its content renders.
  await untitledTab.click();
  await expect(untitledTab).toHaveAttribute('aria-selected', 'true');
  await expect(tabsSection).toContainText('Untitled tab content.');
});

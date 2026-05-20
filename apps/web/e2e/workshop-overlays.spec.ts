import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import {
  buttonWidget,
  defineWorkshopApp,
  mockWorkshopApp,
  textWidget,
} from './fixtures/workshop';
import { WorkshopRuntimePage } from './pages/WorkshopRuntimePage';

const slug = 'overlays-demo';

const appResponse = defineWorkshopApp({
  slug,
  id: 'overlays-demo',
  name: 'Overlays Demo',
  description: 'Exercises drawer + modal overlays driven by primitive variables.',
  status: 'published',
  variables: [
    { id: 'show_drawer', kind: 'primitive', name: 'Show drawer', default_value: false },
    { id: 'show_modal', kind: 'primitive', name: 'Show modal', default_value: false },
    {
      id: 'drawer_was_closed',
      kind: 'primitive',
      name: 'Drawer closed tracker',
      default_value: false,
    },
  ],
  pages: [
    {
      id: 'main',
      name: 'Main',
      path: '/',
      description: '',
      visible: true,
      widgets: [
        buttonWidget('open-drawer', 'Open drawer', [
          {
            id: 'open-drawer-evt',
            trigger: 'click',
            action: 'set_variable',
            label: 'Show drawer',
            config: { variable_id: 'show_drawer', value: true },
          },
        ], { position: { x: 0, y: 0, width: 4, height: 1 } }),
        buttonWidget('open-modal', 'Open modal', [
          {
            id: 'open-modal-evt',
            trigger: 'click',
            action: 'set_variable',
            label: 'Show modal',
            config: { variable_id: 'show_modal', value: true },
          },
        ], { position: { x: 4, y: 0, width: 4, height: 1 } }),
      ],
      overlays: [
        {
          id: 'drawer-overlay',
          name: 'Detail drawer',
          overlay_type: 'drawer',
          visible_variable_id: 'show_drawer',
          layout: { kind: 'grid', columns: 12, gap: '12px', max_width: '' },
          widgets: [textWidget('drawer-text', 'Drawer body content')],
          sections: [],
          props: {
            size: 480,
            position: 'right',
            header_enabled: true,
            header_title: 'Trail detail',
            close_on_backdrop_click: false,
            show_backdrop: true,
          },
        },
        {
          id: 'modal-overlay',
          name: 'Confirm modal',
          overlay_type: 'modal',
          visible_variable_id: 'show_modal',
          layout: { kind: 'grid', columns: 12, gap: '12px', max_width: '' },
          widgets: [textWidget('modal-text', 'Modal body content')],
          sections: [],
          props: {
            size: 520,
            header_enabled: true,
            header_title: 'Are you sure?',
            close_on_backdrop_click: true,
            show_backdrop: true,
          },
        },
      ],
    },
  ],
});

test('Workshop renders drawer and modal overlays driven by primitive variables', async ({ page }) => {
  await mockAuth(page, { user: { name: 'Overlay Tester' } });
  await mockWorkshopApp(page, slug, appResponse);

  const workshop = new WorkshopRuntimePage(page, slug);
  await workshop.goto();

  await workshop.expectOverlayHidden('drawer-overlay');
  await workshop.expectOverlayHidden('modal-overlay');

  // Open the drawer.
  await workshop.button('Open drawer').click();
  await workshop.expectOverlayVisible('drawer-overlay');
  await expect(workshop.overlay('drawer-overlay')).toContainText('Trail detail');
  await expect(workshop.overlay('drawer-overlay')).toContainText('Drawer body content');

  // The drawer is configured close_on_backdrop_click: false — click backdrop does NOT close.
  await workshop.overlayBackdrop('drawer-overlay').click({ position: { x: 5, y: 5 } });
  await workshop.expectOverlayVisible('drawer-overlay');

  // ESC closes it.
  await page.keyboard.press('Escape');
  await workshop.expectOverlayHidden('drawer-overlay');

  // Reopen and close via the X button.
  await workshop.button('Open drawer').click();
  await workshop.expectOverlayVisible('drawer-overlay');
  await workshop.overlayCloseButton('drawer-overlay').click();
  await workshop.expectOverlayHidden('drawer-overlay');

  // Open the modal — close-on-backdrop is true.
  await workshop.button('Open modal').click();
  await workshop.expectOverlayVisible('modal-overlay');
  await expect(workshop.overlay('modal-overlay')).toContainText('Are you sure?');
  await expect(workshop.overlay('modal-overlay')).toContainText('Modal body content');

  // Click the backdrop area (anywhere outside the modal box).
  await workshop.overlayBackdrop('modal-overlay').click({ position: { x: 5, y: 5 } });
  await workshop.expectOverlayHidden('modal-overlay');
});

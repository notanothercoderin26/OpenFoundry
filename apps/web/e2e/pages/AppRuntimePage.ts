import { expect, type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/**
 * Page Object for the public app runtime at `/apps/runtime/:slug`.
 *
 * Selectors mirror the `data-testid` conventions used by the runtime
 * components (`app-overlay-<id>`, `app-widget-<id>`, …). For the legacy
 * locator-style API, see {@link ../WorkshopRuntimePage}.
 */
export class AppRuntimePage extends BasePagePO {
  readonly slug: string;

  constructor(page: Page, slug: string) {
    super(page);
    this.slug = slug;
  }

  get path(): string {
    return `/apps/runtime/${this.slug}`;
  }

  overlay(id: string): Locator {
    return this.page.locator(`[data-testid="app-overlay-${id}"]`);
  }

  overlayBackdrop(id: string): Locator {
    return this.page.locator(`.of-app-overlay-backdrop[data-overlay-id="${id}"]`);
  }

  overlayCloseButton(id: string): Locator {
    return this.page.locator(`[data-testid="app-overlay-${id}-close"]`);
  }

  widget(id: string): Locator {
    return this.page.locator(`[data-testid="app-widget-${id}"]`);
  }

  async expectOverlayVisible(id: string): Promise<void> {
    await expect(this.overlay(id)).toBeVisible();
  }

  async expectOverlayHidden(id: string): Promise<void> {
    await expect(this.overlay(id)).toHaveCount(0);
  }
}

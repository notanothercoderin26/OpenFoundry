import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page Object for the public Workshop runtime at `/apps/runtime/:slug`.
 *
 * Selectors mirror the `data-testid` conventions used by the runtime
 * components (`app-overlay-<id>`, `app-widget-<id>`, ...). Prefer adding
 * an accessor here over re-deriving the same locator inside specs.
 */
export class WorkshopRuntimePage {
  readonly page: Page;
  readonly slug: string;

  constructor(page: Page, slug: string) {
    this.page = page;
    this.slug = slug;
  }

  async goto(): Promise<void> {
    await this.page.goto(`/apps/runtime/${this.slug}`);
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

  button(name: string | RegExp): Locator {
    return this.page.getByRole('button', { name });
  }

  async expectOverlayVisible(id: string): Promise<void> {
    await expect(this.overlay(id)).toBeVisible();
  }

  async expectOverlayHidden(id: string): Promise<void> {
    await expect(this.overlay(id)).toHaveCount(0);
  }
}

import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/contour`. */
export class ContourPage extends BasePagePO {
  readonly canvas: Locator;
  readonly blockPalette: Locator;
  readonly runButton: Locator;
  readonly saveAsViewButton: Locator;

  constructor(page: Page) {
    super(page);
    this.canvas = page.getByRole('region', { name: /canvas|workflow/i });
    this.blockPalette = page.getByRole('region', { name: /blocks|palette/i });
    this.runButton = page.getByRole('button', { name: /^run$|execute/i });
    this.saveAsViewButton = page.getByRole('button', { name: /save as view|save/i });
  }

  get path(): string {
    return '/contour';
  }
}

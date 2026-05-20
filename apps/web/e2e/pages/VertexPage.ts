import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/vertex`. */
export class VertexPage extends BasePagePO {
  readonly searchInput: Locator;
  readonly graphCanvas: Locator;
  readonly layoutPicker: Locator;
  readonly typeFilter: Locator;
  readonly pathFinderButton: Locator;

  constructor(page: Page) {
    super(page);
    this.searchInput = page.getByRole('searchbox').or(page.getByPlaceholder(/search/i)).first();
    this.graphCanvas = page.getByRole('region', { name: /graph|canvas/i });
    this.layoutPicker = page.getByRole('button', { name: /layout/i });
    this.typeFilter = page.getByRole('button', { name: /type|filter/i });
    this.pathFinderButton = page.getByRole('button', { name: /find path|shortest/i });
  }

  get path(): string {
    return '/vertex';
  }
}

import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/control-panel` (admin hub). */
export class ControlPanelPage extends BasePagePO {
  readonly sidebar: Locator;
  readonly kpisRegion: Locator;

  constructor(page: Page) {
    super(page);
    this.sidebar = page.getByRole('navigation', { name: /control panel|admin/i });
    this.kpisRegion = page.getByRole('region', { name: /overview|kpis|stats/i });
  }

  get path(): string {
    return '/control-panel';
  }

  section(name: string | RegExp): Locator {
    return this.page.getByRole('link', { name });
  }
}

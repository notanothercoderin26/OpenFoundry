import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/object-monitors`. */
export class ObjectMonitorsPage extends ListPagePO {
  readonly newMonitorButton: Locator;
  readonly pauseToggle: Locator;
  readonly historyButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newMonitorButton = page.getByRole('button', { name: /new monitor|create monitor/i });
    this.pauseToggle = page.getByRole('switch', { name: /paused|active/i });
    this.historyButton = page.getByRole('button', { name: /history|firings/i });
  }

  get path(): string {
    return '/object-monitors';
  }
}

import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/ai/operator`. */
export class OperatorPage extends ListPagePO {
  readonly newRunButton: Locator;
  readonly taskInput: Locator;
  readonly resourcesPicker: Locator;
  readonly stopButton: Locator;
  readonly stepsRegion: Locator;
  readonly toolsRegion: Locator;

  constructor(page: Page) {
    super(page);
    this.newRunButton = page.getByRole('button', { name: /new run|start/i });
    this.taskInput = page.getByLabel(/task|description/i);
    this.resourcesPicker = page.getByLabel(/resources|allowed/i);
    this.stopButton = page.getByRole('button', { name: /stop|cancel/i });
    this.stepsRegion = page.getByRole('region', { name: /steps/i });
    this.toolsRegion = page.getByRole('region', { name: /tools/i });
  }

  get path(): string {
    return '/ai/operator';
  }
}

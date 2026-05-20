import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/checkpoints`. */
export class CheckpointsPage extends ListPagePO {
  readonly newCheckpointButton: Locator;
  readonly restoreButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newCheckpointButton = page.getByRole('button', { name: /new checkpoint|create/i });
    this.restoreButton = page.getByRole('button', { name: /restore/i });
  }

  get path(): string {
    return '/checkpoints';
  }
}

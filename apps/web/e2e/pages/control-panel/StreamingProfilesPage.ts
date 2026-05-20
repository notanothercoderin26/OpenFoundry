import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from '../_base';

/** Page Object for `/control-panel/streaming-profiles`. */
export class StreamingProfilesPage extends ListPagePO {
  readonly newProfileButton: Locator;
  readonly compressionSelect: Locator;
  readonly retentionInput: Locator;
  readonly partitionsInput: Locator;

  constructor(page: Page) {
    super(page);
    this.newProfileButton = page.getByRole('button', { name: /new profile|create/i });
    this.compressionSelect = page.getByLabel(/compression/i);
    this.retentionInput = page.getByLabel(/retention/i);
    this.partitionsInput = page.getByLabel(/partitions/i);
  }

  get path(): string {
    return '/control-panel/streaming-profiles';
  }
}

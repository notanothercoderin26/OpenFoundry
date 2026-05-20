import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from '../_base';

/** Page Object for `/control-panel/file-access-presets`. */
export class FileAccessPresetsPage extends ListPagePO {
  readonly newPresetButton: Locator;
  readonly permissionsMatrix: Locator;
  readonly assignDefaultButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newPresetButton = page.getByRole('button', { name: /new preset|create/i });
    this.permissionsMatrix = page.getByRole('grid', { name: /permissions/i });
    this.assignDefaultButton = page.getByRole('button', { name: /set (as )?default|assign/i });
  }

  get path(): string {
    return '/control-panel/file-access-presets';
  }
}

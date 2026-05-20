import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/object-explorer`. */
export class ObjectExplorerPage extends BasePagePO {
  readonly objectTypeSelector: Locator;
  readonly resultsTable: Locator;
  readonly newObjectButton: Locator;
  readonly exportButton: Locator;
  readonly saveAsSetButton: Locator;
  readonly propertyFilter: Locator;
  readonly detailDrawer: Locator;

  constructor(page: Page) {
    super(page);
    this.objectTypeSelector = page.getByRole('combobox', { name: /object type|type/i });
    this.resultsTable = page.getByRole('table').first();
    this.newObjectButton = page.getByRole('button', { name: /new object|create/i });
    this.exportButton = page.getByRole('button', { name: /export|download/i });
    this.saveAsSetButton = page.getByRole('button', { name: /save as set|save query/i });
    this.propertyFilter = page.getByRole('button', { name: /add filter|filter/i });
    this.detailDrawer = page.getByRole('complementary', { name: /detail|object/i });
  }

  get path(): string {
    return '/object-explorer';
  }

  async selectType(name: string): Promise<void> {
    await this.objectTypeSelector.click();
    await this.page.getByRole('option', { name }).click();
  }
}

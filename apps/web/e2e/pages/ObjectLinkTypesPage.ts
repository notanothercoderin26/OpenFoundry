import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/object-link-types`. */
export class ObjectLinkTypesPage extends ListPagePO {
  readonly newLinkTypeButton: Locator;
  readonly sourceTypeSelect: Locator;
  readonly targetTypeSelect: Locator;
  readonly cardinalitySelect: Locator;

  constructor(page: Page) {
    super(page);
    this.newLinkTypeButton = page.getByRole('button', { name: /new link( type)?|create/i });
    this.sourceTypeSelect = page.getByLabel(/source( type)?/i);
    this.targetTypeSelect = page.getByLabel(/target( type)?/i);
    this.cardinalitySelect = page.getByLabel(/cardinality/i);
  }

  get path(): string {
    return '/object-link-types';
  }
}

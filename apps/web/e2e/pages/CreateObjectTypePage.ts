import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/ontology/types` (create object type form). */
export class CreateObjectTypePage extends BasePagePO {
  readonly nameInput: Locator;
  readonly pluralInput: Locator;
  readonly descriptionInput: Locator;
  readonly iconPicker: Locator;
  readonly colorPicker: Locator;
  readonly addPropertyButton: Locator;
  readonly primaryKeySelect: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    super(page);
    this.nameInput = page.getByLabel(/^name$/i);
    this.pluralInput = page.getByLabel(/plural/i);
    this.descriptionInput = page.getByLabel(/^description$/i);
    this.iconPicker = page.getByLabel(/icon/i);
    this.colorPicker = page.getByLabel(/color/i);
    this.addPropertyButton = page.getByRole('button', { name: /add property/i });
    this.primaryKeySelect = page.getByLabel(/primary key/i);
    this.submitButton = page.getByRole('button', { name: /^create|^save$/i });
    this.cancelButton = page.getByRole('button', { name: /^cancel$/i });
  }

  get path(): string {
    return '/ontology/types';
  }

  propertyRow(name: string | RegExp): Locator {
    return this.page.getByRole('row', { name });
  }
}

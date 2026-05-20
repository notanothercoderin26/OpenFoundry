import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/ontology-manager/bindings`. */
export class BindingsWizardPage extends BasePagePO {
  readonly sourcePicker: Locator;
  readonly previewPanel: Locator;
  readonly nextButton: Locator;
  readonly backButton: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    super(page);
    this.sourcePicker = page.getByLabel(/source dataset|source/i);
    this.previewPanel = page.getByRole('region', { name: /preview/i });
    this.nextButton = page.getByRole('button', { name: /^next/i });
    this.backButton = page.getByRole('button', { name: /^back/i });
    this.submitButton = page.getByRole('button', { name: /finish|create binding|^create$/i });
  }

  get path(): string {
    return '/ontology-manager/bindings';
  }

  columnMapping(columnName: string | RegExp): Locator {
    return this.page.getByRole('row', { name: columnName });
  }
}

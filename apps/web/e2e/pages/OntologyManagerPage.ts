import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/ontology-manager`. */
export class OntologyManagerPage extends ListPagePO {
  readonly newOntologyButton: Locator;
  readonly importButton: Locator;
  readonly exportButton: Locator;
  readonly publishButton: Locator;
  readonly versionDropdown: Locator;

  constructor(page: Page) {
    super(page);
    this.newOntologyButton = page.getByRole('button', { name: /new ontology|create/i });
    this.importButton = page.getByRole('button', { name: /import/i });
    this.exportButton = page.getByRole('button', { name: /export/i });
    this.publishButton = page.getByRole('button', { name: /publish/i });
    this.versionDropdown = page.getByRole('button', { name: /version/i });
  }

  get path(): string {
    return '/ontology-manager';
  }
}

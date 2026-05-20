import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/ontology-indexing`. */
export class OntologyIndexingPage extends ListPagePO {
  readonly reindexButton: Locator;
  readonly configureButton: Locator;
  readonly progressBar: Locator;

  constructor(page: Page) {
    super(page);
    this.reindexButton = page.getByRole('button', { name: /reindex/i });
    this.configureButton = page.getByRole('button', { name: /configure/i });
    this.progressBar = page.getByRole('progressbar');
  }

  get path(): string {
    return '/ontology-indexing';
  }
}

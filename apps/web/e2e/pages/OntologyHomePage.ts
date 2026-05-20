import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/ontology`. */
export class OntologyHomePage extends BasePagePO {
  readonly typesLink: Locator;
  readonly graphLink: Locator;
  readonly objectSetsLink: Locator;
  readonly statsRegion: Locator;

  constructor(page: Page) {
    super(page);
    this.typesLink = page.getByRole('link', { name: /types|object types/i });
    this.graphLink = page.getByRole('link', { name: /graph/i });
    this.objectSetsLink = page.getByRole('link', { name: /object sets/i });
    this.statsRegion = page.getByRole('region', { name: /stats|overview/i });
  }

  get path(): string {
    return '/ontology';
  }
}

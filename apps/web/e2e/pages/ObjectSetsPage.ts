import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/ontology/object-sets`. */
export class ObjectSetsPage extends ListPagePO {
  readonly newButton: Locator;
  readonly unionButton: Locator;
  readonly intersectButton: Locator;
  readonly exceptButton: Locator;
  readonly materializeButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newButton = page.getByRole('button', { name: /new( object)? set|create/i });
    this.unionButton = page.getByRole('button', { name: /union/i });
    this.intersectButton = page.getByRole('button', { name: /intersect/i });
    this.exceptButton = page.getByRole('button', { name: /except|difference/i });
    this.materializeButton = page.getByRole('button', { name: /materialize|snapshot/i });
  }

  get path(): string {
    return '/ontology/object-sets';
  }
}

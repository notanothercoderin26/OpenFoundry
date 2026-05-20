import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/peer-manager`. */
export class PeerManagerPage extends ListPagePO {
  readonly addPeerButton: Locator;
  readonly disconnectButton: Locator;

  constructor(page: Page) {
    super(page);
    this.addPeerButton = page.getByRole('button', { name: /add peer|connect/i });
    this.disconnectButton = page.getByRole('button', { name: /disconnect/i });
  }

  get path(): string {
    return '/peer-manager';
  }
}

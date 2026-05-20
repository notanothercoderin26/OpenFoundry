import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/** Page Object for `/iceberg-tables/:id`. */
export class IcebergTableDetailPage extends DetailPagePO {
  readonly id: string;
  readonly schemaTab: Locator;
  readonly snapshotsTab: Locator;
  readonly partitionsTab: Locator;
  readonly propertiesTab: Locator;
  readonly compactButton: Locator;

  constructor(page: Page, id: string) {
    super(page);
    this.id = id;
    this.schemaTab = page.getByRole('tab', { name: /schema/i });
    this.snapshotsTab = page.getByRole('tab', { name: /snapshots/i });
    this.partitionsTab = page.getByRole('tab', { name: /partitions/i });
    this.propertiesTab = page.getByRole('tab', { name: /properties/i });
    this.compactButton = page.getByRole('button', { name: /compact/i });
  }

  get path(): string {
    return `/iceberg-tables/${this.id}`;
  }

  snapshotRow(name: string | RegExp): Locator {
    return this.page.getByRole('row', { name });
  }
}

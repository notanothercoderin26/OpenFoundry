import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/quiver` (legacy redirect: /dashboards). */
export class QuiverPage extends BasePagePO {
  readonly canvas: Locator;
  readonly addChartButton: Locator;
  readonly chartTypePicker: Locator;
  readonly dataSourcePicker: Locator;
  readonly filtersBar: Locator;
  readonly saveButton: Locator;
  readonly exportButton: Locator;
  readonly refreshButton: Locator;

  constructor(page: Page) {
    super(page);
    this.canvas = page.getByRole('region', { name: /canvas|dashboard/i });
    this.addChartButton = page.getByRole('button', { name: /add chart|new chart|\+ chart/i });
    this.chartTypePicker = page.getByLabel(/chart type/i);
    this.dataSourcePicker = page.getByLabel(/data source|dataset/i);
    this.filtersBar = page.getByRole('region', { name: /filters/i });
    this.saveButton = page.getByRole('button', { name: /^save$/i });
    this.exportButton = page.getByRole('button', { name: /export|download/i });
    this.refreshButton = page.getByRole('button', { name: /refresh/i });
  }

  get path(): string {
    return '/quiver';
  }
}

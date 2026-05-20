import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/geospatial`. */
export class GeospatialPage extends BasePagePO {
  readonly mapCanvas: Locator;
  readonly layersDrawer: Locator;
  readonly basemapPicker: Locator;
  readonly legendDrawer: Locator;
  readonly bboxFilter: Locator;
  readonly addLayerButton: Locator;

  constructor(page: Page) {
    super(page);
    this.mapCanvas = page.locator('.maplibregl-canvas, [data-testid="map-canvas"]').first();
    this.layersDrawer = page.getByRole('complementary', { name: /layers/i });
    this.basemapPicker = page.getByRole('button', { name: /basemap/i });
    this.legendDrawer = page.getByRole('complementary', { name: /legend/i });
    this.bboxFilter = page.getByRole('button', { name: /bounding box|bbox/i });
    this.addLayerButton = page.getByRole('button', { name: /add layer|\+ layer/i });
  }

  get path(): string {
    return '/geospatial';
  }

  layerToggle(name: string | RegExp): Locator {
    return this.layersDrawer.getByRole('switch', { name });
  }
}

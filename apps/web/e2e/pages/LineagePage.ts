import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/lineage` (legacy redirect: /workflow-lineage). */
export class LineagePage extends BasePagePO {
  readonly resourcePicker: Locator;
  readonly directionToggle: Locator;
  readonly depthSlider: Locator;
  readonly graphCanvas: Locator;
  readonly nodeDrawer: Locator;
  readonly exportButton: Locator;
  readonly typeFilter: Locator;

  constructor(page: Page) {
    super(page);
    this.resourcePicker = page.getByLabel(/resource|input/i);
    this.directionToggle = page.getByRole('group', { name: /direction|upstream|downstream/i });
    this.depthSlider = page.getByRole('slider', { name: /depth/i });
    this.graphCanvas = page.getByRole('region', { name: /graph|canvas/i });
    this.nodeDrawer = page.getByRole('complementary', { name: /node|detail/i });
    this.exportButton = page.getByRole('button', { name: /export|download/i });
    this.typeFilter = page.getByRole('button', { name: /type/i });
  }

  get path(): string {
    return '/lineage';
  }
}

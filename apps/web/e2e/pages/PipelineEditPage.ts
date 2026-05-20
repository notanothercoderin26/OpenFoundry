import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/** Page Object for the pipeline DAG editor at `/pipelines/:id/edit`. */
export class PipelineEditPage extends DetailPagePO {
  readonly id: string;
  readonly canvas: Locator;
  readonly widgetPalette: Locator;
  readonly propertiesPanel: Locator;
  readonly runNowButton: Locator;
  readonly validateButton: Locator;
  readonly saveButton: Locator;
  readonly runsTab: Locator;
  readonly logsTab: Locator;
  readonly historyButton: Locator;

  constructor(page: Page, id: string) {
    super(page);
    this.id = id;
    this.canvas = page.getByRole('region', { name: /canvas|graph|dag/i });
    this.widgetPalette = page.getByRole('region', { name: /palette|widgets|nodes/i });
    this.propertiesPanel = page.getByRole('complementary', { name: /properties/i });
    this.runNowButton = page.getByRole('button', { name: /run now/i });
    this.validateButton = page.getByRole('button', { name: /validate/i });
    this.saveButton = page.getByRole('button', { name: /^save$/i });
    this.runsTab = page.getByRole('tab', { name: /runs/i });
    this.logsTab = page.getByRole('tab', { name: /logs/i });
    this.historyButton = page.getByRole('button', { name: /history|versions/i });
  }

  get path(): string {
    return `/pipelines/${this.id}/edit`;
  }

  pipelineNode(id: string): Locator {
    return this.page.locator(`[data-testid="pipeline-node-${id}"]`);
  }
}

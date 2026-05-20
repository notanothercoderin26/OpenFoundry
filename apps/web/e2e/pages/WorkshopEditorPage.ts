import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/** Page Object for the Workshop editor at `/apps/:id/workshop`. */
export class WorkshopEditorPage extends DetailPagePO {
  readonly id: string;
  readonly canvas: Locator;
  readonly widgetPalette: Locator;
  readonly propertiesPanel: Locator;
  readonly variablesPanel: Locator;
  readonly previewToggle: Locator;
  readonly saveButton: Locator;
  readonly publishButton: Locator;
  readonly undoButton: Locator;
  readonly redoButton: Locator;
  readonly versionDropdown: Locator;

  constructor(page: Page, id: string) {
    super(page);
    this.id = id;
    this.canvas = page.getByRole('region', { name: /canvas|editor/i });
    this.widgetPalette = page.getByRole('region', { name: /palette|widgets/i });
    this.propertiesPanel = page.getByRole('complementary', { name: /properties/i });
    this.variablesPanel = page.getByRole('complementary', { name: /variables/i });
    this.previewToggle = page.getByRole('switch', { name: /preview/i });
    this.saveButton = page.getByRole('button', { name: /^save$/i });
    this.publishButton = page.getByRole('button', { name: /publish/i });
    this.undoButton = page.getByRole('button', { name: /undo/i });
    this.redoButton = page.getByRole('button', { name: /redo/i });
    this.versionDropdown = page.getByRole('button', { name: /version/i });
  }

  get path(): string {
    return `/apps/${this.id}/workshop`;
  }

  widget(id: string): Locator {
    return this.page.locator(`[data-testid="app-widget-${id}"]`);
  }
}

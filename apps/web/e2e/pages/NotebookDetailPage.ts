import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/** Page Object for `/notebooks/:id`. */
export class NotebookDetailPage extends DetailPagePO {
  readonly id: string;
  readonly addCellButton: Locator;
  readonly addMarkdownCellButton: Locator;
  readonly runAllButton: Locator;
  readonly restartKernelButton: Locator;
  readonly saveButton: Locator;
  readonly kernelStatus: Locator;

  constructor(page: Page, id: string) {
    super(page);
    this.id = id;
    this.addCellButton = page.getByRole('button', { name: /add cell|\+ cell/i });
    this.addMarkdownCellButton = page.getByRole('button', { name: /add markdown/i });
    this.runAllButton = page.getByRole('button', { name: /run all/i });
    this.restartKernelButton = page.getByRole('button', { name: /restart kernel/i });
    this.saveButton = page.getByRole('button', { name: /^save$/i });
    this.kernelStatus = page.getByRole('status', { name: /kernel/i });
  }

  get path(): string {
    return `/notebooks/${this.id}`;
  }

  cell(index: number): Locator {
    return this.page.locator(`[data-testid="notebook-cell-${index}"]`);
  }
}

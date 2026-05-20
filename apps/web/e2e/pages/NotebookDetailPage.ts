import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/**
 * Page Object for `/notebooks/:id`.
 *
 * The shipped page renders one `<section class="of-panel notebook-cell">`
 * per cell with a per-cell Monaco editor, a per-code-cell Run button,
 * and a Delete-cell icon button (aria-label="Delete cell"). Auto-save
 * fires on Monaco blur — there is no explicit Save button. Drag-drop
 * reorder and a "Restart kernel" affordance are roadmap and pinned by
 * `restartKernelButton` / `saveButton` (kept here so the
 * absent-today regression guard in notebooks.spec.ts has stable
 * locators).
 */
export class NotebookDetailPage extends DetailPagePO {
  readonly id: string;
  readonly pageArea: Locator;
  readonly cellList: Locator;
  readonly addCodeCellButtons: Locator;
  readonly addMarkdownCellButtons: Locator;
  readonly runAllButton: Locator;
  readonly kernelSelect: Locator;
  readonly startSessionButton: Locator;
  readonly stopSessionButton: Locator;

  readonly addCellButton: Locator;
  readonly addMarkdownCellButton: Locator;
  readonly restartKernelButton: Locator;
  readonly saveButton: Locator;
  readonly kernelStatus: Locator;

  constructor(page: Page, id: string) {
    super(page);
    this.id = id;
    this.pageArea = page.locator('section.notebook-detail');
    this.cellList = this.pageArea.locator('section.notebook-cell');
    this.addCodeCellButtons = this.pageArea.getByRole('button', { name: /^code cell$/i });
    this.addMarkdownCellButtons = this.pageArea.getByRole('button', { name: /^markdown cell$/i });
    this.runAllButton = this.pageArea.getByRole('button', { name: /^(run all|running\.\.\.)$/i });
    this.kernelSelect = this.pageArea
      .locator('section.notebook-detail__kernel-panel')
      .getByRole('combobox')
      .first();
    this.startSessionButton = this.pageArea.getByRole('button', { name: /start session/i });
    this.stopSessionButton = this.pageArea.getByRole('button', { name: /stop session/i });

    this.addCellButton = this.pageArea.getByRole('button', { name: /add cell|\+ cell/i });
    this.addMarkdownCellButton = this.pageArea.getByRole('button', { name: /add markdown/i });
    this.restartKernelButton = this.pageArea.getByRole('button', { name: /restart kernel/i });
    this.saveButton = this.pageArea.getByRole('button', { name: /^save$/i });
    this.kernelStatus = this.pageArea.getByRole('status', { name: /kernel/i });
  }

  get path(): string {
    return `/notebooks/${this.id}`;
  }

  /** Nth cell section (0-indexed; cells render in `position` order). */
  cell(index: number): Locator {
    return this.cellList.nth(index);
  }

  cellRunButton(index: number): Locator {
    return this.cell(index).getByRole('button', { name: /^(run|running\.\.\.)$/i });
  }

  cellDeleteButton(index: number): Locator {
    return this.cell(index).getByRole('button', { name: /^delete cell$/i });
  }

  /** Monaco editor surface inside a given cell. */
  cellEditor(index: number): Locator {
    return this.cell(index).locator('.monaco-editor').first();
  }
}

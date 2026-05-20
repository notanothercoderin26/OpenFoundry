import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/ai/analyst`. */
export class AnalystPage extends BasePagePO {
  readonly queryInput: Locator;
  readonly sqlEditor: Locator;
  readonly runButton: Locator;
  readonly saveAsButton: Locator;
  readonly resultsTable: Locator;
  readonly historyButton: Locator;

  constructor(page: Page) {
    super(page);
    this.queryInput = page.getByLabel(/natural language|ask|question/i);
    this.sqlEditor = page.locator('.monaco-editor').first();
    this.runButton = page.getByRole('button', { name: /^run$|execute/i });
    this.saveAsButton = page.getByRole('button', { name: /save as/i });
    this.resultsTable = page.getByRole('table').first();
    this.historyButton = page.getByRole('button', { name: /history/i });
  }

  get path(): string {
    return '/ai/analyst';
  }
}

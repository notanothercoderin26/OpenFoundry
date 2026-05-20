import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/logic`. */
export class LogicAuthoringPage extends BasePagePO {
  readonly editor: Locator;
  readonly newRuleButton: Locator;
  readonly testInput: Locator;
  readonly testButton: Locator;
  readonly saveButton: Locator;
  readonly versionDropdown: Locator;

  constructor(page: Page) {
    super(page);
    this.editor = page.locator('.monaco-editor').first();
    this.newRuleButton = page.getByRole('button', { name: /new rule|create/i });
    this.testInput = page.getByLabel(/test input|sample/i);
    this.testButton = page.getByRole('button', { name: /^test$|run/i });
    this.saveButton = page.getByRole('button', { name: /^save$/i });
    this.versionDropdown = page.getByRole('button', { name: /version/i });
  }

  get path(): string {
    return '/logic';
  }
}

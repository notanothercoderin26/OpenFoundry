import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for the pipeline linter at `/pipelines/linter`. */
export class LinterPage extends ListPagePO {
  readonly severityFilter: Locator;
  readonly pipelineFilter: Locator;
  readonly autoFixButton: Locator;
  readonly issueDrawer: Locator;

  constructor(page: Page) {
    super(page);
    this.severityFilter = page.getByRole('button', { name: /severity/i });
    this.pipelineFilter = page.getByRole('button', { name: /pipeline/i });
    this.autoFixButton = page.getByRole('button', { name: /auto-?fix|apply fix/i });
    this.issueDrawer = page.getByRole('complementary', { name: /issue|detail/i });
  }

  get path(): string {
    return '/pipelines/linter';
  }
}

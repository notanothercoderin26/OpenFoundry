import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/**
 * Page Object for `/slate` (legacy redirect: /reports).
 *
 * Reality today: the route renders the Web App Studio shell — a listing
 * of apps with visibility tabs and a "Start from a template" section.
 * Roadmap (Phase 4.2): a rich-text reports editor with blocks, publish,
 * share, versioning, and delete. The roadmap-shaped locators (editor,
 * publishButton, …) are kept so they flip to matching the real UI when
 * the feature lands without churning specs.
 */
export class SlatePage extends ListPagePO {
  /**
   * Root container scoped to the route's own content (excludes the
   * AppShell chrome). All page-local roadmap locators are nested under
   * this so e.g. a global "Share" button in the topbar doesn't bleed
   * into the absent-today regression guard.
   */
  readonly pageArea: Locator;
  readonly visibilityTablist: Locator;
  readonly appsSection: Locator;
  readonly templatesSection: Locator;

  readonly newReportButton: Locator;
  readonly insertBlockButton: Locator;
  readonly publishButton: Locator;
  readonly shareButton: Locator;
  readonly editor: Locator;

  constructor(page: Page) {
    super(page);
    this.pageArea = page.locator('section.of-page');
    this.visibilityTablist = this.pageArea.getByRole('tablist', {
      name: /filter by visibility/i,
    });
    // `.last()` picks the leaf section. The route renders the page in a
    // `<section.of-page>` wrapper that also matches the `has:` filter
    // because the heading is a descendant of both the wrapper and the
    // inner section.
    this.appsSection = this.pageArea
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2, name: /^your apps/i }) })
      .last();
    this.templatesSection = this.pageArea
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2, name: /^start from a template$/i }) })
      .last();

    this.newReportButton = this.pageArea.getByRole('button', {
      name: /new report|new post|create/i,
    });
    this.insertBlockButton = this.pageArea.getByRole('button', { name: /insert/i });
    this.publishButton = this.pageArea.getByRole('button', { name: /publish/i });
    this.shareButton = this.pageArea.getByRole('button', { name: /^share$/i });
    this.editor = this.pageArea.getByRole('textbox', { name: /editor|body/i });
  }

  get path(): string {
    return '/slate';
  }

  visibilityTab(name: string | RegExp): Locator {
    return this.visibilityTablist.getByRole('tab', { name });
  }

  appCard(name: string | RegExp): Locator {
    return this.appsSection.getByRole('article', { name });
  }

  templateCard(name: string | RegExp): Locator {
    return this.templatesSection.getByRole('article', { name });
  }
}

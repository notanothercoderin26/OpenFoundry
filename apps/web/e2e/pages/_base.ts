import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Escape a literal URL path so it can be embedded in a RegExp.
 * Keeps regex special chars literal; we add our own trailing matcher.
 */
function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Base Page Object. Every area-specific Page Object should extend either this,
 * {@link ListPagePO}, or {@link DetailPagePO}.
 *
 * Subclasses MUST override `path` (canonical URL for `goto()` and the URL
 * assertion in `expectLoaded()`). `expectLoaded()` defaults to a URL match;
 * specialise it if the area benefits from a stable DOM anchor.
 */
export abstract class BasePagePO {
  readonly page: Page;
  readonly heading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
  }

  /** Canonical URL of this page. Override per area. */
  abstract get path(): string;

  async goto(): Promise<void> {
    await this.page.goto(this.path);
  }

  /**
   * Lightweight "page rendered" assertion. Asserts the URL matches `path`
   * (allowing trailing slash, query string, or hash). Override in pages where
   * a DOM anchor is more reliable than the URL.
   */
  async expectLoaded(): Promise<void> {
    const escaped = escapeForRegex(this.path);
    await expect(this.page).toHaveURL(new RegExp(`${escaped}(/|$|\\?|#)`));
  }

  // ---- Shared locator helpers ------------------------------------------------

  tab(name: string | RegExp): Locator {
    return this.page.getByRole('tab', { name });
  }

  button(name: string | RegExp): Locator {
    return this.page.getByRole('button', { name });
  }

  link(name: string | RegExp): Locator {
    return this.page.getByRole('link', { name });
  }

  /** Generic dialog/modal. Pass a name to scope to a single open dialog. */
  dialog(name?: string | RegExp): Locator {
    return name
      ? this.page.getByRole('dialog', { name })
      : this.page.getByRole('dialog');
  }

  /** Toast/alert/status surface. */
  toast(text?: string | RegExp): Locator {
    const base = this.page.getByRole('status');
    return text ? base.filter({ hasText: text }) : base;
  }

  errorAlert(text?: string | RegExp): Locator {
    const base = this.page.getByRole('alert');
    return text ? base.filter({ hasText: text }) : base;
  }

  // ---- Convenience flows -----------------------------------------------------

  async clickButton(name: string | RegExp): Promise<void> {
    await this.button(name).click();
  }

  async clickLink(name: string | RegExp): Promise<void> {
    await this.link(name).click();
  }

  async switchTab(name: string | RegExp): Promise<void> {
    await this.tab(name).click();
  }
}

/**
 * Page Object for list-style areas (header + filters + table).
 * Exposes the search input, primary table, primary "new"/"create" CTA, and
 * row helpers. Concrete subclasses can override `newButton` with a more
 * specific name.
 */
export abstract class ListPagePO extends BasePagePO {
  readonly searchInput: Locator;
  readonly table: Locator;
  /** Generic primary CTA (override in subclasses for a tighter match). */
  readonly newButton: Locator;

  constructor(page: Page) {
    super(page);
    this.searchInput = page
      .getByPlaceholder(/search/i)
      .or(page.getByRole('searchbox'))
      .first();
    this.table = page.getByRole('table').first();
    this.newButton = page
      .getByRole('button', { name: /^(new|create|add|upload|\+)/i })
      .first();
  }

  /** Row by accessible name (typically the resource name). */
  row(name: string | RegExp): Locator {
    return this.page.getByRole('row', { name });
  }

  async searchFor(query: string): Promise<void> {
    await this.searchInput.fill(query);
  }

  async openRow(name: string | RegExp): Promise<void> {
    await this.row(name).click();
  }

  async openNew(): Promise<void> {
    await this.newButton.click();
  }
}

/**
 * Page Object for detail-style areas (`/area/:id`). Subclasses must accept the
 * id/slug in their constructor and use it inside `path`.
 */
export abstract class DetailPagePO extends BasePagePO {
  readonly breadcrumb: Locator;

  constructor(page: Page) {
    super(page);
    this.breadcrumb = page.getByRole('navigation', { name: /breadcrumb/i });
  }
}

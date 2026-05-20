import { expect, type Locator, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Types & defaults
// ---------------------------------------------------------------------------

export interface PrepareForVisualOptions {
  /** Viewport size to pin before snapshotting. Defaults to 1280×800. */
  viewport?: { width: number; height: number };
  /**
   * When `false`, skips waiting for `document.fonts.ready`. The default
   * (`true`) is correct for >99% of cases — only set false if a spec
   * intentionally tests a partial font-load state.
   */
  awaitFonts?: boolean;
  /**
   * Extra CSS to inject during preparation (e.g. hiding a known-flaky
   * widget). Merged with the standard "disable animations + hide scrollbar"
   * stylesheet.
   */
  extraCss?: string;
}

export interface ExpectScreenshotOptions {
  /** Locators to mask (volatile content: timestamps, IDs, avatars, …). */
  mask?: Locator[];
  /**
   * Per-pixel diff tolerance — fraction of total pixels that may differ.
   * Defaults to 0.01 (1%). Lower for tight assertions, raise (cautiously)
   * for surfaces that legitimately vary across runs.
   */
  threshold?: number;
  /** Capture the full scrollable height (default `true`). */
  fullPage?: boolean;
  /** Override the snapshot maxDiffPixels (absolute count). */
  maxDiffPixels?: number;
}

/**
 * CSS injected by {@link prepareForVisual}. Disables every CSS animation
 * and transition (so a baseline taken mid-fade is reproducible) and hides
 * native scrollbars (which differ between OS / browser combinations).
 */
const VISUAL_NORMALISE_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
  html, body { scrollbar-width: none !important; }
  *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
  html { caret-color: transparent !important; }
`;

/**
 * Default volatile selectors masked on every screenshot. Tests can pass
 * additional locators via the `mask` option; both lists are merged.
 *
 * Opt-in pattern for new code: tag volatile UI with `data-mask-visual`
 * and it will be masked automatically.
 */
export function defaultMasks(page: Page): Locator[] {
  return [
    // Explicit opt-in for spec authors.
    page.locator('[data-mask-visual]'),
    // <time> elements — semantic timestamps.
    page.locator('time'),
    // Conventional testid suffixes used across the codebase.
    page.locator('[data-testid$="-timestamp"]'),
    page.locator('[data-testid$="-id"]'),
    page.locator('[data-testid$="-uuid"]'),
    page.locator('[data-testid$="-relative-time"]'),
    // Externally hosted avatars / gravatars that flicker between runs.
    page.locator('img[src*="avatar"]'),
    page.locator('img[src*="gravatar"]'),
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Stabilise a page before snapshotting. Call AFTER any navigation /
 * data load but BEFORE {@link expectScreenshot}.
 *
 * - Pins viewport (default 1280×800).
 * - Injects {@link VISUAL_NORMALISE_CSS} (no animations, no scrollbars).
 * - Waits for `document.fonts.ready` so glyph layout is final.
 *
 * @example
 *   await page.goto('/datasets');
 *   await prepareForVisual(page);
 *   await expectScreenshot(page, 'datasets-list');
 */
export async function prepareForVisual(
  page: Page,
  options: PrepareForVisualOptions = {},
): Promise<void> {
  const viewport = options.viewport ?? { width: 1280, height: 800 };
  await page.setViewportSize(viewport);

  const css = options.extraCss
    ? `${VISUAL_NORMALISE_CSS}\n${options.extraCss}`
    : VISUAL_NORMALISE_CSS;
  await page.addStyleTag({ content: css });

  if (options.awaitFonts !== false) {
    await page.evaluate(async () => {
      // `document.fonts` may be missing in test browsers run with no
      // FontLoadingAPI — guard before awaiting.
      if (typeof document !== 'undefined' && 'fonts' in document) {
        await document.fonts.ready;
      }
    });
  }
}

/**
 * Wrapper over `expect(page).toHaveScreenshot()` with project-wide defaults:
 * animations disabled, maxDiffPixelRatio 0.01, full page, and the standard
 * mask set (timestamps, IDs, external avatars, anything tagged
 * `[data-mask-visual]`). Per-call masks compose with the defaults.
 *
 * @example
 *   await expectScreenshot(page, 'datasets-list', {
 *     mask: [page.getByRole('cell', { name: /^\d+ MB$/ })],
 *   });
 */
export async function expectScreenshot(
  page: Page,
  name: string,
  options: ExpectScreenshotOptions = {},
): Promise<void> {
  const masks = [...defaultMasks(page), ...(options.mask ?? [])];
  const file = name.endsWith('.png') ? name : `${name}.png`;

  await expect(page).toHaveScreenshot(file, {
    fullPage: options.fullPage ?? true,
    animations: 'disabled',
    maxDiffPixelRatio: options.threshold ?? 0.01,
    maxDiffPixels: options.maxDiffPixels,
    mask: masks,
  });
}

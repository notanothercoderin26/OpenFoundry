import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export type A11yScanOptions = {
  /** WCAG tags to include — defaults to WCAG 2.1 A/AA. */
  tags?: string[];
  /** Selectors to exclude from the scan (third-party widgets we don't own). */
  exclude?: string[];
  /** Rule ids to disable (use sparingly and comment why in the spec). */
  disableRules?: string[];
};

const DEFAULT_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Runs axe-core on the current page state and asserts there are no
 * violations. Returns the raw axe result for additional assertions.
 *
 * Heavy embedded components (Monaco, Cytoscape, MapLibre, ECharts) often
 * fail axe for reasons outside our control — exclude them with
 * `exclude: ['.monaco-editor', '.cy-container', '.maplibregl-canvas']`.
 */
export async function expectNoA11yViolations(
  page: Page,
  options: A11yScanOptions = {},
): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(options.tags ?? DEFAULT_TAGS);

  for (const selector of options.exclude ?? []) {
    builder = builder.exclude(selector);
  }

  if (options.disableRules?.length) {
    builder = builder.disableRules(options.disableRules);
  }

  const result = await builder.analyze();

  expect(
    result.violations,
    formatViolations(result.violations),
  ).toEqual([]);
}

function formatViolations(violations: Array<{ id: string; help: string; nodes: unknown[] }>): string {
  if (violations.length === 0) return 'no violations';
  return [
    `Found ${violations.length} accessibility violation(s):`,
    ...violations.map(
      (v) => `  - [${v.id}] ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})`,
    ),
  ].join('\n');
}

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type A11yRuleSeverity = 'off' | 'warn' | 'error';

export type A11yRuleOverrides = Record<string, A11yRuleSeverity>;

export interface A11yScanOptions {
  /** WCAG tags to include — defaults to WCAG 2.1 A/AA. */
  tags?: string[];
  /**
   * Selectors to scope INTO the scan. When set, only matching subtrees are
   * audited. Useful when the page mixes our code with a 3rd-party widget.
   */
  include?: string[];
  /**
   * Selectors to exclude from the scan (third-party widgets we don't own).
   * Merged with {@link DEFAULT_A11Y_EXCLUDES}.
   */
  exclude?: string[];
  /**
   * Per-rule severity override.
   * - `off`   → rule is disabled in axe.
   * - `warn`  → rule still runs, violations are reported (attached + annotated)
   *             but DO NOT fail the test.
   * - `error` → default. Violations fail the test.
   *
   * @example { 'color-contrast': 'warn', 'region': 'off' }
   */
  rules?: A11yRuleOverrides;
  /**
   * Legacy knob, retained for source compatibility with pre-2026 specs.
   * Equivalent to passing the rule ids in `rules` mapped to `'off'`.
   */
  disableRules?: string[];
}

export interface A11yAuditOptions extends A11yScanOptions {
  /** Path to visit before scanning. Defaults to staying on the current URL. */
  route?: string;
  /**
   * When `true`, attach a full-page screenshot to the test result on
   * violation (and only on violation). Helps triage failures without
   * re-running the spec locally.
   */
  screenshot?: boolean;
  /**
   * Maximum time to wait for the page heading to appear before scanning.
   * Defaults to 15s (in line with the route-smokes lazy-chunk budget).
   */
  loadedTimeout?: number;
}

interface AxeNode {
  html: string;
  target: string[];
  failureSummary?: string;
}

interface AxeIssue {
  id: string;
  impact: string | null;
  help: string;
  description: string;
  helpUrl: string;
  nodes: AxeNode[];
}

interface AxeResultLike {
  violations: AxeIssue[];
  passes: AxeIssue[];
  incomplete: AxeIssue[];
  inapplicable: AxeIssue[];
  url: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Heavy third-party widgets whose markup we don't control. */
export const DEFAULT_A11Y_EXCLUDES: readonly string[] = [
  '.monaco-editor',
  '.cy-container',
  '.maplibregl-canvas',
  '.maplibregl-control-container',
  '[data-echarts-instance]',
];

// ---------------------------------------------------------------------------
// Core scan
// ---------------------------------------------------------------------------

/**
 * Runs axe-core on the current page state, writes a detailed JSON report
 * to `test-results/a11y/<test-name>.json`, attaches it to the Playwright
 * test result, and asserts that no `error`-severity violations remain.
 *
 * Returns the raw axe result for additional assertions in the spec.
 */
export async function expectNoA11yViolations(
  page: Page,
  options: A11yScanOptions = {},
): Promise<AxeResultLike> {
  const rules = normaliseRules(options);
  const offRules = Object.entries(rules)
    .filter(([, sev]) => sev === 'off')
    .map(([id]) => id);
  const warnRules = new Set(
    Object.entries(rules)
      .filter(([, sev]) => sev === 'warn')
      .map(([id]) => id),
  );

  let builder = new AxeBuilder({ page }).withTags(options.tags ?? DEFAULT_TAGS);

  for (const selector of options.include ?? []) {
    builder = builder.include(selector);
  }

  const excludes = [...DEFAULT_A11Y_EXCLUDES, ...(options.exclude ?? [])];
  for (const selector of excludes) {
    builder = builder.exclude(selector);
  }

  if (offRules.length > 0) {
    builder = builder.disableRules(offRules);
  }

  const result = (await builder.analyze()) as AxeResultLike;

  // Persist + attach a detailed report so triage doesn't require re-runs.
  await persistReport(result);

  // Split violations into fail-the-test vs warn-only based on `rules`.
  const failing = result.violations.filter((v) => !warnRules.has(v.id));
  const warning = result.violations.filter((v) => warnRules.has(v.id));

  if (warning.length > 0) {
    test.info().annotations.push({
      type: 'a11y-warning',
      description: formatViolations(warning, 'warn'),
    });
  }

  expect(failing, formatViolations(failing, 'error')).toEqual([]);
  return result;
}

/**
 * Convenience wrapper: navigate to `route`, wait for the main heading to
 * render, then run {@link expectNoA11yViolations}. On violation, optionally
 * attaches a full-page screenshot to the test result.
 *
 * @example
 *   await auditPageA11y(page, { route: '/datasets', screenshot: true });
 */
export async function auditPageA11y(
  page: Page,
  options: A11yAuditOptions = {},
): Promise<AxeResultLike> {
  if (options.route) {
    await page.goto(options.route);
  }
  // Wait for the page chrome to stabilise — avoids axe firing mid-render
  // when half the DOM is still suspended. Some pages render no <h1>; if so,
  // just proceed (the route-smokes safety net catches genuine render errors).
  const heading = page.getByRole('heading').first();
  await heading
    .waitFor({ state: 'visible', timeout: options.loadedTimeout ?? 15_000 })
    .catch(() => undefined);

  let scanError: unknown;
  let result: AxeResultLike | undefined;
  try {
    result = await expectNoA11yViolations(page, options);
  } catch (err) {
    scanError = err;
  }

  if (options.screenshot && scanError) {
    const png = await page.screenshot({ fullPage: true });
    await test.info().attach('a11y-failure.png', {
      body: png,
      contentType: 'image/png',
    });
  }

  if (scanError) throw scanError;
  return result as AxeResultLike;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function normaliseRules(options: A11yScanOptions): A11yRuleOverrides {
  const merged: A11yRuleOverrides = { ...(options.rules ?? {}) };
  for (const id of options.disableRules ?? []) {
    merged[id] = 'off';
  }
  return merged;
}

function sanitise(name: string): string {
  return (
    name.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'a11y'
  );
}

async function persistReport(result: AxeResultLike): Promise<void> {
  const info: TestInfo = test.info();
  // `test-results/a11y/<test-name>.json`. testInfo.project.outputDir resolves
  // to `test-results/playwright/`, so we hop up one level to keep the a11y
  // reports together regardless of which project ran them.
  const reportDir = path.resolve(info.project.outputDir, '..', 'a11y');
  const fileName = `${sanitise(info.titlePath.join('-'))}-${info.workerIndex}.json`;
  const filePath = path.join(reportDir, fileName);

  const summary = {
    test: info.titlePath.join(' > '),
    project: info.project.name,
    url: result.url,
    timestamp: result.timestamp,
    counts: {
      violations: result.violations.length,
      passes: result.passes.length,
      incomplete: result.incomplete.length,
      inapplicable: result.inapplicable.length,
    },
    violations: result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      description: v.description,
      helpUrl: v.helpUrl,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        html: n.html,
        failureSummary: n.failureSummary ?? null,
      })),
    })),
    incomplete: result.incomplete.map((v) => ({
      id: v.id,
      help: v.help,
      nodes: v.nodes.length,
    })),
  };

  const json = JSON.stringify(summary, null, 2);
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(filePath, json, 'utf8');

  await info.attach('a11y-report.json', {
    body: json,
    contentType: 'application/json',
  });
}

function formatViolations(violations: AxeIssue[], severity: 'error' | 'warn'): string {
  if (violations.length === 0) return 'no violations';
  const heading =
    severity === 'error'
      ? `Found ${violations.length} accessibility violation(s):`
      : `Found ${violations.length} warn-only a11y issue(s) (not failing the test):`;
  return [
    heading,
    ...violations.map((v) => {
      const nodes = v.nodes.length;
      return `  - [${v.id}] ${v.help} (${nodes} node${nodes === 1 ? '' : 's'}) — ${v.helpUrl}`;
    }),
  ].join('\n');
}

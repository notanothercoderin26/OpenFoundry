import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { CheckpointsPage } from './pages';

/**
 * E2E coverage for `/checkpoints`
 * (apps/web/src/routes/checkpoints/CheckpointsPage.tsx).
 *
 * Despite the page-object name, this route is the **Justification
 * Checkpoints** governance dashboard — checkpoints that pause sensitive
 * interactions and capture the user's stated reason — NOT a workspace-
 * snapshot / state-restore tool. That distinction matters because the
 * roadmap framing of "create / restore / delete" maps onto this page
 * as:
 *   - create  → "New checkpoint" editor (CTA ships disabled, Phase 4.x);
 *   - restore → no shipped concept; the page object's `restoreButton`
 *               regex is a reserved slot, not a real surface;
 *   - delete  → no shipped per-row delete affordance.
 *
 * What ships today is purely informational:
 *   - hero strip with h1 + the disabled "New checkpoint" CTA;
 *   - 5-metric stats panel (Checkpoints / Enabled / Prompts (24h) /
 *     Pending review / Flagged);
 *   - a category tablist (`role="tablist"`,
 *     `aria-label="Filter by category"`) with All / Access / Export /
 *     Mutation / Admin chips;
 *   - "Checkpoint definitions (N)" card grid, one
 *     `<article aria-label={name}>` per checkpoint with its trigger
 *     line and quoted prompt;
 *   - a "Recent justifications" `<table>` with When / User /
 *     Checkpoint / Resource / Justification / Review columns.
 *
 * The page is purely client-side (no fetch; filtering via `useState` +
 * `useMemo`), so these specs install no per-test mocks beyond the
 * default catch-all wired by `fixtures/base`. The regression-guard
 * tests at the bottom flip the moment the create / restore / delete
 * surfaces ship.
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
    ],
  },
});

interface CheckpointFixture {
  name: string;
  category: 'access' | 'export' | 'mutation' | 'admin';
  status: 'enabled' | 'paused';
  hits24h: number;
  triggerPrefix: string;
}

const CHECKPOINTS: readonly CheckpointFixture[] = [
  {
    name: 'Export PII dataset',
    category: 'export',
    status: 'enabled',
    hits24h: 14,
    triggerPrefix: 'When a marked-as-PII column',
  },
  {
    name: 'Open restricted dataset view',
    category: 'access',
    status: 'enabled',
    hits24h: 38,
    triggerPrefix: 'When opening a dataset tagged',
  },
  {
    name: 'Bulk-update > 1,000 ontology objects',
    category: 'mutation',
    status: 'enabled',
    hits24h: 5,
    triggerPrefix: 'When a single Action affects more than 1,000 objects',
  },
  {
    name: 'Change marking categories',
    category: 'admin',
    status: 'enabled',
    hits24h: 1,
    triggerPrefix: 'When admins modify marking categories',
  },
  {
    name: 'Share resource with > 50 users',
    category: 'access',
    status: 'paused',
    hits24h: 0,
    triggerPrefix: 'When granting access to a single resource',
  },
] as const;

const TOTAL = CHECKPOINTS.length;
const ENABLED = CHECKPOINTS.filter((c) => c.status === 'enabled');
const ACCESS = CHECKPOINTS.filter((c) => c.category === 'access');

const TOTAL_JUSTIFICATIONS = 5;
const PENDING_REVIEWS = 1;
const FLAGGED_REVIEWS = 1;

test('lists every checkpoint definition with its trigger and quoted prompt', async ({
  authedPage,
}) => {
  const checkpoints = new CheckpointsPage(authedPage);
  await checkpoints.goto();
  await checkpoints.expectLoaded();

  await expect(
    authedPage.getByRole('heading', { level: 1, name: /^justification checkpoints$/i }),
  ).toBeVisible();

  // "Checkpoint definitions (N)" anchors the definitions section count.
  await expect(
    authedPage.getByRole('heading', {
      level: 2,
      name: new RegExp(`checkpoint definitions\\s*\\(${TOTAL}\\)`, 'i'),
    }),
  ).toBeVisible();

  // One <article aria-label={name}> card per definition.
  for (const cp of CHECKPOINTS) {
    const card = authedPage.getByRole('article', { name: cp.name });
    await expect(card).toBeVisible();
    // Trigger line lives inside the card.
    await expect(card).toContainText(cp.triggerPrefix);
    // Status chip surfaces enabled / paused.
    await expect(card).toContainText(cp.status === 'enabled' ? 'Enabled' : 'Paused');
    // Per-card 24h hit count meta line.
    await expect(card).toContainText(`${cp.hits24h} hit(s) in 24h`);
  }
  await expect(authedPage.getByRole('article')).toHaveCount(TOTAL);
});

test('stats panel summarises totals, enabled, prompts and review backlog', async ({
  authedPage,
}) => {
  const checkpoints = new CheckpointsPage(authedPage);
  await checkpoints.goto();

  // Stats panel is the first `.of-panel`. The category tablist + the
  // justifications-table wrapper are also `.of-panel` so scope is
  // necessary to keep numeric matches unambiguous.
  const stats = authedPage.locator('.of-panel').first();

  await expect(stats.getByText('Checkpoints', { exact: true })).toBeVisible();
  await expect(stats.getByText(String(TOTAL), { exact: true })).toBeVisible();

  await expect(stats.getByText('Enabled', { exact: true })).toBeVisible();
  await expect(stats.getByText(String(ENABLED.length), { exact: true })).toBeVisible();

  // Total hits across all checkpoints in the last 24h
  // (14 + 38 + 5 + 1 + 0 = 58).
  const totalHits = CHECKPOINTS.reduce((sum, c) => sum + c.hits24h, 0);
  await expect(stats.getByText('Prompts (24h)', { exact: true })).toBeVisible();
  await expect(stats.getByText(String(totalHits), { exact: true })).toBeVisible();

  // Pending + Flagged come from the justification events, not the
  // checkpoint definitions: 1 pending-review, 1 flagged.
  await expect(stats.getByText('Pending review', { exact: true })).toBeVisible();
  await expect(stats.getByText('Flagged', { exact: true })).toBeVisible();
});

test('the category tablist filters the checkpoint-definitions grid', async ({
  authedPage,
}) => {
  const checkpoints = new CheckpointsPage(authedPage);
  await checkpoints.goto();

  const tablist = authedPage.getByRole('tablist', { name: /filter by category/i });
  await expect(tablist).toBeVisible();
  await expect(tablist.getByRole('tab', { name: /all categories/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // Access bucket → 2 cards (restricted view + mass share).
  await tablist.getByRole('tab', { name: /^access$/i }).click();
  await expect(authedPage.getByRole('article')).toHaveCount(ACCESS.length);
  for (const cp of ACCESS) {
    await expect(authedPage.getByRole('article', { name: cp.name })).toBeVisible();
  }
  // Non-access checkpoints drop out of the grid.
  await expect(
    authedPage.getByRole('article', { name: 'Export PII dataset' }),
  ).toHaveCount(0);
  await expect(
    authedPage.getByRole('heading', {
      level: 2,
      name: new RegExp(`checkpoint definitions\\s*\\(${ACCESS.length}\\)`, 'i'),
    }),
  ).toBeVisible();

  // Export bucket → exactly 1 card.
  await tablist.getByRole('tab', { name: /^export$/i }).click();
  await expect(authedPage.getByRole('article')).toHaveCount(1);
  await expect(
    authedPage.getByRole('article', { name: 'Export PII dataset' }),
  ).toBeVisible();

  // All categories → restore.
  await tablist.getByRole('tab', { name: /all categories/i }).click();
  await expect(authedPage.getByRole('article')).toHaveCount(TOTAL);
});

test('recent-justifications table surfaces the audit trail with review statuses', async ({
  authedPage,
}) => {
  const checkpoints = new CheckpointsPage(authedPage);
  await checkpoints.goto();

  await expect(
    authedPage.getByRole('heading', { level: 2, name: /^recent justifications$/i }),
  ).toBeVisible();

  // Column headers — pin so renames surface here rather than in a
  // downstream stats consumer.
  for (const header of ['When', 'User', 'Checkpoint', 'Resource', 'Justification', 'Review']) {
    await expect(authedPage.getByRole('columnheader', { name: header })).toBeVisible();
  }

  // One row per justification event (5).
  const rows = authedPage.locator('tbody tr');
  await expect(rows).toHaveCount(TOTAL_JUSTIFICATIONS);

  // The pending-review event lives on m.alvarez's PII export row.
  const pending = rows.filter({ hasText: 'm.alvarez' });
  await expect(pending).toContainText('Export PII dataset');
  await expect(pending).toContainText('Pending review');

  // The flagged event lives on n.diaz's restricted-view row.
  const flagged = rows.filter({ hasText: 'n.diaz' });
  await expect(flagged).toContainText('Open restricted dataset view');
  await expect(flagged).toContainText('Flagged');

  // Stats counters agree with the table contents.
  const stats = authedPage.locator('.of-panel').first();
  await expect(
    stats.locator('div').filter({ hasText: /^Pending review$/ }),
  ).toContainText(String(PENDING_REVIEWS));
  await expect(
    stats.locator('div').filter({ hasText: /^Flagged$/ }),
  ).toContainText(String(FLAGGED_REVIEWS));
});

test('the "New checkpoint" CTA ships disabled with a Phase-4.x tooltip', async ({
  authedPage,
}) => {
  const checkpoints = new CheckpointsPage(authedPage);
  await checkpoints.goto();

  // The page object's `newCheckpointButton` matches
  // `/new checkpoint|create/i` — pin the exact CTA label so a silent
  // rename surfaces here, and confirm the disabled state + tooltip.
  const cta = authedPage.getByRole('button', { name: /^new checkpoint$/i });
  await expect(cta).toBeVisible();
  await expect(cta).toBeDisabled();
  await expect(cta).toHaveAttribute('title', /phase 4\.x/i);

  // The page-object alias resolves to the same disabled button.
  await expect(checkpoints.newCheckpointButton).toBeDisabled();
});

test('absent today: restore-checkpoint affordance', async ({ authedPage }) => {
  // Regression guard. The page object reserves `restoreButton` for a
  // roadmap "restore" surface (either "un-pause a paused checkpoint"
  // or — if the area pivots — "restore from snapshot"). Neither ships
  // today; the AppShell does not surface a "Restore" button either,
  // so the page-wide locator is safe.
  const checkpoints = new CheckpointsPage(authedPage);
  await checkpoints.goto();
  await checkpoints.expectLoaded();

  expect(await checkpoints.restoreButton.count()).toBe(0);
});

test('absent today: delete-checkpoint affordance', async ({ authedPage }) => {
  // Regression guard for the roadmap row-level delete. Today neither
  // the card grid nor the audit table exposes a delete / remove
  // button; the only chip-shaped controls are the status / review
  // labels (`<span>`s).
  const checkpoints = new CheckpointsPage(authedPage);
  await checkpoints.goto();
  await checkpoints.expectLoaded();

  const page = authedPage.locator('section.of-page');
  expect(
    await page.getByRole('button', { name: /^(delete|remove|retire|disable)\b/i }).count(),
  ).toBe(0);
});

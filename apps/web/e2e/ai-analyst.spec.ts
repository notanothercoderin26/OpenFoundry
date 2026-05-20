import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/ai/analyst` (apps/web/src/routes/ai/AnalystPage.tsx).
 *
 * **Reality check.** Like its sibling `/ai/assist`, the shipped
 * AnalystPage is a Phase 4.2 roadmap placeholder — the page renders
 * a `<span class="of-chip">Roadmap · Phase 4.2</span>` and the
 * primary CTA carries a tooltip that says "Analyst engine lands in
 * Phase 4.x". Today the page renders:
 *
 *   - A hero with the eyebrow `AI Platform · AI Analyst`, the h1
 *     `AI Analyst`, a muted paragraph, and the "Roadmap · Phase 4.2"
 *     chip.
 *   - A 3-row textarea labelled "Analyst question".
 *   - An inline "Scope: …" summary that tracks which object types
 *     the analyst is restricted to (defaults to "Order, Shipment").
 *   - An `Analyze` button that is **permanently `disabled`**.
 *   - A static "Recent analyses" list seeded from a const
 *     `MOCK_ANALYSES` array (two pre-baked analyses with chips,
 *     a numbered step list, an optional mini bar chart, and a
 *     final answer paragraph).
 *   - A "Scope by object type" aside with 7 toggleable chip buttons
 *     (Order, Shipment, Customer, Driver, Warehouse, Invoice,
 *     Incident). Order + Shipment are pre-selected.
 *
 * The page does NOT (today):
 *   - call any /api/v1/ai/* endpoint;
 *   - render generated SQL or a SQL editor;
 *   - render a tabular result preview;
 *   - expose Run / Save-as Object Set / Saved query controls;
 *   - persist or refresh the "Recent analyses" — it is hard-coded.
 *
 * Per the codebase convention (see `notifications.spec.ts` and
 * `ai-assist.spec.ts`), this spec PINS the shipped placeholder
 * behaviour and adds a regression guard for every roadmap control
 * the user spec'd. Each `absent today: …` test will FAIL loudly the
 * day the feature ships, giving the developer an actionable
 * checklist.
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
    ],
  },
});

// ---------------------------------------------------------------------------
// Shipped placeholder behaviour
// ---------------------------------------------------------------------------

test('renders the placeholder hero, scope picker, and Recent analyses', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/analyst');

  // AppShell stays mounted — `/ai/analyst` is an authenticated route.
  await expect(
    adminPage.getByRole('navigation', { name: /primary navigation/i }),
  ).toBeVisible();

  // Hero: eyebrow + h1 + roadmap chip.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^ai analyst$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/^ai platform · ai analyst$/i),
  ).toBeVisible();
  await expect(adminPage.getByText(/^roadmap · phase 4\.2$/i)).toBeVisible();

  // Chat panel: question textarea + scope summary + Analyze button.
  await expect(adminPage.getByLabel(/^analyst question$/i)).toBeVisible();
  await expect(adminPage.getByText(/^scope: order, shipment$/i)).toBeVisible();
  await expect(
    adminPage.getByRole('button', { name: /^analyze$/i }),
  ).toBeVisible();

  // Recent analyses heading + the 7 scope chip buttons in the aside.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^recent analyses$/i }),
  ).toBeVisible();
  await expect(adminPage.getByText(/^scope by object type$/i)).toBeVisible();
  for (const t of [
    'Order',
    'Shipment',
    'Customer',
    'Driver',
    'Warehouse',
    'Invoice',
    'Incident',
  ]) {
    await expect(
      adminPage.getByRole('button', { name: t, exact: true }),
    ).toBeVisible();
  }
});

test('Analyze button is disabled — the Phase 4.x analyst engine is not wired yet', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/analyst');

  const analyze = adminPage.getByRole('button', { name: /^analyze$/i });

  // Disabled regardless of question state — the component hard-codes
  // `disabled` until the engine lands.
  await expect(analyze).toBeDisabled();
  await adminPage.getByLabel(/^analyst question$/i).fill('test question');
  await expect(analyze).toBeDisabled();

  // The author left a tooltip explaining why; pin the wording so a
  // rename surfaces here when the engine ships.
  await expect(analyze).toHaveAttribute(
    'title',
    /analyst engine lands in phase 4\.x/i,
  );
});

test('scope chips toggle and the inline scope summary tracks the selection', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/analyst');

  const order = adminPage.getByRole('button', { name: 'Order', exact: true });
  const shipment = adminPage.getByRole('button', {
    name: 'Shipment',
    exact: true,
  });
  const customer = adminPage.getByRole('button', {
    name: 'Customer',
    exact: true,
  });

  // Default: Order + Shipment are pre-selected (carry `of-chip-active`),
  // the others are not.
  await expect(order).toHaveClass(/of-chip-active/);
  await expect(shipment).toHaveClass(/of-chip-active/);
  await expect(customer).not.toHaveClass(/of-chip-active/);

  // Adding Customer extends the summary (append-to-end semantics in
  // `toggleType`).
  await customer.click();
  await expect(customer).toHaveClass(/of-chip-active/);
  await expect(
    adminPage.getByText(/^scope: order, shipment, customer$/i),
  ).toBeVisible();

  // Removing Order keeps Shipment + Customer.
  await order.click();
  await expect(order).not.toHaveClass(/of-chip-active/);
  await expect(
    adminPage.getByText(/^scope: shipment, customer$/i),
  ).toBeVisible();

  // De-selecting everything flips the summary to the fallback string.
  await shipment.click();
  await customer.click();
  await expect(adminPage.getByText(/^scope: all ontology types$/i)).toBeVisible();
});

test('renders the seeded Recent analyses with steps, object-type chips, and a chart', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/analyst');

  // First analysis: question + a step list + object-type chips + a bar
  // chart with four warehouses + the answer paragraph.
  await expect(
    adminPage.getByText(/which warehouses missed their on-time/i),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/found 1,402 shipment objects/i),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/grouped by warehouse, computed on_time_rate/i),
  ).toBeVisible();
  await expect(adminPage.getByText(/berlin north leads the regressions/i)).toBeVisible();
  // Chart rows surface as `<label, bar, value>` triplets. Pin each
  // labelled row so a renamed warehouse or a missing series surfaces.
  for (const label of ['Berlin North', 'Lyon Central', 'Madrid East', 'Warsaw Hub']) {
    await expect(adminPage.getByText(label, { exact: true })).toBeVisible();
  }

  // Second analysis: question + answer + no chart (the second entry's
  // `chart` field is undefined). Pinning the answer is enough — the
  // mini chart's absence is implied by the smaller article height.
  await expect(
    adminPage.getByText(/show me incident counts by severity/i),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/severity-1 incidents trended down/i),
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// Regression guards for the roadmap features that aren't shipped yet
// ---------------------------------------------------------------------------

test('absent today: no NL→SQL output, SQL editor, Run button, or result table', async ({
  adminPage,
}) => {
  // The roadmap calls for the analyst to surface generated SQL in a
  // Monaco editor, expose a separate Run button, and render the
  // returned rows as a table. Today none of that exists — the only
  // affordance is the disabled "Analyze" CTA.
  await adminPage.goto('/ai/analyst');

  // No SQL output panel — pin the absence of common labels.
  expect(
    await adminPage.getByText(/generated sql|sql preview|query plan/i).count(),
  ).toBe(0);

  // No Monaco-mounted editor.
  expect(await adminPage.locator('.monaco-editor').count()).toBe(0);

  // No `Run` / `Execute` button distinct from `Analyze`.
  expect(
    await adminPage.getByRole('button', { name: /^(run|execute|run query)$/i }).count(),
  ).toBe(0);

  // No `<table>` rendered as a result-set preview.
  expect(await adminPage.getByRole('table').count()).toBe(0);
});

test('absent today: Save-as-Object-Set and Saved-query controls', async ({
  adminPage,
}) => {
  // The roadmap surfaces two persistence affordances once an analysis
  // has produced results: "Save as Object Set" (materialises the
  // filtered set into the ontology) and "Save query" (preserves the
  // NL prompt + SQL for re-runs). Pin the absence of both.
  await adminPage.goto('/ai/analyst');

  expect(
    await adminPage
      .getByRole('button', { name: /save as object set|save object set/i })
      .count(),
  ).toBe(0);
  expect(
    await adminPage
      .getByRole('button', { name: /save query|save as query|save analysis/i })
      .count(),
  ).toBe(0);
});

test('absent today: no API request on mount or on Analyze — history is local mock', async ({
  adminPage,
}) => {
  // The "Recent analyses" list today is a hard-coded `MOCK_ANALYSES`
  // const — it does not refresh, persist, or arrive from the server.
  // Pin (1) the absence of any /ai/* request on mount, (2) the
  // absence of any /ai/* request after typing + clicking the (still
  // disabled) Analyze button, and (3) that the seeded entries are
  // present without any network round-trip.
  const aiCalls = captureRequests(adminPage, /\/api\/v1\/ai\//);

  await adminPage.goto('/ai/analyst');

  // No request on mount.
  await adminPage.waitForTimeout(300);
  expect(aiCalls.count()).toBe(0);

  // Typing + attempting to submit shouldn't trigger anything either —
  // the button is disabled so the click is a no-op.
  await adminPage
    .getByLabel(/^analyst question$/i)
    .fill('Which orders are late?');
  await adminPage
    .getByRole('button', { name: /^analyze$/i })
    .click({ force: true });
  await adminPage.waitForTimeout(300);
  expect(aiCalls.count()).toBe(0);

  // The seeded analyses still render — proving the list is local data.
  await expect(
    adminPage.getByText(/which warehouses missed their on-time/i),
  ).toBeVisible();
});

test('absent today: query history is not interactive (no replay, expand, or delete)', async ({
  adminPage,
}) => {
  // The seeded `<article>` cards aren't `<button>`s and aren't wrapped
  // in any onClick handler — they're read-only panels. Pin the
  // absence of common per-row affordances so a partial implementation
  // (delete added, replay missing) surfaces here.
  await adminPage.goto('/ai/analyst');

  expect(
    await adminPage
      .getByRole('button', { name: /replay|re-run|run again/i })
      .count(),
  ).toBe(0);
  expect(
    await adminPage
      .getByRole('button', { name: /delete analysis|delete query/i })
      .count(),
  ).toBe(0);
  expect(
    await adminPage
      .getByRole('button', { name: /expand|view details|view trace/i })
      .count(),
  ).toBe(0);
});

import { test, expect, DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';

/**
 * E2E coverage for `/aip-evals`
 * (apps/web/src/routes/aip-evals/AipEvalsPage.tsx).
 *
 * **Reality vs roadmap.** The shipped page is a 4 000-line CLIENT-SIDE
 * playground for evaluation suites: every suite, test case, evaluator
 * mapping, and run lives in `useState`. There are NO `/api/v1/evals/*`
 * fetches — the page seeds three demo suites on mount, and "running"
 * a suite is a synchronous call into `runEvaluationSuiteBuiltIns` from
 * `lib/evals/builtins.ts` that pushes a result into `suite.runHistory`.
 * Consequently:
 *
 *   - There is no "test dataset" picker. The roadmap's "dataset de
 *     prueba" maps to the suite's `target functions` (Function RID +
 *     kind), and the test cases (rows) are added per-suite after the
 *     suite is created. The Create-suite form ships only Source /
 *     Target kind / Function RID / Name / Description fields plus
 *     "Create suite" and "Ontology edit suite" buttons.
 *   - There is no "métricas" picker on the create form. Evaluators
 *     default to `exact_match` and can be swapped per-suite later.
 *   - "Run evaluation suite" runs synchronously; there is NO progress
 *     bar, no spinner, no streaming "running…" state — just a "Run
 *     result" panel that appears once the helper returns.
 *   - "Run-to-run comparison" placeholder shows until two runs exist;
 *     after the second run the panel renders with Base / Head selects.
 *   - There is NO "Export results" / "Download CSV" / "Copy JSON"
 *     button. The shipped "Results dataset" panel exposes only the
 *     dataset RID and a JSON preview block.
 *
 * Tests below pin the shipped behaviour for the four slices that DO
 * ship (list, create, run, compare-after-two-runs) and regression-
 * guard the export control that's still missing.
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      // The page is heavy; React Suspense + lazy chunks log a few
      // benign warnings during navigation we don't want to mask real
      // regressions.
      /No `HydrateFallback` element provided/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
    ],
  },
});

// ---------------------------------------------------------------------------
// 1. Lista de eval suites
// ---------------------------------------------------------------------------

test('seeds three demo suites in the "List and lifecycle" panel with active chips and meta lines', async ({
  adminPage,
}) => {
  await adminPage.goto('/aip-evals');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^evaluation suites$/i }),
  ).toBeVisible();

  // Active/archived chip counters in the page header.
  await expect(adminPage.getByText(/^3 active$/)).toBeVisible();
  await expect(adminPage.getByText(/^0 archived$/)).toBeVisible();

  // Each seeded suite renders as a button in the list.
  const ontologySuite = adminPage.getByRole('button', {
    name: /Ontology edit simulation suite/,
  });
  const previewSuite = adminPage.getByRole('button', {
    name: /Customer triage preview checks/,
  });
  const multiTargetSuite = adminPage.getByRole('button', {
    name: /Multi-target comparison suite/,
  });

  await expect(ontologySuite).toBeVisible();
  await expect(previewSuite).toBeVisible();
  await expect(multiTargetSuite).toBeVisible();

  // The meta line on each row reports source · targets · cases ·
  // object sets · evaluators. The preview suite uses the
  // "Logic preview" source surface with a single target/case.
  await expect(previewSuite).toContainText(/Logic preview/);
  await expect(previewSuite).toContainText(/1 target/);
  await expect(previewSuite).toContainText(/1 case/);

  // The first suite is selected by default — its name shows up as
  // an h2 heading under "Selected suite".
  await expect(
    adminPage.getByRole('heading', { level: 2, name: 'Ontology edit simulation suite' }),
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// 2. Crear suite — name + target function + (implicit) exact_match metric
// ---------------------------------------------------------------------------

test('Create suite: filling Name + Function RID and clicking "Create suite" appends a new selected suite', async ({
  adminPage,
}) => {
  await adminPage.goto('/aip-evals');

  // Scope to the Create-suite panel so we don't accidentally type into
  // a test-case Name input lower down the page.
  const createPanel = adminPage
    .locator('section.of-panel')
    .filter({ has: adminPage.getByRole('button', { name: /^Create suite$/ }) })
    .first();

  // Fill the Function RID first (the placeholder is the demo value).
  const functionInput = createPanel.getByPlaceholder(/logic\.customer-triage/);
  await functionInput.fill('logic.payment-fraud');

  // Name + description. The label structure is
  // `<label><span>Name</span><input/></label>`, so getByLabel works.
  const nameInput = createPanel.getByLabel(/^name$/i);
  await nameInput.fill('Payment fraud regression suite');
  const descriptionInput = createPanel.getByLabel(/^description$/i);
  await descriptionInput.fill('E2E coverage for the payment fraud Logic function.');

  await createPanel.getByRole('button', { name: /^Create suite$/ }).click();

  // The new suite jumps to the top of the list, becomes the selected
  // suite (its name appears as the level-2 "Selected suite" heading),
  // and bumps the active counter from 3 → 4.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: 'Payment fraud regression suite' }),
  ).toBeVisible();

  await expect(adminPage.getByText(/^4 active$/)).toBeVisible();

  // The seeded "exact_match" evaluator ships with new suites built
  // from a single target — confirm it shows up in the evaluators
  // section so the "métricas" leg of the roadmap is at least
  // implicitly covered today.
  await expect(
    adminPage.getByRole('heading', { name: 'Payment fraud regression suite' }).first(),
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// 3. Ejecutar eval → results panel (synchronous, no progress UI)
// ---------------------------------------------------------------------------

test('"Run evaluation suite" runs the suite synchronously and renders a Run result + Results table', async ({
  adminPage,
}) => {
  await adminPage.goto('/aip-evals');

  // The default selected suite is the Ontology edit suite, which has
  // a complex multi-output target. Switch to the simpler
  // "Customer triage preview checks" so the run helper produces a
  // predictable single-target result.
  await adminPage
    .getByRole('button', { name: /Customer triage preview checks/ })
    .click();
  await expect(
    adminPage.getByRole('heading', { level: 2, name: 'Customer triage preview checks' }),
  ).toBeVisible();

  // Pre-run: the run result panel + results table both show their
  // empty-state copy.
  await expect(
    adminPage.locator('p.of-eyebrow', { hasText: /^Run configuration$/ }),
  ).toBeVisible();
  await expect(adminPage.getByText(/^No suite run yet$/)).toBeVisible();
  await expect(
    adminPage.getByText(/Run the suite to see per-iteration results/i),
  ).toBeVisible();

  // Trigger the run — the helper is synchronous, no progress UI.
  await adminPage.getByRole('button', { name: /^Run evaluation suite$/ }).click();

  // The "Run result" panel now renders: a pass/fail/error chip + a
  // "<passCount>/<totalCount> test cases" strong line + a duration
  // suffix ("<n> ms · <formatted date>").
  await expect(
    adminPage.locator('p.of-eyebrow', { hasText: /^Run result$/ }),
  ).toBeVisible();

  // The results table panel switches from its empty-state copy to a
  // populated table with a "Test case" column header. Use the
  // results-table aggregate line as the wait condition.
  await expect(
    adminPage.locator('p.of-eyebrow', { hasText: /^Results table$/ }),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/iterations passed/i).first(),
  ).toBeVisible();

  // Regression guard: no progress bar / spinner / "running…" status.
  expect(await adminPage.getByRole('progressbar').count()).toBe(0);
  expect(await adminPage.getByText(/running…|running\.\.\./i).count()).toBe(0);
});

// ---------------------------------------------------------------------------
// 4. Comparar runs — placeholder before two runs, panel after two runs
// ---------------------------------------------------------------------------

test('Run-to-run comparison: placeholder until two runs exist, then renders Base/Head selects', async ({
  adminPage,
}) => {
  await adminPage.goto('/aip-evals');

  await adminPage
    .getByRole('button', { name: /Customer triage preview checks/ })
    .click();

  // Before any run: the comparison panel shows its placeholder copy.
  await expect(
    adminPage.getByText(
      /Run the suite at least twice to compare aggregate metrics, status changes, and evaluator output differences\./i,
    ),
  ).toBeVisible();

  // After ONE run the placeholder still stands (runHistory.length === 1
  // is still < 2).
  await adminPage.getByRole('button', { name: /^Run evaluation suite$/ }).click();
  await expect(
    adminPage.locator('p.of-eyebrow', { hasText: /^Run result$/ }),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/Run the suite at least twice to compare/i),
  ).toBeVisible();

  // Run a SECOND time — the placeholder is replaced by the populated
  // comparison panel with Base + Head select dropdowns.
  await adminPage.getByRole('button', { name: /^Run evaluation suite$/ }).click();
  await expect(
    adminPage.getByText(/Run the suite at least twice to compare/i),
  ).toHaveCount(0);

  // The eyebrow "Run-to-run comparison" still exists, but the panel
  // body now shows "Pick two runs to compare" together with the
  // Base / Head selects. The `<select>` lands in the accessibility
  // tree with role `combobox` and an accessible name of "Base" /
  // "Head" (the wrapping `<label>` provides the name), so target by
  // role to avoid colliding with the dozens of other selects on the
  // 4 000-line page.
  await expect(adminPage.getByText(/^Pick two runs to compare$/)).toBeVisible();

  const baseSelect = adminPage.getByRole('combobox', { name: /^Base$/ });
  const headSelect = adminPage.getByRole('combobox', { name: /^Head$/ });

  await expect(baseSelect).toBeVisible();
  await expect(headSelect).toBeVisible();

  // Selecting both populates the comparison header — the placeholder
  // turns into "X newly passed · Y newly failed".
  const options = baseSelect.locator('option');
  // The first option is the empty "— select run —" placeholder; the
  // next two are the actual runs (most recent first).
  await expect.poll(() => options.count()).toBeGreaterThanOrEqual(3);
  const baseValue = await options.nth(1).getAttribute('value');
  const headValue = await options.nth(2).getAttribute('value');
  expect(baseValue).toBeTruthy();
  expect(headValue).toBeTruthy();
  await baseSelect.selectOption(baseValue!);
  await headSelect.selectOption(headValue!);

  // "0 newly passed · 0 newly failed" appears twice — once as the
  // panel-header `<strong>` summary, once as a status row. Either
  // one proves the comparison rendered.
  await expect(
    adminPage.getByText(/newly passed.*newly failed/i).first(),
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// 5. Exportar resultados — regression guard
// ---------------------------------------------------------------------------

test('absent today: Export / Download / Copy results CTA on a completed run (only the dataset RID is surfaced)', async ({
  adminPage,
}) => {
  await adminPage.goto('/aip-evals');

  await adminPage
    .getByRole('button', { name: /Customer triage preview checks/ })
    .click();
  await adminPage.getByRole('button', { name: /^Run evaluation suite$/ }).click();
  await expect(
    adminPage.locator('p.of-eyebrow', { hasText: /^Run result$/ }),
  ).toBeVisible();

  // The shipped run UI never offers any user-initiated export — no
  // download link, no CSV/JSON copy button, no "Export results" CTA.
  // When the feature lands, each assertion below flips and the test
  // forces coverage to catch up.
  expect(await adminPage.getByRole('button', { name: /^export/i }).count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^download/i }).count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^copy (results|json|csv)/i }).count()).toBe(0);
  expect(await adminPage.getByRole('link', { name: /download (results|csv|json)/i }).count()).toBe(0);

  // The only export-adjacent surface today is the "Results dataset"
  // RID info panel. The eyebrow appears under the SuiteJsonBlock list
  // below the run; the page seeds `resultsDatasetRid` as
  // `ri.foundry.dataset.<hash>` per suite. Pin its visibility so a
  // regression that yanks the RID display also fails this test.
  await expect(
    adminPage.locator('p.of-eyebrow', { hasText: /^Results dataset$/ }).first(),
  ).toBeVisible();
});

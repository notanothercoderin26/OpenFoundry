import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { LogicAuthoringPage } from './pages';

/**
 * E2E coverage for `/logic`
 * (apps/web/src/routes/logic/LogicAuthoringPage.tsx).
 *
 * **Reality vs roadmap.** The roadmap describes a Monaco-backed
 * Cedar/DSL editor with autocomplete + inline lint diagnostics. The
 * shipped page is something else entirely — a *form-based block
 * builder*:
 *
 *   - Three editor tabs (Inputs / Blocks / Outputs) wire React
 *     forms over `LogicInputDefinition` / `LogicLlmBlockConfig` /
 *     `LogicOutputDefinition`. No code editor, no Cedar, no
 *     autocomplete dropdown.
 *   - Validation is local + synchronous via `validateLogicInputBoard`,
 *     `validateLlmBlock`, etc. Issues surface as `StatusPill` chips
 *     plus a warning list — the page's analog to "inline lint".
 *   - The "Run draft" button in the RunPanel executes
 *     `executeDraftLogicPreview` purely in-memory; there is no API
 *     call. Same for "Save draft" (appends to `versionHistory`) and
 *     "Publish" (promotes the latest version + auto-switches the
 *     right rail to "Uses").
 *
 * Because every action is local state, this spec doesn't install any
 * API mocks beyond the default catch-all from `installDefaultApiMocks`.
 * The `LogicAuthoringPage` page object declares `editor` /
 * `newRuleButton` / `versionDropdown` Monaco locators that are
 * aspirational and never resolve — pinned in the absent-today guard.
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /^console\.error: %o$/,
      /Failed to load/i,
    ],
  },
});

test('renders the AIP Logic toolbar, the three editor tabs, and the resource rail', async ({
  adminPage,
}) => {
  const page = new LogicAuthoringPage(adminPage);
  await page.goto();
  await page.expectLoaded();

  // Toolbar.
  await expect(adminPage.getByText(/^AIP Logic$/)).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /Customer triage logic/i }),
  ).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^save draft$/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^publish$/i }).first()).toBeVisible();

  // Status pill mirrors the initial `validateLogicInputBoard` result —
  // SAMPLE_INPUTS is intentionally clean, so the pill reads
  // "ready to run".
  await expect(adminPage.getByText(/^ready to run$/i)).toBeVisible();

  // Three editor tabs. They are `<button class="of-tab">` with the
  // capitalised tab name as the only label, so a button-role match
  // works.
  for (const label of ['Inputs', 'Blocks', 'Outputs']) {
    await expect(
      adminPage.getByRole('button', { name: new RegExp(`^${label}$`) }),
    ).toBeVisible();
  }

  // Right rail exposes the ten resource entry points.
  const rail = adminPage.getByRole('complementary', { name: /logic resource entry points/i });
  for (const entry of [
    'Uses',
    'Automations',
    'Evaluations',
    'Run history',
    'Version history',
    'Branching',
    'Metrics',
    'Compute',
    'Execution settings',
    'Security',
  ]) {
    await expect(rail.getByRole('button', { name: new RegExp(`^${entry}\\b`) })).toBeVisible();
  }
});

test('switching the editor tabs swaps the Inputs / Blocks / Outputs board', async ({
  adminPage,
}) => {
  const page = new LogicAuthoringPage(adminPage);
  await page.goto();

  // The "inputs" tab is the default — the InputsBoard's `Logic inputs`
  // eyebrow is the most stable anchor for that panel.
  await expect(adminPage.getByText(/^Logic inputs$/i)).toBeVisible();

  // Switch to Blocks → the Use-LLM panel mounts with the seeded
  // SAMPLE_LLM_BLOCK name.
  await adminPage.getByRole('button', { name: /^Blocks$/ }).click();
  await expect(adminPage.getByText(/^Use LLM block$/i)).toBeVisible();
  await expect(adminPage.getByText(/Summarize customer risk/)).toBeVisible();
  await expect(adminPage.getByText(/^Logic inputs$/i)).toHaveCount(0);

  // Switch to Outputs → the OutputsBoard renders the SAMPLE_FINAL
  // output ("Final answer") plus the intermediate-parameter
  // controls.
  await adminPage.getByRole('button', { name: /^Outputs$/ }).click();
  await expect(adminPage.getByText(/Final answer/i).first()).toBeVisible();
  await expect(adminPage.getByText(/^Use LLM block$/i)).toHaveCount(0);

  // Back to Inputs.
  await adminPage.getByRole('button', { name: /^Inputs$/ }).click();
  await expect(adminPage.getByText(/^Logic inputs$/i)).toBeVisible();
});

test('inline validation: clearing the API name on a Logic input flips the selected-input pill to "needs attention"', async ({
  adminPage,
}) => {
  // This is the closest thing the shipped page has to "lint errors
  // inline" — the form runs `validateLogicInputDefinition` on every
  // change and reflects the result in a StatusPill plus a warning
  // list. The roadmap's Monaco red-squiggles do not ship today.
  const page = new LogicAuthoringPage(adminPage);
  await page.goto();

  // Pre-state: SAMPLE_INPUTS is clean, so the selected-input pill
  // says "valid".
  await expect(adminPage.getByText(/^valid$/i).first()).toBeVisible();

  // The "API name" textbox is the second labelled control in the
  // selected-input form (Display name first, API name second). Use
  // the label inside the Selected-input panel for an unambiguous
  // pick.
  const selectedInputPanel = adminPage.locator('div.of-panel-muted', {
    has: adminPage.getByText(/^Selected input$/i),
  });
  const apiNameField = selectedInputPanel.locator('label', { hasText: 'API name' });
  await apiNameField.locator('input').fill('');

  // Pill flips to the warning tone.
  await expect(adminPage.getByText(/^needs attention$/i)).toBeVisible();
  // The warning list materialises with the validator's message.
  await expect(adminPage.getByText(/^Validation$/)).toBeVisible();
});

test('"Run draft" executes the preview and shows the result + duration + recent run row', async ({
  adminPage,
}) => {
  const page = new LogicAuthoringPage(adminPage);
  await page.goto();

  // Pre-state: the Run panel exists but no run has executed yet.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /Draft preview execution/i }),
  ).toBeVisible();
  await expect(adminPage.getByText(/No draft run yet\./i)).toBeVisible();
  await expect(adminPage.getByText(/Runs from this draft session appear here\./i)).toBeVisible();

  // Click "Run draft" — primary button in the RunPanel.
  await adminPage.getByRole('button', { name: /^Run draft$/i }).click();

  // Latest-result panel updates: placeholder copy disappears and a
  // "Duration" row appears.
  await expect(adminPage.getByText(/No draft run yet\./i)).toHaveCount(0);
  await expect(adminPage.getByText(/^Duration$/)).toBeVisible();
  await expect(adminPage.getByText(/^Run ID$/)).toBeVisible();

  // Recent-runs list now has at least one button row (a run rendered
  // as a button with id text).
  await expect(adminPage.getByText(/Runs from this draft session appear here\./i)).toHaveCount(0);

  // Re-running re-uses the same run-handler — "Rerun latest" should
  // now be enabled (it was disabled before any run existed).
  await expect(adminPage.getByRole('button', { name: /^Rerun latest$/i })).toBeEnabled();
});

test('"Save draft" creates a new version and switches the rail to Version history', async ({
  adminPage,
}) => {
  const page = new LogicAuthoringPage(adminPage);
  await page.goto();

  // The seed history has a single v7 row. After "Save draft", v8 is
  // prepended.
  await adminPage.getByRole('button', { name: /^Save draft$/i }).click();

  // The activeRail is set to "Version history" by saveDraftVersion(),
  // so the panel mounts. Its h2 is "Save, publish, and compare".
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /Save, publish, and compare/i }),
  ).toBeVisible();

  // Both the seed version and the newly created one are listed. The
  // Saved-versions panel shows them as `v<number>` strong labels.
  const savedVersionsPanel = adminPage.locator('div.of-panel-muted', {
    has: adminPage.getByText(/^Saved versions$/),
  });
  await expect(savedVersionsPanel.getByText(/^v7$/)).toBeVisible();
  await expect(savedVersionsPanel.getByText(/^v8$/)).toBeVisible();
  await expect(savedVersionsPanel.getByText(/^2 total$/)).toBeVisible();
});

test('"Publish" promotes the draft, switches the rail to Uses, and shows the callable function RID', async ({
  adminPage,
}) => {
  const page = new LogicAuthoringPage(adminPage);
  await page.goto();

  // Pre-publish, the toolbar Publish button is enabled and the page
  // is on the default "Version history" rail (the seed value of
  // `activeRail`).
  const publishToolbarButton = adminPage.getByRole('button', { name: /^publish$/i }).first();
  await expect(publishToolbarButton).toBeEnabled();
  await publishToolbarButton.click();

  // publishCurrentVersion() switches activeRail to "Uses", so the
  // UsesPanel ("Published function surfaces") mounts.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /Published function surfaces/i }),
  ).toBeVisible();

  // The published RID is hard-coded as `logic.customer-triage` (line
  // ~2602 of LogicAuthoringPage.tsx). It surfaces as the status pill
  // text "Callable logic.customer-triage".
  await expect(adminPage.getByText(/Callable logic\.customer-triage/i)).toBeVisible();

  // The "Publish required" placeholder is gone now that we've
  // published.
  await expect(adminPage.getByText(/^Publish required$/)).toHaveCount(0);
});

test('absent today: no Monaco code editor, no Cedar/DSL surface, no autocomplete listbox', async ({
  adminPage,
}) => {
  // Regression guard. The LogicAuthoringPage page object declares
  // `editor = .monaco-editor` + `newRuleButton` + `versionDropdown`
  // locators that match nothing in today's DOM — the shipped editor
  // is a forms-based block builder. The roadmap calls for a Monaco
  // Cedar editor with autocomplete + inline lint; until that ships,
  // pin the gaps here so a half-shipped migration surfaces.
  const page = new LogicAuthoringPage(adminPage);
  await page.goto();
  await page.expectLoaded();

  // 1. No Monaco editor DOM. Monaco renders a wrapper with
  //    `class="monaco-editor"`; absence is the test.
  await expect(adminPage.locator('.monaco-editor')).toHaveCount(0);

  // 2. No textbox claiming to be a code editor.
  expect(
    await adminPage.getByRole('textbox', { name: /code editor|cedar|policy editor/i }).count(),
  ).toBe(0);

  // 3. No autocomplete listbox surface. Monaco's intellisense renders
  //    a `role="listbox"` or `role="menu"` overlay with class
  //    `monaco-list`; both are absent.
  expect(await adminPage.getByRole('listbox').count()).toBe(0);
  await expect(adminPage.locator('.monaco-list, .suggest-widget')).toHaveCount(0);

  // 4. No Cedar / DSL keywords appear anywhere in the rendered text.
  //    Use a regex that requires word boundaries so we don't false-
  //    positive on JSON snippets containing the literal "permit".
  await expect(adminPage.getByText(/\bCedar\b/)).toHaveCount(0);
  await expect(adminPage.getByText(/\bpermit\s*\(/)).toHaveCount(0);

  // 5. No "New rule" CTA — the page builds blocks, not rules.
  expect(
    await adminPage.getByRole('button', { name: /^new rule$|^create rule$/i }).count(),
  ).toBe(0);
});

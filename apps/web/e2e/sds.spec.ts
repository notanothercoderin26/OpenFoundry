import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { SensitiveDataScannerPage } from './pages';

/**
 * E2E coverage for `/sds` — the Sensitive Data Scanner placeholder
 * (apps/web/src/routes/sds/SensitiveDataScannerPage.tsx).
 *
 * **Reality vs roadmap.** The shipped page is a *static placeholder*
 * driven by hardcoded `PATTERNS` / `SCANS` / `FINDINGS` constants —
 * no API calls, no scan launcher, no per-finding drill-down to the
 * offending row, no "mark as false positive" affordance, and no
 * custom-rule editor. The only interactive control is the severity
 * tablist over the Findings table.
 *
 * The `SensitiveDataScannerPage` page-object's `newScanButton` /
 * `runScanButton` / `falsePositiveButton` / `rulesButton` locators
 * reflect the roadmap intent. The absent-today guard pins all four.
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

test('renders hero, KPI strip, Pattern library, Recent scans table, and Findings panel', async ({
  adminPage,
}) => {
  const page = new SensitiveDataScannerPage(adminPage);
  await page.goto();
  await page.expectLoaded();

  // Hero eyebrow + h1.
  await expect(adminPage.getByText(/Security & Governance · Sensitive Data Scanner/i)).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^Sensitive Data Scanner$/ }),
  ).toBeVisible();

  // KPI labels.
  for (const label of ['Findings', 'Critical', 'Scans configured', 'Patterns enabled']) {
    await expect(adminPage.getByText(new RegExp(`^${label}$`)).first()).toBeVisible();
  }

  // Section headings.
  await expect(adminPage.getByRole('heading', { level: 2, name: /^Pattern library$/ })).toBeVisible();
  await expect(adminPage.getByRole('heading', { level: 2, name: /^Recent scans$/ })).toBeVisible();
  // "Findings" appears as the KPI label AND the section h2 — pin
  // the heading explicitly.
  await expect(adminPage.getByRole('heading', { level: 2, name: /^Findings$/ })).toBeVisible();

  // Two tables ship: Recent scans + Findings.
  await expect(adminPage.getByRole('table')).toHaveCount(2);
});

test('Recent scans table lists all four mocked scans with cadence, row count, findings, and status chips', async ({
  adminPage,
}) => {
  const page = new SensitiveDataScannerPage(adminPage);
  await page.goto();

  const scansTable = adminPage
    .getByRole('table')
    .filter({ has: adminPage.getByRole('columnheader', { name: /^Cadence$/ }) });
  await expect(scansTable).toBeVisible();

  // Header columns. Use exact: true — getByRole's substring match
  // would otherwise treat "Scan" as a prefix of "Rows scanned".
  for (const h of ['Scan', 'Cadence', 'Datasets', 'Rows scanned', 'Findings', 'Duration', 'Status', 'When']) {
    await expect(scansTable.getByRole('columnheader', { name: h, exact: true })).toBeVisible();
  }

  // 4 mocked scans + the header row = 5 rows total.
  await expect(scansTable.getByRole('row')).toHaveCount(5);

  // Scan names render as the leading cell.
  for (const name of [
    'gold/* continuous',
    'silver/payouts-2026-q2',
    'bronze/raw-stripe-events',
    'partner-uploads/*',
  ]) {
    await expect(scansTable.getByText(name, { exact: true })).toBeVisible();
  }

  // Status chips per row: Succeeded (×2) / Running / Failed.
  await expect(scansTable.getByText(/^Succeeded$/).first()).toBeVisible();
  await expect(scansTable.getByText(/^Running$/)).toBeVisible();
  await expect(scansTable.getByText(/^Failed$/)).toBeVisible();

  // Cadence labels for each scan.
  await expect(scansTable.getByText(/^Continuous$/)).toBeVisible();
  await expect(scansTable.getByText(/^Daily$/)).toBeVisible();
  await expect(scansTable.getByText(/^Weekly$/)).toBeVisible();
  await expect(scansTable.getByText(/^Manual$/)).toBeVisible();

  // The continuous scan reports 14 findings; the running scan's
  // duration shows "—" (the dash placeholder for null durations).
  await expect(scansTable.getByText(/^14$/)).toBeVisible();
  await expect(scansTable.getByText(/^—$/)).toBeVisible();
});

test('Pattern library renders the seven PII pattern cards with regulation + severity + enabled state', async ({
  adminPage,
}) => {
  const page = new SensitiveDataScannerPage(adminPage);
  await page.goto();

  // Each pattern is an `<article aria-label="<name>">`.
  for (const name of [
    'Email address',
    'Credit card (PAN)',
    'US Social Security',
    'IBAN',
    'Phone number',
    'Medical record number',
    'Passport number',
  ]) {
    await expect(adminPage.getByRole('article', { name })).toBeVisible();
  }

  // The MRN card is disabled; the rest are enabled. Pin the
  // enabled/disabled state via the caption text.
  const mrnCard = adminPage.getByRole('article', { name: 'Medical record number' });
  await expect(mrnCard.getByText(/^Disabled$/)).toBeVisible();
  await expect(mrnCard.getByText(/^HIPAA$/)).toBeVisible();

  const ccCard = adminPage.getByRole('article', { name: 'Credit card (PAN)' });
  await expect(ccCard.getByText(/^Enabled in this enrollment$/)).toBeVisible();
  await expect(ccCard.getByText(/^PCI-DSS$/)).toBeVisible();
  // Critical-severity chip on the PAN card.
  await expect(ccCard.getByText(/^Critical$/)).toBeVisible();

  // Email card carries a High severity chip + the GDPR · CCPA copy.
  const emailCard = adminPage.getByRole('article', { name: 'Email address' });
  await expect(emailCard.getByText(/^GDPR · CCPA$/)).toBeVisible();
  await expect(emailCard.getByText(/^High$/)).toBeVisible();
});

test('Severity tablist: selecting "Critical" narrows the Findings table to the two critical findings; "All" restores them', async ({
  adminPage,
}) => {
  const page = new SensitiveDataScannerPage(adminPage);
  await page.goto();

  // Find the Findings table by its unique column header.
  const findingsTable = adminPage
    .getByRole('table')
    .filter({ has: adminPage.getByRole('columnheader', { name: /^Match ratio$/ }) });

  // Default: All severities — 5 mocked findings + header = 6 rows.
  const allTab = adminPage.getByRole('tab', { name: /^All$/ });
  await expect(allTab).toHaveAttribute('aria-selected', 'true');
  await expect(findingsTable.getByRole('row')).toHaveCount(6);

  // Switch to Critical — only the PAN + SSN findings survive
  // (2 mocked critical findings + header = 3 rows).
  await adminPage
    .getByRole('tablist', { name: /Filter findings by severity/i })
    .getByRole('tab', { name: /^Critical$/ })
    .click();

  await expect(findingsTable.getByRole('row')).toHaveCount(3);
  // The critical findings reference Credit card (PAN) + US Social Security.
  await expect(findingsTable.getByText(/^Credit card \(PAN\)$/)).toBeVisible();
  await expect(findingsTable.getByText(/^US Social Security$/)).toBeVisible();
  // Email finding (High severity) is filtered out.
  await expect(findingsTable.getByText(/^Email address$/)).toHaveCount(0);

  // Back to All.
  await adminPage
    .getByRole('tablist', { name: /Filter findings by severity/i })
    .getByRole('tab', { name: /^All$/ })
    .click();
  await expect(findingsTable.getByRole('row')).toHaveCount(6);
  await expect(findingsTable.getByText(/^Email address$/)).toBeVisible();
});

test('Findings table exposes dataset + column drill-down metadata + applied-action chip per finding', async ({
  adminPage,
}) => {
  const page = new SensitiveDataScannerPage(adminPage);
  await page.goto();

  const findingsTable = adminPage
    .getByRole('table')
    .filter({ has: adminPage.getByRole('columnheader', { name: /^Match ratio$/ }) });

  // Column headers.
  for (const h of ['When', 'Pattern', 'Severity', 'Dataset · Column', 'Match ratio', 'Samples', 'Action']) {
    await expect(findingsTable.getByRole('columnheader', { name: h })).toBeVisible();
  }

  // Per-finding dataset paths render in monospace; columns render
  // as the caption beneath. These are the page's "drill-down"
  // affordance today — a textual pointer at the dataset + column,
  // not a clickable navigation to the offending row.
  await expect(findingsTable.getByText(/^gold\/customers$/)).toBeVisible();
  await expect(findingsTable.getByText(/^preferences_blob$/)).toBeVisible();

  await expect(findingsTable.getByText(/^bronze\/raw-stripe-events$/)).toBeVisible();
  await expect(findingsTable.getByText(/^last4$/)).toBeVisible();

  await expect(findingsTable.getByText(/^partner-uploads\/acme$/)).toBeVisible();
  await expect(findingsTable.getByText(/^document_text$/)).toBeVisible();

  // Match-ratio renders as a percentage with two decimals.
  await expect(findingsTable.getByText(/^8\.20%$/)).toBeVisible();
  await expect(findingsTable.getByText(/^0\.01%$/)).toBeVisible();

  // Applied-action chips per finding (Masked / Quarantined /
  // Flagged are the three mocked outcomes).
  await expect(findingsTable.getByText(/^Masked$/).first()).toBeVisible();
  await expect(findingsTable.getByText(/^Quarantined$/).first()).toBeVisible();
  await expect(findingsTable.getByText(/^Flagged$/)).toBeVisible();
});

test('absent today: no scan launcher / Run / Mark-as-false-positive / Custom-rule editor; findings rows are read-only', async ({
  adminPage,
}) => {
  // Regression guard. The roadmap calls for a full scan-management
  // flow (new scan wizard + target dataset picker + Run + per-row
  // drill-down + false-positive flagging + custom-rule editor);
  // until that ships, pin the absence so a half-shipped feature
  // surfaces here first.
  const page = new SensitiveDataScannerPage(adminPage);
  await page.goto();
  await page.expectLoaded();
  await expect(adminPage.getByRole('heading', { level: 1, name: /^Sensitive Data Scanner$/ })).toBeVisible();

  // The shipped hero "New scan" CTA exists but is disabled.
  const newScanCta = adminPage.getByRole('button', { name: /^New scan$/ });
  await expect(newScanCta).toBeVisible();
  await expect(newScanCta).toBeDisabled();
  await expect(newScanCta).toHaveAttribute('title', /Phase 4\.x/i);

  // The page-object's aspirational CTAs all resolve to NOTHING
  // because the regexes don't match the shipped labels:
  //   - `newScanButton` is /new scan|create scan/i (matches the
  //     disabled hero button — so this one is non-zero by design)
  //   - the rest must resolve zero today.
  expect(await page.runScanButton.count()).toBe(0);
  expect(await page.falsePositiveButton.count()).toBe(0);
  expect(await page.rulesButton.count()).toBe(0);

  // No "Mark as false positive" / "Custom rule" affordances
  // anywhere on the page.
  expect(
    await adminPage.getByRole('button', { name: /false positive|mark as fp/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /custom rule|new rule|edit rule/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /^Drill down$|^View row$|^Open row$/i }).count(),
  ).toBe(0);

  // Findings rows are static <tr> elements: no `role="button"`, no
  // nested action buttons, clicking the row is a no-op (URL stays
  // on /sds).
  const findingsTable = adminPage
    .getByRole('table')
    .filter({ has: adminPage.getByRole('columnheader', { name: /^Match ratio$/ }) });
  const firstFindingRow = findingsTable.getByRole('row').nth(1);
  expect(await firstFindingRow.getByRole('button').count()).toBe(0);
  await firstFindingRow.click();
  await expect(adminPage).toHaveURL(/\/sds(\/|$|\?|#)/);
  expect(await adminPage.getByRole('dialog').count()).toBe(0);
});

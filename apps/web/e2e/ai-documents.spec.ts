import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/ai/documents` (apps/web/src/routes/ai/DocumentsPage.tsx).
 *
 * **Reality check.** The shipped DocumentsPage is *not* the RAG /
 * indexed-documents surface the user spec'd — it is a Phase 4.x
 * "Document AI" extraction-strategies playground. Today the page
 * renders:
 *
 *   - A hero with the eyebrow `AI Platform · Document AI`, the h1
 *     `Document AI`, a muted paragraph, and a **disabled** `+ New
 *     extraction` button carrying the tooltip "Extraction runner
 *     ships in Phase 4.x".
 *   - A 4-card KPI strip computed from the seeded `MOCK_JOBS`
 *     array: Avg. quality, Avg. duration, Tokens this week, Active
 *     jobs.
 *   - An "Extraction strategies" section with four toggleable
 *     `aria-pressed` cards (Raw text / OCR / Layout-aware OCR /
 *     Vision LLM). Layout-aware OCR is selected by default.
 *   - A "Recent jobs" table with 7 columns (Document, Strategy,
 *     Status, Quality, Duration, Tokens, Started) and 4 seeded
 *     rows pulled from `MOCK_JOBS`.
 *
 * The page does NOT (today):
 *   - upload PDF/DOCX/TXT files;
 *   - expose per-row reindex / delete actions;
 *   - preview document content;
 *   - run semantic search over indexed documents;
 *   - call any /api/v1/* endpoint — the metrics + table are local
 *     mocks.
 *
 * **Where the RAG document flow actually lives today.** The
 * `DocumentUploadPanel` inside `/ai/threads` posts to
 * `/api/v1/retrieval/documents` and is covered by
 * `ai-threads.spec.ts`. The DocumentsPage we're testing here is a
 * separate, extraction-flavoured surface — when the RAG features
 * the user spec'd ship, they will most likely either replace this
 * page or sit alongside the extraction UI. The `absent today: …`
 * tests below pin each missing control so a partial implementation
 * surfaces here.
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

test('renders the placeholder hero, KPI strip, strategies, and Recent jobs table', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/documents');

  // AppShell stays mounted.
  await expect(
    adminPage.getByRole('navigation', { name: /primary navigation/i }),
  ).toBeVisible();

  // Hero.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^document ai$/i }),
  ).toBeVisible();
  await expect(adminPage.getByText(/^ai platform · document ai$/i)).toBeVisible();

  // Three section headings + the disabled CTA.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^extraction strategies$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^recent jobs$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('button', { name: /new extraction/i }),
  ).toBeVisible();
});

test('"New extraction" CTA is disabled — Phase 4.x roadmap, tooltip pinned', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/documents');

  const cta = adminPage.getByRole('button', { name: /new extraction/i });
  await expect(cta).toBeDisabled();
  // The author left a tooltip explaining why; pin the wording so a
  // rename surfaces here when the runner ships.
  await expect(cta).toHaveAttribute(
    'title',
    /extraction runner ships in phase 4\.x/i,
  );
});

test('KPI strip surfaces the metrics computed from MOCK_JOBS', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/documents');

  // Numbers derive deterministically from MOCK_JOBS:
  //   - Avg. quality   = round(mean(0.94, 0.99) * 100) = 97%
  //   - Avg. duration  = round(mean(142, 6))           = 74s
  //   - Tokens this wk = 18,450 + 0 + 3,220 + 0        = 21,670
  //   - Active jobs    = 1 running (job-2)
  // Pin each label + value so a rename or formatter regression
  // surfaces here.
  const kpiPanel = adminPage.locator('.of-panel').filter({
    has: adminPage.getByText('Avg. quality', { exact: true }),
  });
  await expect(kpiPanel).toBeVisible();
  await expect(kpiPanel.getByText('97%', { exact: true })).toBeVisible();
  await expect(kpiPanel.getByText('74s', { exact: true })).toBeVisible();
  await expect(kpiPanel.getByText('21,670', { exact: true })).toBeVisible();
  // "Active jobs" KPI shows the count of `running` jobs.
  await expect(kpiPanel.getByText('Active jobs', { exact: true })).toBeVisible();
});

test('extraction strategy cards default to Layout-aware OCR and toggle on click', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/documents');

  // All 4 strategy cards render with their distinctive name.
  const rawText = adminPage.getByRole('button', { name: /raw text/i });
  const ocr = adminPage.getByRole('button', { name: /^ocr/i }).first();
  const layoutOcr = adminPage.getByRole('button', { name: /layout-aware ocr/i });
  const vlm = adminPage.getByRole('button', { name: /vision llm/i });
  await expect(rawText).toBeVisible();
  await expect(ocr).toBeVisible();
  await expect(layoutOcr).toBeVisible();
  await expect(vlm).toBeVisible();

  // Default selection: Layout-aware OCR carries `aria-pressed="true"`.
  await expect(layoutOcr).toHaveAttribute('aria-pressed', 'true');
  await expect(rawText).toHaveAttribute('aria-pressed', 'false');
  await expect(vlm).toHaveAttribute('aria-pressed', 'false');

  // Clicking another card flips the press state.
  await vlm.click();
  await expect(vlm).toHaveAttribute('aria-pressed', 'true');
  await expect(layoutOcr).toHaveAttribute('aria-pressed', 'false');
});

test('Recent jobs table renders the four mock rows with status badges', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/documents');

  // The table renders MOCK_JOBS in source order. Pin the four
  // document filenames + their distinctive page counts.
  const table = adminPage.getByRole('table');
  await expect(table).toBeVisible();

  await expect(table.getByText('Q1-financials.pdf')).toBeVisible();
  await expect(table.getByText('Bill-of-lading-batch.zip')).toBeVisible();
  await expect(table.getByText('Customer-feedback-2026-Q1.docx')).toBeVisible();
  await expect(table.getByText('Legal-contract-v3.pdf')).toBeVisible();

  // Status labels: 2× Succeeded, 1× Running, 1× Failed.
  await expect(table.getByText('Succeeded', { exact: true })).toHaveCount(2);
  await expect(table.getByText('Running', { exact: true })).toHaveCount(1);
  await expect(table.getByText('Failed', { exact: true })).toHaveCount(1);

  // Header row: seven labelled column headers (Document / Strategy /
  // Status / Quality / Duration / Tokens / Started).
  for (const header of [
    'Document',
    'Strategy',
    'Status',
    'Quality',
    'Duration',
    'Tokens',
    'Started',
  ]) {
    await expect(
      table.getByRole('columnheader', { name: header, exact: true }),
    ).toBeVisible();
  }

  // Strategy column surfaces the friendly names (not the kebab ids).
  await expect(table.getByText('Layout-aware OCR')).toBeVisible();
  await expect(table.getByText('Vision LLM')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Regression guards for the RAG features the user spec'd
// ---------------------------------------------------------------------------

test('absent today: file-upload control for PDF / DOCX / TXT', async ({
  adminPage,
}) => {
  // The roadmap calls for an `<input type="file">` that accepts PDF /
  // DOCX / TXT for indexing. Today no upload affordance exists on this
  // page — the closest cousin lives at `/ai/threads` (DocumentUploadPanel)
  // and uploads to /api/v1/retrieval/documents, not /api/v1/ai/*.
  await adminPage.goto('/ai/documents');

  expect(await adminPage.locator('input[type="file"]').count()).toBe(0);
  expect(
    await adminPage
      .getByRole('button', { name: /^(upload|upload (document|file))$/i })
      .count(),
  ).toBe(0);
  // No title / body inputs that would compose an upload form either.
  expect(await adminPage.getByPlaceholder(/^title$/i).count()).toBe(0);
  expect(await adminPage.getByPlaceholder(/document text|paste text/i).count()).toBe(0);
});

test('absent today: per-row Reindex and Delete actions', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/documents');

  // No per-row CTA buttons in the recent-jobs table.
  expect(
    await adminPage.getByRole('button', { name: /^reindex( document)?$/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /^delete( document| job)?$/i }).count(),
  ).toBe(0);
  // No bulk-action toolbar either (no row-select checkboxes today).
  expect(await adminPage.getByRole('checkbox').count()).toBe(0);
});

test('absent today: content-preview drawer for an indexed document', async ({
  adminPage,
}) => {
  // The roadmap calls for clicking a document to open a side drawer
  // with extracted text / chunks. Today the table is read-only and no
  // drawer surface exists.
  await adminPage.goto('/ai/documents');

  expect(
    await adminPage
      .getByRole('button', { name: /^(preview|view document|inspect|open document)$/i })
      .count(),
  ).toBe(0);
  // Aria-flavoured complementary regions that would back a preview
  // drawer are absent.
  expect(
    await adminPage.getByRole('complementary', { name: /preview|document/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('dialog', { name: /preview|document/i }).count(),
  ).toBe(0);
});

test('absent today: semantic-search input over indexed documents', async ({
  adminPage,
}) => {
  // The roadmap exposes a semantic-search field that queries the
  // retrieval index. Today no such input exists — and the page
  // itself does not call any `/api/v1/ai/*` endpoint (the metrics +
  // table are computed from local mock data), so pin both.
  const aiCalls = captureRequests(adminPage, /\/api\/v1\/ai\//);
  const retrievalCalls = captureRequests(
    adminPage,
    /\/api\/v1\/retrieval\//,
  );

  await adminPage.goto('/ai/documents');
  await adminPage.waitForTimeout(300);

  expect(
    await adminPage
      .getByPlaceholder(/search documents|semantic search|ask the docs|search the index/i)
      .count(),
  ).toBe(0);
  expect(
    await adminPage
      .getByRole('searchbox', { name: /documents|knowledge base|index/i })
      .count(),
  ).toBe(0);

  // The page is fully local — no AI / retrieval requests fired on mount.
  expect(aiCalls.count()).toBe(0);
  expect(retrievalCalls.count()).toBe(0);
});

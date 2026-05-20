import path from 'node:path';

import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/datasets/upload`
 * (apps/web/src/routes/datasets/DatasetUploadPage.tsx).
 *
 * **Reality vs roadmap.**
 *   - This is a single-form layout, NOT a multi-page wizard. The
 *     "WizardSteps" strip at the top (File / Configure / Upload) is a
 *     visual progress indicator — there is no Next / Previous step
 *     navigation; every section is visible on one page.
 *   - The schema preview is READ-ONLY. Column types render as plain
 *     `<td>` text, not as editable `<select>` dropdowns.
 *   - There is no project / destination picker in the Configure
 *     section (just Name, File path, Description, Format, Tags).
 *   - The page does not validate file extensions: `setInputFiles`
 *     with a `.png` is accepted, `detectFormat` falls through to
 *     `parquet`, and the schema panel shows the server-side-inference
 *     warning. There is no inline "unsupported file" error.
 *   - There is no progress bar (`role="progressbar"`). During upload
 *     the submit button just flips to "Uploading...".
 *   - Neither `createDataset` nor `uploadData` pass an `AbortSignal`,
 *     so mid-upload abort is not wired. The header "Cancel" is a
 *     plain `<Link to="/datasets">` — clicking it navigates away but
 *     the in-flight fetch keeps running until the browser unloads.
 *
 * Endpoints exercised:
 *   - POST /api/v1/datasets             (createDataset, JSON)
 *   - POST /api/v1/datasets/{id}/upload (uploadData, multipart)
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Upload failed/i,
    ],
  },
});

const DATASETS_CREATE = /\/api\/v1\/datasets(\?|$)/;
const DATASET_UPLOAD = /\/api\/v1\/datasets\/[^/?#]+\/upload(\?|$)/;
const SAMPLE_CSV = path.resolve(process.cwd(), 'e2e/fixtures/files/sample.csv');

test('renders the upload wizard with the "Select file" step active', async ({ adminPage }) => {
  await adminPage.goto('/datasets/upload');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /upload dataset/i }),
  ).toBeVisible();

  // WizardSteps strip lists all three steps.
  for (const step of ['File', 'Configure', 'Upload']) {
    await expect(adminPage.getByText(step, { exact: true })).toBeVisible();
  }

  // The first numbered section is "Select file" with the drop zone.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^select file$/i }),
  ).toBeVisible();
  await expect(adminPage.getByText(/drop a data file here/i)).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /choose file/i })).toBeVisible();

  // Submit button starts disabled — no file yet.
  await expect(adminPage.locator('button[type="submit"]')).toBeDisabled();

  // Schema panel placeholder before a file is staged.
  await expect(adminPage.getByText(/no file staged/i)).toBeVisible();
});

test('selecting a valid CSV stages the file, auto-fills name + path, and renders the inferred schema', async ({
  adminPage,
}) => {
  await adminPage.goto('/datasets/upload');

  await adminPage.locator('input[type="file"]').setInputFiles(SAMPLE_CSV);

  // File appears in the drop zone with name + size + a Remove file button.
  await expect(
    adminPage.locator('p').filter({ hasText: /^sample\.csv$/ }),
  ).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Remove file' })).toBeVisible();

  // Name + file path autofill from the filename.
  await expect(adminPage.getByLabel(/^name$/i)).toHaveValue('sample');
  await expect(adminPage.getByLabel(/^file path$/i)).toHaveValue('sample.csv');

  // Format detected as csv from the extension.
  await expect(adminPage.getByLabel(/dataset format/i)).toHaveValue('csv');

  // Schema inference panel renders inferred columns with their types.
  const schema = adminPage.locator('aside.of-panel');
  await expect(schema.getByRole('heading', { name: /inference panel/i })).toBeVisible();
  await expect(schema.getByText(/rows sampled/i)).toBeVisible();

  const schemaTable = schema.getByRole('table');
  await expect(schemaTable).toBeVisible();
  await expect(schemaTable.getByRole('cell', { name: 'id', exact: true })).toBeVisible();
  await expect(schemaTable.getByRole('cell', { name: 'name', exact: true })).toBeVisible();
  await expect(schemaTable.getByRole('cell', { name: 'active', exact: true })).toBeVisible();
  await expect(schemaTable.getByRole('cell', { name: 'joined_at', exact: true })).toBeVisible();
  // Inferred types: 'id' + 'age' → LONG, 'active' → BOOLEAN, joined_at → TIMESTAMP.
  await expect(schemaTable.getByRole('cell', { name: 'LONG' }).first()).toBeVisible();
  await expect(schemaTable.getByRole('cell', { name: 'BOOLEAN' })).toBeVisible();
  await expect(schemaTable.getByRole('cell', { name: 'TIMESTAMP' })).toBeVisible();

  // Submit is now enabled.
  await expect(adminPage.locator('button[type="submit"]')).toBeEnabled();
});

test('selecting an unsupported file (.png) is accepted — format falls back to parquet, no inline error', async ({
  adminPage,
}) => {
  await adminPage.goto('/datasets/upload');

  // `setInputFiles` bypasses the file picker's `accept` filter, so the
  // page receives the .png as-is. The shipped UI has no extension-based
  // rejection — `detectFormat` falls through to 'parquet'.
  await adminPage.locator('input[type="file"]').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });

  await expect(adminPage.locator('p').filter({ hasText: /^logo\.png$/ })).toBeVisible();
  await expect(adminPage.getByLabel(/dataset format/i)).toHaveValue('parquet');

  // The Parquet inference path posts a warning instead of an error banner.
  await expect(
    adminPage.getByText(/parquet schema inference runs server-side/i),
  ).toBeVisible();

  // No "of-status-danger" error banner is rendered for the file pick.
  expect(await adminPage.locator('.of-status-danger').count()).toBe(0);
});

test('Configure section captures name, description, and renders tag chips', async ({
  adminPage,
}) => {
  await adminPage.goto('/datasets/upload');
  await adminPage.locator('input[type="file"]').setInputFiles(SAMPLE_CSV);

  // Override the auto-filled name.
  const nameInput = adminPage.getByLabel(/^name$/i);
  await nameInput.fill('orders_q1');
  await expect(nameInput).toHaveValue('orders_q1');

  await adminPage.getByLabel(/^description$/i).fill('Deduped Q1 orders feed.');

  // Tags are comma-separated and render as chips below the Tags input.
  await adminPage.getByLabel(/^tags$/i).fill('finance, monthly');
  const configureSection = adminPage
    .locator('section')
    .filter({ has: adminPage.getByRole('heading', { name: /configure dataset/i }) });
  await expect(configureSection.locator('.of-chip').filter({ hasText: /^finance$/ })).toBeVisible();
  await expect(configureSection.locator('.of-chip').filter({ hasText: /^monthly$/ })).toBeVisible();
});

test('submit: POST /datasets then POST multipart /datasets/{id}/upload, then redirect to /datasets/{id}', async ({
  adminPage,
}) => {
  // Mock the create endpoint with a deterministic id.
  await adminPage.route(DATASETS_CREATE, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: {
        id: 'dataset-new-1',
        name: 'sample',
        description: 'Deduped Q1 orders feed.',
        format: 'csv',
        tags: [],
        storage_path: '/sample',
        size_bytes: 0,
        row_count: 0,
        owner_id: 'user-1',
        current_version: 1,
        active_branch: 'master',
        created_at: '2026-05-11T00:00:00Z',
        updated_at: '2026-05-11T00:00:00Z',
      },
    });
  });

  // Mock the multipart upload endpoint.
  await adminPage.route(DATASET_UPLOAD, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 200,
      json: { id: 'upload-1', dataset_id: 'dataset-new-1', size_bytes: 132 },
    });
  });

  const createCap = captureRequests(adminPage, DATASETS_CREATE);
  const uploadCap = captureRequests(adminPage, DATASET_UPLOAD);

  await adminPage.goto('/datasets/upload');
  await adminPage.locator('input[type="file"]').setInputFiles(SAMPLE_CSV);
  await adminPage.getByLabel(/^description$/i).fill('Deduped Q1 orders feed.');

  await adminPage.locator('button[type="submit"]').click();

  // 1. createDataset POST fired with the right shape.
  await expect
    .poll(() => createCap.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);
  const createBody = createCap.calls.find((c) => c.method === 'POST')?.body;
  expect(createBody).toMatchObject({
    name: 'sample',
    description: 'Deduped Q1 orders feed.',
    format: 'csv',
    tags: [],
  });

  // 2. Multipart upload POST hit /datasets/dataset-new-1/upload with the file.
  await expect.poll(() => uploadCap.count()).toBeGreaterThanOrEqual(1);
  const uploadCall = uploadCap.last();
  expect(uploadCall?.method).toBe('POST');
  expect(uploadCall?.url).toMatch(/\/api\/v1\/datasets\/dataset-new-1\/upload/);
  // The multipart body is captured as a raw string (postDataJSON throws on
  // multipart, so captureRequests falls back to postData()). It contains
  // the filename and the logical_path field name.
  expect(typeof uploadCall?.body).toBe('string');
  expect(uploadCall?.body as string).toContain('sample.csv');
  expect(uploadCall?.body as string).toContain('logical_path');

  // 3. Redirect to the new dataset's detail route.
  await expect(adminPage).toHaveURL(/\/datasets\/dataset-new-1$/);
});

test('duplicate-name 409 on createDataset surfaces the server message in the error banner', async ({
  adminPage,
}) => {
  await adminPage.route(DATASETS_CREATE, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 409,
      json: { error: 'Dataset name "sample" already exists in project default.' },
    });
  });

  // Ensure no upload route is reachable — if the page incorrectly proceeds
  // past the failed create, the catch-all will 201 it and the test would
  // mis-pass. Force the upload endpoint to fail loudly instead.
  await adminPage.route(DATASET_UPLOAD, async (route) => {
    await route.fulfill({ status: 500, json: { error: 'should not have been called' } });
  });

  const uploadCap = captureRequests(adminPage, DATASET_UPLOAD);

  await adminPage.goto('/datasets/upload');
  await adminPage.locator('input[type="file"]').setInputFiles(SAMPLE_CSV);
  await adminPage.locator('button[type="submit"]').click();

  // Inline error banner shows the server message.
  await expect(
    adminPage.locator('.of-status-danger').filter({
      hasText: /already exists in project default/i,
    }),
  ).toBeVisible();

  // The upload endpoint was never hit (the create failed before it).
  expect(uploadCap.count()).toBe(0);

  // We stayed on the upload page; the submit button is interactive again.
  await expect(adminPage).toHaveURL(/\/datasets\/upload$/);
  await expect(adminPage.locator('button[type="submit"]')).toBeEnabled();
});

test('the header "Cancel" link navigates back to /datasets', async ({ adminPage }) => {
  await adminPage.goto('/datasets/upload');

  const cancel = adminPage.getByRole('link', { name: 'Cancel', exact: true });
  await expect(cancel).toHaveAttribute('href', '/datasets');
  await cancel.click();
  await expect(adminPage).toHaveURL(/\/datasets$/);
});

test('absent today: column-type edit dropdown, project picker, progress bar, in-flight abort control', async ({
  adminPage,
}) => {
  // Single regression guard for the four roadmap controls that don't ship
  // today. Each `count() === 0` flips when the feature lands, forcing an
  // update to this file.
  await adminPage.goto('/datasets/upload');
  await adminPage.locator('input[type="file"]').setInputFiles(SAMPLE_CSV);

  const schema = adminPage.locator('aside.of-panel');
  await expect(schema.getByRole('cell', { name: 'id', exact: true })).toBeVisible();

  // 1. No per-column type dropdown — the Type column is plain text.
  expect(await schema.getByRole('combobox').count()).toBe(0);
  expect(
    await adminPage.getByRole('combobox', { name: /type for (id|name|age)/i }).count(),
  ).toBe(0);

  // 2. No project / destination picker in the Configure section.
  expect(await adminPage.getByLabel(/^project$/i).count()).toBe(0);
  expect(await adminPage.getByLabel(/destination/i).count()).toBe(0);

  // 3. No progress bar — the submit button just flips text while busy.
  expect(await adminPage.getByRole('progressbar').count()).toBe(0);

  // 4. No "Abort upload" / "Cancel upload" control. The header "Cancel"
  //    link is a plain `<Link>` to /datasets (covered in its own test) —
  //    there is no signal-driven abort surfaced in the UI.
  expect(
    await adminPage.getByRole('button', { name: /abort upload|cancel upload|stop upload/i }).count(),
  ).toBe(0);
});

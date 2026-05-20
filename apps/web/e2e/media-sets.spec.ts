import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/media-sets` and `/media-sets/:rid`
 * (apps/web/src/routes/media-sets/MediaSetsPage.tsx,
 *  apps/web/src/routes/media-sets/MediaSetDetailPage.tsx).
 *
 * **Reality vs roadmap.** Both pages are utilitarian JSON-driven
 * surfaces. The list page renders three free-text inputs (name /
 * project_rid / comma-separated MIME types) plus a "Create" button,
 * then lists each set as a plain `<li>` with Upload + Delete buttons.
 * There is NO type filter (image/video/audio dropdown), NO search,
 * NO grid view. The detail page renders a single-file `<input
 * type="file">` (no `multiple` attribute), a flat list of items
 * showing `path · mime_type · size_bytes · branch`, a per-item
 * Delete button, and a JSON dump of the media-set. There is NO
 * thumbnail gallery, NO `<img>` / `<video>` previews, NO metadata
 * editor (the wire shape carries `metadata: Record<string, unknown>`
 * but nothing surfaces it), NO bulk-selection checkboxes, and NO
 * "Delete selected" CTA.
 *
 * The roadmap controls below are folded into "absent today"
 * regression guards. When the implementation lands, those tests
 * will fail loudly and surface a checklist for the developer adding
 * the feature.
 *
 * Endpoints exercised by the list page:
 *   - GET    /api/v1/media-sets
 *   - POST   /api/v1/media-sets
 *   - DELETE /api/v1/media-sets/{rid}                     (per-row CTA)
 *
 * Endpoints exercised by the detail page:
 *   - GET    /api/v1/media-sets/{rid}
 *   - GET    /api/v1/media-sets/{rid}/items
 *   - POST   /api/v1/media-sets/{rid}/items/upload-url    (presigned)
 *   - PUT    <signed_url>                                 (storage PUT)
 *   - GET    /api/v1/items/{item_rid}                     (re-fetch)
 *   - DELETE /api/v1/items/{item_rid}                     (per-row CTA)
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Failed to load media set/i,
      /Failed to create media set/i,
      /Upload failed/i,
      /Delete failed/i,
    ],
  },
});

const E2E_NOW = '2026-05-11T00:00:00Z';
const MEDIA_SETS_LIST = /\/api\/v1\/media-sets(\?|$)/;
const MEDIA_SET_DETAIL = /\/api\/v1\/media-sets\/[^/?#]+(\?|$)/;
const MEDIA_SET_ITEMS = /\/api\/v1\/media-sets\/[^/?#]+\/items(\?|$)/;
const UPLOAD_URL = /\/api\/v1\/media-sets\/[^/?#]+\/items\/upload-url(\?|$)/;
const ITEM_DETAIL = /\/api\/v1\/items\/[^/?#]+(\?|$)/;
const STORAGE_PUT = /https:\/\/upload\.example\.com\//;

interface MediaSetFixture {
  rid: string;
  project_rid: string;
  name: string;
  schema: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT' | 'SPREADSHEET' | 'EMAIL';
  allowed_mime_types: string[];
  transaction_policy: 'TRANSACTIONLESS' | 'TRANSACTIONAL';
  retention_seconds: number;
  virtual: boolean;
  source_rid: string | null;
  markings: string[];
  created_at: string;
  created_by: string;
}

function makeMediaSet(overrides: Partial<MediaSetFixture> = {}): MediaSetFixture {
  return {
    rid: 'ri.media-set.default.alpha',
    project_rid: 'ri.project.default',
    name: 'Field photos',
    schema: 'IMAGE',
    allowed_mime_types: ['image/png', 'image/jpeg'],
    transaction_policy: 'TRANSACTIONLESS',
    retention_seconds: 0,
    virtual: false,
    source_rid: null,
    markings: [],
    created_at: E2E_NOW,
    created_by: 'user-1',
    ...overrides,
  };
}

interface MediaItemFixture {
  rid: string;
  media_set_rid: string;
  branch: string;
  transaction_rid: string;
  path: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  metadata: Record<string, unknown>;
  storage_uri: string;
  deduplicated_from: string | null;
  deleted_at: string | null;
  created_at: string;
  markings?: string[];
}

function makeMediaItem(overrides: Partial<MediaItemFixture> = {}): MediaItemFixture {
  return {
    rid: 'ri.media-item.alpha.1',
    media_set_rid: 'ri.media-set.default.alpha',
    branch: 'main',
    transaction_rid: 'ri.tx.alpha.1',
    path: 'photo.jpg',
    mime_type: 'image/jpeg',
    size_bytes: 12_345,
    sha256: 'deadbeef',
    metadata: {},
    storage_uri: 's3://bucket/photo.jpg',
    deduplicated_from: null,
    deleted_at: null,
    created_at: E2E_NOW,
    ...overrides,
  };
}

async function mockMediaSetsList(page: Page, sets: MediaSetFixture[]): Promise<void> {
  // The API client returns a bare array (no envelope), so we mirror that.
  await page.route(MEDIA_SETS_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: sets });
  });
}

async function mockMediaSetDetail(
  page: Page,
  set: MediaSetFixture,
  items: MediaItemFixture[],
): Promise<void> {
  // Items first — its path is more specific so it must be registered
  // earlier and matched later (most-recent-first wins).
  await page.route(MEDIA_SET_ITEMS, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: items });
  });
  await page.route(MEDIA_SET_DETAIL, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    // Skip the bare-list URL (no extra path segment).
    if (/\/media-sets(\?|$)/.test(route.request().url())) return route.fallback();
    // Skip sub-paths (items, branches, …).
    const url = new URL(route.request().url());
    if (/\/media-sets\/[^/]+\/.+$/.test(url.pathname)) return route.fallback();
    await route.fulfill({ json: set });
  });
}

// ===========================================================================
// LIST PAGE — /media-sets
// ===========================================================================

test.describe('list page (/media-sets)', () => {
  test('renders every media set returned by GET /media-sets', async ({
    adminPage,
  }) => {
    const sets = [
      makeMediaSet({
        rid: 'ri.media-set.default.alpha',
        name: 'Field photos',
        schema: 'IMAGE',
        allowed_mime_types: ['image/png', 'image/jpeg'],
      }),
      makeMediaSet({
        rid: 'ri.media-set.default.beta',
        name: 'Surveillance footage',
        schema: 'VIDEO',
        allowed_mime_types: ['video/mp4'],
      }),
      makeMediaSet({
        rid: 'ri.media-set.default.gamma',
        name: 'Voice transcripts',
        schema: 'AUDIO',
        allowed_mime_types: ['audio/mpeg'],
      }),
    ];
    await mockMediaSetsList(adminPage, sets);
    const listCalls = captureRequests(adminPage, MEDIA_SETS_LIST);

    await adminPage.goto('/media-sets');
    await expect(
      adminPage.getByRole('heading', { level: 1, name: /^media sets$/i }),
    ).toBeVisible();

    await expect(adminPage.getByText(/Media sets \(3\)/i)).toBeVisible();
    await expect(
      adminPage.getByRole('link', { name: /^Field photos$/i }),
    ).toBeVisible();
    await expect(
      adminPage.getByRole('link', { name: /^Surveillance footage$/i }),
    ).toBeVisible();
    await expect(
      adminPage.getByRole('link', { name: /^Voice transcripts$/i }),
    ).toBeVisible();

    // The row sub-line shows rid · schema · mime type count.
    await expect(
      adminPage.getByText(/ri\.media-set\.default\.beta.*schema VIDEO.*1 mime types/),
    ).toBeVisible();

    expect(listCalls.calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(0);
  });

  test('Create button submits POST /media-sets with the form fields', async ({
    adminPage,
  }) => {
    await mockMediaSetsList(adminPage, []);
    const calls = captureRequests(adminPage, MEDIA_SETS_LIST);

    await adminPage.goto('/media-sets');
    await expect(
      adminPage.getByRole('heading', { level: 1, name: /^media sets$/i }),
    ).toBeVisible();

    // Replace the prefilled name + project rid + mime list so we can
    // pin the POST body precisely.
    const nameInput = adminPage.getByPlaceholder(/^Name$/);
    await nameInput.fill('My test set');
    const projectInput = adminPage.getByPlaceholder(/project rid/i);
    await projectInput.fill('ri.project.test');
    const mimeInput = adminPage.getByPlaceholder(/image\/jpeg/i);
    await mimeInput.fill('image/png,image/webp');

    // The button labelled exactly "Create" is the create-set CTA.
    await adminPage.getByRole('button', { name: /^create$/i }).click();

    await expect
      .poll(() => calls.calls.filter((c) => c.method === 'POST').length)
      .toBe(1);

    const post = calls.calls.find((c) => c.method === 'POST');
    expect(post?.body).toMatchObject({
      name: 'My test set',
      project_rid: 'ri.project.test',
      allowed_mime_types: ['image/png', 'image/webp'],
      // The page hard-codes `schema: 'DOCUMENT'`; pin that until a
      // schema picker UI lands so a half-shipped picker is caught here.
      schema: 'DOCUMENT',
    });
  });

  test('absent today: type filters (image / video / audio)', async ({
    adminPage,
  }) => {
    // The page lists every set returned by the backend with no client-
    // side filter. The roadmap calls for an Image / Video / Audio
    // filter (likely a tablist or dropdown). Pin the absence so a
    // half-shipped filter UI surfaces here.
    await mockMediaSetsList(adminPage, [makeMediaSet()]);

    await adminPage.goto('/media-sets');
    await expect(adminPage.getByText(/Media sets \(1\)/i)).toBeVisible();

    expect(await adminPage.getByRole('tab', { name: /^image$/i }).count()).toBe(0);
    expect(await adminPage.getByRole('tab', { name: /^video$/i }).count()).toBe(0);
    expect(await adminPage.getByRole('tab', { name: /^audio$/i }).count()).toBe(0);
    expect(await adminPage.getByRole('button', { name: /^filter by type$/i }).count()).toBe(0);
    expect(await adminPage.getByRole('combobox', { name: /type|schema/i }).count()).toBe(0);
    expect(await adminPage.getByLabel(/filter.*type/i).count()).toBe(0);
  });
});

// ===========================================================================
// DETAIL PAGE — /media-sets/:rid
// ===========================================================================

test.describe('detail page (/media-sets/:rid)', () => {
  const RID = 'ri.media-set.default.alpha';

  test('absent today: thumbnail gallery', async ({ adminPage }) => {
    const set = makeMediaSet({ rid: RID, name: 'Field photos' });
    const items = [
      makeMediaItem({ rid: 'ri.media-item.1', path: 'a.jpg', mime_type: 'image/jpeg' }),
      makeMediaItem({ rid: 'ri.media-item.2', path: 'b.png', mime_type: 'image/png' }),
    ];
    await mockMediaSetDetail(adminPage, set, items);

    await adminPage.goto(`/media-sets/${RID}`);
    await expect(
      adminPage.getByRole('heading', { level: 1, name: /field photos/i }),
    ).toBeVisible();

    // Items render as a plain list — `path · mime · size · branch`.
    await expect(adminPage.getByText(/Items \(2\)/i)).toBeVisible();
    await expect(adminPage.getByText('a.jpg')).toBeVisible();
    await expect(adminPage.getByText('b.png')).toBeVisible();

    // Roadmap controls — absent today. No <img>, no role="img"
    // thumbnail, no grid container, no signed download URLs requested.
    const downloadCalls = captureRequests(
      adminPage,
      /\/api\/v1\/items\/[^/?#]+\/download-url(\?|$)/,
    );
    await adminPage.waitForTimeout(400);

    expect(await adminPage.locator('img').count()).toBe(0);
    expect(await adminPage.getByRole('img', { name: /thumbnail|preview/i }).count()).toBe(0);
    expect(
      await adminPage.locator('[data-testid*="thumbnail"], [data-testid*="gallery"]').count(),
    ).toBe(0);
    expect(downloadCalls.count()).toBe(0);
  });

  test('Upload posts to /items/upload-url and then PUTs the bytes', async ({
    adminPage,
  }) => {
    const set = makeMediaSet({ rid: RID, name: 'Field photos' });
    await mockMediaSetDetail(adminPage, set, []);

    const presignedItem = makeMediaItem({
      rid: 'ri.media-item.uploaded',
      path: 'tiny.txt',
      mime_type: 'text/plain',
      size_bytes: 5,
    });

    // Presigned-URL step.
    await adminPage.route(UPLOAD_URL, async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({
        json: {
          url: 'https://upload.example.com/signed',
          expires_at: E2E_NOW,
          headers: {},
          item: presignedItem,
        },
      });
    });
    // Storage PUT — the page calls fetch(...PUT) against the signed URL.
    await adminPage.route(STORAGE_PUT, async (route: Route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      await route.fulfill({ status: 200, body: '' });
    });
    // Re-fetch of the freshly-uploaded item.
    await adminPage.route(ITEM_DETAIL, async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({ json: presignedItem });
    });
    const uploadCalls = captureRequests(adminPage, UPLOAD_URL);
    const storageCalls = captureRequests(adminPage, STORAGE_PUT);

    await adminPage.goto(`/media-sets/${RID}`);
    await expect(
      adminPage.getByRole('heading', { level: 1, name: /field photos/i }),
    ).toBeVisible();

    // Attach a file via the lone file input. The shipped page renders a
    // single `<input type="file">` (no `multiple` attribute) inside the
    // "Upload item" panel.
    const fileInput = adminPage.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'tiny.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });

    // After a file is selected the Upload button enables.
    const uploadBtn = adminPage
      .locator('section.of-panel', { hasText: /Upload item/i })
      .getByRole('button', { name: /^upload$/i });
    await expect(uploadBtn).toBeEnabled();
    await uploadBtn.click();

    await expect
      .poll(() => uploadCalls.calls.filter((c) => c.method === 'POST').length)
      .toBe(1);
    await expect
      .poll(() => storageCalls.calls.filter((c) => c.method === 'PUT').length)
      .toBe(1);

    const post = uploadCalls.calls.find((c) => c.method === 'POST');
    expect(post?.body).toMatchObject({
      path: 'tiny.txt',
      mime_type: 'text/plain',
      branch: 'main',
      size_bytes: 5,
    });

    // The file input has no `multiple` attribute today — pin the
    // single-upload reality for the bulk-upload roadmap entry.
    expect(await fileInput.evaluate((el) => (el as HTMLInputElement).multiple)).toBe(false);
  });

  test('Delete on a row calls DELETE /api/v1/items/{rid}', async ({ adminPage }) => {
    const set = makeMediaSet({ rid: RID, name: 'Field photos' });
    const item = makeMediaItem({ rid: 'ri.media-item.to-delete', path: 'goodbye.png' });
    await mockMediaSetDetail(adminPage, set, [item]);

    // The page uses window.confirm; auto-accept any prompt.
    adminPage.on('dialog', (dialog) => {
      void dialog.accept();
    });

    const deleteCalls = captureRequests(adminPage, ITEM_DETAIL);
    await adminPage.route(ITEM_DETAIL, async (route: Route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      await route.fulfill({ status: 204, body: '' });
    });

    await adminPage.goto(`/media-sets/${RID}`);
    await expect(
      adminPage.getByRole('heading', { level: 1, name: /field photos/i }),
    ).toBeVisible();
    await expect(adminPage.getByText(/Items \(1\)/i)).toBeVisible();

    // The "Items" panel exposes a Delete button per row; the page also
    // has a back-link <Link> but no other Delete buttons here.
    const itemsPanel = adminPage.locator('section.of-panel', { hasText: /Items \(/i });
    await itemsPanel.getByRole('button', { name: /^delete$/i }).click();

    await expect
      .poll(() => deleteCalls.calls.filter((c) => c.method === 'DELETE').length)
      .toBe(1);
    const del = deleteCalls.calls.find((c) => c.method === 'DELETE');
    expect(del?.url).toMatch(/\/items\/ri\.media-item\.to-delete(\?|$)/);
  });

  test('absent today: metadata editor', async ({ adminPage }) => {
    const set = makeMediaSet({ rid: RID, name: 'Field photos' });
    const item = makeMediaItem({
      rid: 'ri.media-item.meta',
      path: 'with-metadata.jpg',
      metadata: { caption: 'sunrise', author: 'alice' },
    });
    await mockMediaSetDetail(adminPage, set, [item]);

    // The metadata Patch endpoint (`/items/:rid/markings`) and the
    // `metadata: Record<string, unknown>` field exist in the wire shape
    // and API client but are not exposed in the UI today.
    const metadataPatchCalls = captureRequests(
      adminPage,
      /\/api\/v1\/items\/[^/?#]+\/markings(\?|$)/,
    );

    await adminPage.goto(`/media-sets/${RID}`);
    await expect(
      adminPage.getByRole('heading', { level: 1, name: /field photos/i }),
    ).toBeVisible();
    await expect(adminPage.getByText(/Items \(1\)/i)).toBeVisible();
    await adminPage.waitForTimeout(300);

    // No metadata UI surfaces today — pin the absence.
    expect(await adminPage.getByRole('button', { name: /edit metadata/i }).count()).toBe(0);
    expect(await adminPage.getByRole('heading', { name: /^metadata$/i }).count()).toBe(0);
    expect(
      await adminPage.locator('[data-testid*="metadata-editor"]').count(),
    ).toBe(0);
    // The mocked metadata values are NOT rendered anywhere (the row
    // only shows path / mime / size / branch).
    expect(await adminPage.getByText(/sunrise|caption/).count()).toBe(0);
    expect(metadataPatchCalls.count()).toBe(0);
  });

  test('absent today: image / video preview component', async ({ adminPage }) => {
    const set = makeMediaSet({ rid: RID, name: 'Field photos' });
    const items = [
      makeMediaItem({
        rid: 'ri.media-item.img',
        path: 'image.jpg',
        mime_type: 'image/jpeg',
      }),
      makeMediaItem({
        rid: 'ri.media-item.vid',
        path: 'video.mp4',
        mime_type: 'video/mp4',
      }),
    ];
    await mockMediaSetDetail(adminPage, set, items);

    await adminPage.goto(`/media-sets/${RID}`);
    await expect(
      adminPage.getByRole('heading', { level: 1, name: /field photos/i }),
    ).toBeVisible();
    await expect(adminPage.getByText(/Items \(2\)/i)).toBeVisible();

    // Clicking a row should open a preview drawer/modal; today the row
    // is plain text without click handlers, so no preview shell exists.
    expect(await adminPage.locator('video').count()).toBe(0);
    expect(await adminPage.locator('audio').count()).toBe(0);
    expect(await adminPage.locator('img').count()).toBe(0);
    expect(await adminPage.getByRole('dialog', { name: /preview/i }).count()).toBe(0);
    expect(
      await adminPage.locator('[data-testid*="preview"], [data-testid*="lightbox"]').count(),
    ).toBe(0);
  });

  test('absent today: bulk-selection controls', async ({ adminPage }) => {
    const set = makeMediaSet({ rid: RID, name: 'Field photos' });
    const items = [
      makeMediaItem({ rid: 'ri.media-item.1', path: 'a.jpg' }),
      makeMediaItem({ rid: 'ri.media-item.2', path: 'b.jpg' }),
      makeMediaItem({ rid: 'ri.media-item.3', path: 'c.jpg' }),
    ];
    await mockMediaSetDetail(adminPage, set, items);

    await adminPage.goto(`/media-sets/${RID}`);
    await expect(
      adminPage.getByRole('heading', { level: 1, name: /field photos/i }),
    ).toBeVisible();
    await expect(adminPage.getByText(/Items \(3\)/i)).toBeVisible();

    // No row checkboxes, no "select all", no bulk-delete CTA today.
    expect(await adminPage.getByRole('checkbox').count()).toBe(0);
    expect(
      await adminPage.getByRole('button', { name: /select all|deselect all/i }).count(),
    ).toBe(0);
    expect(
      await adminPage.getByRole('button', { name: /delete selected|bulk delete/i }).count(),
    ).toBe(0);
    expect(
      await adminPage.getByRole('button', { name: /move selected|tag selected/i }).count(),
    ).toBe(0);
  });
});

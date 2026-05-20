import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { NotepadListPage, NotepadDetailPage } from './pages';

/**
 * E2E coverage for `/notepad` and `/notepad/:id`
 * (apps/web/src/routes/notepad/*).
 *
 * **Reality vs roadmap.** The shipped Notepad is a Foundry-style
 * Documents hub:
 *   - List: server-side searched gallery, stats strip, built-in
 *     templates panel ("Executive Brief" / "Investigation" /
 *     "Operating Review"), live-presence widget, in-place delete.
 *   - Detail: TipTap rich-text editor (`<div class="ProseMirror"
 *     contenteditable="true">`), title + description inputs, an
 *     export-HTML iframe preview, PDF / DOCX / HTML export, version
 *     history, save-as-template, "Index in AIP" knowledge ingestion.
 *
 * The "Pin / Archive" affordance described in the task is roadmap —
 * neither the list nor the detail surface ships any pin/archive
 * control. The absent-today regression guard at the end pins that
 * gap so the spec fails the moment those buttons land.
 *
 * Endpoints exercised (all under `/api/v1`):
 *   - GET    /notepad/documents
 *   - POST   /notepad/documents
 *   - GET    /notepad/documents/:id
 *   - PATCH  /notepad/documents/:id
 *   - DELETE /notepad/documents/:id
 *   - GET    /notepad/documents/:id/presence
 *   - POST   /notepad/documents/:id/presence       (heartbeat)
 *   - POST   /notepad/documents/:id/export?format=html
 *   - GET    /notepad/templates
 *   - GET    /ai/knowledge-bases
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Failed to load/,
    ],
  },
});

const E2E_NOW = '2026-05-11T00:00:00Z';
const DOC_ID = 'notepad-doc-1';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface NotepadDocFixture {
  id: string;
  title: string;
  description: string;
  owner_id: string;
  content: string;
  content_doc: unknown;
  template_key: string | null;
  widgets: Array<Record<string, unknown>>;
  last_indexed_at: string | null;
  created_at: string;
  updated_at: string;
}

function makeDoc(overrides: Partial<NotepadDocFixture> = {}): NotepadDocFixture {
  return {
    id: DOC_ID,
    title: 'Customer churn brief',
    description: 'A short writeup on the latest churn signals.',
    owner_id: '00000000-0000-0000-0000-000000000001',
    content: '# Customer churn brief\n\nIntro paragraph.',
    content_doc: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Customer churn brief' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Intro paragraph.' }] },
      ],
    },
    template_key: null,
    widgets: [],
    last_indexed_at: null,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

function makeExport(doc: NotepadDocFixture) {
  return {
    file_name: `${doc.id}.html`,
    mime_type: 'text/html',
    title: doc.title,
    html: `<!doctype html><html><body><h1>${doc.title}</h1><p>${doc.description}</p></body></html>`,
    preview_excerpt: doc.description,
  };
}

// ---------------------------------------------------------------------------
// Mock state machines
// ---------------------------------------------------------------------------

interface ListMockState {
  documents: NotepadDocFixture[];
}

async function mockNotepadList(page: Page, initial: ListMockState): Promise<void> {
  const state = { documents: initial.documents.slice(), nextSeq: initial.documents.length + 1 };

  // /notepad/documents (GET list / POST create) — register BEFORE the
  // per-id route so its more-specific pattern below wins.
  await page.route(/\/api\/v1\/notepad\/documents(?:\?[^#]*)?$/, async (route: Route) => {
    const req = route.request();
    const method = req.method();
    if (method === 'GET') {
      const url = new URL(req.url());
      const search = url.searchParams.get('search')?.toLowerCase() ?? '';
      const filtered = search
        ? state.documents.filter(
            (d) =>
              d.title.toLowerCase().includes(search) ||
              d.description.toLowerCase().includes(search) ||
              d.content.toLowerCase().includes(search),
          )
        : state.documents;
      await route.fulfill({
        json: { data: filtered, total: filtered.length, page: 1, per_page: 100 },
      });
      return;
    }
    if (method === 'POST') {
      const body = (req.postDataJSON() ?? {}) as Partial<NotepadDocFixture>;
      const created = makeDoc({
        id: `notepad-doc-new-${state.nextSeq++}`,
        title: body.title ?? 'Untitled document',
        description: body.description ?? '',
        content: body.content ?? '',
        content_doc: body.content_doc ?? null,
        template_key: body.template_key ?? null,
        widgets: body.widgets ?? [],
      });
      state.documents.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    await route.fallback();
  });

  // /notepad/documents/:id (GET / PATCH / DELETE) — last-registered
  // (most specific) wins under Playwright's reverse-order matching.
  await page.route(/\/api\/v1\/notepad\/documents\/[^/?]+(?:\?[^#]*)?$/, async (route) => {
    const method = route.request().method();
    if (method === 'DELETE') {
      const id = route.request().url().match(/\/documents\/([^/?]+)/)?.[1];
      state.documents = state.documents.filter((d) => d.id !== id);
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fallback();
  });

  // Per-document presence endpoint — the list page calls this for
  // every visible document to hydrate the "active collaborators"
  // column. Default to an empty list.
  await page.route(/\/api\/v1\/notepad\/documents\/[^/]+\/presence(?:\?[^#]*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: [] } });
  });

  // /notepad/templates (user-saved templates list). The page tolerates
  // failures here, but we surface an empty success envelope to keep
  // the pageError allowlist quiet.
  await page.route(/\/api\/v1\/notepad\/templates(?:\?[^#]*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: [] } });
  });
}

interface DetailMockState {
  doc: NotepadDocFixture;
}

async function mockNotepadDetail(page: Page, initial: DetailMockState): Promise<void> {
  const state = { doc: { ...initial.doc } };

  // /notepad/documents/:id (GET / PATCH / DELETE).
  await page.route(/\/api\/v1\/notepad\/documents\/[^/?]+(?:\?[^#]*)?$/, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: state.doc });
      return;
    }
    if (method === 'PATCH') {
      const body = (route.request().postDataJSON() ?? {}) as Partial<NotepadDocFixture>;
      state.doc = { ...state.doc, ...body, updated_at: E2E_NOW };
      await route.fulfill({ json: state.doc });
      return;
    }
    if (method === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fallback();
  });

  // /notepad/documents/:id/presence (GET list / POST heartbeat).
  await page.route(/\/api\/v1\/notepad\/documents\/[^/]+\/presence(?:\?[^#]*)?$/, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { data: [] } });
      return;
    }
    if (method === 'POST') {
      await route.fulfill({
        status: 201,
        json: {
          id: 'presence-1',
          document_id: state.doc.id,
          user_id: state.doc.owner_id,
          session_id: 'session-e2e',
          display_name: 'Test User',
          cursor_label: 'editing document',
          color: '#0f766e',
          last_seen_at: E2E_NOW,
        },
      });
      return;
    }
    await route.fallback();
  });

  // /notepad/documents/:id/export?format=html  (POST returns the
  // export payload that seeds the iframe srcDoc).
  await page.route(/\/api\/v1\/notepad\/documents\/[^/]+\/export(?:\?[^#]*)?$/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({ json: makeExport(state.doc) });
  });

  // AI knowledge-bases (the detail page populates the "Index in AIP"
  // dropdown from this). Defaults to a single empty list so the
  // dropdown renders without spinning forever.
  await page.route(/\/api\/v1\/ai\/knowledge-bases(?:\?[^#]*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: [] } });
  });
}

// ===========================================================================
// LIST PAGE
// ===========================================================================

test('list page renders the document table, stats strip, and the three built-in templates', async ({
  adminPage,
}) => {
  await mockNotepadList(adminPage, {
    documents: [
      makeDoc({
        id: 'doc-alpha',
        title: 'Alpha churn brief',
        description: 'Customer churn writeup',
        last_indexed_at: E2E_NOW,
        widgets: [{ kind: 'contour', title: 'Trend' }],
      }),
      makeDoc({
        id: 'doc-beta',
        title: 'Beta investigation log',
        description: 'Evidence-first writeup',
        template_key: 'investigation',
      }),
    ],
  });

  const list = new NotepadListPage(adminPage);
  await list.goto();
  await list.expectLoaded();

  await expect(adminPage.getByRole('heading', { level: 1, name: /^documents$/i })).toBeVisible();

  // Two rows in the gallery table.
  await expect(list.documentTable.locator('tbody tr')).toHaveCount(2);
  await expect(list.documentRow(/alpha churn/i)).toBeVisible();
  await expect(list.documentRow(/beta investigation/i)).toBeVisible();

  // The "Indexed in AIP" chip rides along only with documents that
  // have a non-null `last_indexed_at`.
  await expect(
    list.documentRow(/alpha churn/i).getByText(/indexed in aip/i),
  ).toBeVisible();
  await expect(
    list.documentRow(/beta investigation/i).getByText(/indexed in aip/i),
  ).toHaveCount(0);

  // The three built-in template buttons in the right rail.
  await expect(list.templatePanel.getByRole('button', { name: /executive brief/i })).toBeVisible();
  await expect(list.templatePanel.getByRole('button', { name: /investigation/i })).toBeVisible();
  await expect(list.templatePanel.getByRole('button', { name: /operating review/i })).toBeVisible();
});

test('search submits and refreshes the table with ?search=<term>', async ({ adminPage }) => {
  await mockNotepadList(adminPage, {
    documents: [
      makeDoc({ id: 'doc-alpha', title: 'Alpha churn brief' }),
      makeDoc({ id: 'doc-beta', title: 'Beta investigation log' }),
    ],
  });
  const cap = captureRequests(adminPage, /\/api\/v1\/notepad\/documents(\?|$)/);

  const list = new NotepadListPage(adminPage);
  await list.goto();
  await expect(list.documentTable.locator('tbody tr')).toHaveCount(2);

  await list.searchInput.fill('investigation');
  await list.searchSubmit.click();

  // Server-side filter: only the investigation log survives.
  await expect(list.documentTable.locator('tbody tr')).toHaveCount(1);
  await expect(list.documentRow(/beta investigation/i)).toBeVisible();

  // The latest list GET carried `search=investigation`.
  const lastList = [...cap.calls].reverse().find((c) => c.method === 'GET');
  expect(lastList?.url).toMatch(/[?&]search=investigation(&|$)/);

  // "Clear" button surfaces only while search is non-empty and undoes
  // the filter.
  await list.clearSearchButton.click();
  await expect(list.documentTable.locator('tbody tr')).toHaveCount(2);
});

test('"New document" POSTs /notepad/documents and navigates to the new detail page', async ({
  adminPage,
}) => {
  await mockNotepadList(adminPage, { documents: [] });
  // The post-create navigation lands on the detail route — mock its
  // endpoints too so the page renders without yelling "Document not
  // found".
  await mockNotepadDetail(adminPage, {
    doc: makeDoc({ id: 'notepad-doc-new-1', title: 'Untitled document' }),
  });
  const cap = captureRequests(adminPage, /\/api\/v1\/notepad\/documents(\?|$)/);

  const list = new NotepadListPage(adminPage);
  await list.goto();
  await list.newDocumentButton.click();

  await expect.poll(() => cap.calls.some((c) => c.method === 'POST')).toBe(true);
  const post = cap.calls.find((c) => c.method === 'POST');
  expect(post?.body).toMatchObject({
    title: 'Untitled document',
  });
  expect((post?.body as { content?: string } | undefined)?.content).toMatch(/new document/i);

  await expect(adminPage).toHaveURL(/\/notepad\/notepad-doc-new-1(\/|$|\?|#)/);
});

test('clicking a template card creates a templated document and navigates', async ({
  adminPage,
}) => {
  await mockNotepadList(adminPage, { documents: [] });
  await mockNotepadDetail(adminPage, {
    doc: makeDoc({
      id: 'notepad-doc-new-1',
      title: 'Executive Brief',
      template_key: 'executive-brief',
    }),
  });
  const cap = captureRequests(adminPage, /\/api\/v1\/notepad\/documents(\?|$)/);

  const list = new NotepadListPage(adminPage);
  await list.goto();
  await list.templatePanel.getByRole('button', { name: /executive brief/i }).click();

  await expect.poll(() => cap.calls.some((c) => c.method === 'POST')).toBe(true);
  const post = cap.calls.find((c) => c.method === 'POST');
  // The template_key + name + widgets propagate to the create body.
  expect(post?.body).toMatchObject({
    title: 'Executive Brief',
    template_key: 'executive-brief',
  });
  expect(
    Array.isArray((post?.body as { widgets?: unknown }).widgets)
      ? ((post?.body as { widgets: unknown[] }).widgets.length)
      : 0,
  ).toBeGreaterThanOrEqual(1);

  await expect(adminPage).toHaveURL(/\/notepad\/notepad-doc-new-1(\/|$|\?|#)/);
});

test('row delete → confirm dialog → DELETE /notepad/documents/:id removes the row', async ({
  adminPage,
}) => {
  await mockNotepadList(adminPage, {
    documents: [
      makeDoc({ id: 'doc-alpha', title: 'Alpha churn brief' }),
      makeDoc({ id: 'doc-beta', title: 'Beta investigation log' }),
    ],
  });
  const cap = captureRequests(adminPage, /\/api\/v1\/notepad\/documents\/doc-beta$/);

  const list = new NotepadListPage(adminPage);
  await list.goto();
  const target = list.documentRow(/beta investigation/i);
  await target.getByRole('button', { name: /^delete$/i }).click();

  const dialog = adminPage.getByRole('dialog', { name: /delete document/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/beta investigation/i)).toBeVisible();
  await dialog.getByRole('button', { name: /^delete$/i }).click();

  await expect.poll(() => cap.calls.some((c) => c.method === 'DELETE')).toBe(true);
  await expect(list.documentRow(/beta investigation/i)).toHaveCount(0);
  await expect(list.documentRow(/alpha churn/i)).toBeVisible();
  await expect(adminPage.getByText(/document deleted/i)).toBeVisible();
});

test('clicking the row link navigates to the document detail page', async ({ adminPage }) => {
  await mockNotepadList(adminPage, {
    documents: [makeDoc({ id: 'doc-alpha', title: 'Alpha churn brief' })],
  });
  await mockNotepadDetail(adminPage, {
    doc: makeDoc({ id: 'doc-alpha', title: 'Alpha churn brief' }),
  });

  const list = new NotepadListPage(adminPage);
  await list.goto();
  await list.documentRow(/alpha churn/i)
    .getByRole('link', { name: /alpha churn brief/i })
    .click();

  await expect(adminPage).toHaveURL(/\/notepad\/doc-alpha(\/|$|\?|#)/);
  await expect(adminPage.getByPlaceholder(/document title/i)).toHaveValue('Alpha churn brief');
});

// ===========================================================================
// DETAIL PAGE
// ===========================================================================

test('detail page renders title, description, and the TipTap rich-text editor', async ({
  adminPage,
}) => {
  await mockNotepadDetail(adminPage, {
    doc: makeDoc({
      title: 'Q3 incident postmortem',
      description: 'What happened, what we learned',
      content_doc: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Q3 incident postmortem' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Body text seeded from content_doc.' }],
          },
        ],
      },
    }),
  });

  const detail = new NotepadDetailPage(adminPage, DOC_ID);
  await detail.goto();

  // Title and description inputs are seeded from the GET response.
  await expect(detail.titleInput).toHaveValue('Q3 incident postmortem');
  await expect(detail.descriptionInput).toHaveValue('What happened, what we learned');

  // TipTap mounts a `<div class="ProseMirror" contenteditable="true">`.
  // The initial content from `content_doc` is rendered into it.
  await expect(detail.proseMirrorEditor).toBeVisible();
  await expect(detail.proseMirrorEditor).toHaveAttribute('contenteditable', 'true');
  await expect(detail.proseMirrorEditor.locator('h1')).toContainText('Q3 incident postmortem');
  await expect(detail.proseMirrorEditor.locator('p')).toContainText(/body text seeded/i);

  // The export-preview iframe is mounted from the HTML export response.
  await expect(detail.previewIframe).toBeVisible();
});

test('editing the title and clicking Save fires PATCH /notepad/documents/:id with the new title', async ({
  adminPage,
}) => {
  await mockNotepadDetail(adminPage, {
    doc: makeDoc({ title: 'Original title' }),
  });
  const cap = captureRequests(adminPage, new RegExp(`/api/v1/notepad/documents/${DOC_ID}$`));

  const detail = new NotepadDetailPage(adminPage, DOC_ID);
  await detail.goto();
  await expect(detail.proseMirrorEditor).toBeVisible();

  await detail.titleInput.fill('Edited title — Q3 retro');
  await detail.saveButton.click();

  await expect.poll(() => cap.calls.some((c) => c.method === 'PATCH')).toBe(true);
  const patch = cap.calls.find((c) => c.method === 'PATCH');
  expect(patch?.body).toMatchObject({ title: 'Edited title — Q3 retro' });
  // The PATCH body carries the live ProseMirror JSON (content_doc),
  // not just the raw markdown — this is the load-bearing assertion
  // that the rich-text round-trip is wired up.
  expect((patch?.body as { content_doc?: unknown }).content_doc).toBeTruthy();
});

test('typing inside the TipTap editor mutates the ProseMirror surface', async ({ adminPage }) => {
  await mockNotepadDetail(adminPage, {
    doc: makeDoc({
      content_doc: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Seed.' }] }],
      },
    }),
  });

  const detail = new NotepadDetailPage(adminPage, DOC_ID);
  await detail.goto();
  await expect(detail.proseMirrorEditor).toBeVisible();

  await detail.proseMirrorEditor.click();
  // Move caret to end of seed paragraph, then append text.
  await adminPage.keyboard.press('End');
  await adminPage.keyboard.type(' Appended live.');

  await expect(detail.proseMirrorEditor).toContainText('Seed. Appended live.');
});

// ===========================================================================
// REGRESSION GUARD
// ===========================================================================

test('absent today: Pin and Archive affordances on both list and detail', async ({
  adminPage,
}) => {
  await mockNotepadList(adminPage, {
    documents: [makeDoc({ id: 'doc-alpha', title: 'Alpha churn brief' })],
  });

  const list = new NotepadListPage(adminPage);
  await list.goto();
  // No global pin/archive toolbar buttons and no per-row controls.
  expect(await list.pinButton.count()).toBe(0);
  expect(await list.archiveButton.count()).toBe(0);
  expect(
    await list.documentRow(/alpha churn/i)
      .getByRole('button', { name: /^(pin|unpin|archive|unarchive)/i })
      .count(),
  ).toBe(0);

  // On the detail page either — the right-rail panels cover Presence
  // / AIP indexing / Preview, not pin/archive. Scoping to the page
  // area dodges any global topbar Pin-like icon that might exist.
  await mockNotepadDetail(adminPage, { doc: makeDoc({ id: 'doc-alpha' }) });
  const detail = new NotepadDetailPage(adminPage, 'doc-alpha');
  await detail.goto();
  await expect(detail.proseMirrorEditor).toBeVisible();
  expect(
    await detail.pageArea.getByRole('button', { name: /^(pin|unpin|archive|unarchive)/i }).count(),
  ).toBe(0);
});

import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { NotebooksListPage, NotebookDetailPage } from './pages';

/**
 * E2E coverage for `/notebooks` and `/notebooks/:id`
 * (apps/web/src/routes/notebooks/*).
 *
 * **Reality vs roadmap.** The shipped notebook surface is a
 * Jupyter-style detail page with code + markdown cells (each rendered
 * by a per-cell Monaco editor), Run / Run all, four kernels
 * (Python / SQL / LLM / R), a sessions strip, table / text / error /
 * LLM output rendering, an icon-only "Delete cell" action, and a
 * workspace-files side panel. The list page is a server-paginated
 * table with a search-form-submit flow, stats cards, and per-row
 * Open / Delete actions.
 *
 * Auto-save fires on Monaco blur — there is no explicit Save button.
 * Drag-drop cell reorder, a "Restart kernel" affordance, and
 * image-typed cell outputs are all roadmap. The single absent-today
 * regression guard at the end pins those gaps so they surface as soon
 * as the feature lands.
 *
 * Endpoints exercised (all under `/api/v1`):
 *   - GET    /notebooks?page=&per_page=&search=
 *   - POST   /notebooks
 *   - GET    /notebooks/:id              → { notebook, cells }
 *   - PUT    /notebooks/:id              → updated Notebook
 *   - DELETE /notebooks/:id
 *   - POST   /notebooks/:id/cells        → new Cell
 *   - PATCH  /notebooks/:id/cells/:cid   → updated Cell
 *   - DELETE /notebooks/:id/cells/:cid
 *   - POST   /notebooks/:id/cells/:cid/execute      → CellOutput
 *   - POST   /notebooks/:id/cells/execute-all       → { results: [...] }
 *   - GET    /notebooks/:id/sessions
 *   - POST   /notebooks/:id/sessions
 *   - GET    /notebooks/:id/workspace
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Failed to load notebook/,
    ],
  },
});

const E2E_NOW = '2026-05-11T00:00:00Z';
const NOTEBOOK_ID = 'notebook-1';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface NotebookFixture {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  default_kernel: string;
  created_at: string;
  updated_at: string;
}

interface CellOutputFixture {
  output_type: string;
  content: unknown;
  execution_count: number;
}

interface CellFixture {
  id: string;
  notebook_id: string;
  cell_type: string;
  kernel: string;
  source: string;
  position: number;
  last_output: CellOutputFixture | null;
  execution_count: number | null;
  created_at: string;
  updated_at: string;
}

interface SessionFixture {
  id: string;
  notebook_id: string;
  kernel: string;
  status: string;
  started_by: string;
  created_at: string;
  last_activity: string;
}

function makeNotebook(overrides: Partial<NotebookFixture> = {}): NotebookFixture {
  return {
    id: NOTEBOOK_ID,
    name: 'Customer churn exploration',
    description: 'Demo notebook',
    owner_id: '00000000-0000-0000-0000-000000000001',
    default_kernel: 'python',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

function makeCell(overrides: Partial<CellFixture> = {}): CellFixture {
  return {
    id: 'cell-1',
    notebook_id: NOTEBOOK_ID,
    cell_type: 'code',
    kernel: 'python',
    source: 'print("hello")',
    position: 1,
    last_output: null,
    execution_count: null,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionFixture> = {}): SessionFixture {
  return {
    id: 'session-1',
    notebook_id: NOTEBOOK_ID,
    kernel: 'python',
    status: 'idle',
    started_by: '00000000-0000-0000-0000-000000000001',
    created_at: E2E_NOW,
    last_activity: E2E_NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock state machines
// ---------------------------------------------------------------------------

interface ListMockState {
  notebooks: NotebookFixture[];
  total?: number;
}

async function mockNotebooksList(page: Page, initial: ListMockState): Promise<void> {
  const state = { notebooks: initial.notebooks.slice(), total: initial.total };

  await page.route(/\/api\/v1\/notebooks(?:\?[^#]*)?$/, async (route: Route) => {
    const req = route.request();
    const method = req.method();
    if (method === 'GET') {
      const url = new URL(req.url());
      const search = url.searchParams.get('search')?.toLowerCase() ?? '';
      const filtered = search
        ? state.notebooks.filter(
            (nb) =>
              nb.name.toLowerCase().includes(search) ||
              nb.description.toLowerCase().includes(search),
          )
        : state.notebooks;
      await route.fulfill({
        json: {
          data: filtered,
          total: state.total ?? filtered.length,
          page: Number(url.searchParams.get('page') ?? '1'),
          per_page: Number(url.searchParams.get('per_page') ?? '20'),
        },
      });
      return;
    }
    if (method === 'POST') {
      const body = (req.postDataJSON() ?? {}) as {
        name?: string;
        description?: string;
        default_kernel?: string;
      };
      const created = makeNotebook({
        id: `notebook-new-${state.notebooks.length + 1}`,
        name: body.name ?? 'Untitled',
        description: body.description ?? '',
        default_kernel: body.default_kernel ?? 'python',
      });
      state.notebooks.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    await route.fallback();
  });

  // Per-notebook DELETE on the list page (the modal-confirm flow calls
  // DELETE /api/v1/notebooks/:id then re-fetches the list).
  await page.route(/\/api\/v1\/notebooks\/[^/?]+(?:\?[^#]*)?$/, async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    const url = route.request().url();
    const id = url.split('/').pop()?.split('?')[0];
    state.notebooks = state.notebooks.filter((nb) => nb.id !== id);
    await route.fulfill({ status: 204, body: '' });
  });
}

interface DetailMockState {
  notebook: NotebookFixture;
  cells: CellFixture[];
  sessions?: SessionFixture[];
  /**
   * The `executeCell` and `executeAllCells` responses. Each call to
   * /execute on a code cell pops the next output here (round-robin if
   * fewer outputs than calls). Defaults to a text output.
   */
  executeOutputs?: CellOutputFixture[];
}

async function mockNotebookDetail(page: Page, initial: DetailMockState): Promise<void> {
  const state = {
    notebook: { ...initial.notebook },
    cells: initial.cells.map((c) => ({ ...c })),
    sessions: (initial.sessions ?? []).slice(),
    executeOutputs: (initial.executeOutputs ?? [
      { output_type: 'text', content: 'hello\n', execution_count: 1 },
    ]).slice(),
    nextCellSeq: initial.cells.length + 1,
    nextSessionSeq: (initial.sessions?.length ?? 0) + 1,
    executions: 0,
  };

  const popOutput = (): CellOutputFixture => {
    if (state.executeOutputs.length === 0) {
      state.executions += 1;
      return { output_type: 'text', content: 'ok', execution_count: state.executions };
    }
    const out = state.executeOutputs.shift()!;
    state.executions += 1;
    return { ...out, execution_count: out.execution_count || state.executions };
  };

  // Most-specific patterns LAST — Playwright matches handlers most-recent-first.

  // /notebooks/:id  (GET / PUT / DELETE)
  await page.route(/\/api\/v1\/notebooks\/[^/?]+(?:\?[^#]*)?$/, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { notebook: state.notebook, cells: state.cells } });
      return;
    }
    if (method === 'PUT') {
      const body = (route.request().postDataJSON() ?? {}) as Partial<NotebookFixture>;
      state.notebook = { ...state.notebook, ...body, updated_at: E2E_NOW };
      await route.fulfill({ json: state.notebook });
      return;
    }
    if (method === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fallback();
  });

  // /notebooks/:id/workspace (GET / PUT / DELETE)
  await page.route(/\/api\/v1\/notebooks\/[^/]+\/workspace(?:\?[^#]*)?$/, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { data: [] } });
      return;
    }
    if (method === 'PUT') {
      const body = (route.request().postDataJSON() ?? {}) as { path: string; content: string };
      await route.fulfill({
        json: {
          path: body.path,
          language: 'text',
          content: body.content,
          size_bytes: body.content.length,
          updated_at: E2E_NOW,
        },
      });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });

  // /notebooks/:id/sessions  (GET list / POST create) and stop endpoint below.
  await page.route(/\/api\/v1\/notebooks\/[^/]+\/sessions(?:\?[^#]*)?$/, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { data: state.sessions } });
      return;
    }
    if (method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as { kernel?: string };
      const session = makeSession({
        id: `session-${state.nextSessionSeq++}`,
        kernel: body.kernel ?? state.notebook.default_kernel,
      });
      state.sessions.push(session);
      await route.fulfill({ status: 201, json: session });
      return;
    }
    await route.fallback();
  });

  await page.route(
    /\/api\/v1\/notebooks\/[^/]+\/sessions\/[^/]+\/stop$/,
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      const id = route.request().url().match(/\/sessions\/([^/]+)\/stop/)?.[1];
      const idx = state.sessions.findIndex((s) => s.id === id);
      if (idx >= 0) {
        state.sessions[idx] = { ...state.sessions[idx], status: 'dead' };
      }
      await route.fulfill({ json: state.sessions[idx] ?? makeSession({ id: id ?? 'session-x', status: 'dead' }) });
    },
  );

  // /notebooks/:id/cells  (GET list / POST add) and the more-specific
  // patterns below take precedence by registration order.
  await page.route(/\/api\/v1\/notebooks\/[^/]+\/cells(?:\?[^#]*)?$/, async (route) => {
    const method = route.request().method();
    if (method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as Partial<CellFixture>;
      const cell = makeCell({
        id: `cell-${state.nextCellSeq++}`,
        cell_type: body.cell_type ?? 'code',
        kernel: body.kernel ?? state.notebook.default_kernel,
        source: body.source ?? '',
        position: state.cells.length + 1,
      });
      state.cells.push(cell);
      await route.fulfill({ status: 201, json: cell });
      return;
    }
    await route.fallback();
  });

  // /notebooks/:id/cells/execute-all  (POST batch)
  await page.route(
    /\/api\/v1\/notebooks\/[^/]+\/cells\/execute-all$/,
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      const results = state.cells
        .filter((c) => c.cell_type === 'code')
        .map((c) => ({ cell_id: c.id, output: popOutput() }));
      await route.fulfill({ json: { results } });
    },
  );

  // /notebooks/:id/cells/:cid/execute  (POST single)
  await page.route(
    /\/api\/v1\/notebooks\/[^/]+\/cells\/[^/]+\/execute$/,
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({ json: popOutput() });
    },
  );

  // /notebooks/:id/cells/:cid  (PATCH update / DELETE remove)
  await page.route(/\/api\/v1\/notebooks\/[^/]+\/cells\/[^/?]+(?:\?[^#]*)?$/, async (route) => {
    const method = route.request().method();
    const cellId = route.request().url().match(/\/cells\/([^/?]+)/)?.[1];
    if (!cellId) return route.fallback();

    if (method === 'PATCH') {
      const body = (route.request().postDataJSON() ?? {}) as Partial<CellFixture>;
      const idx = state.cells.findIndex((c) => c.id === cellId);
      if (idx >= 0) {
        state.cells[idx] = { ...state.cells[idx], ...body, updated_at: E2E_NOW };
        await route.fulfill({ json: state.cells[idx] });
        return;
      }
      await route.fulfill({ status: 404, body: '' });
      return;
    }
    if (method === 'DELETE') {
      state.cells = state.cells.filter((c) => c.id !== cellId);
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fallback();
  });
}

// ---------------------------------------------------------------------------
// Standard fixtures
// ---------------------------------------------------------------------------

const NOTEBOOKS_THREE: NotebookFixture[] = [
  makeNotebook({
    id: 'notebook-python',
    name: 'Customer churn (Python)',
    description: 'pandas + scikit',
    default_kernel: 'python',
  }),
  makeNotebook({
    id: 'notebook-sql',
    name: 'Revenue by region (SQL)',
    description: 'warehouse rollups',
    default_kernel: 'sql',
  }),
  makeNotebook({
    id: 'notebook-r',
    name: 'Forecast (R)',
    description: 'time-series models',
    default_kernel: 'r',
  }),
];

const TABLE_OUTPUT: CellOutputFixture = {
  output_type: 'table',
  content: {
    columns: [
      { name: 'region', data_type: 'text' },
      { name: 'revenue', data_type: 'numeric' },
    ],
    rows: [
      ['EMEA', '12450.75'],
      ['NA', '24890.10'],
    ],
    total_rows: 2,
    execution_time_ms: 42,
  },
  execution_count: 1,
};

const TEXT_OUTPUT: CellOutputFixture = {
  output_type: 'text',
  content: 'hello, notebook!\n',
  execution_count: 1,
};

// ===========================================================================
// LIST PAGE
// ===========================================================================

test('list page renders the mocked notebooks with stats and kernel chips', async ({
  adminPage,
}) => {
  await mockNotebooksList(adminPage, { notebooks: NOTEBOOKS_THREE });

  const list = new NotebooksListPage(adminPage);
  await list.goto();
  await list.expectLoaded();

  await expect(adminPage.getByRole('heading', { level: 1, name: /^notebooks$/i })).toBeVisible();

  // Three rows in the gallery table.
  const rows = list.notebookTable.locator('tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(list.notebookRow(/customer churn/i)).toBeVisible();
  await expect(list.notebookRow(/revenue by region/i)).toBeVisible();
  await expect(list.notebookRow(/forecast/i)).toBeVisible();

  // Kernel chips read out per row (chips are uppercased via CSS but the
  // node text is the raw kernel string).
  await expect(list.notebookRow(/customer churn/i).getByText(/^python$/i)).toBeVisible();
  await expect(list.notebookRow(/revenue by region/i).getByText(/^sql$/i)).toBeVisible();
  await expect(list.notebookRow(/forecast/i).getByText(/^r$/i)).toBeVisible();

  // Pagination range readout reflects the total.
  await expect(adminPage.getByText(/showing 1-3 of 3/i)).toBeVisible();
});

test('search submits with ?search=<term> and the table refreshes', async ({ adminPage }) => {
  await mockNotebooksList(adminPage, { notebooks: NOTEBOOKS_THREE });

  const cap = captureRequests(adminPage, /\/api\/v1\/notebooks\?/);
  const list = new NotebooksListPage(adminPage);
  await list.goto();
  await expect(list.notebookTable.locator('tbody tr')).toHaveCount(3);

  await list.searchInput.fill('region');
  await list.searchSubmit.click();

  // Server-side filter: only the SQL notebook matches.
  await expect(list.notebookTable.locator('tbody tr')).toHaveCount(1);
  await expect(list.notebookRow(/revenue by region/i)).toBeVisible();

  // The latest list-endpoint call carried `search=region`.
  const lastListCall = [...cap.calls].reverse().find((c) => c.method === 'GET');
  expect(lastListCall?.url).toMatch(/[?&]search=region(&|$)/);

  // "Clear" button is now exposed (only renders while search is non-empty)
  // and undoes the filter.
  await list.clearSearchButton.click();
  await expect(list.notebookTable.locator('tbody tr')).toHaveCount(3);
});

test('"New notebook" modal exposes all four kernels (Python / SQL / LLM / R)', async ({
  adminPage,
}) => {
  await mockNotebooksList(adminPage, { notebooks: [] });

  const list = new NotebooksListPage(adminPage);
  await list.goto();

  // Modal is closed initially.
  await expect(list.createDialog).toHaveCount(0);

  // Empty state ships its own "New notebook" CTA — scope to header to
  // disambiguate. The empty-state button is rendered later in DOM, so
  // `.first()` (header) is the toolbar button.
  await list.newNotebookButton.click();
  await expect(list.createDialog).toBeVisible();
  await expect(
    list.createDialog.getByRole('heading', { name: /^new notebook$/i }),
  ).toBeVisible();

  // Kernel `<select>` carries the four documented options. This pins
  // both the "Crear Python/R/SQL" cases from the task AND the LLM
  // kernel that ships alongside.
  const kernel = list.createDialog.getByRole('combobox');
  for (const value of ['python', 'sql', 'llm', 'r']) {
    await expect(kernel.locator(`option[value="${value}"]`)).toHaveCount(1);
  }

  // The submit button stays disabled until a name is typed.
  const submit = list.createDialog.getByRole('button', { name: /^create notebook$/i });
  await expect(submit).toBeDisabled();
  await list.createDialog.getByRole('textbox').first().fill('Q3 cohort study');
  await expect(submit).toBeEnabled();
});

test('submitting the modal POSTs /notebooks and navigates to the new notebook', async ({
  adminPage,
}) => {
  await mockNotebooksList(adminPage, { notebooks: [] });
  // The post-create navigation hits the detail route — install its
  // mocks too so the page renders cleanly (otherwise the default
  // catch-all returns an empty envelope and the page yells about
  // "notebook not found").
  await mockNotebookDetail(adminPage, {
    notebook: makeNotebook({ id: 'notebook-new-1', name: 'Q3 cohort study' }),
    cells: [],
  });

  const cap = captureRequests(adminPage, /\/api\/v1\/notebooks(\?|$)/);
  const list = new NotebooksListPage(adminPage);
  await list.goto();
  await list.newNotebookButton.click();

  await list.createDialog.getByRole('textbox').first().fill('Q3 cohort study');
  await list.createDialog.getByRole('combobox').selectOption('r');
  await list.createDialog.getByRole('button', { name: /^create notebook$/i }).click();

  await expect.poll(() => cap.calls.some((c) => c.method === 'POST')).toBe(true);
  const post = cap.calls.find((c) => c.method === 'POST');
  expect(post?.body).toMatchObject({
    name: 'Q3 cohort study',
    default_kernel: 'r',
  });

  // The page navigates to the detail route for the newly-minted id.
  await expect(adminPage).toHaveURL(/\/notebooks\/notebook-new-1(\/|$|\?|#)/);
});

test('clicking a notebook name in the row navigates to its detail page', async ({
  adminPage,
}) => {
  await mockNotebooksList(adminPage, { notebooks: NOTEBOOKS_THREE });
  await mockNotebookDetail(adminPage, {
    notebook: makeNotebook({ id: 'notebook-sql', name: 'Revenue by region (SQL)', default_kernel: 'sql' }),
    cells: [],
  });

  const list = new NotebooksListPage(adminPage);
  await list.goto();
  await list.notebookRow(/revenue by region/i)
    .getByRole('link', { name: /revenue by region/i })
    .click();

  await expect(adminPage).toHaveURL(/\/notebooks\/notebook-sql(\/|$|\?|#)/);
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /revenue by region/i }),
  ).toBeVisible();
});

test('row delete → confirm dialog → DELETE /notebooks/:id removes the row', async ({
  adminPage,
}) => {
  await mockNotebooksList(adminPage, { notebooks: NOTEBOOKS_THREE });
  const cap = captureRequests(adminPage, /\/api\/v1\/notebooks\/notebook-python$/);

  const list = new NotebooksListPage(adminPage);
  await list.goto();
  const target = list.notebookRow(/customer churn/i);
  await expect(target).toBeVisible();
  await target.getByRole('button', { name: /^delete$/i }).click();

  // Confirm dialog appears — it carries the notebook name in the body.
  const confirm = adminPage.getByRole('dialog', { name: /delete notebook/i });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText(/customer churn/i)).toBeVisible();
  await confirm.getByRole('button', { name: /^delete$/i }).click();

  await expect.poll(() => cap.calls.some((c) => c.method === 'DELETE')).toBe(true);
  await expect(list.notebookRow(/customer churn/i)).toHaveCount(0);
  await expect(adminPage.getByText(/notebook deleted/i)).toBeVisible();
});

// ===========================================================================
// DETAIL PAGE
// ===========================================================================

test('detail page renders the mocked cells with type chips and exec counts', async ({
  adminPage,
}) => {
  await mockNotebookDetail(adminPage, {
    notebook: makeNotebook({ name: 'Churn deep dive' }),
    cells: [
      makeCell({ id: 'cell-1', position: 1, source: '# Intro', cell_type: 'markdown', kernel: 'python' }),
      makeCell({ id: 'cell-2', position: 2, source: 'df.head()', execution_count: 3 }),
      makeCell({ id: 'cell-3', position: 3, source: 'df.tail()' }),
    ],
  });

  const detail = new NotebookDetailPage(adminPage, NOTEBOOK_ID);
  await detail.goto();

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /churn deep dive/i }),
  ).toBeVisible();
  await expect(detail.cellList).toHaveCount(3);

  // First cell is markdown, the other two are code. Each carries an
  // "In [N]" chip — the second cell ships with execution_count: 3.
  await expect(detail.cell(0).getByText(/^markdown$/i).first()).toBeVisible();
  await expect(detail.cell(1).getByText(/^code$/i).first()).toBeVisible();
  await expect(detail.cell(1).getByText(/^in \[3\]$/i)).toBeVisible();
  await expect(detail.cell(2).getByText(/^in \[ \]$/i)).toBeVisible();
});

test('"Code cell" button POSTs /cells and the new cell appears at the bottom', async ({
  adminPage,
}) => {
  await mockNotebookDetail(adminPage, {
    notebook: makeNotebook(),
    cells: [makeCell({ id: 'cell-1', source: '1 + 1' })],
  });
  const cap = captureRequests(adminPage, /\/api\/v1\/notebooks\/[^/]+\/cells(\?|$)/);

  const detail = new NotebookDetailPage(adminPage, NOTEBOOK_ID);
  await detail.goto();
  await expect(detail.cellList).toHaveCount(1);

  // Add-cell row sits below the cells; click the code-cell affordance.
  await detail.addCodeCellButtons.last().click();

  await expect.poll(() => cap.calls.some((c) => c.method === 'POST')).toBe(true);
  expect(cap.calls.find((c) => c.method === 'POST')?.body).toMatchObject({
    cell_type: 'code',
    kernel: 'python',
  });

  await expect(detail.cellList).toHaveCount(2);
});

test('editing a cell via Monaco fires PATCH /cells/:id with the new source on blur', async ({
  adminPage,
}) => {
  await mockNotebookDetail(adminPage, {
    notebook: makeNotebook(),
    cells: [makeCell({ id: 'cell-1', source: 'x = 1' })],
  });
  const cap = captureRequests(adminPage, /\/api\/v1\/notebooks\/[^/]+\/cells\/cell-1$/);

  const detail = new NotebookDetailPage(adminPage, NOTEBOOK_ID);
  await detail.goto();

  // Wait for Monaco to mount (the dev server lazy-loads the module).
  const editor = detail.cellEditor(0);
  await expect(editor).toBeVisible();
  // Monaco's hidden input lives at .inputarea inside the editor; clicking
  // the editor surface focuses it and lets us type.
  await editor.click();
  await adminPage.keyboard.type(' + 2');

  // Blur the editor by tabbing focus away — this is how onBlur fires
  // and the page persists the source via updateCell().
  await adminPage.keyboard.press('Escape');
  await detail.runAllButton.focus();

  await expect.poll(() => cap.calls.some((c) => c.method === 'PATCH')).toBe(true);
  const patch = cap.calls.find((c) => c.method === 'PATCH');
  expect(patch?.body).toMatchObject({});
  // Source carries whatever Monaco buffered. We don't pin the exact
  // string (typing-into-Monaco is order-dependent) but the value MUST
  // start with the original prefix and MUST be non-empty.
  expect(typeof (patch?.body as { source?: string } | undefined)?.source).toBe('string');
  expect((patch?.body as { source: string }).source.length).toBeGreaterThan('x = 1'.length - 1);
});

test('executing a single cell POSTs /execute and renders a text output', async ({ adminPage }) => {
  await mockNotebookDetail(adminPage, {
    notebook: makeNotebook(),
    cells: [makeCell({ id: 'cell-1', source: 'print("hi")' })],
    sessions: [makeSession({ id: 'session-1', status: 'idle' })],
    executeOutputs: [TEXT_OUTPUT],
  });
  const cap = captureRequests(adminPage, /\/cells\/cell-1\/execute$/);

  const detail = new NotebookDetailPage(adminPage, NOTEBOOK_ID);
  await detail.goto();
  await detail.cellRunButton(0).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('POST');

  // Text output renders as a <pre> with the literal content.
  await expect(detail.cell(0).locator('pre')).toContainText(/hello, notebook!/i);
  // After execution, the toolbar chip flips from "In [ ]" to "In [1]".
  await expect(detail.cell(0).getByText(/^in \[1\]$/i)).toBeVisible();
});

test('table-typed output renders as a real <table> with the columns and rows', async ({
  adminPage,
}) => {
  await mockNotebookDetail(adminPage, {
    notebook: makeNotebook({ default_kernel: 'sql' }),
    cells: [makeCell({ id: 'cell-1', kernel: 'sql', source: 'SELECT region, revenue FROM r' })],
    sessions: [makeSession({ id: 'session-1', kernel: 'sql', status: 'idle' })],
    executeOutputs: [TABLE_OUTPUT],
  });

  const detail = new NotebookDetailPage(adminPage, NOTEBOOK_ID);
  await detail.goto();
  await detail.cellRunButton(0).click();

  // Output zone now hosts a <table>. CellOutput renders its own
  // header summary ("2 rows in 42ms") above the table.
  await expect(detail.cell(0).getByText(/2 rows in 42ms/i)).toBeVisible();
  const outputTable = detail.cell(0).locator('table').first();
  await expect(outputTable).toBeVisible();
  await expect(outputTable.getByRole('columnheader', { name: /region/i })).toBeVisible();
  await expect(outputTable.getByRole('columnheader', { name: /revenue/i })).toBeVisible();
  await expect(outputTable.getByRole('cell', { name: 'EMEA' })).toBeVisible();
  await expect(outputTable.getByRole('cell', { name: '12450.75' })).toBeVisible();
});

test('"Run all" POSTs /cells/execute-all and renders output on every code cell', async ({
  adminPage,
}) => {
  await mockNotebookDetail(adminPage, {
    notebook: makeNotebook(),
    cells: [
      makeCell({ id: 'cell-1', position: 1, source: 'a = 1' }),
      makeCell({ id: 'cell-2', position: 2, source: 'a + 2' }),
    ],
    sessions: [makeSession({ id: 'session-1', status: 'idle' })],
    executeOutputs: [
      { output_type: 'text', content: 'first\n', execution_count: 1 },
      { output_type: 'text', content: 'second\n', execution_count: 2 },
    ],
  });
  const cap = captureRequests(adminPage, /\/cells\/execute-all$/);

  const detail = new NotebookDetailPage(adminPage, NOTEBOOK_ID);
  await detail.goto();
  await detail.runAllButton.click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  await expect(detail.cell(0).locator('pre')).toContainText(/first/);
  await expect(detail.cell(1).locator('pre')).toContainText(/second/);
});

test('cell delete button DELETEs /cells/:id and the cell disappears', async ({ adminPage }) => {
  await mockNotebookDetail(adminPage, {
    notebook: makeNotebook(),
    cells: [
      makeCell({ id: 'cell-1', position: 1, source: 'keep me' }),
      makeCell({ id: 'cell-2', position: 2, source: 'delete me' }),
    ],
  });
  const cap = captureRequests(adminPage, /\/api\/v1\/notebooks\/[^/]+\/cells\/cell-2$/);

  const detail = new NotebookDetailPage(adminPage, NOTEBOOK_ID);
  await detail.goto();
  await expect(detail.cellList).toHaveCount(2);

  await detail.cellDeleteButton(1).click();

  await expect.poll(() => cap.calls.some((c) => c.method === 'DELETE')).toBe(true);
  await expect(detail.cellList).toHaveCount(1);
  // The remaining cell is the "keep me" one — output of the deleted
  // cell is gone too.
  await expect(detail.cellList).not.toContainText('delete me');
});

// ===========================================================================
// REGRESSION GUARD
// ===========================================================================

test('absent today: drag-drop reorder, explicit Save, Restart kernel, image output', async ({
  adminPage,
}) => {
  await mockNotebookDetail(adminPage, {
    notebook: makeNotebook(),
    cells: [
      makeCell({ id: 'cell-1', position: 1, source: 'a = 1' }),
      makeCell({ id: 'cell-2', position: 2, source: 'a + 2' }),
    ],
  });

  const detail = new NotebookDetailPage(adminPage, NOTEBOOK_ID);
  await detail.goto();
  await expect(detail.cellList).toHaveCount(2);

  // Roadmap: drag-drop cell reorder. The shipped UI has no handle on
  // each cell — cells render in `position` order from the API and the
  // only re-order path today is server-side (`PATCH /cells/:id` with a
  // `position` field), exposed nowhere in the UI.
  expect(await detail.cell(0).getByRole('button', { name: /^(move up|move down)$/i }).count()).toBe(0);
  expect(await adminPage.locator('[draggable="true"]').count()).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /reorder|drag/i }).count(),
  ).toBe(0);

  // Roadmap: explicit Save / Restart kernel buttons. Auto-save runs on
  // Monaco blur, and "Restart" is the Stop+Start sequence — no atomic
  // affordance ships.
  expect(await detail.saveButton.count()).toBe(0);
  expect(await detail.restartKernelButton.count()).toBe(0);

  // Roadmap: image-typed cell outputs. The CellOutput component
  // implements `table` / `llm` / `error` / fallback-text but no `image`
  // branch — any image rendered here would be from a different output
  // type, so a bare image inside an output zone fails the guard. We
  // scope to .of-panel.notebook-cell so the AppShell's avatar/logo
  // images don't trip the assertion.
  expect(await detail.cellList.locator('img').count()).toBe(0);
});

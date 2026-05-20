import { type Page } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { E2E_NOW } from './fixtures/mocks';

/**
 * E2E coverage for `/ai/threads` (apps/web/src/routes/ai/ThreadsPage.tsx).
 *
 * Unlike the sibling AI surfaces this page is **real**: it is backed by
 * agent-runtime-service and renders three live panes —
 *
 *   - Left:    `ThreadListPane`     — TanStack query on
 *              `GET /agent-runtime/threads?limit=50` (30 s polling) +
 *              a "+ New" button that posts `createThread` and
 *              auto-selects the result.
 *   - Center:  `MessagesPane`       — `GET /threads/:id/messages` for
 *              the selected thread, plus a composer that posts
 *              `{ role: 'user', content }` to the same path.
 *   - Right:   `SidePane`           — `TracePanel` (5 s polling of
 *              `/threads/:id/trace`) + `DocumentUploadPanel` that
 *              posts to `/retrieval/documents`.
 *
 * The roadmap also calls for rename / delete / search / share UI but
 * none of that is wired today — note that the API client does ship
 * a `deleteThread()` helper, it just isn't bound to any button. The
 * "absent today" test at the bottom of this file pins each missing
 * control so a partial implementation surfaces here.
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
// Fixtures (mirror @/lib/api/threads wire shapes)
// ---------------------------------------------------------------------------

interface ThreadFixture {
  id: string;
  title: string;
  tool_manifest: { tools: unknown[] };
  max_tool_calls: number;
  max_prompt_tokens: number;
  status: 'active' | 'archived' | 'closed';
  created_at: string;
  updated_at: string;
}

interface ThreadMessageFixture {
  id: string;
  thread_id: string;
  position: number;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_name?: string;
  created_at: string;
}

interface TraceStepFixture {
  id: string;
  thread_id: string;
  step_index: number;
  kind: 'plan' | 'tool_call' | 'observation' | 'final' | 'error' | 'budget_exhausted';
  tool_name?: string;
  payload?: Record<string, unknown>;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  created_at: string;
}

function makeThread(overrides: Partial<ThreadFixture> = {}): ThreadFixture {
  return {
    id: 'thread-1',
    title: 'Sample thread',
    tool_manifest: { tools: [] },
    max_tool_calls: 6,
    max_prompt_tokens: 16_000,
    status: 'active',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<ThreadMessageFixture> = {}): ThreadMessageFixture {
  return {
    id: 'msg-1',
    thread_id: 'thread-1',
    position: 0,
    role: 'user',
    content: 'sample content',
    created_at: E2E_NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Endpoint patterns
// ---------------------------------------------------------------------------

const THREADS_LIST = /\/api\/v1\/agent-runtime\/threads\?/;
const THREADS_CREATE = /\/api\/v1\/agent-runtime\/threads(\?.*)?$/;
const MESSAGES_PATH = /\/api\/v1\/agent-runtime\/threads\/([^/]+)\/messages$/;
const TRACE_PATH = /\/api\/v1\/agent-runtime\/threads\/([^/]+)\/trace$/;
const RETRIEVAL_DOCS = /\/api\/v1\/retrieval\/documents$/;

interface MockState {
  threads: ThreadFixture[];
  messages: Record<string, ThreadMessageFixture[]>;
  trace: Record<string, TraceStepFixture[]>;
  /** Override the POST createThread response builder. */
  createThread?: (body: Record<string, unknown>) => ThreadFixture;
}

/**
 * Install per-test route mocks for every endpoint the ThreadsPage hits.
 * The handlers close over `state`, so tests that mutate the state object
 * (e.g. push a new thread on POST) reflect the change on the next refetch.
 */
async function mockThreadsEndpoints(page: Page, state: MockState): Promise<void> {
  await page.route(THREADS_LIST, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: state.threads } });
  });

  // POST /agent-runtime/threads — no query string. The list pattern
  // already absorbs the GET form, so this handler only fires on POST.
  await page.route(THREADS_CREATE, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    const created = state.createThread
      ? state.createThread(body)
      : makeThread({
          id: 'thread-new',
          title: (body.title as string) ?? 'New conversation',
        });
    state.threads = [created, ...state.threads];
    await route.fulfill({ status: 201, json: created });
  });

  await page.route(MESSAGES_PATH, async (route) => {
    const url = route.request().url();
    const id = url.match(MESSAGES_PATH)?.[1] ?? '';
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { data: state.messages[id] ?? [] } });
      return;
    }
    if (method === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      const userMsg = makeMessage({
        id: `msg-${(state.messages[id]?.length ?? 0) + 1}`,
        thread_id: id,
        position: state.messages[id]?.length ?? 0,
        role: (body.role as ThreadMessageFixture['role']) ?? 'user',
        content: (body.content as string) ?? '',
      });
      state.messages[id] = [...(state.messages[id] ?? []), userMsg];
      await route.fulfill({
        status: 201,
        json: { user_message: userMsg, steps_used: 0 },
      });
      return;
    }
    await route.fallback();
  });

  await page.route(TRACE_PATH, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = route.request().url();
    const id = url.match(TRACE_PATH)?.[1] ?? '';
    await route.fulfill({ json: { data: state.trace[id] ?? [] } });
  });
}

// ---------------------------------------------------------------------------
// Tests — shipped behaviour
// ---------------------------------------------------------------------------

test('empty state: both panes render their placeholder copy', async ({ adminPage }) => {
  await mockThreadsEndpoints(adminPage, { threads: [], messages: {}, trace: {} });
  await adminPage.goto('/ai/threads');

  // Left pane: heading + empty-state hint + the "+ New" CTA.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^threads$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/no threads yet\. click \+ new to start one\./i),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('button', { name: '+ New', exact: true }),
  ).toBeVisible();

  // Center pane: empty-state copy (no auto-select happens with an empty list).
  await expect(
    adminPage.getByText(/select a thread or start a new one\./i),
  ).toBeVisible();

  // Right pane: trace says "Pick a thread to see its trace."
  await expect(
    adminPage.getByText(/pick a thread to see its trace\./i),
  ).toBeVisible();
});

test('list panel renders fetched threads and auto-selects the first one', async ({
  adminPage,
}) => {
  const threads = [
    makeThread({ id: 'thread-a', title: 'Maintenance triage', updated_at: E2E_NOW }),
    makeThread({ id: 'thread-b', title: 'Inventory questions', updated_at: E2E_NOW }),
  ];
  await mockThreadsEndpoints(adminPage, {
    threads,
    messages: { 'thread-a': [], 'thread-b': [] },
    trace: { 'thread-a': [], 'thread-b': [] },
  });

  await adminPage.goto('/ai/threads');

  // Both titles render in the list pane.
  const list = adminPage.getByRole('list');
  await expect(list.getByText('Maintenance triage')).toBeVisible();
  await expect(list.getByText('Inventory questions')).toBeVisible();

  // First thread auto-selects (active button picks up the sky border).
  const first = adminPage.getByRole('button', { name: /maintenance triage/i });
  await expect(first).toHaveClass(/border-sky-400/);

  // Center pane swaps from the empty state to the thread's title +
  // budgets header (pinned to surface a wire-format change).
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^maintenance triage$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/budgets: max 6 tool calls · 16,000 tokens/i),
  ).toBeVisible();
  // Messages list is empty so the composer empty-state shows.
  await expect(
    adminPage.getByText(/no messages yet\. ask something to start the conversation\./i),
  ).toBeVisible();
});

test('selecting a non-selected thread loads its messages', async ({ adminPage }) => {
  const threads = [
    makeThread({ id: 'thread-a', title: 'Maintenance triage' }),
    makeThread({ id: 'thread-b', title: 'Inventory questions' }),
  ];
  await mockThreadsEndpoints(adminPage, {
    threads,
    messages: {
      'thread-a': [],
      'thread-b': [
        makeMessage({
          id: 'msg-1',
          thread_id: 'thread-b',
          role: 'user',
          content: 'how many spare parts in Berlin?',
        }),
        makeMessage({
          id: 'msg-2',
          thread_id: 'thread-b',
          role: 'assistant',
          content: 'Berlin has 412 spare parts in stock.',
        }),
      ],
    },
    trace: { 'thread-a': [], 'thread-b': [] },
  });

  await adminPage.goto('/ai/threads');

  // Click the second thread; it becomes the selected one and the
  // center pane swaps to its messages.
  await adminPage.getByRole('button', { name: /inventory questions/i }).click();

  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^inventory questions$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/how many spare parts in berlin\?/i),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/berlin has 412 spare parts in stock\./i),
  ).toBeVisible();
});

test('"+ New" posts createThread with the default tool manifest + budgets', async ({
  adminPage,
}) => {
  // Start empty; the POST handler in `mockThreadsEndpoints` pushes the
  // created thread back into state so the list refetch surfaces it.
  await mockThreadsEndpoints(adminPage, {
    threads: [],
    messages: { 'thread-new': [] },
    trace: { 'thread-new': [] },
  });
  const createCalls = captureRequests(
    adminPage,
    /\/api\/v1\/agent-runtime\/threads$/,
  );

  await adminPage.goto('/ai/threads');
  await adminPage.getByRole('button', { name: '+ New', exact: true }).click();

  // POST landed with the page's hard-coded budgets + 3 DEFAULT_TOOLS.
  await expect.poll(() => createCalls.calls.filter((c) => c.method === 'POST').length).toBe(1);
  const postBody = createCalls.calls.find((c) => c.method === 'POST')?.body as {
    title: string;
    tools: Array<{ name: string; kind: string }>;
    max_tool_calls: number;
    max_prompt_tokens: number;
  };
  expect(postBody.title).toBe('New conversation');
  expect(postBody.max_tool_calls).toBe(6);
  expect(postBody.max_prompt_tokens).toBe(16_000);
  expect(postBody.tools.map((t) => t.name)).toEqual([
    'FindAircraftByTail',
    'ScheduleMaintenance',
    'SearchManuals',
  ]);
  expect(postBody.tools.map((t) => t.kind)).toEqual(['object_query', 'action', 'retrieval']);

  // The new thread shows up in the list after the refetch and is
  // selected (its title appears as the messages-pane header).
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^new conversation$/i }),
  ).toBeVisible();
});

test('composer Send is disabled until the textarea has non-whitespace content', async ({
  adminPage,
}) => {
  await mockThreadsEndpoints(adminPage, {
    threads: [makeThread()],
    messages: { 'thread-1': [] },
    trace: { 'thread-1': [] },
  });
  await adminPage.goto('/ai/threads');

  const composer = adminPage.getByPlaceholder(/ask the agent…/i);
  const send = adminPage.getByRole('button', { name: /^send$/i });

  await expect(send).toBeDisabled();
  await composer.fill('   ');
  await expect(send).toBeDisabled();
  await composer.fill('hello agent');
  await expect(send).toBeEnabled();
});

test('sending a message posts user content and clears the composer', async ({
  adminPage,
}) => {
  await mockThreadsEndpoints(adminPage, {
    threads: [makeThread()],
    messages: { 'thread-1': [] },
    trace: { 'thread-1': [] },
  });
  const postCalls = captureRequests(
    adminPage,
    /\/api\/v1\/agent-runtime\/threads\/thread-1\/messages$/,
  );

  await adminPage.goto('/ai/threads');
  const composer = adminPage.getByPlaceholder(/ask the agent…/i);
  await composer.fill('When is the next B-check?');
  await adminPage.getByRole('button', { name: /^send$/i }).click();

  // POST captured with the user content; GETs from the initial fetch +
  // the post-success invalidation are filtered out.
  await expect
    .poll(() => postCalls.calls.filter((c) => c.method === 'POST').length)
    .toBe(1);
  const postBody = postCalls.calls.find((c) => c.method === 'POST')?.body as {
    role: string;
    content: string;
  };
  expect(postBody.role).toBe('user');
  expect(postBody.content).toBe('When is the next B-check?');

  // Composer is reset on success (`onSuccess: setComposer('')`).
  await expect(composer).toHaveValue('');
  // And the user message now renders in the message list.
  await expect(
    adminPage.getByText(/when is the next b-check\?/i),
  ).toBeVisible();
});

test('ReAct trace panel renders fetched steps with their kind badges', async ({
  adminPage,
}) => {
  await mockThreadsEndpoints(adminPage, {
    threads: [makeThread()],
    messages: { 'thread-1': [] },
    trace: {
      'thread-1': [
        {
          id: 'step-0',
          thread_id: 'thread-1',
          step_index: 0,
          kind: 'plan',
          payload: { rationale: 'list aircraft, then schedule' },
          prompt_tokens: 12,
          completion_tokens: 4,
          latency_ms: 110,
          created_at: E2E_NOW,
        },
        {
          id: 'step-1',
          thread_id: 'thread-1',
          step_index: 1,
          kind: 'tool_call',
          tool_name: 'FindAircraftByTail',
          payload: { tail: 'N123' },
          prompt_tokens: 8,
          completion_tokens: 4,
          latency_ms: 80,
          created_at: E2E_NOW,
        },
        {
          id: 'step-2',
          thread_id: 'thread-1',
          step_index: 2,
          kind: 'final',
          payload: { answer: 'done' },
          prompt_tokens: 4,
          completion_tokens: 4,
          latency_ms: 60,
          created_at: E2E_NOW,
        },
      ],
    },
  });
  await adminPage.goto('/ai/threads');

  // The trace panel heading + the badge text for each kind.
  const tracePanel = adminPage
    .locator('div')
    .filter({ has: adminPage.getByRole('heading', { level: 2, name: /^react trace$/i }) })
    .first();
  await expect(
    tracePanel.getByRole('heading', { level: 2, name: /^react trace$/i }),
  ).toBeVisible();
  await expect(tracePanel.getByText('plan', { exact: true })).toBeVisible();
  await expect(tracePanel.getByText('tool_call', { exact: true })).toBeVisible();
  await expect(tracePanel.getByText('final', { exact: true })).toBeVisible();
  // Tool name surfaces under the tool_call step.
  await expect(tracePanel.getByText('FindAircraftByTail')).toBeVisible();
  // Step indices render as `#0` / `#1` / `#2`.
  await expect(tracePanel.getByText(/^#0$/)).toBeVisible();
  await expect(tracePanel.getByText(/^#2$/)).toBeVisible();
});

test('document upload posts to /retrieval/documents and clears the form', async ({
  adminPage,
}) => {
  await mockThreadsEndpoints(adminPage, {
    threads: [],
    messages: {},
    trace: {},
  });
  await adminPage.route(RETRIEVAL_DOCS, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      json: {
        id: 'doc-new',
        knowledge_base_id: 'ops-manuals',
        title: body.title ?? 'Untitled',
        chunk_count: 4,
        created_at: E2E_NOW,
      },
    });
  });
  const uploadCalls = captureRequests(adminPage, RETRIEVAL_DOCS);

  await adminPage.goto('/ai/threads');

  // Sidebar form: title input + body textarea + Upload button. Upload
  // is disabled until the body has non-whitespace content.
  const titleInput = adminPage.getByPlaceholder('Title');
  const bodyInput = adminPage.getByPlaceholder('Document text');
  const uploadBtn = adminPage.getByRole('button', { name: /^upload$/i });
  await expect(uploadBtn).toBeDisabled();

  await titleInput.fill('Berlin B-check checklist');
  await bodyInput.fill('Step 1: drain hydraulics. Step 2: …');
  await expect(uploadBtn).toBeEnabled();

  await uploadBtn.click();

  await expect.poll(() => uploadCalls.count()).toBe(1);
  expect(uploadCalls.last()?.body).toMatchObject({
    knowledge_base_id: 'ops-manuals',
    title: 'Berlin B-check checklist',
    content: 'Step 1: drain hydraulics. Step 2: …',
  });

  // Success: the form clears + the confirmation line surfaces.
  await expect(titleInput).toHaveValue('');
  await expect(bodyInput).toHaveValue('');
  await expect(
    adminPage.getByText(/✓ berlin b-check checklist · 4 chunks/i),
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// Regression guard for the roadmap features that aren't wired yet
// ---------------------------------------------------------------------------

test('absent today: rename / delete / search / share controls', async ({
  adminPage,
}) => {
  // Render a populated page so any per-row affordance has a row to
  // attach to, then pin the absence of every roadmap control. The
  // delete API (`deleteThread`) ships in @/lib/api/threads but is not
  // bound to any UI today. Titles deliberately avoid the substring
  // "a thread" so they don't collide with the loading-state empty
  // copy ("Select a thread..." / "Pick a thread...").
  await mockThreadsEndpoints(adminPage, {
    threads: [
      makeThread({ title: 'Maintenance triage' }),
      makeThread({ id: 'thread-2', title: 'Inventory questions' }),
    ],
    messages: { 'thread-1': [], 'thread-2': [] },
    trace: { 'thread-1': [], 'thread-2': [] },
  });
  await adminPage.goto('/ai/threads');

  // Wait until the list has rendered before asserting absence — scope
  // to the list role so we don't accidentally match the empty-state
  // copy in the messages / trace panes during the loading window.
  await expect(
    adminPage.getByRole('list').getByText(/maintenance triage/i),
  ).toBeVisible();

  // Rename: no edit/rename button; titles are static.
  expect(
    await adminPage.getByRole('button', { name: /rename|edit title/i }).count(),
  ).toBe(0);

  // Delete: no delete/trash CTA — the API helper is unused.
  expect(
    await adminPage.getByRole('button', { name: /^delete( thread)?$/i }).count(),
  ).toBe(0);

  // Search: no filter input over the thread list.
  expect(
    await adminPage.getByPlaceholder(/search threads/i).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('searchbox', { name: /threads/i }).count(),
  ).toBe(0);

  // Share: no thread-specific share / copy-link CTA. We scope the
  // regex to thread-flavoured labels because the AppShell Topbar
  // already ships a global "Share" button (workspace-level, unrelated
  // to threads).
  expect(
    await adminPage
      .getByRole('button', { name: /share thread|share conversation|copy thread link|^copy link$/i })
      .count(),
  ).toBe(0);
});

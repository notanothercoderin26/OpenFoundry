import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createThread,
  deleteThread,
  getThreadTrace,
  listThreadMessages,
  listThreads,
  postThreadMessage,
  uploadRetrievalDocument,
} from './threads';

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

function lastCall(mock: ReturnType<typeof vi.fn>) {
  return mock.mock.calls[mock.mock.calls.length - 1];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('threads wire client', () => {
  it('listThreads hits /agent-runtime/threads with the limit', async () => {
    const fetchMock = mockFetch(200, { data: [] });
    vi.stubGlobal('fetch', fetchMock);
    await listThreads(25);
    const [url] = lastCall(fetchMock) as [string];
    expect(url).toContain('/agent-runtime/threads');
    expect(url).toContain('limit=25');
  });

  it('createThread POSTs the body', async () => {
    const fetchMock = mockFetch(201, { id: 't-1' });
    vi.stubGlobal('fetch', fetchMock);
    await createThread({
      title: 'demo',
      tools: [{ name: 'X', kind: 'function' }],
      max_tool_calls: 3,
    });
    const [url, init] = lastCall(fetchMock) as [string, RequestInit];
    expect(url).toContain('/agent-runtime/threads');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.title).toBe('demo');
    expect(body.tools[0].kind).toBe('function');
  });

  it('postThreadMessage targets /threads/{id}/messages', async () => {
    const fetchMock = mockFetch(200, { user_message: {}, steps_used: 1 });
    vi.stubGlobal('fetch', fetchMock);
    await postThreadMessage('t-1', { role: 'user', content: 'hi' });
    const [url, init] = lastCall(fetchMock) as [string, RequestInit];
    expect(url).toContain('/agent-runtime/threads/t-1/messages');
    expect(init.method).toBe('POST');
  });

  it('listThreadMessages targets /threads/{id}/messages', async () => {
    const fetchMock = mockFetch(200, { data: [] });
    vi.stubGlobal('fetch', fetchMock);
    await listThreadMessages('t-1');
    const [url] = lastCall(fetchMock) as [string];
    expect(url).toContain('/agent-runtime/threads/t-1/messages');
  });

  it('getThreadTrace targets /threads/{id}/trace', async () => {
    const fetchMock = mockFetch(200, { data: [] });
    vi.stubGlobal('fetch', fetchMock);
    await getThreadTrace('t-1');
    const [url] = lastCall(fetchMock) as [string];
    expect(url).toContain('/agent-runtime/threads/t-1/trace');
  });

  it('deleteThread issues DELETE', async () => {
    const fetchMock = mockFetch(200, {});
    vi.stubGlobal('fetch', fetchMock);
    await deleteThread('t-1');
    const [, init] = lastCall(fetchMock) as [string, RequestInit];
    expect(init.method).toBe('DELETE');
  });

  it('uploadRetrievalDocument hits /retrieval/documents', async () => {
    const fetchMock = mockFetch(201, { id: 'd-1', chunk_count: 2 });
    vi.stubGlobal('fetch', fetchMock);
    await uploadRetrievalDocument({ knowledge_base_id: 'ops', title: 't', content: 'hello world' });
    const [url, init] = lastCall(fetchMock) as [string, RequestInit];
    expect(url).toContain('/retrieval/documents');
    expect(init.method).toBe('POST');
  });
});

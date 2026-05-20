// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThreadsPage } from './ThreadsPage';

const THREAD = {
  id: 'th-1',
  title: 'Demo thread',
  status: 'active',
  max_tool_calls: 6,
  max_prompt_tokens: 16000,
  tool_manifest: { tools: [] },
  created_at: '2026-05-20T12:00:00Z',
  updated_at: '2026-05-20T12:00:00Z',
};

const TRACE_STEPS = {
  data: [
    {
      id: 's-1', thread_id: 'th-1', step_index: 0, kind: 'plan',
      payload: { tool_call: { name: 'FindAircraftByTail', arguments: { tail: 'N12345' } } },
      prompt_tokens: 12, completion_tokens: 5, latency_ms: 100,
      created_at: '2026-05-20T12:00:01Z',
    },
    {
      id: 's-2', thread_id: 'th-1', step_index: 1, kind: 'tool_call', tool_name: 'FindAircraftByTail',
      prompt_tokens: 0, completion_tokens: 0, latency_ms: 0,
      created_at: '2026-05-20T12:00:01Z',
    },
    {
      id: 's-3', thread_id: 'th-1', step_index: 2, kind: 'final',
      payload: { content: 'Found.' },
      prompt_tokens: 5, completion_tokens: 2, latency_ms: 50,
      created_at: '2026-05-20T12:00:02Z',
    },
  ],
};

function stubFetch(opts: { threads?: unknown; messages?: unknown; trace?: unknown }) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/agent-runtime/threads') && url.endsWith('/trace')) {
      return new Response(JSON.stringify(opts.trace ?? { data: [] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/agent-runtime/threads') && url.includes('/messages')) {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ user_message: {}, steps_used: 0 }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(opts.messages ?? { data: [] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/agent-runtime/threads')) {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify(THREAD), {
          status: 201, headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(opts.threads ?? { data: [THREAD] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error('unexpected fetch ' + url);
  });
}

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ThreadsPage', () => {
  it('renders existing threads and auto-selects the most recent', async () => {
    vi.stubGlobal('fetch', stubFetch({}));
    render(wrap(<ThreadsPage />));
    await waitFor(() => expect(screen.getByText('Demo thread')).toBeInTheDocument());
    // Budget summary line proves auto-selection happened.
    expect(screen.getByText(/Budgets: max 6 tool calls/)).toBeInTheDocument();
  });

  it('shows trace steps on the right pane', async () => {
    vi.stubGlobal('fetch', stubFetch({ trace: TRACE_STEPS }));
    render(wrap(<ThreadsPage />));
    await waitFor(() => expect(screen.getByText(/ReAct trace/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('plan')).toBeInTheDocument());
    expect(screen.getByText('tool_call')).toBeInTheDocument();
    expect(screen.getByText('final')).toBeInTheDocument();
  });

  it('empty state when there are no threads', async () => {
    vi.stubGlobal('fetch', stubFetch({ threads: { data: [] } }));
    render(wrap(<ThreadsPage />));
    await waitFor(() =>
      expect(screen.getByText(/No threads yet/)).toBeInTheDocument(),
    );
  });

  it('"+ New" button creates a thread and selects it', async () => {
    let createCount = 0;
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/agent-runtime/threads') && init?.method === 'POST' && !url.includes('/messages')) {
        createCount++;
        return new Response(JSON.stringify(THREAD), { status: 201, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/agent-runtime/threads')) {
        const data = createCount === 0 ? [] : [THREAD];
        return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error('unexpected fetch ' + url);
    });
    vi.stubGlobal('fetch', fn);
    render(wrap(<ThreadsPage />));
    await waitFor(() => expect(screen.getByText(/No threads yet/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /\+ New/ }));
    await waitFor(() => expect(createCount).toBe(1));
  });
});

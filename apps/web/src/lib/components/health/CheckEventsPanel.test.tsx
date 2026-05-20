// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CheckEventsPanel } from './CheckEventsPanel';

const SAMPLE = {
  dataset_rid: 'ri.foundry.main.dataset.demo',
  overall: 'degraded',
  latest_per_check: [
    {
      id: 1, dataset_rid: 'ri.foundry.main.dataset.demo', check_name: 'null_rate',
      severity: 'error', status: 'degraded',
      metric_name: 'null_rate', metric_value: 0.073, threshold: 0.01,
      message: 'null_rate 7.3% exceeds 1% threshold',
      evaluated_at: '2026-05-20T12:00:00Z',
    },
    {
      id: 2, dataset_rid: 'ri.foundry.main.dataset.demo', check_name: 'row_count',
      severity: 'info', status: 'passing',
      metric_name: 'row_count', metric_value: 1234567,
      evaluated_at: '2026-05-20T11:55:00Z',
    },
  ],
  recent_events: [
    {
      id: 3, dataset_rid: 'ri.foundry.main.dataset.demo', check_name: 'null_rate',
      severity: 'error', status: 'degraded',
      message: 'recent failure',
      evaluated_at: '2026-05-20T11:50:00Z',
    },
  ],
};

function stubFetch(payload: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
}

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CheckEventsPanel', () => {
  it('renders the overall status badge + latest check rows', async () => {
    vi.stubGlobal('fetch', stubFetch(SAMPLE));
    render(wrap(<CheckEventsPanel datasetRid="ri.foundry.main.dataset.demo" />));
    await waitFor(() => expect(screen.getByText('Degraded')).toBeInTheDocument());
    // "null_rate" appears in both the "Latest per check" tile and the
    // "Recent events" feed → expect >= 2 matches.
    expect(screen.getAllByText('null_rate').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('row_count')).toBeInTheDocument();
    expect(screen.getByText(/null_rate 7.3% exceeds 1% threshold/)).toBeInTheDocument();
  });

  it('shows All checks passing when overall is passing', async () => {
    vi.stubGlobal('fetch', stubFetch({ ...SAMPLE, overall: 'passing' }));
    render(wrap(<CheckEventsPanel datasetRid="ri.foundry.main.dataset.demo" />));
    await waitFor(() => expect(screen.getByText(/All checks passing/)).toBeInTheDocument());
  });

  it('renders nothing when the API errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    render(wrap(<CheckEventsPanel datasetRid="ri.foundry.main.dataset.demo" />));
    // No "Check evaluations" header should appear once the query errors.
    await waitFor(() => expect(screen.queryByText(/Check evaluations/)).not.toBeInTheDocument());
  });
});

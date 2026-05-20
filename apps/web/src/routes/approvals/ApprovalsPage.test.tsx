// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApprovalsPage } from './ApprovalsPage';

const INBOX = {
  data: [
    {
      id: 'n-1',
      user_id: null,
      title: 'Schedule maintenance · Aircraft N12345',
      body: 'Due in 5 days',
      category: 'action',
      severity: 'info',
      status: 'unread',
      channels: ['in_app'],
      metadata: { event_id: 'evt-1' },
      created_at: '2026-05-20T00:00:00Z',
      read_at: null,
    },
    {
      id: 'n-2',
      user_id: null,
      title: 'Legacy notification without event_id',
      body: 'No audit',
      category: 'system',
      severity: 'info',
      status: 'read',
      channels: ['in_app'],
      metadata: {},
      created_at: '2026-05-19T00:00:00Z',
      read_at: '2026-05-19T01:00:00Z',
    },
  ],
  unread_count: 1,
};

const DELIVERIES = {
  data: [
    {
      id: 'd-1', event_id: 'evt-1', subscription_id: 's-1',
      channel: 'in_app', target: 'default', status: 'sent',
      attempt: 1, max_attempts: 3,
      scheduled_at: '2026-05-20T00:00:00Z',
      created_at: '2026-05-20T00:00:00Z', updated_at: '2026-05-20T00:00:00Z',
    },
    {
      id: 'd-2', event_id: 'evt-1', subscription_id: 's-2',
      channel: 'webhook', target: 'https://acme.example.com/hooks/mro', status: 'failed',
      attempt: 3, max_attempts: 3,
      last_error: 'HTTP 502 upstream busy',
      scheduled_at: '2026-05-20T00:00:00Z',
      last_attempt_at: '2026-05-20T00:00:05Z',
      created_at: '2026-05-20T00:00:00Z', updated_at: '2026-05-20T00:00:05Z',
    },
  ],
};

function stubFetch() {
  const ackCalls: string[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/notifications/events/') && url.endsWith('/deliveries')) {
      return new Response(JSON.stringify(DELIVERIES), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/notifications/n-1/read') && init?.method === 'PATCH') {
      ackCalls.push(url);
      return new Response(JSON.stringify({ notification: { ...INBOX.data[0], status: 'read' }, unread_count: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/notifications') && (!init?.method || init.method === 'GET')) {
      return new Response(JSON.stringify(INBOX), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('unexpected fetch ' + url);
  });
  return { fn, ackCalls };
}

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ApprovalsPage', () => {
  it('renders inbox rows with unread badge + counter', async () => {
    const { fn } = stubFetch();
    vi.stubGlobal('fetch', fn);
    render(wrap(<ApprovalsPage />));
    await waitFor(() => expect(screen.getByText(/Schedule maintenance/)).toBeInTheDocument());
    expect(screen.getByText(/1 unread/)).toBeInTheDocument();
    expect(screen.getByText(/Legacy notification/)).toBeInTheDocument();
  });

  it('selecting a row with event_id loads the delivery audit', async () => {
    const { fn } = stubFetch();
    vi.stubGlobal('fetch', fn);
    render(wrap(<ApprovalsPage />));
    await waitFor(() => expect(screen.getByText(/Schedule maintenance/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Schedule maintenance/));
    await waitFor(() => expect(screen.getByText(/HTTP 502 upstream busy/)).toBeInTheDocument());
    // failed delivery surfaces as DLQ row with status badge.
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('sent')).toBeInTheDocument();
  });

  it('selecting a legacy notification without event_id shows the no-audit hint', async () => {
    const { fn } = stubFetch();
    vi.stubGlobal('fetch', fn);
    render(wrap(<ApprovalsPage />));
    await waitFor(() => expect(screen.getByText(/Legacy notification/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Legacy notification/));
    await waitFor(() => expect(screen.getByText(/legacy inbox row/i)).toBeInTheDocument());
  });

  it('Acknowledge button triggers PATCH /notifications/{id}/read', async () => {
    const { fn, ackCalls } = stubFetch();
    vi.stubGlobal('fetch', fn);
    render(wrap(<ApprovalsPage />));
    await waitFor(() => expect(screen.getByText(/Acknowledge/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Acknowledge/));
    await waitFor(() => expect(ackCalls.length).toBeGreaterThan(0));
  });
});

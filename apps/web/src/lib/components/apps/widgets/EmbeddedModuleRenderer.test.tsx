// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { AppDefinition, AppInterfaceResponse, PublishedAppResponse } from '@/lib/api/apps';
import { EmbeddedAncestorsContext } from './embeddedRuntimeBridge';
import { EmbeddedModuleRenderer } from './EmbeddedModuleRenderer';

vi.mock('@/lib/api/apps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/apps')>();
  return {
    ...actual,
    getPublishedApp: vi.fn(),
    getPublishedAppInterface: vi.fn(),
  };
});

vi.mock('../AppRenderer', () => ({
  AppRenderer: ({ app }: { app: AppDefinition }) => (
    <div data-testid="child-app-renderer">{app.name}</div>
  ),
}));

vi.mock('./WorkshopRuntimeProvider', () => ({
  WorkshopRuntimeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="child-runtime-provider">{children}</div>
  ),
}));

import { getPublishedApp, getPublishedAppInterface } from '@/lib/api/apps';

function wrap(node: React.ReactNode, { ancestors = [] }: { ancestors?: string[] } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EmbeddedAncestorsContext.Provider value={ancestors}>{node}</EmbeddedAncestorsContext.Provider>
    </QueryClientProvider>,
  );
}

const fakeApp = {
  id: 'child-id',
  name: 'Ticket Card',
  slug: 'ticket-card',
  description: '',
  status: 'published',
  pages: [],
  theme: {},
  settings: {},
  template_key: null,
  published_version_id: null,
  created_at: null,
  updated_at: null,
} as unknown as AppDefinition;

const fakeChildResponse = {
  app: fakeApp,
  embed: null,
  published_version_number: 1,
  published_at: null,
} as unknown as PublishedAppResponse;

const fakeInterface: AppInterfaceResponse = {
  slug: 'ticket-card',
  app_id: 'child-id',
  interface_variables: [
    { external_id: 'ticket', kind: 'struct', display_name: 'Ticket' },
  ],
};

beforeEach(() => {
  vi.mocked(getPublishedApp).mockReset();
  vi.mocked(getPublishedAppInterface).mockReset();
  // Stub IntersectionObserver since jsdom doesn't ship it. Always fire
  // intersecting immediately so the lazy mount runs in tests.
  // @ts-expect-error — jsdom shim
  global.IntersectionObserver = class {
    constructor(private cb: IntersectionObserverCallback) {
      queueMicrotask(() => this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver));
    }
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = '';
    thresholds: number[] = [];
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('EmbeddedModuleRenderer', () => {
  it('renders a placeholder when no module slug is configured', () => {
    wrap(<EmbeddedModuleRenderer config={{}} />);
    expect(screen.getByText(/No module selected/i)).toBeTruthy();
    expect(getPublishedApp).not.toHaveBeenCalled();
  });

  it('refuses to mount when the slug appears in the ancestor chain', () => {
    wrap(<EmbeddedModuleRenderer config={{ module_slug: 'ticket-card' }} />, {
      ancestors: ['parent-app', 'ticket-card'],
    });
    expect(screen.getByText(/Self-reference detected/i)).toBeTruthy();
    expect(getPublishedApp).not.toHaveBeenCalled();
  });

  it('fetches the child app + interface and renders it on success', async () => {
    vi.mocked(getPublishedApp).mockResolvedValueOnce(fakeChildResponse);
    vi.mocked(getPublishedAppInterface).mockResolvedValueOnce(fakeInterface);

    wrap(
      <EmbeddedModuleRenderer
        config={{ module_slug: 'ticket-card', mapping: { ticket: { kind: 'literal', value: 'TICKET-1' } } }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('child-app-renderer')).toBeTruthy();
    });
    expect(screen.getByTestId('child-app-renderer').textContent).toBe('Ticket Card');
    expect(getPublishedApp).toHaveBeenCalledWith('ticket-card');
    expect(getPublishedAppInterface).toHaveBeenCalledWith('ticket-card');
  });

  it('shows "Failed to load module" when the API errors', async () => {
    vi.mocked(getPublishedApp).mockRejectedValueOnce(new Error('boom'));
    vi.mocked(getPublishedAppInterface).mockRejectedValueOnce(new Error('boom'));

    wrap(<EmbeddedModuleRenderer config={{ module_slug: 'missing' }} />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load module/i)).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /Retry/i })).toBeTruthy();
  });

  it('exposes an "Open referenced module" link with mapped values in the URL', async () => {
    vi.mocked(getPublishedApp).mockResolvedValueOnce(fakeChildResponse);
    vi.mocked(getPublishedAppInterface).mockResolvedValueOnce(fakeInterface);

    wrap(
      <EmbeddedModuleRenderer
        config={{
          module_slug: 'ticket-card',
          mapping: { ticket: { kind: 'literal', value: 'TICKET-42' } },
        }}
      />,
    );

    const link = await screen.findByRole('link', { name: /Open referenced module/i });
    expect(link.getAttribute('href')).toContain('/apps/runtime/ticket-card');
    expect(link.getAttribute('href')).toContain('ticket=TICKET-42');
  });
});

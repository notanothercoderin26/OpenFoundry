// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import { LlmCatalogPage } from './LlmCatalogPage';

const MODELS_SEEDED = {
  data: [
    {
      rid: 'rid-ollama',
      provider: 'OLLAMA',
      model_id: 'llama-3.1-70b',
      display_name: 'Ollama · Llama 3.1 70B',
      context_window: 131072,
      input_cost_per_1k: 0,
      output_cost_per_1k: 0,
      capabilities: ['CHAT', 'TOOLS'],
      quotas: { requests_per_minute: 120, tokens_per_minute: 240000 },
      enabled_for_features: ['aip-chatbot', 'ai-analyst'],
      enabled: true,
      created_at: '2026-05-20T00:00:00Z',
      updated_at: '2026-05-20T00:00:00Z',
    },
    {
      rid: 'rid-azure',
      provider: 'AZURE',
      model_id: 'gpt-4o',
      display_name: 'Azure · GPT-4o',
      context_window: 128000,
      input_cost_per_1k: 0.005,
      output_cost_per_1k: 0.015,
      capabilities: ['CHAT', 'VISION'],
      quotas: { requests_per_minute: 60 },
      enabled_for_features: ['document-ai'],
      enabled: true,
      created_at: '2026-05-20T00:00:00Z',
      updated_at: '2026-05-20T00:00:00Z',
    },
  ],
};

const HEALTH = {
  providers: [
    { provider: 'OLLAMA', status: 'ok', last_check_at: '2026-05-20T00:00:00Z', latency_ms: 30 },
    { provider: 'AZURE', status: 'degraded', last_check_at: '2026-05-20T00:00:00Z', latency_ms: 2500 },
  ],
  checked_at: '2026-05-20T00:00:00Z',
};

function stubFetch(opts: {
  models?: unknown;
  health?: unknown;
  patch?: Mock;
}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/llm/providers/health')) {
      return new Response(JSON.stringify(opts.health ?? HEALTH), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/llm/models/') && init?.method === 'PATCH') {
      opts.patch?.(url, JSON.parse((init.body as string) ?? '{}'));
      return new Response(JSON.stringify({ rid: 'rid-azure', enabled: false }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/llm/models')) {
      return new Response(JSON.stringify(opts.models ?? MODELS_SEEDED), {
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

describe('LlmCatalogPage', () => {
  it('renders Ollama and Azure rows from the catalog', async () => {
    vi.stubGlobal('fetch', stubFetch({}));
    render(wrap(<LlmCatalogPage />));
    await waitFor(() => expect(screen.getAllByText(/llama-3.1-70b/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/gpt-4o/).length).toBeGreaterThan(0);
  });

  it('shows provider-health status badges', async () => {
    vi.stubGlobal('fetch', stubFetch({}));
    render(wrap(<LlmCatalogPage />));
    await waitFor(() => expect(screen.getByText(/Online/)).toBeInTheDocument());
    expect(screen.getByText(/Degraded/)).toBeInTheDocument();
  });

  it('renders the AIP feature → models matrix with the correct wired markers', async () => {
    vi.stubGlobal('fetch', stubFetch({}));
    render(wrap(<LlmCatalogPage />));
    // The matrix query (`all-for-matrix`) is a separate cache key from
    // the filtered list — wait for its rows to hydrate. Ollama is
    // wired for aip-chatbot + ai-analyst → 2 markers; Azure for
    // document-ai → 1; total = 3.
    await waitFor(
      () => {
        const markers = screen.queryAllByText('✓ wired');
        expect(markers).toHaveLength(3);
      },
      { timeout: 3000 },
    );
  });

  it('toggling the enabled switch issues a PATCH', async () => {
    const patch = vi.fn();
    vi.stubGlobal('fetch', stubFetch({ patch }));
    render(wrap(<LlmCatalogPage />));
    await waitFor(() => expect(screen.getAllByLabelText(/Disable model/).length).toBeGreaterThan(0));
    const buttons = screen.getAllByLabelText(/Disable model/);
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(patch).toHaveBeenCalled());
    const [, body] = patch.mock.calls[0];
    expect(body).toEqual({ enabled: false });
  });
});

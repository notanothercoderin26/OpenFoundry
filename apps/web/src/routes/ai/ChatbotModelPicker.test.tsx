// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatbotModelPicker, readStoredModelRid } from './ChatbotModelPicker';

const MODEL_LIST = {
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
      quotas: {},
      enabled_for_features: ['aip-chatbot'],
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
      quotas: {},
      enabled_for_features: ['aip-chatbot'],
      enabled: true,
      created_at: '2026-05-20T00:00:00Z',
      updated_at: '2026-05-20T00:00:00Z',
    },
  ],
};

const HEALTH_OK = {
  providers: [
    { provider: 'OLLAMA', status: 'ok', last_check_at: '2026-05-20T00:00:00Z', latency_ms: 30 },
    { provider: 'AZURE', status: 'ok', last_check_at: '2026-05-20T00:00:00Z', latency_ms: 120 },
  ],
  checked_at: '2026-05-20T00:00:00Z',
};

const HEALTH_AZURE_DOWN = {
  providers: [
    { provider: 'OLLAMA', status: 'ok', last_check_at: '2026-05-20T00:00:00Z', latency_ms: 30 },
    { provider: 'AZURE', status: 'down', last_check_at: '2026-05-20T00:00:00Z', latency_ms: 0, error: 'network' },
  ],
  checked_at: '2026-05-20T00:00:00Z',
};

function fetchFor(modelList: unknown, health: unknown) {
  return vi.fn(async (url: string) => {
    if (url.includes('/llm/providers/health')) {
      return new Response(JSON.stringify(health), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/llm/models')) {
      return new Response(JSON.stringify(modelList), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('unexpected fetch ' + url);
  });
}

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ChatbotModelPicker', () => {
  it('renders both seeded models in the dropdown', async () => {
    vi.stubGlobal('fetch', fetchFor(MODEL_LIST, HEALTH_OK));
    render(wrap(<ChatbotModelPicker value="" onChange={() => {}} />));
    await waitFor(() => expect(screen.getByText(/llama-3.1-70b/)).toBeInTheDocument());
    expect(screen.getByText(/gpt-4o/)).toBeInTheDocument();
  });

  it('defaults to the first available rid via onChange', async () => {
    vi.stubGlobal('fetch', fetchFor(MODEL_LIST, HEALTH_OK));
    const onChange = vi.fn();
    render(wrap(<ChatbotModelPicker value="" onChange={onChange} />));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(['rid-ollama', 'rid-azure']).toContain(onChange.mock.calls[0][0]);
  });

  it('prefers a healthy provider when seeding the default', async () => {
    vi.stubGlobal('fetch', fetchFor(MODEL_LIST, HEALTH_AZURE_DOWN));
    const onChange = vi.fn();
    render(wrap(<ChatbotModelPicker value="" onChange={onChange} />));
    // Both queries need to resolve before the effect picks a healthy default.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('rid-ollama'));
  });

  it('marks the down provider as disabled in the dropdown', async () => {
    vi.stubGlobal('fetch', fetchFor(MODEL_LIST, HEALTH_AZURE_DOWN));
    render(wrap(<ChatbotModelPicker value="rid-ollama" onChange={() => {}} />));
    await waitFor(() => expect(screen.getByText(/gpt-4o/)).toBeInTheDocument());
    const azureOption = screen.getByText(/gpt-4o.*DOWN/) as HTMLOptionElement;
    expect(azureOption.disabled).toBe(true);
  });

  it('persists the selected rid in localStorage', async () => {
    vi.stubGlobal('fetch', fetchFor(MODEL_LIST, HEALTH_OK));
    const onChange = vi.fn();
    render(wrap(<ChatbotModelPicker value="rid-ollama" onChange={onChange} />));
    await waitFor(() => expect(screen.getByText(/gpt-4o/)).toBeInTheDocument());
    const select = screen.getByRole('combobox', { name: /chatbot model/i });
    fireEvent.change(select, { target: { value: 'rid-azure' } });
    expect(onChange).toHaveBeenCalledWith('rid-azure');
    expect(readStoredModelRid()).toBe('rid-azure');
  });

  it('shows a placeholder when no chat-capable models are registered', async () => {
    vi.stubGlobal('fetch', fetchFor({ data: [] }, HEALTH_OK));
    render(wrap(<ChatbotModelPicker value="" onChange={() => {}} />));
    await waitFor(() => expect(screen.getByText(/no chat-capable models/i)).toBeInTheDocument());
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getProviderHealth,
  listLlmModels,
  registerLlmModel,
  updateLlmModel,
} from './llmCatalog';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  }));
}

function lastCall(mock: ReturnType<typeof vi.fn>) {
  return mock.mock.calls[mock.mock.calls.length - 1];
}

describe('llmCatalog client', () => {
  it('listLlmModels encodes filters as query string', async () => {
    const fetchMock = mockFetch(200, { data: [] });
    vi.stubGlobal('fetch', fetchMock);
    await listLlmModels({ provider: 'AZURE', capability: 'CHAT', feature: 'aip-chatbot', only_enabled: true });
    const [url] = lastCall(fetchMock) as [string];
    expect(url).toContain('/llm/models?');
    expect(url).toContain('provider=AZURE');
    expect(url).toContain('capability=CHAT');
    expect(url).toContain('feature=aip-chatbot');
    expect(url).toContain('only_enabled=true');
  });

  it('listLlmModels omits empty params', async () => {
    const fetchMock = mockFetch(200, { data: [] });
    vi.stubGlobal('fetch', fetchMock);
    await listLlmModels();
    const [url] = lastCall(fetchMock) as [string];
    expect(url).toContain('/llm/models');
    expect(url).not.toContain('?');
  });

  it('registerLlmModel POSTs the body to /llm/models', async () => {
    const fetchMock = mockFetch(201, { rid: 'r-1' });
    vi.stubGlobal('fetch', fetchMock);
    await registerLlmModel({
      provider: 'OLLAMA',
      model_id: 'llama-3.1-70b',
      capabilities: ['CHAT', 'TOOLS'],
      enabled_for_features: ['aip-chatbot'],
    });
    const [url, init] = lastCall(fetchMock) as [string, RequestInit];
    expect(url).toContain('/llm/models');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({
      provider: 'OLLAMA',
      model_id: 'llama-3.1-70b',
    });
  });

  it('updateLlmModel PATCHes the rid', async () => {
    const fetchMock = mockFetch(200, { rid: 'r-1', enabled: false });
    vi.stubGlobal('fetch', fetchMock);
    await updateLlmModel('r-1', { enabled: false });
    const [url, init] = lastCall(fetchMock) as [string, RequestInit];
    expect(url).toContain('/llm/models/r-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ enabled: false });
  });

  it('getProviderHealth hits /llm/providers/health', async () => {
    const fetchMock = mockFetch(200, { providers: [], checked_at: '2026-05-20T00:00:00Z' });
    vi.stubGlobal('fetch', fetchMock);
    const snap = await getProviderHealth();
    const [url] = lastCall(fetchMock) as [string];
    expect(url).toContain('/llm/providers/health');
    expect(snap.providers).toEqual([]);
  });
});

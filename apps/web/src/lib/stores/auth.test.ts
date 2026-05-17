import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import api from '../api/client';
import { auth } from './auth';

const ACCESS_TOKEN_KEY = 'of_access_token';
const REFRESH_TOKEN_KEY = 'of_refresh_token';
const EXPIRES_AT_KEY = 'of_access_token_expires_at';

describe('auth token lifecycle', () => {
  beforeEach(() => {
    mockLocalStorage();
    mockSessionStorage();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T12:00:00Z'));
  });

  afterEach(() => {
    auth.logout();
    api.setToken(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('persists access/refresh tokens and a skew-adjusted expires_at on login', async () => {
    const tokens = {
      status: 'authenticated' as const,
      access_token: 'access-abc',
      refresh_token: 'refresh-xyz',
      token_type: 'Bearer',
      expires_in: 3600,
    };

    vi.stubGlobal(
      'fetch',
      mockFetchSequence([
        jsonResponse(200, tokens), // POST /auth/login
        jsonResponse(200, sampleProfile()), // GET /users/me
      ]),
    );

    await auth.login('user@example.com', 'hunter2');

    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('access-abc');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-xyz');
    expect(localStorage.getItem(EXPIRES_AT_KEY)).toBe(String(Date.now() + 3600_000 - 30_000));
  });

  it('clears all auth keys on logout', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'a');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'r');
    localStorage.setItem(EXPIRES_AT_KEY, String(Date.now() + 600_000));

    auth.logout();

    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(EXPIRES_AT_KEY)).toBeNull();
  });

  it('proactively refreshes the access token when expires_at is within the 60s leeway', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'stale-token');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    localStorage.setItem(EXPIRES_AT_KEY, String(Date.now() + 10_000)); // 10s left

    const fetchMock = mockFetchSequence([
      jsonResponse(200, {
        access_token: 'fresh-token',
        refresh_token: 'refresh-2',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
      jsonResponse(200, { items: [] }),
    ]);
    vi.stubGlobal('fetch', fetchMock);

    api.setToken('stale-token');
    await api.get('/some/resource');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urlOf(fetchMock.mock.calls[0])).toContain('/auth/refresh');
    expect(urlOf(fetchMock.mock.calls[1])).toContain('/some/resource');
    expect(authHeaderOf(fetchMock.mock.calls[1])).toBe('Bearer fresh-token');
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('fresh-token');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-2');
  });

  it('skips proactive refresh when the token has plenty of time left', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'fresh');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    localStorage.setItem(EXPIRES_AT_KEY, String(Date.now() + 600_000)); // 10 minutes

    const fetchMock = mockFetchSequence([jsonResponse(200, { items: [] })]);
    vi.stubGlobal('fetch', fetchMock);

    api.setToken('fresh');
    await api.get('/some/resource');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(urlOf(fetchMock.mock.calls[0])).toContain('/some/resource');
  });

  it('deduplicates concurrent proactive refresh attempts', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'stale');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    localStorage.setItem(EXPIRES_AT_KEY, String(Date.now() + 5_000));

    const refreshResponse = {
      access_token: 'fresh',
      refresh_token: 'refresh-2',
      token_type: 'Bearer',
      expires_in: 3600,
    };
    const fetchMock = mockFetchByUrl({
      '/auth/refresh': () => jsonResponse(200, refreshResponse),
      '/a': () => jsonResponse(200, { a: 1 }),
      '/b': () => jsonResponse(200, { b: 2 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    api.setToken('stale');
    const [a, b] = await Promise.all([api.get('/a'), api.get('/b')]);

    expect(a).toEqual({ a: 1 });
    expect(b).toEqual({ b: 2 });
    // Exactly one refresh despite two concurrent callers seeing expiry near.
    const refreshCalls = fetchMock.mock.calls.filter((c) => urlOf(c).includes('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('forces a redirect to /auth/login when a 401(token_expired) cannot be refreshed', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'stale');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    localStorage.setItem(EXPIRES_AT_KEY, String(Date.now() + 600_000)); // skip proactive

    const fetchMock = mockFetchSequence([
      jsonResponse(401, { error: { code: 'token_expired', message: 'expired' } }),
      jsonResponse(401, { error: 'invalid_grant' }), // refresh attempt fails
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const assignMock = vi.fn();
    vi.stubGlobal('location', { assign: assignMock, href: 'http://localhost/' });

    api.setToken('stale');
    await expect(api.get('/some/resource')).rejects.toBeDefined();

    expect(assignMock).toHaveBeenCalledWith('/auth/login');
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(EXPIRES_AT_KEY)).toBeNull();
  });
});

function mockLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  });
}

function mockSessionStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockFetchSequence(responses: Response[]) {
  let i = 0;
  return vi.fn(async () => {
    if (i >= responses.length) {
      throw new Error(`fetch invoked ${i + 1} times; only ${responses.length} mocked`);
    }
    return responses[i++];
  });
}

function mockFetchByUrl(handlers: Record<string, () => Response>) {
  return vi.fn(async (input: unknown) => {
    const url = String(input);
    for (const [suffix, factory] of Object.entries(handlers)) {
      if (url.endsWith(suffix)) return factory();
    }
    throw new Error(`no mock handler for ${url}`);
  });
}

function urlOf(call: unknown[]): string {
  return String(call[0]);
}

function authHeaderOf(call: unknown[]): string | undefined {
  const init = call[1] as RequestInit | undefined;
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.Authorization;
}

function sampleProfile() {
  return {
    id: 'u-1',
    email: 'user@example.com',
    name: 'User One',
    is_active: true,
    roles: [],
    groups: [],
    permissions: [],
    organization_id: null,
    attributes: {},
    mfa_enabled: false,
    mfa_enforced: false,
    auth_source: 'local',
    created_at: '2026-05-01T00:00:00Z',
  };
}

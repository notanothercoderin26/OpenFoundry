import type { ErrorInfo, ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, ApiUnavailableError } from '@/lib/api/client';
import { notifications } from '@stores/notifications';

import { ErrorBoundary, describeError } from './ErrorBoundary';

describe('ApiClient unavailable mapping', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws ApiUnavailableError on network reject and extracts the service', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    const err = await api.get('/reports/123').catch((e) => e);
    expect(err).toBeInstanceOf(ApiUnavailableError);
    expect(err).toMatchObject({ status: 0, service: 'reports' });
  });

  it.each([502, 503, 504] as const)('throws ApiUnavailableError on %i upstream errors', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status, statusText: 'Bad Gateway' })),
    );

    const err = await api.get('/reports/abc').catch((e) => e);
    expect(err).toBeInstanceOf(ApiUnavailableError);
    expect(err).toMatchObject({ status, service: 'reports' });
  });

  it('still surfaces non-5xx errors as plain ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'forbidden' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    const err = (await api.get('/datasets/1').catch((e) => e)) as Error;
    expect(err.name).toBe('ApiError');
    expect(err).not.toBeInstanceOf(ApiUnavailableError);
  });
});

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mounts the fallback when a fetch rejects and toasts the motive', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const errorSpy = vi.spyOn(notifications, 'error').mockImplementation(() => {});

    const thrown = (await api.get('/reports/abc').catch((e) => e)) as Error;
    expect(thrown).toBeInstanceOf(ApiUnavailableError);

    const boundary = new ErrorBoundary({ children: null });
    boundary.state = ErrorBoundary.getDerivedStateFromError(thrown);
    boundary.componentDidCatch(thrown, { componentStack: '' } as ErrorInfo);

    const html = renderToString(boundary.render() as ReactElement);
    expect(html).toContain('Reintentar');
    expect(html).toContain('Servicio no disponible');
    expect(html).toContain('reports');
    expect(errorSpy).toHaveBeenCalledWith('El servicio de reports no está disponible.');
  });

  it('renders a generic fallback for non-API errors', () => {
    vi.spyOn(notifications, 'error').mockImplementation(() => {});

    const boundary = new ErrorBoundary({ children: null });
    const err = new Error('boom');
    boundary.state = ErrorBoundary.getDerivedStateFromError(err);

    const html = renderToString(boundary.render() as ReactElement);
    expect(html).toContain('Algo ha ido mal');
    expect(html).toContain('boom');
  });

  it('clears the error state when retry is invoked', () => {
    const boundary = new ErrorBoundary({ children: 'children-payload' });
    const err = new ApiUnavailableError(503, 'datasets', 'down');
    boundary.state = ErrorBoundary.getDerivedStateFromError(err);

    let nextState: { error: Error | null } | undefined;
    boundary.setState = ((updater: { error: Error | null }) => {
      nextState = updater;
    }) as unknown as typeof boundary.setState;

    const fallback = boundary.render() as ReactElement<{ onRetry: () => void }>;
    fallback.props.onRetry();

    expect(nextState).toEqual({ error: null });
  });

  it('describeError gives a friendly message for ApiUnavailableError', () => {
    const err = new ApiUnavailableError(503, 'datasets', 'down');
    expect(describeError(err)).toBe('El servicio de datasets no está disponible.');
  });
});

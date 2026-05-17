import type { ReactElement, ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, ApiUnavailableError } from '@api/client';

const useRouteErrorMock = vi.fn();
const useNavigateMock = vi.fn(() => () => {});

vi.mock('react-router-dom', () => ({
  useRouteError: () => useRouteErrorMock(),
  useNavigate: () => useNavigateMock(),
  isRouteErrorResponse: (value: unknown): boolean =>
    !!value &&
    typeof value === 'object' &&
    (value as { __isRouteError?: boolean }).__isRouteError === true,
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={typeof to === 'string' ? to : '#'} {...rest}>
      {children}
    </a>
  ),
}));

// Simulate the lazy() loader: when an `await import(...)` fails inside the
// route's lazy callback, the rejection propagates out of the loader and
// react-router surfaces it via useRouteError(). We capture that thrown error
// here and feed it into the boundary the same way react-router would.
async function simulateLazyRouteThrow(loader: () => Promise<unknown>): Promise<unknown> {
  try {
    await loader();
    throw new Error('expected the lazy loader to reject');
  } catch (cause) {
    return cause;
  }
}

const { RouteErrorBoundary } = await import('./RouteErrorBoundary');

describe('RouteErrorBoundary', () => {
  beforeEach(() => {
    useRouteErrorMock.mockReset();
    useNavigateMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the "backend restarting, retry in 30s" copy for a 503 ApiUnavailableError', () => {
    useRouteErrorMock.mockReturnValue(new ApiUnavailableError(503, 'datasets', 'down'));

    const html = renderToString(<RouteErrorBoundary />);

    expect(html).toContain('503');
    expect(html).toContain('datasets');
    expect(html).toMatch(/backend está reiniciando/i);
    expect(html).toMatch(/Reintenta en 30s/);
    expect(html).toContain('Reintentar');
  });

  it('uses the offline copy when the network never reached the backend', () => {
    useRouteErrorMock.mockReturnValue(new ApiUnavailableError(0, 'reports', 'Network error'));

    const html = renderToString(<RouteErrorBoundary />);

    expect(html).toContain('OFFLINE');
    expect(html).toContain('reports');
    expect(html).toMatch(/Sin conexión/i);
  });

  it('renders a permission message for 403 ApiError and hides the retry button', () => {
    useRouteErrorMock.mockReturnValue(new ApiError(403, 'forbidden'));

    const html = renderToString(<RouteErrorBoundary />);

    expect(html).toContain('403');
    expect(html).toContain('No tienes permiso');
    expect(html).toContain('forbidden');
    expect(html).not.toContain('>Reintentar<');
  });

  it('renders a thrown Response by status + statusText', () => {
    useRouteErrorMock.mockReturnValue(new Response(null, { status: 404, statusText: 'Not Found' }));

    const html = renderToString(<RouteErrorBoundary />);

    expect(html).toContain('404');
    expect(html).toContain('Not Found');
  });

  it('renders a react-router ErrorResponse with the data message', () => {
    useRouteErrorMock.mockReturnValue({
      __isRouteError: true,
      status: 418,
      statusText: "I'm a teapot",
      data: { message: 'kettle on strike' },
    });

    const html = renderToString(<RouteErrorBoundary />);

    expect(html).toContain('418');
    expect(html).toContain("I&#x27;m a teapot");
    expect(html).toContain('kettle on strike');
  });

  it('classifies a thrown error from a lazy route import failure as a bundle error', async () => {
    // Reproduce the exact shape react-router exposes when a `lazy: async () => (await import(...))`
    // entry rejects because the chunk URL is gone (deploy in progress, network blip, etc.).
    const lazyError = await simulateLazyRouteThrow(async () => {
      // What Vite throws at runtime when a code-split chunk cannot be fetched.
      throw new TypeError('Failed to fetch dynamically imported module: /assets/Page.abc123.js');
    });
    useRouteErrorMock.mockReturnValue(lazyError);

    const html = renderToString(<RouteErrorBoundary />);

    expect(html).toContain('BUNDLE');
    expect(html).toMatch(/No hemos podido cargar esta vista/);
    expect(html).toMatch(/nueva versión está desplegándose/);
    expect(html).toContain('Reintentar');
  });

  it('also recognises a webpack-style ChunkLoadError', () => {
    const err = new Error('Loading chunk 42 failed');
    err.name = 'ChunkLoadError';
    useRouteErrorMock.mockReturnValue(err);

    const html = renderToString(<RouteErrorBoundary />);

    expect(html).toContain('BUNDLE');
  });

  it('falls back to a generic message for an unclassified Error', () => {
    useRouteErrorMock.mockReturnValue(new Error('boom'));

    const html = renderToString(<RouteErrorBoundary />);

    expect(html).toContain('Algo ha ido mal');
    expect(html).toContain('boom');
    expect(html).not.toContain('>Reintentar<');
  });

  it('always offers a link back to the home page', () => {
    useRouteErrorMock.mockReturnValue(new Error('boom'));

    const html = renderToString(<RouteErrorBoundary /> as ReactElement);

    expect(html).toMatch(/href="\/"/);
    expect(html).toContain('Volver al inicio');
  });
});

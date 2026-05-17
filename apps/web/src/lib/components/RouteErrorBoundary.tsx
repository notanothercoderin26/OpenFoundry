import { useEffect } from 'react';
import { Link, isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';

import { ApiError, ApiUnavailableError } from '@api/client';

const UNAVAILABLE_RETRY_SECONDS = 30;

interface ErrorView {
  eyebrow: string;
  title: string;
  description: string;
  hint?: string;
  retryable: boolean;
  reload: boolean;
}

export function isLazyImportFailure(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ChunkLoadError') return true;
  const msg = error.message ?? '';
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Loading chunk \S+ failed/i.test(msg)
  );
}

export function classifyRouteError(error: unknown): ErrorView {
  if (error instanceof ApiUnavailableError) {
    const offline = error.status === 0;
    return {
      eyebrow: offline ? 'OFFLINE' : String(error.status),
      title: offline ? 'Sin conexión con el backend' : 'El backend está reiniciando',
      description: offline
        ? `No hemos podido contactar con el servicio de ${error.service}. Revisa tu conexión y vuelve a intentarlo.`
        : `El servicio de ${error.service} no responde. Reintenta en ${UNAVAILABLE_RETRY_SECONDS}s.`,
      retryable: true,
      reload: false,
    };
  }

  if (error instanceof ApiError) {
    const isAuth = error.status === 401 || error.status === 403;
    return {
      eyebrow: String(error.status),
      title: isAuth ? 'No tienes permiso para ver esta página' : 'La petición ha fallado',
      description: error.message || 'No hemos podido completar la petición.',
      retryable: !isAuth && error.status >= 500,
      reload: false,
    };
  }

  if (isLazyImportFailure(error)) {
    return {
      eyebrow: 'BUNDLE',
      title: 'No hemos podido cargar esta vista',
      description:
        'La nueva versión está desplegándose o se cortó la descarga del bundle. Recarga la página para obtener la versión más reciente.',
      hint: 'Si el problema persiste, vacía la caché del navegador.',
      retryable: true,
      reload: true,
    };
  }

  if (isRouteErrorResponse(error)) {
    const data = error.data as unknown;
    let description = `La ruta ha devuelto un error ${error.status}.`;
    if (typeof data === 'string' && data.trim()) {
      description = data;
    } else if (data && typeof data === 'object' && typeof (data as { message?: unknown }).message === 'string') {
      description = (data as { message: string }).message;
    }
    return {
      eyebrow: String(error.status),
      title: error.statusText || 'Ruta no disponible',
      description,
      retryable: error.status >= 500,
      reload: false,
    };
  }

  if (error instanceof Response) {
    return {
      eyebrow: String(error.status),
      title: error.statusText || 'Respuesta de error',
      description: 'La ruta ha devuelto una respuesta de error sin cuerpo legible.',
      retryable: error.status >= 500,
      reload: false,
    };
  }

  if (error instanceof Error) {
    return {
      eyebrow: 'ERROR',
      title: 'Algo ha ido mal',
      description: error.message || 'Se ha producido un error inesperado.',
      retryable: false,
      reload: false,
    };
  }

  return {
    eyebrow: 'ERROR',
    title: 'Algo ha ido mal',
    description: typeof error === 'string' && error ? error : 'Se ha producido un error inesperado.',
    retryable: false,
    reload: false,
  };
}

export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();
  const view = classifyRouteError(error);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.error('[RouteErrorBoundary]', error);
    }
  }, [error]);

  const handleRetry = () => {
    if (view.reload && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    navigate(0);
  };

  return (
    <section className="of-page" role="alert" aria-live="assertive">
      <div className="of-panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="of-eyebrow">{view.eyebrow}</p>
        <h1 className="of-heading-lg">{view.title}</h1>
        <p className="of-text-muted">{view.description}</p>
        {view.hint ? (
          <p className="of-text-muted" style={{ fontSize: 12 }}>
            {view.hint}
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 12, marginTop: 4, alignItems: 'center' }}>
          {view.retryable ? (
            <button type="button" className="of-button" onClick={handleRetry}>
              Reintentar
            </button>
          ) : null}
          <Link to="/" className="of-link">
            Volver al inicio
          </Link>
        </div>
      </div>
    </section>
  );
}

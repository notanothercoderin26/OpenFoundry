import { Component, type ErrorInfo, type ReactNode } from 'react';

import { ApiUnavailableError } from '@/lib/api/client';
import { notifications } from '@stores/notifications';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    notifications.error(describeError(error));
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught error:', error, info);
    }
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.handleRetry);
    }

    return <DefaultFallback error={error} onRetry={this.handleRetry} />;
  }
}

function DefaultFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const isUnavailable = error instanceof ApiUnavailableError;
  const title = isUnavailable ? 'Servicio no disponible' : 'Algo ha ido mal';
  const description = describeError(error);

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        minHeight: '60vh',
        padding: '32px 16px',
        textAlign: 'center',
      }}
    >
      <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
      <p style={{ margin: 0, maxWidth: 480, color: 'var(--color-text-subtle, #555)' }}>{description}</p>
      <button
        type="button"
        onClick={onRetry}
        className="of-button"
        style={{
          padding: '8px 16px',
          borderRadius: 'var(--radius-md, 6px)',
          border: '1px solid currentColor',
          cursor: 'pointer',
        }}
      >
        Reintentar
      </button>
    </div>
  );
}

export function describeError(error: Error): string {
  if (error instanceof ApiUnavailableError) {
    return `El servicio de ${error.service} no está disponible.`;
  }
  return error.message || 'Se ha producido un error inesperado.';
}

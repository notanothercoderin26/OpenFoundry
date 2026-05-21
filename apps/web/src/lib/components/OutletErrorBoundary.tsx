import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * OutletErrorBoundary — React-style error boundary (class component
 * using `componentDidCatch`) that wraps the routed `<Outlet />` inside
 * AppShell. Different mechanism from `RouteErrorBoundary` in this
 * folder, which is the react-router-style `errorElement` based on
 * `useRouteError()` and catches LOADER errors.
 *
 * Why this is needed
 * ------------------
 * When a routed page's render throws (e.g. `.map()` on undefined
 * because a backend endpoint returned 502), React 19's concurrent
 * renderer can fail to commit the new tree and instead keeps the
 * previous successful commit pinned. Symptom: the URL changes but
 * the rendered page stays on the previous route. The user appears
 * trapped.
 *
 * A classic class-component error boundary catches this synchronously,
 * shows a fallback, and on the next route change clears its state so
 * the new route can render cleanly.
 *
 * Long-term, defensive guards inside individual page components
 * remain the right fix. This boundary is the safety net.
 */

interface Props {
  children: ReactNode;
  /** Reset signal — when this value changes, the boundary clears its error state. */
  resetKey: string;
}

interface State {
  error: Error | null;
}

class OutletErrorBoundaryInner extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[OutletErrorBoundary]', error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <section
          role="alert"
          style={{
            padding: 24,
            margin: 24,
            border: '1px solid var(--border-default)',
            borderRadius: 8,
            background: 'var(--bg-canvas)',
            display: 'grid',
            gap: 12,
            maxWidth: 720,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            This page failed to render
          </h2>
          <p className="of-text-muted" style={{ margin: 0, fontSize: 13 }}>
            Use the sidebar to navigate elsewhere — the error is captured
            in the browser console.
          </p>
          <pre
            style={{
              margin: 0,
              padding: 12,
              background: 'var(--bg-app)',
              borderRadius: 6,
              fontSize: 11,
              fontFamily: 'monospace',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: 'var(--status-danger)',
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            type="button"
            className="of-button"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          >
            Reload page
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}

export function OutletErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <OutletErrorBoundaryInner resetKey={pathname}>{children}</OutletErrorBoundaryInner>
  );
}

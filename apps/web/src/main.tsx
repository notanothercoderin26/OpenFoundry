import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';

import { router } from './router';
import { auth } from './lib/stores/auth';
import { restoreLocale } from './lib/i18n/store';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/app.css';

restoreLocale();
void auth.restore();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app root element');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {/*
          `useTransitions={false}` opts out of React Router v7's default
          `startTransition` wrapping. With transitions on, a concurrent
          render of the new route can be silently discarded if the old
          route's lingering state updates land during the transition —
          the router's internal state advances (router.subscribe sees
          the new pathname) but useLocation()-consumers like AppShell
          never re-render, leaving the previous route pinned on screen.
          That was the failure mode for /ontology-manager.
          See https://reactrouter.com/explanation/react-transitions
        */}
        <RouterProvider router={router} useTransitions={false} />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);

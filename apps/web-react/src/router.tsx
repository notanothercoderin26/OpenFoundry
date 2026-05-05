import { createBrowserRouter } from 'react-router-dom';

import { AppShell } from '@components/AppShell';
import { Home } from './routes/Home';
import { NotFound } from './routes/NotFound';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <NotFound />,
    children: [
      { index: true, element: <Home /> },
      {
        path: 'settings',
        lazy: async () => ({ Component: (await import('./routes/settings/SettingsPage')).SettingsPage }),
      },
      // Migration pattern: add a route here as you port each SvelteKit folder under apps/web/src/routes/.
      { path: '*', element: <NotFound /> },
    ],
  },
]);

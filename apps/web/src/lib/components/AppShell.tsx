import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useBootstrapGate } from '@/lib/auth/bootstrap';
import { useAuth } from '@stores/auth';
import { buildAuthReturnToPath, rememberAuthReturnTo, withAuthReturnTo } from '@/lib/auth/redirects';

import { Sidebar } from './Sidebar';
import { Toaster } from './Toaster';
import { Topbar } from './Topbar';
import { CommandPalette } from './ui/CommandPalette';

export function AppShell() {
  const bootstrapStatus = useBootstrapGate();
  const { token, user, loading } = useAuth();
  const authenticated = Boolean(token) || Boolean(user);
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const embeddedWorkspace =
    location.pathname.startsWith('/object-views') &&
    (searchParams.get('embedded') === 'true' || searchParams.get('embedded') === '1');

  useEffect(() => {
    if (bootstrapStatus !== 'ready') return;
    if (loading) return;
    if (authenticated) return;
    const returnTo = buildAuthReturnToPath(location);
    rememberAuthReturnTo(returnTo);
    navigate(withAuthReturnTo('/auth/login', returnTo), { replace: true });
  }, [bootstrapStatus, loading, authenticated, location, navigate]);

  if (bootstrapStatus !== 'ready' || !authenticated) {
    return null;
  }

  if (embeddedWorkspace) {
    return (
      <div className="of-shell" data-embedded="true" style={{ minHeight: '100vh' }}>
        <main className="of-main" style={{ width: '100%', minHeight: '100vh' }}>
          <Outlet />
        </main>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="of-shell" style={{ display: 'flex' }}>
      <Sidebar />
      <main className="of-main">
        <Topbar />
        <Outlet />
      </main>
      <CommandPalette />
      <Toaster />
    </div>
  );
}

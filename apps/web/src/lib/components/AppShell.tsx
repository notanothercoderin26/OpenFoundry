import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useBootstrapGate } from '@/lib/auth/bootstrap';
import { useAuth } from '@stores/auth';
import { buildAuthReturnToPath, rememberAuthReturnTo, withAuthReturnTo } from '@/lib/auth/redirects';

import { Sidebar } from './Sidebar';
import { ScopedSessionBanner } from './ScopedSessionBanner';
import { Toaster } from './Toaster';
import { Topbar } from './Topbar';
import { OutletErrorBoundary } from './OutletErrorBoundary';
import { WorkspaceRightRail } from './WorkspaceRightRail';
import { CommandPalette } from './ui/CommandPalette';

export function AppShell() {
  const bootstrapStatus = useBootstrapGate();
  const { user, loading } = useAuth();
  const authenticated = Boolean(user);
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

  const compassRoute = location.pathname.startsWith('/projects');

  return (
    <div className="of-shell" style={{ display: 'flex' }}>
      <Sidebar />
      <main className="of-main">
        <Topbar />
        <ScopedSessionBanner />
        {/*
          `key={location.pathname}` forces React to unmount the previous
          route subtree before mounting the next one. Without this, React
          19's concurrent renderer holds the old commit alive while
          preparing the new render, and if the new render throws (e.g.
          a `.map()` over undefined in OntologyManagerPage when a
          backend endpoint 502s), React reverts to the old commit
          instead of bubbling to OutletErrorBoundary. The user then
          sees the URL change but the page stay. Forcing remount
          on pathname change side-steps that recovery path.
        */}
        <OutletErrorBoundary key={location.pathname}>
          <Outlet />
        </OutletErrorBoundary>
      </main>
      {compassRoute ? <WorkspaceRightRail /> : null}
      <CommandPalette />
      <Toaster />
    </div>
  );
}

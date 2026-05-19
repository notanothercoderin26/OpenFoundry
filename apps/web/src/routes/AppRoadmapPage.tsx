import { Link, useLocation, useSearchParams } from 'react-router-dom';

import {
  findLauncherApp,
  LAUNCHER_APPS,
  LAUNCHER_CATEGORIES,
  type LauncherApp,
} from '@/lib/launcher/catalog';
import { Glyph } from '@/lib/components/ui/Glyph';

// Generic landing for catalog apps that ship without bespoke content yet.
// The app may be resolved from either:
//   - the legacy `?app=<id>` query (for the /coming-soon route)
//   - the current pathname (for the 18 canonical routes registered for
//     apps that have not yet been built out — see router.tsx)
// As each app gains real UI in subsequent phases, its route is replaced
// with a dedicated page component and this fallback stops rendering for
// that path.
function resolveApp(idFromQuery: string, pathname: string): LauncherApp | undefined {
  if (idFromQuery) {
    const app = findLauncherApp(idFromQuery);
    if (app) return app;
  }
  return LAUNCHER_APPS.find((app) => app.href === pathname);
}

export function AppRoadmapPage() {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const app = resolveApp(params.get('app') ?? '', pathname);

  const categoryLabel = app
    ? LAUNCHER_CATEGORIES.find((c) => c.id === app.category)?.label ?? ''
    : '';

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header className="of-hero-strip">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 12 }}>
            <p className="of-eyebrow">{categoryLabel || 'Application'}</p>
            <h1 className="of-heading-xl" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: 0 }}>
              {app ? (
                <>
                  <span
                    style={{
                      background: `${app.iconTone}28`,
                      color: app.iconTone,
                      width: 40,
                      height: 40,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 12,
                    }}
                  >
                    <Glyph name={app.icon} size={22} tone={app.iconTone} />
                  </span>
                  {app.name}
                </>
              ) : (
                'Application'
              )}
            </h1>
            <p className="of-text-muted" style={{ marginTop: 4 }}>
              {app?.description ?? 'This application is on the OpenFoundry roadmap.'}
            </p>
          </div>
          <span className="of-chip" style={{ alignSelf: 'flex-start' }}>
            On the roadmap
          </span>
        </div>
      </header>

      <div className="of-panel" style={{ padding: 20, display: 'grid', gap: 12 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>What lives here</h2>
        <p className="of-text-muted" style={{ margin: 0 }}>
          {app
            ? `${app.name} is part of OpenFoundry's canonical application catalog. The full experience is being delivered incrementally; this landing exists so links, bookmarks, and integrations stay stable while we build out the underlying service.`
            : 'This landing exists so links, bookmarks, and integrations stay stable while the underlying service is built out.'}
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
          <li>
            Track the migration plan and naming rationale in{' '}
            <code>docs/reference/launcher-app-mapping.md</code>.
          </li>
          <li>
            Open the application launcher in the sidebar to navigate to a related app.
          </li>
          <li>
            Return to your <Link to="/" className="of-link">Workspace</Link> at any time.
          </li>
        </ul>
      </div>
    </section>
  );
}

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { Glyph, type GlyphName } from './ui/Glyph';

const ROUTE_LABELS: Record<string, string> = {
  '': 'Home',
  ai: 'AI Platform',
  apps: 'Workshop',
  audit: 'Audit',
  builds: 'Builds',
  'build-schedules': 'Build schedules',
  'code-repos': 'Code repositories',
  'control-panel': 'Control Panel',
  contour: 'Contour',
  dashboards: 'Dashboards',
  datasets: 'Datasets',
  developers: 'Developers',
  'data-connection': 'Data Connection',
  functions: 'Functions',
  lineage: 'Lineage',
  marketplace: 'Marketplace',
  notebooks: 'Notebooks',
  notepad: 'Notepad',
  ontology: 'Ontology',
  'ontology-manager': 'Ontology Manager',
  pipelines: 'Pipeline Builder',
  projects: 'Projects & files',
  quiver: 'Quiver',
  reports: 'Reports',
  search: 'Search',
  settings: 'Settings',
  streaming: 'Streaming',
  vertex: 'Vertex',
};

function titleCase(segment: string) {
  return segment
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function crumbsFor(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return [{ label: 'Home', href: '/' }];
  return segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join('/')}`;
    const label = ROUTE_LABELS[segment] ?? titleCase(segment);
    return { label, href };
  });
}

// Per-route topbar context: which app icon (if any) sits to the left
// of the breadcrumb, the search placeholder, and the contextual
// "+ New …" split button. Routes that don't appear here fall back to
// DEFAULT_CONTEXT and the new-document button is hidden.
interface NewAction {
  primaryLabel: string;
  primaryTo: string;
  menu: Array<{ label: string; to: string }>;
}
interface TopbarContext {
  appIcon?: GlyphName;
  searchPlaceholder: string;
  newAction: NewAction | null;
}

const ROUTE_CONTEXT: Record<string, TopbarContext> = {
  notepad: {
    appIcon: 'notebook',
    searchPlaceholder: 'Search documents',
    newAction: {
      primaryLabel: 'New document',
      primaryTo: '/notepad?new=blank',
      menu: [
        { label: 'New from template', to: '/notepad?new=from-template' },
        { label: 'New document template', to: '/notepad?new=template' },
      ],
    },
  },
};

const DEFAULT_CONTEXT: TopbarContext = {
  searchPlaceholder: 'Search…',
  newAction: null,
};

function contextFor(pathname: string): TopbarContext {
  const root = pathname.split('/').filter(Boolean)[0] ?? '';
  return ROUTE_CONTEXT[root] ?? DEFAULT_CONTEXT;
}

export function Topbar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const crumbs = crumbsFor(pathname);
  const current = crumbs[crumbs.length - 1]?.label ?? 'Home';
  const context = contextFor(pathname);

  const [searchValue, setSearchValue] = useState('');
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const splitRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!newMenuOpen) return;
    function onPointer(event: MouseEvent) {
      if (!splitRef.current?.contains(event.target as Node)) {
        setNewMenuOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setNewMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [newMenuOpen]);

  function onSubmitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = searchValue.trim();
    const root = pathname.split('/').filter(Boolean)[0] ?? '';
    if (root === 'notepad') {
      navigate(trimmed ? `/notepad?search=${encodeURIComponent(trimmed)}` : '/notepad');
    } else if (trimmed) {
      navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <header className="of-topbar">
      <div className="of-topbar__left">
        {context.appIcon && (
          <span className="of-topbar__app-icon" aria-hidden="true">
            <Glyph name={context.appIcon} size={18} />
          </span>
        )}
        <div className="of-topbar__crumbs" aria-label="Breadcrumb">
          <Link to="/" className="of-topbar__home" aria-label="Home">
            <Glyph name="home" size={14} />
          </Link>
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            return (
              <span key={crumb.href} className="of-topbar__crumb-wrap">
                <span className="of-topbar__separator" aria-hidden="true">
                  /
                </span>
                {isLast ? (
                  <span className="of-topbar__crumb of-topbar__current">{crumb.label}</span>
                ) : (
                  <Link to={crumb.href} className="of-topbar__crumb of-topbar__crumb-link">
                    {crumb.label}
                  </Link>
                )}
              </span>
            );
          })}
          <button type="button" className="of-topbar__star" aria-label={`Favorite ${current}`}>
            <Glyph name="star" size={14} />
          </button>
        </div>
      </div>

      <form className="of-topbar__search" role="search" onSubmit={onSubmitSearch}>
        <span className="of-topbar__search-icon" aria-hidden="true">
          <Glyph name="search" size={14} />
        </span>
        <input
          type="search"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder={context.searchPlaceholder}
          aria-label={context.searchPlaceholder}
        />
      </form>

      <div className="of-topbar__right">
        <button type="button" className="of-topbar__workspace" aria-haspopup="menu">
          <Glyph name="folder" size={14} />
          <span>Personal</span>
          <Glyph name="chevron-down" size={11} />
        </button>

        {context.newAction && (
          <div className="of-topbar__split" ref={splitRef}>
            <Link to={context.newAction.primaryTo} className="of-topbar__split-primary">
              <Glyph name="plus" size={13} />
              <span>{context.newAction.primaryLabel}</span>
            </Link>
            <button
              type="button"
              className="of-topbar__split-caret"
              aria-haspopup="menu"
              aria-expanded={newMenuOpen}
              aria-label={`${context.newAction.primaryLabel} options`}
              onClick={() => setNewMenuOpen((open) => !open)}
            >
              <Glyph name="chevron-down" size={11} />
            </button>
            {newMenuOpen && (
              <div role="menu" className="of-topbar__split-menu">
                {context.newAction.menu.map((item) => (
                  <Link
                    key={item.label}
                    role="menuitem"
                    to={item.to}
                    className="of-topbar__split-menu-item"
                    onClick={() => setNewMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        <button type="button" className="of-topbar__icon-action" aria-label="Help">
          <Glyph name="help" size={16} />
        </button>
      </div>
    </header>
  );
}

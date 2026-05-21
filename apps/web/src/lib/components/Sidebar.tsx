import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import { evaluateApplicationAccess } from '@/lib/api/control-panel';
import { useTranslator } from '@/lib/i18n/store';
import {
  LAUNCHER_APPS,
  LAUNCHER_CATEGORIES,
  type LauncherApp,
} from '@/lib/launcher/catalog';
import { Glyph, type GlyphName } from './ui/Glyph';

const SearchPageLazy = lazy(async () => {
  const mod = await import('@/routes/search/SearchPage');
  return { default: mod.SearchPage };
});

interface NavItem {
  to: string;
  label: string;
  icon: GlyphName;
  shortcut?: string;
  dot?: boolean;
  end?: boolean;
  iconTone?: string;
}

const COLLAPSED_KEY = 'of_sidebar_collapsed';
const FAVORITES_KEY = 'of_favorite_apps';

function readFavorites(): string[] {
  if (typeof localStorage === 'undefined') return DEFAULT_FAVORITES;
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw === null) return DEFAULT_FAVORITES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/notifications', label: 'Notifications', icon: 'bell', dot: true },
];

const SECONDARY_NAV: NavItem[] = [
  { to: '/favorites', label: 'Favorites', icon: 'star' },
  { to: '/recent', label: 'Recent', icon: 'history' },
  { to: '/projects', label: 'Files', icon: 'folder' },
];

// Favorites are now user-driven via the launcher star toggle (see
// FAVORITES_KEY below). Workshop ships as a default favorite on first
// load so the section is not empty on a fresh install.
const DEFAULT_FAVORITES: string[] = ['workshop'];

const FOOTER_NAV: NavItem[] = [
  { to: '/ai', label: 'AI Assist', icon: 'asterisk', shortcut: 'ctrl + shift + U', iconTone: '#67e8f9' },
  { to: '/developers', label: 'Support', icon: 'help' },
  { to: '/settings', label: 'Account', icon: 'users' },
];

const CATEGORIES = LAUNCHER_CATEGORIES;

function isActive(href: string, pathname: string, end?: boolean) {
  if (end) return pathname === href;
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function readCollapsedPref(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(COLLAPSED_KEY) === '1';
}

interface SidebarLinkProps {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
}

function SidebarLink({ item, pathname, collapsed }: SidebarLinkProps) {
  const active = isActive(item.to, pathname, item.end);
  return (
    <NavLink
      to={item.to}
      className={`of-sidebar__link${active ? ' of-sidebar__link--active' : ''}`}
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
    >
      <span className="of-sidebar__icon" style={item.iconTone ? { color: item.iconTone } : undefined}>
        <Glyph name={item.icon} size={17} tone={item.iconTone ?? null} />
        {item.dot && <span className="of-sidebar__dot" aria-hidden="true" />}
      </span>
      <span className="of-sidebar__label">{item.label}</span>
      {item.shortcut && <span className="of-sidebar__hint">{item.shortcut}</span>}
    </NavLink>
  );
}

export function Sidebar() {
  const t = useTranslator();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsedPref());
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [hoveredAppId, setHoveredAppId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => readFavorites());
  const [applicationVisibility, setApplicationVisibility] = useState<Record<string, boolean> | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    let cancelled = false;
    async function loadApplicationVisibility() {
      try {
        const resp = await evaluateApplicationAccess({ application_ids: LAUNCHER_APPS.map((app) => app.id) });
        if (cancelled) return;
        setApplicationVisibility(Object.fromEntries(resp.decisions.map((decision) => [decision.application_id, decision.visible])));
      } catch {
        if (!cancelled) setApplicationVisibility(null);
      }
    }
    void loadApplicationVisibility();
    return () => {
      cancelled = true;
    };
  }, []);

  const accessibleApps = useMemo(
    () => (applicationVisibility ? LAUNCHER_APPS.filter((app) => applicationVisibility[app.id] !== false) : LAUNCHER_APPS),
    [applicationVisibility],
  );

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const favoriteApps = useMemo(
    () =>
      favorites
        .map((id) => accessibleApps.find((a) => a.id === id))
        .filter((a): a is LauncherApp => Boolean(a)),
    [accessibleApps, favorites],
  );

  useEffect(() => {
    if (launcherOpen) searchRef.current?.focus();
  }, [launcherOpen]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && launcherOpen) setLauncherOpen(false);
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [launcherOpen]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: accessibleApps.length };
    for (const c of CATEGORIES) {
      if (c.isHeading || c.id === 'all') continue;
      counts[c.id] = accessibleApps.filter((a) => a.category === c.id).length;
    }
    return counts;
  }, [accessibleApps]);

  const visibleApps = useMemo(() => {
    const term = search.trim().toLowerCase();
    return accessibleApps.filter((app) => {
      if (category !== 'all' && app.category !== category) return false;
      if (!term) return true;
      return app.name.toLowerCase().includes(term) || app.description.toLowerCase().includes(term);
    });
  }, [accessibleApps, search, category]);

  const groupedApps = useMemo(() => {
    const groups = new Map<string, LauncherApp[]>();
    for (const app of visibleApps) {
      if (!groups.has(app.category)) groups.set(app.category, []);
      groups.get(app.category)!.push(app);
    }
    const order = CATEGORIES.filter((c) => !c.isHeading && c.id !== 'all').map((c) => c.id);
    return order
      .filter((id) => groups.has(id))
      .map((id) => ({
        id,
        label: CATEGORIES.find((c) => c.id === id)?.label ?? id,
        apps: groups.get(id)!,
      }));
  }, [visibleApps]);

  const hoveredApp = useMemo(
    () => accessibleApps.find((a) => a.id === hoveredAppId) ?? null,
    [accessibleApps, hoveredAppId],
  );

  const promotedApps = useMemo(() => accessibleApps.filter((a) => a.promoted), [accessibleApps]);

  function openLauncher() {
    setSearch('');
    setCategory('all');
    setHoveredAppId(null);
    setFiltersOpen(false);
    setLauncherOpen(true);
  }

  return (
    <>
      <aside className="of-sidebar of-scrollbar" data-collapsed={collapsed || undefined}>
        <div className="of-sidebar__brand">
          <Link to="/" className="of-sidebar__logo" aria-label="OpenFoundry home" title="OpenFoundry">
            <img src="/empty-logo.png" alt="" width={36} height={36} style={{ display: 'block', objectFit: 'contain' }} />
          </Link>
          <button
            type="button"
            className="of-sidebar__collapse"
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            aria-pressed={collapsed}
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? t('nav.expand') : t('nav.collapse')}
          >
            <Glyph name={collapsed ? 'chevron-right' : 'chevron-left'} size={15} />
          </button>
        </div>

        <nav className="of-sidebar__nav" aria-label="Primary navigation">
          <section className="of-sidebar__section">
            <SidebarLink
              item={PRIMARY_NAV[0]}
              pathname={pathname}
              collapsed={collapsed}
            />
            <button
              type="button"
              className={`of-sidebar__link of-sidebar__link--button${searchOpen ? ' of-sidebar__link--active' : ''}`}
              data-expanded={searchOpen || undefined}
              aria-haspopup="dialog"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen((open) => !open)}
              title={collapsed ? 'Search' : undefined}
            >
              <span className="of-sidebar__icon"><Glyph name="search" size={17} /></span>
              <span className="of-sidebar__label">Search</span>
              <span className="of-sidebar__hint">ctrl + J</span>
            </button>
            {PRIMARY_NAV.slice(1).map((item) => (
              <SidebarLink key={item.to} item={item} pathname={pathname} collapsed={collapsed} />
            ))}
          </section>

          <section className="of-sidebar__section">
            {SECONDARY_NAV.map((item) => (
              <SidebarLink key={item.to} item={item} pathname={pathname} collapsed={collapsed} />
            ))}
            <button
              type="button"
              className={`of-sidebar__link of-sidebar__link--button${launcherOpen ? ' of-sidebar__link--active' : ''}`}
              data-expanded={launcherOpen || undefined}
              aria-haspopup="dialog"
              aria-expanded={launcherOpen}
              onClick={() => (launcherOpen ? setLauncherOpen(false) : openLauncher())}
              title={collapsed ? 'Applications' : undefined}
            >
              <span className="of-sidebar__icon"><Glyph name="view-grid" size={17} /></span>
              <span className="of-sidebar__label">Applications</span>
            </button>
          </section>

          {favoriteApps.length > 0 && (
            <section className="of-sidebar__section">
              <div className="of-sidebar__heading">{t('nav.workshop.section')}</div>
              {favoriteApps.map((app) => (
                <SidebarLink
                  key={`fav-${app.id}`}
                  item={{ to: app.href, label: app.name, icon: app.icon, iconTone: app.iconTone }}
                  pathname={pathname}
                  collapsed={collapsed}
                />
              ))}
            </section>
          )}
        </nav>

        <section className="of-sidebar__section of-sidebar__section--footer">
          {FOOTER_NAV.map((item) => (
            <SidebarLink key={item.to} item={item} pathname={pathname} collapsed={collapsed} />
          ))}
        </section>
      </aside>

      {searchOpen && (
        <div className="of-quicksearch-popup" data-sidebar-collapsed={collapsed || undefined}>
          <button
            type="button"
            className="of-quicksearch-popup__backdrop"
            aria-label="Close search"
            onClick={() => setSearchOpen(false)}
          />
          <div className="of-quicksearch-popup__surface" role="dialog" aria-modal="true" aria-label="Search">
            <Suspense fallback={<div className="of-quicksearch-popup__loading">Loading search…</div>}>
              <SearchPageLazy onClose={() => setSearchOpen(false)} />
            </Suspense>
          </div>
        </div>
      )}

      {launcherOpen && (
        <div className="of-app-launcher" data-sidebar-collapsed={collapsed || undefined}>
          <button
            type="button"
            className="of-app-launcher__backdrop"
            aria-label="Close applications launcher"
            onClick={() => setLauncherOpen(false)}
          />
          <div className="of-app-launcher__surface" role="dialog" aria-modal="true" aria-label="Applications">
            <div className="of-app-launcher__header">
              <label className="of-app-launcher__search">
                <span className="of-app-launcher__search-icon"><Glyph name="search" size={14} /></span>
                <input
                  ref={searchRef}
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search for applications…"
                  aria-label="Search applications"
                />
              </label>
              <button
                type="button"
                className={`of-app-launcher__filters${filtersOpen ? ' is-open' : ''}`}
                aria-pressed={filtersOpen}
                onClick={() => setFiltersOpen((v) => !v)}
              >
                <Glyph name="tag" size={13} />
                <span>{t('launcher.filters')}</span>
              </button>
              <button
                type="button"
                className="of-app-launcher__close"
                aria-label="Close applications launcher"
                onClick={() => setLauncherOpen(false)}
              >
                <Glyph name="x" size={14} />
              </button>
            </div>

            <div className="of-app-launcher__body">
              <div className="of-app-launcher__categories">
                {CATEGORIES.map((c) =>
                  c.isHeading ? (
                    <div key={c.id} className="of-app-launcher__category-heading">{c.label}</div>
                  ) : (
                    <button
                      key={c.id}
                      type="button"
                      className="of-app-launcher__category"
                      data-active={category === c.id || undefined}
                      onClick={() => setCategory(c.id)}
                    >
                      <span>{c.label}</span>
                      <span className="of-app-launcher__category-count">{categoryCounts[c.id] ?? 0}</span>
                    </button>
                  ),
                )}
                <div className="of-app-launcher__category-heading of-app-launcher__category-heading--inline">
                  PROMOTED APPS
                  <button type="button" className="of-app-launcher__promote-add">
                    <Glyph name="check" size={12} />
                    <span>Add</span>
                  </button>
                </div>
                {promotedApps.length === 0 && (
                  <div className="of-app-launcher__category-empty">No promoted apps</div>
                )}
                {promotedApps.map((app) => (
                  <Link
                    key={`promoted-${app.id}`}
                    to={app.href}
                    className="of-app-launcher__category"
                    onClick={() => setLauncherOpen(false)}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Glyph name={app.icon} size={13} tone={app.iconTone} />
                      {app.name}
                    </span>
                  </Link>
                ))}
              </div>

              <div className="of-app-launcher__catalog">
                {visibleApps.length === 0 ? (
                  <div className="of-app-launcher__empty">No applications matched this search.</div>
                ) : (
                  groupedApps.map((group) => (
                    <div key={group.id} className="of-app-launcher__group">
                      <div className="of-app-launcher__group-title">{group.label}</div>
                      {group.apps.map((app) => {
                        const isFav = favorites.includes(app.id);
                        return (
                          <Link
                            key={app.id}
                            to={app.href}
                            className="of-app-launcher__item"
                            data-selected={hoveredAppId === app.id || undefined}
                            data-active={isActive(app.href, pathname) || undefined}
                            data-favorite={isFav || undefined}
                            onMouseEnter={() => setHoveredAppId(app.id)}
                            onFocus={() => setHoveredAppId(app.id)}
                            onClick={() => setLauncherOpen(false)}
                          >
                            <span
                              className="of-app-launcher__item-icon"
                              style={{
                                background: `${app.iconTone}28`,
                                color: app.iconTone,
                              }}
                            >
                              <Glyph name={app.icon} size={16} tone={app.iconTone} />
                            </span>
                            <span className="of-app-launcher__item-copy">
                              <span className="of-app-launcher__item-name">{app.name}</span>
                              <span className="of-app-launcher__item-description">{app.description}</span>
                            </span>
                            <button
                              type="button"
                              className="of-app-launcher__item-fav"
                              data-favorite={isFav || undefined}
                              aria-pressed={isFav}
                              aria-label={isFav ? `Remove ${app.name} from favorites` : `Add ${app.name} to favorites`}
                              title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleFavorite(app.id);
                              }}
                            >
                              <Glyph name={isFav ? 'star-filled' : 'star'} size={14} />
                            </button>
                          </Link>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              <div className="of-app-launcher__detail">
                {hoveredApp ? (
                  <>
                    <div
                      className="of-app-launcher__detail-icon"
                      style={{
                        background: `${hoveredApp.iconTone}28`,
                        color: hoveredApp.iconTone,
                      }}
                    >
                      <Glyph name={hoveredApp.icon} size={20} tone={hoveredApp.iconTone} />
                    </div>
                    <div className="of-app-launcher__detail-copy">
                      <div className="of-app-launcher__detail-badge">
                        {CATEGORIES.find((c) => c.id === hoveredApp.category)?.label ?? ''}
                      </div>
                      <h2>{hoveredApp.name}</h2>
                      <p>{hoveredApp.description}</p>
                    </div>
                    <div className="of-app-launcher__actions">
                      <Link
                        to={hoveredApp.href}
                        className="of-app-launcher__button of-app-launcher__button--primary"
                        onClick={() => setLauncherOpen(false)}
                      >
                        Open
                      </Link>
                    </div>
                  </>
                ) : (
                  <div className="of-app-launcher__detail-empty">
                    <span className="of-app-launcher__detail-empty-icon" aria-hidden>
                      <Glyph name="cube" size={28} tone="rgba(255, 255, 255, 0.18)" />
                    </span>
                    <p>Hover on an application to see details</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

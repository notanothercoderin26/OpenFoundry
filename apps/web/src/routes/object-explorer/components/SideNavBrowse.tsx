import type { ObjectExplorerTypeGroup } from '@/lib/api/ontology';

import './SideNav.css';

export type SideNavSelection =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'explorations' }
  | { kind: 'group'; groupId: string };

export interface SideNavBrowseProps {
  groups: ObjectExplorerTypeGroup[];
  selection: SideNavSelection;
  onSelect: (next: SideNavSelection) => void;
  favoritesCount: number;
  explorationsCount: number;
  page: number;
  onChangePage: (next: number) => void;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 10;

function selectionEquals(a: SideNavSelection, b: SideNavSelection) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'group' && b.kind === 'group') return a.groupId === b.groupId;
  return true;
}

export function SideNavBrowse({
  groups,
  selection,
  onSelect,
  favoritesCount,
  explorationsCount,
  page,
  onChangePage,
  pageSize = DEFAULT_PAGE_SIZE,
}: SideNavBrowseProps) {
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const pageStart = safePage * pageSize;
  const pageGroups = groups.slice(pageStart, pageStart + pageSize);

  const pinned: Array<{ key: string; label: string; count: number; selection: SideNavSelection }> = [
    {
      key: 'all',
      label: 'All',
      count: groups.reduce((sum, group) => sum + group.object_types.length, 0),
      selection: { kind: 'all' },
    },
    { key: 'explorations', label: 'My explorations & lists', count: explorationsCount, selection: { kind: 'explorations' } },
  ];
  if (favoritesCount > 0) {
    pinned.splice(1, 0, { key: 'favorites', label: 'Favorites', count: favoritesCount, selection: { kind: 'favorites' } });
  }

  return (
    <aside className="oe-sidenav" aria-label="Object explorer navigation">
      <div className="oe-sidenav__section">
        {pinned.map((entry) => {
          const active = selectionEquals(entry.selection, selection);
          return (
            <button
              key={entry.key}
              type="button"
              className="oe-nav-item"
              data-active={active}
              onClick={() => onSelect(entry.selection)}
            >
              <span className="oe-sidenav__item-label">{entry.label}</span>
              <span className="oe-chip">{entry.count}</span>
            </button>
          );
        })}
      </div>

      <div className="oe-sidenav__section">
        <p className="oe-eyebrow oe-sidenav__section-heading">Object type groups</p>
        {pageGroups.length === 0 ? (
          <p className="oe-sidenav__empty">No groups available.</p>
        ) : (
          pageGroups.map((group) => {
            const target: SideNavSelection = { kind: 'group', groupId: group.id };
            const active = selectionEquals(target, selection);
            return (
              <button
                key={group.id}
                type="button"
                className="oe-nav-item"
                data-active={active}
                onClick={() => onSelect(target)}
                title={group.description || group.display_name}
              >
                <span className="oe-sidenav__item-label">{group.display_name}</span>
                <span className="oe-chip">{group.object_types.length}</span>
              </button>
            );
          })
        )}

        {totalPages > 1 && (
          <div className="oe-sidenav__pagination">
            <button
              type="button"
              className="oe-sidenav__page-btn"
              disabled={safePage === 0}
              onClick={() => onChangePage(safePage - 1)}
            >
              ‹ Prev
            </button>
            <span className="oe-sidenav__page-counter">
              {safePage + 1} / {totalPages}
            </span>
            <button
              type="button"
              className="oe-sidenav__page-btn"
              disabled={safePage >= totalPages - 1}
              onClick={() => onChangePage(safePage + 1)}
            >
              Next ›
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

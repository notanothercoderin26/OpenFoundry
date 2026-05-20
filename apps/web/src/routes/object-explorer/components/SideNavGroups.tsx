import type { buildObjectExplorerTypeGroups } from '@/lib/api/ontology';

type ExplorerGroup = ReturnType<typeof buildObjectExplorerTypeGroups>[number];

export type SideNavSelection =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'explorations' }
  | { kind: 'group'; groupId: string };

interface SideNavGroupsProps {
  groups: ExplorerGroup[];
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

export function SideNavGroups({
  groups,
  selection,
  onSelect,
  favoritesCount,
  explorationsCount,
  page,
  onChangePage,
  pageSize = DEFAULT_PAGE_SIZE,
}: SideNavGroupsProps) {
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const pageStart = safePage * pageSize;
  const pageGroups = groups.slice(pageStart, pageStart + pageSize);

  const pinned: Array<{ key: string; label: string; count: number; selection: SideNavSelection }> = [
    { key: 'all', label: 'All', count: groups.reduce((sum, group) => sum + group.object_types.length, 0), selection: { kind: 'all' } },
    { key: 'explorations', label: 'My explorations & lists', count: explorationsCount, selection: { kind: 'explorations' } },
  ];
  if (favoritesCount > 0) {
    pinned.splice(1, 0, { key: 'favorites', label: 'Favorites', count: favoritesCount, selection: { kind: 'favorites' } });
  }

  return (
    <aside
      className="of-panel"
      style={{ padding: 10, display: 'grid', gap: 6, alignContent: 'start', minWidth: 200 }}
      aria-label="Object explorer navigation"
    >
      <p className="of-eyebrow">Browse</p>
      {pinned.map((entry) => {
        const active = selectionEquals(entry.selection, selection);
        return (
          <button
            key={entry.key}
            type="button"
            onClick={() => onSelect(entry.selection)}
            className={active ? 'of-button of-button--primary' : 'of-button of-button--ghost'}
            style={{ justifyContent: 'space-between', textAlign: 'left', minHeight: 32, padding: '4px 8px' }}
          >
            <span>{entry.label}</span>
            <span className="of-chip">{entry.count}</span>
          </button>
        );
      })}

      <p className="of-eyebrow" style={{ marginTop: 8 }}>Object type groups</p>
      {pageGroups.length === 0 ? (
        <p className="of-text-muted" style={{ fontSize: 12, margin: 0, padding: '4px 8px' }}>
          No groups available.
        </p>
      ) : (
        pageGroups.map((group) => {
          const target: SideNavSelection = { kind: 'group', groupId: group.id };
          const active = selectionEquals(target, selection);
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => onSelect(target)}
              className={active ? 'of-button of-button--primary' : 'of-button of-button--ghost'}
              style={{ justifyContent: 'space-between', textAlign: 'left', minHeight: 32, padding: '4px 8px' }}
              title={group.description ?? group.display_name}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {group.display_name}
              </span>
              <span className="of-chip">{group.object_types.length}</span>
            </button>
          );
        })
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginTop: 6 }}>
          <button
            type="button"
            className="of-button"
            disabled={safePage === 0}
            onClick={() => onChangePage(safePage - 1)}
          >
            Prev
          </button>
          <span className="of-text-muted" style={{ fontSize: 11, alignSelf: 'center' }}>
            {safePage + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="of-button"
            disabled={safePage >= totalPages - 1}
            onClick={() => onChangePage(safePage + 1)}
          >
            Next
          </button>
        </div>
      )}
    </aside>
  );
}

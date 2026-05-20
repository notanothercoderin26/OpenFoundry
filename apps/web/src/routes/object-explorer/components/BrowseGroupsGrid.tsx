import type { ObjectInstanceViewPolicy } from '@/lib/api/ontology';
import type { buildObjectExplorerTypeGroups } from '@/lib/api/ontology';

import { EmptyState, PanelHeader } from './atoms';
import type { SideNavSelection } from './SideNavGroups';

type ExplorerGroup = ReturnType<typeof buildObjectExplorerTypeGroups>[number];

interface BrowseGroupsGridProps {
  groups: ExplorerGroup[];
  accessForType: (typeId: string | null | undefined) => ObjectInstanceViewPolicy;
  onBrowse: (typeId: string) => void;
  favoriteTypeIds: Set<string>;
  onToggleFavorite: (typeId: string) => void;
  selection: SideNavSelection;
}

function filterGroupsForSelection(groups: ExplorerGroup[], selection: SideNavSelection, favoriteTypeIds: Set<string>): ExplorerGroup[] {
  if (selection.kind === 'group') {
    return groups.filter((group) => group.id === selection.groupId);
  }
  if (selection.kind === 'favorites') {
    const favoriteTypes = groups.flatMap((group) => group.object_types.filter((type) => favoriteTypeIds.has(type.id)));
    if (favoriteTypes.length === 0) return [];
    const seen = new Set<string>();
    const unique = favoriteTypes.filter((type) => {
      if (seen.has(type.id)) return false;
      seen.add(type.id);
      return true;
    });
    return [
      {
        id: 'favorites',
        display_name: 'Favorites',
        description: 'Object types you starred.',
        object_types: unique,
      } as ExplorerGroup,
    ];
  }
  return groups;
}

export function BrowseGroupsGrid({
  groups,
  accessForType,
  onBrowse,
  favoriteTypeIds,
  onToggleFavorite,
  selection,
}: BrowseGroupsGridProps) {
  const visibleGroups = filterGroupsForSelection(groups, selection, favoriteTypeIds);
  const headerLabel = selection.kind === 'favorites'
    ? 'Favorites'
    : selection.kind === 'group'
    ? visibleGroups[0]?.display_name ?? 'Group'
    : 'Browse object type groups';

  return (
    <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
      <PanelHeader label={headerLabel} value={`${visibleGroups.length}`} />
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
        {visibleGroups.map((group) => (
          <article key={group.id} className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <strong>{group.display_name}</strong>
                {group.description ? (
                  <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>
                    {group.description}
                  </p>
                ) : null}
              </div>
              <span className="of-chip">{group.object_types.length}</span>
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              {group.object_types.slice(0, 6).map((type) => {
                const access = accessForType(type.id);
                const isFavorite = favoriteTypeIds.has(type.id);
                return (
                  <div
                    key={type.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <button
                      type="button"
                      onClick={() => onBrowse(type.id)}
                      disabled={!access.can_view_instances}
                      className="of-button"
                      style={{ flex: 1, fontSize: 12, justifyContent: 'flex-start' }}
                      title={access.can_view_instances ? `Browse ${type.display_name || type.name}` : access.reason}
                    >
                      {type.display_name || type.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(type.id)}
                      className="of-button of-button--ghost"
                      aria-pressed={isFavorite}
                      aria-label={isFavorite ? `Remove ${type.display_name || type.name} from favorites` : `Add ${type.display_name || type.name} to favorites`}
                      title={isFavorite ? 'Remove favorite' : 'Add to favorites'}
                      style={{ padding: '2px 6px', minWidth: 28, color: isFavorite ? '#f1b400' : undefined }}
                    >
                      {isFavorite ? '★' : '☆'}
                    </button>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
        {visibleGroups.length === 0 && (
          <EmptyState
            label={
              selection.kind === 'favorites'
                ? 'No favorite object types yet. Click ☆ on a type to add it.'
                : 'No visible object type groups.'
            }
            compact
          />
        )}
      </div>
    </section>
  );
}

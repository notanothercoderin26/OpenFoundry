import type { ObjectExplorerTypeGroup, ObjectType, SearchResult } from '@/lib/api/ontology';

import { iconBackground } from '../iconPalette';
import './SideNav.css';

export type SearchArtifactCategory = 'explorations' | 'comparisons' | 'modules';

export type SearchSideNavSelection =
  | { kind: 'all' }
  | { kind: 'type'; typeId: string }
  | { kind: 'group'; groupId: string }
  | { kind: 'artifacts'; category: SearchArtifactCategory };

export interface SideNavSearchProps {
  searchResults: SearchResult[];
  groups: ObjectExplorerTypeGroup[];
  typeById: Map<string, ObjectType>;
  selection: SearchSideNavSelection;
  onSelect: (next: SearchSideNavSelection) => void;
  onViewAllObjectTypeFilters: () => void;
  onViewAllGroupFilters: () => void;
  topTypeFilterLimit?: number;
}

const DEFAULT_TOP_TYPE_LIMIT = 4;

function classifyArtifact(result: SearchResult): SearchArtifactCategory {
  switch (result.kind) {
    case 'comparison_view':
    case 'object_view_comparison':
      return 'comparisons';
    case 'workshop_module':
    case 'workshop_widget':
    case 'module':
      return 'modules';
    default:
      return 'explorations';
  }
}

export function SideNavSearch({
  searchResults,
  groups,
  typeById,
  selection,
  onSelect,
  onViewAllObjectTypeFilters,
  onViewAllGroupFilters,
  topTypeFilterLimit = DEFAULT_TOP_TYPE_LIMIT,
}: SideNavSearchProps) {
  const objectCountsByType = new Map<string, number>();
  const artifactCounts: Record<SearchArtifactCategory, number> = {
    explorations: 0,
    comparisons: 0,
    modules: 0,
  };

  for (const result of searchResults) {
    if (result.kind === 'object_instance' && result.object_type_id) {
      objectCountsByType.set(result.object_type_id, (objectCountsByType.get(result.object_type_id) ?? 0) + 1);
    } else if (result.kind !== 'object_type') {
      artifactCounts[classifyArtifact(result)] += 1;
    }
  }

  const sortedTypeFilters = Array.from(objectCountsByType.entries())
    .filter(([typeId]) => typeById.has(typeId))
    .sort((left, right) => right[1] - left[1]);
  const topTypeFilters = sortedTypeFilters.slice(0, topTypeFilterLimit);
  const remainingTypeFilters = Math.max(0, sortedTypeFilters.length - topTypeFilters.length);

  const groupHitCounts = groups
    .map((group) => {
      const memberHits = group.object_type_ids.reduce(
        (sum, typeId) => sum + (objectCountsByType.get(typeId) ?? 0),
        0,
      );
      return { group, count: memberHits };
    })
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count);

  return (
    <aside className="oe-sidenav" aria-label="Object explorer search filters">
      <div className="oe-sidenav__section">
        <button
          type="button"
          className="oe-nav-item"
          data-active={selection.kind === 'all'}
          onClick={() => onSelect({ kind: 'all' })}
        >
          <span className="oe-sidenav__item-label">All results</span>
          <span className="oe-chip">{searchResults.length}</span>
        </button>
      </div>

      <div className="oe-sidenav__section">
        <p className="oe-eyebrow oe-sidenav__section-heading">Object type filters</p>
        {topTypeFilters.length === 0 ? (
          <p className="oe-sidenav__empty">No object matches.</p>
        ) : (
          topTypeFilters.map(([typeId, count]) => {
            const type = typeById.get(typeId);
            if (!type) return null;
            const active = selection.kind === 'type' && selection.typeId === typeId;
            return (
              <button
                key={typeId}
                type="button"
                className="oe-nav-item"
                data-active={active}
                onClick={() => onSelect({ kind: 'type', typeId })}
              >
                <span
                  className="oe-sidenav__item-icon oe-type-icon oe-type-icon--sm"
                  style={{ background: iconBackground(typeId, type.color) }}
                  aria-hidden="true"
                >
                  {initialFor(type)}
                </span>
                <span className="oe-sidenav__item-label">{type.display_name || type.name}</span>
                <span className="oe-chip">{count}</span>
              </button>
            );
          })
        )}
        {remainingTypeFilters > 0 && (
          <button type="button" className="oe-link oe-sidenav__more" onClick={onViewAllObjectTypeFilters}>
            View {remainingTypeFilters} other filter{remainingTypeFilters === 1 ? '' : 's'} ›
          </button>
        )}
      </div>

      <div className="oe-sidenav__section">
        <p className="oe-eyebrow oe-sidenav__section-heading">Object type groups</p>
        {groupHitCounts.length === 0 ? (
          <p className="oe-sidenav__empty">No group matches.</p>
        ) : (
          groupHitCounts.map(({ group, count }) => {
            const active = selection.kind === 'group' && selection.groupId === group.id;
            return (
              <button
                key={group.id}
                type="button"
                className="oe-nav-item"
                data-active={active}
                onClick={() => onSelect({ kind: 'group', groupId: group.id })}
                title={group.description || group.display_name}
              >
                <span className="oe-sidenav__item-label">{group.display_name}</span>
                <span className="oe-chip">{count}</span>
              </button>
            );
          })
        )}
        <button type="button" className="oe-link oe-sidenav__more" onClick={onViewAllGroupFilters}>
          View all filters ›
        </button>
      </div>

      <div className="oe-sidenav__section">
        <p className="oe-eyebrow oe-sidenav__section-heading">Artifacts</p>
        <ArtifactRow
          label="Explorations & Lists"
          count={artifactCounts.explorations}
          active={selection.kind === 'artifacts' && selection.category === 'explorations'}
          onSelect={() => onSelect({ kind: 'artifacts', category: 'explorations' })}
        />
        <ArtifactRow
          label="Comparison Views"
          count={artifactCounts.comparisons}
          active={selection.kind === 'artifacts' && selection.category === 'comparisons'}
          onSelect={() => onSelect({ kind: 'artifacts', category: 'comparisons' })}
        />
        <ArtifactRow
          label="Modules"
          count={artifactCounts.modules}
          active={selection.kind === 'artifacts' && selection.category === 'modules'}
          onSelect={() => onSelect({ kind: 'artifacts', category: 'modules' })}
        />
      </div>
    </aside>
  );
}

function ArtifactRow({
  label,
  count,
  active,
  onSelect,
}: {
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  const disabled = count === 0;
  return (
    <button
      type="button"
      className="oe-nav-item"
      data-active={active}
      data-disabled={disabled}
      onClick={disabled ? undefined : onSelect}
      aria-disabled={disabled}
    >
      <span className="oe-sidenav__item-label">{label}</span>
      <span className="oe-chip">{count}</span>
    </button>
  );
}

function initialFor(type: ObjectType): string {
  const source = (type.display_name || type.name || '?').replace(/^\[[^\]]+\]\s*/, '');
  return source.charAt(0).toUpperCase();
}

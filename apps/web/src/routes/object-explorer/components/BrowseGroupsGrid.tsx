import { useState } from 'react';

import type {
  buildObjectExplorerTypeGroups,
  LinkType,
  ObjectInstanceViewPolicy,
  ObjectType,
} from '@/lib/api/ontology';

import { iconBackground } from '../iconPalette';
import { GroupGraphView } from './GroupGraphView';
import type { SideNavSelection } from './SideNavBrowse';
import './BrowseGroupsGrid.css';

type ExplorerGroup = ReturnType<typeof buildObjectExplorerTypeGroups>[number];
type GroupView = 'list' | 'graph';

export interface BrowseGroupsGridProps {
  groups: ExplorerGroup[];
  linkTypes: LinkType[];
  accessForType: (typeId: string | null | undefined) => ObjectInstanceViewPolicy;
  onBrowse: (typeId: string) => void;
  onPreviewType: (typeId: string) => void;
  favoriteTypeIds: Set<string>;
  onToggleFavorite: (typeId: string) => void;
  selection: SideNavSelection;
  /** Per-type object count for the card chip. When undefined, no chip
   *  is rendered. */
  countsByType?: Map<string, number>;
}

const FAVORITES_GROUP_ID = 'favorites';

function buildFavoritesGroup(groups: ExplorerGroup[], favoriteTypeIds: Set<string>): ExplorerGroup | null {
  if (favoriteTypeIds.size === 0) return null;
  const seen = new Set<string>();
  const favoriteTypes: ObjectType[] = [];
  for (const group of groups) {
    for (const type of group.object_types) {
      if (!favoriteTypeIds.has(type.id) || seen.has(type.id)) continue;
      seen.add(type.id);
      favoriteTypes.push(type);
    }
  }
  if (favoriteTypes.length === 0) return null;
  return {
    id: FAVORITES_GROUP_ID,
    name: FAVORITES_GROUP_ID,
    display_name: 'Favorites',
    description: 'Object types you starred.',
    object_types: favoriteTypes,
    object_type_ids: favoriteTypes.map((type) => type.id),
  };
}

function sectionsForSelection(
  groups: ExplorerGroup[],
  favoriteTypeIds: Set<string>,
  selection: SideNavSelection,
): ExplorerGroup[] {
  if (selection.kind === 'favorites') {
    const fav = buildFavoritesGroup(groups, favoriteTypeIds);
    return fav ? [fav] : [];
  }
  if (selection.kind === 'group') {
    return groups.filter((group) => group.id === selection.groupId);
  }
  // 'all' (and any other browse selection that should show everything)
  const fav = buildFavoritesGroup(groups, favoriteTypeIds);
  return fav ? [fav, ...groups] : groups;
}

export function BrowseGroupsGrid({
  groups,
  linkTypes,
  accessForType,
  onBrowse,
  onPreviewType,
  favoriteTypeIds,
  onToggleFavorite,
  selection,
  countsByType,
}: BrowseGroupsGridProps) {
  const [viewByGroup, setViewByGroup] = useState<Record<string, GroupView>>({});
  const [hiddenGroupIds, setHiddenGroupIds] = useState<Set<string>>(() => new Set());
  const sections = sectionsForSelection(groups, favoriteTypeIds, selection).filter(
    (group) => !hiddenGroupIds.has(group.id),
  );

  function viewFor(groupId: string): GroupView {
    return viewByGroup[groupId] ?? 'list';
  }

  if (sections.length === 0) {
    return (
      <p className="oe-browse__empty">
        {selection.kind === 'favorites'
          ? 'No favorite object types yet. Click ☆ on a type to add it.'
          : 'No visible object type groups.'}
      </p>
    );
  }

  return (
    <div className="oe-browse">
      {sections.map((group) => {
        const view = viewFor(group.id);
        const isFavoritesSection = group.id === FAVORITES_GROUP_ID;
        return (
          <section key={group.id} className="oe-browse-group" aria-label={group.display_name}>
            <header className="oe-browse-group__header">
              <div className="oe-browse-group__title">
                <span className="oe-eyebrow">{group.display_name}</span>
                <span className="oe-chip">{group.object_types.length}</span>
              </div>
              <ListGraphToggle
                value={view}
                onChange={(next) => setViewByGroup((current) => ({ ...current, [group.id]: next }))}
              />
            </header>

            {view === 'list' ? (
              <div className="oe-browse-group__grid">
                {group.object_types.map((type) => (
                  <ObjectTypeCard
                    key={type.id}
                    type={type}
                    count={countsByType?.get(type.id)}
                    showDescription={isFavoritesSection}
                    favorited={favoriteTypeIds.has(type.id)}
                    disabled={!accessForType(type.id).can_view_instances}
                    accessReason={accessForType(type.id).reason}
                    onBrowse={() => onBrowse(type.id)}
                    onPreview={() => onPreviewType(type.id)}
                    onToggleFavorite={() => onToggleFavorite(type.id)}
                  />
                ))}
              </div>
            ) : (
              <GroupGraphView
                groupDisplayName={group.display_name}
                objectTypes={group.object_types}
                linkTypes={linkTypes}
                onPreviewType={onPreviewType}
                onExploreType={onBrowse}
                onRemoveGroup={
                  group.id === FAVORITES_GROUP_ID
                    ? undefined
                    : () => setHiddenGroupIds((current) => new Set(current).add(group.id))
                }
              />
            )}
          </section>
        );
      })}
    </div>
  );
}

function ListGraphToggle({ value, onChange }: { value: GroupView; onChange: (next: GroupView) => void }) {
  return (
    <div className="oe-toggle" role="group" aria-label="Group view">
      <button
        type="button"
        className="oe-toggle__btn"
        aria-pressed={value === 'list'}
        onClick={() => onChange('list')}
      >
        <ListGlyph />
        List
      </button>
      <button
        type="button"
        className="oe-toggle__btn"
        aria-pressed={value === 'graph'}
        onClick={() => onChange('graph')}
      >
        <GraphGlyph />
        Graph
      </button>
    </div>
  );
}

interface ObjectTypeCardProps {
  type: ObjectType;
  count: number | undefined;
  showDescription: boolean;
  favorited: boolean;
  disabled: boolean;
  accessReason?: string;
  onBrowse: () => void;
  onPreview: () => void;
  onToggleFavorite: () => void;
}

function ObjectTypeCard({
  type,
  count,
  showDescription,
  favorited,
  disabled,
  accessReason,
  onBrowse,
  onPreview,
  onToggleFavorite,
}: ObjectTypeCardProps) {
  const name = type.display_name || type.name;
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      data-disabled={disabled}
      className="oe-type-card"
      onClick={() => (disabled ? undefined : onBrowse())}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onBrowse();
        }
      }}
      title={disabled ? accessReason : `Explore ${name}`}
    >
      <span
        className="oe-type-icon"
        style={{ background: iconBackground(type.id, type.color) }}
        aria-hidden="true"
      >
        {initialFor(name)}
      </span>
      <div className="oe-type-card__body">
        <div className="oe-type-card__title-row">
          <span className="oe-type-card__title">{name}</span>
          {count !== undefined && <span className="oe-chip">{formatCount(count)}</span>}
        </div>
        {showDescription && type.description ? (
          <p className="oe-type-card__description">{type.description}</p>
        ) : null}
      </div>
      <div className="oe-type-card__actions" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="oe-type-card__icon-btn"
          aria-label={`Preview ${name}`}
          data-tooltip="Preview"
          onClick={onPreview}
        >
          <InfoGlyph />
        </button>
        <button
          type="button"
          className="oe-type-card__icon-btn oe-type-card__fav"
          aria-pressed={favorited}
          data-active={favorited}
          aria-label={favorited ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
          onClick={onToggleFavorite}
        >
          {favorited ? <StarFilledGlyph /> : <StarOutlineGlyph />}
        </button>
      </div>
    </div>
  );
}

function initialFor(name: string) {
  const cleaned = name.replace(/^\[[^\]]+\]\s*/, '').trim();
  return (cleaned.charAt(0) || '?').toUpperCase();
}

function formatCount(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(2).replace(/\.?0+$/, '')}k`;
  return `${value}`;
}

function ListGlyph() {
  return (
    <svg className="oe-toggle__icon" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="3" width="12" height="2" rx="0.5" fill="currentColor" />
      <rect x="2" y="7" width="12" height="2" rx="0.5" fill="currentColor" />
      <rect x="2" y="11" width="12" height="2" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function GraphGlyph() {
  return (
    <svg className="oe-toggle__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="4" cy="4" r="1.8" fill="currentColor" />
      <circle cx="12" cy="4" r="1.8" fill="currentColor" />
      <circle cx="8" cy="12" r="1.8" fill="currentColor" />
      <path d="M4 4l4 8M12 4l-4 8M4 4h8" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function InfoGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="5" r="0.9" fill="currentColor" />
      <path d="M8 7v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function StarOutlineGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="m8 2 1.86 3.78 4.14.6-3 2.93.71 4.13L8 11.43 4.29 13.4 5 9.31 2 6.38l4.14-.6L8 2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StarFilledGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="m8 2 1.86 3.78 4.14.6-3 2.93.71 4.13L8 11.43 4.29 13.4 5 9.31 2 6.38l4.14-.6L8 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

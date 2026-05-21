import type { ObjectType, SearchResult } from '@/lib/api/ontology';

import { iconBackground } from '../iconPalette';
import { SearchResultRow } from './SearchResultRow';

export interface SearchResultObjectsSectionProps {
  results: SearchResult[];
  typeById: Map<string, ObjectType>;
  query: string;
  initialRowsPerType?: number;
  onOpenResult: (result: SearchResult) => void;
  onExploreType: (typeId: string) => void;
  onViewAllObjects: () => void;
  onSearchAround?: (result: SearchResult, anchor: HTMLElement) => void;
  favoriteResultIds?: Set<string>;
  onToggleFavorite?: (result: SearchResult) => void;
}

const DEFAULT_ROWS_PER_TYPE = 2;

export function SearchResultObjectsSection({
  results,
  typeById,
  query,
  initialRowsPerType = DEFAULT_ROWS_PER_TYPE,
  onOpenResult,
  onExploreType,
  onViewAllObjects,
  onSearchAround,
  favoriteResultIds,
  onToggleFavorite,
}: SearchResultObjectsSectionProps) {
  const grouped = groupByType(results);

  if (grouped.length === 0) {
    return (
      <section className="oe-search__panel" aria-label="Objects results">
        <span className="oe-search__pill">Objects</span>
        <p className="oe-search__empty">No matching objects.</p>
      </section>
    );
  }

  const totalObjects = results.length;

  return (
    <section className="oe-search__panel" aria-label="Objects results">
      <span className="oe-search__pill">Objects</span>
      {grouped.map(({ typeId, items }) => {
        const type = typeId ? typeById.get(typeId) : undefined;
        const displayName = type?.display_name || type?.name || typeId || 'Unknown';
        const exploreLabel = type
          ? `Explore all ${items.length} ${type.display_name || type.name}${items.length === 1 ? '' : 's'} ↗`
          : `Explore all ${items.length} ↗`;
        const visible = items.slice(0, initialRowsPerType);
        return (
          <div key={typeId ?? 'unknown'} className="oe-search-objects__group">
            <div className="oe-search-objects__head">
              <div className="oe-search-objects__head-left">
                {type && (
                  <span
                    className="oe-type-icon oe-type-icon--sm"
                    style={{ background: iconBackground(type.id, type.color) }}
                    aria-hidden="true"
                  >
                    {initialFor(displayName)}
                  </span>
                )}
                <span className="oe-search-objects__type-name">{displayName}</span>
                <span className="oe-chip">{items.length}</span>
              </div>
              {type && (
                <button
                  type="button"
                  className="oe-search-objects__explore-all"
                  onClick={() => onExploreType(type.id)}
                >
                  {exploreLabel}
                </button>
              )}
            </div>
            {type?.description && <p className="oe-search-objects__type-desc">{type.description}</p>}
            <ul className="oe-search-objects__rows">
              {visible.map((result) => (
                <li key={`${result.kind}-${result.id}`}>
                  <SearchResultRow
                    result={result}
                    type={type}
                    query={query}
                    favorited={favoriteResultIds?.has(result.id) ?? false}
                    onOpen={onOpenResult}
                    onSearchAround={onSearchAround}
                    onToggleFavorite={onToggleFavorite}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {totalObjects > 0 && (
        <div className="oe-search__footer">
          <button type="button" onClick={onViewAllObjects}>
            View all objects ›
          </button>
        </div>
      )}
    </section>
  );
}

function groupByType(results: SearchResult[]): Array<{ typeId: string | null; items: SearchResult[] }> {
  const buckets = new Map<string | null, SearchResult[]>();
  for (const result of results) {
    const key = result.object_type_id ?? null;
    const bucket = buckets.get(key) ?? [];
    bucket.push(result);
    buckets.set(key, bucket);
  }
  return Array.from(buckets.entries())
    .map(([typeId, items]) => ({ typeId, items }))
    .sort((left, right) => right.items.length - left.items.length);
}

function initialFor(name: string) {
  const cleaned = name.replace(/^\[[^\]]+\]\s*/, '').trim();
  return (cleaned.charAt(0) || '?').toUpperCase();
}

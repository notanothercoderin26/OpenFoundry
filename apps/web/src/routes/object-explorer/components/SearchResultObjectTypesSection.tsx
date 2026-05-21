import type { ObjectType, SearchResult } from '@/lib/api/ontology';

import { highlightTerms } from '@/lib/text/highlight';

import { iconBackground } from '../iconPalette';

export interface SearchResultObjectTypesSectionProps {
  results: SearchResult[];
  typeById: Map<string, ObjectType>;
  countsByType?: Map<string, number>;
  query: string;
  onSelectType: (typeId: string) => void;
  onViewAllObjectTypes: () => void;
}

export function SearchResultObjectTypesSection({
  results,
  typeById,
  countsByType,
  query,
  onSelectType,
  onViewAllObjectTypes,
}: SearchResultObjectTypesSectionProps) {
  const cards = results
    .map((result) => {
      const type = typeById.get(result.id);
      if (!type) return null;
      return { result, type };
    })
    .filter((entry): entry is { result: SearchResult; type: ObjectType } => Boolean(entry));

  if (cards.length === 0) {
    return (
      <section className="oe-search__panel" aria-label="Object types results">
        <span className="oe-search__pill">Object types</span>
        <p className="oe-search__empty">No matching object types.</p>
      </section>
    );
  }

  return (
    <section className="oe-search__panel" aria-label="Object types results">
      <span className="oe-search__pill">Object types</span>
      {cards.map(({ result, type }) => {
        const name = type.display_name || type.name;
        const count = countsByType?.get(type.id);
        return (
          <div key={type.id} className="oe-search-types__group">
            <p className="oe-search-types__eyebrow">
              {name}
              <span className="oe-chip">{result.metadata?.row_count ? `${result.metadata.row_count}` : '1'}</span>
            </p>
            <button
              type="button"
              className="oe-search-types__card"
              onClick={() => onSelectType(type.id)}
            >
              <span
                className="oe-type-icon oe-type-icon--lg"
                style={{ background: iconBackground(type.id, type.color) }}
                aria-hidden="true"
              >
                {initialFor(name)}
              </span>
              <div className="oe-search-types__card-body">
                <div className="oe-search-types__card-title">
                  <span className="oe-search-types__card-name">{highlightTerms(name, query)}</span>
                  {count !== undefined && <span className="oe-chip">{formatCount(count)}</span>}
                </div>
                {type.description && (
                  <p className="oe-search-types__card-desc">{highlightTerms(type.description, query)}</p>
                )}
              </div>
            </button>
          </div>
        );
      })}
      <div className="oe-search__footer">
        <button type="button" onClick={onViewAllObjectTypes}>
          View all object types ›
        </button>
      </div>
    </section>
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

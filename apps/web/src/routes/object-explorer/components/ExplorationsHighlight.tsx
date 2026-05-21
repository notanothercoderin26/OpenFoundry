import {
  objectExplorerSavedArtifactKind,
  type ObjectSetDefinition,
  type ObjectType,
} from '@/lib/api/ontology';

import { iconBackground } from '../iconPalette';
import './ExplorationsHighlight.css';

export interface ExplorationsHighlightProps {
  objectSets: ObjectSetDefinition[];
  typeById: Map<string, ObjectType>;
  onOpen: (set: ObjectSetDefinition) => void;
  /** Maximum cards rendered in the highlight grid. Excess sets are
   *  reachable from the sidebar's "My explorations & lists" entry. */
  limit?: number;
}

const DEFAULT_LIMIT = 6;

export function ExplorationsHighlight({
  objectSets,
  typeById,
  onOpen,
  limit = DEFAULT_LIMIT,
}: ExplorationsHighlightProps) {
  if (objectSets.length === 0) return null;
  const featured = objectSets.slice(0, limit);

  return (
    <section className="oe-highlight" aria-label="My explorations and lists">
      <div className="oe-eyebrow-divider">
        <span className="oe-eyebrow">My explorations &amp; lists</span>
        <span className="oe-chip">{objectSets.length}</span>
      </div>
      <div className="oe-highlight__grid">
        {featured.map((set) => {
          const type = typeById.get(set.base_object_type_id);
          const kind = objectExplorerSavedArtifactKind(set);
          return (
            <button
              key={set.id}
              type="button"
              className="oe-card oe-highlight__card"
              onClick={() => onOpen(set)}
              title={type?.display_name || set.base_object_type_id}
            >
              <span
                className="oe-type-icon"
                style={{ background: iconBackground(set.base_object_type_id, type?.color ?? null) }}
                aria-hidden="true"
              >
                {kind === 'list' ? <ListGlyph /> : <ExploreGlyph />}
              </span>
              <span className="oe-highlight__card-label">{set.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ListGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="3" width="12" height="2" rx="0.5" fill="currentColor" />
      <rect x="2" y="7" width="12" height="2" rx="0.5" fill="currentColor" />
      <rect x="2" y="11" width="12" height="2" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function ExploreGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

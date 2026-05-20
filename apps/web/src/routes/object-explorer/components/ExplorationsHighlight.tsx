import {
  objectExplorerSavedArtifactKind,
  type ObjectSetDefinition,
  type ObjectType,
} from '@/lib/api/ontology';

import { EmptyState, PanelHeader } from './atoms';
import { numberFormatter } from '../state';

interface ExplorationsHighlightProps {
  objectSets: ObjectSetDefinition[];
  typeById: Map<string, ObjectType>;
  onOpen: (set: ObjectSetDefinition) => void;
  onSeeAll: () => void;
}

export function ExplorationsHighlight({ objectSets, typeById, onOpen, onSeeAll }: ExplorationsHighlightProps) {
  const featured = objectSets.slice(0, 6);
  return (
    <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <PanelHeader label="My explorations & lists" value={`${objectSets.length}`} />
        {objectSets.length > featured.length && (
          <button type="button" className="of-button of-button--ghost" onClick={onSeeAll} style={{ fontSize: 12 }}>
            See all
          </button>
        )}
      </div>
      {featured.length === 0 ? (
        <EmptyState label="Save an exploration or list from the Objects tab to see it pinned here." compact />
      ) : (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
          {featured.map((set) => {
            const typeLabel = typeById.get(set.base_object_type_id)?.display_name ?? set.base_object_type_id;
            const kind = objectExplorerSavedArtifactKind(set);
            return (
              <button
                key={set.id}
                type="button"
                onClick={() => onOpen(set)}
                className="of-panel-muted"
                style={{ padding: 10, display: 'grid', gap: 6, textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border-subtle)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {set.name}
                  </strong>
                  <span className="of-chip">{kind}</span>
                </div>
                <p className="of-text-muted" style={{ margin: 0, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {typeLabel}
                </p>
                <span className="of-text-muted" style={{ fontSize: 11 }}>
                  {numberFormatter.format(set.materialized_row_count)} rows
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

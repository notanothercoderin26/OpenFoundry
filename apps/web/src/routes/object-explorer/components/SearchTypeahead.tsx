import type { ObjectSetDefinition, ObjectType } from '@/lib/api/ontology';

import type { RecentItem } from '../state';

export interface TypeaheadEntry {
  kind: 'type' | 'set' | 'recent';
  id: string;
  label: string;
  sublabel?: string;
  onSelect: () => void;
}

interface SearchTypeaheadProps {
  query: string;
  open: boolean;
  types: ObjectType[];
  savedSets: ObjectSetDefinition[];
  recents: RecentItem[];
  onSelectType: (typeId: string) => void;
  onSelectSavedSet: (set: ObjectSetDefinition) => void;
  onSelectRecent: (item: RecentItem) => void;
  onSearchAll: () => void;
}

const MAX_PER_GROUP = 6;

function matches(needle: string, haystack: string | null | undefined) {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function SearchTypeahead({
  query,
  open,
  types,
  savedSets,
  recents,
  onSelectType,
  onSelectSavedSet,
  onSelectRecent,
  onSearchAll,
}: SearchTypeaheadProps) {
  const trimmed = query.trim();
  if (!open || trimmed.length < 1) return null;

  const matchingTypes = types
    .filter((type) => matches(trimmed, type.display_name) || matches(trimmed, type.name))
    .slice(0, MAX_PER_GROUP);
  const matchingSets = savedSets
    .filter((set) => matches(trimmed, set.name) || matches(trimmed, set.description))
    .slice(0, MAX_PER_GROUP);
  const matchingRecents = recents
    .filter((item) => matches(trimmed, item.title) || matches(trimmed, item.id))
    .slice(0, MAX_PER_GROUP);

  const total = matchingTypes.length + matchingSets.length + matchingRecents.length;

  return (
    <div
      className="of-panel"
      style={{
        position: 'absolute',
        top: 'calc(100% + 4px)',
        left: 0,
        right: 0,
        zIndex: 30,
        padding: 6,
        display: 'grid',
        gap: 4,
        maxHeight: 360,
        overflow: 'auto',
        boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
      }}
      role="listbox"
    >
      <button
        type="button"
        className="of-button"
        onMouseDown={(event) => {
          event.preventDefault();
          onSearchAll();
        }}
        style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '6px 8px' }}
      >
        Search for "<strong>{trimmed}</strong>"
      </button>

      {matchingTypes.length > 0 && (
        <>
          <p className="of-eyebrow" style={{ margin: '6px 4px 2px' }}>Object types</p>
          {matchingTypes.map((type) => (
            <button
              key={`type-${type.id}`}
              type="button"
              className="of-button of-button--ghost"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelectType(type.id);
              }}
              style={{ justifyContent: 'space-between', textAlign: 'left', padding: '4px 8px', minHeight: 28 }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {type.display_name || type.name}
              </span>
              <span className="of-text-muted" style={{ fontSize: 11 }}>{type.name}</span>
            </button>
          ))}
        </>
      )}

      {matchingSets.length > 0 && (
        <>
          <p className="of-eyebrow" style={{ margin: '6px 4px 2px' }}>Saved explorations</p>
          {matchingSets.map((set) => (
            <button
              key={`set-${set.id}`}
              type="button"
              className="of-button of-button--ghost"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelectSavedSet(set);
              }}
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '4px 8px', minHeight: 28 }}
            >
              {set.name}
            </button>
          ))}
        </>
      )}

      {matchingRecents.length > 0 && (
        <>
          <p className="of-eyebrow" style={{ margin: '6px 4px 2px' }}>Recent objects</p>
          {matchingRecents.map((item) => (
            <button
              key={`recent-${item.kind}-${item.id}`}
              type="button"
              className="of-button of-button--ghost"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelectRecent(item);
              }}
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '4px 8px', minHeight: 28 }}
            >
              {item.title}
            </button>
          ))}
        </>
      )}

      {total === 0 && (
        <p className="of-text-muted" style={{ margin: '6px 4px', fontSize: 12 }}>
          No type-ahead matches. Press Enter to run a full search.
        </p>
      )}
    </div>
  );
}

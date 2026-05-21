import type { ObjectSetDefinition, ObjectType } from '@/lib/api/ontology';

import { iconBackground } from '../iconPalette';
import type { RecentItem } from '../state';
import './SearchTypeahead.css';

export interface SearchTypeaheadProps {
  query: string;
  open: boolean;
  types: ObjectType[];
  savedSets: ObjectSetDefinition[];
  recents: RecentItem[];
  onSelectType: (typeId: string) => void;
  onSelectSavedSet: (set: ObjectSetDefinition) => void;
  onSelectRecent: (item: RecentItem) => void;
  onSearchAll: () => void;
  /** Maximum suggestion rows rendered below the "Search for" action. */
  maxSuggestions?: number;
}

type Suggestion =
  | { kind: 'type'; type: ObjectType }
  | { kind: 'set'; set: ObjectSetDefinition }
  | { kind: 'recent'; item: RecentItem };

const DEFAULT_MAX_SUGGESTIONS = 6;

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
  maxSuggestions = DEFAULT_MAX_SUGGESTIONS,
}: SearchTypeaheadProps) {
  const trimmed = query.trim();
  if (!open || trimmed.length < 1) return null;

  const typeSuggestions: Suggestion[] = types
    .filter((type) => matches(trimmed, type.display_name) || matches(trimmed, type.name))
    .map((type) => ({ kind: 'type' as const, type }));
  const setSuggestions: Suggestion[] = savedSets
    .filter((set) => matches(trimmed, set.name) || matches(trimmed, set.description))
    .map((set) => ({ kind: 'set' as const, set }));
  const recentSuggestions: Suggestion[] = recents
    .filter((item) => matches(trimmed, item.title) || matches(trimmed, item.id))
    .map((item) => ({ kind: 'recent' as const, item }));

  const merged = [...typeSuggestions, ...setSuggestions, ...recentSuggestions];
  const suggestions = merged.slice(0, maxSuggestions);
  const overflow = merged.length > suggestions.length;

  return (
    <div className="oe oe-popover oe-typeahead" role="listbox" aria-label="Search suggestions">
      <button
        type="button"
        className="oe-typeahead__row oe-typeahead__row--search"
        onMouseDown={(event) => {
          event.preventDefault();
          onSearchAll();
        }}
      >
        <span className="oe-typeahead__icon" style={{ background: 'transparent' }} aria-hidden="true">
          <SearchGlyph />
        </span>
        <span className="oe-typeahead__label">
          <span className="oe-typeahead__label-text">
            Search for "<strong>{trimmed}</strong>"
          </span>
        </span>
      </button>

      {suggestions.map((suggestion) => (
        <SuggestionRow
          key={suggestionKey(suggestion)}
          suggestion={suggestion}
          onSelectType={onSelectType}
          onSelectSavedSet={onSelectSavedSet}
          onSelectRecent={onSelectRecent}
        />
      ))}

      {merged.length === 0 && (
        <p className="oe-typeahead__empty">No type-ahead matches. Press Enter to run a full search.</p>
      )}

      {overflow && (
        <div className="oe-typeahead__footer">
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              onSearchAll();
            }}
          >
            View all results →
          </button>
        </div>
      )}
    </div>
  );
}

function suggestionKey(suggestion: Suggestion) {
  if (suggestion.kind === 'type') return `type:${suggestion.type.id}`;
  if (suggestion.kind === 'set') return `set:${suggestion.set.id}`;
  return `recent:${suggestion.item.kind}:${suggestion.item.id}`;
}

interface SuggestionRowProps {
  suggestion: Suggestion;
  onSelectType: (typeId: string) => void;
  onSelectSavedSet: (set: ObjectSetDefinition) => void;
  onSelectRecent: (item: RecentItem) => void;
}

function SuggestionRow({
  suggestion,
  onSelectType,
  onSelectSavedSet,
  onSelectRecent,
}: SuggestionRowProps) {
  if (suggestion.kind === 'type') {
    const { type } = suggestion;
    const name = type.display_name || type.name;
    const status = (type.status ?? '').toLowerCase();
    return (
      <button
        type="button"
        className="oe-typeahead__row"
        onMouseDown={(event) => {
          event.preventDefault();
          onSelectType(type.id);
        }}
      >
        <span
          className="oe-typeahead__icon"
          style={{ background: iconBackground(type.id, type.color) }}
          aria-hidden="true"
        >
          {initialFor(name)}
        </span>
        <span className="oe-typeahead__label">
          <span className="oe-typeahead__label-text">{name}</span>
          {status === 'experimental' && (
            <span className="oe-typeahead__badge" data-kind="experimental">Experimental</span>
          )}
          {status === 'deprecated' && (
            <span className="oe-typeahead__badge" data-kind="deprecated">Deprecated</span>
          )}
        </span>
      </button>
    );
  }
  if (suggestion.kind === 'set') {
    const { set } = suggestion;
    return (
      <button
        type="button"
        className="oe-typeahead__row"
        onMouseDown={(event) => {
          event.preventDefault();
          onSelectSavedSet(set);
        }}
      >
        <span
          className="oe-typeahead__icon"
          style={{ background: iconBackground(set.base_object_type_id) }}
          aria-hidden="true"
        >
          <ListGlyph />
        </span>
        <span className="oe-typeahead__label">
          <span className="oe-typeahead__label-text">{set.name}</span>
        </span>
      </button>
    );
  }
  const { item } = suggestion;
  return (
    <button
      type="button"
      className="oe-typeahead__row"
      onMouseDown={(event) => {
        event.preventDefault();
        onSelectRecent(item);
      }}
    >
      <span
        className="oe-typeahead__icon"
        style={{ background: iconBackground(item.objectTypeId ?? item.id) }}
        aria-hidden="true"
      >
        <ClockGlyph />
      </span>
      <span className="oe-typeahead__label">
        <span className="oe-typeahead__label-text">{item.title}</span>
      </span>
    </button>
  );
}

function initialFor(name: string) {
  const cleaned = name.replace(/^\[[^\]]+\]\s*/, '').trim();
  return (cleaned.charAt(0) || '?').toUpperCase();
}

function SearchGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ListGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="3" width="12" height="2" rx="0.5" fill="currentColor" />
      <rect x="2" y="7" width="12" height="2" rx="0.5" fill="currentColor" />
      <rect x="2" y="11" width="12" height="2" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function ClockGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

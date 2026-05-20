import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { ObjectSetDefinition, ObjectType } from '@/lib/api/ontology';
import type { buildObjectExplorerTypeGroups } from '@/lib/api/ontology';

import { MetricCard } from './atoms';
import { ScopeFilter } from './ScopeFilter';
import { SearchTypeahead } from './SearchTypeahead';
import { SEARCH_KINDS, numberFormatter, type RecentItem, type SearchMode } from '../state';

type ExplorerGroup = ReturnType<typeof buildObjectExplorerTypeGroups>[number];

interface HeaderToolbarProps {
  visibleObjectTypes: ObjectType[];
  visibleObjectSets: ObjectSetDefinition[];
  searchResultsCount: number;
  visibleRecents: RecentItem[];
  groups: ExplorerGroup[];
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  searchMode: SearchMode;
  setSearchMode: (mode: SearchMode) => void;
  searchKindFilter: string;
  setSearchKindFilter: (value: string) => void;
  scopeTypeIds: Set<string>;
  setScopeTypeIds: (next: Set<string>) => void;
  searchLoading: boolean;
  onRunSearch: () => void;
  onSelectTypeFromTypeahead: (typeId: string) => void;
  onSelectSavedSetFromTypeahead: (set: ObjectSetDefinition) => void;
  onSelectRecentFromTypeahead: (item: RecentItem) => void;
  directOpenTypeId: string;
  setDirectOpenTypeId: (value: string) => void;
  directOpenObjectId: string;
  setDirectOpenObjectId: (value: string) => void;
  onOpenDirectObject: () => void;
}

export function HeaderToolbar({
  visibleObjectTypes,
  visibleObjectSets,
  searchResultsCount,
  visibleRecents,
  groups,
  searchQuery,
  setSearchQuery,
  searchMode,
  setSearchMode,
  searchKindFilter,
  setSearchKindFilter,
  scopeTypeIds,
  setScopeTypeIds,
  searchLoading,
  onRunSearch,
  onSelectTypeFromTypeahead,
  onSelectSavedSetFromTypeahead,
  onSelectRecentFromTypeahead,
  directOpenTypeId,
  setDirectOpenTypeId,
  directOpenObjectId,
  setDirectOpenObjectId,
  onOpenDirectObject,
}: HeaderToolbarProps) {
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <header className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 280 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <Link to="/ontology" className="of-link" style={{ fontSize: 12 }}>
              Ontology
            </Link>
            <span className="of-text-muted">/</span>
            <span className="of-text-muted" style={{ fontSize: 12 }}>Object explorer</span>
          </div>
          <h1 className="of-heading-xl" style={{ marginTop: 8 }}>
            Object explorer
          </h1>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link to="/ontology/graph" className="of-button">Graph</Link>
          <Link to="/ontology/object-sets" className="of-button">Object sets</Link>
          <Link to="/object-views" className="of-button">Views</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))' }}>
        <MetricCard label="Visible types" value={numberFormatter.format(visibleObjectTypes.length)} />
        <MetricCard label="Saved explorations" value={numberFormatter.format(visibleObjectSets.length)} />
        <MetricCard label="Results" value={numberFormatter.format(searchResultsCount)} />
        <MetricCard label="Recent" value={numberFormatter.format(visibleRecents.length)} />
      </div>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(min(100%, 360px), 1fr) repeat(3, minmax(min(100%, 150px), auto))', alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search objects, actions, links"
            className="of-input"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setSearchFocused(false);
                onRunSearch();
              } else if (event.key === 'Escape') {
                setSearchFocused(false);
              }
            }}
          />
          <SearchTypeahead
            query={searchQuery}
            open={searchFocused}
            types={visibleObjectTypes}
            savedSets={visibleObjectSets}
            recents={visibleRecents}
            onSelectType={(typeId) => {
              setSearchFocused(false);
              onSelectTypeFromTypeahead(typeId);
            }}
            onSelectSavedSet={(set) => {
              setSearchFocused(false);
              onSelectSavedSetFromTypeahead(set);
            }}
            onSelectRecent={(item) => {
              setSearchFocused(false);
              onSelectRecentFromTypeahead(item);
            }}
            onSearchAll={() => {
              setSearchFocused(false);
              onRunSearch();
            }}
          />
        </div>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', minHeight: 30 }}>
          {(['lexical', 'semantic'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSearchMode(mode)}
              className={searchMode === mode ? 'of-button of-button--primary' : 'of-button of-button--ghost'}
              style={{ border: 0, borderRadius: 0, minWidth: 76 }}
            >
              {mode === 'lexical' ? 'Lexical' : 'Semantic'}
            </button>
          ))}
        </div>
        <select value={searchKindFilter} onChange={(event) => setSearchKindFilter(event.target.value)} className="of-input">
          {SEARCH_KINDS.map((kind) => (
            <option key={kind.value} value={kind.value}>{kind.label}</option>
          ))}
        </select>
        <ScopeFilter
          groups={groups}
          visibleObjectTypes={visibleObjectTypes}
          selectedTypeIds={scopeTypeIds}
          onChangeSelected={setScopeTypeIds}
        />
        <button
          type="button"
          onClick={onRunSearch}
          disabled={searchLoading || !searchQuery.trim()}
          className="of-button of-button--primary"
        >
          {searchLoading ? 'Searching' : 'Search'}
        </button>
      </div>

      <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(min(100%, 180px), 220px) minmax(min(100%, 220px), 1fr) auto', alignItems: 'center' }}>
        <select value={directOpenTypeId} onChange={(event) => setDirectOpenTypeId(event.target.value)} className="of-input">
          {visibleObjectTypes.map((type) => (
            <option key={type.id} value={type.id}>{type.display_name || type.name}</option>
          ))}
        </select>
        <input
          value={directOpenObjectId}
          onChange={(event) => setDirectOpenObjectId(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') onOpenDirectObject(); }}
          placeholder="Object primary key or ID"
          className="of-input"
        />
        <button
          type="button"
          onClick={onOpenDirectObject}
          disabled={!directOpenTypeId || !directOpenObjectId.trim()}
          className="of-button"
        >
          Open Object View
        </button>
      </div>
    </header>
  );
}

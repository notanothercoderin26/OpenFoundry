import { useState } from 'react';

import type { buildObjectExplorerTypeGroups, ObjectSetDefinition, ObjectType } from '@/lib/api/ontology';

import { ScopeFilter } from './ScopeFilter';
import { SearchTypeahead } from './SearchTypeahead';
import type { RecentItem } from '../state';
import './ExplorerHero.css';

type ExplorerGroup = ReturnType<typeof buildObjectExplorerTypeGroups>[number];

export interface ExplorerHeroProps {
  visibleObjectTypes: ObjectType[];
  visibleObjectSets: ObjectSetDefinition[];
  visibleRecents: RecentItem[];
  groups: ExplorerGroup[];
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  scopeTypeIds: Set<string>;
  setScopeTypeIds: (next: Set<string>) => void;
  onRunSearch: () => void;
  onSelectTypeFromTypeahead: (typeId: string) => void;
  onSelectSavedSetFromTypeahead: (set: ObjectSetDefinition) => void;
  onSelectRecentFromTypeahead: (item: RecentItem) => void;
  onClickExplore?: () => void;
  onClickResults?: () => void;
}

export function ExplorerHero({
  visibleObjectTypes,
  visibleObjectSets,
  visibleRecents,
  groups,
  searchQuery,
  setSearchQuery,
  scopeTypeIds,
  setScopeTypeIds,
  onRunSearch,
  onSelectTypeFromTypeahead,
  onSelectSavedSetFromTypeahead,
  onSelectRecentFromTypeahead,
  onClickExplore,
  onClickResults,
}: ExplorerHeroProps) {
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <header className="oe-hero">
      <h1 className="oe-hero-title">Explore your data</h1>
      <p className="oe-hero-subtitle">
        Select an object type from the list below to{' '}
        <button type="button" className="oe-hero__inline-link" onClick={onClickExplore}>
          <ChartIcon /> explore
        </button>{' '}
        or view{' '}
        <button type="button" className="oe-hero__inline-link" onClick={onClickResults}>
          <ListIcon /> results
        </button>
      </p>

      <div className="oe-hero__searchbar" data-focused={searchFocused}>
        <div className="oe-hero__searchbar-scope">
          <ScopeFilter
            groups={groups}
            visibleObjectTypes={visibleObjectTypes}
            selectedTypeIds={scopeTypeIds}
            onChangeSelected={setScopeTypeIds}
          />
        </div>
        <span className="oe-hero__searchbar-divider" />
        <span className="oe-hero__searchbar-icon" aria-hidden="true">
          <SearchIcon />
        </span>
        <div className="oe-hero__searchbar-input-wrap">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search object types and properties…"
            className="oe-hero__searchbar-input"
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
        <button
          type="button"
          className="oe-hero__searchbar-help"
          aria-label="Search syntax help"
          title="Search syntax help"
        >
          <HelpIcon />
        </button>
      </div>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 14h12M4 11V6M8 11V3M12 11V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="2" rx="0.5" fill="currentColor" />
      <rect x="2" y="7" width="12" height="2" rx="0.5" fill="currentColor" />
      <rect x="2" y="11" width="12" height="2" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6 6.2c0-1.1.9-2 2-2s2 .9 2 2c0 1-.7 1.4-1.4 1.8-.4.3-.6.6-.6 1.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="8" cy="12" r="0.8" fill="currentColor" />
    </svg>
  );
}

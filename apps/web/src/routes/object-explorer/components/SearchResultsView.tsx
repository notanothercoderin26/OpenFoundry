import { useMemo } from 'react';

import type { ObjectType, SearchResult } from '@/lib/api/ontology';

import { SearchResultArtifactsSection } from './SearchResultArtifactsSection';
import { SearchResultObjectsSection } from './SearchResultObjectsSection';
import { SearchResultObjectTypesSection } from './SearchResultObjectTypesSection';
import './SearchResultsView.css';

export type SearchResultsTab = 'overview' | 'objects' | 'types' | 'artifacts';

export interface SearchResultsViewProps {
  results: SearchResult[];
  typeById: Map<string, ObjectType>;
  query: string;
  activeTab: SearchResultsTab;
  countsByType?: Map<string, number>;
  favoriteTypeIds?: Set<string>;
  onOpenResult: (result: SearchResult) => void;
  onExploreType: (typeId: string) => void;
  onChangeActiveTab: (next: SearchResultsTab) => void;
  onSearchAround?: (result: SearchResult, anchor: HTMLElement) => void;
  favoriteResultIds?: Set<string>;
  onToggleFavorite?: (result: SearchResult) => void;
}

export function SearchResultsView({
  results,
  typeById,
  query,
  activeTab,
  countsByType,
  favoriteTypeIds,
  onOpenResult,
  onExploreType,
  onChangeActiveTab,
  onSearchAround,
  favoriteResultIds,
  onToggleFavorite,
}: SearchResultsViewProps) {
  const buckets = useMemo(() => bucketResults(results), [results]);

  return (
    <div className="oe-search">
      {(activeTab === 'overview' || activeTab === 'objects') && (
        <SearchResultObjectsSection
          results={buckets.objects}
          typeById={typeById}
          query={query}
          countsByType={countsByType}
          favoriteTypeIds={favoriteTypeIds}
          onOpenResult={onOpenResult}
          onExploreType={onExploreType}
          onViewAllObjects={() => onChangeActiveTab('objects')}
          onSearchAround={onSearchAround}
          favoriteResultIds={favoriteResultIds}
          onToggleFavorite={onToggleFavorite}
        />
      )}
      {(activeTab === 'overview' || activeTab === 'types') && (
        <SearchResultObjectTypesSection
          results={buckets.types}
          typeById={typeById}
          countsByType={countsByType}
          query={query}
          onSelectType={onExploreType}
          onViewAllObjectTypes={() => onChangeActiveTab('types')}
        />
      )}
      {(activeTab === 'overview' || activeTab === 'artifacts') && (
        <SearchResultArtifactsSection
          results={buckets.artifacts}
          query={query}
          onOpenResult={onOpenResult}
          onViewAllArtifacts={() => onChangeActiveTab('artifacts')}
        />
      )}
    </div>
  );
}

interface ResultBuckets {
  objects: SearchResult[];
  types: SearchResult[];
  artifacts: SearchResult[];
}

function bucketResults(results: SearchResult[]): ResultBuckets {
  const buckets: ResultBuckets = { objects: [], types: [], artifacts: [] };
  for (const result of results) {
    if (result.kind === 'object_instance') buckets.objects.push(result);
    else if (result.kind === 'object_type') buckets.types.push(result);
    else buckets.artifacts.push(result);
  }
  return buckets;
}

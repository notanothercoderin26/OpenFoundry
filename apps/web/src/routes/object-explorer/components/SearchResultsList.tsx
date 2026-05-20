import type { ObjectType, SearchResult } from '@/lib/api/ontology';

import { EmptyState, PanelHeader, SearchResultRow } from './atoms';
import { numberFormatter, type ExplorationContext } from '../state';

interface SearchResultsListProps {
  searchResults: SearchResult[];
  hasSearched: boolean;
  searchError: string;
  explorationContext: ExplorationContext | null;
  selectedResult: SearchResult | null;
  typeById: Map<string, ObjectType>;
  onPreview: (result: SearchResult) => void;
}

export function SearchResultsList({
  searchResults,
  hasSearched,
  searchError,
  explorationContext,
  selectedResult,
  typeById,
  onPreview,
}: SearchResultsListProps) {
  return (
    <>
      <PanelHeader label="Search results" value={hasSearched ? `${searchResults.length}` : 'Ready'} />

      {searchError && (
        <div className="of-status-danger" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          {searchError}
        </div>
      )}
      {explorationContext && (
        <div className="of-status-success" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <span>{explorationContext.label}</span>
          <span>{numberFormatter.format(explorationContext.source_object_ids.length)} source</span>
          <span>{numberFormatter.format(explorationContext.result_object_ids.length)} result</span>
        </div>
      )}

      <div style={{ display: 'grid', gap: 6, maxHeight: 520, overflow: 'auto' }}>
        {searchResults.map((result, index) => (
          <SearchResultRow
            key={`${result.kind}-${result.id}-${index}`}
            result={result}
            selected={selectedResult?.id === result.id && selectedResult.kind === result.kind}
            typeLabel={result.object_type_id ? typeById.get(result.object_type_id)?.display_name : undefined}
            onPreview={() => onPreview(result)}
          />
        ))}
        {searchResults.length === 0 && (
          <EmptyState label={hasSearched ? 'No matching resources.' : 'Run a search to populate the explorer.'} />
        )}
      </div>
    </>
  );
}

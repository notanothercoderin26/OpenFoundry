import type { SearchResult } from '@/lib/api/ontology';

import { highlightTerms } from '@/lib/text/highlight';

import { iconBackground } from '../iconPalette';
import type { SearchArtifactCategory } from './SideNavSearch';

export interface SearchResultArtifactsSectionProps {
  results: SearchResult[];
  query: string;
  onOpenResult: (result: SearchResult) => void;
  onViewAllArtifacts: () => void;
}

const CATEGORY_ORDER: SearchArtifactCategory[] = ['explorations', 'comparisons', 'modules'];

const CATEGORY_LABEL: Record<SearchArtifactCategory, string> = {
  explorations: 'Saved Explorations & Lists',
  comparisons: 'Comparison Views',
  modules: 'Modules',
};

function classifyArtifact(result: SearchResult): SearchArtifactCategory {
  switch (result.kind) {
    case 'comparison_view':
    case 'object_view_comparison':
      return 'comparisons';
    case 'workshop_module':
    case 'workshop_widget':
    case 'module':
      return 'modules';
    default:
      return 'explorations';
  }
}

export function SearchResultArtifactsSection({
  results,
  query,
  onOpenResult,
  onViewAllArtifacts,
}: SearchResultArtifactsSectionProps) {
  const byCategory = new Map<SearchArtifactCategory, SearchResult[]>();
  for (const result of results) {
    const category = classifyArtifact(result);
    const bucket = byCategory.get(category) ?? [];
    bucket.push(result);
    byCategory.set(category, bucket);
  }

  if (results.length === 0) {
    return (
      <section className="oe-search__panel" aria-label="Artifacts results">
        <span className="oe-search__pill">Artifacts</span>
        <p className="oe-search__empty">No matching artifacts.</p>
      </section>
    );
  }

  return (
    <section className="oe-search__panel" aria-label="Artifacts results">
      <span className="oe-search__pill">Artifacts</span>
      {CATEGORY_ORDER.map((category) => {
        const items = byCategory.get(category);
        if (!items || items.length === 0) return null;
        return (
          <div key={category} className="oe-search-artifacts__category">
            <p className="oe-search-artifacts__eyebrow">
              {CATEGORY_LABEL[category]}
              <span className="oe-chip">{items.length}</span>
            </p>
            <ul className="oe-search-artifacts__list">
              {items.map((result) => (
                <li key={`${result.kind}-${result.id}`}>
                  <button
                    type="button"
                    className="oe-search-artifacts__card"
                    onClick={() => onOpenResult(result)}
                  >
                    <span
                      className="oe-type-icon oe-type-icon--sm"
                      style={{ background: iconBackground(result.id) }}
                      aria-hidden="true"
                    >
                      {initialFor(result.title || result.id)}
                    </span>
                    <span className="oe-search-artifacts__card-label">
                      {highlightTerms(result.title || result.id, query)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <div className="oe-search__footer">
        <button type="button" onClick={onViewAllArtifacts}>
          View all artifacts ›
        </button>
      </div>
    </section>
  );
}

function initialFor(name: string) {
  const cleaned = (name || '?').replace(/^\[[^\]]+\]\s*/, '').trim();
  return (cleaned.charAt(0) || '?').toUpperCase();
}

import type { ObjectType, SearchResult } from '@/lib/api/ontology';

import { highlightTerms } from '@/lib/text/highlight';

import { iconBackground } from '../iconPalette';

export interface SearchResultRowProps {
  result: SearchResult;
  type: ObjectType | undefined;
  query: string;
  favorited?: boolean;
  onOpen: (result: SearchResult) => void;
  onSearchAround?: (result: SearchResult, anchor: HTMLElement) => void;
  onToggleFavorite?: (result: SearchResult) => void;
}

const KNOWN_NON_PROPERTY_KEYS = new Set(['snippet', 'route', 'score', 'kind']);

export function SearchResultRow({
  result,
  type,
  query,
  favorited = false,
  onOpen,
  onSearchAround,
  onToggleFavorite,
}: SearchResultRowProps) {
  const props = matchedProperties(result, query);
  const idText = result.id && result.id !== result.title ? ` (${result.id})` : '';
  const iconSeed = type?.id ?? result.object_type_id ?? result.id;
  const iconColor = type?.color ?? null;
  return (
    <div
      role="button"
      tabIndex={0}
      className="oe-search-row"
      onClick={() => onOpen(result)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(result);
        }
      }}
    >
      <span
        className="oe-search-row__icon oe-type-icon oe-type-icon--sm"
        style={{ background: iconBackground(iconSeed, iconColor) }}
        aria-hidden="true"
      >
        {initialFor(result.title || result.id)}
      </span>
      <div className="oe-search-row__body">
        <span className="oe-search-row__title">
          {highlightTerms(result.title || result.id, query)}
          {idText && <span className="oe-search-row__title-id">{idText}</span>}
        </span>
        {props.length > 0 ? (
          <p className="oe-search-row__props">
            {props.map(({ label, value }, index) => (
              <span key={`${label}-${index}`} className="oe-search-row__prop">
                <span className="oe-search-row__prop-label">{label}:</span>
                <span>{highlightTerms(value, query)}</span>
              </span>
            ))}
          </p>
        ) : result.snippet ? (
          <p className="oe-search-row__props">
            <span className="oe-search-row__prop">{highlightTerms(result.snippet, query)}</span>
          </p>
        ) : null}
      </div>
      <div className="oe-search-row__actions" onClick={(event) => event.stopPropagation()}>
        {onSearchAround && (
          <button
            type="button"
            className="oe-search-row__icon-btn"
            aria-label={`Search around ${result.title || result.id}`}
            title="Search around"
            onClick={(event) => onSearchAround(result, event.currentTarget)}
          >
            <LinkGlyph />
          </button>
        )}
        {onToggleFavorite && (
          <button
            type="button"
            className="oe-search-row__icon-btn"
            data-active={favorited}
            aria-pressed={favorited}
            aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
            title={favorited ? 'Remove favorite' : 'Add to favorites'}
            onClick={() => onToggleFavorite(result)}
          >
            {favorited ? <StarFilledGlyph /> : <StarOutlineGlyph />}
          </button>
        )}
      </div>
    </div>
  );
}

function initialFor(value: string) {
  const cleaned = (value || '?').replace(/^\[[^\]]+\]\s*/, '').trim();
  return (cleaned.charAt(0) || '?').toUpperCase();
}

function matchedProperties(result: SearchResult, query: string): Array<{ label: string; value: string }> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const out: Array<{ label: string; value: string }> = [];
  for (const [key, value] of Object.entries(result.metadata ?? {})) {
    if (KNOWN_NON_PROPERTY_KEYS.has(key)) continue;
    const flat = flattenValue(value);
    if (!flat) continue;
    if (!flat.toLowerCase().includes(needle)) continue;
    out.push({ label: humanizeLabel(key), value: flat });
    if (out.length >= 2) break;
  }
  return out;
}

function flattenValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function humanizeLabel(key: string) {
  return key.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function LinkGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 10a3 3 0 0 1 0-4l2-2a3 3 0 0 1 4 4l-1 1M10 6a3 3 0 0 1 0 4l-2 2a3 3 0 0 1-4-4l1-1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StarOutlineGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="m8 2 1.86 3.78 4.14.6-3 2.93.71 4.13L8 11.43 4.29 13.4 5 9.31 2 6.38l4.14-.6L8 2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StarFilledGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="m8 2 1.86 3.78 4.14.6-3 2.93.71 4.13L8 11.43 4.29 13.4 5 9.31 2 6.38l4.14-.6L8 2Z" fill="currentColor" />
    </svg>
  );
}

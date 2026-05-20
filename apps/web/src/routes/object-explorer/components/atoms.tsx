import { Link } from 'react-router-dom';

import type { SearchResult } from '@/lib/api/ontology';

export function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="of-panel-muted" style={{ padding: 10 }}>
      <p className="of-eyebrow">{label}</p>
      <p style={{ marginTop: 4, color: 'var(--text-strong)', fontSize: 18, fontWeight: 600 }}>{value}</p>
    </div>
  );
}

export function PanelHeader({ label, value }: { label: string; value?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <p className="of-eyebrow">{label}</p>
      {value && <span className="of-chip">{value}</span>}
    </div>
  );
}

export function EmptyState({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div
      className="of-text-muted"
      style={{
        padding: compact ? 10 : 24,
        textAlign: 'center',
        border: '1px dashed var(--border-default)',
        borderRadius: 'var(--radius-md)',
        fontSize: 12,
      }}
    >
      {label}
    </div>
  );
}

export function KeyValueGrid({ entries }: { entries: Array<[string, unknown]> }) {
  if (entries.length === 0) return <EmptyState label="No values." compact />;
  return (
    <dl style={{ display: 'grid', gap: 6, margin: '8px 0 0' }}>
      {entries.map(([key, value]) => (
        <div key={key} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 0.45fr) minmax(0, 1fr)', gap: 8, fontSize: 12 }}>
          <dt className="of-text-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {key}
          </dt>
          <dd style={{ margin: 0, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {formatValue(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function SearchResultRow({
  result,
  selected,
  typeLabel,
  onPreview,
}: {
  result: SearchResult;
  selected: boolean;
  typeLabel?: string;
  onPreview: () => void;
}) {
  return (
    <article
      className={selected ? 'of-panel' : 'of-panel-muted'}
      style={{ padding: 10, display: 'grid', gap: 8, borderColor: selected ? '#2d72d2' : undefined }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {result.title || result.id}
          </strong>
          <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>
            {typeLabel ? `${typeLabel} - ` : ''}
            {result.subtitle ?? result.kind}
          </p>
        </div>
        <span className="of-chip">{result.score.toFixed(2)}</span>
      </div>
      {result.snippet && (
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
          {result.snippet}
        </p>
      )}
      {result.score_breakdown && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <span className="of-chip">lex {result.score_breakdown.lexical_score.toFixed(2)}</span>
          <span className="of-chip">sem {result.score_breakdown.semantic_score.toFixed(2)}</span>
          <span className="of-chip">{result.score_breakdown.fusion_strategy}</span>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button type="button" onClick={onPreview} className={result.kind === 'object_instance' ? 'of-button of-button--primary' : 'of-button'}>
          {result.kind === 'object_instance' ? 'Preview' : 'Select'}
        </button>
        {result.route && (
          <Link to={result.route} className="of-button">
            Open
          </Link>
        )}
      </div>
    </article>
  );
}

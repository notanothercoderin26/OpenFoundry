import type { ObjectType } from '@/lib/api/ontology';

import type { PivotHistory } from '../pivotState';

interface PivotBreadcrumbProps {
  history: PivotHistory;
  typeById: Map<string, ObjectType>;
  onRollback: (index: number) => void;
  onClear: () => void;
  disabled?: boolean;
}

function typeLabel(typeById: Map<string, ObjectType>, typeId: string): string {
  const entry = typeById.get(typeId);
  return entry?.display_name || entry?.name || typeId;
}

export function PivotBreadcrumb({ history, typeById, onRollback, onClear, disabled = false }: PivotBreadcrumbProps) {
  if (history.length === 0) return null;
  const firstSource = history[0].source_object_type_id;
  return (
    <nav
      data-testid="object-explorer-pivot-breadcrumb"
      className="of-panel-muted"
      aria-label="Pivot history"
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', flexWrap: 'wrap' }}
    >
      <span className="of-text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pivot history</span>
      <span style={{ fontSize: 12, color: 'var(--text-strong)' }}>{typeLabel(typeById, firstSource)}</span>
      {history.map((step, index) => (
        <span key={`${step.link_type_id}-${index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className="of-text-muted" style={{ fontSize: 12 }}>→</span>
          <button
            type="button"
            data-testid={`object-explorer-pivot-step-${index}`}
            className="of-button"
            disabled={disabled}
            onClick={() => onRollback(index)}
            style={{ padding: '2px 8px', fontSize: 12 }}
            title={`Rollback to ${typeLabel(typeById, step.result_object_type_id)} (${step.result_object_ids.length} objects)`}
          >
            {typeLabel(typeById, step.result_object_type_id)}
            <span className="of-text-muted" style={{ marginLeft: 6, fontSize: 11 }}>
              via {step.link_type_id}
            </span>
            <span className="of-text-muted" style={{ marginLeft: 6, fontSize: 11 }}>
              ({step.result_object_ids.length})
            </span>
          </button>
        </span>
      ))}
      <button
        type="button"
        data-testid="object-explorer-pivot-clear"
        className="of-button"
        onClick={onClear}
        disabled={disabled}
        style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 12, color: 'var(--status-danger)' }}
        title="Clear pivot history"
      >
        Clear
      </button>
    </nav>
  );
}

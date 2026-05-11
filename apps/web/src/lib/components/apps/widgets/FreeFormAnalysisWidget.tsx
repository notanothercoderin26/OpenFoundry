import { useEffect, useMemo, useState } from 'react';

import type { AppWidget } from '@/lib/api/apps';
import { listProperties, type ObjectInstance, type Property } from '@/lib/api/ontology';
import { EChartCanvas } from '@/lib/components/EChartCanvas';

import {
  applyFreeFormAnalysisFilters,
  buildFreeFormChartBuckets,
  buildFreeFormMetric,
  makeFreeFormAnalysisCard,
  readFreeFormAnalysisProps,
  type FreeFormAnalysisCard,
  type FreeFormAnalysisCardKind,
  type FreeFormAnalysisFilterOperator,
  type FreeFormAnalysisMetric,
} from './freeFormAnalysis';
import { useRuntime } from './workshop-runtime-context';
import { executeWorkshopObjectSet } from './workshopObjectSets';
import type { WorkshopVariableLike } from './workshopVariables';

interface Props {
  widget: AppWidget;
  variables: WorkshopVariableLike[];
}

interface SavedPath {
  id: string;
  label: string;
  cards: FreeFormAnalysisCard[];
  search: string;
}

const CARD_KINDS: Array<{ kind: FreeFormAnalysisCardKind; label: string }> = [
  { kind: 'filter', label: 'Add filter' },
  { kind: 'metric', label: 'Add metric' },
  { kind: 'table', label: 'Add table' },
  { kind: 'bar_chart', label: 'Add bar chart' },
  { kind: 'line_chart', label: 'Add line chart' },
  { kind: 'pie_chart', label: 'Add pie chart' },
  { kind: 'text', label: 'Add text' },
];

const METRICS: Array<{ value: FreeFormAnalysisMetric; label: string }> = [
  { value: 'count', label: 'Count' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
  { value: 'approx_unique', label: 'Approx unique' },
];

const FILTER_OPERATORS: Array<{ value: FreeFormAnalysisFilterOperator; label: string }> = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not equals' },
  { value: 'gte', label: '>=' },
  { value: 'lte', label: '<=' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
];

export function FreeFormAnalysisWidget({ widget, variables }: Props) {
  const runtime = useRuntime();
  const cfg = useMemo(() => readFreeFormAnalysisProps(widget.props), [widget.props]);
  const sourceVariable = variables.find((entry) => entry.id === cfg.sourceVariableId) ?? null;
  const objectTypeId = sourceVariable?.object_type_id || cfg.objectTypeId;
  const [cards, setCards] = useState<FreeFormAnalysisCard[]>(cfg.cards);
  const [rows, setRows] = useState<ObjectInstance[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [savedPaths, setSavedPaths] = useState<SavedPath[]>([]);
  const storageKey = `openfoundry.freeFormAnalysis.${widget.id}`;

  useEffect(() => {
    setCards(cfg.cards);
  }, [widget.id, JSON.stringify(cfg.cards)]);

  useEffect(() => {
    if (!cfg.enablePathSaving || typeof window === 'undefined') return;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '[]') as SavedPath[];
      setSavedPaths(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSavedPaths([]);
    }
  }, [cfg.enablePathSaving, storageKey]);

  useEffect(() => {
    if (!objectTypeId) {
      setRows([]);
      setProperties([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    const objectPromise = cfg.sourceVariableId
      ? runtime.executeObjectSet(cfg.sourceVariableId, { objectTypeId, limit: cfg.maxRows })
      : executeWorkshopObjectSet({ objectTypeId, limit: cfg.maxRows });
    void Promise.all([listProperties(objectTypeId), objectPromise])
      .then(([propertyResponse, objectResponse]) => {
        if (cancelled) return;
        setProperties(propertyResponse);
        setRows(objectResponse.data);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setRows([]);
        setProperties([]);
        setError(cause instanceof Error ? cause.message : 'Free-form analysis failed to load object data.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cfg.maxRows, cfg.sourceVariableId, objectTypeId, runtime.executeObjectSet, runtime.refreshKey]);

  const propertyNames = useMemo(() => properties.map((property) => property.name), [properties]);
  const numericProperties = useMemo(() => properties
    .filter((property) => ['number', 'integer', 'float', 'double', 'decimal', 'long'].includes(String(property.property_type).toLowerCase()))
    .map((property) => property.name), [properties]);
  const filteredRows = useMemo(() => applyFreeFormAnalysisFilters(rows, cards, search), [cards, rows, search]);

  useEffect(() => {
    if (!cfg.outputVariableId) return;
    runtime.setSelectedObjectSet(cfg.outputVariableId, filteredRows);
    void runtime.dispatchEvents(widget, 'output_change', {
      object_type_id: objectTypeId,
      object_ids: filteredRows.map((row) => row.id),
      objects: filteredRows,
      row_count: filteredRows.length,
    });
  }, [cfg.outputVariableId, filteredRows, objectTypeId, runtime.dispatchEvents, runtime.setSelectedObjectSet, widget]);

  function addCard(kind: FreeFormAnalysisCardKind) {
    setCards((current) => [...current, makeFreeFormAnalysisCard(kind, propertyNames)]);
  }

  function patchCard(cardId: string, patch: Partial<FreeFormAnalysisCard>) {
    setCards((current) => current.map((entry) => (entry.id === cardId ? { ...entry, ...patch } : entry)));
  }

  function removeCard(cardId: string) {
    setCards((current) => current.filter((entry) => entry.id !== cardId));
  }

  function savePath() {
    if (!cfg.enablePathSaving || typeof window === 'undefined') return;
    const next: SavedPath = {
      id: `path_${Date.now().toString(36)}`,
      label: `Analysis ${savedPaths.length + 1}`,
      cards,
      search,
    };
    const all = [next, ...savedPaths].slice(0, 12);
    window.localStorage.setItem(storageKey, JSON.stringify(all));
    setSavedPaths(all);
  }

  function loadPath(path: SavedPath) {
    setCards(path.cards);
    setSearch(path.search);
  }

  if (!objectTypeId) {
    return (
      <section aria-label={widget.title || 'Free-form analysis'} style={{ padding: 18, minHeight: 240, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Free-form Analysis</div>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Choose an input object set in the inspector.</p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label={widget.title || 'Free-form analysis'} style={{ minHeight: 320, display: 'grid', gridTemplateRows: 'auto 1fr', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
        <input
          aria-label={`${widget.title || 'Free-form analysis'} search`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search objects..."
          style={{ flex: '1 1 220px', minWidth: 0, padding: '7px 10px', border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 12 }}
        />
        <span className="of-text-muted" style={{ fontSize: 12 }}>{filteredRows.length} of {rows.length} objects</span>
        {cfg.enablePathSaving ? (
          <button type="button" className="of-button" onClick={savePath} style={{ padding: '6px 9px', fontSize: 12 }}>Save path</button>
        ) : null}
      </div>

      {error ? (
        <div role="alert" style={{ margin: 12, padding: '8px 10px', border: '1px solid #fecaca', background: '#fff1f2', color: '#b42318', borderRadius: 4, fontSize: 12 }}>{error}</div>
      ) : null}

      <div style={{ padding: 12, display: 'grid', gap: 10 }}>
        {loading ? (
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Loading object set...</p>
        ) : null}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CARD_KINDS.map((entry) => (
            <button key={entry.kind} type="button" className="of-button" onClick={() => addCard(entry.kind)} style={{ padding: '6px 9px', fontSize: 12 }}>
              {entry.label}
            </button>
          ))}
        </div>

        {cfg.enablePathSaving && savedPaths.length > 0 ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="of-text-muted" style={{ fontSize: 12, alignSelf: 'center' }}>Saved paths</span>
            {savedPaths.map((path) => (
              <button key={path.id} type="button" className="of-button of-button--ghost" onClick={() => loadPath(path)} style={{ padding: '4px 8px', fontSize: 11 }}>
                {path.label}
              </button>
            ))}
          </div>
        ) : null}

        {cards.length === 0 ? (
          <div style={{ minHeight: 150, display: 'grid', placeItems: 'center', textAlign: 'center', border: '1px dashed var(--border-default)', borderRadius: 6, background: '#f8fafc', padding: 18 }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{cfg.emptyStateHeader}</p>
              <p className="of-text-muted" style={{ margin: '6px 0 0', fontSize: 12 }}>{cfg.emptyStateDescription}</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {cards.map((card) => (
              <AnalysisCard
                key={card.id}
                card={card}
                rows={filteredRows}
                properties={properties}
                numericProperties={numericProperties}
                onPatch={(patch) => patchCard(card.id, patch)}
                onRemove={() => removeCard(card.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AnalysisCard({
  card,
  rows,
  properties,
  numericProperties,
  onPatch,
  onRemove,
}: {
  card: FreeFormAnalysisCard;
  rows: ObjectInstance[];
  properties: Property[];
  numericProperties: string[];
  onPatch: (patch: Partial<FreeFormAnalysisCard>) => void;
  onRemove: () => void;
}) {
  const propertyNames = properties.map((property) => property.name);
  return (
    <article style={{ border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', background: '#f8fafc' }}>
        <input
          aria-label={`${card.title} title`}
          value={card.title}
          onChange={(event) => onPatch({ title: event.target.value })}
          style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', outline: 'none' }}
        />
        <span className="of-text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.kind.replace('_', ' ')}</span>
        <button type="button" aria-label={`Remove ${card.title}`} onClick={onRemove} className="of-button of-button--ghost" style={{ padding: '3px 6px', fontSize: 11 }}>Remove</button>
      </header>
      <div style={{ padding: 10 }}>
        {card.kind === 'filter' ? (
          <FilterCard card={card} properties={propertyNames} onPatch={onPatch} />
        ) : card.kind === 'metric' ? (
          <MetricCard card={card} rows={rows} numericProperties={numericProperties} onPatch={onPatch} />
        ) : card.kind === 'table' ? (
          <TableCard card={card} rows={rows} properties={propertyNames} onPatch={onPatch} />
        ) : card.kind === 'text' ? (
          <textarea
            aria-label={`${card.title} notes`}
            value={card.content ?? ''}
            onChange={(event) => onPatch({ content: event.target.value })}
            rows={3}
            style={{ width: '100%', padding: 8, border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 12 }}
          />
        ) : (
          <ChartCard card={card} rows={rows} properties={propertyNames} numericProperties={numericProperties} onPatch={onPatch} />
        )}
      </div>
    </article>
  );
}

function FilterCard({ card, properties, onPatch }: { card: FreeFormAnalysisCard; properties: string[]; onPatch: (patch: Partial<FreeFormAnalysisCard>) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 130px minmax(0, 1fr)', gap: 8 }}>
      <select aria-label="Filter property" value={card.property ?? ''} onChange={(event) => onPatch({ property: event.target.value })} style={inputStyle()}>
        <option value="">Property...</option>
        {properties.map((property) => <option key={property} value={property}>{property}</option>)}
      </select>
      <select aria-label="Filter operator" value={card.operator ?? 'contains'} onChange={(event) => onPatch({ operator: event.target.value as FreeFormAnalysisFilterOperator })} style={inputStyle()}>
        {FILTER_OPERATORS.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
      </select>
      <input aria-label="Filter value" value={String(card.value ?? '')} onChange={(event) => onPatch({ value: event.target.value })} placeholder="Value..." style={inputStyle()} />
    </div>
  );
}

function MetricCard({
  card,
  rows,
  numericProperties,
  onPatch,
}: {
  card: FreeFormAnalysisCard;
  rows: ObjectInstance[];
  numericProperties: string[];
  onPatch: (patch: Partial<FreeFormAnalysisCard>) => void;
}) {
  const metric = buildFreeFormMetric(rows, card);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', gap: 8 }}>
        <select aria-label="Metric aggregation" value={card.metric ?? 'count'} onChange={(event) => onPatch({ metric: event.target.value as FreeFormAnalysisMetric })} style={inputStyle()}>
          {METRICS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </select>
        <select aria-label="Metric property" value={card.property ?? ''} onChange={(event) => onPatch({ property: event.target.value })} disabled={(card.metric ?? 'count') === 'count'} style={inputStyle()}>
          <option value="">Property...</option>
          {numericProperties.map((property) => <option key={property} value={property}>{property}</option>)}
        </select>
      </div>
      <div style={{ display: 'inline-grid', justifySelf: 'start', gap: 2, padding: '10px 14px', border: '1px solid var(--border-subtle)', borderRadius: 6, background: '#f8fafc', minWidth: 150 }}>
        <span className="of-text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{metric.label}</span>
        <strong style={{ fontSize: 26, lineHeight: 1.1 }}>{metric.displayValue}</strong>
      </div>
    </div>
  );
}

function TableCard({
  card,
  rows,
  properties,
  onPatch,
}: {
  card: FreeFormAnalysisCard;
  rows: ObjectInstance[];
  properties: string[];
  onPatch: (patch: Partial<FreeFormAnalysisCard>) => void;
}) {
  const columns = (card.columns && card.columns.length > 0 ? card.columns : properties.slice(0, 6)).filter(Boolean);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <select
        aria-label="Table columns"
        multiple
        value={columns}
        onChange={(event) => onPatch({ columns: Array.from(event.currentTarget.selectedOptions).map((option) => option.value) })}
        style={{ ...inputStyle(), minHeight: 70 }}
      >
        {properties.map((property) => <option key={property} value={property}>{property}</option>)}
      </select>
      <div style={{ overflow: 'auto', maxHeight: 260 }}>
        <table className="of-table" style={{ width: '100%', fontSize: 12 }}>
          <thead>
            <tr>{columns.map((column) => <th key={column} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.slice(0, 100).map((row) => (
              <tr key={row.id}>
                {columns.map((column) => <td key={column} style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>{formatCell(row.properties?.[column])}</td>)}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={Math.max(1, columns.length)} style={{ padding: 14, textAlign: 'center' }}><span className="of-text-muted">No rows.</span></td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChartCard({
  card,
  rows,
  properties,
  numericProperties,
  onPatch,
}: {
  card: FreeFormAnalysisCard;
  rows: ObjectInstance[];
  properties: string[];
  numericProperties: string[];
  onPatch: (patch: Partial<FreeFormAnalysisCard>) => void;
}) {
  const buckets = buildFreeFormChartBuckets(rows, card);
  const option = useMemo(() => {
    if (card.kind === 'pie_chart') {
      return {
        tooltip: { trigger: 'item' },
        legend: { show: true, bottom: 0 },
        series: [{ type: 'pie', radius: '70%', data: buckets.map((bucket) => ({ name: bucket.category, value: bucket.value })) }],
      };
    }
    const chartType = card.kind === 'line_chart' ? 'line' : 'bar';
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 45, right: 16, top: 12, bottom: 42, containLabel: true },
      xAxis: { type: 'category', data: buckets.map((bucket) => bucket.category) },
      yAxis: { type: 'value' },
      series: [{ type: chartType, data: buckets.map((bucket) => bucket.value), label: { show: chartType === 'bar', position: 'top' } }],
    };
  }, [buckets, card.kind]);

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 150px minmax(0, 1fr)', gap: 8 }}>
        <select aria-label="Chart category property" value={card.category_property ?? ''} onChange={(event) => onPatch({ category_property: event.target.value })} style={inputStyle()}>
          <option value="">Category...</option>
          {properties.map((property) => <option key={property} value={property}>{property}</option>)}
        </select>
        <select aria-label="Chart aggregation" value={card.metric ?? 'count'} onChange={(event) => onPatch({ metric: event.target.value as FreeFormAnalysisMetric })} style={inputStyle()}>
          {METRICS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </select>
        <select aria-label="Chart value property" value={card.value_property ?? ''} onChange={(event) => onPatch({ value_property: event.target.value })} disabled={(card.metric ?? 'count') === 'count'} style={inputStyle()}>
          <option value="">Value...</option>
          {numericProperties.map((property) => <option key={property} value={property}>{property}</option>)}
        </select>
      </div>
      {buckets.length === 0 ? (
        <p className="of-text-muted" style={{ margin: 0, padding: 24, textAlign: 'center', fontSize: 12 }}>No chart data.</p>
      ) : (
        <EChartCanvas options={option} style={{ height: 260 }} />
      )}
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return { width: '100%', minWidth: 0, padding: '7px 10px', border: '1px solid var(--border-default)', borderRadius: 4, background: '#fff', fontSize: 12 };
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

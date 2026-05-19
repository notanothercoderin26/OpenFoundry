import { useEffect, useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import { histogram, type HistogramFacet, type ObjectRef } from '@/lib/api/vertexTraversal';

// A single histogram filter chip is exposed back to the caller so it
// can splice it into the canvas filter pipeline. Each chip narrows
// the visible set to (property, value) pairs that match `mode`.
//
// Mode `to`  – keep only objects where property === value.
// Mode `out` – hide objects where property === value.
//
// For the synthetic `@object_type` facet, `property` is `@object_type`
// and `value` is the object type id; callers can treat it as a
// straight type filter.
export interface HistogramFilterChip {
  property: string;
  value: unknown;
  mode: 'to' | 'out';
  // Human-readable label for the chip — what gets rendered above
  // the canvas (e.g. "Cancelled = true", or "Object type = flight").
  label: string;
}

interface HistogramFacetsProps {
  tenant: string;
  objectRefs: ObjectRef[];
  // Subset of properties to fetch facets for. Empty = all properties
  // touched by `objectRefs`.
  properties?: string[];
  // Existing chips so we can render their active state on buckets.
  chips: HistogramFilterChip[];
  onAddChip: (chip: HistogramFilterChip) => void;
  onRemoveChip: (chip: HistogramFilterChip) => void;
  // Display label resolver for object type ids — keeps the synthetic
  // facet readable. If omitted, the raw id is rendered.
  resolveTypeName?: (typeId: string) => string;
}

// HistogramFacets renders the server-computed histogram for the
// current canvas selection (or the whole graph). Each facet is a
// collapsible section with n/sum/avg meta + a value/count table.
// Each bucket exposes "Filter to" and "Filter out" buttons that mint
// a chip the parent applies to the canvas filter pipeline.
export function HistogramFacets({
  tenant,
  objectRefs,
  properties,
  chips,
  onAddChip,
  onRemoveChip,
  resolveTypeName,
}: HistogramFacetsProps) {
  const [facets, setFacets] = useState<HistogramFacet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!tenant || objectRefs.length === 0) {
      setFacets([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    histogram({ tenant, object_refs: objectRefs, properties: properties ?? [] })
      .then((res) => {
        if (!cancelled) setFacets(res.facets);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenant, objectRefs, properties]);

  const filteredFacets = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return facets;
    return facets.filter((f) => f.property.toLowerCase().includes(needle));
  }, [facets, search]);

  const chipKey = (property: string, value: unknown, mode: 'to' | 'out') =>
    `${mode}|${property}|${JSON.stringify(value)}`;
  const activeChips = useMemo(() => {
    const out = new Set<string>();
    for (const c of chips) out.add(chipKey(c.property, c.value, c.mode));
    return out;
  }, [chips]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          className="of-input"
          placeholder="Filter histogram…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, fontSize: 11 }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {objectRefs.length} objects
        </span>
      </header>

      {loading && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loading facets…</div>
      )}
      {error && (
        <div className="of-status-warning" style={{ fontSize: 11 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gap: 4, overflow: 'auto' }}>
        {filteredFacets.map((facet) => {
          const isCollapsed = collapsed[facet.property];
          const label = facet.property === '@object_type' ? 'Object Types' : facet.property;
          return (
            <section
              key={facet.property + (facet.object_type_id ?? '')}
              className="of-panel"
              style={{ padding: 6 }}
            >
              <header
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                onClick={() =>
                  setCollapsed({ ...collapsed, [facet.property]: !isCollapsed })
                }
              >
                <Glyph name={isCollapsed ? 'chevron-right' : 'chevron-down'} size={11} />
                <strong style={{ fontSize: 12 }}>{label}</strong>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
                  n {facet.n}
                  {facet.numeric && (
                    <>
                      , sum {fmt(facet.numeric.sum)}, avg {fmt(facet.numeric.avg)}
                    </>
                  )}
                  {!facet.numeric && (
                    <>
                      , uniq {facet.uniq}
                    </>
                  )}
                </span>
              </header>
              {!isCollapsed && (
                <table style={{ width: '100%', marginTop: 4, fontSize: 11 }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)' }}>
                      <th style={{ textAlign: 'left' }}>Value</th>
                      <th style={{ textAlign: 'right', width: 60 }}>Count</th>
                      <th style={{ width: 60 }} aria-label="Bar" />
                      <th style={{ width: 56 }} aria-label="Filter actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {facet.buckets.map((b, i) => {
                      const valueLabel =
                        facet.property === '@object_type'
                          ? resolveTypeName?.(stringValue(b.value_json)) ?? stringValue(b.value_json)
                          : displayValue(b.value_json);
                      const max = facet.buckets[0]?.count ?? 1;
                      const barWidth = max === 0 ? 0 : Math.round((b.count / max) * 60);
                      const toKey = chipKey(facet.property, b.value_json, 'to');
                      const outKey = chipKey(facet.property, b.value_json, 'out');
                      const isFilterTo = activeChips.has(toKey);
                      const isFilterOut = activeChips.has(outKey);
                      return (
                        <tr key={i}>
                          <td title={valueLabel}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {valueLabel}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {b.count}
                          </td>
                          <td>
                            <div
                              aria-hidden
                              style={{
                                width: 60,
                                background: 'var(--surface-subtle, #eef2f7)',
                                borderRadius: 2,
                                height: 10,
                              }}
                            >
                              <div
                                style={{
                                  width: barWidth,
                                  background: 'var(--accent-default, #2563eb)',
                                  height: 10,
                                  borderRadius: 2,
                                }}
                              />
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className={`of-btn ${isFilterTo ? 'of-btn-primary' : 'of-btn-ghost'}`}
                                title="Filter to this value"
                                style={{ minHeight: 22, padding: '0 6px', fontSize: 10 }}
                                onClick={() =>
                                  isFilterTo
                                    ? onRemoveChip({
                                        property: facet.property,
                                        value: b.value_json,
                                        mode: 'to',
                                        label: `${label} = ${valueLabel}`,
                                      })
                                    : onAddChip({
                                        property: facet.property,
                                        value: b.value_json,
                                        mode: 'to',
                                        label: `${label} = ${valueLabel}`,
                                      })
                                }
                              >
                                to
                              </button>
                              <button
                                type="button"
                                className={`of-btn ${isFilterOut ? 'of-btn-danger' : 'of-btn-ghost'}`}
                                title="Filter out this value"
                                style={{ minHeight: 22, padding: '0 6px', fontSize: 10 }}
                                onClick={() =>
                                  isFilterOut
                                    ? onRemoveChip({
                                        property: facet.property,
                                        value: b.value_json,
                                        mode: 'out',
                                        label: `${label} ≠ ${valueLabel}`,
                                      })
                                    : onAddChip({
                                        property: facet.property,
                                        value: b.value_json,
                                        mode: 'out',
                                        label: `${label} ≠ ${valueLabel}`,
                                      })
                                }
                              >
                                out
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return displayValue(value);
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

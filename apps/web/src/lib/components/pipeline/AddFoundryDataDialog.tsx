import { useEffect, useMemo, useState } from 'react';

import { listDatasets, type Dataset } from '@/lib/api/datasets';
import {
  tableTypeLabel,
  virtualTables,
  virtualTableExternalReference,
  virtualTablePipelineInputSupport,
  type VirtualTable,
} from '@/lib/api/virtual-tables';
import { Glyph } from '@/lib/components/ui/Glyph';

export type AddFoundryDataItem =
  | { kind: 'dataset'; id: string; name: string; description: string; dataset: Dataset }
  | { kind: 'virtual_table'; id: string; name: string; description: string; virtualTable: VirtualTable };

interface AddFoundryDataDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (items: AddFoundryDataItem[]) => void;
}

function formatRowCount(count: number) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M rows`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K rows`;
  return `${count} rows`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function itemKey(item: AddFoundryDataItem) {
  return `${item.kind}:${item.id}`;
}

function virtualTableDescription(row: VirtualTable) {
  const ref = virtualTableExternalReference(row);
  return ref === row.name ? `${tableTypeLabel(row.table_type)} virtual table` : ref;
}

function itemSupport(item: AddFoundryDataItem) {
  if (item.kind === 'dataset') return { supported: true, reasons: [] as string[], warnings: [] as string[] };
  return virtualTablePipelineInputSupport(item.virtualTable);
}

function itemGlyph(item: AddFoundryDataItem) {
  return item.kind === 'dataset'
    ? { name: 'database' as const, tone: '#2d72d2' }
    : { name: 'cube' as const, tone: '#7c5dd6' };
}

export function AddFoundryDataDialog({ open, onClose, onAdd }: AddFoundryDataDialogProps) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [virtualTableRows, setVirtualTableRows] = useState<VirtualTable[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Map<string, AddFoundryDataItem>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.allSettled([
      listDatasets({ per_page: 200 }),
      virtualTables.listVirtualTables({ limit: 200 }),
    ])
      .then(([datasetResult, virtualTableResult]) => {
        if (cancelled) return;
        if (datasetResult.status === 'fulfilled') setDatasets(datasetResult.value.data);
        else setDatasets([]);
        if (virtualTableResult.status === 'fulfilled') setVirtualTableRows(virtualTableResult.value.items);
        else setVirtualTableRows([]);
        if (datasetResult.status === 'rejected' && virtualTableResult.status === 'rejected') {
          const cause = datasetResult.reason;
          setError(cause instanceof Error ? cause.message : 'Failed to load data');
        } else if (virtualTableResult.status === 'rejected') {
          setError('Virtual tables are unavailable; datasets can still be added.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSelected(new Map());
      setActiveId(null);
      setSearch('');
    }
  }, [open]);

  const items = useMemo<AddFoundryDataItem[]>(() => {
    const datasetItems = datasets.map((dataset) => ({
      kind: 'dataset' as const,
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      dataset,
    }));
    const virtualTableItems = virtualTableRows.map((virtualTable) => ({
      kind: 'virtual_table' as const,
      id: virtualTable.rid,
      name: virtualTable.name,
      description: virtualTableDescription(virtualTable),
      virtualTable,
    }));
    return [...datasetItems, ...virtualTableItems];
  }, [datasets, virtualTableRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((entry) => `${entry.name} ${entry.description}`.toLowerCase().includes(q));
  }, [items, search]);

  const active = useMemo(() => items.find((entry) => itemKey(entry) === activeId) ?? null, [items, activeId]);

  if (!open) return null;

  function toggleItem(item: AddFoundryDataItem) {
    const support = itemSupport(item);
    if (!support.supported) return;
    const key = itemKey(item);
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(key)) next.delete(key);
      else next.set(key, item);
      return next;
    });
  }

  function addAllVisible() {
    setSelected((current) => {
      const next = new Map(current);
      for (const item of filtered) {
        if (itemSupport(item).supported) next.set(itemKey(item), item);
      }
      return next;
    });
  }

  function commit() {
    onAdd([...selected.values()]);
    onClose();
  }

  const selectableCount = filtered.filter((item) => itemSupport(item).supported).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-foundry-data-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(17, 24, 39, 0.42)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 1080,
          height: 'min(720px, calc(100vh - 48px))',
          background: '#fff',
          borderRadius: 6,
          boxShadow: '0 12px 32px rgba(15, 23, 42, 0.2)',
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Glyph name="database" size={16} tone="#2d72d2" />
            <h2 id="add-foundry-data-title" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Add data</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ border: 0, background: 'transparent', padding: 4, cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <Glyph name="x" size={14} />
          </button>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr) 320px', minHeight: 0 }}>
          <aside style={{ borderRight: '1px solid var(--border-subtle)', display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: 0 }}>
            <div style={{ padding: 12, borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: 4, background: '#f4f6f9' }}>
                <Glyph name="search" size={14} tone="#5c7080" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search data"
                  style={{ flex: 1, background: 'transparent', border: 0, outline: 'none', fontSize: 13 }}
                />
              </div>
            </div>
            <div style={{ overflowY: 'auto', padding: 6 }}>
              {error ? (
                <div className="of-status-warning" style={{ margin: 8, padding: '8px 12px', fontSize: 12 }}>
                  {error}
                </div>
              ) : null}
              {loading ? (
                <p className="of-text-muted" style={{ padding: 16, textAlign: 'center', margin: 0 }}>Loading...</p>
              ) : filtered.length === 0 ? (
                <p className="of-text-muted" style={{ padding: 16, textAlign: 'center', margin: 0 }}>No data found.</p>
              ) : (
                filtered.map((item) => {
                  const key = itemKey(item);
                  const isSelected = selected.has(key);
                  const isActive = activeId === key;
                  const support = itemSupport(item);
                  const glyph = itemGlyph(item);
                  return (
                    <div
                      key={key}
                      onClick={() => setActiveId(key)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        cursor: 'pointer',
                        borderRadius: 4,
                        background: isActive ? 'rgba(45, 114, 210, 0.06)' : 'transparent',
                        opacity: support.supported ? 1 : 0.68,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <Glyph name={glyph.name} size={14} tone={glyph.tone} />
                        <span style={{ display: 'grid', minWidth: 0 }}>
                          <span style={{ fontSize: 13, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.name}
                          </span>
                          <span className="of-text-muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.kind === 'virtual_table' ? 'Virtual table' : 'Dataset'}
                          </span>
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label={isSelected ? 'Remove from selection' : 'Add to selection'}
                        title={support.supported ? undefined : support.reasons.join('; ')}
                        disabled={!support.supported}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleItem(item);
                        }}
                        style={{
                          border: 0,
                          background: 'transparent',
                          padding: 4,
                          cursor: support.supported ? 'pointer' : 'not-allowed',
                          color: isSelected ? 'var(--status-danger)' : 'var(--status-info)',
                          opacity: support.supported ? 1 : 0.45,
                        }}
                      >
                        <Glyph name={isSelected ? 'circle-x' : 'plus'} size={16} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div style={{ padding: 8, borderTop: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={addAllVisible}
                disabled={selectableCount === 0}
                className="of-button"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <Glyph name="plus" size={13} />
                Add all to selection
              </button>
            </div>
          </aside>

          <main style={{ overflowY: 'auto', padding: 24, display: 'grid', placeContent: 'center' }}>
            {active ? <DataDetails item={active} /> : (
              <div style={{ display: 'grid', justifyItems: 'center', gap: 8, color: 'var(--text-muted)', textAlign: 'center' }}>
                <Glyph name="database" size={32} tone="#aab4c0" />
                <p style={{ margin: 0 }}>Select data to view details</p>
              </div>
            )}
          </main>

          <aside style={{ borderLeft: '1px solid var(--border-subtle)', display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: 0 }}>
            <div style={{ padding: 12, borderBottom: '1px solid var(--border-subtle)' }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Data to add ({selected.size})</p>
            </div>
            <div style={{ overflowY: 'auto', padding: 8 }}>
              {selected.size === 0 ? (
                <p className="of-text-muted" style={{ padding: 16, textAlign: 'center', margin: 0 }}>No data selected</p>
              ) : (
                [...selected.values()].map((item) => {
                  const glyph = itemGlyph(item);
                  return (
                    <div
                      key={itemKey(item)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        borderRadius: 4,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <Glyph name={glyph.name} size={13} tone={glyph.tone} />
                        <span style={{ fontSize: 12, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.name}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label="Remove"
                        onClick={() => toggleItem(item)}
                        style={{ border: 0, background: 'transparent', padding: 4, cursor: 'pointer', color: 'var(--status-danger)' }}
                      >
                        <Glyph name="circle-x" size={14} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div style={{ padding: 12, borderTop: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={commit}
                disabled={selected.size === 0}
                style={{
                  width: '100%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '10px 12px',
                  border: 0,
                  borderRadius: 4,
                  background: '#2d72d2',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                  opacity: selected.size === 0 ? 0.6 : 1,
                }}
              >
                <Glyph name="database" size={13} tone="#fff" />
                Add data
              </button>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function DataDetails({ item }: { item: AddFoundryDataItem }) {
  if (item.kind === 'dataset') {
    const active = item.dataset;
    return (
      <div style={{ display: 'grid', gap: 14, justifyItems: 'start' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{active.name}</h3>
        {active.description ? (
          <p className="of-text-muted" style={{ margin: 0, fontSize: 13 }}>{active.description}</p>
        ) : null}
        <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 14px', margin: 0, fontSize: 13 }}>
          <dt className="of-text-muted">Format</dt><dd style={{ margin: 0 }}>{active.format}</dd>
          <dt className="of-text-muted">Rows</dt><dd style={{ margin: 0 }}>{formatRowCount(active.row_count)}</dd>
          <dt className="of-text-muted">Size</dt><dd style={{ margin: 0 }}>{formatBytes(active.size_bytes)}</dd>
          <dt className="of-text-muted">Branch</dt><dd style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>{active.active_branch}</dd>
        </dl>
      </div>
    );
  }
  const table = item.virtualTable;
  const support = virtualTablePipelineInputSupport(table);
  return (
    <div style={{ display: 'grid', gap: 14, justifyItems: 'start' }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{table.name}</h3>
      <p className="of-text-muted" style={{ margin: 0, fontSize: 13 }}>{virtualTableExternalReference(table)}</p>
      <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 14px', margin: 0, fontSize: 13 }}>
        <dt className="of-text-muted">Type</dt><dd style={{ margin: 0 }}>{tableTypeLabel(table.table_type)}</dd>
        <dt className="of-text-muted">Source</dt><dd style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>{table.source_rid}</dd>
        <dt className="of-text-muted">Schema</dt><dd style={{ margin: 0 }}>{table.schema_inferred.length} column{table.schema_inferred.length === 1 ? '' : 's'}</dd>
        <dt className="of-text-muted">Input mode</dt><dd style={{ margin: 0 }}>{support.mode.replaceAll('_', ' ')}</dd>
      </dl>
      {support.reasons.length > 0 ? (
        <div className="of-status-warning" style={{ padding: '8px 10px', fontSize: 12 }}>
          {support.reasons.join(' ')}
        </div>
      ) : null}
      {support.warnings.length > 0 ? (
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>{support.warnings.join(' ')}</p>
      ) : null}
    </div>
  );
}

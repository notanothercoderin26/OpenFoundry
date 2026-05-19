import { useEffect, useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import { listSearchArounds, type SearchAround } from '@/lib/api/vertexSearchArounds';

interface LoadSearchAroundModalProps {
  open: boolean;
  startingObjectTypeId?: string;
  onCancel: () => void;
  onLoad: (id: string) => void;
}

// Load modal that lists saved Search Arounds. When a starting object
// type is known (the canvas has objects selected), the list is
// pre-filtered to compatible templates — this matches the Palantir
// flow where loading a Search Around prompts the user to "select
// objects from the graph of the appropriate type".
export function LoadSearchAroundModal({
  open,
  startingObjectTypeId,
  onCancel,
  onLoad,
}: LoadSearchAroundModalProps) {
  const [items, setItems] = useState<SearchAround[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setSearch('');
    listSearchArounds({
      per_page: 100,
      starting_object_type_id: startingObjectTypeId,
    })
      .then((res) => {
        if (!cancelled) setItems(res.data);
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
  }, [open, startingObjectTypeId]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (s) =>
        s.title.toLowerCase().includes(needle) ||
        s.description.toLowerCase().includes(needle),
    );
  }, [items, search]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vertex-load-sa-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        className="of-panel"
        style={{ width: '100%', maxWidth: 520, background: '#fff' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <strong id="vertex-load-sa-title">Load Search Around</strong>
          <button
            type="button"
            onClick={onCancel}
            className="of-btn of-btn-ghost"
            aria-label="Close"
            style={{ marginLeft: 'auto', minHeight: 24, padding: '0 6px' }}
          >
            <Glyph name="x" size={12} />
          </button>
        </header>

        <div style={{ padding: 14 }}>
          <input
            className="of-input"
            placeholder="Search saved Search Arounds…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 8 }}
          />

          <div
            style={{
              maxHeight: 320,
              overflow: 'auto',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
            }}
          >
            {loading && (
              <div style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                Loading…
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                No saved Search Arounds found.
              </div>
            )}
            {filtered.map((sa) => (
              <button
                type="button"
                key={sa.id}
                onClick={() => onLoad(sa.id)}
                className="of-btn-ghost"
                style={{
                  display: 'flex',
                  width: '100%',
                  alignItems: 'flex-start',
                  flexDirection: 'column',
                  gap: 2,
                  padding: '8px 10px',
                  borderBottom: '1px solid var(--border-subtle)',
                  textAlign: 'left',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Glyph name="graph" size={12} />
                  <strong>{sa.title}</strong>
                  <span
                    className="of-chip"
                    style={{ marginLeft: 'auto', fontSize: 10 }}
                  >
                    {sa.steps.length} steps · {sa.parameters.length} params
                  </span>
                </div>
                {sa.description && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {sa.description}
                  </span>
                )}
              </button>
            ))}
          </div>

          {error && (
            <div className="of-status-warning" style={{ fontSize: 12, marginTop: 8 }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

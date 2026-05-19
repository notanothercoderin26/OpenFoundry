import { useEffect, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import { listLinkTypes, type LinkType } from '@/lib/api/ontology';
import { linkSummary, type LinkSummaryEntry } from '@/lib/api/vertexTraversal';

interface LinkSummaryDropdownProps {
  tenant: string;
  objectId: string;
  objectTypeId: string;
  // Called when the user clicks one of the rendered relation entries
  // (e.g. "Arriving Flight 102064"). The parent handles the actual
  // expansion — this component does not mutate the canvas.
  onExpand: (entry: LinkSummaryEntry, linkType?: LinkType) => void;
  // Called when the user clicks the filter icon next to a relation —
  // shifts focus to the multi-step Search Around panel so they can
  // narrow the result set before adding to the graph.
  onAddFilters?: (entry: LinkSummaryEntry, linkType?: LinkType) => void;
  onClose?: () => void;
}

// Right-click "Search Around" submenu. Loads the per-object link
// catalog from ontology-query-service and renders one row per link
// type with its current count. Mirrors the Palantir UI screenshot:
//   [EXAMPLE DATA] AIRPORT
//   ┌────────────────────────────────────┐
//   │ Arriving Flight        102064  ⛌  │
//   │ Arriving Route             87  ⛌  │
//   │ Departing Flight       102057  ⛌  │
//   │ Departing Route            86  ⛌  │
//   │ Runway                      4  ⛌  │
//   └────────────────────────────────────┘
export function LinkSummaryDropdown({
  tenant,
  objectId,
  objectTypeId,
  onExpand,
  onAddFilters,
  onClose,
}: LinkSummaryDropdownProps) {
  const [entries, setEntries] = useState<LinkSummaryEntry[]>([]);
  const [linkTypes, setLinkTypes] = useState<Record<string, LinkType>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    // Load the link types catalog for the object's type so we can
    // hydrate display names, then probe link-summary for that exact
    // set. Without the catalog the backend cannot enumerate types,
    // so without it the dropdown is empty (intentional fallback).
    listLinkTypes({ object_type_id: objectTypeId, per_page: 200 })
      .then(async (catalog) => {
        if (cancelled) return;
        const byId: Record<string, LinkType> = {};
        for (const lt of catalog.data) byId[lt.id] = lt;
        setLinkTypes(byId);
        const ids = catalog.data.map((lt) => lt.id);
        if (ids.length === 0 || !tenant || !objectId) {
          setEntries([]);
          return;
        }
        const summary = await linkSummary(tenant, objectId, { link_types: ids });
        if (cancelled) return;
        // Collapse two directions per link type into one row by
        // keeping the higher count. Direction stays attached so the
        // parent knows which way to expand.
        const collapsed = new Map<string, LinkSummaryEntry>();
        for (const e of summary.entries) {
          const cur = collapsed.get(e.link_type_id);
          if (!cur || e.count > cur.count) collapsed.set(e.link_type_id, e);
        }
        // Order by count desc — biggest fan-outs first, matching
        // the docs screenshot.
        setEntries(
          Array.from(collapsed.values()).sort((a, b) => b.count - a.count),
        );
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
  }, [tenant, objectId, objectTypeId]);

  return (
    <div
      role="menu"
      className="of-panel"
      style={{
        minWidth: 240,
        background: '#fff',
        padding: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          borderBottom: '1px solid var(--border-subtle)',
          color: 'var(--text-muted)',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        <Glyph name="graph" size={12} />
        <strong>Search around</strong>
        {onClose && (
          <button
            type="button"
            className="of-btn of-btn-ghost"
            onClick={onClose}
            aria-label="Close"
            style={{ marginLeft: 'auto', minHeight: 20, padding: '0 4px' }}
          >
            <Glyph name="x" size={10} />
          </button>
        )}
      </header>

      {loading && (
        <div style={{ padding: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          Loading relations…
        </div>
      )}
      {!loading && entries.length === 0 && !error && (
        <div style={{ padding: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          No linked object relations.
        </div>
      )}
      {entries.map((e) => {
        const lt = linkTypes[e.link_type_id];
        const label = lt?.display_name || lt?.name || e.display_name || e.link_type_id;
        return (
          <div
            key={e.link_type_id + ':' + e.direction}
            role="menuitem"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              fontSize: 12,
            }}
          >
            <button
              type="button"
              className="of-btn of-btn-ghost"
              style={{ flex: 1, justifyContent: 'flex-start', padding: '4px 6px', minHeight: 24 }}
              onClick={() => onExpand(e, lt)}
              title={`Expand ${label} (${e.direction})`}
            >
              <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
              <span
                className="of-chip"
                aria-label={`${e.count} ${label}`}
                style={{ marginLeft: 6, fontSize: 10 }}
              >
                {formatCount(e.count)}
                {e.count_is_estimate ? '+' : ''}
              </span>
            </button>
            {onAddFilters && (
              <button
                type="button"
                className="of-btn of-btn-ghost"
                title={`Add filters before expanding ${label}`}
                onClick={() => onAddFilters(e, lt)}
                style={{ minHeight: 24, padding: '0 6px' }}
              >
                <Glyph name="query" size={11} />
              </button>
            )}
          </div>
        );
      })}

      {error && (
        <div className="of-status-warning" style={{ padding: 8, fontSize: 11 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

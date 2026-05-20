// AuditLogPanel renders the rows produced by every Save click in the
// Review-edits modal — one row per resource mutation, grouped by
// batch_id when the user staged multiple edits at once.
//
// The panel is intentionally read-only and minimal. The pre-existing
// OntologyHistoryPanel renders the older `saved_change_records` flow
// (Marketplace installs, JSON imports, manual restores); this panel
// surfaces the newer transactional audit log that the working state
// emits and lets the user drill into per-edit diffs.

import { useEffect, useMemo, useState } from "react";

import {
  type AuditDiffEntry,
  type AuditLogEntry,
  type BatchEditResource,
  listAuditLog,
} from "../../api/ontologyBatchSave";

interface AuditLogPanelProps {
  /**
   * Optional filter narrowing the feed to a single resource. When
   * unset the panel renders the global stream.
   */
  resourceFilter?: { kind: BatchEditResource; id: string };
  /**
   * Bumping this triggers a refetch (e.g. after a Save commits). The
   * value itself is opaque — any change is treated as "go fetch
   * again". String tokens like batch ids work too.
   */
  refreshToken?: string | number | null;
}

export function AuditLogPanel({ resourceFilter, refreshToken }: AuditLogPanelProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listAuditLog({
      resource_kind: resourceFilter?.kind,
      resource_id: resourceFilter?.id,
      limit: 200,
    })
      .then((page) => {
        if (cancelled) return;
        setEntries(page.data);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resourceFilter?.kind, resourceFilter?.id, refreshToken]);

  const buckets = useMemo(() => groupByBatch(entries), [entries]);

  return (
    <section className="of-panel" style={{ padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14 }}>Audit log</h3>
          <p className="of-text-muted" style={{ margin: "4px 0 0", fontSize: 11 }}>
            Every Save click in the Review-edits modal lands here. Entries that share a batch id committed together.
          </p>
        </div>
        {loading && <span className="of-text-muted" style={{ fontSize: 11 }}>Loading…</span>}
      </header>

      {error && (
        <p style={{ marginTop: 12, color: "#b91c1c", fontSize: 12 }}>
          Failed to load audit log: {error}
        </p>
      )}

      {!loading && entries.length === 0 && !error && (
        <p className="of-text-muted" style={{ marginTop: 12, fontSize: 12 }}>
          No batch saves recorded yet.
        </p>
      )}

      <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {buckets.map((bucket) => (
          <li key={bucket.key} style={{ border: "1px solid var(--border-default)", borderRadius: 4, background: "#fff" }}>
            <div style={{ padding: "8px 12px", borderBottom: bucket.entries.length > 1 ? "1px solid var(--border-default)" : "none", background: "var(--surface-muted, #f5f7fa)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {bucket.batch_id ? `Batch ${shortId(bucket.batch_id)}` : "Single edit"} ·{" "}
                {formatDate(bucket.changed_at)} · by {shortId(bucket.changed_by)}
                {bucket.source && bucket.source !== "ontology-manager" && ` · source: ${bucket.source}`}
              </div>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {bucket.entries.map((entry) => (
                <AuditRow
                  key={entry.id}
                  entry={entry}
                  expanded={!!expanded[entry.id]}
                  onToggle={() =>
                    setExpanded((curr) => ({ ...curr, [entry.id]: !curr[entry.id] }))
                  }
                />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface AuditRowProps {
  entry: AuditLogEntry;
  expanded: boolean;
  onToggle: () => void;
}

function AuditRow({ entry, expanded, onToggle }: AuditRowProps) {
  const diffs = entry.field_diffs ?? [];
  const opTone = entry.operation === "create"
    ? "success"
    : entry.operation === "delete"
    ? "error"
    : "info";
  return (
    <li style={{ borderTop: "1px solid var(--border-default)" }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          appearance: "none",
          background: "none",
          border: "none",
          width: "100%",
          padding: "8px 12px",
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
        }}
        aria-expanded={expanded}
      >
        <span aria-hidden="true" style={{ display: "inline-block", width: 12 }}>
          {expanded ? "▾" : "▸"}
        </span>
        <span style={opBadge(opTone)}>{entry.operation}</span>
        <span style={{ fontWeight: 500 }}>{labelFor(entry.resource_kind)}</span>
        <span className="of-text-muted" style={{ fontSize: 11 }}>{shortId(entry.resource_id)}</span>
        <span className="of-text-muted" style={{ marginLeft: "auto", fontSize: 11 }}>
          v{entry.new_version}
          {diffs.length > 0 && ` · ${diffs.length} field${diffs.length === 1 ? "" : "s"}`}
        </span>
      </button>
      {expanded && (
        <div style={{ padding: "0 12px 12px 32px" }}>
          {diffs.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {entry.operation === "delete"
                ? "Resource removed."
                : entry.operation === "create"
                ? "Resource created."
                : "No tracked field-level changes."}
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {diffs.map((d, i) => (
                <DiffRow key={i} entry={d} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function DiffRow({ entry }: { entry: AuditDiffEntry }) {
  return (
    <li style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 11 }}>
      <span style={{ minWidth: 140, color: "var(--text-muted)" }}>{entry.path}</span>
      <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {entry.before !== undefined && entry.before !== null && (
          <span style={beforeChip}>{stringifyShort(entry.before)}</span>
        )}
        {entry.after !== undefined && entry.after !== null && (
          <span style={afterChip}>{stringifyShort(entry.after)}</span>
        )}
      </span>
    </li>
  );
}

// ── helpers ──────────────────────────────────────────────────────────

interface BatchBucket {
  key: string;
  batch_id?: string;
  changed_at: string;
  changed_by: string;
  source: string;
  entries: AuditLogEntry[];
}

function groupByBatch(entries: AuditLogEntry[]): BatchBucket[] {
  const buckets = new Map<string, BatchBucket>();
  for (const e of entries) {
    const key = e.batch_id ?? `single:${e.id}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        batch_id: e.batch_id,
        changed_at: e.changed_at,
        changed_by: e.changed_by,
        source: e.source,
        entries: [],
      };
      buckets.set(key, bucket);
    }
    bucket.entries.push(e);
  }
  // Already sorted DESC by changed_at coming from the backend.
  return Array.from(buckets.values());
}

function labelFor(kind: BatchEditResource): string {
  switch (kind) {
    case "object_type": return "Object type";
    case "link_type": return "Link type";
    case "property": return "Property";
    case "object_type_group": return "Group";
    case "shared_property_type": return "Shared property";
  }
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function stringifyShort(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 120 ? s.slice(0, 117) + "…" : s;
  } catch {
    return String(v);
  }
}

const beforeChip: React.CSSProperties = {
  textDecoration: "line-through",
  background: "var(--surface-muted, #f0f0f0)",
  color: "var(--text-muted)",
  padding: "1px 5px",
  borderRadius: 3,
};

const afterChip: React.CSSProperties = {
  background: "rgba(35, 145, 90, 0.12)",
  color: "var(--status-success, #1f8054)",
  padding: "1px 5px",
  borderRadius: 3,
};

function opBadge(tone: "success" | "info" | "error"): React.CSSProperties {
  const palette = {
    success: { bg: "rgba(35, 145, 90, 0.12)", fg: "#1f8054" },
    info: { bg: "rgba(41, 101, 204, 0.1)", fg: "#2965cc" },
    error: { bg: "rgba(196, 49, 75, 0.12)", fg: "#c4314b" },
  }[tone];
  return {
    fontSize: 10,
    padding: "1px 6px",
    borderRadius: 8,
    background: palette.bg,
    color: palette.fg,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };
}

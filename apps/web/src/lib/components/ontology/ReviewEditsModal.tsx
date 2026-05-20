// Review-edits modal. Renders the working-state of the ontology
// manager and drives the atomic Save flow.
//
// Tabs:
//   - All edits     — every staged edit (default view)
//   - Warnings      — only edits with at least one warning attached
//   - Errors        — only edits with at least one error attached
//   - Conflicts     — only edits the server flagged as stale on save
//
// The Save button is disabled when:
//   - there are zero edits, or
//   - a save is in flight, or
//   - any edit has an unresolved error or unacknowledged warning that
//     requires confirmation (e.g. "388 edits will be undone").
//
// Conflict resolution lives inside each card via the Use-latest /
// Keep-mine choice; the modal stays open until the user works through
// every conflict and re-saves.

import { useEffect, useMemo, useState } from "react";

import {
  type StagedEdit,
  acknowledgeWarning,
  diffStagedEdit,
  discard,
  discardAll,
  resolveConflict,
  save,
  useOntologyWorkingState,
} from "../../stores/ontologyWorkingState";

type Tab = "all" | "warnings" | "errors" | "conflicts";

interface ReviewEditsModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Optional handler the modal calls after a successful save (every
   * edit committed). The hosting page typically refetches the
   * affected resources from TanStack Query in here.
   */
  onSaved?: (batchId: string) => void;
}

export function ReviewEditsModal({ open, onClose, onSaved }: ReviewEditsModalProps) {
  const state = useOntologyWorkingState();
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !state.saveInFlight) {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, state.saveInFlight, onClose]);

  // Auto-close once all edits are saved.
  useEffect(() => {
    if (!open) return;
    if (state.edits.length === 0 && state.lastBatchId && !state.saveInFlight) {
      onSaved?.(state.lastBatchId);
      onClose();
    }
  }, [open, state.edits.length, state.lastBatchId, state.saveInFlight, onSaved, onClose]);

  const counts = useMemo(() => countByTab(state.edits), [state.edits]);
  const visibleEdits = useMemo(() => filterForTab(state.edits, tab), [state.edits, tab]);
  const blocking = useMemo(() => hasBlockingIssues(state.edits), [state.edits]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-edits-title"
      style={overlayStyle}
    >
      <div className="of-panel" style={panelStyle}>
        <header style={headerStyle}>
          <div id="review-edits-title" className="of-heading-md">
            Review edits
          </div>
          <button
            type="button"
            aria-label="Close"
            className="of-btn of-btn-ghost of-btn-icon"
            onClick={onClose}
            disabled={state.saveInFlight}
          >
            ×
          </button>
        </header>

        <nav style={tabBarStyle}>
          <TabButton label="All edits" count={counts.all} active={tab === "all"} onClick={() => setTab("all")} />
          <TabButton label="Warnings" count={counts.warnings} active={tab === "warnings"} onClick={() => setTab("warnings")} />
          <TabButton label="Errors" count={counts.errors} active={tab === "errors"} onClick={() => setTab("errors")} tone="error" />
          <TabButton label="Conflicts" count={counts.conflicts} active={tab === "conflicts"} onClick={() => setTab("conflicts")} tone="conflict" />
        </nav>

        {state.lastTransportError && (
          <div style={transportErrorStyle}>
            <strong>Failed to save changes.</strong> {state.lastTransportError}
          </div>
        )}

        <div style={bodyStyle}>
          {visibleEdits.length === 0 ? (
            <div style={{ padding: 24, color: "var(--text-muted)", textAlign: "center" }}>
              {tab === "all" ? "Nothing to review." : `No ${tab} on the current edits.`}
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {visibleEdits.map((edit) => (
                <ReviewEditCard key={edit.clientId} edit={edit} />
              ))}
            </ul>
          )}
        </div>

        <footer style={footerStyle}>
          <button
            type="button"
            className="of-btn of-btn-ghost"
            onClick={() => discardAll()}
            disabled={state.saveInFlight || state.edits.length === 0}
          >
            Discard
          </button>
          <button
            type="button"
            className="of-btn of-btn-primary"
            onClick={() => void save()}
            disabled={state.saveInFlight || state.edits.length === 0 || blocking}
          >
            {state.saveInFlight ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Edit card ────────────────────────────────────────────────────────

function ReviewEditCard({ edit }: { edit: StagedEdit }) {
  const [expanded, setExpanded] = useState<boolean>(edit.status !== "pending");
  const diffs = useMemo(() => diffStagedEdit(edit), [edit]);
  const editCountLabel = edit.op === "create" ? "Created" : edit.op === "delete" ? "Deleted" : `${diffs.length} edit${diffs.length === 1 ? "" : "s"}`;

  return (
    <li style={cardStyle(edit.status)}>
      <div style={cardHeaderStyle}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={cardTitleButtonStyle}
          aria-expanded={expanded}
        >
          <span aria-hidden="true" style={{ display: "inline-block", width: 16 }}>
            {expanded ? "▾" : "▸"}
          </span>
          <span style={{ fontWeight: 600 }}>{edit.label}</span>
          <ResourceTag kind={edit.iconKind ?? edit.resource} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusBadge edit={edit} fallback={editCountLabel} />
          <button
            type="button"
            aria-label="Discard edit"
            title="Discard"
            className="of-btn of-btn-ghost of-btn-icon"
            onClick={() => discard(edit.clientId)}
          >
            🗑
          </button>
        </div>
      </div>

      {expanded && (
        <div style={cardBodyStyle}>
          {edit.op === "create" && (
            <DiffRow path="" before={null} after={edit.draft} label="Created with" />
          )}
          {edit.op === "delete" && (
            <DiffRow path="" before={edit.originalSnapshot} after={null} label="Deleted" />
          )}
          {edit.op === "update" && diffs.map((d) => (
            <DiffRow key={d.path} path={d.path} before={d.before} after={d.after} />
          ))}

          {edit.errors.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {edit.errors.map((e, i) => (
                <div key={i} style={errorBoxStyle}>
                  <strong>Error:</strong> {e.message}
                </div>
              ))}
            </div>
          )}

          {edit.warnings.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {edit.warnings.map((w, i) => {
                const code = w.code;
                const acknowledged = edit.confirmedWarnings.includes(code);
                return (
                  <div key={i} style={warningBoxStyle}>
                    <div><strong>Warning:</strong> {w.message}</div>
                    {w.requires_confirmation && !acknowledged && (
                      <ConfirmationInput
                        expected={w.requires_confirmation}
                        onConfirmed={() => acknowledgeWarning(edit.clientId, code)}
                      />
                    )}
                    {w.requires_confirmation && acknowledged && (
                      <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Confirmed.</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {edit.status === "conflict" && edit.conflict && (
            <ConflictPicker edit={edit} />
          )}
        </div>
      )}
    </li>
  );
}

function ConflictPicker({ edit }: { edit: StagedEdit }) {
  return (
    <div style={{ marginTop: 12, padding: 12, border: "1px solid var(--border-default)", borderRadius: 4, background: "rgba(120, 80, 180, 0.06)" }}>
      <div style={{ marginBottom: 8 }}>
        <strong>1 entity you have edited has been updated since you started working on your changes.</strong>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Latest version</div>
          <pre style={prePanelStyle}>{stringifyShort(edit.conflict?.current_body)}</pre>
          <button
            type="button"
            className="of-btn of-btn-ghost"
            onClick={() => resolveConflict(edit.clientId, "use_latest")}
            style={{ width: "100%", marginTop: 6 }}
          >
            Use latest
          </button>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Your changes</div>
          <pre style={prePanelStyle}>{stringifyShort(edit.draft)}</pre>
          <button
            type="button"
            className="of-btn of-btn-primary"
            onClick={() => resolveConflict(edit.clientId, "keep_mine")}
            style={{ width: "100%", marginTop: 6 }}
          >
            Keep my changes
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmationInput({ expected, onConfirmed }: { expected: string; onConfirmed: () => void }) {
  const [value, setValue] = useState("");
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, marginBottom: 4 }}>
        Type <code>{expected}</code> to confirm:
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          if (v === expected) onConfirmed();
        }}
        placeholder={expected}
        className="of-input"
        style={{ width: "100%" }}
      />
    </div>
  );
}

// ── Diff row ─────────────────────────────────────────────────────────

function DiffRow({ path, before, after, label }: { path: string; before: unknown; after: unknown; label?: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "4px 0", borderBottom: "1px dashed var(--border-default)" }}>
      <div style={{ minWidth: 160, fontSize: 12, color: "var(--text-muted)" }}>
        {label ?? path}
      </div>
      <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {before !== undefined && before !== null && (
          <span style={beforeChipStyle}>{stringifyShort(before)}</span>
        )}
        {after !== undefined && after !== null && (
          <span style={afterChipStyle}>{stringifyShort(after)}</span>
        )}
      </div>
    </div>
  );
}

function ResourceTag({ kind }: { kind: string }) {
  const label = kind === "object_type" ? "Object type"
    : kind === "link_type" ? "Link type"
    : kind === "property" ? "Property"
    : kind === "object_type_group" ? "Group"
    : kind;
  return (
    <span style={{ fontSize: 10, color: "var(--text-muted)", background: "var(--surface-muted, #f0f0f0)", padding: "2px 6px", borderRadius: 3 }}>
      {label}
    </span>
  );
}

function StatusBadge({ edit, fallback }: { edit: StagedEdit; fallback: string }) {
  if (edit.status === "saving") {
    return <span style={badgeStyle("info")}>Saving…</span>;
  }
  if (edit.status === "conflict") {
    return <span style={badgeStyle("conflict")}>Conflict</span>;
  }
  if (edit.status === "error" || edit.errors.length > 0) {
    return <span style={badgeStyle("error")}>{edit.errors.length} error{edit.errors.length === 1 ? "" : "s"}</span>;
  }
  if (edit.warnings.length > 0) {
    return <span style={badgeStyle("warning")}>{edit.warnings.length} warning{edit.warnings.length === 1 ? "" : "s"}</span>;
  }
  return <span style={badgeStyle("neutral")}>{fallback}</span>;
}

// ── Tab button ───────────────────────────────────────────────────────

function TabButton({ label, count, active, onClick, tone = "default" }: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: "default" | "error" | "conflict";
}) {
  const color = tone === "error" ? "var(--status-error, #c4314b)"
    : tone === "conflict" ? "var(--status-conflict, #7a4ea4)"
    : "var(--text-default)";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        appearance: "none",
        background: "none",
        border: "none",
        padding: "10px 14px",
        cursor: "pointer",
        borderBottom: active ? "2px solid var(--accent-primary, #2965cc)" : "2px solid transparent",
        color: count > 0 ? color : "var(--text-muted)",
        fontWeight: active ? 600 : 500,
        fontSize: 13,
      }}
    >
      {label} ({count})
    </button>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function hasBlockingIssues(edits: StagedEdit[]): boolean {
  return edits.some((e) => {
    if (e.errors.length > 0) return true;
    if (e.status === "conflict") return true;
    for (const w of e.warnings) {
      if (w.requires_confirmation && !e.confirmedWarnings.includes(w.code)) {
        return true;
      }
    }
    return false;
  });
}

function countByTab(edits: StagedEdit[]) {
  return {
    all: edits.length,
    warnings: edits.filter((e) => e.warnings.length > 0).length,
    errors: edits.filter((e) => e.errors.length > 0).length,
    conflicts: edits.filter((e) => e.status === "conflict").length,
  };
}

function filterForTab(edits: StagedEdit[], tab: Tab): StagedEdit[] {
  switch (tab) {
    case "all": return edits;
    case "warnings": return edits.filter((e) => e.warnings.length > 0);
    case "errors": return edits.filter((e) => e.errors.length > 0);
    case "conflicts": return edits.filter((e) => e.status === "conflict");
  }
}

function stringifyShort(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 240 ? s.slice(0, 237) + "…" : s;
  } catch {
    return String(v);
  }
}

// ── Inline styles ────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 60,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0,0,0,0.4)",
  padding: 16,
};

const panelStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 720,
  maxHeight: "90vh",
  display: "flex",
  flexDirection: "column",
  background: "#fff",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: "1px solid var(--border-default)",
};

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  borderBottom: "1px solid var(--border-default)",
  paddingLeft: 8,
};

const bodyStyle: React.CSSProperties = {
  padding: 16,
  overflow: "auto",
  flex: 1,
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  padding: "12px 16px",
  borderTop: "1px solid var(--border-default)",
};

const transportErrorStyle: React.CSSProperties = {
  margin: "12px 16px 0",
  padding: "10px 12px",
  background: "rgba(196, 49, 75, 0.08)",
  borderLeft: "3px solid var(--status-error, #c4314b)",
  color: "var(--status-error, #c4314b)",
  fontSize: 13,
  borderRadius: 4,
};

function cardStyle(status: StagedEdit["status"]): React.CSSProperties {
  let borderColor = "var(--border-default)";
  if (status === "error") borderColor = "var(--status-error, #c4314b)";
  else if (status === "conflict") borderColor = "var(--status-conflict, #7a4ea4)";
  else if (status === "saving") borderColor = "var(--accent-primary, #2965cc)";
  return {
    border: `1px solid ${borderColor}`,
    borderRadius: 4,
    background: "#fff",
  };
}

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 12px",
};

const cardTitleButtonStyle: React.CSSProperties = {
  appearance: "none",
  background: "none",
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  textAlign: "left",
};

const cardBodyStyle: React.CSSProperties = {
  padding: "8px 12px 12px 12px",
  borderTop: "1px solid var(--border-default)",
};

const beforeChipStyle: React.CSSProperties = {
  textDecoration: "line-through",
  background: "var(--surface-muted, #f0f0f0)",
  color: "var(--text-muted)",
  padding: "2px 6px",
  borderRadius: 3,
  fontSize: 12,
};

const afterChipStyle: React.CSSProperties = {
  background: "rgba(35, 145, 90, 0.12)",
  color: "var(--status-success, #1f8054)",
  padding: "2px 6px",
  borderRadius: 3,
  fontSize: 12,
};

const errorBoxStyle: React.CSSProperties = {
  padding: 8,
  background: "rgba(196, 49, 75, 0.08)",
  color: "var(--status-error, #c4314b)",
  borderLeft: "3px solid var(--status-error, #c4314b)",
  fontSize: 12,
  borderRadius: 4,
  marginTop: 4,
};

const warningBoxStyle: React.CSSProperties = {
  padding: 8,
  background: "rgba(217, 145, 35, 0.08)",
  color: "var(--status-warning, #a36a00)",
  borderLeft: "3px solid var(--status-warning, #a36a00)",
  fontSize: 12,
  borderRadius: 4,
  marginTop: 4,
};

const prePanelStyle: React.CSSProperties = {
  margin: 0,
  padding: 8,
  background: "var(--surface-muted, #f0f0f0)",
  borderRadius: 3,
  fontSize: 11,
  overflow: "auto",
  maxHeight: 120,
};

function badgeStyle(tone: "info" | "neutral" | "warning" | "error" | "conflict"): React.CSSProperties {
  const palette = {
    info: { bg: "rgba(41, 101, 204, 0.1)", fg: "var(--accent-primary, #2965cc)" },
    neutral: { bg: "var(--surface-muted, #f0f0f0)", fg: "var(--text-muted)" },
    warning: { bg: "rgba(217, 145, 35, 0.12)", fg: "var(--status-warning, #a36a00)" },
    error: { bg: "rgba(196, 49, 75, 0.12)", fg: "var(--status-error, #c4314b)" },
    conflict: { bg: "rgba(120, 80, 180, 0.12)", fg: "var(--status-conflict, #7a4ea4)" },
  }[tone];
  return {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 10,
    background: palette.bg,
    color: palette.fg,
    fontWeight: 600,
  };
}

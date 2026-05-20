// Foundry's "Related artifacts" sidebar — shows Workshop apps, Slate
// dashboards, object types, etc. that are directly linked to the
// selection. We render the same controls Foundry exposes: a kind-filter
// dropdown ("Including N types of artifacts"), a sort dropdown
// (Newest/Oldest/Name/Path/Last modified), and "Show autosaved files" /
// "Show files in trash" checkboxes. Each row has buttons to focus on the
// graph and to open the artifact in its source application.

import { useState, type CSSProperties } from 'react';
import type {
  RelatedArtifact,
  RelatedArtifactSort,
} from '@/lib/lineage/relatedArtifacts';

interface RelatedItemsPanelProps {
  items: RelatedArtifact[];
  distinctKinds: string[];
  includedKinds: Set<string>;
  onToggleKind: (kind: string) => void;
  onIncludeAllKinds: () => void;
  sort: RelatedArtifactSort;
  onSortChange: (sort: RelatedArtifactSort) => void;
  showAutosaved: boolean;
  showTrash: boolean;
  onToggleAutosaved: () => void;
  onToggleTrash: () => void;
  onFocusOnGraph: (item: RelatedArtifact) => void;
  onOpenArtifact: (item: RelatedArtifact) => void;
}

const SORT_LABELS: Record<RelatedArtifactSort, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  name: 'Name',
  path: 'Path',
  last_modified: 'Last modified',
};

const KIND_LABELS: Record<string, string> = {
  object_type: 'Object type',
  ontology_output: 'Ontology output',
  application: 'Application',
  function: 'Function',
  action: 'Action',
  workflow_handoff: 'Workflow handoff',
};

function prettyKind(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString();
}

export function RelatedItemsPanel(props: RelatedItemsPanelProps) {
  const {
    items,
    distinctKinds,
    includedKinds,
    onToggleKind,
    onIncludeAllKinds,
    sort,
    onSortChange,
    showAutosaved,
    showTrash,
    onToggleAutosaved,
    onToggleTrash,
    onFocusOnGraph,
    onOpenArtifact,
  } = props;
  const [kindMenuOpen, setKindMenuOpen] = useState(false);

  return (
    <div style={panelRoot}>
      <div style={controlsRow}>
        <div style={{ position: 'relative', flex: 1 }}>
          <button
            type="button"
            style={dropdown}
            onClick={() => setKindMenuOpen((v) => !v)}
            title="Filter artifacts by type"
          >
            <span style={{ flex: 1, textAlign: 'left' }}>
              {includedKinds.size === distinctKinds.length || includedKinds.size === 0
                ? `Including ${distinctKinds.length} types of artifacts`
                : `Including ${includedKinds.size} of ${distinctKinds.length} types`}
            </span>
            <span style={chevron}>▾</span>
          </button>
          {kindMenuOpen && (
            <div style={dropdownMenu} className="of-panel">
              <button
                type="button"
                style={menuItemRow}
                onClick={() => {
                  onIncludeAllKinds();
                  setKindMenuOpen(false);
                }}
              >
                <span style={{ flex: 1 }}>Include all types</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{distinctKinds.length}</span>
              </button>
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
              {distinctKinds.map((kind) => (
                <label key={kind} style={checkboxRow}>
                  <input
                    type="checkbox"
                    checked={includedKinds.has(kind)}
                    onChange={() => onToggleKind(kind)}
                  />
                  <span style={{ flex: 1 }}>{prettyKind(kind)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={controlsRow}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sort by</span>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as RelatedArtifactSort)}
          style={selectInput}
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div style={togglesRow}>
        <label style={checkboxRow}>
          <input type="checkbox" checked={showAutosaved} onChange={onToggleAutosaved} />
          <span>Show autosaved files</span>
        </label>
        <label style={checkboxRow}>
          <input type="checkbox" checked={showTrash} onChange={onToggleTrash} />
          <span>Show files in trash</span>
        </label>
      </div>

      <div style={listScroll}>
        {items.length === 0 ? (
          <div className="of-text-muted" style={{ fontSize: 12, padding: 8 }}>
            No related artifacts for the current selection.
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} style={itemRow}>
              <button
                type="button"
                style={itemTitle}
                onClick={() => onOpenArtifact(item)}
                title="Open artifact in its source application"
              >
                {item.label}
              </button>
              <div style={itemMetaRow}>
                <span style={kindChip}>{prettyKind(item.kind)}</span>
                {item.isAutosaved && <span style={flagChip}>autosaved</span>}
                {item.isTrashed && <span style={flagChipWarn}>trash</span>}
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  style={iconAction}
                  title="Focus on graph"
                  onClick={() => onFocusOnGraph(item)}
                >
                  ⊙
                </button>
              </div>
              {item.path && (
                <div style={itemPath} title={item.path}>
                  {item.path}
                </div>
              )}
              <div style={itemTimestamps}>
                <span>Created {formatTimestamp(item.createdAt)}</span>
                <span>Last modified {formatTimestamp(item.lastModifiedAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const panelRoot: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  height: '100%',
  minHeight: 0,
};
const controlsRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};
const togglesRow: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  paddingBottom: 4,
  borderBottom: '1px solid var(--border-subtle)',
};
const dropdown: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  padding: '6px 10px',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 12,
  color: 'var(--text-default)',
  cursor: 'pointer',
};
const dropdownMenu: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  right: 0,
  zIndex: 20,
  padding: '4px 0',
  maxHeight: 240,
  overflow: 'auto',
};
const chevron: CSSProperties = {
  color: 'var(--text-muted)',
};
const menuItemRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  padding: '6px 10px',
  background: 'transparent',
  border: 'none',
  fontSize: 12,
  color: 'var(--text-default)',
  cursor: 'pointer',
  textAlign: 'left',
};
const checkboxRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  color: 'var(--text-default)',
  padding: '4px 10px',
  cursor: 'pointer',
};
const selectInput: CSSProperties = {
  flex: 1,
  padding: '4px 6px',
  fontSize: 12,
  background: 'var(--bg-input)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-default)',
};
const listScroll: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const itemRow: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '8px 10px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
};
const itemTitle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-link)',
  textAlign: 'left',
  cursor: 'pointer',
};
const itemMetaRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  marginTop: 2,
};
const itemPath: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const itemTimestamps: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 4,
  fontSize: 10,
  color: 'var(--text-soft)',
};
const kindChip: CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 600,
  background: 'var(--bg-canvas)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};
const flagChip: CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 600,
  background: '#fff0e0',
  color: '#a14e10',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};
const flagChipWarn: CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 600,
  background: '#fde2e2',
  color: '#a40e0e',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};
const iconAction: CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: '2px 6px',
  fontSize: 14,
  color: 'var(--text-muted)',
  cursor: 'pointer',
};

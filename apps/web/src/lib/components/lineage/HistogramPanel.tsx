// Foundry's "Histogram of selection properties" panel. Renders a list of
// sections (resource type, branch, created-by, frequent columns, …) where
// each row is clickable to refine which nodes are highlighted on the
// canvas. Update Selection drills the actual selection down to the
// currently-highlighted set; Copy Names copies the labels of the
// currently-selected resources to the clipboard.

import { useState, type CSSProperties } from 'react';
import type { HistogramSection, HistogramSectionId } from '@/lib/lineage/selectionHistogram';

export interface HistogramFilter {
  sectionId: HistogramSectionId;
  value: string;
}

interface HistogramPanelProps {
  sections: HistogramSection[];
  selectionCount: number;
  highlightedCount: number;
  activeFilters: HistogramFilter[];
  onToggleFilter: (filter: HistogramFilter) => void;
  onClearFilters: () => void;
  onUpdateSelection: () => void;
  onCopyNames: () => void;
  /** Frequent-columns specific: requests background schema fetches. */
  onLoadColumns?: () => void;
  loadingColumns?: boolean;
  columnsAvailable: boolean;
}

export function HistogramPanel(props: HistogramPanelProps) {
  const {
    sections,
    selectionCount,
    highlightedCount,
    activeFilters,
    onToggleFilter,
    onClearFilters,
    onUpdateSelection,
    onCopyNames,
    onLoadColumns,
    loadingColumns,
    columnsAvailable,
  } = props;

  const activeKey = (sectionId: HistogramSectionId, value: string) => `${sectionId}::${value}`;
  const active = new Set(activeFilters.map((f) => activeKey(f.sectionId, f.value)));
  const hasFilters = activeFilters.length > 0;

  return (
    <div style={panelRoot}>
      <div style={panelHeader}>
        <div>
          <strong style={{ fontSize: 13, color: 'var(--text-strong)' }}>
            {selectionCount} resources selected
          </strong>
          {hasFilters && (
            <div className="of-text-muted" style={{ fontSize: 11, marginTop: 2 }}>
              Highlighting {highlightedCount} matching node(s) on canvas
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="of-btn"
            style={{ fontSize: 11, padding: '4px 8px' }}
            onClick={onCopyNames}
            title="Copy the names of currently selected resources"
          >
            Copy names
          </button>
        </div>
      </div>

      {hasFilters && (
        <div style={filtersBar}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {activeFilters.length} filter(s) active
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="of-btn"
            style={{ fontSize: 11, padding: '4px 8px' }}
            onClick={onClearFilters}
          >
            Clear
          </button>
          <button
            type="button"
            className="of-btn of-btn-primary"
            style={{ fontSize: 11, padding: '4px 8px' }}
            disabled={highlightedCount === 0 || highlightedCount === selectionCount}
            onClick={onUpdateSelection}
          >
            Update selection
          </button>
        </div>
      )}

      <div style={sectionsScroll}>
        {sections.map((section) => (
          <HistogramSectionView
            key={section.id}
            section={section}
            active={active}
            activeKey={activeKey}
            onToggleFilter={onToggleFilter}
            onLoadColumns={section.id === 'frequent_columns' ? onLoadColumns : undefined}
            loadingColumns={section.id === 'frequent_columns' && Boolean(loadingColumns)}
            columnsAvailable={section.id === 'frequent_columns' ? columnsAvailable : true}
          />
        ))}
      </div>
    </div>
  );
}

interface SectionViewProps {
  section: HistogramSection;
  active: Set<string>;
  activeKey: (sectionId: HistogramSectionId, value: string) => string;
  onToggleFilter: (filter: HistogramFilter) => void;
  onLoadColumns?: () => void;
  loadingColumns: boolean;
  columnsAvailable: boolean;
}

function HistogramSectionView(props: SectionViewProps) {
  const { section, active, activeKey, onToggleFilter, onLoadColumns, loadingColumns, columnsAvailable } = props;
  const [collapsed, setCollapsed] = useState(section.rows.length === 0);

  if (section.id === 'frequent_columns' && section.rows.length === 0) {
    return (
      <div style={sectionWrap}>
        <button type="button" style={sectionHeader} onClick={() => setCollapsed((v) => !v)}>
          <span>{section.title.toUpperCase()}</span>
          <span style={{ color: 'var(--text-muted)' }}>{collapsed ? '▸' : '▾'}</span>
        </button>
        {!collapsed && (
          <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-muted)' }}>
            {columnsAvailable ? (
              'No columns indexed yet — pick a dataset to fetch its schema.'
            ) : loadingColumns ? (
              'Loading schemas…'
            ) : (
              <button
                type="button"
                className="of-btn"
                style={{ fontSize: 11, padding: '4px 8px' }}
                onClick={onLoadColumns}
                disabled={loadingColumns}
              >
                Compute frequent columns
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (section.rows.length === 0) return null;

  return (
    <div style={sectionWrap}>
      <button type="button" style={sectionHeader} onClick={() => setCollapsed((v) => !v)}>
        <span>{section.title.toUpperCase()}</span>
        <span style={{ color: 'var(--text-muted)' }}>{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <div>
          {section.rows.map((row) => {
            const key = activeKey(section.id, row.value);
            const isActive = active.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onToggleFilter({ sectionId: section.id, value: row.value })}
                style={{
                  ...rowBtn,
                  ...(isActive ? rowBtnActive : {}),
                }}
                title={`${row.count} resource(s) match this value`}
              >
                <span style={rowLabel}>{row.value}</span>
                <span style={rowCount}>{isActive ? `${row.count} / ${row.count}` : row.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const panelRoot: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  gap: 10,
};
const panelHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  padding: '0 4px',
};
const filtersBar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 6px',
  background: 'var(--bg-canvas)',
  borderRadius: 'var(--radius-sm)',
};
const sectionsScroll: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const sectionWrap: CSSProperties = {
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  overflow: 'hidden',
};
const sectionHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  padding: '6px 10px',
  background: 'var(--bg-canvas)',
  border: 'none',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-default)',
  letterSpacing: '0.04em',
};
const rowBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '5px 10px',
  background: 'transparent',
  border: 'none',
  borderTop: '1px solid var(--border-subtle)',
  cursor: 'pointer',
  fontSize: 12,
  color: 'var(--text-default)',
  textAlign: 'left',
};
const rowBtnActive: CSSProperties = {
  background: 'var(--bg-chip-active)',
  color: 'var(--text-link)',
  fontWeight: 600,
};
const rowLabel: CSSProperties = {
  flex: 1,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  marginRight: 8,
};
const rowCount: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--text-muted)',
};

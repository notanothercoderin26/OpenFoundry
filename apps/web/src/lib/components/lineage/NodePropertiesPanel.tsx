// Foundry's "View node properties" sidebar panel. Shows About + Columns
// tabs for a single selected lineage node. About lists the linked
// ontology entities (object types backed by this dataset, or the parent
// ontology of an object-type node); Columns shows the dataset schema.

import { useState, type CSSProperties } from 'react';
import type { LineageNode } from '@/lib/api/pipelines';

export interface RelatedObjectType {
  id: string;
  label: string;
  /** Whether this node is the BACKING dataset or the WRITEBACK dataset. */
  relation: 'backing' | 'writeback';
}

export interface SchemaRow {
  name: string;
  type: string;
  nullable: string;
}

export interface NodeDescriptionState {
  text: string;
  updatedAt?: string;
  updatedBy?: string;
}

interface NodePropertiesPanelProps {
  node: LineageNode;
  relatedObjectTypes: RelatedObjectType[];
  schemaRows: SchemaRow[];
  schemaLoading: boolean;
  /** Persisted description from `/lineage/nodes/{id}/description`. */
  description: NodeDescriptionState | null;
  descriptionLoading: boolean;
  onOpenInOntologyManager: (objectTypeId: string) => void;
  onOpenDataset: (node: LineageNode) => void;
  /** Optional callbacks for Foundry's "Actions" Properties helper.
   *  When omitted, the corresponding rows are hidden so callers don't
   *  need stubs. */
  onAddDescription?: (node: LineageNode) => void;
  onClearDescription?: (node: LineageNode) => void;
  onReportIssue?: (node: LineageNode) => void;
  onCopyResourceId?: (node: LineageNode) => void;
}

type Tab = 'about' | 'columns';

export function NodePropertiesPanel(props: NodePropertiesPanelProps) {
  const {
    node,
    relatedObjectTypes,
    schemaRows,
    schemaLoading,
    description,
    descriptionLoading,
    onOpenInOntologyManager,
    onOpenDataset,
    onAddDescription,
    onClearDescription,
    onReportIssue,
    onCopyResourceId,
  } = props;
  const [tab, setTab] = useState<Tab>('about');
  const isDataset = node.kind === 'dataset';
  const isObjectType = node.kind === 'object_type';

  return (
    <div style={panelRoot}>
      <div style={tabsRow}>
        <button
          type="button"
          style={{ ...tabBtn, ...(tab === 'about' ? tabBtnActive : {}) }}
          onClick={() => setTab('about')}
        >
          About
        </button>
        <button
          type="button"
          style={{ ...tabBtn, ...(tab === 'columns' ? tabBtnActive : {}) }}
          onClick={() => setTab('columns')}
          disabled={!isDataset}
          title={isDataset ? 'Schema columns' : 'Columns are only available for datasets'}
        >
          Columns
        </button>
      </div>

      {tab === 'about' && (
        <div style={aboutScroll}>
          <div style={nodeHeading}>
            <span style={nodeChevron}>‹</span>
            <span style={{ flex: 1, fontWeight: 700, fontSize: 13, color: 'var(--text-strong)' }}>
              {node.label}
            </span>
            <span style={nodeChevron}>›</span>
          </div>
          <div className="of-text-muted" style={{ fontSize: 11, marginBottom: 10 }}>
            {prettyKind(node.kind)} · {node.marking}
          </div>

          <SectionCard title="Description">
            {descriptionLoading ? (
              <div className="of-text-muted" style={{ fontSize: 11, padding: '8px 10px' }}>
                Loading description…
              </div>
            ) : description && description.text ? (
              <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                  {description.text}
                </p>
                {(description.updatedAt || description.updatedBy) && (
                  <div className="of-text-muted" style={{ fontSize: 10 }}>
                    {description.updatedAt && `Last updated ${new Date(description.updatedAt).toLocaleString()}`}
                    {description.updatedAt && description.updatedBy && ' · '}
                    {description.updatedBy && `by ${description.updatedBy.slice(0, 8)}`}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  {onAddDescription && (
                    <button
                      type="button"
                      className="of-button"
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => onAddDescription(node)}
                    >
                      Edit
                    </button>
                  )}
                  {onClearDescription && (
                    <button
                      type="button"
                      className="of-button"
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => onClearDescription(node)}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="of-text-muted" style={{ fontSize: 11 }}>
                  No description has been added for this resource yet.
                </span>
                {onAddDescription && (
                  <button
                    type="button"
                    className="of-button"
                    style={{ fontSize: 11, padding: '2px 8px', alignSelf: 'flex-start' }}
                    onClick={() => onAddDescription(node)}
                  >
                    Add description…
                  </button>
                )}
              </div>
            )}
          </SectionCard>

          {isObjectType && (
            <SectionCard title="Ontology">
              <button
                type="button"
                style={linkRow}
                onClick={() => onOpenInOntologyManager(node.id)}
              >
                <span style={linkRowLabel}>Open in Ontology Manager</span>
                <span style={linkRowIcon}>↗</span>
              </button>
            </SectionCard>
          )}

          {isDataset && relatedObjectTypes.length > 0 && (
            <SectionCard title="Ontology entities">
              {relatedObjectTypes.map((rel) => (
                <button
                  key={rel.id}
                  type="button"
                  style={linkRow}
                  onClick={() => onOpenInOntologyManager(rel.id)}
                  title={
                    rel.relation === 'backing'
                      ? `This dataset backs the Ontology object [${rel.label}]`
                      : `Writeback target of object type [${rel.label}]`
                  }
                >
                  <span style={relationChip(rel.relation)}>{rel.relation}</span>
                  <span style={linkRowLabel}>{rel.label}</span>
                  <span style={linkRowIcon}>⚙</span>
                </button>
              ))}
            </SectionCard>
          )}

          <SectionCard title="Actions">
            {isDataset && (
              <button
                type="button"
                style={linkRow}
                onClick={() => onOpenDataset(node)}
              >
                <span style={linkRowLabel}>Open dataset preview</span>
                <span style={linkRowIcon}>↗</span>
              </button>
            )}
            {onCopyResourceId && (
              <button
                type="button"
                style={linkRow}
                onClick={() => onCopyResourceId(node)}
              >
                <span style={linkRowLabel}>Copy resource ID</span>
                <span style={linkRowIcon}>⧉</span>
              </button>
            )}
            {onReportIssue && (
              <button
                type="button"
                style={linkRow}
                onClick={() => onReportIssue(node)}
              >
                <span style={linkRowLabel}>Report an issue</span>
                <span style={linkRowIcon}>⚠</span>
              </button>
            )}
          </SectionCard>

          <SectionCard title="Metadata">
            <MetadataList metadata={node.metadata ?? {}} />
          </SectionCard>
        </div>
      )}

      {tab === 'columns' && (
        <div style={columnsScroll}>
          {!isDataset ? (
            <div className="of-text-muted" style={tabHint}>
              Columns are only available for datasets.
            </div>
          ) : schemaLoading && schemaRows.length === 0 ? (
            <div className="of-text-muted" style={tabHint}>Loading schema…</div>
          ) : schemaRows.length === 0 ? (
            <div className="of-text-muted" style={tabHint}>
              No schema captured for this dataset yet.
            </div>
          ) : (
            <table style={schemaTable}>
              <thead>
                <tr>
                  <th style={schemaTh}>Name</th>
                  <th style={schemaTh}>Type</th>
                  <th style={schemaTh}>Nullable</th>
                </tr>
              </thead>
              <tbody>
                {schemaRows.map((row) => (
                  <tr key={row.name}>
                    <td style={schemaTd}>{row.name}</td>
                    <td style={schemaTd}>{row.type}</td>
                    <td style={schemaTd}>{row.nullable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function MetadataList({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata).filter(([, value]) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean') return true;
    return false;
  });
  if (entries.length === 0) {
    return <div className="of-text-muted" style={{ fontSize: 11 }}>No metadata captured.</div>;
  }
  return (
    <dl style={metaList}>
      {entries.map(([key, value]) => (
        <div key={key} style={metaRow}>
          <dt style={metaKey}>{key}</dt>
          <dd style={metaValue}>{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={cardWrap}>
      <div style={cardTitle}>{title.toUpperCase()}</div>
      {children}
    </div>
  );
}

function prettyKind(kind: string): string {
  return kind.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const panelRoot: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
};
const tabsRow: CSSProperties = {
  display: 'flex',
  gap: 4,
  borderBottom: '1px solid var(--border-subtle)',
  marginBottom: 10,
};
const tabBtn: CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-muted)',
  cursor: 'pointer',
};
const tabBtnActive: CSSProperties = {
  color: 'var(--text-link)',
  borderBottom: '2px solid var(--text-link)',
};
const aboutScroll: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  paddingRight: 4,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};
const columnsScroll: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  paddingRight: 4,
};
const nodeHeading: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 0',
};
const nodeChevron: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 14,
};
const cardWrap: CSSProperties = {
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};
const cardTitle: CSSProperties = {
  padding: '6px 10px',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  background: 'var(--bg-canvas)',
  color: 'var(--text-muted)',
};
const linkRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '6px 10px',
  background: 'transparent',
  border: 'none',
  borderTop: '1px solid var(--border-subtle)',
  cursor: 'pointer',
  fontSize: 12,
  color: 'var(--text-default)',
  textAlign: 'left',
};
const linkRowLabel: CSSProperties = {
  flex: 1,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const linkRowIcon: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 13,
};
function relationChip(relation: 'backing' | 'writeback'): CSSProperties {
  return {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 600,
    background: relation === 'backing' ? '#e7eefb' : '#fff0e0',
    color: relation === 'backing' ? '#1d4d9d' : '#a14e10',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };
}
const metaList: CSSProperties = { margin: 0, padding: 0, display: 'flex', flexDirection: 'column' };
const metaRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)',
  gap: 8,
  padding: '4px 10px',
  borderTop: '1px solid var(--border-subtle)',
  fontSize: 11,
};
const metaKey: CSSProperties = {
  margin: 0,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const metaValue: CSSProperties = {
  margin: 0,
  color: 'var(--text-default)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const schemaTable: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
const schemaTh: CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  background: 'var(--bg-canvas)',
  color: 'var(--text-muted)',
  fontWeight: 600,
  borderBottom: '1px solid var(--border-subtle)',
};
const schemaTd: CSSProperties = {
  padding: '4px 8px',
  borderBottom: '1px solid var(--border-subtle)',
};
const tabHint: CSSProperties = {
  fontSize: 12,
  padding: 12,
};

import { useMemo } from 'react';

import {
  pipelineNodesFromDAG,
  type PipelineVersion,
} from '@/lib/api/pipelines';
import { Glyph } from '@/lib/components/ui/Glyph';
import { PipelineCanvas } from '@/lib/components/pipeline/PipelineCanvas';
import { diffPipelineVersions, diffSummary } from './versionDiff';

interface PipelineVersionViewerDrawerProps {
  open: boolean;
  mode: 'details' | 'changes';
  version: PipelineVersion | null;
  // For 'changes' mode, `previousVersion` is the older snapshot to diff against.
  previousVersion?: PipelineVersion | null;
  onClose: () => void;
}

export function PipelineVersionViewerDrawer({
  open,
  mode,
  version,
  previousVersion,
  onClose,
}: PipelineVersionViewerDrawerProps) {
  if (!open || !version) return null;

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.32)', zIndex: 60 }}
      />
      <div
        role="dialog"
        aria-label={mode === 'details' ? 'Version details' : 'Version changes'}
        style={{
          position: 'fixed',
          top: '5vh',
          left: '5vw',
          width: '90vw',
          height: '90vh',
          background: '#fff',
          borderRadius: 6,
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.24)',
          zIndex: 61,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <strong style={{ fontSize: 14 }}>
            {mode === 'details' ? 'Version details' : 'Changes between versions'}
          </strong>
          <span className="of-chip" style={{ fontSize: 11 }}>v{version.version_number}</span>
          <span className="of-chip" style={{ fontSize: 11 }}>{version.version_kind}</span>
          {mode === 'changes' && previousVersion && (
            <>
              <Glyph name="chevron-right" size={12} />
              <span className="of-chip" style={{ fontSize: 11 }}>v{previousVersion.version_number}</span>
              <span className="of-text-muted" style={{ fontSize: 11 }}>(baseline)</span>
            </>
          )}
          <span className="of-text-muted" style={{ marginLeft: 'auto', fontSize: 11 }}>
            {new Date(version.created_at).toLocaleString()}
          </span>
          <button type="button" className="of-button" onClick={onClose} aria-label="Close" style={{ padding: '2px 6px' }}>
            <Glyph name="x" size={12} />
          </button>
        </header>

        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {mode === 'details' ? (
            <DetailsView version={version} />
          ) : (
            <ChangesView version={version} previousVersion={previousVersion ?? null} />
          )}
        </div>
      </div>
    </>
  );
}

function DetailsView({ version }: { version: PipelineVersion }) {
  const nodes = useMemo(() => pipelineNodesFromDAG(version.dag), [version]);
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <PipelineCanvas nodes={nodes} readOnly />
    </div>
  );
}

function ChangesView({
  version,
  previousVersion,
}: {
  version: PipelineVersion;
  previousVersion: PipelineVersion | null;
}) {
  const diff = useMemo(
    () => diffPipelineVersions(previousVersion?.dag, version.dag),
    [previousVersion, version],
  );
  const summary = diffSummary(diff);
  const beforeNodes = useMemo(() => pipelineNodesFromDAG(previousVersion?.dag), [previousVersion]);
  const afterNodes = useMemo(() => pipelineNodesFromDAG(version.dag), [version]);

  if (!previousVersion) {
    return (
      <div style={{ padding: 24, display: 'grid', gap: 8 }}>
        <p style={{ margin: 0 }}>
          This is the first saved version; there is no prior snapshot to diff against.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', height: '100%' }}>
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ color: summary.tone, fontSize: 13 }}>{summary.label}</strong>
        {diff.added.length > 0 && (
          <span className="of-chip" style={{ background: '#dcfce7', color: '#15803d', fontSize: 11 }}>
            +{diff.added.length} added
          </span>
        )}
        {diff.removed.length > 0 && (
          <span className="of-chip" style={{ background: '#fee2e2', color: '#b91c1c', fontSize: 11 }}>
            −{diff.removed.length} removed
          </span>
        )}
        {diff.modified.length > 0 && (
          <span className="of-chip" style={{ background: '#fef3c7', color: '#92400e', fontSize: 11 }}>
            ~{diff.modified.length} modified
          </span>
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 360px',
          minHeight: 0,
          height: '100%',
        }}
      >
        <DiffPane title={`Before · v${previousVersion.version_number}`} nodes={beforeNodes} />
        <DiffPane title={`After · v${version.version_number}`} nodes={afterNodes} />
        <DiffLegend diff={diff} />
      </div>
    </div>
  );
}

function DiffPane({ title, nodes }: { title: string; nodes: ReturnType<typeof pipelineNodesFromDAG> }) {
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0, borderRight: '1px solid var(--border-subtle)' }}>
      <header style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)', background: '#f8fafc' }}>
        <strong style={{ fontSize: 12 }}>{title}</strong>
        <span className="of-text-muted" style={{ marginLeft: 6, fontSize: 11 }}>{nodes.length} nodes</span>
      </header>
      <div style={{ overflow: 'auto' }}>
        <PipelineCanvas nodes={nodes} readOnly />
      </div>
    </div>
  );
}

function DiffLegend({ diff }: { diff: ReturnType<typeof diffPipelineVersions> }) {
  return (
    <aside style={{ overflowY: 'auto', padding: 12, background: '#fafafa', display: 'grid', gap: 12 }}>
      <DiffSection
        title="Added"
        emptyLabel="No additions"
        tone="#15803d"
        items={diff.added.map((node) => ({ key: node.id, label: node.label, secondary: node.transform_type }))}
      />
      <DiffSection
        title="Removed"
        emptyLabel="No removals"
        tone="#b91c1c"
        items={diff.removed.map((node) => ({ key: node.id, label: node.label, secondary: node.transform_type }))}
      />
      <section>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', letterSpacing: 0.4 }}>MODIFIED</p>
        {diff.modified.length === 0 ? (
          <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>No modifications</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0', display: 'grid', gap: 6 }}>
            {diff.modified.map((entry) => (
              <li
                key={entry.after.id}
                style={{ border: '1px solid var(--border-subtle)', borderRadius: 4, padding: 8, background: '#fff' }}
              >
                <div style={{ fontSize: 12, fontWeight: 600 }}>{entry.after.label}</div>
                <div className="of-text-muted" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{entry.after.id}</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0', display: 'grid', gap: 2 }}>
                  {entry.changes.map((change) => (
                    <li key={change.field} style={{ fontSize: 11 }}>
                      <span className="of-text-muted">{change.field}</span>:{' '}
                      <span style={{ color: '#b91c1c', textDecoration: 'line-through' }}>{formatChangeValue(change.before)}</span>{' '}
                      <span style={{ color: '#15803d' }}>{formatChangeValue(change.after)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

function DiffSection({
  title,
  emptyLabel,
  tone,
  items,
}: {
  title: string;
  emptyLabel: string;
  tone: string;
  items: { key: string; label: string; secondary: string }[];
}) {
  return (
    <section>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', letterSpacing: 0.4 }}>{title.toUpperCase()}</p>
      {items.length === 0 ? (
        <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{emptyLabel}</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0', display: 'grid', gap: 4 }}>
          {items.map((item) => (
            <li
              key={item.key}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: tone }}
            >
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: tone }} />
              <strong>{item.label}</strong>
              <span className="of-text-muted" style={{ fontSize: 11 }}>{item.secondary}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === 'object') return '{…}';
  const text = String(value);
  return text.length > 32 ? `${text.slice(0, 29)}…` : text;
}

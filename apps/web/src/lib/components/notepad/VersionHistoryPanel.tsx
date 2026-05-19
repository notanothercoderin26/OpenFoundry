import { useEffect, useMemo, useState } from 'react';

import {
  createNotepadRevision,
  listNotepadRevisions,
  revertNotepadRevision,
  type NotepadDocument,
  type NotepadRevision,
} from '@/lib/api/notepad';

export interface VersionHistoryPanelProps {
  documentId: string;
  // The current document; the panel reads it for the "Current session"
  // anchor and re-fetches the list on every save/AIP index event.
  current: NotepadDocument | null;
  // Callback fired after a successful revert so the parent can swap
  // the editor over to the rehydrated state.
  onReverted: (doc: NotepadDocument) => void;
  // Callback to preview a past revision in the editor (read-only).
  // The parent decides how to render it; the panel only sends the row.
  onSelect: (revision: NotepadRevision | null) => void;
  // Selected revision id (so the panel can highlight the active row).
  selectedRev: number | null;
  // Optional callback for the "Compare with" selector. When both a
  // previewed revision and a compare-with are set, the parent should
  // render the diff view.
  onCompareChange?: (compareWith: NotepadRevision | null) => void;
}

type Filter = 'user' | 'all';

export function VersionHistoryPanel({
  documentId,
  current,
  onReverted,
  onSelect,
  selectedRev,
  onCompareChange,
}: VersionHistoryPanelProps) {
  const [filter, setFilter] = useState<Filter>('user');
  const [showChanges, setShowChanges] = useState(false);
  const [compareWith, setCompareWith] = useState<number | null>(null);
  const [revisions, setRevisions] = useState<NotepadRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [reverting, setReverting] = useState<number | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [error, setError] = useState('');

  const refresh = useMemo(
    () => async () => {
      if (!documentId) return;
      try {
        const result = await listNotepadRevisions(documentId, filter === 'all');
        setRevisions(result.data);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to load history');
      } finally {
        setLoading(false);
      }
    },
    [documentId, filter],
  );

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  // When the parent saves or reverts, current.updated_at changes —
  // re-fetch so newly-created autosaves / manuals show up.
  useEffect(() => {
    if (!current) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.updated_at]);

  async function handleManualSave(name: string, endorsed: boolean) {
    setError('');
    try {
      await createNotepadRevision(documentId, { name, endorsed });
      setShowSaveModal(false);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save version');
    }
  }

  async function handleRevert(revision: NotepadRevision) {
    if (!window.confirm(`Revert document to v${revision.rev}? Your current state will be snapshotted first.`)) {
      return;
    }
    setReverting(revision.rev);
    setError('');
    try {
      const updated = await revertNotepadRevision(documentId, revision.rev);
      onReverted(updated);
      onSelect(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to revert');
    } finally {
      setReverting(null);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 className="of-heading-md" style={{ margin: 0, fontSize: 14 }}>
          Version history
        </h3>
        <button
          type="button"
          className="of-btn"
          onClick={() => setShowSaveModal(true)}
          title="Save a new version"
          style={{ minWidth: 28, height: 28, fontSize: 16, padding: '0 8px' }}
        >
          +
        </button>
      </header>

      <select
        className="of-select"
        value={filter}
        onChange={(e) => setFilter(e.target.value as Filter)}
        style={{ fontSize: 13 }}
      >
        <option value="user">User-created versions</option>
        <option value="all">All versions</option>
      </select>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={showChanges}
          onChange={(e) => {
            setShowChanges(e.target.checked);
            if (!e.target.checked) {
              setCompareWith(null);
              onCompareChange?.(null);
            }
          }}
        />
        Show changes
      </label>
      {showChanges && (
        <select
          className="of-select"
          value={compareWith ?? ''}
          onChange={(e) => {
            const next = e.target.value ? Number(e.target.value) : null;
            setCompareWith(next);
            const revision = revisions.find((r) => r.rev === next) ?? null;
            onCompareChange?.(revision);
          }}
          style={{ fontSize: 13 }}
        >
          <option value="">Compare with…</option>
          {revisions.map((rev) => (
            <option key={rev.id} value={rev.rev}>
              v{rev.rev} {revisionLabel(rev)}
            </option>
          ))}
        </select>
      )}

      {error && (
        <div className="of-status-danger" style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gap: 4, maxHeight: 480, overflowY: 'auto' }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelect(null)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(null)}
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            cursor: 'pointer',
            background: selectedRev === null ? 'var(--bg-panel-muted)' : 'transparent',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Current session
        </div>

        {loading ? (
          <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        ) : revisions.length === 0 ? (
          <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 13 }}>No saved versions yet.</div>
        ) : (
          revisions.map((revision) => (
            <RevisionRow
              key={revision.id}
              revision={revision}
              selected={selectedRev === revision.rev}
              reverting={reverting === revision.rev}
              onClick={() => onSelect(revision)}
              onRevert={() => void handleRevert(revision)}
            />
          ))
        )}
      </div>

      {showSaveModal && (
        <SaveVersionModal onCancel={() => setShowSaveModal(false)} onSave={handleManualSave} />
      )}

      {showChanges && compareWith !== null && selectedRev !== null && selectedRev !== compareWith && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
          Comparing v{selectedRev} ↔ v{compareWith} in the preview pane.
        </p>
      )}
    </div>
  );
}

export function getCompareSelection(rev: number | null, compareWith: number | null) {
  if (rev === null || compareWith === null) return null;
  return { left: compareWith, right: rev };
}

interface RevisionRowProps {
  revision: NotepadRevision;
  selected: boolean;
  reverting: boolean;
  onClick: () => void;
  onRevert: () => void;
}

function RevisionRow({ revision, selected, reverting, onClick, onRevert }: RevisionRowProps) {
  const formatted = new Date(revision.created_at).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
      style={{
        padding: '8px 10px',
        borderRadius: 6,
        cursor: 'pointer',
        background: selected ? 'var(--bg-panel-muted)' : 'transparent',
        display: 'grid',
        gap: 4,
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 600 }}>v{revision.rev}</span>
        {revision.endorsed && (
          <span title="Endorsed" style={{ color: '#0284c7', fontSize: 12 }}>
            ✓
          </span>
        )}
        <span style={{ color: 'var(--text-muted)' }}>{revisionLabel(revision)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{formatted}</span>
        <button
          type="button"
          className="of-btn"
          onClick={(e) => {
            e.stopPropagation();
            onRevert();
          }}
          disabled={reverting}
          title="Revert to this version"
          style={{ minWidth: 24, height: 24, padding: '0 6px', fontSize: 12 }}
        >
          {reverting ? '…' : '↶'}
        </button>
      </div>
    </div>
  );
}

function revisionLabel(revision: NotepadRevision): string {
  if (revision.name) return revision.name;
  switch (revision.kind) {
    case 'initial':
      return 'Initial empty document';
    case 'manual':
      return 'Manually saved version';
    case 'autosave':
    default:
      return 'Autosaved version';
  }
}

interface SaveVersionModalProps {
  onCancel: () => void;
  onSave: (name: string, endorsed: boolean) => void;
}

function SaveVersionModal({ onCancel, onSave }: SaveVersionModalProps) {
  const [name, setName] = useState('');
  const [endorsed, setEndorsed] = useState(false);
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)',
          padding: 24,
          borderRadius: 'var(--radius-md)',
          minWidth: 380,
          maxWidth: 520,
          display: 'grid',
          gap: 16,
        }}
      >
        <h3 className="of-heading-md" style={{ margin: 0 }}>
          Save a new version
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Notepad automatically saves versions every 5 minutes if there's activity. To manually save
          a version, optionally name it below and save.
        </p>
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span className="of-eyebrow">Version name (optional)</span>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Version name"
            style={{
              padding: '8px 10px',
              border: '1px solid var(--border-default)',
              borderRadius: 6,
              fontSize: 14,
            }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={endorsed} onChange={(e) => setEndorsed(e.target.checked)} />
          <span style={{ color: '#0284c7' }}>✓</span> Add endorsement
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="of-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="of-btn of-btn-primary"
            onClick={() => onSave(name.trim(), endorsed)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import { listProjects, type OntologyProject } from '@/lib/api/ontology';

interface SaveSearchAroundModalProps {
  open: boolean;
  defaultTitle: string;
  onCancel: () => void;
  onSave: (params: { title: string; description: string; projectId: string }) => void;
}

// Save modal that mirrors the Palantir "Save as" dialog: file name +
// project picker. The project picker is the same flat list the
// pipeline location dialog uses — reuse the API rather than dragging
// in a tree component.
export function SaveSearchAroundModal({
  open,
  defaultTitle,
  onCancel,
  onSave,
}: SaveSearchAroundModalProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState('');
  const [projects, setProjects] = useState<OntologyProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setDescription('');
    setSelectedProjectId('');
    setSearch('');
  }, [open, defaultTitle]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    listProjects({ per_page: 100 })
      .then((res) => {
        if (!cancelled) setProjects(res.data);
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
  }, [open]);

  const filteredProjects = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((p) => (p.display_name || p.slug).toLowerCase().includes(needle));
  }, [projects, search]);

  if (!open) return null;

  const canSave = Boolean(title.trim()) && Boolean(selectedProjectId);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vertex-save-sa-title"
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
        style={{ width: '100%', maxWidth: 480, background: '#fff' }}
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
          <strong id="vertex-save-sa-title">Save Search Around</strong>
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

        <div style={{ padding: 14, display: 'grid', gap: 10 }}>
          <label style={{ fontSize: 12 }}>
            Title
            <input
              className="of-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. NY-bound flights from a starting airport"
            />
          </label>
          <label style={{ fontSize: 12 }}>
            Description
            <textarea
              className="of-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional notes for the resource"
            />
          </label>

          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Project</div>
            <input
              className="of-input"
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginBottom: 6 }}
            />
            <div
              style={{
                maxHeight: 220,
                overflow: 'auto',
                border: '1px solid var(--border-default)',
                borderRadius: 4,
              }}
            >
              {loading && (
                <div style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                  Loading projects…
                </div>
              )}
              {!loading && filteredProjects.length === 0 && (
                <div style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                  No projects match.
                </div>
              )}
              {filteredProjects.map((p) => {
                const selected = p.id === selectedProjectId;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setSelectedProjectId(p.id)}
                    className="of-btn-ghost"
                    style={{
                      display: 'flex',
                      width: '100%',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      borderBottom: '1px solid var(--border-subtle)',
                      background: selected ? 'var(--surface-selected, #eaf2ff)' : 'transparent',
                      textAlign: 'left',
                      fontSize: 12,
                    }}
                  >
                    <Glyph name="project" size={12} />
                    <span>{p.display_name || p.slug}</span>
                    {selected && (
                      <span style={{ marginLeft: 'auto', color: 'var(--accent-default)' }}>
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="of-status-warning" style={{ fontSize: 12 }}>
              {error}
            </div>
          )}
        </div>

        <footer
          style={{
            padding: '10px 14px',
            borderTop: '1px solid var(--border-default)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 6,
          }}
        >
          <button type="button" className="of-btn of-btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="of-btn of-btn-primary"
            disabled={!canSave}
            onClick={() =>
              onSave({
                title: title.trim(),
                description,
                projectId: selectedProjectId,
              })
            }
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}

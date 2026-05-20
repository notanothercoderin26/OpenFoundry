import { useEffect, useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import { listProjects, type OntologyProject } from '@/lib/api/ontology';

interface ChoosePipelineLocationDialogProps {
  open: boolean;
  initialFileName: string;
  initialProjectId: string;
  onCancel: () => void;
  onSave: (params: { fileName: string; projectId: string; projectLabel: string }) => void;
}

type View = 'roots' | 'projects';

interface RootItem {
  id: string;
  label: string;
  icon: 'badge-check' | 'project' | 'history' | 'star' | 'users' | 'object';
  iconTone?: string;
  enabled: boolean;
  hint?: string;
}

const ROOT_ITEMS: RootItem[] = [
  { id: 'data-catalog', label: 'Dataset Preview', icon: 'badge-check', iconTone: '#7c3aed', enabled: false, hint: 'Read-only' },
  { id: 'all-projects', label: 'All projects', icon: 'project', enabled: true },
  { id: 'recent-files', label: 'Recent files', icon: 'history', enabled: false, hint: 'No recents' },
  { id: 'favorites', label: 'Favorites', icon: 'star', enabled: false, hint: 'No favorites' },
  { id: 'shared-with-you', label: 'Shared with you', icon: 'users', enabled: false, hint: 'Empty' },
  { id: 'your-files', label: 'Your files', icon: 'object', enabled: false, hint: 'Empty' },
];

export function ChoosePipelineLocationDialog({
  open,
  initialFileName,
  initialProjectId,
  onCancel,
  onSave,
}: ChoosePipelineLocationDialogProps) {
  const [fileName, setFileName] = useState(initialFileName);
  const [view, setView] = useState<View>('roots');
  const [projects, setProjects] = useState<OntologyProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setFileName(initialFileName);
    setSelectedProjectId(initialProjectId);
    setSearch('');
    setView(initialProjectId ? 'projects' : 'roots');
  }, [open, initialFileName, initialProjectId]);

  useEffect(() => {
    if (!open || view !== 'projects' || projects.length > 0) return;
    let cancelled = false;
    setLoadingProjects(true);
    setProjectError('');
    listProjects({ per_page: 100 })
      .then((res) => {
        if (!cancelled) setProjects(res.data);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setProjectError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, view, projects.length]);

  const filteredProjects = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) => {
      const label = project.display_name || project.slug;
      return label.toLowerCase().includes(needle);
    });
  }, [projects, search]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  if (!open) return null;

  const canSave = Boolean(fileName.trim()) && Boolean(selectedProjectId);

  function handleSave() {
    if (!canSave || !selectedProject) return;
    onSave({
      fileName: fileName.trim(),
      projectId: selectedProject.id,
      projectLabel: selectedProject.display_name || selectedProject.slug,
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="choose-pipeline-location-title"
      className="of-pipe-loc-backdrop"
      onClick={onCancel}
    >
      <div className="of-pipe-loc-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="of-pipe-loc-header">
          <h2 id="choose-pipeline-location-title">Choose pipeline location</h2>
          <button
            type="button"
            onClick={onCancel}
            className="of-pipe-loc-close"
            aria-label="Close"
          >
            <Glyph name="x" size={16} />
          </button>
        </header>

        <div className="of-pipe-loc-body">
          <div className="of-pipe-loc-saveas">
            <label htmlFor="of-pipe-loc-filename" className="of-pipe-loc-saveas-label">
              Save as:
            </label>
            <div className="of-pipe-loc-saveas-input">
              <span className="of-pipe-loc-pipe-icon" aria-hidden="true">
                <PipelineGlyph size={16} />
              </span>
              <input
                id="of-pipe-loc-filename"
                type="text"
                value={fileName}
                onChange={(event) => setFileName(event.target.value)}
                placeholder="File name"
                className="of-pipe-loc-input-bare"
              />
            </div>
          </div>

          <div className="of-pipe-loc-toolbar">
            <button
              type="button"
              onClick={() => setView('roots')}
              disabled={view === 'roots'}
              className="of-pipe-loc-arrow"
              aria-label="Back"
            >
              <Glyph name="chevron-left" size={16} />
            </button>
            <button
              type="button"
              onClick={() => setView('projects')}
              disabled={view === 'projects'}
              className="of-pipe-loc-arrow"
              aria-label="Forward"
            >
              <Glyph name="chevron-right" size={16} />
            </button>
            <div className="of-pipe-loc-search">
              <Glyph name="search" size={14} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search..."
              />
            </div>
          </div>

          <div className="of-pipe-loc-tabs">
            <span className="of-pipe-loc-tab of-pipe-loc-tab--active">All</span>
          </div>

          <div className="of-pipe-loc-list">
            {view === 'roots' && ROOT_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={!item.enabled}
                onClick={() => item.id === 'all-projects' && setView('projects')}
                className="of-pipe-loc-row"
              >
                <span className="of-pipe-loc-row-icon">
                  <Glyph name={item.icon} size={16} tone={item.iconTone ?? undefined} />
                </span>
                <span className="of-pipe-loc-row-label">{item.label}</span>
                {item.hint && <span className="of-pipe-loc-row-hint">{item.hint}</span>}
                <span className="of-pipe-loc-row-chevron">
                  <Glyph name="chevron-right" size={14} />
                </span>
              </button>
            ))}

            {view === 'projects' && (
              <>
                <div className="of-pipe-loc-breadcrumb">
                  <button
                    type="button"
                    onClick={() => setView('roots')}
                    className="of-pipe-loc-breadcrumb-link"
                  >
                    All
                  </button>
                  <Glyph name="chevron-right" size={12} />
                  <span>All projects</span>
                </div>
                {loadingProjects && (
                  <div className="of-pipe-loc-empty">Loading projects...</div>
                )}
                {!loadingProjects && projectError && (
                  <div className="of-pipe-loc-empty of-pipe-loc-empty--error">{projectError}</div>
                )}
                {!loadingProjects && !projectError && filteredProjects.length === 0 && (
                  <div className="of-pipe-loc-empty">No projects available.</div>
                )}
                {!loadingProjects && !projectError && filteredProjects.map((project) => {
                  const active = project.id === selectedProjectId;
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`of-pipe-loc-row${active ? ' of-pipe-loc-row--active' : ''}`}
                    >
                      <span className="of-pipe-loc-row-icon">
                        <Glyph name="folder" size={16} />
                      </span>
                      <span className="of-pipe-loc-row-label">
                        {project.display_name || project.slug}
                      </span>
                      {active && (
                        <span className="of-pipe-loc-row-check">
                          <Glyph name="check" size={14} tone="#2d72d2" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>

        <footer className="of-pipe-loc-footer">
          <button type="button" onClick={onCancel} className="of-button">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="of-button of-button--primary"
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}

function PipelineGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="3" y="9" width="6" height="6" rx="1.5" stroke="#15803d" strokeWidth="1.6" />
      <rect x="15" y="9" width="6" height="6" rx="1.5" stroke="#15803d" strokeWidth="1.6" />
      <path d="M9 12h6" stroke="#15803d" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

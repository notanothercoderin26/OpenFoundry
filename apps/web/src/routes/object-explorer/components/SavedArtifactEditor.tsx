import { useEffect } from 'react';

import type {
  ObjectExplorerSavedArtifactKind,
  ObjectExplorerSavedArtifactPrivacy,
  ObjectType,
} from '@/lib/api/ontology';

import './SavedArtifacts.css';

export interface SavedArtifactEditorProps {
  open: boolean;
  objectTypesWithVisibleRows: ObjectType[];
  busy: boolean;

  newSetName: string;
  setNewSetName: (value: string) => void;
  newSetType: string;
  setNewSetType: (value: string) => void;
  newSetDescription: string;
  setNewSetDescription: (value: string) => void;
  newSetWhatIf: string;
  setNewSetWhatIf: (value: string) => void;

  saveKind: ObjectExplorerSavedArtifactKind;
  setSaveKind: (value: ObjectExplorerSavedArtifactKind) => void;
  savePrivacy: ObjectExplorerSavedArtifactPrivacy;
  setSavePrivacy: (value: ObjectExplorerSavedArtifactPrivacy) => void;
  saveProjectId: string;
  setSaveProjectId: (value: string) => void;
  saveFolderPath: string;
  setSaveFolderPath: (value: string) => void;
  saveLayoutView: string;
  setSaveLayoutView: (value: string) => void;
  saveColumns: string;
  setSaveColumns: (value: string) => void;
  lastShareLink: string;

  onSubmit: () => void;
  onClose: () => void;
}

export function SavedArtifactEditor({
  open,
  objectTypesWithVisibleRows,
  busy,
  newSetName,
  setNewSetName,
  newSetType,
  setNewSetType,
  newSetDescription,
  setNewSetDescription,
  newSetWhatIf,
  setNewSetWhatIf,
  saveKind,
  setSaveKind,
  savePrivacy,
  setSavePrivacy,
  saveProjectId,
  setSaveProjectId,
  saveFolderPath,
  setSaveFolderPath,
  saveLayoutView,
  setSaveLayoutView,
  saveColumns,
  setSaveColumns,
  lastShareLink,
  onSubmit,
  onClose,
}: SavedArtifactEditorProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New artifact"
      className="oe oe-artifact-editor__backdrop"
      onClick={onClose}
    >
      <form
        className="oe-artifact-editor"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onSubmit();
        }}
      >
        <header className="oe-artifact-editor__header">
          <h2>New artifact</h2>
          <button
            type="button"
            className="oe-artifact-editor__close"
            aria-label="Close"
            onClick={onClose}
          >
            <CloseGlyph />
          </button>
        </header>

        <div className="oe-artifact-editor__body">
          <div className="oe-artifact-editor__row" data-cols="2">
            <Field label="Title">
              <input
                value={newSetName}
                onChange={(event) => setNewSetName(event.target.value)}
                placeholder="My exploration"
                autoFocus
              />
            </Field>
            <Field label="Kind">
              <select
                value={saveKind}
                onChange={(event) => setSaveKind(event.target.value as ObjectExplorerSavedArtifactKind)}
              >
                <option value="exploration">Exploration</option>
                <option value="list">Object list</option>
              </select>
            </Field>
          </div>

          <Field label="Base object type">
            <select value={newSetType} onChange={(event) => setNewSetType(event.target.value)}>
              <option value="">Pick base type</option>
              {objectTypesWithVisibleRows.map((type) => (
                <option key={type.id} value={type.id}>{type.display_name}</option>
              ))}
            </select>
          </Field>

          <Field label="Description">
            <textarea
              value={newSetDescription}
              onChange={(event) => setNewSetDescription(event.target.value)}
              placeholder="What does this artifact answer?"
            />
          </Field>

          <div className="oe-artifact-editor__row" data-cols="2">
            <Field label="Privacy">
              <select
                value={savePrivacy}
                onChange={(event) => setSavePrivacy(event.target.value as ObjectExplorerSavedArtifactPrivacy)}
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </Field>
            <Field label="Folder path">
              <input
                value={savePrivacy === 'private' ? '/home/Explorations' : saveFolderPath}
                onChange={(event) => setSaveFolderPath(event.target.value)}
                disabled={savePrivacy === 'private'}
                placeholder="/Shared/Explorations"
              />
            </Field>
          </div>

          {savePrivacy === 'public' && (
            <Field label="Project ID">
              <input
                value={saveProjectId}
                onChange={(event) => setSaveProjectId(event.target.value)}
                placeholder="proj_…"
              />
            </Field>
          )}

          <div className="oe-artifact-editor__row" data-cols="2">
            <Field label="Layout">
              <select
                value={saveLayoutView}
                onChange={(event) => setSaveLayoutView(event.target.value)}
              >
                <option value="split">Split</option>
                <option value="table">Table</option>
                <option value="cards">Cards</option>
              </select>
            </Field>
            <Field label="Columns">
              <input
                value={saveColumns}
                onChange={(event) => setSaveColumns(event.target.value)}
                placeholder="id, title, marking"
              />
            </Field>
          </div>

          <Field label="What-if label">
            <input
              value={newSetWhatIf}
              onChange={(event) => setNewSetWhatIf(event.target.value)}
              placeholder="Optional scenario tag"
            />
          </Field>
        </div>

        <footer className="oe-artifact-editor__footer">
          {lastShareLink ? (
            <a href={lastShareLink} className="oe-artifact-editor__share" title={lastShareLink}>
              {lastShareLink}
            </a>
          ) : (
            <span className="oe-artifact-editor__share" />
          )}
          <button type="submit" className="oe-artifact-editor__cta" disabled={busy}>
            {busy ? 'Saving…' : saveKind === 'list' ? 'Save list' : 'Save exploration'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="oe-artifact-editor__field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function CloseGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="m2 2 8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

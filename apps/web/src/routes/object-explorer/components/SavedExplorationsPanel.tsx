import {
  objectExplorerSavedArtifactAccess,
  objectExplorerSavedArtifactKind,
  objectExplorerShareLink,
  type ObjectSetDefinition,
  type ObjectSetEvaluationResponse,
  type ObjectExplorerSavedArtifactKind,
  type ObjectExplorerSavedArtifactPrivacy,
  type ObjectType,
  type OntologyPermissionPrincipal,
} from '@/lib/api/ontology';

import { EmptyState, MetricCard, PanelHeader } from './atoms';
import { numberFormatter, shortId, type EvaluationMode } from '../state';

interface SavedExplorationsPanelProps {
  visibleObjectSets: ObjectSetDefinition[];
  typeById: Map<string, ObjectType>;
  principal: OntologyPermissionPrincipal;
  objectTypesWithVisibleRows: ObjectType[];
  evaluationSetId: string;
  evaluation: ObjectSetEvaluationResponse | null;
  evaluationRows: Record<string, unknown>[];
  objectSetBusy: boolean;
  objectSetError: string;

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

  onCreateSet: () => void;
  onOpenSavedExploration: (set: ObjectSetDefinition) => void;
  onEvaluateSet: (id: string, mode: EvaluationMode) => void;
}

export function SavedExplorationsPanel({
  visibleObjectSets,
  typeById,
  principal,
  objectTypesWithVisibleRows,
  evaluationSetId,
  evaluation,
  evaluationRows,
  objectSetBusy,
  objectSetError,
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
  onCreateSet,
  onOpenSavedExploration,
  onEvaluateSet,
}: SavedExplorationsPanelProps) {
  return (
    <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
      <PanelHeader label="Saved explorations" value={`${visibleObjectSets.length}`} />

      {objectSetError && (
        <div className="of-status-danger" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          {objectSetError}
        </div>
      )}

      <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(min(100%, 180px), 1fr) minmax(min(100%, 160px), 180px)' }}>
          <input value={newSetName} onChange={(event) => setNewSetName(event.target.value)} placeholder="Title" className="of-input" />
          <select value={saveKind} onChange={(event) => setSaveKind(event.target.value as ObjectExplorerSavedArtifactKind)} className="of-input">
            <option value="exploration">Exploration</option>
            <option value="list">Object list</option>
          </select>
        </div>
        <select value={newSetType} onChange={(event) => setNewSetType(event.target.value)} className="of-input">
          <option value="">Pick base type</option>
          {objectTypesWithVisibleRows.map((type) => (
            <option key={type.id} value={type.id}>{type.display_name}</option>
          ))}
        </select>
        <input value={newSetDescription} onChange={(event) => setNewSetDescription(event.target.value)} placeholder="Description" className="of-input" />
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(min(100%, 120px), 160px) minmax(min(100%, 150px), 1fr)' }}>
          <select value={savePrivacy} onChange={(event) => setSavePrivacy(event.target.value as ObjectExplorerSavedArtifactPrivacy)} className="of-input">
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
          <input
            value={savePrivacy === 'private' ? '/home/Explorations' : saveFolderPath}
            onChange={(event) => setSaveFolderPath(event.target.value)}
            disabled={savePrivacy === 'private'}
            placeholder="Folder path"
            className="of-input"
          />
        </div>
        {savePrivacy === 'public' && (
          <input value={saveProjectId} onChange={(event) => setSaveProjectId(event.target.value)} placeholder="Project ID" className="of-input" />
        )}
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(min(100%, 120px), 160px) minmax(min(100%, 150px), 1fr)' }}>
          <select value={saveLayoutView} onChange={(event) => setSaveLayoutView(event.target.value)} className="of-input">
            <option value="split">Split</option>
            <option value="table">Table</option>
            <option value="cards">Cards</option>
          </select>
          <input value={saveColumns} onChange={(event) => setSaveColumns(event.target.value)} placeholder="Columns" className="of-input" />
        </div>
        <input value={newSetWhatIf} onChange={(event) => setNewSetWhatIf(event.target.value)} placeholder="What-if label" className="of-input" />
        <button type="button" onClick={onCreateSet} disabled={objectSetBusy} className="of-button of-button--primary">
          {objectSetBusy ? 'Working' : saveKind === 'list' ? 'Save list' : 'Save exploration'}
        </button>
        {lastShareLink && (
          <a href={lastShareLink} className="of-link" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lastShareLink}
          </a>
        )}
      </section>

      <div style={{ display: 'grid', gap: 6, maxHeight: 300, overflow: 'auto' }}>
        {visibleObjectSets.map((set) => {
          const access = objectExplorerSavedArtifactAccess(set, typeById.get(set.base_object_type_id), principal);
          const shareLink = objectExplorerShareLink(set, typeof window !== 'undefined' ? window.location.origin : '');
          return (
            <article
              key={set.id}
              className={evaluationSetId === set.id ? 'of-panel' : 'of-panel-muted'}
              style={{ padding: 10, display: 'grid', gap: 8 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {set.name}
                  </strong>
                  <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>
                    {typeById.get(set.base_object_type_id)?.display_name ?? shortId(set.base_object_type_id)}
                  </p>
                </div>
                <span className="of-chip">{numberFormatter.format(set.materialized_row_count)} rows</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                <span className="of-chip">{objectExplorerSavedArtifactKind(set)}</span>
                <span className="of-chip">{access.privacy}</span>
                {access.schema_only && <span className="of-chip">schema only</span>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button type="button" onClick={() => onOpenSavedExploration(set)} disabled={objectSetBusy} className="of-button of-button--primary">
                  Open
                </button>
                <button type="button" onClick={() => onEvaluateSet(set.id, 'preview')} disabled={objectSetBusy || !access.can_view_objects} className="of-button">
                  Preview
                </button>
                <button type="button" onClick={() => onEvaluateSet(set.id, 'materialize')} disabled={objectSetBusy || !access.can_view_objects} className="of-button">
                  Materialize
                </button>
                <a href={shareLink} className="of-button">Share</a>
              </div>
            </article>
          );
        })}
        {visibleObjectSets.length === 0 && <EmptyState label="No saved explorations." compact />}
      </div>

      {evaluation && (
        <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
          <PanelHeader label="Last evaluation" value={`${evaluation.total_rows} rows`} />
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))' }}>
            <MetricCard label="Base matches" value={`${evaluation.total_base_matches}`} />
            <MetricCard label="Neighbors" value={`${evaluation.traversal_neighbor_count}`} />
            <MetricCard label="Materialized" value={evaluation.materialized ? 'Yes' : 'No'} />
          </div>
          <div style={{ display: 'grid', gap: 6, maxHeight: 240, overflow: 'auto' }}>
            {evaluationRows.map((row, index) => (
              <pre
                key={index}
                style={{
                  margin: 0,
                  padding: 8,
                  background: 'var(--bg-default)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(row, null, 2)}
              </pre>
            ))}
            {evaluationRows.length === 0 && <EmptyState label="No evaluation rows." compact />}
          </div>
        </section>
      )}
    </section>
  );
}

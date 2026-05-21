import { useState } from 'react';

import type {
  ObjectExplorerSavedArtifactKind,
  ObjectExplorerSavedArtifactPrivacy,
  ObjectSetDefinition,
  ObjectSetEvaluationResponse,
  ObjectType,
  OntologyPermissionPrincipal,
} from '@/lib/api/ontology';

import type { EvaluationMode } from '../state';
import { SavedArtifactEditor } from './SavedArtifactEditor';
import { SavedArtifactsGrid } from './SavedArtifactsGrid';

export interface SavedExplorationsPanelProps {
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

export function SavedExplorationsPanel(props: SavedExplorationsPanelProps) {
  const [editorOpen, setEditorOpen] = useState(false);

  function handleSubmit() {
    props.onCreateSet();
    setEditorOpen(false);
  }

  return (
    <>
      <SavedArtifactsGrid
        visibleObjectSets={props.visibleObjectSets}
        typeById={props.typeById}
        principal={props.principal}
        evaluationSetId={props.evaluationSetId}
        evaluation={props.evaluation}
        evaluationRows={props.evaluationRows}
        objectSetBusy={props.objectSetBusy}
        objectSetError={props.objectSetError}
        onCreate={() => setEditorOpen(true)}
        onOpenSavedExploration={props.onOpenSavedExploration}
        onEvaluateSet={props.onEvaluateSet}
      />
      <SavedArtifactEditor
        open={editorOpen}
        objectTypesWithVisibleRows={props.objectTypesWithVisibleRows}
        busy={props.objectSetBusy}
        newSetName={props.newSetName}
        setNewSetName={props.setNewSetName}
        newSetType={props.newSetType}
        setNewSetType={props.setNewSetType}
        newSetDescription={props.newSetDescription}
        setNewSetDescription={props.setNewSetDescription}
        newSetWhatIf={props.newSetWhatIf}
        setNewSetWhatIf={props.setNewSetWhatIf}
        saveKind={props.saveKind}
        setSaveKind={props.setSaveKind}
        savePrivacy={props.savePrivacy}
        setSavePrivacy={props.setSavePrivacy}
        saveProjectId={props.saveProjectId}
        setSaveProjectId={props.setSaveProjectId}
        saveFolderPath={props.saveFolderPath}
        setSaveFolderPath={props.setSaveFolderPath}
        saveLayoutView={props.saveLayoutView}
        setSaveLayoutView={props.setSaveLayoutView}
        saveColumns={props.saveColumns}
        setSaveColumns={props.setSaveColumns}
        lastShareLink={props.lastShareLink}
        onSubmit={handleSubmit}
        onClose={() => setEditorOpen(false)}
      />
    </>
  );
}

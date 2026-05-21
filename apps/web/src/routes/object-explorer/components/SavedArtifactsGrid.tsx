import {
  objectExplorerSavedArtifactAccess,
  objectExplorerSavedArtifactKind,
  objectExplorerShareLink,
  type ObjectSetDefinition,
  type ObjectSetEvaluationResponse,
  type ObjectType,
  type OntologyPermissionPrincipal,
} from '@/lib/api/ontology';

import { iconBackground } from '../iconPalette';
import { numberFormatter, type EvaluationMode } from '../state';
import './SavedArtifacts.css';

export type SavedArtifactCategory = 'explorations' | 'comparisons' | 'modules';

export interface SavedArtifactsGridProps {
  visibleObjectSets: ObjectSetDefinition[];
  typeById: Map<string, ObjectType>;
  principal: OntologyPermissionPrincipal;
  evaluationSetId: string;
  evaluation: ObjectSetEvaluationResponse | null;
  evaluationRows: Record<string, unknown>[];
  objectSetBusy: boolean;
  objectSetError: string;
  onCreate: () => void;
  onOpenSavedExploration: (set: ObjectSetDefinition) => void;
  onEvaluateSet: (id: string, mode: EvaluationMode) => void;
}

const CATEGORY_ORDER: SavedArtifactCategory[] = ['explorations', 'comparisons', 'modules'];

const CATEGORY_LABEL: Record<SavedArtifactCategory, string> = {
  explorations: 'Explorations & Lists',
  comparisons: 'Comparison Views',
  modules: 'Modules',
};

function categoryFor(): SavedArtifactCategory {
  // The current backend only surfaces saved sets (explorations + lists).
  // Comparison Views and Modules are reserved for future kinds; cards land
  // in their categories the moment ObjectSetDefinition.kind exposes them.
  return 'explorations';
}

export function SavedArtifactsGrid({
  visibleObjectSets,
  typeById,
  principal,
  evaluationSetId,
  evaluation,
  evaluationRows,
  objectSetBusy,
  objectSetError,
  onCreate,
  onOpenSavedExploration,
  onEvaluateSet,
}: SavedArtifactsGridProps) {
  const grouped: Record<SavedArtifactCategory, ObjectSetDefinition[]> = {
    explorations: [],
    comparisons: [],
    modules: [],
  };
  for (const set of visibleObjectSets) {
    grouped[categoryFor()].push(set);
  }

  return (
    <div className="oe-artifacts">
      <header className="oe-artifacts__head">
        <h2>Artifacts</h2>
        <button type="button" className="oe-artifacts__new" onClick={onCreate}>
          <PlusGlyph /> New artifact
        </button>
      </header>

      {objectSetError && <p className="oe-artifacts__error">{objectSetError}</p>}

      {CATEGORY_ORDER.map((category) => {
        const items = grouped[category];
        if (category !== 'explorations' && items.length === 0) return null;
        return (
          <section key={category} className="oe-artifacts__category">
            <div className="oe-artifacts__category-head">
              <span className="oe-eyebrow">{CATEGORY_LABEL[category]}</span>
              <span className="oe-chip">{items.length}</span>
            </div>
            {items.length === 0 ? (
              <p className="oe-artifacts__empty">
                No artifacts in this category yet.
              </p>
            ) : (
              <div className="oe-artifacts__grid">
                {items.map((set) => (
                  <ArtifactCard
                    key={set.id}
                    set={set}
                    typeById={typeById}
                    principal={principal}
                    busy={objectSetBusy}
                    onOpen={() => onOpenSavedExploration(set)}
                    onPreview={() => onEvaluateSet(set.id, 'preview')}
                    onMaterialize={() => onEvaluateSet(set.id, 'materialize')}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {evaluation && (
        <section
          className="oe-artifacts__evaluation"
          aria-label={`Last evaluation for ${evaluationSetId}`}
        >
          <div className="oe-artifacts__evaluation-head">
            <span className="oe-eyebrow">Last evaluation</span>
            <span className="oe-chip">{numberFormatter.format(evaluation.total_rows)} rows</span>
          </div>
          <div className="oe-artifacts__category-head" style={{ gap: 8 }}>
            <span className="oe-chip">{evaluation.total_base_matches} matches</span>
            <span className="oe-chip">{evaluation.traversal_neighbor_count} neighbors</span>
            <span className="oe-chip">{evaluation.materialized ? 'materialized' : 'preview'}</span>
          </div>
          {evaluationRows.slice(0, 5).map((row, index) => (
            <pre key={index} className="oe-artifacts__evaluation-row">
              {JSON.stringify(row, null, 2)}
            </pre>
          ))}
          {evaluationRows.length === 0 && (
            <p className="oe-artifacts__empty">No evaluation rows.</p>
          )}
        </section>
      )}
    </div>
  );
}

interface ArtifactCardProps {
  set: ObjectSetDefinition;
  typeById: Map<string, ObjectType>;
  principal: OntologyPermissionPrincipal;
  busy: boolean;
  onOpen: () => void;
  onPreview: () => void;
  onMaterialize: () => void;
}

function ArtifactCard({ set, typeById, principal, busy, onOpen, onPreview, onMaterialize }: ArtifactCardProps) {
  const type = typeById.get(set.base_object_type_id);
  const kind = objectExplorerSavedArtifactKind(set);
  const access = objectExplorerSavedArtifactAccess(set, type, principal);
  const shareLink = objectExplorerShareLink(
    set,
    typeof window !== 'undefined' ? window.location.origin : '',
  );
  const meta = [type?.display_name ?? set.base_object_type_id, kind, access.privacy]
    .filter(Boolean)
    .join(' · ');
  return (
    <div
      role="button"
      tabIndex={0}
      className="oe-artifacts__card"
      onClick={() => (busy ? undefined : onOpen())}
      onKeyDown={(event) => {
        if (busy) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <span
        className="oe-type-icon"
        style={{ background: iconBackground(set.base_object_type_id, type?.color ?? null) }}
        aria-hidden="true"
      >
        {kind === 'list' ? <ListGlyph /> : <ExploreGlyph />}
      </span>
      <div className="oe-artifacts__card-body">
        <span className="oe-artifacts__card-title">{set.name}</span>
        <span className="oe-artifacts__card-meta">{meta}</span>
      </div>
      <div className="oe-artifacts__card-actions" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="oe-artifacts__icon-btn"
          title="Preview rows"
          aria-label={`Preview ${set.name}`}
          onClick={onPreview}
          disabled={busy || !access.can_view_objects}
        >
          <EyeGlyph />
        </button>
        <button
          type="button"
          className="oe-artifacts__icon-btn"
          title="Materialize"
          aria-label={`Materialize ${set.name}`}
          onClick={onMaterialize}
          disabled={busy || !access.can_view_objects}
        >
          <DownloadGlyph />
        </button>
        <a
          href={shareLink}
          className="oe-artifacts__icon-btn"
          title="Copy share link"
          aria-label={`Share link for ${set.name}`}
          onClick={(event) => event.stopPropagation()}
        >
          <ShareGlyph />
        </a>
      </div>
    </div>
  );
}

function PlusGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ListGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="3" width="12" height="2" rx="0.5" fill="currentColor" />
      <rect x="2" y="7" width="12" height="2" rx="0.5" fill="currentColor" />
      <rect x="2" y="11" width="12" height="2" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function ExploreGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function EyeGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="1.8" fill="currentColor" />
    </svg>
  );
}

function DownloadGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2v8m0 0 3-3m-3 3-3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ShareGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="4" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="4" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="12" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="m5.5 7 5-2.5M5.5 9l5 2.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

import { Link } from 'react-router-dom';

import { ActionExecutor } from '@/lib/components/ontology/ActionExecutor';
import { ObjectCommentsHelper } from '@/lib/components/ontology/ObjectCommentsHelper';
import {
  groupLinkedObjectsByLinkType,
  objectViewFullHref,
  objectViewTitle,
  type ActionType,
  type ObjectCommentThread,
  type ObjectExplorerActionPrefill,
  type ObjectInstanceViewPolicy,
  type ObjectType,
  type ObjectViewMode,
  type ObjectViewResponse,
  type OntologyPermissionPrincipal,
  type SearchResult,
} from '@/lib/api/ontology';

import { EmptyState, KeyValueGrid, MetricCard, PanelHeader } from './atoms';

interface ViewResolution {
  selected_mode: ObjectViewMode | string;
  supports_toggle: boolean;
  custom_is_default: boolean;
  limitation?: string;
  options: Array<{ mode: string; label: string; enabled: boolean; default?: boolean }>;
}

interface ObjectPreviewPanelProps {
  selectedObject: ObjectViewResponse | null;
  selectedResult: SearchResult | null;
  selectedType: ObjectType | null | undefined;
  selectedObjectAccess: ObjectInstanceViewPolicy | null | undefined;
  selectedSchemaOnly: boolean;
  selectedObjectViewResolution: ViewResolution | null;
  selectedObjectViewTitle: string;
  selectedObjectEmbeddingEntry: { uses_host_header?: boolean } | null;
  selectedFullObjectViewHref: string;
  selectedObjectCommentThread: ObjectCommentThread | null;
  storeSelectedObjectCommentThread: (thread: ObjectCommentThread) => void;
  commentsOpen: boolean;
  setCommentsOpen: (open: boolean | ((open: boolean) => boolean)) => void;
  previewLoading: boolean;
  previewError: string;
  summaryEntries: Array<[string, unknown]>;
  propertyEntries: Array<[string, unknown]>;
  selectedActionId: string;
  setSelectedActionId: (id: string) => void;
  selectedAction: ActionType | null;
  selectedActionPrefill: ObjectExplorerActionPrefill | null;
  actionNotice: string;
  setActionNotice: (notice: string) => void;
  principal: OntologyPermissionPrincipal;
  authorDisplayName: string;
  setObjectViewModePreference: (mode: ObjectViewMode | '') => void;
}

export function ObjectPreviewPanel({
  selectedObject,
  selectedResult,
  selectedType,
  selectedObjectAccess,
  selectedSchemaOnly,
  selectedObjectViewResolution,
  selectedObjectViewTitle,
  selectedObjectEmbeddingEntry,
  selectedFullObjectViewHref,
  selectedObjectCommentThread,
  storeSelectedObjectCommentThread,
  commentsOpen,
  setCommentsOpen,
  previewLoading,
  previewError,
  summaryEntries,
  propertyEntries,
  selectedActionId,
  setSelectedActionId,
  selectedAction,
  selectedActionPrefill,
  actionNotice,
  setActionNotice,
  principal,
  authorDisplayName,
  setObjectViewModePreference,
}: ObjectPreviewPanelProps) {
  const linkedObjectGroups = groupLinkedObjectsByLinkType(selectedObject?.neighbors ?? []);

  return (
    <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
      <PanelHeader
        label="Panel Object View"
        value={selectedObjectViewResolution?.selected_mode === 'configured' ? 'Custom' : selectedObject ? 'Core' : previewLoading ? 'Loading' : 'Idle'}
      />
      {selectedObjectViewResolution ? (
        <div className="of-panel-muted" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>
            View
            <select
              value={selectedObjectViewResolution.selected_mode}
              onChange={(event) => setObjectViewModePreference(event.target.value as ObjectViewMode)}
              className="of-input"
              disabled={!selectedObjectViewResolution.supports_toggle}
              style={{ marginLeft: 6, width: 'auto' }}
            >
              {selectedObjectViewResolution.options.map((option) => (
                <option key={option.mode} value={option.mode} disabled={!option.enabled}>
                  {option.label}{option.default ? ' default' : ''}
                </option>
              ))}
            </select>
          </label>
          {selectedObjectViewResolution.custom_is_default ? <span className="of-chip of-status-success">Custom default</span> : null}
          {selectedObjectEmbeddingEntry?.uses_host_header ? <span className="of-chip">Object Explorer header</span> : null}
          {!selectedObjectViewResolution.supports_toggle && selectedObjectViewResolution.limitation ? (
            <span className="of-chip of-status-warning">{selectedObjectViewResolution.limitation}</span>
          ) : null}
        </div>
      ) : null}

      {previewError && (
        <div className="of-status-danger" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          {previewError}
        </div>
      )}

      {previewLoading ? (
        <EmptyState label="Loading object view..." />
      ) : selectedObject ? (
        <>
          <article className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <p className="of-eyebrow">{selectedType?.display_name ?? selectedObject.object.object_type_id}</p>
                <h2 className="of-heading-md" style={{ marginTop: 4 }}>
                  {selectedSchemaOnly ? `${selectedType?.display_name ?? 'Object'} schema` : selectedObjectViewTitle}
                </h2>
                {!selectedSchemaOnly ? (
                  <p className="of-text-muted" style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {selectedObject.object.id}
                  </p>
                ) : null}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <span className="of-chip">{selectedSchemaOnly ? 'schema only' : selectedObject.object.marking ?? 'unmarked'}</span>
                {!selectedSchemaOnly ? (
                  <Link to={selectedFullObjectViewHref} className="of-button of-button--primary">
                    Open full Object View
                  </Link>
                ) : null}
                <button
                  type="button"
                  className="of-button"
                  disabled={!selectedObjectCommentThread?.permissions.can_view}
                  onClick={() => setCommentsOpen((open) => !open)}
                >
                  Comments
                </button>
                <Link to={`/ontology/${selectedObject.object.object_type_id}`} className="of-button">
                  Open type
                </Link>
              </div>
            </div>

            {selectedSchemaOnly && selectedObjectAccess ? (
              <div className="of-status-warning" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                {selectedObjectAccess.reason}
              </div>
            ) : null}

            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))' }}>
              <MetricCard label="Actions" value={`${selectedObject.applicable_actions.length}`} />
              <MetricCard label="Rules" value={`${selectedObject.matching_rules.length}`} />
              <MetricCard label="Timeline" value={`${selectedObject.timeline.length}`} />
              <MetricCard label="Comments" value={`${selectedObjectCommentThread?.comments.filter((comment) => !comment.deleted_at).length ?? 0}`} />
            </div>
          </article>

          {commentsOpen ? (
            <ObjectCommentsHelper
              thread={selectedObjectCommentThread}
              principal={principal}
              authorDisplayName={authorDisplayName}
              onThreadChange={storeSelectedObjectCommentThread}
              onClose={() => setCommentsOpen(false)}
            />
          ) : null}

          <section className="of-panel-muted" style={{ padding: 12 }}>
            <PanelHeader label="Summary" value={`${summaryEntries.length}`} />
            {selectedSchemaOnly ? <EmptyState label="Summary values are restricted; schema remains available on the object type." compact /> : <KeyValueGrid entries={summaryEntries} />}
          </section>

          <section className="of-panel-muted" style={{ padding: 12 }}>
            <PanelHeader label="Properties" value={`${propertyEntries.length}`} />
            {selectedSchemaOnly ? <EmptyState label="Property values are restricted; open the type to inspect property definitions." compact /> : <KeyValueGrid entries={propertyEntries} />}
          </section>

          <section className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 8 }}>
            <PanelHeader label="Linked objects" value={`${selectedObject.neighbors.length}`} />
            {selectedSchemaOnly ? (
              <EmptyState label="Linked-object previews are hidden because object values are restricted." compact />
            ) : (
              <div style={{ display: 'grid', gap: 6, maxHeight: 210, overflow: 'auto' }}>
                {linkedObjectGroups.slice(0, 6).map((group) => (
                  <div key={group.link_type_id} className="of-card" style={{ padding: 8, display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{group.link_name}</strong>
                      <span className="of-chip">{group.outbound.length} out · {group.inbound.length} in</span>
                    </div>
                    {group.items.slice(0, 3).map((neighbor) => {
                      const neighborSchemaOnly = Boolean(neighbor.object.object_view_access?.schema_only);
                      return neighborSchemaOnly ? (
                        <div key={`${neighbor.link_id}-${neighbor.object.id}`} className="of-text-muted" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                          <span>Schema-only linked object</span>
                          <span>{neighbor.direction}</span>
                        </div>
                      ) : (
                        <Link key={`${neighbor.link_id}-${neighbor.object.id}`} to={objectViewFullHref(neighbor.object)} className="of-link" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                          <span>{objectViewTitle(neighbor.object)}</span>
                          <span className="of-text-muted">{neighbor.direction}</span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
                {selectedObject.neighbors.length === 0 && <EmptyState label="No linked objects." compact />}
              </div>
            )}
          </section>

          <section className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 10 }}>
            <PanelHeader label="Applicable actions" value={`${selectedObject.applicable_actions.length}`} />
            {selectedSchemaOnly ? (
              <EmptyState label="Action execution is hidden until object data is viewable." compact />
            ) : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedObject.applicable_actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => {
                        setSelectedActionId(action.id);
                        setActionNotice('');
                      }}
                      className={selectedActionId === action.id ? 'of-button of-button--primary' : 'of-button'}
                    >
                      {action.display_name || action.name}
                    </button>
                  ))}
                  {selectedObject.applicable_actions.length === 0 && <span className="of-text-muted">No actions.</span>}
                </div>
                {selectedAction && (
                  <div className="of-panel" style={{ padding: 12 }}>
                    <ActionExecutor
                      action={selectedAction}
                      initialParameters={selectedActionPrefill?.initial_parameters}
                      hiddenParams={selectedActionPrefill?.hidden_params}
                      targetObjectId={selectedActionPrefill?.target_object_id || selectedObject.object.id}
                      batchTargetObjectIds={selectedActionPrefill?.batch_target_object_ids}
                      disabledReason={selectedActionPrefill?.blocked_reason || (selectedObject.object.object_security_access?.blocked ? selectedObject.object.object_security_access.reason : '')}
                      onExecuted={(response) => {
                        setActionNotice('total' in response ? `Batch execution recorded: ${response.succeeded}/${response.total}` : 'Execution recorded.');
                      }}
                    />
                    {selectedActionPrefill?.warning && (
                      <p className="of-text-muted" style={{ margin: '8px 0 0', fontSize: 11 }}>
                        {selectedActionPrefill.warning}
                      </p>
                    )}
                  </div>
                )}
                {actionNotice && (
                  <div className="of-status-success" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                    {actionNotice}
                  </div>
                )}
              </>
            )}
          </section>
        </>
      ) : (
        <EmptyState label={selectedResult ? 'Selected resource has no object preview.' : 'Select an object result.'} />
      )}
    </section>
  );
}

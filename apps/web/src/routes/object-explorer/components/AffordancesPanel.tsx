import { Link } from 'react-router-dom';

import { ActionExecutor } from '@/lib/components/ontology/ActionExecutor';
import type {
  ActionType,
  ObjectExplorerActionContext,
  ObjectExplorerActionPrefill,
  ObjectExplorerExportAffordance,
  ObjectExplorerOpenInAffordance,
} from '@/lib/api/ontology';

import { EmptyState, PanelHeader } from './atoms';
import { numberFormatter } from '../state';

interface AffordancesPanelProps {
  objectSetActionContext: ObjectExplorerActionContext | null;
  currentResultObjectIds: string[];
  openInAffordances: ObjectExplorerOpenInAffordance[];
  exportAffordances: ObjectExplorerExportAffordance[];
  objectSetActions: ActionType[];
  objectSetAction: ActionType | null;
  objectSetActionPrefill: ObjectExplorerActionPrefill | null;
  affordanceNotice: string;
  actionNotice: string;
  setObjectSetActionId: (id: string) => void;
  setActionNotice: (notice: string) => void;
  onCopyIds: (affordance: ObjectExplorerExportAffordance) => void;
  onExport: (affordance: ObjectExplorerExportAffordance) => void;
}

export function AffordancesPanel({
  objectSetActionContext,
  currentResultObjectIds,
  openInAffordances,
  exportAffordances,
  objectSetActions,
  objectSetAction,
  objectSetActionPrefill,
  affordanceNotice,
  actionNotice,
  setObjectSetActionId,
  setActionNotice,
  onCopyIds,
  onExport,
}: AffordancesPanelProps) {
  return (
    <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 10 }}>
      <PanelHeader
        label="Actions / Open In / Export"
        value={objectSetActionContext ? `${numberFormatter.format(currentResultObjectIds.length)} selected` : 'No set'}
      />
      {affordanceNotice && (
        <div className="of-status-success" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          {affordanceNotice}
        </div>
      )}
      {objectSetActionContext ? (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {openInAffordances.map((target) => (
              target.enabled ? (
                <Link key={target.id} to={target.href} className="of-button">
                  {target.label}
                </Link>
              ) : (
                <button key={target.id} type="button" className="of-button" disabled title={target.reason}>
                  {target.label}
                </button>
              )
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {exportAffordances.map((exportOption) => (
              <button
                key={exportOption.id}
                type="button"
                className="of-button"
                disabled={!exportOption.enabled}
                title={exportOption.enabled ? exportOption.label : exportOption.reason}
                onClick={() => {
                  if (exportOption.id === 'copy_ids') onCopyIds(exportOption);
                  else onExport(exportOption);
                }}
              >
                {exportOption.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {objectSetActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    setObjectSetActionId(action.id);
                    setActionNotice('');
                  }}
                  className={(objectSetAction?.id === action.id) ? 'of-button of-button--primary' : 'of-button'}
                >
                  {action.display_name || action.name}
                </button>
              ))}
              {objectSetActions.length === 0 && <span className="of-text-muted">No actions for this object set.</span>}
            </div>
            {objectSetAction && (
              <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 8 }}>
                {objectSetActionPrefill?.warning && (
                  <div className="of-status-warning" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                    {objectSetActionPrefill.warning}
                  </div>
                )}
                <ActionExecutor
                  action={objectSetAction}
                  initialParameters={objectSetActionPrefill?.initial_parameters}
                  hiddenParams={objectSetActionPrefill?.hidden_params}
                  targetObjectId={objectSetActionPrefill?.target_object_id}
                  batchTargetObjectIds={objectSetActionPrefill?.batch_target_object_ids}
                  emptyMessage={objectSetActionPrefill?.prefilled_parameter_names.length ? 'Selected objects are pre-filled by Object Explorer.' : undefined}
                  disabledReason={objectSetActionPrefill?.blocked_reason}
                  onExecuted={(response) => {
                    setActionNotice('total' in response ? `Batch execution recorded: ${response.succeeded}/${response.total}` : 'Execution recorded.');
                  }}
                />
              </div>
            )}
            {actionNotice && (
              <div className="of-status-success" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                {actionNotice}
              </div>
            )}
          </div>
        </>
      ) : (
        <EmptyState label="Run a search, filter, or saved exploration to enable action and export affordances." compact />
      )}
    </section>
  );
}

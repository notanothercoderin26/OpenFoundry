// WorkshopRuntimeProvider — runtime-side counterpart of `PreviewRuntime`
// from WorkshopEditorPage.tsx. Wraps a subtree with:
//
//   - WorkshopRuntimeContext   : active object selection, filter values,
//                                refreshKey, button-click → action modal.
//   - WorkshopDataContext      : the variables declared in app.settings
//                                and the object types loaded from the
//                                ontology service.
//
// AppRuntimePage uses this around <AppRenderer> so that any Workshop
// widget rendered through the registry receives the context it needs.
//
// We intentionally do NOT reuse PreviewRuntime as-is: that one renders
// editor chrome (header, "Edit" button, lineage shortcut) and accepts a
// page list. The published runtime owns its own chrome via AppRenderer.

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AppDefinition } from '@/lib/api/apps';
import { listObjectTypes, type ObjectInstance, type ObjectType } from '@/lib/api/ontology';
import {
  ActionFormModal,
  readWorkshopVariables,
  WorkshopRuntimeContext,
  type ButtonGroupButton,
  type RuntimeApi,
  type WorkshopVariable,
} from '@/routes/apps/WorkshopEditorPage';

import { WorkshopDataContext, type WorkshopDataContextValue } from './workshop-context';

interface FilterRuntimeValue {
  values?: string[];
  search?: string;
  range_min?: string;
  range_max?: string;
}

export function WorkshopRuntimeProvider({
  app,
  children,
}: {
  app: AppDefinition;
  children: React.ReactNode;
}) {
  const variables: WorkshopVariable[] = useMemo(
    () => readWorkshopVariables(app.settings),
    [app.settings],
  );

  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await listObjectTypes();
        if (cancelled) return;
        const items = Array.isArray(response)
          ? (response as ObjectType[])
          : ((response as { data?: ObjectType[] }).data ?? []);
        setObjectTypes(items);
      } catch {
        if (!cancelled) setObjectTypes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [activeObjects, setActiveObjects] = useState<Record<string, ObjectInstance | null>>({});
  const [filterValues, setFilterValues] = useState<Record<string, FilterRuntimeValue>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionModal, setActionModal] = useState<{ button: ButtonGroupButton } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const setActiveObject = useCallback((variableId: string, object: ObjectInstance | null) => {
    setActiveObjects((current) => ({ ...current, [variableId]: object }));
  }, []);
  const setFilterValue = useCallback((filterId: string, value: FilterRuntimeValue) => {
    setFilterValues((current) => ({ ...current, [filterId]: value }));
  }, []);
  const onButtonClick = useCallback((button: ButtonGroupButton) => {
    if (button.on_click_kind === 'action' && button.action_type_id) {
      setActionModal({ button });
    }
  }, []);

  const runtime = useMemo<RuntimeApi>(() => ({
    preview: true,
    activeObjects,
    filterValues,
    refreshKey,
    setActiveObject,
    setFilterValue,
    onButtonClick,
  }), [activeObjects, filterValues, refreshKey, setActiveObject, setFilterValue, onButtonClick]);

  const data = useMemo<WorkshopDataContextValue>(
    () => ({ variables, objectTypes }),
    [variables, objectTypes],
  );

  return (
    <WorkshopRuntimeContext.Provider value={runtime}>
      <WorkshopDataContext.Provider value={data}>
        {children}
        {actionModal ? (
          <ActionFormModal
            button={actionModal.button}
            variables={variables}
            activeObjects={activeObjects}
            objectTypes={objectTypes}
            onClose={() => setActionModal(null)}
            onSuccess={() => {
              setActionModal(null);
              setToast('Edits successfully applied.');
              setRefreshKey((key) => key + 1);
              window.setTimeout(() => setToast(null), 4000);
            }}
          />
        ) : null}
        {toast ? (
          <div
            role="status"
            style={{
              position: 'fixed',
              top: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 100,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 16px',
              borderRadius: 6,
              background: '#15803d',
              color: '#fff',
              fontSize: 13,
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
            }}
          >
            <span>{toast}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setToast(null)}
              style={{ border: 0, background: 'transparent', color: '#fff', cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
        ) : null}
      </WorkshopDataContext.Provider>
    </WorkshopRuntimeContext.Provider>
  );
}

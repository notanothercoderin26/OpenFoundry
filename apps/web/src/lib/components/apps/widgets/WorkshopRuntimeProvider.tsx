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

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { AppDefinition, WidgetEvent } from '@/lib/api/apps';
import { listObjectTypes, type ObjectInstance, type ObjectType } from '@/lib/api/ontology';
import {
  ActionFormModal,
  readWorkshopVariables,
  workshopActionSuccessMessage,
  type WorkshopVariable,
} from '@/routes/apps/WorkshopEditorPage';
import {
  WorkshopRuntimeContext,
  type ButtonGroupButton,
  type RuntimeApi,
  type WorkshopFilterRuntimeValue,
} from './workshop-runtime-context';
import type { WorkshopMapFeatureCollection } from './workshopMap';
import { createWorkshopVariableEngine, type WorkshopRuntimeFilterMetadata } from './workshopVariables';
import { executeWorkshopObjectSet, type WorkshopObjectSetExecutionOptions } from './workshopObjectSets';
import { downloadWorkshopEventPayload, runWorkshopEvents, type WorkshopEventHandlers } from './workshopEvents';
import { buildFunctionInvocation, clearWorkshopFunctionResultCache, executeCachedFunctionVariable, getCachedFunctionVariableValue, type WorkshopFunctionRuntimeValue } from './workshopFunctions';
import { scenarioPayloadToActionDefaults } from './workshopScenarios';
import {
  hydrateVariablesFromUrl,
  readPersistedState,
  writePersistedState,
} from './workshopModuleInterface';
import {
  applyBridgeToPrimitives,
  EmbeddedBridgeContext,
  hydrateFromBridge,
} from './embeddedRuntimeBridge';

import { WorkshopDataContext, type WorkshopDataContextValue } from './workshop-context';

export function WorkshopRuntimeProvider({
  app,
  children,
  urlParams,
  userId,
}: {
  app: AppDefinition;
  children: React.ReactNode;
  /**
   * Initial URL query parameters used to hydrate `routing.enabled`
   * interface variables. Read once on mount; subsequent updates are
   * ignored, matching Palantir Workshop behavior.
   */
  urlParams?: Record<string, string>;
  /**
   * Identifier scoping `state_saving` localStorage keys. Falls back to
   * "anonymous" when omitted so embedded preview surfaces still work.
   */
  userId?: string;
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

  // App slug + user id key the localStorage entries. Resolved once on
  // mount and held in a ref so first-load hydration is deterministic
  // even when these props change later (state saving keeps writing to
  // the original key for the rest of the session).
  const appSlug =
    (app.settings as { runtime_metadata?: { public_slug?: string } } | null | undefined)?.runtime_metadata?.public_slug
    ?? app.id
    ?? 'app';
  const scopedUserId = userId ?? 'anonymous';
  const slugRef = useRef(appSlug);
  const userIdRef = useRef(scopedUserId);

  // Bridge from a surrounding `EmbeddedModuleRenderer` (null at the
  // top level). When present, mapped variables read & write through
  // the parent so the two modules stay in sync.
  const bridge = useContext(EmbeddedBridgeContext);

  // First-load initial primitive values: persisted state wins over URL
  // params, URL params lose to the bridge (parent-owned values win
  // because Workshop's contract is "parent variable definition wins"
  // for mapped variables). The initializer fires exactly once thanks
  // to useState's lazy form, so hot-reloads of `urlParams` after mount
  // can't reset user edits.
  const [activeObjects, setActiveObjects] = useState<Record<string, ObjectInstance | null>>({});
  const [selectedObjectSets, setSelectedObjectSets] = useState<Record<string, ObjectInstance[]>>({});
  const [shapeOutputs, setShapeOutputs] = useState<Record<string, WorkshopMapFeatureCollection | null>>({});
  const [filterValues, setFilterValues] = useState<Record<string, WorkshopFilterRuntimeValue>>({});
  const [filterMetadata, setFilterMetadata] = useState<Record<string, WorkshopRuntimeFilterMetadata>>({});
  const [primitiveValues, setPrimitiveValues] = useState<Record<string, unknown>>(() => {
    const fromStorage = readPersistedState(variables, slugRef.current, userIdRef.current);
    const fromUrl = hydrateVariablesFromUrl(variables, urlParams ?? {});
    const fromBridge = bridge ? hydrateFromBridge(variables, bridge) : {};
    return { ...fromStorage, ...fromUrl, ...fromBridge };
  });
  // The bridge owns mapped-variable values for the lifetime of the
  // module. We merge it on top of `primitiveValues` on every render so
  // the variable engine, widgets, and downstream effects always see
  // the latest parent value.
  const effectivePrimitiveValues = useMemo(
    () => applyBridgeToPrimitives(primitiveValues, variables, bridge),
    [bridge, primitiveValues, variables],
  );
  const [functionValues, setFunctionValues] = useState<Record<string, WorkshopFunctionRuntimeValue>>({});
  const [runtimeParameters, setRuntimeParametersState] = useState<Record<string, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionModal, setActionModal] = useState<{ button: ButtonGroupButton } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const eventHandlersRef = useRef<WorkshopEventHandlers>({});

  const setActiveObject = useCallback((variableId: string, object: ObjectInstance | null) => {
    setActiveObjects((current) => ({ ...current, [variableId]: object }));
  }, []);
  const setSelectedObjectSet = useCallback((variableId: string, objects: ObjectInstance[]) => {
    setSelectedObjectSets((current) => {
      const existing = current[variableId] ?? [];
      if (sameObjectSelection(existing, objects)) return current;
      return { ...current, [variableId]: objects };
    });
  }, []);
  const setShapeOutput = useCallback((variableId: string, shape: WorkshopMapFeatureCollection | null) => {
    setShapeOutputs((current) => {
      if (sameShapeOutput(current[variableId] ?? null, shape)) return current;
      return { ...current, [variableId]: shape };
    });
  }, []);
  const setFilterValue = useCallback((filterId: string, value: WorkshopFilterRuntimeValue, metadata?: WorkshopRuntimeFilterMetadata) => {
    setFilterValues((current) => ({ ...current, [filterId]: value }));
    if (metadata) {
      setFilterMetadata((current) => ({ ...current, [filterId]: { ...(current[filterId] ?? {}), ...metadata } }));
    }
  }, []);
  const setPrimitiveValue = useCallback((variableId: string, value: unknown) => {
    setPrimitiveValues((current) => (Object.is(current[variableId], value) ? current : { ...current, [variableId]: value }));
    // If the variable is bridged to a parent, also write upstream so
    // the parent (and any sibling embeds) pick up the change.
    if (bridge) {
      const variable = variables.find((entry) => entry.id === variableId);
      if (variable?.external_id && bridge.mappedExternalIDs.includes(variable.external_id)) {
        bridge.write(variable.external_id, value);
      }
    }
  }, [bridge, variables]);
  const setRuntimeParameters = useCallback((parameters: Record<string, string>) => {
    setRuntimeParametersState((current) => (sameStringRecord(current, parameters) ? current : { ...parameters }));
  }, []);
  const onButtonClick = useCallback((button: ButtonGroupButton) => {
    if (button.on_click_kind === 'action' && button.action_type_id) {
      setActionModal({ button });
    }
  }, []);
  const setEventHandlers = useCallback((handlers: WorkshopEventHandlers) => {
    eventHandlersRef.current = handlers;
    return () => {
      if (eventHandlersRef.current === handlers) eventHandlersRef.current = {};
    };
  }, []);
  // Persist state-saving variables whenever their values change. We
  // ignore the very first effect run (the initializer already hydrated
  // from storage) by tracking a hasMounted flag, otherwise the
  // hydrated values would be re-written byte-for-byte.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    writePersistedState(variables, primitiveValues, slugRef.current, userIdRef.current);
  }, [variables, primitiveValues]);

  const defaultEventHandlers = useMemo<WorkshopEventHandlers>(() => ({
    setVariable: (variableId, value) => setPrimitiveValue(variableId, value),
    setRuntimeParameters,
    openUrl: (url) => {
      if (typeof window === 'undefined') return;
      if (url.startsWith('/')) window.location.assign(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    },
    openWorkshopModule: (url, options) => {
      if (typeof window === 'undefined') return;
      if (options.newTab) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        window.location.assign(url);
      }
    },
    refresh: () => {
      clearWorkshopFunctionResultCache();
      setFunctionValues({});
      setRefreshKey((key) => key + 1);
      setToast('Runtime refreshed.');
    },
    applyAction: (actionTypeId, payload, event) => {
      setActionModal({
        button: {
          id: `event_${event.id}`,
          label: event.label ?? 'Apply action',
          on_click_kind: 'action',
          action_type_id: actionTypeId,
          parameter_defaults: scenarioPayloadToActionDefaults(payload),
          default_layout: 'form',
          switch_layout: false,
          conditional_visibility: false,
        },
      });
    },
    exportData: (format, payload, event) => {
      downloadWorkshopEventPayload(format, payload, event.label ?? event.id);
      setToast(`Exported ${format}.`);
    },
    command: (command) => setToast(`Command: ${command}`),
    notice: (message) => setToast(message),
  }), [setPrimitiveValue, setRuntimeParameters]);
  const variableEngine = useMemo(() => createWorkshopVariableEngine(variables, {
    activeObjects,
    selectedObjectSets,
    shapeOutputs,
    filterValues,
    filterMetadata,
    primitiveValues: effectivePrimitiveValues,
    functionValues,
    runtimeParameters,
  }), [activeObjects, effectivePrimitiveValues, filterMetadata, filterValues, functionValues, runtimeParameters, selectedObjectSets, shapeOutputs, variables]);
  useEffect(() => {
    for (const variable of variables) {
      if (variable.kind !== 'function_output') continue;
      const invocation = buildFunctionInvocation(variable, variableEngine);
      if (!invocation) continue;
      const cached = getCachedFunctionVariableValue(invocation.cacheKey);
      if (cached) {
        if (functionValues[variable.id]?.cache_key !== invocation.cacheKey || functionValues[variable.id]?.status !== 'success') {
          setFunctionValues((state) => ({ ...state, [variable.id]: cached }));
        }
        continue;
      }
      const current = functionValues[variable.id];
      if (current?.cache_key === invocation.cacheKey && (current.status === 'loading' || current.status === 'success')) continue;
      setFunctionValues((state) => ({
        ...state,
        [variable.id]: {
          value: state[variable.id]?.value ?? null,
          status: 'loading',
          cache_key: invocation.cacheKey,
        },
      }));
      void executeCachedFunctionVariable(invocation)
        .then((next) => {
          setFunctionValues((state) => {
            if (state[variable.id]?.cache_key !== invocation.cacheKey) return state;
            return { ...state, [variable.id]: next };
          });
        })
        .catch((error: unknown) => {
          setFunctionValues((state) => {
            if (state[variable.id]?.cache_key !== invocation.cacheKey) return state;
            return {
              ...state,
              [variable.id]: {
                value: state[variable.id]?.value ?? null,
                status: 'error',
                error: error instanceof Error ? error.message : String(error),
                cache_key: invocation.cacheKey,
              },
            };
          });
        });
    }
  }, [functionValues, variableEngine, variables]);
  const executeObjectSet = useCallback((variableId: string, options: WorkshopObjectSetExecutionOptions = {}) => {
    const variable = variables.find((entry) => entry.id === variableId) ?? null;
    return executeWorkshopObjectSet({
      variableId,
      variable,
      variables,
      engine: variableEngine,
      objectTypeId: options.objectTypeId,
      limit: options.limit,
      sort: options.sort,
      aggregations: options.aggregations,
      includeCount: options.includeCount,
    });
  }, [variableEngine, variables]);
  const dispatchEvents = useCallback((widget: { events?: WidgetEvent[] }, trigger: string, payload: Record<string, unknown> = {}) => {
    return runWorkshopEvents({
      events: Array.isArray(widget.events) ? widget.events : [],
      trigger,
      payload,
      state: { runtimeParameters },
      handlers: { ...defaultEventHandlers, ...eventHandlersRef.current },
    });
  }, [defaultEventHandlers, runtimeParameters]);

  const runtime = useMemo<RuntimeApi>(() => ({
    preview: true,
    activeObjects,
    selectedObjectSets,
    shapeOutputs,
    filterValues,
    filterMetadata,
    primitiveValues: effectivePrimitiveValues,
    runtimeParameters,
    variableEngine,
    refreshKey,
    setActiveObject,
    setSelectedObjectSet,
    setShapeOutput,
    setFilterValue,
    setPrimitiveValue,
    setRuntimeParameters,
    executeObjectSet,
    dispatchEvents,
    setEventHandlers,
    onButtonClick,
  }), [activeObjects, dispatchEvents, executeObjectSet, effectivePrimitiveValues, filterMetadata, filterValues, refreshKey, runtimeParameters, selectedObjectSets, setActiveObject, setEventHandlers, setFilterValue, setPrimitiveValue, setRuntimeParameters, setSelectedObjectSet, setShapeOutput, shapeOutputs, variableEngine, onButtonClick]);

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
            selectedObjectSets={selectedObjectSets}
            objectTypes={objectTypes}
            variableEngine={variableEngine}
            onClose={() => setActionModal(null)}
            onSuccess={(result) => {
              setActionModal(null);
              setToast(workshopActionSuccessMessage(result));
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

function sameObjectSelection(left: ObjectInstance[], right: ObjectInstance[]) {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => entry.id === right[index]?.id);
}

function sameShapeOutput(left: WorkshopMapFeatureCollection | null, right: WorkshopMapFeatureCollection | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameStringRecord(left: Record<string, string>, right: Record<string, string>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

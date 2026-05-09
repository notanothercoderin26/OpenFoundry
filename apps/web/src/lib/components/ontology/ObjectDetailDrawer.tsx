import { useEffect, useMemo, useState } from 'react';

import {
  getObject,
  listActionTypes,
  listNeighbors,
  listProperties,
  type ActionType,
  type ExecuteActionResponse,
  type ExecuteBatchActionResponse,
  type NeighborLink,
  type ObjectInstance,
  type ObjectType,
  type Property,
} from '@/lib/api/ontology';
import { Tabs } from '@/lib/components/Tabs';
import { Drawer } from '@/lib/components/ui/Drawer';
import { ActionExecutor } from './ActionExecutor';
import { InlineEditCell } from './InlineEditCell';
import { ObjectCard } from './ObjectCard';
import { ObjectTimeline } from './ObjectTimeline';

type ObjectDetailTab = 'summary' | 'properties' | 'links' | 'actions' | 'timeline' | 'raw';

interface ObjectDetailDrawerProps {
  open: boolean;
  typeId: string;
  objectId: string | null;
  objectType: ObjectType | null;
  initialObject?: ObjectInstance | null;
  properties?: Property[];
  actions?: ActionType[];
  onClose: () => void;
  onObjectUpdated?: (object: ObjectInstance) => void;
}

const EMPTY_PROPERTIES: Property[] = [];
const EMPTY_ACTIONS: ActionType[] = [];

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 12)}...` : id;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function objectTitle(object: ObjectInstance | null, objectType: ObjectType | null) {
  if (!object) return 'Object detail';
  const pk = objectType?.primary_key_property;
  if (pk && object.properties?.[pk] !== undefined) return String(object.properties[pk]);
  return shortId(object.id);
}

export function ObjectDetailDrawer({
  open,
  typeId,
  objectId,
  objectType,
  initialObject = null,
  properties: providedProperties = EMPTY_PROPERTIES,
  actions: providedActions = EMPTY_ACTIONS,
  onClose,
  onObjectUpdated,
}: ObjectDetailDrawerProps) {
  const [tab, setTab] = useState<ObjectDetailTab>('summary');
  const [object, setObject] = useState<ObjectInstance | null>(initialObject);
  const [properties, setProperties] = useState<Property[]>(providedProperties);
  const [actions, setActions] = useState<ActionType[]>(providedActions);
  const [neighbors, setNeighbors] = useState<NeighborLink[]>([]);
  const [selectedActionId, setSelectedActionId] = useState('');
  const [actionResult, setActionResult] = useState<ExecuteActionResponse | ExecuteBatchActionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [linksLoading, setLinksLoading] = useState(false);
  const [error, setError] = useState('');
  const [linksError, setLinksError] = useState('');

  useEffect(() => {
    if (providedProperties.length > 0) setProperties(providedProperties);
  }, [providedProperties]);

  useEffect(() => {
    if (providedActions.length > 0) setActions(providedActions);
  }, [providedActions]);

  useEffect(() => {
    if (tab === 'actions' && !selectedActionId && actions[0]) {
      setSelectedActionId(actions[0].id);
    }
  }, [actions, selectedActionId, tab]);

  useEffect(() => {
    if (!open || !objectId) return;
    let cancelled = false;
    const activeObjectId = objectId;
    setTab('summary');
    setObject(initialObject);
    setActionResult(null);
    setSelectedActionId('');
    setNeighbors([]);
    setLinksError('');
    setLoading(true);
    setError('');

    async function load() {
      try {
        const [objectRes, propertyRes, actionRes] = await Promise.all([
          getObject(typeId, activeObjectId),
          providedProperties.length > 0 ? Promise.resolve(providedProperties) : listProperties(typeId),
          providedActions.length > 0
            ? Promise.resolve({ data: providedActions })
            : listActionTypes({ object_type_id: typeId, per_page: 100 }),
        ]);
        if (cancelled) return;
        setObject(objectRes);
        setProperties(propertyRes);
        setActions(actionRes.data);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Failed to load object detail');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, typeId, objectId, initialObject, providedActions, providedProperties]);

  async function loadLinks(force = false) {
    if (!objectId || linksLoading || (!force && neighbors.length > 0)) return;
    setLinksLoading(true);
    setLinksError('');
    try {
      setNeighbors(await listNeighbors(typeId, objectId));
    } catch (cause) {
      setLinksError(cause instanceof Error ? cause.message : 'Failed to load linked objects');
    } finally {
      setLinksLoading(false);
    }
  }

  function changeTab(next: ObjectDetailTab) {
    setTab(next);
    if (next === 'links') void loadLinks();
  }

  function updateProperty(property: Property, value: unknown) {
    if (!object) return;
    const next = {
      ...object,
      properties: { ...object.properties, [property.name]: value },
      updated_at: new Date().toISOString(),
    };
    setObject(next);
    onObjectUpdated?.(next);
  }

  async function refreshObject() {
    if (!objectId) return;
    const next = await getObject(typeId, objectId);
    setObject(next);
    onObjectUpdated?.(next);
  }

  async function handleExecuted(response: ExecuteActionResponse | ExecuteBatchActionResponse) {
    setActionResult(response);
    try {
      await refreshObject();
      setNeighbors([]);
      if (tab === 'links') void loadLinks(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action executed, but refresh failed');
    }
  }

  const selectedAction = useMemo(
    () => actions.find((action) => action.id === selectedActionId) ?? null,
    [actions, selectedActionId],
  );

  const cardActions = useMemo(
    () => actions.slice(0, 3).map((action) => ({
      label: action.display_name || action.name,
      onClick: () => {
        setSelectedActionId(action.id);
        setTab('actions');
      },
    })),
    [actions],
  );

  return (
    <Drawer open={open} title={object ? objectTitle(object, objectType) : 'Object detail'} width="min(840px, calc(100vw - 32px))" onClose={onClose}>
      {!objectId ? (
        <p className="of-text-muted" style={{ fontSize: 13 }}>Select an object to inspect.</p>
      ) : (
        <div style={{ minHeight: '100%', display: 'grid', gridTemplateRows: 'auto auto 1fr auto', gap: 12 }}>
          <header style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <p className="of-eyebrow" style={{ margin: 0, color: '#93c5fd' }}>
                  {objectType?.display_name || objectType?.name || 'Ontology object'}
                </p>
                <h2 style={{ margin: '4px 0 0', color: '#f8fafc', fontSize: 20, lineHeight: 1.2, overflowWrap: 'anywhere' }}>
                  {object ? objectTitle(object, objectType) : shortId(objectId)}
                </h2>
                <p style={{ margin: '6px 0 0', color: '#94a3b8', fontFamily: 'var(--font-mono)', fontSize: 11, overflowWrap: 'anywhere' }}>
                  {objectId}
                </p>
              </div>
              {object?.marking && <span className="of-chip">{object.marking}</span>}
            </div>

            {error && (
              <div className="of-status-danger" style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12 }}>
                {error}
              </div>
            )}
          </header>

          <Tabs
            tabs={[
              { id: 'summary', label: 'Summary' },
              { id: 'properties', label: `Properties (${properties.length})` },
              { id: 'links', label: neighbors.length ? `Links (${neighbors.length})` : 'Links' },
              { id: 'actions', label: actions.length ? `Actions (${actions.length})` : 'Actions' },
              { id: 'timeline', label: 'Timeline' },
              { id: 'raw', label: 'Raw' },
            ] as const}
            active={tab}
            onChange={changeTab}
          />

          <div style={{ minHeight: 0, overflow: 'auto' }}>
            {loading && (
              <p className="of-text-muted" style={{ fontSize: 13, fontStyle: 'italic' }}>Loading object detail...</p>
            )}

            {!loading && object && tab === 'summary' && (
              <div style={{ display: 'grid', gap: 12 }}>
                <ObjectCard object={object} properties={properties} objectType={objectType} actions={cardActions} />
                <section style={{ display: 'grid', gap: 8, padding: 12, background: '#0b1220', border: '1px solid #1f2937', borderRadius: 8 }}>
                  <p className="of-eyebrow" style={{ margin: 0 }}>Metadata</p>
                  <dl style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', margin: 0, fontSize: 12 }}>
                    <div>
                      <dt style={{ color: '#94a3b8' }}>Object type</dt>
                      <dd style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>{object.object_type_id}</dd>
                    </div>
                    <div>
                      <dt style={{ color: '#94a3b8' }}>Created</dt>
                      <dd style={{ margin: 0 }}>{formatDate(object.created_at)}</dd>
                    </div>
                    <div>
                      <dt style={{ color: '#94a3b8' }}>Updated</dt>
                      <dd style={{ margin: 0 }}>{formatDate(object.updated_at)}</dd>
                    </div>
                    <div>
                      <dt style={{ color: '#94a3b8' }}>Created by</dt>
                      <dd style={{ margin: 0, fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>{object.created_by || '-'}</dd>
                    </div>
                  </dl>
                </section>
              </div>
            )}

            {!loading && object && tab === 'properties' && (
              <section style={{ display: 'grid', gap: 8 }}>
                {properties.map((property) => (
                  <div
                    key={property.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(160px, 240px) minmax(0, 1fr)',
                      gap: 10,
                      alignItems: 'start',
                      padding: 10,
                      background: '#0b1220',
                      border: '1px solid #1f2937',
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block', fontSize: 12, color: '#e2e8f0', overflowWrap: 'anywhere' }}>
                        {property.display_name || property.name}
                      </strong>
                      <p style={{ margin: '3px 0 0', color: '#94a3b8', fontSize: 11 }}>
                        {property.name} - {property.property_type}
                        {property.required ? ' - required' : ''}
                      </p>
                      {property.description && (
                        <p style={{ margin: '4px 0 0', color: '#cbd5e1', fontSize: 11 }}>{property.description}</p>
                      )}
                    </div>
                    <InlineEditCell
                      typeId={typeId}
                      objectId={object.id}
                      property={property}
                      value={object.properties?.[property.name]}
                      onUpdated={(next) => updateProperty(property, next)}
                    />
                  </div>
                ))}
                {properties.length === 0 && (
                  <p className="of-text-muted" style={{ fontSize: 13 }}>This type has no properties.</p>
                )}
              </section>
            )}

            {!loading && object && tab === 'links' && (
              <section style={{ display: 'grid', gap: 8 }}>
                {linksLoading && <p className="of-text-muted" style={{ fontSize: 13 }}>Loading links...</p>}
                {linksError && (
                  <div className="of-status-danger" style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12 }}>
                    {linksError}
                  </div>
                )}
                {neighbors.map((neighbor, index) => (
                  <article key={`${neighbor.link_id}-${neighbor.object.id}-${index}`} style={{ padding: 10, background: '#0b1220', border: '1px solid #1f2937', borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <strong style={{ fontSize: 13 }}>{neighbor.link_name}</strong>
                      <span className="of-chip">{neighbor.direction}</span>
                    </div>
                    <p style={{ margin: '6px 0 0', color: '#94a3b8', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      {neighbor.object.id}
                    </p>
                    <dl style={{ display: 'grid', gap: 4, margin: '8px 0 0', fontSize: 12 }}>
                      {Object.entries(neighbor.object.properties ?? {}).slice(0, 4).map(([key, value]) => (
                        <div key={key} style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: 8 }}>
                          <dt style={{ color: '#64748b', overflowWrap: 'anywhere' }}>{key}</dt>
                          <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{formatValue(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
                {!linksLoading && !linksError && neighbors.length === 0 && (
                  <p className="of-text-muted" style={{ fontSize: 13 }}>No linked objects found.</p>
                )}
              </section>
            )}

            {!loading && object && tab === 'actions' && (
              <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
                <div style={{ display: 'grid', alignContent: 'start', gap: 6 }}>
                  {actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => setSelectedActionId(action.id)}
                      className={`of-button${selectedActionId === action.id ? ' of-button--primary' : ''}`}
                      style={{ justifyContent: 'flex-start', textAlign: 'left', fontSize: 12 }}
                    >
                      {action.display_name || action.name}
                    </button>
                  ))}
                  {actions.length === 0 && <p className="of-text-muted" style={{ fontSize: 13 }}>No actions apply to this object type.</p>}
                </div>
                <div style={{ minWidth: 0, padding: 12, background: '#0b1220', border: '1px solid #1f2937', borderRadius: 8 }}>
                  <ActionExecutor action={selectedAction} targetObjectId={object.id} onExecuted={(response) => void handleExecuted(response)} />
                  {actionResult && (
                    <pre style={{ marginTop: 12, padding: 10, background: '#020617', color: '#a5f3fc', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11, maxHeight: 220, overflow: 'auto' }}>
                      {JSON.stringify(actionResult, null, 2)}
                    </pre>
                  )}
                </div>
              </section>
            )}

            {!loading && object && tab === 'timeline' && (
              <ObjectTimeline typeId={typeId} objectId={object.id} onRestore={(restored) => {
                setObject(restored);
                onObjectUpdated?.(restored);
              }} />
            )}

            {!loading && object && tab === 'raw' && (
              <pre style={{ padding: 12, background: '#020617', color: '#cbd5e1', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11, overflow: 'auto', maxHeight: 520 }}>
                {JSON.stringify(object, null, 2)}
              </pre>
            )}
          </div>

          <footer style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 12, borderTop: '1px solid #1e293b' }}>
            <span className="of-text-muted" style={{ fontSize: 11 }}>
              {objectType?.name || typeId}
            </span>
            <button type="button" onClick={onClose} className="of-button">Close</button>
          </footer>
        </div>
      )}
    </Drawer>
  );
}

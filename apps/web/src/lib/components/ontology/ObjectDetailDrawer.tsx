import { useEffect, useMemo, useState } from 'react';

import {
  formatPropertyValue,
  getObject,
  groupLinkedObjectsByLinkType,
  mergeApplicableInterfaceActions,
  objectViewFullHref,
  objectViewPrimaryKey,
  objectViewTitle,
  listActionTypes,
  listNeighbors,
  listProperties,
  listTypeInterfaces,
  objectViewProminentProperties,
  objectViewVisibleProperties,
  prominentPropertyPresentation,
  propertyConditionalStyle,
  type ActionType,
  type ExecuteActionResponse,
  type ExecuteBatchActionResponse,
  type LinkType,
  type NeighborLink,
  type ObjectInstance,
  type ObjectType,
  type ObjectViewFormFactor,
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
  linkTypes?: LinkType[];
  formFactor?: ObjectViewFormFactor;
  fullViewHref?: string;
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

function mediaUrl(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidate = record.url ?? record.href ?? record.uri ?? record.rid ?? record.src;
    return typeof candidate === 'string' ? candidate : null;
  }
  return null;
}

function timeSeriesPoints(value: unknown): Array<{ label: string; value: number }> {
  const raw = Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).points) ? (value as Record<string, unknown>).points as unknown[] : [];
  return raw
    .map((entry, index) => {
      if (typeof entry === 'number') return { label: String(index + 1), value: entry };
      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>;
        const numeric = Number(record.value ?? record.y ?? record.measure);
        if (Number.isFinite(numeric)) return { label: String(record.timestamp ?? record.x ?? index + 1), value: numeric };
      }
      return null;
    })
    .filter((entry): entry is { label: string; value: number } => entry !== null);
}

function geoSummary(value: unknown) {
  if (!value) return 'No geometry value.';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.lat === 'number' && typeof record.lon === 'number') return `${record.lat.toFixed(5)}, ${record.lon.toFixed(5)}`;
    if (typeof record.latitude === 'number' && typeof record.longitude === 'number') return `${record.latitude.toFixed(5)}, ${record.longitude.toFixed(5)}`;
    if (record.type) return `${record.type} geometry`;
  }
  return JSON.stringify(value);
}

function Sparkline({ points }: { points: Array<{ label: string; value: number }> }) {
  if (points.length < 2) return <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Chart unavailable: not enough time-series points.</p>;
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const range = max - min || 1;
  const coords = points.map((point, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * 100;
    const y = 36 - ((point.value - min) / range) * 32;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 100 40" role="img" aria-label="Time series sparkline" style={{ width: '100%', height: 90 }}>
      <polyline points={coords} fill="none" stroke="#38bdf8" strokeWidth="2.5" />
      <line x1="0" x2="100" y1="38" y2="38" stroke="#334155" strokeWidth="1" />
    </svg>
  );
}

function ProminentPropertyCard({ property, value }: { property: Property; value: unknown }) {
  const presentation = prominentPropertyPresentation(property);
  const formatted = formatPropertyValue(property, value);
  const url = mediaUrl(value);
  const points = timeSeriesPoints(value);
  return (
    <article style={{ padding: 12, background: '#111827', border: '1px solid #334155', borderRadius: 10, minHeight: 110, display: 'grid', gap: 8, ...propertyConditionalStyle(property, value) }}>
      <div>
        <p className="of-eyebrow" style={{ margin: 0 }}>{property.display_name || property.name}</p>
        <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 11 }}>{presentation.replace('_', ' ')}</p>
      </div>
      {presentation === 'media' ? (
        url ? (
          /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url) ? (
            <img src={url} alt={property.display_name || property.name} style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8, background: '#020617' }} />
          ) : (
            <a href={url} target="_blank" rel="noreferrer" className="of-button" style={{ justifySelf: 'start' }}>Open media reference</a>
          )
        ) : (
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Media viewer unavailable for this value. Raw reference: {formatted}</p>
        )
      ) : presentation === 'time_series' ? (
        <div>
          <Sparkline points={points} />
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>{points.length ? `${points.length} points` : 'Time-series chart unavailable; showing raw value.'}</p>
        </div>
      ) : presentation === 'map' ? (
        <div style={{ padding: 12, borderRadius: 8, border: '1px dashed #475569', background: '#0b1220' }}>
          <strong style={{ display: 'block', fontSize: 13 }}>Map preview</strong>
          <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>Map subsystem not embedded here. Geometry: {geoSummary(value)}</p>
          <a href="/geospatial" className="of-button" style={{ marginTop: 8, display: 'inline-flex' }}>Open map workspace</a>
        </div>
      ) : (
        <strong style={{ fontSize: 18, overflowWrap: 'anywhere' }}>{formatted}</strong>
      )}
    </article>
  );
}

function openLinkedObjectExploration(linkTypeId: string, items: NeighborLink[]) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams();
  params.set('kind', 'object_instance');
  params.set('link_type_id', linkTypeId);
  params.set('objects', items.map((item) => item.object.id).slice(0, 25).join(','));
  window.open(`/object-explorer?${params.toString()}`, '_blank', 'noopener,noreferrer');
}

function LinkedObjectPreview({ neighbor, onOpenFull }: { neighbor: NeighborLink | null; onOpenFull: (neighbor: NeighborLink) => void }) {
  if (!neighbor) {
    return (
      <aside style={{ padding: 12, background: '#0b1220', border: '1px dashed #334155', borderRadius: 8 }}>
        <p className="of-text-muted" style={{ margin: 0, fontSize: 13 }}>Select a linked object to preview it in this panel.</p>
      </aside>
    );
  }
  return (
    <aside style={{ padding: 12, background: '#0b1220', border: '1px solid #1f2937', borderRadius: 8, display: 'grid', gap: 8, alignContent: 'start' }}>
      <div>
        <p className="of-eyebrow" style={{ margin: 0 }}>{neighbor.link_name}</p>
        <h3 style={{ margin: '4px 0 0', color: '#f8fafc', fontSize: 16 }}>{objectViewTitle(neighbor.object)}</h3>
        <p style={{ margin: '4px 0 0', color: '#94a3b8', fontFamily: 'var(--font-mono)', fontSize: 11, overflowWrap: 'anywhere' }}>{neighbor.object.id}</p>
      </div>
      <dl style={{ display: 'grid', gap: 6, margin: 0, fontSize: 12 }}>
        {Object.entries(neighbor.object.properties ?? {}).slice(0, 8).map(([key, value]) => (
          <div key={key} style={{ display: 'grid', gap: 2 }}>
            <dt style={{ color: '#64748b', overflowWrap: 'anywhere' }}>{key}</dt>
            <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="of-button" onClick={() => onOpenFull(neighbor)} style={{ justifySelf: 'start' }}>
        Open full Object View
      </button>
    </aside>
  );
}

export function ObjectDetailDrawer({
  open,
  typeId,
  objectId,
  objectType,
  initialObject = null,
  properties: providedProperties = EMPTY_PROPERTIES,
  actions: providedActions = EMPTY_ACTIONS,
  linkTypes = [],
  formFactor = 'full',
  fullViewHref,
  onClose,
  onObjectUpdated,
}: ObjectDetailDrawerProps) {
  const [tab, setTab] = useState<ObjectDetailTab>('summary');
  const [object, setObject] = useState<ObjectInstance | null>(initialObject);
  const [properties, setProperties] = useState<Property[]>(providedProperties);
  const [actions, setActions] = useState<ActionType[]>(providedActions);
  const [neighbors, setNeighbors] = useState<NeighborLink[]>([]);
  const [selectedLinkedObject, setSelectedLinkedObject] = useState<NeighborLink | null>(null);
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
    setSelectedLinkedObject(null);
    setLinksError('');
    setLoading(true);
    setError('');

    async function load() {
      try {
        const [objectRes, propertyRes, actionRes, implementedInterfaces, allActions] = await Promise.all([
          getObject(typeId, activeObjectId),
          providedProperties.length > 0 ? Promise.resolve(providedProperties) : listProperties(typeId),
          providedActions.length > 0
            ? Promise.resolve({ data: providedActions })
            : listActionTypes({ object_type_id: typeId, per_page: 100 }),
          listTypeInterfaces(typeId).catch(() => []),
          listActionTypes({ per_page: 200 }).then((response) => response.data).catch(() => []),
        ]);
        if (cancelled) return;
        setObject(objectRes);
        setProperties(propertyRes);
        setActions(mergeApplicableInterfaceActions(actionRes.data, allActions, implementedInterfaces));
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

  const prominentProperties = useMemo(() => objectViewProminentProperties(properties), [properties]);
  const normalProperties = useMemo(
    () => objectViewVisibleProperties(properties).filter((property) => !prominentProperties.some((prominent) => prominent.id === property.id)),
    [properties, prominentProperties],
  );

  const linkedObjectGroups = useMemo(() => groupLinkedObjectsByLinkType(neighbors, linkTypes), [neighbors, linkTypes]);
  const visibleNeighbors = useMemo(() => linkedObjectGroups.flatMap((group) => group.items), [linkedObjectGroups]);
  const availableTabs = useMemo(() => (
    formFactor === 'panel'
      ? ([
          { id: 'summary', label: 'Summary' },
          { id: 'properties', label: `Properties (${properties.length})` },
          { id: 'links', label: visibleNeighbors.length ? `Links (${visibleNeighbors.length})` : 'Links' },
          { id: 'actions', label: actions.length ? `Actions (${actions.length})` : 'Actions' },
        ] as const)
      : ([
          { id: 'summary', label: 'Summary' },
          { id: 'properties', label: `Properties (${properties.length})` },
          { id: 'links', label: visibleNeighbors.length ? `Links (${visibleNeighbors.length})` : 'Links' },
          { id: 'actions', label: actions.length ? `Actions (${actions.length})` : 'Actions' },
          { id: 'timeline', label: 'Timeline' },
          { id: 'raw', label: 'Raw' },
        ] as const)
  ), [actions.length, formFactor, properties.length, visibleNeighbors.length]);

  useEffect(() => {
    if (!availableTabs.some((entry) => entry.id === tab)) setTab('summary');
  }, [availableTabs, tab]);

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
    <Drawer open={open} title={object ? objectViewTitle(object, objectType) : 'Object detail'} width={formFactor === 'panel' ? 'min(520px, calc(100vw - 32px))' : 'min(960px, calc(100vw - 32px))'} onClose={onClose}>
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
                  {object ? objectViewTitle(object, objectType) : shortId(objectId)}
                </h2>
                <p style={{ margin: '6px 0 0', color: '#94a3b8', fontFamily: 'var(--font-mono)', fontSize: 11, overflowWrap: 'anywhere' }}>
                  Primary key: {object ? objectViewPrimaryKey(object, objectType) : shortId(objectId)} · Object ID: {objectId}
                </p>
                {formFactor === 'panel' && (
                  <a href={fullViewHref || objectViewFullHref(typeId, objectId)} target="_blank" rel="noreferrer" className="of-button" style={{ marginTop: 8, display: 'inline-flex', fontSize: 12 }}>
                    Open full Object View
                  </a>
                )}
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
            tabs={availableTabs}
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
                  <p className="of-eyebrow" style={{ margin: 0 }}>Prominent properties</p>
                  {prominentProperties.length > 0 ? (
                    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                      {prominentProperties.map((property) => (
                        <ProminentPropertyCard
                          key={property.id}
                          property={property}
                          value={object.properties?.[property.name]}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>No prominent properties configured.</p>
                  )}
                </section>
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
              <section style={{ display: 'grid', gap: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                      <th style={{ padding: 8, borderBottom: '1px solid #1f2937' }}>Property</th>
                      <th style={{ padding: 8, borderBottom: '1px solid #1f2937' }}>Type</th>
                      <th style={{ padding: 8, borderBottom: '1px solid #1f2937' }}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {normalProperties.map((property) => (
                      <tr key={property.id}>
                        <td style={{ padding: 8, borderBottom: '1px solid #1f2937', verticalAlign: 'top' }}>
                          <strong style={{ color: '#e2e8f0' }}>{property.display_name || property.name}</strong>
                          <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 11 }}>{property.name}{property.required ? ' · required' : ''}</p>
                        </td>
                        <td style={{ padding: 8, borderBottom: '1px solid #1f2937', verticalAlign: 'top', color: '#94a3b8' }}>{property.property_type}</td>
                        <td style={{ padding: 8, borderBottom: '1px solid #1f2937', verticalAlign: 'top' }}>
                          <InlineEditCell
                            typeId={typeId}
                            objectId={object.id}
                            property={property}
                            value={object.properties?.[property.name]}
                            onUpdated={(next) => updateProperty(property, next)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {normalProperties.length === 0 && (
                  <p className="of-text-muted" style={{ fontSize: 13 }}>No normal visible properties. Hidden properties are omitted from Core Object Views.</p>
                )}
              </section>
            )}

            {!loading && object && tab === 'links' && (
              <section style={{ display: 'grid', gridTemplateColumns: formFactor === 'panel' ? '1fr' : 'minmax(0, 1fr) minmax(260px, 340px)', gap: 12 }}>
                <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
                  {linksLoading && <p className="of-text-muted" style={{ fontSize: 13 }}>Loading links...</p>}
                  {linksError && (
                    <div className="of-status-danger" style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12 }}>
                      {linksError}
                    </div>
                  )}
                  {linkedObjectGroups.map((group) => (
                    <article key={group.link_type_id} style={{ padding: 10, background: '#0b1220', border: '1px solid #1f2937', borderRadius: 8, display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div>
                          <strong style={{ fontSize: 13 }}>{group.link_name}</strong>
                          <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 11 }}>
                            {group.outbound.length} outbound · {group.inbound.length} inbound
                          </p>
                        </div>
                        <button type="button" className="of-button" onClick={() => openLinkedObjectExploration(group.link_type_id, group.items)} style={{ fontSize: 11 }}>
                          Explore subset
                        </button>
                      </div>
                      <div style={{ display: 'grid', gap: 6 }}>
                        {group.items.slice(0, formFactor === 'panel' ? 3 : 6).map((neighbor) => (
                          <button
                            key={`${neighbor.link_id}-${neighbor.object.id}`}
                            type="button"
                            onClick={() => setSelectedLinkedObject(neighbor)}
                            style={{
                              padding: 8,
                              border: selectedLinkedObject?.object.id === neighbor.object.id ? '1px solid #38bdf8' : '1px solid #1f2937',
                              borderRadius: 6,
                              background: selectedLinkedObject?.object.id === neighbor.object.id ? 'rgba(14, 165, 233, 0.12)' : '#020617',
                              color: '#e2e8f0',
                              textAlign: 'left',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                              <strong style={{ fontSize: 12 }}>{objectViewTitle(neighbor.object)}</strong>
                              <span className="of-chip">{neighbor.direction}</span>
                            </div>
                            <dl style={{ display: 'grid', gap: 3, margin: '6px 0 0', fontSize: 11 }}>
                              {Object.entries(neighbor.object.properties ?? {}).slice(0, 3).map(([key, value]) => (
                                <div key={key} style={{ display: 'grid', gridTemplateColumns: '100px minmax(0, 1fr)', gap: 6 }}>
                                  <dt style={{ color: '#64748b', overflowWrap: 'anywhere' }}>{key}</dt>
                                  <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}</dd>
                                </div>
                              ))}
                            </dl>
                          </button>
                        ))}
                      </div>
                    </article>
                  ))}
                  {!linksLoading && !linksError && visibleNeighbors.length === 0 && (
                    <p className="of-text-muted" style={{ fontSize: 13 }}>No linked objects found.</p>
                  )}
                </div>
                {formFactor !== 'panel' && (
                  <LinkedObjectPreview
                    neighbor={selectedLinkedObject}
                    onOpenFull={(neighbor) => {
                      const href = objectViewFullHref(neighbor.object);
                      if (typeof window !== 'undefined') window.open(href, '_blank', 'noopener,noreferrer');
                    }}
                  />
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

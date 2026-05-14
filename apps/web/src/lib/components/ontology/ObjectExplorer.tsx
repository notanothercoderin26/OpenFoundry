import { useEffect, useState } from 'react';

import { filterObjectsForRestrictedViewPolicy, formatPropertyValue, listObjects, listProperties, objectViewVisibleProperties, propertyConditionalStyle, queryObjects, restrictedViewBackingConfigForObjectType, type ObjectInstance, type ObjectInstanceViewPolicy, type ObjectType, type OntologyPermissionPrincipal, type Property } from '@/lib/api/ontology';
import { InlineEditCell } from './InlineEditCell';
import { ObjectCard } from './ObjectCard';

interface ObjectExplorerProps {
  typeId: string;
  objectType?: ObjectType | null;
  properties?: Property[];
  pageSize?: number;
  editable?: boolean;
  instanceAccess?: ObjectInstanceViewPolicy | null;
  principal?: OntologyPermissionPrincipal | null;
  reloadSignal?: number;
  onSelect?: (object: ObjectInstance) => void;
  onObjectUpdated?: (object: ObjectInstance) => void;
}

export function ObjectExplorer({
  typeId,
  objectType = null,
  properties: propertiesProp,
  pageSize = 50,
  editable = false,
  instanceAccess = null,
  principal = null,
  reloadSignal = 0,
  onSelect,
  onObjectUpdated,
}: ObjectExplorerProps) {
  const [properties, setProperties] = useState<Property[]>(propertiesProp ?? []);
  const [objects, setObjects] = useState<ObjectInstance[]>([]);
  const [filters, setFilters] = useState<Array<{ name: string; value: string }>>([]);
  const [marking, setMarking] = useState('');
  const [layout, setLayout] = useState<'table' | 'cards'>('table');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canViewDefinition = instanceAccess?.can_view_definition ?? true;
  const canViewInstances = instanceAccess?.can_view_instances ?? true;
  const schemaOnly = Boolean(instanceAccess?.schema_only);
  const restrictedViewBacked = Boolean(objectType && restrictedViewBackingConfigForObjectType(objectType));

  useEffect(() => {
    if (propertiesProp) {
      setProperties(propertiesProp);
      return;
    }
    listProperties(typeId).then(setProperties).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [typeId, propertiesProp]);

  function applyFacet(list: ObjectInstance[]) {
    if (!marking) return list;
    return list.filter((o) => o.marking === marking);
  }

  async function load() {
    if (!canViewDefinition || !canViewInstances) {
      setObjects([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const active = filters.filter((f) => f.name && f.value !== '');
      if (active.length === 0) {
        const r = await listObjects(typeId, { page, per_page: pageSize });
        const rows = filterObjectsForRestrictedViewPolicy(applyFacet(r.data ?? []), { objectType, principal });
        setObjects(rows);
        setTotal(restrictedViewBacked ? rows.length : r.total ?? r.data?.length ?? 0);
      } else {
        const equals: Record<string, unknown> = {};
        for (const f of active) equals[f.name] = f.value;
        const r = await queryObjects(typeId, { equals, limit: pageSize });
        const rows = filterObjectsForRestrictedViewPolicy(applyFacet(r.data ?? []), { objectType, principal });
        setObjects(rows);
        setTotal(restrictedViewBacked ? rows.length : r.total ?? r.data?.length ?? 0);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [typeId, page, marking, reloadSignal, canViewDefinition, canViewInstances, restrictedViewBacked, principal]);

  function addFilter() {
    setFilters((prev) => [...prev, { name: properties[0]?.name ?? '', value: '' }]);
  }

  function updateObjectProperty(object: ObjectInstance, property: Property, value: unknown) {
    const next = {
      ...object,
      properties: {
        ...(object.properties ?? {}),
        [property.name]: value,
      },
      updated_at: new Date().toISOString(),
    };
    setObjects((prev) => prev.map((candidate) => (candidate.id === object.id ? next : candidate)));
    onObjectUpdated?.(next);
  }

  const visibleProperties = objectViewVisibleProperties(properties).slice(0, 5);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, color: '#e2e8f0' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Objects ({total})</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <select value={layout} onChange={(e) => setLayout(e.target.value as typeof layout)} className="of-input" style={{ fontSize: 11 }}>
            <option value="table">Table</option>
            <option value="cards">Cards</option>
          </select>
          <select value={marking} onChange={(e) => setMarking(e.target.value)} className="of-input" style={{ fontSize: 11 }}>
            <option value="">All markings</option>
            <option value="public">public</option>
            <option value="confidential">confidential</option>
            <option value="pii">pii</option>
          </select>
          <button type="button" onClick={() => void load()} disabled={loading || !canViewInstances} className="of-button" style={{ fontSize: 11 }}>Refresh</button>
        </div>
      </header>

      {!canViewDefinition && (
        <div className="of-status-danger" style={{ padding: 8, borderRadius: 6, fontSize: 12 }}>
          Object type definition is not viewable for the current user.
        </div>
      )}

      {schemaOnly && (
        <div className="of-status-warning" style={{ padding: 8, borderRadius: 6, fontSize: 12 }}>
          {instanceAccess?.reason || 'Object values are restricted; rendering schema only.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, opacity: canViewInstances ? 1 : 0.65 }}>
        {filters.map((f, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 4 }}>
            <select
              value={f.name}
              onChange={(e) => setFilters((prev) => prev.map((p, j) => (j === i ? { ...p, name: e.target.value } : p)))}
              className="of-input"
              style={{ fontSize: 11 }}
            >
              {properties.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
            <input value={f.value} onChange={(e) => setFilters((prev) => prev.map((p, j) => (j === i ? { ...p, value: e.target.value } : p)))} className="of-input" style={{ fontSize: 11 }} />
            <button type="button" onClick={() => setFilters((prev) => prev.filter((_, j) => j !== i))} className="of-button" style={{ fontSize: 11, color: '#fca5a5', borderColor: '#7f1d1d' }}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={addFilter} disabled={!canViewInstances} className="of-button" style={{ fontSize: 11 }}>+ Filter</button>
          <button type="button" onClick={() => { setPage(1); void load(); }} disabled={!canViewInstances} className="of-button of-button--primary" style={{ fontSize: 11 }}>Apply</button>
        </div>
      </div>

      {error && <p style={{ color: '#fca5a5', fontSize: 11, margin: 0 }}>{error}</p>}

      {schemaOnly ? (
        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #1f2937' }}>Property</th>
                <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #1f2937' }}>Type</th>
                <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #1f2937' }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {objectViewVisibleProperties(properties).map((property) => (
                <tr key={property.id}>
                  <td style={{ padding: 6, borderBottom: '1px solid #1f2937' }}>{property.display_name || property.name}</td>
                  <td style={{ padding: 6, borderBottom: '1px solid #1f2937', color: '#94a3b8' }}>{property.property_type}</td>
                  <td style={{ padding: 6, borderBottom: '1px solid #1f2937', color: '#94a3b8' }}>Restricted</td>
                </tr>
              ))}
              {properties.length === 0 && (
                <tr><td colSpan={3} style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>No schema properties.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : layout === 'table' ? (
        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #1f2937' }}>Object id</th>
                {visibleProperties.map((p) => (
                  <th key={p.id} style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #1f2937' }}>{p.display_name || p.name}</th>
                ))}
                <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #1f2937' }}>Marking</th>
                {onSelect && <th style={{ textAlign: 'right', padding: 6, borderBottom: '1px solid #1f2937' }}>Open</th>}
              </tr>
            </thead>
            <tbody>
              {objects.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => onSelect?.(o)}
                  style={{ cursor: onSelect ? 'pointer' : 'default', borderBottom: '1px solid #1f2937' }}
                >
                  <td style={{ padding: 6, fontFamily: 'var(--font-mono)' }}>{o.id.slice(0, 12)}…</td>
                  {visibleProperties.map((p) => {
                    const security = o.object_security_access?.property_decisions.find((decision) => decision.property_name === p.name);
                    const readBlocked = Boolean(security && !security.can_read);
                    const editBlocked = security && !(security.policy_property ? security.can_edit_policy_property : security.can_edit_property)
                      ? security.reason
                      : '';
                    return (
                      <td key={p.id} style={{ padding: 6 }}>
                        {readBlocked ? (
                          <span className="of-text-muted">Restricted</span>
                        ) : editable ? (
                          <InlineEditCell
                            typeId={typeId}
                            objectId={o.id}
                            property={p}
                            value={o.properties?.[p.name]}
                            disabledReason={editBlocked}
                            onUpdated={(value) => updateObjectProperty(o, p, value)}
                          />
                        ) : (
                          <span style={propertyConditionalStyle(p, o.properties?.[p.name])}>
                            {formatPropertyValue(p, o.properties?.[p.name])}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ padding: 6 }}>{o.marking ?? '—'}</td>
                  {onSelect && (
                    <td style={{ padding: 6, textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelect(o);
                        }}
                        className="of-button"
                        style={{ fontSize: 11 }}
                      >
                        Open
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {objects.length === 0 && !loading && (
                <tr><td colSpan={visibleProperties.length + 2 + (onSelect ? 1 : 0)} style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>No objects.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {objects.map((o) => (
            <ObjectCard key={o.id} object={o} properties={properties} objectType={objectType} onClick={onSelect ? () => onSelect(o) : undefined} />
          ))}
        </div>
      )}

      <footer style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
        <span style={{ color: '#94a3b8' }}>Page {page} · {total} total</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || !canViewInstances} className="of-button" style={{ fontSize: 11 }}>← Prev</button>
          <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page * pageSize >= total || !canViewInstances} className="of-button" style={{ fontSize: 11 }}>Next →</button>
        </span>
      </footer>
    </section>
  );
}

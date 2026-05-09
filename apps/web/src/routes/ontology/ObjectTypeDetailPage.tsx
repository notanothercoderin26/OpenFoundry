import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  createObject,
  getObjectType,
  listActionTypes,
  listLinkTypes,
  listProperties,
  listRules,
  listTypeSharedPropertyTypes,
  type ActionType,
  type LinkType,
  type ObjectInstance,
  type ObjectType,
  type OntologyRule,
  type Property,
  type SharedPropertyType,
} from '@/lib/api/ontology';
import { ObjectDetailDrawer } from '@/lib/components/ontology/ObjectDetailDrawer';
import { ObjectExplorer } from '@/lib/components/ontology/ObjectExplorer';
import { PropertyPanel } from '@/lib/components/ontology/PropertyPanel';
import { Tabs } from '@/lib/components/Tabs';

type Tab = 'overview' | 'properties' | 'objects' | 'actions' | 'links' | 'rules' | 'shared';

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function propertyCountLabel(count: number) {
  return `${count} propert${count === 1 ? 'y' : 'ies'}`;
}

export function ObjectTypeDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('overview');
  const [type, setType] = useState<ObjectType | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [objectsReload, setObjectsReload] = useState(0);
  const [actions, setActions] = useState<ActionType[]>([]);
  const [links, setLinks] = useState<LinkType[]>([]);
  const [rules, setRules] = useState<OntologyRule[]>([]);
  const [shared, setShared] = useState<SharedPropertyType[]>([]);
  const [selectedObject, setSelectedObject] = useState<ObjectInstance | null>(null);
  const [createPropsJson, setCreatePropsJson] = useState('{}');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadOverview() {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      setType(await getObjectType(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load type');
    } finally {
      setLoading(false);
    }
  }

  async function ensureProperties() {
    if (!id || properties.length > 0) return;
    setProperties(await listProperties(id));
  }

  async function ensureActions() {
    if (!id || actions.length > 0) return;
    setActions((await listActionTypes({ object_type_id: id, per_page: 100 })).data);
  }

  async function loadTab(next: Tab) {
    setTab(next);
    if (!id) return;
    setError('');
    try {
      if (next === 'properties' || next === 'objects') await ensureProperties();
      if (next === 'objects' || next === 'actions') await ensureActions();
      if (next === 'links' && links.length === 0) setLinks((await listLinkTypes({ object_type_id: id, per_page: 100 })).data);
      if (next === 'rules' && rules.length === 0) setRules((await listRules({ object_type_id: id })).data);
      if (next === 'shared' && shared.length === 0) setShared(await listTypeSharedPropertyTypes(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load tab');
    }
  }

  useEffect(() => {
    setProperties([]);
    setActions([]);
    setLinks([]);
    setRules([]);
    setShared([]);
    setSelectedObject(null);
    void loadOverview();
  }, [id]);

  async function createObj() {
    if (!type) return;
    setBusy(true);
    setError('');
    try {
      const propertiesBody = JSON.parse(createPropsJson || '{}') as Record<string, unknown>;
      const created = await createObject(type.id, { properties: propertiesBody });
      setSelectedObject(created);
      setCreatePropsJson('{}');
      setObjectsReload((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Create object failed');
    } finally {
      setBusy(false);
    }
  }

  function handleObjectUpdated(next: ObjectInstance) {
    setSelectedObject(next);
    setObjectsReload((value) => value + 1);
  }

  if (loading) {
    return (
      <section className="of-page" style={{ padding: 24 }}>
        <p className="of-text-muted">Loading...</p>
      </section>
    );
  }

  if (!type) {
    return (
      <section className="of-page" style={{ padding: 24 }}>
        <Link to="/ontology" style={{ color: 'var(--text-muted)', fontSize: 13 }}>Back to ontology</Link>
        <p className="of-status-danger" style={{ marginTop: 12 }}>{error || 'Object type not found'}</p>
      </section>
    );
  }

  return (
    <section className="of-page" style={{ padding: 24, display: 'grid', gap: 16 }}>
      <Link to="/ontology" style={{ color: 'var(--text-muted)', fontSize: 13 }}>Back to ontology</Link>

      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
          <div
            aria-hidden="true"
            style={{
              width: 56,
              height: 56,
              background: type.color || '#4d8cf0',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 24,
              flexShrink: 0,
            }}
          >
            {type.icon || type.display_name.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 className="of-heading-xl">{type.display_name}</h1>
            <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12, overflowWrap: 'anywhere' }}>
              {type.id} / name: {type.name} / pk: {type.primary_key_property ?? '-'}
            </p>
            {type.description && <p style={{ margin: '8px 0 0', maxWidth: 760 }}>{type.description}</p>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Link to="/object-link-types" className="of-button">Manage schema</Link>
          <Link to="/action-types" className="of-button">Action types</Link>
        </div>
      </header>

      {error && (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'properties', label: properties.length ? `Properties (${properties.length})` : 'Properties' },
          { id: 'objects', label: 'Objects' },
          { id: 'actions', label: actions.length ? `Actions (${actions.length})` : 'Actions' },
          { id: 'links', label: links.length ? `Links (${links.length})` : 'Links' },
          { id: 'rules', label: rules.length ? `Rules (${rules.length})` : 'Rules' },
          { id: 'shared', label: shared.length ? `Shared (${shared.length})` : 'Shared' },
        ] as const}
        active={tab}
        onChange={(next) => void loadTab(next)}
      />

      {tab === 'overview' && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div>
              <p className="of-eyebrow">Identifier</p>
              <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{type.name}</p>
            </div>
            <div>
              <p className="of-eyebrow">Primary key</p>
              <p style={{ margin: '4px 0 0', fontSize: 12 }}>{type.primary_key_property ?? '-'}</p>
            </div>
            <div>
              <p className="of-eyebrow">Owner</p>
              <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-mono)', fontSize: 12, overflowWrap: 'anywhere' }}>{type.owner_id}</p>
            </div>
            <div>
              <p className="of-eyebrow">Updated</p>
              <p style={{ margin: '4px 0 0', fontSize: 12 }}>{formatDate(type.updated_at)}</p>
            </div>
          </div>
          <pre style={{ padding: 12, background: 'var(--bg-subtle)', fontSize: 11, fontFamily: 'var(--font-mono)', borderRadius: 8, overflow: 'auto' }}>
            {JSON.stringify(type, null, 2)}
          </pre>
        </section>
      )}

      {tab === 'properties' && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 10 }}>
          <p className="of-eyebrow">{propertyCountLabel(properties.length)}</p>
          {properties.map((property) => (
            <PropertyPanel
              key={property.id}
              property={property}
              typeId={type.id}
              isPrimaryKey={type.primary_key_property === property.name}
              onUpdated={(updated) => setProperties((current) => current.map((item) => (item.id === updated.id ? updated : item)))}
            />
          ))}
          {properties.length === 0 && <p className="of-text-muted">No properties.</p>}
        </section>
      )}

      {tab === 'objects' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <section className="of-panel" style={{ padding: 16 }}>
            <p className="of-eyebrow">Create object</p>
            <textarea
              value={createPropsJson}
              onChange={(event) => setCreatePropsJson(event.target.value)}
              className="of-input"
              style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 11, minHeight: 120 }}
            />
            <button type="button" onClick={() => void createObj()} disabled={busy} className="of-button of-button--primary" style={{ marginTop: 6 }}>
              {busy ? 'Creating...' : 'Create'}
            </button>
          </section>

          <ObjectExplorer
            typeId={type.id}
            objectType={type}
            properties={properties}
            editable
            reloadSignal={objectsReload}
            onSelect={setSelectedObject}
            onObjectUpdated={handleObjectUpdated}
          />
        </div>
      )}

      {tab === 'actions' && (
        <section className="of-panel" style={{ padding: 16 }}>
          <p className="of-eyebrow">Action types ({actions.length})</p>
          <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {actions.map((action) => (
              <li key={action.id} style={{ padding: 10, border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                <strong>{action.display_name}</strong> <span className="of-text-muted">/ {action.name} / {action.operation_kind}</span>
                {action.description && <p className="of-text-muted" style={{ fontSize: 12, margin: '4px 0 0' }}>{action.description}</p>}
              </li>
            ))}
            {actions.length === 0 && <li className="of-text-muted">No actions for this type.</li>}
          </ul>
        </section>
      )}

      {tab === 'links' && (
        <section className="of-panel" style={{ padding: 16 }}>
          <p className="of-eyebrow">Link types ({links.length})</p>
          <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {links.map((link) => (
              <li key={link.id} style={{ padding: 10, border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                <strong>{link.display_name}</strong> <span className="of-text-muted">/ {link.name}</span>
                <p className="of-text-muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                  {link.source_type_id} to {link.target_type_id} / {link.cardinality}
                </p>
              </li>
            ))}
            {links.length === 0 && <li className="of-text-muted">No links.</li>}
          </ul>
        </section>
      )}

      {tab === 'rules' && (
        <section className="of-panel" style={{ padding: 16 }}>
          <p className="of-eyebrow">Rules ({rules.length})</p>
          <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {rules.map((rule) => (
              <li key={rule.id} style={{ padding: 10, border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                <strong>{rule.display_name || rule.name}</strong> <span className="of-text-muted">/ {rule.evaluation_mode}</span>
              </li>
            ))}
            {rules.length === 0 && <li className="of-text-muted">No rules.</li>}
          </ul>
        </section>
      )}

      {tab === 'shared' && (
        <section className="of-panel" style={{ padding: 16 }}>
          <p className="of-eyebrow">Shared property types ({shared.length})</p>
          <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 12 }}>
            {shared.map((property) => (
              <li key={property.id}>
                <strong>{property.display_name}</strong> / {property.name} / {property.property_type}
              </li>
            ))}
            {shared.length === 0 && <li className="of-text-muted">None attached.</li>}
          </ul>
        </section>
      )}

      <ObjectDetailDrawer
        open={selectedObject !== null}
        typeId={type.id}
        objectId={selectedObject?.id ?? null}
        objectType={type}
        initialObject={selectedObject}
        properties={properties}
        actions={actions}
        onClose={() => setSelectedObject(null)}
        onObjectUpdated={handleObjectUpdated}
      />
    </section>
  );
}

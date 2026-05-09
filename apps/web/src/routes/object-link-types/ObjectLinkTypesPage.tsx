import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import {
  attachSharedPropertyType,
  createLinkType,
  createObjectType,
  createProperty,
  createSharedPropertyType,
  deleteLinkType,
  deleteObjectType,
  deleteProperty,
  deleteSharedPropertyType,
  detachSharedPropertyType,
  listLinkTypes,
  listObjectTypes,
  listProperties,
  listSharedPropertyTypes,
  listTypeSharedPropertyTypes,
  updateLinkType,
  updateObjectType,
  updateProperty,
  updateSharedPropertyType,
  type LinkType,
  type ObjectType,
  type Property,
  type SharedPropertyType,
} from '@/lib/api/ontology';
import { Tabs } from '@/lib/components/Tabs';
import { Glyph } from '@/lib/components/ui/Glyph';

type Tab = 'types' | 'links' | 'shared';
type Cardinality = 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';

interface ObjectTypeDraft {
  id?: string;
  name: string;
  display_name: string;
  description: string;
  primary_key_property: string;
  icon: string;
  color: string;
}

interface PropertyDraft {
  name: string;
  display_name: string;
  description: string;
  property_type: string;
  required: boolean;
  unique_constraint: boolean;
  time_dependent: boolean;
}

interface LinkTypeDraft {
  id?: string;
  name: string;
  display_name: string;
  description: string;
  source_type_id: string;
  target_type_id: string;
  cardinality: Cardinality;
}

interface SharedPropertyDraft {
  id?: string;
  name: string;
  display_name: string;
  description: string;
  property_type: string;
  required: boolean;
  unique_constraint: boolean;
  time_dependent: boolean;
}

const PROPERTY_TYPES = [
  'string',
  'integer',
  'float',
  'boolean',
  'date',
  'json',
  'array',
  'reference',
  'geo_point',
  'media_reference',
  'vector',
] as const;

const CARDINALITIES: Cardinality[] = ['one_to_one', 'one_to_many', 'many_to_one', 'many_to_many'];

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function emptyObjectTypeDraft(): ObjectTypeDraft {
  return {
    name: 'case_record',
    display_name: 'Case Record',
    description: '',
    primary_key_property: '',
    icon: '',
    color: '#2563eb',
  };
}

function emptyPropertyDraft(): PropertyDraft {
  return {
    name: 'status',
    display_name: 'Status',
    description: '',
    property_type: 'string',
    required: false,
    unique_constraint: false,
    time_dependent: false,
  };
}

function emptyLinkTypeDraft(sourceTypeId = '', targetTypeId = ''): LinkTypeDraft {
  return {
    name: 'case_relates_to',
    display_name: 'Case relates to',
    description: '',
    source_type_id: sourceTypeId,
    target_type_id: targetTypeId,
    cardinality: 'many_to_many',
  };
}

function emptySharedPropertyDraft(): SharedPropertyDraft {
  return {
    name: 'shared_status',
    display_name: 'Shared Status',
    description: '',
    property_type: 'string',
    required: false,
    unique_constraint: false,
    time_dependent: false,
  };
}

function matchesSearch(values: Array<string | null | undefined>, search: string) {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => (value ?? '').toLowerCase().includes(normalized));
}

function shortId(id: string) {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not recorded' : dateFormatter.format(parsed);
}

function formatCardinality(cardinality: string) {
  return cardinality.replaceAll('_to_', ' -> ').replaceAll('_', ' ');
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function MetricTile({ label, value, detail }: { label: string; value: ReactNode; detail: string }) {
  return (
    <article className="of-panel" style={{ padding: 16, minHeight: 104 }}>
      <p className="of-eyebrow">{label}</p>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700, color: 'var(--text-strong)' }}>{value}</div>
      <p className="of-text-muted" style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5 }}>
        {detail}
      </p>
    </article>
  );
}

function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div
      style={{
        padding: 32,
        minHeight: 156,
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        color: 'var(--text-muted)',
        border: '1px dashed var(--border-default)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-muted)',
      }}
    >
      <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
        <Glyph name="link" size={24} tone="#64748b" />
        <strong style={{ color: 'var(--text-strong)' }}>{title}</strong>
        {action}
      </div>
    </div>
  );
}

export function ObjectLinkTypesPage() {
  const [tab, setTab] = useState<Tab>('links');
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [linkTypes, setLinkTypes] = useState<LinkType[]>([]);
  const [sharedProperties, setSharedProperties] = useState<SharedPropertyType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [selectedTypeProps, setSelectedTypeProps] = useState<Property[]>([]);
  const [selectedTypeShared, setSelectedTypeShared] = useState<SharedPropertyType[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeLoading, setTypeLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [typeVersion, setTypeVersion] = useState(0);

  const [objectSearch, setObjectSearch] = useState('');
  const [linkSearch, setLinkSearch] = useState('');
  const [sharedSearch, setSharedSearch] = useState('');
  const [linkTypeFilter, setLinkTypeFilter] = useState('');

  const [objectDraft, setObjectDraft] = useState<ObjectTypeDraft>(() => emptyObjectTypeDraft());
  const [propertyDraft, setPropertyDraft] = useState<PropertyDraft>(() => emptyPropertyDraft());
  const [linkDraft, setLinkDraft] = useState<LinkTypeDraft>(() => emptyLinkTypeDraft());
  const [sharedDraft, setSharedDraft] = useState<SharedPropertyDraft>(() => emptySharedPropertyDraft());

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [objectTypeResponse, linkTypeResponse, sharedPropertyResponse] = await Promise.all([
        listObjectTypes({ page: 1, per_page: 200 }),
        listLinkTypes({ page: 1, per_page: 200 }),
        listSharedPropertyTypes({ page: 1, per_page: 200 }).catch(() => ({
          data: [] as SharedPropertyType[],
          total: 0,
          page: 1,
          per_page: 200,
        })),
      ]);

      const nextTypes = objectTypeResponse.data;
      setObjectTypes(nextTypes);
      setLinkTypes(linkTypeResponse.data);
      setSharedProperties(sharedPropertyResponse.data);

      setSelectedTypeId((current) => {
        if (current && nextTypes.some((type) => type.id === current)) return current;
        return nextTypes[0]?.id ?? '';
      });

      setLinkTypeFilter((current) => {
        if (!current || nextTypes.some((type) => type.id === current)) return current;
        return '';
      });

      setLinkDraft((current) => {
        const firstId = nextTypes[0]?.id ?? '';
        const secondId = nextTypes[1]?.id ?? firstId;
        const sourceStillExists = current.source_type_id && nextTypes.some((type) => type.id === current.source_type_id);
        const targetStillExists = current.target_type_id && nextTypes.some((type) => type.id === current.target_type_id);
        return {
          ...current,
          source_type_id: sourceStillExists ? current.source_type_id : firstId,
          target_type_id: targetStillExists ? current.target_type_id : secondId,
        };
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load object and link types');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  useEffect(() => {
    if (!selectedTypeId) {
      setSelectedTypeProps([]);
      setSelectedTypeShared([]);
      return;
    }

    let cancelled = false;
    async function loadTypeDetails() {
      setTypeLoading(true);
      try {
        const [properties, shared] = await Promise.all([
          listProperties(selectedTypeId),
          listTypeSharedPropertyTypes(selectedTypeId).catch(() => []),
        ]);
        if (cancelled) return;
        setSelectedTypeProps(properties);
        setSelectedTypeShared(shared);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to load selected object type');
      } finally {
        if (!cancelled) setTypeLoading(false);
      }
    }
    void loadTypeDetails();
    return () => {
      cancelled = true;
    };
  }, [selectedTypeId, typeVersion]);

  const typeById = useMemo(() => new Map(objectTypes.map((type) => [type.id, type])), [objectTypes]);
  const selectedType = useMemo(
    () => objectTypes.find((type) => type.id === selectedTypeId) ?? null,
    [objectTypes, selectedTypeId],
  );

  const filteredObjectTypes = useMemo(
    () =>
      objectTypes.filter((type) =>
        matchesSearch([type.display_name, type.name, type.description, type.primary_key_property], objectSearch),
      ),
    [objectTypes, objectSearch],
  );

  const filteredLinkTypes = useMemo(
    () =>
      linkTypes.filter((linkType) => {
        const source = typeById.get(linkType.source_type_id);
        const target = typeById.get(linkType.target_type_id);
        const typeMatches =
          !linkTypeFilter ||
          linkType.source_type_id === linkTypeFilter ||
          linkType.target_type_id === linkTypeFilter;
        return (
          typeMatches &&
          matchesSearch(
            [
              linkType.display_name,
              linkType.name,
              linkType.description,
              linkType.cardinality,
              source?.display_name,
              source?.name,
              target?.display_name,
              target?.name,
            ],
            linkSearch,
          )
        );
      }),
    [linkTypes, linkSearch, linkTypeFilter, typeById],
  );

  const filteredSharedProperties = useMemo(
    () =>
      sharedProperties.filter((property) =>
        matchesSearch([property.display_name, property.name, property.description, property.property_type], sharedSearch),
      ),
    [sharedProperties, sharedSearch],
  );

  const attachedSharedIds = useMemo(() => new Set(selectedTypeShared.map((property) => property.id)), [selectedTypeShared]);
  const attachCandidates = useMemo(
    () => sharedProperties.filter((property) => !attachedSharedIds.has(property.id)),
    [attachedSharedIds, sharedProperties],
  );

  const selectedTypeLinkCount = useMemo(
    () =>
      selectedTypeId
        ? linkTypes.filter((linkType) => linkType.source_type_id === selectedTypeId || linkType.target_type_id === selectedTypeId).length
        : 0,
    [linkTypes, selectedTypeId],
  );

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh(false);
      setTypeVersion((version) => version + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  }

  function typeLabel(id: string) {
    const type = typeById.get(id);
    if (!type) return shortId(id);
    return type.display_name || type.name;
  }

  function typeSubtitle(id: string) {
    const type = typeById.get(id);
    return type ? type.name : shortId(id);
  }

  function editObjectType(type: ObjectType) {
    setSelectedTypeId(type.id);
    setObjectDraft({
      id: type.id,
      name: type.name,
      display_name: type.display_name,
      description: type.description,
      primary_key_property: type.primary_key_property ?? '',
      icon: type.icon ?? '',
      color: type.color ?? '#2563eb',
    });
    setTab('types');
  }

  function editLinkType(linkType: LinkType) {
    setLinkDraft({
      id: linkType.id,
      name: linkType.name,
      display_name: linkType.display_name,
      description: linkType.description,
      source_type_id: linkType.source_type_id,
      target_type_id: linkType.target_type_id,
      cardinality: linkType.cardinality as Cardinality,
    });
    setTab('links');
  }

  function editSharedProperty(property: SharedPropertyType) {
    setSharedDraft({
      id: property.id,
      name: property.name,
      display_name: property.display_name,
      description: property.description,
      property_type: property.property_type,
      required: property.required,
      unique_constraint: property.unique_constraint,
      time_dependent: property.time_dependent,
    });
    setTab('shared');
  }

  async function saveObjectType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      const body = {
        display_name: objectDraft.display_name.trim(),
        description: objectDraft.description.trim(),
        primary_key_property: objectDraft.primary_key_property.trim() || undefined,
        icon: objectDraft.icon.trim() || undefined,
        color: objectDraft.color.trim() || undefined,
      };
      const saved = objectDraft.id
        ? await updateObjectType(objectDraft.id, body)
        : await createObjectType({ name: objectDraft.name.trim(), ...body });
      setSelectedTypeId(saved.id);
      setObjectDraft(emptyObjectTypeDraft());
    });
  }

  async function saveProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTypeId) return;
    await run(async () => {
      await createProperty(selectedTypeId, {
        name: propertyDraft.name.trim(),
        display_name: propertyDraft.display_name.trim(),
        description: propertyDraft.description.trim(),
        property_type: propertyDraft.property_type,
        required: propertyDraft.required,
        unique_constraint: propertyDraft.unique_constraint,
        time_dependent: propertyDraft.time_dependent,
      });
      setPropertyDraft(emptyPropertyDraft());
    });
  }

  async function saveLinkType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      if (linkDraft.id) {
        await updateLinkType(linkDraft.id, {
          display_name: linkDraft.display_name.trim(),
          description: linkDraft.description.trim(),
          cardinality: linkDraft.cardinality,
        });
      } else {
        await createLinkType({
          name: linkDraft.name.trim(),
          display_name: linkDraft.display_name.trim(),
          description: linkDraft.description.trim(),
          source_type_id: linkDraft.source_type_id,
          target_type_id: linkDraft.target_type_id,
          cardinality: linkDraft.cardinality,
        });
      }
      const source = objectTypes[0]?.id ?? '';
      const target = objectTypes[1]?.id ?? source;
      setLinkDraft(emptyLinkTypeDraft(source, target));
    });
  }

  async function saveSharedProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      const body = {
        display_name: sharedDraft.display_name.trim(),
        description: sharedDraft.description.trim(),
        required: sharedDraft.required,
        unique_constraint: sharedDraft.unique_constraint,
        time_dependent: sharedDraft.time_dependent,
      };
      if (sharedDraft.id) {
        await updateSharedPropertyType(sharedDraft.id, body);
      } else {
        await createSharedPropertyType({
          name: sharedDraft.name.trim(),
          property_type: sharedDraft.property_type,
          ...body,
        });
      }
      setSharedDraft(emptySharedPropertyDraft());
    });
  }

  function confirmDelete(label: string) {
    return typeof window === 'undefined' || window.confirm(`Delete ${label}?`);
  }

  const canSaveObjectType = objectDraft.display_name.trim() && (objectDraft.id || objectDraft.name.trim());
  const canSaveProperty = selectedTypeId && propertyDraft.name.trim() && propertyDraft.display_name.trim();
  const canSaveLinkType =
    linkDraft.display_name.trim() &&
    linkDraft.source_type_id &&
    linkDraft.target_type_id &&
    (linkDraft.id || linkDraft.name.trim());
  const canSaveSharedProperty = sharedDraft.display_name.trim() && (sharedDraft.id || sharedDraft.name.trim());

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <p className="of-eyebrow" style={{ color: '#2563eb' }}>
            ONT-013
          </p>
          <h1 className="of-heading-xl">Object &amp; link types</h1>
          <p className="of-text-muted" style={{ maxWidth: 760, fontSize: 14, lineHeight: 1.6 }}>
            Maintain schema nodes, relationship definitions, properties, and shared property contracts.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => void refresh(true)} disabled={loading || busy} className="of-button">
            Refresh
          </button>
          <Link to="/ontology/graph" className="of-button">
            <Glyph name="graph" size={16} />
            Graph
          </Link>
          <Link to="/ontology-manager" className="of-button">
            Manager
          </Link>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <MetricTile label="Object types" value={objectTypes.length} detail="Schema resources available to object tables." />
        <MetricTile label="Link types" value={linkTypes.length} detail="Relationship contracts across the ontology graph." />
        <MetricTile label="Shared properties" value={sharedProperties.length} detail="Reusable property definitions attached to object types." />
        <MetricTile label="Selected type links" value={selectedTypeLinkCount} detail={selectedType?.display_name ?? 'No object type selected'} />
      </div>

      {error && (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'links', label: 'Link types' },
          { id: 'types', label: 'Object types' },
          { id: 'shared', label: 'Shared properties' },
        ]}
      />

      {loading ? (
        <div className="of-panel" style={{ padding: 56, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Loading ontology schema...
        </div>
      ) : (
        <>
          {tab === 'links' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16 }}>
              <section className="of-panel" style={{ padding: 16, minWidth: 0, overflow: 'hidden' }}>
                <div className="of-toolbar" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <p className="of-eyebrow">Link types</p>
                    <h2 style={{ margin: '4px 0 0', fontSize: 18 }}>Relationship contracts</h2>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      value={linkSearch}
                      onChange={(event) => setLinkSearch(event.target.value)}
                      placeholder="Search links"
                      className="of-input"
                      style={{ width: 220 }}
                    />
                    <select
                      value={linkTypeFilter}
                      onChange={(event) => setLinkTypeFilter(event.target.value)}
                      className="of-input"
                      style={{ width: 220 }}
                    >
                      <option value="">All object types</option>
                      {objectTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.display_name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setLinkDraft(emptyLinkTypeDraft(objectTypes[0]?.id ?? '', objectTypes[1]?.id ?? objectTypes[0]?.id ?? ''))}
                      className="of-button of-button--primary"
                    >
                      <Glyph name="plus" size={16} />
                      New
                    </button>
                  </div>
                </div>

                {filteredLinkTypes.length === 0 ? (
                  <div style={{ marginTop: 16 }}>
                    <EmptyState title="No link types found" />
                  </div>
                ) : (
                  <div style={{ overflow: 'auto', marginTop: 16 }}>
                    <table className="of-table" style={{ minWidth: 760, fontSize: 13 }}>
                      <thead>
                        <tr>
                          <th>Link</th>
                          <th>Source</th>
                          <th>Target</th>
                          <th>Cardinality</th>
                          <th>Updated</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLinkTypes.map((linkType) => (
                          <tr key={linkType.id}>
                            <td>
                              <button
                                type="button"
                                onClick={() => editLinkType(linkType)}
                                style={{
                                  display: 'grid',
                                  gap: 2,
                                  textAlign: 'left',
                                  background: 'transparent',
                                  border: 0,
                                  padding: 0,
                                  cursor: 'pointer',
                                  color: 'inherit',
                                }}
                              >
                                <strong>{linkType.display_name}</strong>
                                <span className="of-text-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                  {linkType.name}
                                </span>
                              </button>
                              {linkType.description && (
                                <p className="of-text-muted" style={{ marginTop: 4, maxWidth: 360, fontSize: 12 }}>
                                  {linkType.description}
                                </p>
                              )}
                            </td>
                            <td>
                              <strong>{typeLabel(linkType.source_type_id)}</strong>
                              <p className="of-text-muted" style={{ marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                {typeSubtitle(linkType.source_type_id)}
                              </p>
                            </td>
                            <td>
                              <strong>{typeLabel(linkType.target_type_id)}</strong>
                              <p className="of-text-muted" style={{ marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                {typeSubtitle(linkType.target_type_id)}
                              </p>
                            </td>
                            <td>
                              <span className="of-chip">{formatCardinality(linkType.cardinality)}</span>
                            </td>
                            <td>{formatDate(linkType.updated_at)}</td>
                            <td>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                                <button type="button" onClick={() => editLinkType(linkType)} className="of-button" style={{ fontSize: 12 }}>
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!confirmDelete(linkType.display_name || linkType.name)) return;
                                    void run(() => deleteLinkType(linkType.id).then(() => undefined));
                                  }}
                                  disabled={busy}
                                  className="of-button"
                                  style={{ fontSize: 12, color: '#b91c1c', borderColor: '#fecaca' }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="of-panel" style={{ padding: 16, alignSelf: 'start' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <p className="of-eyebrow">{linkDraft.id ? 'Edit link type' : 'Create link type'}</p>
                    <h2 style={{ margin: '4px 0 0', fontSize: 18 }}>{linkDraft.id ? linkDraft.display_name : 'New relationship'}</h2>
                  </div>
                  {linkDraft.id && (
                    <button
                      type="button"
                      onClick={() =>
                        setLinkDraft(emptyLinkTypeDraft(objectTypes[0]?.id ?? '', objectTypes[1]?.id ?? objectTypes[0]?.id ?? ''))
                      }
                      className="of-button"
                      style={{ fontSize: 12 }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <form onSubmit={(event) => void saveLinkType(event)} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                  <Field label="Name">
                    <input
                      value={linkDraft.name}
                      onChange={(event) => setLinkDraft((draft) => ({ ...draft, name: event.target.value }))}
                      disabled={!!linkDraft.id}
                      className="of-input"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    />
                  </Field>
                  <Field label="Display name">
                    <input
                      value={linkDraft.display_name}
                      onChange={(event) => setLinkDraft((draft) => ({ ...draft, display_name: event.target.value }))}
                      className="of-input"
                    />
                  </Field>
                  <Field label="Description">
                    <textarea
                      value={linkDraft.description}
                      onChange={(event) => setLinkDraft((draft) => ({ ...draft, description: event.target.value }))}
                      className="of-input"
                      rows={3}
                    />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="Source type">
                      <select
                        value={linkDraft.source_type_id}
                        onChange={(event) => setLinkDraft((draft) => ({ ...draft, source_type_id: event.target.value }))}
                        disabled={!!linkDraft.id}
                        className="of-input"
                      >
                        <option value="">Pick source</option>
                        {objectTypes.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.display_name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Target type">
                      <select
                        value={linkDraft.target_type_id}
                        onChange={(event) => setLinkDraft((draft) => ({ ...draft, target_type_id: event.target.value }))}
                        disabled={!!linkDraft.id}
                        className="of-input"
                      >
                        <option value="">Pick target</option>
                        {objectTypes.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.display_name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label="Cardinality">
                    <select
                      value={linkDraft.cardinality}
                      onChange={(event) => setLinkDraft((draft) => ({ ...draft, cardinality: event.target.value as Cardinality }))}
                      className="of-input"
                    >
                      {CARDINALITIES.map((cardinality) => (
                        <option key={cardinality} value={cardinality}>
                          {formatCardinality(cardinality)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button
                    type="submit"
                    disabled={busy || !canSaveLinkType}
                    className="of-button of-button--primary"
                    style={{ justifyContent: 'center' }}
                  >
                    {busy ? 'Saving...' : linkDraft.id ? 'Update link type' : 'Create link type'}
                  </button>
                </form>
              </section>
            </div>
          )}

          {tab === 'types' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 16 }}>
              <section className="of-panel" style={{ padding: 16, alignSelf: 'start' }}>
                <div className="of-toolbar" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <p className="of-eyebrow">Object types</p>
                    <h2 style={{ margin: '4px 0 0', fontSize: 18 }}>Schema nodes</h2>
                  </div>
                  <button type="button" onClick={() => setObjectDraft(emptyObjectTypeDraft())} className="of-button of-button--primary">
                    <Glyph name="plus" size={16} />
                    New
                  </button>
                </div>
                <input
                  value={objectSearch}
                  onChange={(event) => setObjectSearch(event.target.value)}
                  placeholder="Search object types"
                  className="of-input"
                  style={{ marginTop: 12 }}
                />

                <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                  {filteredObjectTypes.length === 0 ? (
                    <EmptyState title="No object types found" />
                  ) : (
                    filteredObjectTypes.map((type) => {
                      const active = type.id === selectedTypeId;
                      const linkCount = linkTypes.filter(
                        (linkType) => linkType.source_type_id === type.id || linkType.target_type_id === type.id,
                      ).length;
                      return (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => {
                            setSelectedTypeId(type.id);
                            editObjectType(type);
                          }}
                          style={{
                            display: 'grid',
                            gap: 6,
                            width: '100%',
                            padding: 12,
                            textAlign: 'left',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-md)',
                            background: active ? '#eff6ff' : 'var(--surface-default)',
                            color: 'inherit',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <strong>{type.display_name}</strong>
                            <span className="of-chip" style={{ fontSize: 11 }}>
                              {linkCount} links
                            </span>
                          </div>
                          <span className="of-text-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                            {type.name}
                          </span>
                          {type.description && (
                            <span className="of-text-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                              {type.description}
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </section>

              <section style={{ display: 'grid', gap: 16, minWidth: 0 }}>
                <section className="of-panel" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <p className="of-eyebrow">{objectDraft.id ? 'Edit object type' : 'Create object type'}</p>
                      <h2 style={{ margin: '4px 0 0', fontSize: 18 }}>{objectDraft.id ? objectDraft.display_name : 'New schema node'}</h2>
                    </div>
                    {objectDraft.id && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!confirmDelete(objectDraft.display_name || objectDraft.name)) return;
                          const id = objectDraft.id;
                          if (!id) return;
                          void run(async () => {
                            await deleteObjectType(id);
                            setObjectDraft(emptyObjectTypeDraft());
                          });
                        }}
                        disabled={busy}
                        className="of-button"
                        style={{ fontSize: 12, color: '#b91c1c', borderColor: '#fecaca' }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <form onSubmit={(event) => void saveObjectType(event)} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
                      <Field label="Name">
                        <input
                          value={objectDraft.name}
                          onChange={(event) => setObjectDraft((draft) => ({ ...draft, name: event.target.value }))}
                          disabled={!!objectDraft.id}
                          className="of-input"
                          style={{ fontFamily: 'var(--font-mono)' }}
                        />
                      </Field>
                      <Field label="Display name">
                        <input
                          value={objectDraft.display_name}
                          onChange={(event) => setObjectDraft((draft) => ({ ...draft, display_name: event.target.value }))}
                          className="of-input"
                        />
                      </Field>
                    </div>
                    <Field label="Description">
                      <textarea
                        value={objectDraft.description}
                        onChange={(event) => setObjectDraft((draft) => ({ ...draft, description: event.target.value }))}
                        rows={3}
                        className="of-input"
                      />
                    </Field>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 120px', gap: 10 }}>
                      <Field label="Primary key">
                        <select
                          value={objectDraft.primary_key_property}
                          onChange={(event) => setObjectDraft((draft) => ({ ...draft, primary_key_property: event.target.value }))}
                          className="of-input"
                        >
                          <option value="">None</option>
                          {selectedTypeProps.map((property) => (
                            <option key={property.id} value={property.name}>
                              {property.display_name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Icon">
                        <input
                          value={objectDraft.icon}
                          onChange={(event) => setObjectDraft((draft) => ({ ...draft, icon: event.target.value }))}
                          className="of-input"
                        />
                      </Field>
                      <Field label="Color">
                        <input
                          value={objectDraft.color}
                          onChange={(event) => setObjectDraft((draft) => ({ ...draft, color: event.target.value }))}
                          className="of-input"
                          type="color"
                          style={{ padding: 4 }}
                        />
                      </Field>
                    </div>
                    <button
                      type="submit"
                      disabled={busy || !canSaveObjectType}
                      className="of-button of-button--primary"
                      style={{ justifyContent: 'center' }}
                    >
                      {busy ? 'Saving...' : objectDraft.id ? 'Update object type' : 'Create object type'}
                    </button>
                  </form>
                </section>

                {selectedType ? (
                  <section className="of-panel" style={{ padding: 16, overflow: 'hidden' }}>
                    <div className="of-toolbar" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div>
                        <p className="of-eyebrow">Properties</p>
                        <h2 style={{ margin: '4px 0 0', fontSize: 18 }}>{selectedType.display_name}</h2>
                      </div>
                      <span className="of-chip">{typeLoading ? 'Loading' : `${selectedTypeProps.length} properties`}</span>
                    </div>

                    {selectedTypeProps.length > 0 && (
                      <div style={{ overflow: 'auto', marginTop: 16 }}>
                        <table className="of-table" style={{ minWidth: 720, fontSize: 13 }}>
                          <thead>
                            <tr>
                              <th>Property</th>
                              <th>Type</th>
                              <th>Flags</th>
                              <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedTypeProps.map((property) => (
                              <tr key={property.id}>
                                <td>
                                  <strong>{property.display_name}</strong>
                                  <p className="of-text-muted" style={{ marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                    {property.name}
                                  </p>
                                  {property.description && (
                                    <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                                      {property.description}
                                    </p>
                                  )}
                                </td>
                                <td>{property.property_type}</td>
                                <td>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {property.required && <span className="of-chip">required</span>}
                                    {property.unique_constraint && <span className="of-chip">unique</span>}
                                    {property.time_dependent && <span className="of-chip">time</span>}
                                    {!property.required && !property.unique_constraint && !property.time_dependent && (
                                      <span className="of-text-muted">-</span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void run(() =>
                                          updateProperty(selectedType.id, property.id, { required: !property.required }).then(() => undefined),
                                        )
                                      }
                                      disabled={busy}
                                      className="of-button"
                                      style={{ fontSize: 12 }}
                                    >
                                      Required
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void run(() =>
                                          updateProperty(selectedType.id, property.id, {
                                            unique_constraint: !property.unique_constraint,
                                          }).then(() => undefined),
                                        )
                                      }
                                      disabled={busy}
                                      className="of-button"
                                      style={{ fontSize: 12 }}
                                    >
                                      Unique
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!confirmDelete(property.display_name || property.name)) return;
                                        void run(() => deleteProperty(selectedType.id, property.id).then(() => undefined));
                                      }}
                                      disabled={busy}
                                      className="of-button"
                                      style={{ fontSize: 12, color: '#b91c1c', borderColor: '#fecaca' }}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {selectedTypeProps.length === 0 && !typeLoading && (
                      <div style={{ marginTop: 16 }}>
                        <EmptyState title="No properties on this object type" />
                      </div>
                    )}

                    <form onSubmit={(event) => void saveProperty(event)} style={{ display: 'grid', gap: 12, marginTop: 18 }}>
                      <p className="of-eyebrow">Add property</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 170px', gap: 10 }}>
                        <Field label="Name">
                          <input
                            value={propertyDraft.name}
                            onChange={(event) => setPropertyDraft((draft) => ({ ...draft, name: event.target.value }))}
                            className="of-input"
                            style={{ fontFamily: 'var(--font-mono)' }}
                          />
                        </Field>
                        <Field label="Display name">
                          <input
                            value={propertyDraft.display_name}
                            onChange={(event) => setPropertyDraft((draft) => ({ ...draft, display_name: event.target.value }))}
                            className="of-input"
                          />
                        </Field>
                        <Field label="Type">
                          <select
                            value={propertyDraft.property_type}
                            onChange={(event) => setPropertyDraft((draft) => ({ ...draft, property_type: event.target.value }))}
                            className="of-input"
                          >
                            {PROPERTY_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                      <Field label="Description">
                        <input
                          value={propertyDraft.description}
                          onChange={(event) => setPropertyDraft((draft) => ({ ...draft, description: event.target.value }))}
                          className="of-input"
                        />
                      </Field>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                        <ToggleField
                          label="Required"
                          checked={propertyDraft.required}
                          onChange={(next) => setPropertyDraft((draft) => ({ ...draft, required: next }))}
                        />
                        <ToggleField
                          label="Unique"
                          checked={propertyDraft.unique_constraint}
                          onChange={(next) => setPropertyDraft((draft) => ({ ...draft, unique_constraint: next }))}
                        />
                        <ToggleField
                          label="Time dependent"
                          checked={propertyDraft.time_dependent}
                          onChange={(next) => setPropertyDraft((draft) => ({ ...draft, time_dependent: next }))}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={busy || !canSaveProperty}
                        className="of-button of-button--primary"
                        style={{ justifyContent: 'center' }}
                      >
                        Add property
                      </button>
                    </form>
                  </section>
                ) : (
                  <EmptyState title="Select an object type" />
                )}

                {selectedType && (
                  <section className="of-panel" style={{ padding: 16 }}>
                    <div className="of-toolbar" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div>
                        <p className="of-eyebrow">Attached shared properties</p>
                        <h2 style={{ margin: '4px 0 0', fontSize: 18 }}>{selectedTypeShared.length} attached</h2>
                      </div>
                      <select
                        value=""
                        onChange={(event) => {
                          const sharedPropertyTypeId = event.target.value;
                          if (!sharedPropertyTypeId) return;
                          void run(() => attachSharedPropertyType(selectedType.id, sharedPropertyTypeId).then(() => undefined));
                        }}
                        disabled={busy || attachCandidates.length === 0}
                        className="of-input"
                        style={{ width: 280 }}
                      >
                        <option value="">Attach shared property</option>
                        {attachCandidates.map((property) => (
                          <option key={property.id} value={property.id}>
                            {property.display_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedTypeShared.length === 0 ? (
                      <div style={{ marginTop: 12 }}>
                        <EmptyState title="No shared properties attached" />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                        {selectedTypeShared.map((property) => (
                          <span key={property.id} className="of-chip" style={{ gap: 6 }}>
                            {property.display_name}
                            <button
                              type="button"
                              aria-label={`Detach ${property.display_name}`}
                              onClick={() =>
                                void run(() => detachSharedPropertyType(selectedType.id, property.id).then(() => undefined))
                              }
                              disabled={busy}
                              style={{ border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0 }}
                            >
                              <Glyph name="x" size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </section>
            </div>
          )}

          {tab === 'shared' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16 }}>
              <section className="of-panel" style={{ padding: 16, minWidth: 0, overflow: 'hidden' }}>
                <div className="of-toolbar" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <p className="of-eyebrow">Shared properties</p>
                    <h2 style={{ margin: '4px 0 0', fontSize: 18 }}>Reusable schema fields</h2>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      value={sharedSearch}
                      onChange={(event) => setSharedSearch(event.target.value)}
                      placeholder="Search shared properties"
                      className="of-input"
                      style={{ width: 240 }}
                    />
                    <button
                      type="button"
                      onClick={() => setSharedDraft(emptySharedPropertyDraft())}
                      className="of-button of-button--primary"
                    >
                      <Glyph name="plus" size={16} />
                      New
                    </button>
                  </div>
                </div>

                {filteredSharedProperties.length === 0 ? (
                  <div style={{ marginTop: 16 }}>
                    <EmptyState title="No shared properties found" />
                  </div>
                ) : (
                  <div style={{ overflow: 'auto', marginTop: 16 }}>
                    <table className="of-table" style={{ minWidth: 720, fontSize: 13 }}>
                      <thead>
                        <tr>
                          <th>Property</th>
                          <th>Type</th>
                          <th>Flags</th>
                          <th>Updated</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSharedProperties.map((property) => (
                          <tr key={property.id}>
                            <td>
                              <strong>{property.display_name}</strong>
                              <p className="of-text-muted" style={{ marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                {property.name}
                              </p>
                              {property.description && (
                                <p className="of-text-muted" style={{ marginTop: 4, maxWidth: 360, fontSize: 12 }}>
                                  {property.description}
                                </p>
                              )}
                            </td>
                            <td>{property.property_type}</td>
                            <td>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {property.required && <span className="of-chip">required</span>}
                                {property.unique_constraint && <span className="of-chip">unique</span>}
                                {property.time_dependent && <span className="of-chip">time</span>}
                                {!property.required && !property.unique_constraint && !property.time_dependent && (
                                  <span className="of-text-muted">-</span>
                                )}
                              </div>
                            </td>
                            <td>{formatDate(property.updated_at)}</td>
                            <td>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                                <button type="button" onClick={() => editSharedProperty(property)} className="of-button" style={{ fontSize: 12 }}>
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!confirmDelete(property.display_name || property.name)) return;
                                    void run(() => deleteSharedPropertyType(property.id).then(() => undefined));
                                  }}
                                  disabled={busy}
                                  className="of-button"
                                  style={{ fontSize: 12, color: '#b91c1c', borderColor: '#fecaca' }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="of-panel" style={{ padding: 16, alignSelf: 'start' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <p className="of-eyebrow">{sharedDraft.id ? 'Edit shared property' : 'Create shared property'}</p>
                    <h2 style={{ margin: '4px 0 0', fontSize: 18 }}>{sharedDraft.id ? sharedDraft.display_name : 'New shared field'}</h2>
                  </div>
                  {sharedDraft.id && (
                    <button
                      type="button"
                      onClick={() => setSharedDraft(emptySharedPropertyDraft())}
                      className="of-button"
                      style={{ fontSize: 12 }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <form onSubmit={(event) => void saveSharedProperty(event)} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                  <Field label="Name">
                    <input
                      value={sharedDraft.name}
                      onChange={(event) => setSharedDraft((draft) => ({ ...draft, name: event.target.value }))}
                      disabled={!!sharedDraft.id}
                      className="of-input"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    />
                  </Field>
                  <Field label="Display name">
                    <input
                      value={sharedDraft.display_name}
                      onChange={(event) => setSharedDraft((draft) => ({ ...draft, display_name: event.target.value }))}
                      className="of-input"
                    />
                  </Field>
                  <Field label="Description">
                    <textarea
                      value={sharedDraft.description}
                      onChange={(event) => setSharedDraft((draft) => ({ ...draft, description: event.target.value }))}
                      className="of-input"
                      rows={3}
                    />
                  </Field>
                  <Field label="Type">
                    <select
                      value={sharedDraft.property_type}
                      onChange={(event) => setSharedDraft((draft) => ({ ...draft, property_type: event.target.value }))}
                      disabled={!!sharedDraft.id}
                      className="of-input"
                    >
                      {PROPERTY_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <ToggleField
                      label="Required"
                      checked={sharedDraft.required}
                      onChange={(next) => setSharedDraft((draft) => ({ ...draft, required: next }))}
                    />
                    <ToggleField
                      label="Unique"
                      checked={sharedDraft.unique_constraint}
                      onChange={(next) => setSharedDraft((draft) => ({ ...draft, unique_constraint: next }))}
                    />
                    <ToggleField
                      label="Time dependent"
                      checked={sharedDraft.time_dependent}
                      onChange={(next) => setSharedDraft((draft) => ({ ...draft, time_dependent: next }))}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy || !canSaveSharedProperty}
                    className="of-button of-button--primary"
                    style={{ justifyContent: 'center' }}
                  >
                    {busy ? 'Saving...' : sharedDraft.id ? 'Update shared property' : 'Create shared property'}
                  </button>
                </form>
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  createObjectSet,
  deleteObjectSet,
  evaluateObjectSet,
  listLinkTypes,
  listObjectSets,
  listObjectTypes,
  listProperties,
  materializeObjectSet,
  updateObjectSet,
  type LinkType,
  type ObjectSetDefinition,
  type ObjectSetEvaluationResponse,
  type ObjectSetFilter,
  type ObjectSetJoin,
  type ObjectSetPolicy,
  type ObjectSetTraversal,
  type ObjectType,
  type Property,
} from '@/lib/api/ontology';
import {
  ObjectSetFilterBuilder,
  type ObjectSetFilterFieldOption,
} from '@/lib/components/ontology/ObjectSetFilterBuilder';

interface ObjectSetDraft {
  name: string;
  description: string;
  base_object_type_id: string;
  filters: ObjectSetFilter[];
  traversals: ObjectSetTraversal[];
  join: ObjectSetJoin | null;
  projectionsText: string;
  whatIfLabel: string;
  allowedMarkingsText: string;
  minimumClearance: string;
  denyGuestSessions: boolean;
  requiredRestrictedViewId: string;
}

type BusyAction = 'load' | 'save' | 'evaluate' | 'materialize' | 'delete';

const DEFAULT_FILTERS: ObjectSetFilter[] = [{ field: 'status', operator: 'equals', value: 'active' }];
const DEFAULT_PROJECTIONS = ['base.id', 'base.properties.status'];
const CLEARANCE_OPTIONS = ['', 'public', 'internal', 'confidential', 'restricted'];

function blankDraft(baseTypeId = ''): ObjectSetDraft {
  return {
    name: '',
    description: '',
    base_object_type_id: baseTypeId,
    filters: DEFAULT_FILTERS,
    traversals: [],
    join: null,
    projectionsText: DEFAULT_PROJECTIONS.join(', '),
    whatIfLabel: '',
    allowedMarkingsText: 'public',
    minimumClearance: '',
    denyGuestSessions: false,
    requiredRestrictedViewId: '',
  };
}

function draftFromObjectSet(objectSet: ObjectSetDefinition): ObjectSetDraft {
  return {
    name: objectSet.name,
    description: objectSet.description ?? '',
    base_object_type_id: objectSet.base_object_type_id,
    filters: objectSet.filters ?? [],
    traversals: objectSet.traversals ?? [],
    join: objectSet.join ?? null,
    projectionsText: (objectSet.projections ?? []).join(', '),
    whatIfLabel: objectSet.what_if_label ?? '',
    allowedMarkingsText: (objectSet.policy?.allowed_markings ?? []).join(', '),
    minimumClearance: objectSet.policy?.minimum_clearance ?? '',
    denyGuestSessions: Boolean(objectSet.policy?.deny_guest_sessions),
    requiredRestrictedViewId: objectSet.policy?.required_restricted_view_id ?? '',
  };
}

function splitList(value: string) {
  return value
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function policyFromDraft(draft: ObjectSetDraft): ObjectSetPolicy {
  return {
    allowed_markings: splitList(draft.allowedMarkingsText),
    minimum_clearance: draft.minimumClearance || null,
    deny_guest_sessions: draft.denyGuestSessions,
    required_restricted_view_id: draft.requiredRestrictedViewId.trim() || null,
  };
}

function displayObjectType(type: ObjectType | undefined, fallback: string) {
  return type ? type.display_name || type.name : fallback || 'Unknown type';
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}...` : id;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function summarizeValue(value: unknown) {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function fieldOptionsFromProperties(properties: Property[]): ObjectSetFilterFieldOption[] {
  return [
    { value: 'id', label: 'id', type: 'system' },
    { value: 'marking', label: 'marking', type: 'system' },
    { value: 'created_at', label: 'created_at', type: 'system' },
    { value: 'updated_at', label: 'updated_at', type: 'system' },
    ...properties.map((property) => ({
      value: property.name,
      label: property.display_name || property.name,
      type: property.property_type,
    })),
  ];
}

function validateDraft(draft: ObjectSetDraft, existing: ObjectSetDefinition | null) {
  if (!draft.name.trim()) return 'Name is required.';
  if (!draft.base_object_type_id) return 'Base object type is required.';
  const emptyFilter = draft.filters.find((filter) => !filter.field.trim());
  if (emptyFilter) return 'Filters require a field.';
  const invalidTraversal = draft.traversals.find((traversal) => traversal.max_hops < 1 || traversal.max_hops > 4);
  if (invalidTraversal) return 'Traversal hops must be between 1 and 4.';
  if (draft.join) {
    if (!draft.join.secondary_object_type_id || !draft.join.left_field.trim() || !draft.join.right_field.trim()) {
      return 'Join configuration requires a secondary type and both fields.';
    }
  }
  if (existing?.join && !draft.join) return 'Existing joins cannot be cleared by the current object set PATCH contract.';
  return null;
}

export function ObjectSetsPage() {
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [objectSets, setObjectSets] = useState<ObjectSetDefinition[]>([]);
  const [linkTypes, setLinkTypes] = useState<LinkType[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ObjectSetDraft>(() => blankDraft());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [evaluation, setEvaluation] = useState<ObjectSetEvaluationResponse | null>(null);

  const busy = busyAction !== null;
  const selectedSet = useMemo(
    () => objectSets.find((objectSet) => objectSet.id === selectedSetId) ?? null,
    [objectSets, selectedSetId],
  );
  const objectTypeById = useMemo(
    () => new Map(objectTypes.map((type) => [type.id, type])),
    [objectTypes],
  );
  const fieldOptions = useMemo(() => fieldOptionsFromProperties(properties), [properties]);
  const filteredObjectSets = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return objectSets;
    return objectSets.filter((objectSet) => {
      const typeLabel = displayObjectType(objectTypeById.get(objectSet.base_object_type_id), objectSet.base_object_type_id);
      return `${objectSet.name} ${objectSet.description} ${typeLabel}`.toLowerCase().includes(needle);
    });
  }, [objectSets, objectTypeById, search]);
  const evaluationColumns = useMemo(() => {
    const columns = new Set<string>();
    for (const row of (evaluation?.rows ?? []).slice(0, 20)) {
      for (const key of Object.keys(row)) columns.add(key);
    }
    return Array.from(columns).slice(0, 8);
  }, [evaluation]);

  async function load(preferredId?: string | null) {
    setError('');
    setBusyAction('load');
    try {
      const [typeRes, setRes, linkRes] = await Promise.all([
        listObjectTypes({ per_page: 200 }),
        listObjectSets({ size: 500 }),
        listLinkTypes({ per_page: 200 }).catch(() => ({ data: [], total: 0 })),
      ]);
      setObjectTypes(typeRes.data);
      setObjectSets(setRes.data);
      setLinkTypes(linkRes.data);

      const fallbackBaseType = typeRes.data[0]?.id ?? '';
      const nextSelectedId = preferredId === null
        ? setRes.data[0]?.id ?? null
        : preferredId ?? selectedSetId ?? setRes.data[0]?.id ?? null;
      const nextSelected = nextSelectedId
        ? setRes.data.find((objectSet) => objectSet.id === nextSelectedId) ?? null
        : null;
      setSelectedSetId(nextSelected?.id ?? null);
      setDraft(nextSelected ? draftFromObjectSet(nextSelected) : blankDraft(fallbackBaseType));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load object sets');
    } finally {
      setLoading(false);
      setBusyAction(null);
    }
  }

  useEffect(() => {
    void load(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadProperties() {
      if (!draft.base_object_type_id) {
        setProperties([]);
        return;
      }
      try {
        const nextProperties = await listProperties(draft.base_object_type_id);
        if (!cancelled) setProperties(nextProperties);
      } catch {
        if (!cancelled) setProperties([]);
      }
    }
    void loadProperties();
    return () => {
      cancelled = true;
    };
  }, [draft.base_object_type_id]);

  function startNew() {
    setSelectedSetId(null);
    setDraft(blankDraft(draft.base_object_type_id || objectTypes[0]?.id || ''));
    setEvaluation(null);
    setError('');
    setSuccess('');
  }

  function selectObjectSet(objectSet: ObjectSetDefinition) {
    setSelectedSetId(objectSet.id);
    setDraft(draftFromObjectSet(objectSet));
    setEvaluation(null);
    setError('');
    setSuccess('');
  }

  function patchDraft(patch: Partial<ObjectSetDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function patchTraversal(index: number, patch: Partial<ObjectSetTraversal>) {
    setDraft((current) => ({
      ...current,
      traversals: current.traversals.map((traversal, i) => (i === index ? { ...traversal, ...patch } : traversal)),
    }));
  }

  function addTraversal() {
    setDraft((current) => ({
      ...current,
      traversals: [
        ...current.traversals,
        { direction: 'outbound', link_type_id: null, target_object_type_id: null, max_hops: 1 },
      ],
    }));
  }

  function removeTraversal(index: number) {
    setDraft((current) => ({
      ...current,
      traversals: current.traversals.filter((_, i) => i !== index),
    }));
  }

  function setJoinEnabled(enabled: boolean) {
    if (!enabled) {
      if (selectedSet?.join) {
        setError('Existing joins cannot be cleared by the current object set PATCH contract.');
        return;
      }
      patchDraft({ join: null });
      return;
    }
    patchDraft({
      join: draft.join ?? {
        secondary_object_type_id: objectTypes[0]?.id ?? draft.base_object_type_id,
        left_field: 'id',
        right_field: 'id',
        join_kind: 'inner',
      },
    });
  }

  function patchJoin(patch: Partial<ObjectSetJoin>) {
    setDraft((current) => ({
      ...current,
      join: current.join ? { ...current.join, ...patch } : current.join,
    }));
  }

  function buildPayload() {
    return {
      name: draft.name.trim(),
      description: draft.description.trim(),
      base_object_type_id: draft.base_object_type_id,
      filters: draft.filters,
      traversals: draft.traversals,
      join: draft.join,
      projections: splitList(draft.projectionsText),
      what_if_label: draft.whatIfLabel.trim() || null,
      policy: policyFromDraft(draft),
    };
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    const validationError = validateDraft(draft, selectedSet);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusyAction('save');
    try {
      const payload = buildPayload();
      const saved = selectedSet
        ? await updateObjectSet(selectedSet.id, payload)
        : await createObjectSet(payload);
      setSelectedSetId(saved.id);
      setDraft(draftFromObjectSet(saved));
      setEvaluation(null);
      setSuccess(selectedSet ? 'Object set updated.' : 'Object set created.');
      await load(saved.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function runEvaluation(mode: 'evaluate' | 'materialize') {
    if (!selectedSet) return;
    setError('');
    setSuccess('');
    setBusyAction(mode);
    try {
      const result = mode === 'evaluate'
        ? await evaluateObjectSet(selectedSet.id, { limit: 100 })
        : await materializeObjectSet(selectedSet.id, { limit: 500 });
      setEvaluation(result);
      setSuccess(mode === 'evaluate' ? 'Object set evaluated.' : 'Object set materialized.');
      if (mode === 'materialize') await load(selectedSet.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${mode} failed`);
    } finally {
      setBusyAction(null);
    }
  }

  async function removeSelected() {
    if (!selectedSet) return;
    if (typeof window !== 'undefined' && !window.confirm('Delete object set?')) return;
    setError('');
    setSuccess('');
    setBusyAction('delete');
    try {
      await deleteObjectSet(selectedSet.id);
      setEvaluation(null);
      setSuccess('Object set deleted.');
      await load(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusyAction(null);
    }
  }

  if (loading) {
    return (
      <section className="of-page" style={{ padding: 24 }}>
        <p className="of-text-muted">Loading object sets...</p>
      </section>
    );
  }

  return (
    <section className="of-page" style={{ padding: 24, display: 'grid', gap: 12 }}>
      <header className="of-panel" style={{ padding: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <Link to="/ontology" style={{ color: 'var(--text-muted)', fontSize: 12 }}>Ontology</Link>
          <h1 className="of-heading-xl">Object sets</h1>
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
            Saved object cohorts, preview evaluation, and materialized snapshots.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="of-button" onClick={() => void load(selectedSetId)} disabled={busy}>
            {busyAction === 'load' ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" className="of-button of-button--primary" onClick={startNew} disabled={busy}>
            New object set
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      )}
      {success && (
        <div className="of-status-success" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {success}
        </div>
      )}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(min(100%, 300px), 0.75fr) minmax(min(100%, 540px), 1.5fr)' }}>
        <aside className="of-panel" style={{ overflow: 'hidden' }}>
          <div style={{ padding: 12, borderBottom: '1px solid var(--border-default)', display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <p className="of-eyebrow">Saved sets ({objectSets.length})</p>
              <span className="of-chip">{filteredObjectSets.length}</span>
            </div>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search sets"
              className="of-input"
              style={{ fontSize: 12 }}
            />
          </div>
          <div style={{ display: 'grid', maxHeight: 680, overflow: 'auto' }}>
            {filteredObjectSets.map((objectSet) => {
              const selected = objectSet.id === selectedSetId;
              const type = objectTypeById.get(objectSet.base_object_type_id);
              return (
                <button
                  key={objectSet.id}
                  type="button"
                  onClick={() => selectObjectSet(objectSet)}
                  style={{
                    display: 'grid',
                    gap: 6,
                    padding: 12,
                    border: 0,
                    borderBottom: '1px solid var(--border-subtle)',
                    background: selected ? 'var(--bg-chip-active)' : 'transparent',
                    color: 'var(--text-default)',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <strong style={{ color: 'var(--text-strong)' }}>{objectSet.name}</strong>
                    {objectSet.materialized_at && <span className="of-chip">Materialized</span>}
                  </span>
                  <span className="of-text-muted" style={{ fontSize: 12 }}>
                    {displayObjectType(type, objectSet.base_object_type_id)} | {objectSet.filters.length} filters | {objectSet.traversals.length} traversals
                  </span>
                  <span className="of-text-soft" style={{ fontSize: 11 }}>
                    {shortId(objectSet.id)} | updated {formatDateTime(objectSet.updated_at)}
                  </span>
                </button>
              );
            })}
            {filteredObjectSets.length === 0 && (
              <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
                No object sets found.
              </div>
            )}
          </div>
        </aside>

        <main style={{ display: 'grid', gap: 12, minWidth: 0 }}>
          <form onSubmit={(event) => void save(event)} className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <p className="of-eyebrow">{selectedSet ? 'Edit object set' : 'Create object set'}</p>
                <h2 className="of-heading-lg" style={{ marginTop: 4 }}>{draft.name.trim() || 'Untitled object set'}</h2>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="submit" disabled={busy} className="of-button of-button--primary">
                  {busyAction === 'save' ? 'Saving...' : selectedSet ? 'Save changes' : 'Create set'}
                </button>
                {selectedSet && (
                  <button type="button" disabled={busy} onClick={() => void removeSelected()} className="of-button" style={{ color: '#b91c1c', borderColor: '#fecaca' }}>
                    Delete
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
              <label style={{ fontSize: 13 }}>
                Name
                <input
                  value={draft.name}
                  onChange={(event) => patchDraft({ name: event.target.value })}
                  className="of-input"
                  style={{ marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                Base object type
                <select
                  value={draft.base_object_type_id}
                  onChange={(event) => patchDraft({ base_object_type_id: event.target.value })}
                  className="of-input"
                  style={{ marginTop: 4 }}
                  disabled={busy}
                >
                  <option value="">Pick type</option>
                  {objectTypes.map((type) => (
                    <option key={type.id} value={type.id}>{type.display_name} ({type.name})</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 13 }}>
                What-if label
                <input
                  value={draft.whatIfLabel}
                  onChange={(event) => patchDraft({ whatIfLabel: event.target.value })}
                  className="of-input"
                  style={{ marginTop: 4 }}
                  placeholder="draft, scenario-a"
                />
              </label>
            </div>

            <label style={{ fontSize: 13 }}>
              Description
              <input
                value={draft.description}
                onChange={(event) => patchDraft({ description: event.target.value })}
                className="of-input"
                style={{ marginTop: 4 }}
              />
            </label>

            <ObjectSetFilterBuilder
              filters={draft.filters}
              fields={fieldOptions}
              onChange={(filters) => patchDraft({ filters })}
              disabled={busy}
            />

            <section style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <p className="of-eyebrow">Traversals ({draft.traversals.length})</p>
                <button type="button" className="of-button" onClick={addTraversal} disabled={busy} style={{ fontSize: 11 }}>
                  Add traversal
                </button>
              </div>
              {draft.traversals.length === 0 ? (
                <p className="of-text-muted" style={{ fontSize: 12, fontStyle: 'italic', margin: 0 }}>No traversals.</p>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {draft.traversals.map((traversal, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'grid',
                        gap: 6,
                        gridTemplateColumns: '120px minmax(160px, 1fr) minmax(160px, 1fr) 96px auto',
                        alignItems: 'center',
                        padding: 8,
                        background: 'var(--bg-subtle)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 3,
                      }}
                    >
                      <select
                        value={traversal.direction}
                        onChange={(event) => patchTraversal(index, { direction: event.target.value as ObjectSetTraversal['direction'] })}
                        className="of-input"
                        disabled={busy}
                        style={{ fontSize: 11 }}
                      >
                        <option value="outbound">outbound</option>
                        <option value="inbound">inbound</option>
                        <option value="both">both</option>
                      </select>
                      <select
                        value={traversal.link_type_id ?? ''}
                        onChange={(event) => patchTraversal(index, { link_type_id: event.target.value || null })}
                        className="of-input"
                        disabled={busy}
                        style={{ fontSize: 11 }}
                      >
                        <option value="">Any link type</option>
                        {linkTypes.map((linkType) => (
                          <option key={linkType.id} value={linkType.id}>{linkType.display_name}</option>
                        ))}
                      </select>
                      <select
                        value={traversal.target_object_type_id ?? ''}
                        onChange={(event) => patchTraversal(index, { target_object_type_id: event.target.value || null })}
                        className="of-input"
                        disabled={busy}
                        style={{ fontSize: 11 }}
                      >
                        <option value="">Any target type</option>
                        {objectTypes.map((type) => (
                          <option key={type.id} value={type.id}>{type.display_name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        max={4}
                        value={traversal.max_hops}
                        onChange={(event) => patchTraversal(index, { max_hops: Number(event.target.value) || 1 })}
                        className="of-input"
                        disabled={busy}
                        style={{ fontSize: 11 }}
                      />
                      <button type="button" className="of-button" onClick={() => removeTraversal(index)} disabled={busy} style={{ fontSize: 11, color: '#b91c1c', borderColor: '#fecaca' }}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <p className="of-eyebrow">Join</p>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <input type="checkbox" checked={Boolean(draft.join)} onChange={(event) => setJoinEnabled(event.target.checked)} disabled={busy} />
                  Enabled
                </label>
              </div>
              {draft.join && (
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
                  <label style={{ fontSize: 13 }}>
                    Secondary type
                    <select
                      value={draft.join.secondary_object_type_id}
                      onChange={(event) => patchJoin({ secondary_object_type_id: event.target.value })}
                      className="of-input"
                      disabled={busy}
                      style={{ marginTop: 4 }}
                    >
                      {objectTypes.map((type) => (
                        <option key={type.id} value={type.id}>{type.display_name}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 13 }}>
                    Left field
                    <input
                      value={draft.join.left_field}
                      onChange={(event) => patchJoin({ left_field: event.target.value })}
                      className="of-input"
                      disabled={busy}
                      style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                    />
                  </label>
                  <label style={{ fontSize: 13 }}>
                    Right field
                    <input
                      value={draft.join.right_field}
                      onChange={(event) => patchJoin({ right_field: event.target.value })}
                      className="of-input"
                      disabled={busy}
                      style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                    />
                  </label>
                  <label style={{ fontSize: 13 }}>
                    Kind
                    <select
                      value={draft.join.join_kind}
                      onChange={(event) => patchJoin({ join_kind: event.target.value as ObjectSetJoin['join_kind'] })}
                      className="of-input"
                      disabled={busy}
                      style={{ marginTop: 4 }}
                    >
                      <option value="inner">inner</option>
                      <option value="left">left</option>
                    </select>
                  </label>
                </div>
              )}
            </section>

            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
              <label style={{ fontSize: 13 }}>
                Projections
                <input
                  value={draft.projectionsText}
                  onChange={(event) => patchDraft({ projectionsText: event.target.value })}
                  className="of-input"
                  style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                Allowed markings
                <input
                  value={draft.allowedMarkingsText}
                  onChange={(event) => patchDraft({ allowedMarkingsText: event.target.value })}
                  className="of-input"
                  style={{ marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                Minimum clearance
                <select
                  value={draft.minimumClearance}
                  onChange={(event) => patchDraft({ minimumClearance: event.target.value })}
                  className="of-input"
                  style={{ marginTop: 4 }}
                >
                  {CLEARANCE_OPTIONS.map((option) => (
                    <option key={option || 'none'} value={option}>{option || 'None'}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 13 }}>
                Restricted view id
                <input
                  value={draft.requiredRestrictedViewId}
                  onChange={(event) => patchDraft({ requiredRestrictedViewId: event.target.value })}
                  className="of-input"
                  style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                />
              </label>
            </div>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={draft.denyGuestSessions}
                onChange={(event) => patchDraft({ denyGuestSessions: event.target.checked })}
              />
              Deny guest sessions
            </label>
          </form>

          <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <p className="of-eyebrow">Evaluate / materialize</p>
                <h2 className="of-heading-md" style={{ marginTop: 4 }}>
                  {selectedSet ? selectedSet.name : 'Save the set before evaluation'}
                </h2>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => void runEvaluation('evaluate')}
                  disabled={busy || !selectedSet}
                  className="of-button"
                >
                  {busyAction === 'evaluate' ? 'Evaluating...' : 'Evaluate'}
                </button>
                <button
                  type="button"
                  onClick={() => void runEvaluation('materialize')}
                  disabled={busy || !selectedSet}
                  className="of-button of-button--success"
                >
                  {busyAction === 'materialize' ? 'Materializing...' : 'Materialize'}
                </button>
              </div>
            </div>

            {selectedSet && (
              <dl style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', margin: 0, fontSize: 12 }}>
                <div>
                  <dt className="of-text-muted">Base type</dt>
                  <dd style={{ margin: 0, fontWeight: 600 }}>{displayObjectType(objectTypeById.get(selectedSet.base_object_type_id), selectedSet.base_object_type_id)}</dd>
                </div>
                <div>
                  <dt className="of-text-muted">Materialized rows</dt>
                  <dd style={{ margin: 0, fontWeight: 600 }}>{selectedSet.materialized_row_count.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="of-text-muted">Materialized at</dt>
                  <dd style={{ margin: 0, fontWeight: 600 }}>{formatDateTime(selectedSet.materialized_at)}</dd>
                </div>
                <div>
                  <dt className="of-text-muted">Owner</dt>
                  <dd style={{ margin: 0, fontWeight: 600 }}>{shortId(selectedSet.owner_id)}</dd>
                </div>
              </dl>
            )}

            {evaluation ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className="of-chip">Rows {evaluation.total_rows.toLocaleString()}</span>
                  <span className="of-chip">Base matches {evaluation.total_base_matches.toLocaleString()}</span>
                  <span className="of-chip">Neighbors {evaluation.traversal_neighbor_count.toLocaleString()}</span>
                  <span className="of-chip">{evaluation.materialized ? 'Materialized' : 'Preview'}</span>
                  <span className="of-chip">{formatDateTime(evaluation.generated_at)}</span>
                </div>
                {evaluation.rows.length > 0 && evaluationColumns.length > 0 ? (
                  <div style={{ overflow: 'auto', border: '1px solid var(--border-default)', borderRadius: 3 }}>
                    <table className="of-table" style={{ minWidth: 640 }}>
                      <thead>
                        <tr>
                          {evaluationColumns.map((column) => (
                            <th key={column}>{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {evaluation.rows.slice(0, 50).map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {evaluationColumns.map((column) => (
                              <td key={column} style={{ maxWidth: 280, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {summarizeValue(row[column])}
                                </span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="of-text-muted" style={{ margin: 0 }}>Evaluation returned no rows.</p>
                )}
              </div>
            ) : (
              <p className="of-text-muted" style={{ margin: 0, fontSize: 13 }}>
                No evaluation result yet.
              </p>
            )}
          </section>
        </main>
      </div>
    </section>
  );
}

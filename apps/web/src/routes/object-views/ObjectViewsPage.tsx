import { useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  createObjectView,
  getObjectView,
  listActionTypes,
  listObjectViews,
  listObjects,
  listObjectTypes,
  listProperties,
  type ActionType,
  type CreateObjectViewBody,
  type ObjectInstance,
  type ObjectType,
  type ObjectViewConfig,
  type ObjectViewDefinition,
  type ObjectViewFormFactor,
  type ObjectViewMode,
  type ObjectViewResponse,
  type ObjectViewSectionKind,
  type ObjectViewSidebarLinkDefinition,
  type Property,
} from '@/lib/api/ontology';

type EditorTab = 'editor' | 'versions' | 'publish';

const SECTION_KINDS: Array<{ id: ObjectViewSectionKind; label: string; description: string }> = [
  { id: 'summary', label: 'Summary', description: 'Hero metrics and prominent properties.' },
  { id: 'properties', label: 'Properties', description: 'Object schema fields.' },
  { id: 'links', label: 'Linked objects', description: 'Related entities and previews.' },
  { id: 'timeline', label: 'Timeline', description: 'Activity, comments, runtime events.' },
  { id: 'actions', label: 'Actions', description: 'Applicable actions.' },
  { id: 'graph', label: 'Graph', description: 'Neighborhood and graph context.' },
  { id: 'comments', label: 'Comments', description: 'Notes, handoff, collaboration.' },
  { id: 'apps', label: 'Applications', description: 'Quiver, Map, Rules, workflow links.' },
];

const SIDEBAR_PRESETS: ObjectViewSidebarLinkDefinition[] = [
  { id: 'quiver', label: 'Quiver', href: '/quiver' },
  { id: 'graph', label: 'Graph', href: '/ontology/graph' },
  { id: 'explorer', label: 'Object Explorer', href: '/object-explorer' },
  { id: 'rules', label: 'Foundry Rules', href: '/foundry-rules' },
  { id: 'set', label: 'Saved lists', href: '/ontology/object-sets' },
];

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `view_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function defaultConfig(formFactor: ObjectViewFormFactor): ObjectViewConfig {
  return {
    mode: 'configured',
    form_factor: formFactor,
    title_template: '{{name}}',
    subtitle_property: '',
    prominent_properties: [],
    panel_properties: [],
    sections:
      formFactor === 'full'
        ? [
            { id: newId(), title: 'Overview', kind: 'summary', description: 'Core identity and metrics.' },
            { id: newId(), title: 'Properties', kind: 'properties', description: 'Canonical schema fields.' },
            { id: newId(), title: 'Linked Objects', kind: 'links', description: 'Traverse the neighborhood.' },
            { id: newId(), title: 'Activity', kind: 'timeline', description: 'Recent events.' },
            { id: newId(), title: 'Actions', kind: 'actions', description: 'Applicable actions.' },
            { id: newId(), title: 'Graph', kind: 'graph', description: 'Graph context.' },
          ]
        : [
            { id: newId(), title: 'Summary', kind: 'summary', description: 'Compact metrics.' },
            { id: newId(), title: 'Properties', kind: 'properties', description: 'Key fields.' },
            { id: newId(), title: 'Links', kind: 'links', description: 'Linked objects.' },
          ],
    sidebar_links: SIDEBAR_PRESETS.slice(0, 3),
    comments_enabled: true,
    branch_label: 'draft',
    auto_publish: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeSidebarLinks(value: unknown) {
  if (!Array.isArray(value)) return SIDEBAR_PRESETS.slice(0, 3);
  return value.filter((item): item is ObjectViewSidebarLinkDefinition => {
    if (!isRecord(item)) return false;
    return typeof item.id === 'string' && typeof item.label === 'string' && typeof item.href === 'string';
  });
}

function normalizeConfig(value: unknown, formFactor: ObjectViewFormFactor): ObjectViewConfig {
  const fallback = defaultConfig(formFactor);
  if (!isRecord(value)) return fallback;
  const sections = Array.isArray(value.sections)
    ? value.sections.filter((item): item is ObjectViewConfig['sections'][number] => {
        if (!isRecord(item)) return false;
        return (
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          typeof item.kind === 'string' &&
          SECTION_KINDS.some((kind) => kind.id === item.kind) &&
          typeof item.description === 'string'
        );
      })
    : fallback.sections;

  return {
    mode: value.mode === 'standard' ? 'standard' : 'configured',
    form_factor: value.form_factor === 'panel' ? 'panel' : formFactor,
    title_template: typeof value.title_template === 'string' ? value.title_template : fallback.title_template,
    subtitle_property: typeof value.subtitle_property === 'string' ? value.subtitle_property : '',
    prominent_properties: normalizeStringList(value.prominent_properties),
    panel_properties: normalizeStringList(value.panel_properties),
    sections: sections.length > 0 ? sections : fallback.sections,
    sidebar_links: normalizeSidebarLinks(value.sidebar_links),
    comments_enabled: typeof value.comments_enabled === 'boolean' ? value.comments_enabled : fallback.comments_enabled,
    branch_label: typeof value.branch_label === 'string' ? value.branch_label : fallback.branch_label,
    auto_publish: typeof value.auto_publish === 'boolean' ? value.auto_publish : fallback.auto_publish,
  };
}

function slugify(input: string) {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || `object_view_${Date.now()}`;
}

function objectTypeLabel(objectTypes: ObjectType[], id: string) {
  const objectType = objectTypes.find((entry) => entry.id === id);
  return objectType?.display_name || objectType?.name || id.slice(0, 8);
}

function defaultObjectViewDisplayName(objectType: ObjectType | undefined, formFactor: ObjectViewFormFactor) {
  const typeName = objectType?.display_name || objectType?.name || 'Object';
  return `${typeName} ${formFactor === 'full' ? 'full page' : 'side panel'}`;
}

function formatDate(value: string | undefined) {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatUnknown(value: unknown) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function renderTemplate(template: string, object: ObjectInstance, summary: Record<string, unknown>) {
  const rendered = template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    const propertyValue = object.properties[key];
    const summaryValue = summary[key];
    return formatUnknown(summaryValue ?? propertyValue ?? object.id);
  });
  return rendered.trim() || object.id.slice(0, 8);
}

function isPublished(view: ObjectViewDefinition) {
  return view.published === true || view.status === 'published';
}

interface CreateObjectViewModalProps {
  open: boolean;
  objectTypes: ObjectType[];
  initialTypeId: string;
  initialFormFactor: ObjectViewFormFactor;
  currentConfig: ObjectViewConfig;
  onClose: () => void;
  onCreate: (body: CreateObjectViewBody) => Promise<ObjectViewDefinition>;
}

function CreateObjectViewModal({
  open,
  objectTypes,
  initialTypeId,
  initialFormFactor,
  currentConfig,
  onClose,
  onCreate,
}: CreateObjectViewModalProps) {
  const [objectTypeId, setObjectTypeId] = useState(initialTypeId);
  const [formFactor, setFormFactor] = useState<ObjectViewFormFactor>(initialFormFactor);
  const [displayName, setDisplayName] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [branchLabel, setBranchLabel] = useState('draft');
  const [useCurrentConfig, setUseCurrentConfig] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedType = useMemo(
    () => objectTypes.find((entry) => entry.id === objectTypeId),
    [objectTypeId, objectTypes],
  );

  useEffect(() => {
    if (!open) return;
    const nextTypeId = initialTypeId || objectTypes[0]?.id || '';
    const nextType = objectTypes.find((entry) => entry.id === nextTypeId) ?? objectTypes[0];
    const nextDisplayName = defaultObjectViewDisplayName(nextType, initialFormFactor);
    setObjectTypeId(nextTypeId);
    setFormFactor(initialFormFactor);
    setDisplayName(nextDisplayName);
    setName(slugify(nextDisplayName));
    setDescription('');
    setBranchLabel(currentConfig.branch_label || 'draft');
    setUseCurrentConfig(true);
    setSubmitting(false);
    setError('');
  }, [currentConfig.branch_label, initialFormFactor, initialTypeId, objectTypes, open]);

  useEffect(() => {
    if (!open) return;
    function onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [open, onClose]);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!objectTypeId) {
      setError('Select an object type.');
      return;
    }
    const normalizedDisplayName = displayName.trim() || defaultObjectViewDisplayName(selectedType, formFactor);
    const normalizedName = slugify(name.trim() || normalizedDisplayName);
    const baseConfig =
      useCurrentConfig && currentConfig.form_factor === formFactor ? currentConfig : defaultConfig(formFactor);
    const nextBranchLabel = branchLabel.trim() || baseConfig.branch_label || 'draft';

    setSubmitting(true);
    setError('');
    try {
      await onCreate({
        name: normalizedName,
        display_name: normalizedDisplayName,
        description: description.trim(),
        object_type_id: objectTypeId,
        mode: 'configured',
        form_factor: formFactor,
        branch_label: nextBranchLabel,
        published: false,
        config: {
          ...baseConfig,
          mode: 'configured',
          form_factor: formFactor,
          branch_label: nextBranchLabel,
          auto_publish: false,
        },
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to create object view');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-object-view-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(17, 24, 39, 0.42)',
        padding: 16,
      }}
    >
      <form
        className="of-panel"
        onSubmit={submit}
        style={{
          width: 'min(720px, 100%)',
          maxHeight: '90vh',
          overflow: 'hidden',
          background: 'var(--bg-panel)',
          boxShadow: 'var(--shadow-popover)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            borderBottom: '1px solid var(--border-default)',
            padding: '14px 16px',
          }}
        >
          <div>
            <p className="of-eyebrow" style={{ margin: 0 }}>
              ONT-011
            </p>
            <h2 id="create-object-view-title" className="of-heading-md" style={{ marginTop: 4 }}>
              Create object view
            </h2>
          </div>
          <button type="button" className="of-button of-button--ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <div style={{ display: 'grid', gap: 14, padding: 16, overflow: 'auto' }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 600 }}>
              Object type
              <select
                value={objectTypeId}
                onChange={(event) => {
                  const nextTypeId = event.target.value;
                  const nextType = objectTypes.find((entry) => entry.id === nextTypeId);
                  const nextDisplayName = defaultObjectViewDisplayName(nextType, formFactor);
                  setObjectTypeId(nextTypeId);
                  setDisplayName(nextDisplayName);
                  setName(slugify(nextDisplayName));
                }}
                className="of-input"
              >
                {objectTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.display_name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 600 }}>
              Form factor
              <select
                value={formFactor}
                onChange={(event) => {
                  const nextFormFactor = event.target.value as ObjectViewFormFactor;
                  setFormFactor(nextFormFactor);
                  const nextDisplayName = defaultObjectViewDisplayName(selectedType, nextFormFactor);
                  setDisplayName(nextDisplayName);
                  setName(slugify(nextDisplayName));
                }}
                className="of-input"
              >
                <option value="full">Full page</option>
                <option value="panel">Side panel</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 600 }}>
              Display name
              <input
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  setName(slugify(event.target.value));
                }}
                className="of-input"
                autoFocus
              />
            </label>

            <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 600 }}>
              API name
              <input value={name} onChange={(event) => setName(event.target.value)} className="of-input" />
            </label>
          </div>

          <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 600 }}>
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="of-input"
              rows={3}
              style={{ minHeight: 76, resize: 'vertical' }}
              placeholder="Purpose, consumers, and expected object context"
            />
          </label>

          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 600 }}>
              Branch label
              <input value={branchLabel} onChange={(event) => setBranchLabel(event.target.value)} className="of-input" />
            </label>

            <label
              className="of-panel-muted"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minHeight: 54,
                padding: 10,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <input
                type="checkbox"
                checked={useCurrentConfig}
                onChange={(event) => setUseCurrentConfig(event.target.checked)}
              />
              Start from current editor configuration
            </label>
          </div>

          {error ? (
            <div className="of-status-danger" style={{ padding: '9px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
              {error}
            </div>
          ) : null}
        </div>

        <footer
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            borderTop: '1px solid var(--border-default)',
            padding: '12px 16px',
          }}
        >
          <button type="button" className="of-button of-button--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="of-button of-button--primary" disabled={submitting || objectTypes.length === 0}>
            {submitting ? 'Creating...' : '+ Object view'}
          </button>
        </footer>
      </form>
    </div>
  );
}

export function ObjectViewsPage() {
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [actions, setActions] = useState<ActionType[]>([]);
  const [objects, setObjects] = useState<ObjectInstance[]>([]);
  const [objectViews, setObjectViews] = useState<ObjectViewDefinition[]>([]);
  const [objectViewsTotal, setObjectViewsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [notice, setNotice] = useState('');

  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [selectedObjectId, setSelectedObjectId] = useState('');
  const [activeMode, setActiveMode] = useState<ObjectViewMode>('configured');
  const [activeFormFactor, setActiveFormFactor] = useState<ObjectViewFormFactor>('full');
  const [activeEditorTab, setActiveEditorTab] = useState<EditorTab>('editor');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [versionDescription, setVersionDescription] = useState('');

  const [preview, setPreview] = useState<ObjectViewResponse | null>(null);
  const [config, setConfig] = useState<ObjectViewConfig>(() => defaultConfig('full'));

  const selectedType = useMemo(
    () => objectTypes.find((entry) => entry.id === selectedTypeId),
    [objectTypes, selectedTypeId],
  );
  const selectedObject = useMemo(
    () => objects.find((entry) => entry.id === selectedObjectId),
    [objects, selectedObjectId],
  );

  async function refreshObjectViews(typeId = selectedTypeId) {
    setCatalogError('');
    try {
      const viewRes = await listObjectViews({ object_type_id: typeId || undefined, per_page: 200 });
      setObjectViews(viewRes.data);
      setObjectViewsTotal(viewRes.total ?? viewRes.data.length);
    } catch (cause) {
      setObjectViews([]);
      setObjectViewsTotal(0);
      setCatalogError(cause instanceof Error ? cause.message : 'Failed to load object views');
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const typeRes = await listObjectTypes({ page: 1, per_page: 100 });
        if (cancelled) return;
        setObjectTypes(typeRes.data);
        setSelectedTypeId(typeRes.data[0]?.id ?? '');
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to load object types');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedTypeId) {
      setProperties([]);
      setObjects([]);
      setActions([]);
      setObjectViews([]);
      setObjectViewsTotal(0);
      setSelectedObjectId('');
      return;
    }
    let cancelled = false;
    async function loadType() {
      setCatalogError('');
      try {
        const [propRes, objRes, actionRes, viewRes] = await Promise.all([
          listProperties(selectedTypeId),
          listObjects(selectedTypeId, { page: 1, per_page: 50 }),
          listActionTypes({ object_type_id: selectedTypeId, page: 1, per_page: 50 }).catch(() => ({
            data: [],
            total: 0,
            page: 1,
            per_page: 50,
          })),
          listObjectViews({ object_type_id: selectedTypeId, page: 1, per_page: 200 }).catch((cause) => {
            if (!cancelled) setCatalogError(cause instanceof Error ? cause.message : 'Failed to load object views');
            return { data: [], total: 0, page: 1, per_page: 200 };
          }),
        ]);
        if (cancelled) return;
        setProperties(propRes);
        setObjects(objRes.data);
        setActions(actionRes.data);
        setObjectViews(viewRes.data);
        setObjectViewsTotal(viewRes.total ?? viewRes.data.length);
        setSelectedObjectId((current) =>
          objRes.data.some((object) => object.id === current) ? current : objRes.data[0]?.id ?? '',
        );
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to load type details');
      }
    }
    void loadType();
    return () => {
      cancelled = true;
    };
  }, [selectedTypeId]);

  useEffect(() => {
    if (!selectedTypeId || !selectedObjectId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    async function loadPreview() {
      setPreviewLoading(true);
      try {
        const res = await getObjectView(selectedTypeId, selectedObjectId);
        if (!cancelled) setPreview(res);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to load preview');
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [selectedTypeId, selectedObjectId]);

  const availableViews = useMemo(
    () => objectViews.filter((view) => view.form_factor === activeFormFactor),
    [activeFormFactor, objectViews],
  );
  const publishedVersion = availableViews.find(isPublished) ?? null;

  const summaryEntries = useMemo(() => {
    if (!preview) return [];
    const configuredProperties = activeFormFactor === 'full' ? config.prominent_properties : config.panel_properties;
    return Object.entries(preview.summary)
      .filter(([key]) =>
        activeMode === 'standard' || configuredProperties.length === 0 ? true : configuredProperties.includes(key),
      )
      .slice(0, activeFormFactor === 'full' ? 8 : 4);
  }, [preview, activeMode, activeFormFactor, config]);

  async function saveObjectView(body: CreateObjectViewBody) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const created = await createObjectView(body);
      const nextFormFactor = created.form_factor ?? body.form_factor ?? 'full';
      const nextMode = created.mode ?? body.mode ?? 'configured';
      setSelectedTypeId(created.object_type_id);
      setActiveFormFactor(nextFormFactor);
      setActiveMode(nextMode);
      setConfig(normalizeConfig(created.config ?? body.config, nextFormFactor));
      setNotice(`Created object view "${created.display_name ?? created.name}".`);
      await refreshObjectViews(created.object_type_id);
      setActiveEditorTab('versions');
      return created;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to save object view';
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }

  async function publishVersion() {
    if (!selectedTypeId) return;
    const description = versionDescription.trim() || `${activeFormFactor} view`;
    const displayName = `${selectedType?.display_name ?? 'Object'} ${activeFormFactor} view`;
    try {
      await saveObjectView({
        name: slugify(`${displayName} ${Date.now()}`),
        display_name: displayName,
        description,
        object_type_id: selectedTypeId,
        mode: activeMode,
        form_factor: activeFormFactor,
        branch_label: config.branch_label,
        published: true,
        config: {
          ...config,
          mode: activeMode,
          form_factor: activeFormFactor,
          auto_publish: true,
        },
      });
      setVersionDescription('');
    } catch {
      // saveObjectView surfaces the error in-page.
    }
  }

  function loadObjectView(view: ObjectViewDefinition) {
    const nextFormFactor = view.form_factor ?? 'full';
    setActiveFormFactor(nextFormFactor);
    setActiveMode(view.mode ?? 'configured');
    setConfig(normalizeConfig(view.config, nextFormFactor));
    setActiveEditorTab('editor');
    setNotice(`Loaded "${view.display_name ?? view.name}" into the editor.`);
  }

  function toggleSection(kind: ObjectViewSectionKind) {
    setConfig((current) => {
      const exists = current.sections.find((section) => section.kind === kind);
      if (exists) {
        return { ...current, sections: current.sections.filter((section) => section.kind !== kind) };
      }
      const meta = SECTION_KINDS.find((section) => section.id === kind);
      return {
        ...current,
        sections: [
          ...current.sections,
          { id: newId(), title: meta?.label ?? kind, kind, description: meta?.description ?? '' },
        ],
      };
    });
  }

  function togglePropertyInList(list: 'prominent_properties' | 'panel_properties', name: string) {
    setConfig((current) => {
      const exists = current[list].includes(name);
      return {
        ...current,
        [list]: exists ? current[list].filter((property) => property !== name) : [...current[list], name],
      };
    });
  }

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16, padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <h1 className="of-heading-xl">Object views</h1>
          <p className="of-text-muted" style={{ marginTop: 4 }}>
            Configure full-page and side-panel object views per type, preview them against real objects, and publish
            reusable versions through the object views API.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          disabled={objectTypes.length === 0 || busy}
          className="of-button of-button--primary"
          style={{ whiteSpace: 'nowrap' }}
        >
          + Object view
        </button>
      </header>

      <CreateObjectViewModal
        open={createModalOpen}
        objectTypes={objectTypes}
        initialTypeId={selectedTypeId}
        initialFormFactor={activeFormFactor}
        currentConfig={config}
        onClose={() => setCreateModalOpen(false)}
        onCreate={saveObjectView}
      />

      {error && (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {notice && (
        <div className="of-status-success" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {notice}
        </div>
      )}

      <section className="of-panel" style={{ display: 'grid', gap: 12, padding: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <span className="of-chip">Object views {objectViewsTotal}</span>
          <span className="of-chip">Object types {objectTypes.length}</span>
          <span className="of-chip">Properties {properties.length}</span>
          <span className="of-chip">Actions {actions.length}</span>
          {publishedVersion ? <span className="of-chip of-status-success">Published {publishedVersion.display_name ?? publishedVersion.name}</span> : null}
        </div>

        {catalogError ? (
          <div className="of-status-warning" style={{ padding: '9px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
            Object views API: {catalogError}
          </div>
        ) : null}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <label style={{ fontSize: 13 }}>
            Object type:
            <select
              value={selectedTypeId}
              onChange={(event) => setSelectedTypeId(event.target.value)}
              className="of-input"
              style={{ marginLeft: 6, width: 'auto', minWidth: 200 }}
            >
              {objectTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.display_name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            Object:
            <select
              value={selectedObjectId}
              onChange={(event) => setSelectedObjectId(event.target.value)}
              className="of-input"
              style={{ marginLeft: 6, width: 'auto', minWidth: 160 }}
            >
              {objects.map((object) => (
                <option key={object.id} value={object.id}>
                  {object.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            Mode:
            <select
              value={activeMode}
              onChange={(event) => setActiveMode(event.target.value as ObjectViewMode)}
              className="of-input"
              style={{ marginLeft: 6, width: 'auto' }}
            >
              <option value="standard">Standard</option>
              <option value="configured">Configured</option>
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            Form factor:
            <select
              value={activeFormFactor}
              onChange={(event) => {
                const next = event.target.value as ObjectViewFormFactor;
                setActiveFormFactor(next);
                setConfig(defaultConfig(next));
              }}
              className="of-input"
              style={{ marginLeft: 6, width: 'auto' }}
            >
              <option value="full">Full page</option>
              <option value="panel">Side panel</option>
            </select>
          </label>
        </div>
      </section>

      <div className="of-tabbar">
        {(['editor', 'versions', 'publish'] as EditorTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveEditorTab(tab)}
            className={`of-tab ${activeEditorTab === tab ? 'of-tab-active' : ''}`}
            style={{ textTransform: 'capitalize' }}
          >
            {tab === 'versions' ? 'Saved views' : tab}
          </button>
        ))}
      </div>

      {activeEditorTab === 'editor' && (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
          <section className="of-panel" style={{ padding: 16 }}>
            <p className="of-eyebrow">Configure view</p>
            <label style={{ display: 'block', marginTop: 10, fontSize: 13 }}>
              Title template
              <input
                value={config.title_template}
                onChange={(event) => setConfig((current) => ({ ...current, title_template: event.target.value }))}
                className="of-input"
                style={{ marginTop: 4 }}
              />
            </label>
            <label style={{ display: 'block', marginTop: 8, fontSize: 13 }}>
              Subtitle property
              <select
                value={config.subtitle_property}
                onChange={(event) => setConfig((current) => ({ ...current, subtitle_property: event.target.value }))}
                className="of-input"
                style={{ marginTop: 4 }}
              >
                <option value="">None</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.name}>
                    {property.display_name} ({property.name})
                  </option>
                ))}
              </select>
            </label>

            <p className="of-eyebrow" style={{ marginTop: 14 }}>
              Prominent properties
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {properties.map((property) => {
                const active = config.prominent_properties.includes(property.name);
                return (
                  <button
                    key={property.id}
                    type="button"
                    onClick={() => togglePropertyInList('prominent_properties', property.name)}
                    className={`of-chip ${active ? 'of-chip-active' : ''}`}
                  >
                    {property.name}
                  </button>
                );
              })}
              {properties.length === 0 ? <span className="of-text-muted">No properties returned.</span> : null}
            </div>

            <p className="of-eyebrow" style={{ marginTop: 14 }}>
              Panel properties
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {properties.map((property) => {
                const active = config.panel_properties.includes(property.name);
                return (
                  <button
                    key={property.id}
                    type="button"
                    onClick={() => togglePropertyInList('panel_properties', property.name)}
                    className={`of-chip ${active ? 'of-chip-active' : ''}`}
                  >
                    {property.name}
                  </button>
                );
              })}
              {properties.length === 0 ? <span className="of-text-muted">No properties returned.</span> : null}
            </div>

            <p className="of-eyebrow" style={{ marginTop: 14 }}>
              Sections
            </p>
            <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
              {SECTION_KINDS.map((kind) => {
                const active = config.sections.some((section) => section.kind === kind.id);
                return (
                  <label
                    key={kind.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border-default)',
                      fontSize: 13,
                      background: active ? 'var(--status-info-bg)' : 'transparent',
                    }}
                  >
                    <input type="checkbox" checked={active} onChange={() => toggleSection(kind.id)} />
                    <strong>{kind.label}</strong>
                    <span className="of-text-muted">{kind.description}</span>
                  </label>
                );
              })}
            </div>

            <p className="of-eyebrow" style={{ marginTop: 14 }}>
              Sidebar links
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {SIDEBAR_PRESETS.map((link) => {
                const active = config.sidebar_links.find((entry) => entry.id === link.id);
                return (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() =>
                      setConfig((current) => ({
                        ...current,
                        sidebar_links: active
                          ? current.sidebar_links.filter((entry) => entry.id !== link.id)
                          : [...current.sidebar_links, link],
                      }))
                    }
                    className={`of-chip ${active ? 'of-chip-active' : ''}`}
                  >
                    {link.label}
                  </button>
                );
              })}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={config.comments_enabled}
                onChange={(event) => setConfig((current) => ({ ...current, comments_enabled: event.target.checked }))}
              />
              Enable comments
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={config.auto_publish}
                onChange={(event) => setConfig((current) => ({ ...current, auto_publish: event.target.checked }))}
              />
              Auto publish when saved
            </label>

            <label style={{ display: 'block', marginTop: 8, fontSize: 13 }}>
              Branch label
              <input
                value={config.branch_label}
                onChange={(event) => setConfig((current) => ({ ...current, branch_label: event.target.value }))}
                className="of-input"
                style={{ marginTop: 4 }}
              />
            </label>
          </section>

          <section className="of-panel" style={{ padding: 16 }}>
            <p className="of-eyebrow">Preview</p>
            {previewLoading ? (
              <p className="of-text-muted" style={{ marginTop: 8, fontSize: 13 }}>
                Loading preview...
              </p>
            ) : preview ? (
              <>
                <h3 className="of-heading-md" style={{ marginTop: 8 }}>
                  {renderTemplate(config.title_template, preview.object, preview.summary)}
                </h3>
                <p className="of-text-muted" style={{ marginTop: 4, fontSize: 13 }}>
                  {config.subtitle_property
                    ? formatUnknown(preview.summary[config.subtitle_property] ?? preview.object.properties[config.subtitle_property])
                    : `Type: ${objectTypeLabel(objectTypes, preview.object.object_type_id)}`}
                </p>
                <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                  {summaryEntries.map(([key, value]) => (
                    <div key={key} className="of-panel-muted" style={{ padding: 10, fontSize: 13 }}>
                      <strong>{key}</strong>: {formatUnknown(value)}
                    </div>
                  ))}
                  {summaryEntries.length === 0 ? (
                    <p className="of-text-muted" style={{ margin: 0, fontSize: 13 }}>
                      No summary properties selected for this form factor.
                    </p>
                  ) : null}
                </div>
                <p className="of-eyebrow" style={{ marginTop: 14 }}>
                  Sections present
                </p>
                <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 13 }}>
                  {(activeMode === 'standard'
                    ? ['summary', 'properties', 'links', 'timeline', 'actions', 'graph']
                    : config.sections.map((section) => section.kind)
                  ).map((kind) => (
                    <li key={kind}>{kind}</li>
                  ))}
                </ul>
                <p className="of-eyebrow" style={{ marginTop: 14 }}>
                  Applicable actions
                </p>
                <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 13 }}>
                  {preview.applicable_actions.map((action) => (
                    <li key={action.id}>
                      {action.display_name} ({action.operation_kind})
                    </li>
                  ))}
                  {preview.applicable_actions.length === 0 ? <li className="of-text-muted">No applicable actions.</li> : null}
                </ul>
              </>
            ) : (
              <p className="of-text-muted">
                {selectedObject ? 'Select an object to preview.' : 'No objects returned for this type.'}
              </p>
            )}
          </section>
        </div>
      )}

      {activeEditorTab === 'versions' && (
        <section className="of-panel" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div>
              <p className="of-eyebrow">Saved object views ({activeFormFactor})</p>
              <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                Backed by GET /object-views for {selectedType?.display_name ?? 'the selected type'}.
              </p>
            </div>
            <button type="button" onClick={() => setCreateModalOpen(true)} className="of-button" disabled={busy}>
              + Object view
            </button>
          </div>

          {availableViews.length === 0 ? (
            <p className="of-text-muted" style={{ marginTop: 12, fontSize: 13 }}>
              No object views returned for this form factor.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
              {availableViews.map((view) => (
                <div key={view.id} className="of-panel-muted" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <strong>{view.display_name ?? view.name}</strong>
                      <p className="of-text-muted" style={{ marginTop: 2, fontSize: 11 }}>
                        {view.branch_label ?? view.config?.branch_label ?? 'draft'} | {formatDate(view.created_at)} |{' '}
                        {view.created_by ?? view.owner_id ?? 'platform-ui'}
                      </p>
                      {view.description ? (
                        <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                          {view.description}
                        </p>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                      <span className="of-chip">{view.form_factor}</span>
                      {isPublished(view) ? <span className="of-chip of-status-success">Published</span> : null}
                      <button type="button" onClick={() => loadObjectView(view)} className="of-button" style={{ fontSize: 12 }}>
                        Load
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeEditorTab === 'publish' && (
        <section className="of-panel" style={{ padding: 16 }}>
          <p className="of-eyebrow">Publish version</p>
          <label style={{ display: 'block', marginTop: 8, fontSize: 13 }}>
            Description
            <input
              value={versionDescription}
              onChange={(event) => setVersionDescription(event.target.value)}
              className="of-input"
              style={{ marginTop: 4 }}
              placeholder={`${activeFormFactor} view ${new Date().toLocaleDateString()}`}
            />
          </label>
          <button
            type="button"
            onClick={() => void publishVersion()}
            className="of-button of-button--primary"
            style={{ marginTop: 8 }}
            disabled={!selectedTypeId || busy}
          >
            {busy ? 'Publishing...' : 'Publish current configuration'}
          </button>
          {publishedVersion ? (
            <p className="of-text-muted" style={{ marginTop: 14, fontSize: 13 }}>
              Currently published: <strong>{publishedVersion.display_name ?? publishedVersion.name}</strong> (
              {formatDate(publishedVersion.created_at)})
            </p>
          ) : null}
          <p className="of-eyebrow" style={{ marginTop: 14 }}>
            Generated URLs
          </p>
          <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 13, fontFamily: 'var(--font-mono)' }}>
            <li>
              {selectedTypeId && selectedObjectId
                ? `/object-views?type=${selectedTypeId}&object=${selectedObjectId}&mode=configured&factor=full`
                : '-'}
            </li>
            <li>
              {selectedTypeId && selectedObjectId
                ? `/object-views?type=${selectedTypeId}&object=${selectedObjectId}&mode=configured&factor=panel`
                : '-'}
            </li>
          </ul>
        </section>
      )}

      {loading && <p className="of-text-muted">Loading...</p>}

      {actions.length > 0 && (
        <section className="of-panel" style={{ padding: 16 }}>
          <p className="of-eyebrow">Action types for this object type</p>
          <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 13 }}>
            {actions.map((action) => (
              <li key={action.id}>
                {action.display_name} - {action.operation_kind}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  addObjectViewTab,
  buildObjectCommentThread,
  buildObjectViewApplicationEmbeddingMatrix,
  buildObjectViewGlobalBranchAdapterState,
  buildObjectViewGlobalBranchRebaseModel,
  buildObjectViewMarketplaceOutput,
  buildOntologyBranchProposalIntegration,
  buildObjectViewSafeMetadata,
  buildObjectViewUrlVariants,
  cacheObjectViewSafeMetadata,
  completeObjectViewGlobalBranchRebase,
  buildDefaultCustomObjectViewConfig,
  buildDefaultCustomObjectViews,
  buildObjectViewEditPermissionDecision,
  buildObjectInstanceViewPolicy,
  buildPanelObjectViewRuntimeConfig,
  buildCoreObjectViews,
  createObjectView,
  defaultObjectViewRuntimeBudgets,
  deleteObjectViewTab,
  emptyObjectViewMetadataCache,
  ensurePanelObjectViewConfiguration,
  ensureObjectViewEditorShell,
  evaluateObjectViewRuntimeBudgets,
  filterObjectsForRestrictedViewPolicy,
  getObjectView,
  getObjectViewSafeMetadata,
  measureObjectViewRuntimeUsage,
  listActionTypes,
  listTypeInterfaces,
  mergeApplicableInterfaceActions,
  listLinkTypes,
  listObjectViews,
  listObjects,
  listObjectTypes,
  listProperties,
  markObjectViewConfigManuallyEdited,
  moveObjectViewTab,
  objectViewRuntimeTabs,
  objectViewVersionHistory,
  objectViewVisibleProperties,
  objectViewEmbedPolicy,
  objectCommentThreadKey,
  parseObjectViewUrlSearch,
  redactObjectViewResponseForObjectViewPermissions,
  renameObjectViewTab,
  restoreObjectViewConfigVersion,
  resolveObjectViewModeToggle,
  saveObjectViewConfigVersion,
  schemaOnlyObjectViewResponse,
  setObjectViewTabVisibility,
  type ActionType,
  type CreateObjectViewBody,
  type LinkType,
  type ObjectInstance,
  type ObjectInstanceViewPolicy,
  type ObjectCommentThread,
  type ObjectType,
  type ObjectViewConfig,
  type ObjectViewDefinition,
  type ObjectViewFormFactor,
  type ObjectViewMode,
  type ObjectViewMetadataCache,
  type ObjectViewPanelConfiguration,
  type ObjectViewPanelHost,
  type ObjectViewPanelHostConfiguration,
  type ObjectViewResponse,
  type ObjectViewRuntimeBudgetLimits,
  type ObjectViewRuntimeBudgets,
  type ObjectViewSectionKind,
  type ObjectViewSidebarLinkDefinition,
  type ObjectViewTabDefinition,
  type ObjectViewTabVisibility,
  type ObjectViewToggleHost,
  type ObjectViewVersionRecord,
  type ObjectViewWorkshopWidgetDefinition,
  type ObjectViewGlobalBranchRebaseResolutionChoice,
  type ObjectViewMarketplacePackagingResult,
  type OntologyGlobalBranchProposalIntegration,
  type OntologyPermissionPrincipal,
  type Property,
} from '@/lib/api/ontology';
import { ObjectCommentsHelper } from '@/lib/components/ontology/ObjectCommentsHelper';
import { useAuth } from '@/lib/stores/auth';

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

const PANEL_HOST_LABELS: Record<string, string> = {
  object_explorer: 'Object Explorer',
  workshop: 'Workshop widget',
  map: 'Map',
  vertex: 'Vertex',
  gaia: 'Gaia',
  object_detail_drawer: 'Detail drawer',
  action_success_toast: 'Action toast',
};

const OBJECT_VIEW_HOST_OPTIONS: Array<{ id: ObjectViewToggleHost; label: string }> = [
  { id: 'object_views', label: 'Object Views' },
  { id: 'object_explorer', label: 'Object Explorer' },
  { id: 'map', label: 'Map' },
  { id: 'vertex', label: 'Vertex' },
  { id: 'gaia', label: 'Gaia' },
  { id: 'workshop', label: 'Workshop' },
];

function panelHostLabel(host: ObjectViewPanelHost) {
  return PANEL_HOST_LABELS[host] ?? host;
}

function objectViewDeliveryLabel(delivery: string) {
  if (delivery === 'host_panel') return 'Host panel';
  if (delivery === 'workshop_widget') return 'Workshop widget';
  if (delivery === 'deep_link') return 'Deep link';
  return delivery.charAt(0).toUpperCase() + delivery.slice(1);
}

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
    object_view_version: 1,
    workshop_module_version: 1,
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

function normalizeMetadata(value: unknown): ObjectViewConfig['metadata'] | undefined {
  if (!isRecord(value)) return undefined;
  const metadata: ObjectViewConfig['metadata'] = {};
  if (typeof value.title_property === 'string' || value.title_property === null) metadata.title_property = value.title_property;
  if (typeof value.primary_key_property === 'string' || value.primary_key_property === null) {
    metadata.primary_key_property = value.primary_key_property;
  }
  metadata.prominent_property_names = normalizeStringList(value.prominent_property_names);
  metadata.panel_property_names = normalizeStringList(value.panel_property_names);
  metadata.normal_properties = normalizeStringList(value.normal_properties);
  metadata.linked_object_type_ids = normalizeStringList(value.linked_object_type_ids);
  metadata.link_type_ids = normalizeStringList(value.link_type_ids);
  if (typeof value.default_custom === 'boolean') metadata.default_custom = value.default_custom;
  if (typeof value.generated === 'boolean') metadata.generated = value.generated;
  if (value.compatibility_mode === 'datasource_derived' || value.compatibility_mode === 'native') {
    metadata.compatibility_mode = value.compatibility_mode;
  }
  const inputDatasourceIds = normalizeStringList(value.input_datasource_ids);
  if (inputDatasourceIds.length > 0) metadata.input_datasource_ids = inputDatasourceIds;
  return metadata;
}

function normalizeDefaultSync(value: unknown): ObjectViewConfig['default_sync'] | undefined {
  if (!isRecord(value)) return undefined;
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    state: value.state === 'manual' ? 'manual' : 'synced',
    source: 'object_type_metadata',
    metadata_signature: typeof value.metadata_signature === 'string' ? value.metadata_signature : '',
    synchronized_at: typeof value.synchronized_at === 'string' ? value.synchronized_at : new Date().toISOString(),
    generated_from_object_type_updated_at:
      typeof value.generated_from_object_type_updated_at === 'string' || value.generated_from_object_type_updated_at === null
        ? value.generated_from_object_type_updated_at
        : null,
    property_names: normalizeStringList(value.property_names),
    prominent_property_names: normalizeStringList(value.prominent_property_names),
    panel_property_names: normalizeStringList(value.panel_property_names),
    link_type_ids: normalizeStringList(value.link_type_ids),
  };
}

function normalizeTabVisibility(value: unknown): ObjectViewTabVisibility {
  return value === 'hidden' || value === 'conditional' ? value : 'visible';
}

function normalizeWidget(value: unknown, index: number): ObjectViewWorkshopWidgetDefinition | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.kind !== 'string' || typeof value.title !== 'string') return null;
  return {
    id: value.id,
    kind: value.kind,
    title: value.title,
    description: typeof value.description === 'string' ? value.description : '',
    binding: typeof value.binding === 'string' ? value.binding : `selectedObject.widget${index + 1}`,
    config: isRecord(value.config) ? value.config : {},
  };
}

function normalizeTabs(value: unknown, formFactor: ObjectViewFormFactor): ObjectViewTabDefinition[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tabs = value.flatMap((item, index): ObjectViewTabDefinition[] => {
    if (!isRecord(item) || !isRecord(item.module)) return [];
    const widgets = Array.isArray(item.module.widgets)
      ? item.module.widgets.flatMap((widget, widgetIndex) => {
          const normalized = normalizeWidget(widget, widgetIndex);
          return normalized ? [normalized] : [];
        })
      : [];
    return [{
      id: typeof item.id === 'string' ? item.id : `tab-${index + 1}`,
      title: typeof item.title === 'string' ? item.title : `Tab ${index + 1}`,
      order: typeof item.order === 'number' ? item.order : index,
      visibility: normalizeTabVisibility(item.visibility),
      hidden_in_runtime_when_single:
        typeof item.hidden_in_runtime_when_single === 'boolean' ? item.hidden_in_runtime_when_single : formFactor === 'full',
      module: {
        id: typeof item.module.id === 'string' ? item.module.id : `module-${index + 1}`,
        name: typeof item.module.name === 'string' ? item.module.name : `Module${index + 1}`,
        display_name: typeof item.module.display_name === 'string' ? item.module.display_name : `Module ${index + 1}`,
        version: typeof item.module.version === 'number' ? item.module.version : 1,
        form_factor: item.module.form_factor === 'panel' ? 'panel' : formFactor,
        object_context_parameter:
          typeof item.module.object_context_parameter === 'string' ? item.module.object_context_parameter : 'selectedObject',
        source: item.module.source === 'generated_default' ? 'generated_default' : 'user_managed',
        widgets,
        updated_at: typeof item.module.updated_at === 'string' ? item.module.updated_at : new Date().toISOString(),
      },
    }];
  });
  return tabs.length > 0 ? tabs : undefined;
}

function normalizePanelHost(value: unknown): ObjectViewPanelHostConfiguration | null {
  if (!isRecord(value) || typeof value.host !== 'string') return null;
  const surface =
    value.surface === 'compact' || value.surface === 'workshop_widget' || value.surface === 'side_panel'
      ? value.surface
      : 'side_panel';
  return {
    host: value.host,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    surface,
    selected_object_parameter:
      typeof value.selected_object_parameter === 'string' && value.selected_object_parameter.trim()
        ? value.selected_object_parameter
        : 'selectedObject',
    supports_open_full_view:
      typeof value.supports_open_full_view === 'boolean' ? value.supports_open_full_view : true,
  };
}

function normalizePanelConfig(value: unknown): ObjectViewPanelConfiguration | undefined {
  if (!isRecord(value)) return undefined;
  const sectionKinds = normalizeStringList(value.section_kinds).filter((kind): kind is ObjectViewSectionKind =>
    SECTION_KINDS.some((section) => section.id === kind),
  );
  const hosts = Array.isArray(value.hosts)
    ? value.hosts.flatMap((host) => {
        const normalized = normalizePanelHost(host);
        return normalized ? [normalized] : [];
      })
    : [];
  const workshopWidget = isRecord(value.workshop_widget) ? value.workshop_widget : {};
  return {
    title_template: typeof value.title_template === 'string' ? value.title_template : '{{name}}',
    property_names: normalizeStringList(value.property_names),
    section_kinds: sectionKinds.length > 0 ? sectionKinds : ['summary', 'properties'],
    density: value.density === 'comfortable' ? 'comfortable' : 'compact',
    max_properties:
      typeof value.max_properties === 'number' && Number.isFinite(value.max_properties)
        ? Math.max(1, Math.min(12, Math.round(value.max_properties)))
        : 6,
    max_link_groups:
      typeof value.max_link_groups === 'number' && Number.isFinite(value.max_link_groups)
        ? Math.max(0, Math.min(8, Math.round(value.max_link_groups)))
        : 2,
    show_title: typeof value.show_title === 'boolean' ? value.show_title : true,
    show_open_full_view: typeof value.show_open_full_view === 'boolean' ? value.show_open_full_view : true,
    hosts,
    workshop_widget: {
      enabled: typeof workshopWidget.enabled === 'boolean' ? workshopWidget.enabled : true,
      widget_id:
        typeof workshopWidget.widget_id === 'string' && workshopWidget.widget_id.trim()
          ? workshopWidget.widget_id
          : 'object-view-widget:panel',
      selected_object_parameter:
        typeof workshopWidget.selected_object_parameter === 'string' && workshopWidget.selected_object_parameter.trim()
          ? workshopWidget.selected_object_parameter
          : 'selectedObject',
      height_px:
        typeof workshopWidget.height_px === 'number' && Number.isFinite(workshopWidget.height_px)
          ? Math.max(240, Math.min(900, Math.round(workshopWidget.height_px)))
          : 420,
    },
  };
}

function normalizeVersionHistory(value: unknown): ObjectViewVersionRecord[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const history = value.flatMap((item): ObjectViewVersionRecord[] => {
    if (!isRecord(item) || !isRecord(item.snapshot)) return [];
    const objectViewVersion = typeof item.object_view_version === 'number' ? item.object_view_version : 1;
    const moduleVersion = typeof item.workshop_module_version === 'number' ? item.workshop_module_version : 1;
    const publishState =
      item.publish_state === 'published' || item.publish_state === 'previously_published'
        ? item.publish_state
        : 'draft';
    return [{
      id: typeof item.id === 'string' ? item.id : `object-view-version:${objectViewVersion}`,
      object_view_version: objectViewVersion,
      workshop_module_version: moduleVersion,
      author: typeof item.author === 'string' ? item.author : 'platform-ui',
      timestamp: typeof item.timestamp === 'string' ? item.timestamp : new Date().toISOString(),
      change_summary: typeof item.change_summary === 'string' ? item.change_summary : `Version ${objectViewVersion}`,
      publish_state: publishState,
      published: typeof item.published === 'boolean' ? item.published : publishState === 'published',
      published_at: typeof item.published_at === 'string' ? item.published_at : undefined,
      rollback_target_version:
        typeof item.rollback_target_version === 'number' ? item.rollback_target_version : undefined,
      restored_from_version: typeof item.restored_from_version === 'number' ? item.restored_from_version : undefined,
      tab_ids: normalizeStringList(item.tab_ids),
      module_ids: normalizeStringList(item.module_ids),
      snapshot: item.snapshot as Omit<ObjectViewConfig, 'version_history'>,
    }];
  });
  return history.length > 0 ? history : undefined;
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
    compatibility_mode: value.compatibility_mode === 'datasource_derived' ? 'datasource_derived' : value.compatibility_mode === 'native' ? 'native' : undefined,
    input_datasource_ids: normalizeStringList(value.input_datasource_ids),
    object_view_version: typeof value.object_view_version === 'number' ? value.object_view_version : fallback.object_view_version,
    workshop_module_version:
      typeof value.workshop_module_version === 'number' ? value.workshop_module_version : fallback.workshop_module_version,
    selected_tab_id: typeof value.selected_tab_id === 'string' ? value.selected_tab_id : undefined,
    tabs: normalizeTabs(value.tabs, formFactor),
    panel_config: normalizePanelConfig(value.panel_config),
    published_version: typeof value.published_version === 'number' ? value.published_version : undefined,
    last_saved_by: typeof value.last_saved_by === 'string' ? value.last_saved_by : undefined,
    last_saved_at: typeof value.last_saved_at === 'string' ? value.last_saved_at : undefined,
    last_change_summary: typeof value.last_change_summary === 'string' ? value.last_change_summary : undefined,
    rollback_target_version: typeof value.rollback_target_version === 'number' ? value.rollback_target_version : undefined,
    restored_from_version: typeof value.restored_from_version === 'number' ? value.restored_from_version : undefined,
    version_history: normalizeVersionHistory(value.version_history),
    default_sync: normalizeDefaultSync(value.default_sync),
    metadata: normalizeMetadata(value.metadata),
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
  getDefaultConfig: (objectTypeId: string, formFactor: ObjectViewFormFactor) => ObjectViewConfig;
  onClose: () => void;
  onCreate: (body: CreateObjectViewBody) => Promise<ObjectViewDefinition>;
}

function CreateObjectViewModal({
  open,
  objectTypes,
  initialTypeId,
  initialFormFactor,
  currentConfig,
  getDefaultConfig,
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
      useCurrentConfig && currentConfig.form_factor === formFactor ? currentConfig : getDefaultConfig(objectTypeId, formFactor);
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
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [actions, setActions] = useState<ActionType[]>([]);
  const [objects, setObjects] = useState<ObjectInstance[]>([]);
  const [objectViews, setObjectViews] = useState<ObjectViewDefinition[]>([]);
  const [linkTypes, setLinkTypes] = useState<LinkType[]>([]);
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
  const [activeHost, setActiveHost] = useState<ObjectViewToggleHost>('object_views');
  const [activeEditorTab, setActiveEditorTab] = useState<EditorTab>('editor');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [manageTabsOpen, setManageTabsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [newTabTitle, setNewTabTitle] = useState('Details');
  const [versionDescription, setVersionDescription] = useState('');
  const [objectViewRebaseResolutions, setObjectViewRebaseResolutions] = useState<Record<string, ObjectViewGlobalBranchRebaseResolutionChoice>>({});
  const [marketplaceSelectedTabIds, setMarketplaceSelectedTabIds] = useState<string[]>([]);

  const [preview, setPreview] = useState<ObjectViewResponse | null>(null);
  const [config, setConfig] = useState<ObjectViewConfig>(() => defaultConfig('full'));
  const [commentThreads, setCommentThreads] = useState<Record<string, ObjectCommentThread>>({});
  const [metadataCache, setMetadataCache] = useState<ObjectViewMetadataCache>(() => emptyObjectViewMetadataCache());

  const selectedType = useMemo(
    () => objectTypes.find((entry) => entry.id === selectedTypeId),
    [objectTypes, selectedTypeId],
  );
  const requestedUrlState = useMemo(
    () => parseObjectViewUrlSearch(searchParams, selectedType),
    [searchParams, selectedType],
  );
  const embeddedMode = requestedUrlState.embedded && objectViewEmbedPolicy('object_views').allowed;
  const principal = useMemo<OntologyPermissionPrincipal>(() => ({
    user_id: user?.id,
    email: user?.email,
    groups: user?.groups || [],
    roles: user?.roles || [],
    permissions: user?.permissions || [],
  }), [user?.id, user?.email, user?.groups, user?.roles, user?.permissions]);
  const selectedTypeAccess = useMemo<ObjectInstanceViewPolicy | null>(
    () => selectedType ? buildObjectInstanceViewPolicy({ objectType: selectedType, principal }) : null,
    [principal, selectedType],
  );
  const runtimePreviewAccess = preview?.object.object_view_access ?? selectedTypeAccess;
  const schemaOnlyPreview = Boolean(runtimePreviewAccess?.schema_only);
  const selectedObject = useMemo(
    () => objects.find((entry) => entry.id === selectedObjectId),
    [objects, selectedObjectId],
  );

  function defaultConfigForType(typeId: string, formFactor: ObjectViewFormFactor) {
    const objectType = objectTypes.find((entry) => entry.id === typeId);
    if (!objectType) return defaultConfig(formFactor);
    const typeProperties = typeId === selectedTypeId ? properties : objectType.properties ?? [];
    const typeLinks = typeId === selectedTypeId ? linkTypes : [];
    return buildDefaultCustomObjectViewConfig({
      objectType,
      properties: typeProperties,
      linkTypes: typeLinks,
      formFactor,
    });
  }

  function withDefaultCustomObjectViews(typeId: string, views: ObjectViewDefinition[], typeProperties: Property[], typeLinks: LinkType[]) {
    const objectType = objectTypes.find((entry) => entry.id === typeId);
    if (!objectType) return views;
    return buildDefaultCustomObjectViews({
      objectTypes: [objectType],
      propertiesByObjectType: { [objectType.id]: typeProperties },
      linkTypes: typeLinks,
      existingViews: views,
      ownerId: user?.id,
    });
  }

  function editConfig(updater: (current: ObjectViewConfig) => ObjectViewConfig) {
    setConfig((current) => markObjectViewConfigManuallyEdited(updater(current)));
  }

  function updateRuntimeBudgets(updater: (current: ObjectViewRuntimeBudgets) => ObjectViewRuntimeBudgets) {
    editConfig((current) => {
      const base = current.runtime_budgets ?? defaultObjectViewRuntimeBudgets();
      return { ...current, runtime_budgets: updater(base) };
    });
  }

  function updateRuntimeBudgetLimit(
    scope: 'per_render' | 'per_tab' | 'per_panel',
    key: keyof ObjectViewRuntimeBudgetLimits,
    value: number,
  ) {
    updateRuntimeBudgets((current) => {
      if (scope === 'per_render') {
        return { ...current, per_render: { ...current.per_render, [key]: Math.max(0, Math.floor(value)) } };
      }
      const next = { ...(current[scope] ?? {}) };
      if (Number.isFinite(value) && value >= 0) {
        next[key] = Math.floor(value);
      } else {
        delete next[key];
      }
      return { ...current, [scope]: next };
    });
  }

  function editorShellConfigFor(current: ObjectViewConfig) {
    if (!selectedType) return current;
    const shell = ensureObjectViewEditorShell({
      objectType: selectedType,
      config: current,
      formFactor: activeFormFactor,
    });
    return ensurePanelObjectViewConfiguration({
      objectType: selectedType,
      config: shell,
    });
  }

  function setEditorShellConfig(updater: (current: ObjectViewConfig) => ObjectViewConfig) {
    setConfig((current) => updater(editorShellConfigFor(current)));
  }

  function editEditorShellConfig(updater: (current: ObjectViewConfig) => ObjectViewConfig) {
    editConfig((current) => updater(editorShellConfigFor(current)));
  }

  function updateActiveObjectViewTab(updater: (tab: ObjectViewTabDefinition) => ObjectViewTabDefinition) {
    editEditorShellConfig((current) => {
      const tabId = current.selected_tab_id ?? current.tabs?.[0]?.id;
      const tabs = (current.tabs ?? []).map((tab) => (tab.id === tabId ? updater(tab) : tab));
      const activeModule = tabs.find((tab) => tab.id === tabId)?.module;
      return {
        ...current,
        tabs,
        workshop_module_version: activeModule?.version ?? current.workshop_module_version,
      };
    });
  }

  function addFullObjectViewTab() {
    if (!selectedType) return;
    editEditorShellConfig((current) =>
      addObjectViewTab({
        objectType: selectedType,
        config: current,
        title: newTabTitle,
      }),
    );
    setNewTabTitle(`Tab ${editorTabs.length + 2}`);
  }

  function renameFullObjectViewTab(tabId: string, title: string) {
    if (!selectedType) return;
    editEditorShellConfig((current) =>
      renameObjectViewTab({
        objectType: selectedType,
        config: current,
        tabId,
        title,
      }),
    );
  }

  function setFullObjectViewTabVisibility(
    tabId: string,
    visibility: ObjectViewTabVisibility,
    hiddenInRuntimeWhenSingle?: boolean,
  ) {
    if (!selectedType) return;
    editEditorShellConfig((current) =>
      setObjectViewTabVisibility({
        objectType: selectedType,
        config: current,
        tabId,
        visibility,
        hiddenInRuntimeWhenSingle,
      }),
    );
  }

  function moveFullObjectViewTab(tabId: string, direction: 'up' | 'down') {
    if (!selectedType) return;
    editEditorShellConfig((current) =>
      moveObjectViewTab({
        objectType: selectedType,
        config: current,
        tabId,
        direction,
      }),
    );
  }

  function deleteFullObjectViewTab(tabId: string) {
    if (!selectedType) return;
    editEditorShellConfig((current) =>
      deleteObjectViewTab({
        objectType: selectedType,
        config: current,
        tabId,
      }),
    );
  }

  function updateActiveWorkshopWidget(
    widgetId: string,
    updater: (widget: ObjectViewWorkshopWidgetDefinition) => ObjectViewWorkshopWidgetDefinition,
  ) {
    updateActiveObjectViewTab((tab) => ({
      ...tab,
      module: {
        ...tab.module,
        widgets: tab.module.widgets.map((widget) => (widget.id === widgetId ? updater(widget) : widget)),
      },
    }));
  }

  function updatePanelConfiguration(updater: (panel: ObjectViewPanelConfiguration) => ObjectViewPanelConfiguration) {
    if (!selectedType) return;
    editEditorShellConfig((current) => {
      const panelReady = ensurePanelObjectViewConfiguration({ objectType: selectedType, config: current });
      const panel = panelReady.panel_config;
      if (!panel) return panelReady;
      const nextPanel = updater(panel);
      return {
        ...panelReady,
        panel_properties: nextPanel.property_names,
        panel_config: nextPanel,
      };
    });
  }

  function addWorkshopWidget(kind: ObjectViewSectionKind) {
    const meta = SECTION_KINDS.find((section) => section.id === kind);
    updateActiveObjectViewTab((tab) => ({
      ...tab,
      module: {
        ...tab.module,
        widgets: [
          ...tab.module.widgets,
          {
            id: `widget-${kind}-${Date.now()}`,
            kind,
            title: meta?.label ?? kind,
            description: meta?.description ?? '',
            binding: kind === 'links' ? 'selectedObject.links' : kind === 'actions' ? 'selectedObject.actions' : 'selectedObject',
            config: {},
          },
        ],
      },
    }));
  }

  function configForSave(published?: boolean) {
    if (!selectedType) return editorShellConfigFor(config);
    return saveObjectViewConfigVersion({
      objectType: selectedType,
      config: {
        ...editorShellConfigFor(config),
        mode: 'configured',
        form_factor: activeFormFactor,
      },
      published,
      author: user?.email || user?.id || 'platform-ui',
      changeSummary: versionDescription,
    });
  }

  async function refreshObjectViews(typeId = selectedTypeId) {
    setCatalogError('');
    try {
      const viewRes = await listObjectViews({ object_type_id: typeId || undefined, per_page: 200 });
      const nextViews = typeId
        ? withDefaultCustomObjectViews(typeId, viewRes.data, typeId === selectedTypeId ? properties : [], typeId === selectedTypeId ? linkTypes : [])
        : viewRes.data;
      setObjectViews(nextViews);
      setObjectViewsTotal(nextViews.length);
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
        const requestedType = typeRes.data.find((type) => type.id === requestedUrlState.object_type_id);
        setSelectedTypeId(requestedType?.id ?? typeRes.data[0]?.id ?? '');
        setActiveFormFactor(requestedUrlState.form_factor);
        setActiveMode(requestedUrlState.mode);
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
  }, [requestedUrlState.form_factor, requestedUrlState.mode, requestedUrlState.object_type_id]);

  useEffect(() => {
    if (!selectedTypeId) {
      setProperties([]);
      setObjects([]);
      setActions([]);
      setLinkTypes([]);
      setObjectViews([]);
      setObjectViewsTotal(0);
      setSelectedObjectId('');
      return;
    }
    let cancelled = false;
    async function loadType() {
      setCatalogError('');
      try {
        const canLoadObjectRows = selectedTypeAccess?.can_view_instances ?? true;
        const [propRes, objRes, actionRes, allActionRes, interfaceRes, linkRes, viewRes] = await Promise.all([
          listProperties(selectedTypeId),
          canLoadObjectRows
            ? listObjects(selectedTypeId, { page: 1, per_page: 50 })
            : Promise.resolve({ data: [] as ObjectInstance[], total: 0, page: 1, per_page: 50 }),
          listActionTypes({ object_type_id: selectedTypeId, page: 1, per_page: 50 }).catch(() => ({
            data: [] as ActionType[],
            total: 0,
            page: 1,
            per_page: 50,
          })),
          listActionTypes({ page: 1, per_page: 200 }).catch(() => ({
            data: [] as ActionType[],
            total: 0,
            page: 1,
            per_page: 200,
          })),
          listTypeInterfaces(selectedTypeId).catch(() => []),
          listLinkTypes({ object_type_id: selectedTypeId, page: 1, per_page: 100 }).catch(() => ({
            data: [],
            total: 0,
          })),
          listObjectViews({ object_type_id: selectedTypeId, page: 1, per_page: 200 }).catch((cause) => {
            if (!cancelled) setCatalogError(cause instanceof Error ? cause.message : 'Failed to load object views');
            return { data: [], total: 0, page: 1, per_page: 200 };
          }),
        ]);
        if (cancelled) return;
        setProperties(propRes);
        const visibleObjects = filterObjectsForRestrictedViewPolicy(objRes.data, { objectType: selectedType, principal });
        setObjects(visibleObjects);
        setActions(mergeApplicableInterfaceActions(actionRes.data, allActionRes.data, interfaceRes));
        setLinkTypes(linkRes.data);
        const nextObjectViews = selectedType
          ? buildDefaultCustomObjectViews({
              objectTypes: [selectedType],
              propertiesByObjectType: { [selectedType.id]: propRes },
              linkTypes: linkRes.data,
              existingViews: viewRes.data,
              ownerId: user?.id,
            })
          : viewRes.data;
        setObjectViews(nextObjectViews);
        setObjectViewsTotal(nextObjectViews.length);
        const requestedObject = visibleObjects.find((object) => object.id === requestedUrlState.object_id) ?? (
          requestedUrlState.primary_key_property && requestedUrlState.primary_key_value !== null
            ? visibleObjects.find((object) =>
                String(object.properties?.[requestedUrlState.primary_key_property!] ?? '') === requestedUrlState.primary_key_value,
              )
            : undefined
        );
        setSelectedObjectId((current) =>
          canLoadObjectRows
            ? requestedObject?.id ?? (visibleObjects.some((object) => object.id === current) ? current : visibleObjects[0]?.id ?? '')
            : '',
        );
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to load type details');
      }
    }
    void loadType();
    return () => {
      cancelled = true;
    };
  }, [
    principal,
    requestedUrlState.object_id,
    requestedUrlState.primary_key_property,
    requestedUrlState.primary_key_value,
    selectedType,
    selectedTypeAccess?.can_view_instances,
    selectedTypeId,
  ]);

  useEffect(() => {
    if (!selectedTypeId) {
      setPreview(null);
      return;
    }
    if (selectedType && selectedTypeAccess && !selectedTypeAccess.can_view_instances) {
      setPreview(schemaOnlyObjectViewResponse({
        objectType: selectedType,
        objectId: selectedObjectId || null,
        policy: selectedTypeAccess,
      }));
      return;
    }
    if (!selectedObjectId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    async function loadPreview() {
      setPreviewLoading(true);
      try {
        const res = await getObjectView(selectedTypeId, selectedObjectId);
        if (!cancelled) {
          setPreview(redactObjectViewResponseForObjectViewPermissions(res, {
            objectType: selectedType,
            objectTypes,
            principal,
          }));
        }
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
  }, [objectTypes, principal, selectedObjectId, selectedType, selectedTypeAccess, selectedTypeId]);

  const coreObjectViews = useMemo(
    () =>
      selectedType
        ? buildCoreObjectViews({
            objectTypes: [selectedType],
            propertiesByObjectType: { [selectedType.id]: properties },
            linkTypes,
          })
        : [],
    [selectedType, properties, linkTypes],
  );

  const availableViews = useMemo(
    () => [...coreObjectViews, ...objectViews].filter((view) => view.form_factor === activeFormFactor),
    [activeFormFactor, coreObjectViews, objectViews],
  );
  const objectViewModeResolution = useMemo(
    () =>
      resolveObjectViewModeToggle({
        views: availableViews,
        formFactor: activeFormFactor,
        host: activeHost,
        objectTypeId: selectedTypeId,
        requestedMode: activeMode,
      }),
    [activeFormFactor, activeHost, activeMode, availableViews, selectedTypeId],
  );
  const publishedVersion = availableViews.find(isPublished) ?? null;
  const editorShellConfig = useMemo(
    () => {
      if (!selectedType) return config;
      const shell = ensureObjectViewEditorShell({
        objectType: selectedType,
        config,
        formFactor: activeFormFactor,
      });
      return ensurePanelObjectViewConfiguration({
        objectType: selectedType,
        config: shell,
      });
    },
    [activeFormFactor, config, selectedType],
  );
  const objectViewEditPermission = useMemo(
    () =>
      selectedType
        ? buildObjectViewEditPermissionDecision({
            objectType: selectedType,
            objectView: objectViewModeResolution.custom_view ?? objectViewModeResolution.active_view,
            config: editorShellConfig,
            principal,
          })
        : null,
    [editorShellConfig, objectViewModeResolution.active_view, objectViewModeResolution.custom_view, principal, selectedType],
  );
  const canEditObjectView = Boolean(objectViewEditPermission?.allowed);
  const editorTabs = editorShellConfig.tabs ?? [];
  useEffect(() => {
    const tabIds = activeFormFactor === 'full' ? editorTabs.map((tab) => tab.id) : [];
    setMarketplaceSelectedTabIds((current) => {
      const kept = current.filter((id) => tabIds.includes(id));
      const next = kept.length > 0 ? kept : tabIds;
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
  }, [activeFormFactor, editorTabs]);
  const activeObjectViewTab =
    editorTabs.find((tab) => tab.id === editorShellConfig.selected_tab_id) ?? editorTabs[0] ?? null;
  const activeWorkshopModule = activeObjectViewTab?.module ?? null;
  const currentVersionHistory = useMemo(() => objectViewVersionHistory(editorShellConfig), [editorShellConfig]);
  const currentPublishedVersion = currentVersionHistory.find((version) => version.publish_state === 'published') ?? null;
  const runtimeObjectViewTabs = useMemo(() => objectViewRuntimeTabs(editorShellConfig), [editorShellConfig]);
  const runtimeBudgets = useMemo(
    () => editorShellConfig.runtime_budgets ?? defaultObjectViewRuntimeBudgets(),
    [editorShellConfig.runtime_budgets],
  );
  const runtimeUsage = useMemo(
    () =>
      measureObjectViewRuntimeUsage({
        config: editorShellConfig,
        properties,
        response: preview && !schemaOnlyPreview ? preview : null,
        formFactor: activeFormFactor,
      }),
    [activeFormFactor, editorShellConfig, preview, properties, schemaOnlyPreview],
  );
  const runtimeBudgetEvaluation = useMemo(
    () =>
      evaluateObjectViewRuntimeBudgets({
        config: editorShellConfig,
        usage: runtimeUsage,
        formFactor: activeFormFactor,
        editorMode: canEditObjectView,
      }),
    [activeFormFactor, canEditObjectView, editorShellConfig, runtimeUsage],
  );
  const runtimeBudgetWarningsByTab = useMemo(() => {
    const map = new Map<string, typeof runtimeBudgetEvaluation.warnings>();
    for (const warning of runtimeBudgetEvaluation.warnings) {
      if (warning.scope !== 'tab' || !warning.scope_id) continue;
      const existing = map.get(warning.scope_id) ?? [];
      existing.push(warning);
      map.set(warning.scope_id, existing);
    }
    return map;
  }, [runtimeBudgetEvaluation]);
  const activeCustomObjectView = objectViewModeResolution.custom_view ?? null;
  const cachedSafeMetadata = useMemo(() => {
    if (!activeCustomObjectView) return null;
    return getObjectViewSafeMetadata({
      cache: metadataCache,
      objectViewId: activeCustomObjectView.id,
      formFactor: activeFormFactor,
      principal,
    });
  }, [activeCustomObjectView, activeFormFactor, metadataCache, principal]);
  useEffect(() => {
    if (!activeCustomObjectView) return;
    const safe = buildObjectViewSafeMetadata({
      view: activeCustomObjectView,
      config: editorShellConfig,
      principal,
    });
    setMetadataCache((current) =>
      cacheObjectViewSafeMetadata({ cache: current, metadata: safe }),
    );
  }, [activeCustomObjectView, editorShellConfig, principal]);
  const previewObjectLabel = preview && !schemaOnlyPreview
    ? renderTemplate(editorShellConfig.title_template, preview.object, preview.summary)
    : selectedObject?.id.slice(0, 8) || 'Schema preview';
  const objectExplorerHref = selectedTypeId
    ? `/object-explorer?object_type_id=${encodeURIComponent(selectedTypeId)}${selectedObjectId ? `&object_id=${encodeURIComponent(selectedObjectId)}` : ''}`
    : '/object-explorer';
  const panelRuntimeConfig = useMemo(
    () =>
      selectedType
        ? buildPanelObjectViewRuntimeConfig({
            objectType: selectedType,
            config: editorShellConfig,
            object: preview && !schemaOnlyPreview ? preview.object : null,
            summary: preview?.summary,
            objectId: selectedObjectId || undefined,
            host: 'object_explorer',
          })
        : null,
    [editorShellConfig, preview, schemaOnlyPreview, selectedObjectId, selectedType],
  );
  const panelEditorConfig = editorShellConfig.panel_config ?? null;
  const objectTitleBarLabel =
    activeFormFactor === 'panel' && panelRuntimeConfig?.show_title ? panelRuntimeConfig.title : previewObjectLabel;
  const generatedObjectViewUrls = useMemo(
    () =>
      selectedType
        ? buildObjectViewUrlVariants({
            objectType: selectedType,
            object: preview && !schemaOnlyPreview ? preview.object : selectedObject ?? null,
            objectId: selectedObjectId || undefined,
            mode: activeMode,
            formFactor: activeFormFactor,
            branchLabel: editorShellConfig.branch_label,
            tabId: activeObjectViewTab?.id ?? editorShellConfig.selected_tab_id,
            embedded: false,
            embedHost: 'object_views',
            preferPrimaryKey: true,
          })
        : null,
    [
      activeFormFactor,
      activeMode,
      activeObjectViewTab?.id,
      editorShellConfig.branch_label,
      editorShellConfig.selected_tab_id,
      preview,
      schemaOnlyPreview,
      selectedObject,
      selectedObjectId,
      selectedType,
    ],
  );
  const objectViewEmbeddingMatrix = useMemo(() => {
    if (!selectedType) return null;
    const draftView: ObjectViewDefinition = {
      id: `draft:${selectedType.id}:${activeFormFactor}`,
      name: `${selectedType.name || selectedType.id}_${activeFormFactor}_draft`,
      display_name: 'Current editor draft',
      object_type_id: selectedType.id,
      mode: 'configured',
      form_factor: activeFormFactor,
      config: editorShellConfig,
      branch_label: editorShellConfig.branch_label,
      published: false,
      status: 'draft',
    };
    return buildObjectViewApplicationEmbeddingMatrix({
      objectType: selectedType,
      object: preview && !schemaOnlyPreview ? preview.object : selectedObject ?? null,
      objectId: selectedObjectId || undefined,
      views: [...coreObjectViews, ...objectViews, draftView],
      mode: activeMode,
      formFactor: activeFormFactor,
      branchLabel: editorShellConfig.branch_label,
      tabId: activeObjectViewTab?.id ?? editorShellConfig.selected_tab_id,
    });
  }, [
    activeFormFactor,
    activeMode,
    activeObjectViewTab?.id,
    coreObjectViews,
    editorShellConfig,
    objectViews,
    preview,
    schemaOnlyPreview,
    selectedObject,
    selectedObjectId,
      selectedType,
    ]);
  const objectViewBranchAdapterState = useMemo(() => {
    if (!selectedType) return null;
    const draftView: ObjectViewDefinition = {
      id: objectViewModeResolution.custom_view?.id ?? `draft:${selectedType.id}:${activeFormFactor}`,
      name: objectViewModeResolution.custom_view?.name ?? `${selectedType.name || selectedType.id}_${activeFormFactor}_draft`,
      display_name: objectViewModeResolution.custom_view?.display_name ?? 'Current editor draft',
      object_type_id: selectedType.id,
      mode: 'configured',
      form_factor: activeFormFactor,
      config: editorShellConfig,
      branch_label: editorShellConfig.branch_label,
      published: false,
      status: 'draft',
      updated_at: editorShellConfig.last_saved_at,
    };
    return buildObjectViewGlobalBranchAdapterState({
      branchLabel: editorShellConfig.branch_label,
      objectViews: [...objectViews, draftView],
      mainObjectViews: objectViews.filter((view) => !view.branch_label || ['main', 'default'].includes(String(view.branch_label).toLowerCase())),
      objectTypes: [selectedType],
      propertiesByObjectType: { [selectedType.id]: properties },
      linkTypes,
      principal,
    });
  }, [
    activeFormFactor,
    editorShellConfig,
    linkTypes,
    objectViewModeResolution.custom_view,
    objectViews,
    principal,
    properties,
    selectedType,
  ]);
  const objectViewProposalIntegration = useMemo<OntologyGlobalBranchProposalIntegration | null>(() => {
    if (!selectedType || !objectViewBranchAdapterState || objectViewBranchAdapterState.branch_label === 'main') return null;
    const draftView: ObjectViewDefinition = {
      id: objectViewModeResolution.custom_view?.id ?? `draft:${selectedType.id}:${activeFormFactor}`,
      name: objectViewModeResolution.custom_view?.name ?? `${selectedType.name || selectedType.id}_${activeFormFactor}_draft`,
      display_name: objectViewModeResolution.custom_view?.display_name ?? 'Current editor draft',
      object_type_id: selectedType.id,
      mode: 'configured',
      form_factor: activeFormFactor,
      config: editorShellConfig,
      branch_label: editorShellConfig.branch_label,
      published: false,
      status: 'draft',
      updated_at: editorShellConfig.last_saved_at,
    };
    return buildOntologyBranchProposalIntegration({
      branchLabel: objectViewBranchAdapterState.branch_label,
      changes: [],
      objectTypes: [selectedType],
      linkTypes,
      objectViews: [...objectViews, draftView],
      mainObjectViews: objectViews.filter((view) => {
        const label = String(view.branch_label ?? view.config?.branch_label ?? 'main').toLowerCase();
        return label === 'main' || label === 'default';
      }),
      propertiesByObjectType: { [selectedType.id]: properties },
      principal,
    });
  }, [
    activeFormFactor,
    editorShellConfig,
    linkTypes,
    objectViewBranchAdapterState,
    objectViewModeResolution.custom_view,
    objectViews,
    principal,
    properties,
    selectedType,
  ]);
  const objectViewMarketplaceOutput = useMemo<ObjectViewMarketplacePackagingResult | null>(() => {
    if (!selectedType) return null;
    const draftView: ObjectViewDefinition = {
      id: objectViewModeResolution.custom_view?.id ?? `draft:${selectedType.id}:${activeFormFactor}`,
      name: objectViewModeResolution.custom_view?.name ?? `${selectedType.name || selectedType.id}_${activeFormFactor}_draft`,
      display_name: objectViewModeResolution.custom_view?.display_name ?? 'Current editor draft',
      object_type_id: selectedType.id,
      mode: 'configured',
      form_factor: activeFormFactor,
      config: editorShellConfig,
      branch_label: editorShellConfig.branch_label,
      published: false,
      status: 'draft',
      updated_at: editorShellConfig.last_saved_at,
    };
    const availableDataResourceIds = Array.from(new Set([
      selectedType.backing_dataset_id,
      selectedType.backing_dataset_rid,
      selectedType.backing_restricted_view_id,
      selectedType.restricted_view_id,
      ...(editorShellConfig.input_datasource_ids || []),
      ...(editorShellConfig.metadata?.input_datasource_ids || []),
    ].filter((value): value is string => typeof value === 'string' && value.length > 0)));
    return buildObjectViewMarketplaceOutput({
      objectView: draftView,
      objectType: selectedType,
      objectTypes,
      actionTypes: actions,
      selectedTabIds: marketplaceSelectedTabIds,
      availableDataResourceIds,
      sourceBranch: editorShellConfig.branch_label,
    });
  }, [
    actions,
    activeFormFactor,
    editorShellConfig,
    marketplaceSelectedTabIds,
    objectViewModeResolution.custom_view,
    objectTypes,
    selectedType,
  ]);
  const objectViewRebaseModel = useMemo(() => {
    if (!selectedType || !objectViewBranchAdapterState || objectViewBranchAdapterState.branch_label === 'main') return null;
    const draftView: ObjectViewDefinition = {
      id: objectViewModeResolution.custom_view?.id ?? `draft:${selectedType.id}:${activeFormFactor}`,
      name: objectViewModeResolution.custom_view?.name ?? `${selectedType.name || selectedType.id}_${activeFormFactor}_draft`,
      display_name: objectViewModeResolution.custom_view?.display_name ?? 'Current editor draft',
      object_type_id: selectedType.id,
      mode: 'configured',
      form_factor: activeFormFactor,
      config: editorShellConfig,
      branch_label: editorShellConfig.branch_label,
      published: false,
      status: 'draft',
      updated_at: editorShellConfig.last_saved_at,
    };
    const mainObjectViews = objectViews.filter((view) => {
      const label = String(view.branch_label ?? view.config?.branch_label ?? 'main').toLowerCase();
      return label === 'main' || label === 'default';
    });
    const branchObjectViews = [
      ...objectViews.filter((view) => {
        const label = String(view.branch_label ?? view.config?.branch_label ?? '').toLowerCase();
        return label === objectViewBranchAdapterState.branch_label.toLowerCase();
      }),
      draftView,
    ];
    return buildObjectViewGlobalBranchRebaseModel({
      branchLabel: objectViewBranchAdapterState.branch_label,
      mainObjectViews,
      branchObjectViews,
      objectTypes: [selectedType],
      propertiesByObjectType: { [selectedType.id]: properties },
      linkTypes,
      principal,
      resolutions: objectViewRebaseResolutions,
    });
  }, [
    activeFormFactor,
    editorShellConfig,
    linkTypes,
    objectViewBranchAdapterState,
    objectViewModeResolution.custom_view,
    objectViewRebaseResolutions,
    objectViews,
    principal,
    properties,
    selectedType,
  ]);
  const objectCommentThread = useMemo(() => {
    if (!selectedType) return null;
    const object = preview && !schemaOnlyPreview ? preview.object : selectedObject ?? null;
    const objectId = object?.id || selectedObjectId || requestedUrlState.object_id || '';
    if (!objectId) return null;
    const key = objectCommentThreadKey(selectedType.id, objectId, 'object_view');
    const existing = commentThreads[key];
    return buildObjectCommentThread({
      objectType: selectedType,
      object,
      objectId,
      comments: existing?.comments,
      activity: existing?.activity,
      notifications: existing?.notifications,
      principal,
      accessPolicy: runtimePreviewAccess,
      commentsEnabled: editorShellConfig.comments_enabled,
      surface: 'object_view',
    });
  }, [
    commentThreads,
    editorShellConfig.comments_enabled,
    preview,
    principal,
    requestedUrlState.object_id,
    runtimePreviewAccess,
    schemaOnlyPreview,
    selectedObject,
    selectedObjectId,
    selectedType,
  ]);

  function storeObjectCommentThread(thread: ObjectCommentThread) {
    setCommentThreads((current) => ({ ...current, [thread.id]: thread }));
  }

  useEffect(() => {
    if (objectViewModeResolution.selected_mode !== activeMode) {
      setActiveMode(objectViewModeResolution.selected_mode);
    }
  }, [activeMode, objectViewModeResolution.selected_mode]);

  useEffect(() => {
    if (!selectedType) return;
    setConfig((current) => {
      if (activeMode === 'standard') {
        return objectViewModeResolution.core_view?.config
          ? normalizeConfig(objectViewModeResolution.core_view.config, activeFormFactor)
          : current;
      }
      if (current.mode === 'configured' && current.form_factor === activeFormFactor && current.default_sync?.state === 'manual') {
        return current;
      }
      return normalizeConfig(
        objectViewModeResolution.custom_view?.config ??
          buildDefaultCustomObjectViewConfig({
            objectType: selectedType,
            properties,
            linkTypes,
            formFactor: activeFormFactor,
          }),
        activeFormFactor,
      );
    });
  }, [activeFormFactor, activeMode, linkTypes, objectViewModeResolution.core_view, objectViewModeResolution.custom_view, properties, selectedType]);

  useEffect(() => {
    if (!selectedType) return;
    if (!requestedUrlState.branch_label && !requestedUrlState.tab_id) return;
    setConfig((current) => {
      let next = current;
      if (requestedUrlState.branch_label && current.branch_label !== requestedUrlState.branch_label) {
        next = { ...next, branch_label: requestedUrlState.branch_label };
      }
      if (requestedUrlState.tab_id && next.tabs?.some((tab) => tab.id === requestedUrlState.tab_id)) {
        const tab = next.tabs.find((entry) => entry.id === requestedUrlState.tab_id);
        if (next.selected_tab_id !== requestedUrlState.tab_id || next.workshop_module_version !== tab?.module.version) {
          next = {
            ...next,
            selected_tab_id: requestedUrlState.tab_id,
            workshop_module_version: tab?.module.version ?? next.workshop_module_version,
          };
        }
      }
      return next;
    });
  }, [requestedUrlState.branch_label, requestedUrlState.tab_id, selectedType]);

  const summaryEntries = useMemo(() => {
    if (!preview) return [];
    const configuredProperties =
      activeFormFactor === 'full'
        ? editorShellConfig.prominent_properties
        : panelRuntimeConfig?.property_names.length
        ? panelRuntimeConfig.property_names
        : editorShellConfig.panel_properties;
    return Object.entries(preview.summary)
      .filter(([key]) =>
        activeMode === 'standard' || configuredProperties.length === 0 ? true : configuredProperties.includes(key),
      )
      .slice(0, activeFormFactor === 'full' ? 8 : 4);
  }, [preview, activeMode, activeFormFactor, editorShellConfig, panelRuntimeConfig]);

  async function saveObjectView(body: CreateObjectViewBody) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const targetType = objectTypes.find((entry) => entry.id === body.object_type_id);
      const permission = targetType
        ? buildObjectViewEditPermissionDecision({
            objectType: targetType,
            config: body.config,
            principal,
          })
        : null;
      if (!permission?.allowed) {
        throw new Error(permission?.reason || 'Object View edit permission is required.');
      }
      const created = await createObjectView(body);
      const nextFormFactor = created.form_factor ?? body.form_factor ?? 'full';
      const nextMode = created.mode ?? body.mode ?? 'configured';
      setSelectedTypeId(created.object_type_id);
      setActiveFormFactor(nextFormFactor);
      setActiveMode(nextMode);
      setConfig(normalizeConfig(created.config ?? body.config, nextFormFactor));
      setNotice(`Saved object view version "${created.display_name ?? created.name}".`);
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

  async function saveVersion(published?: boolean) {
    if (!selectedTypeId || activeMode === 'standard') return;
    if (!objectViewEditPermission?.allowed) {
      setError(objectViewEditPermission?.reason || 'Object View edit permission is required.');
      return;
    }
    const nextConfig = configForSave(published);
    const latest = objectViewVersionHistory(nextConfig)[0];
    const shouldPublish = latest?.published ?? nextConfig.auto_publish;
    const displayName = `${selectedType?.display_name ?? 'Object'} ${activeFormFactor} v${nextConfig.object_view_version ?? 1}`;
    const description = latest?.change_summary || versionDescription.trim() || `${activeFormFactor} version`;
    try {
      await saveObjectView({
        name: slugify(`${displayName} ${Date.now()}`),
        display_name: displayName,
        description,
        object_type_id: selectedTypeId,
        mode: 'configured',
        form_factor: activeFormFactor,
        branch_label: nextConfig.branch_label,
        published: shouldPublish,
        config: nextConfig,
      });
      setVersionDescription('');
    } catch {
      // saveObjectView surfaces the error in-page.
    }
  }

  async function saveDraftVersion() {
    await saveVersion(false);
  }

  async function publishVersion() {
    await saveVersion(true);
  }

  function loadObjectView(view: ObjectViewDefinition) {
    const nextFormFactor = view.form_factor ?? 'full';
    setActiveFormFactor(nextFormFactor);
    setActiveMode(view.mode ?? 'configured');
    setConfig(normalizeConfig(view.config, nextFormFactor));
    setActiveEditorTab('editor');
    setNotice(`Loaded "${view.display_name ?? view.name}" into the editor.`);
  }

  function finishObjectViewRebase() {
    if (!objectViewBranchAdapterState || !objectViewRebaseModel) return;
    const result = completeObjectViewGlobalBranchRebase({
      state: objectViewBranchAdapterState,
      rebaseModel: objectViewRebaseModel,
    });
    if (result.errors.length > 0) {
      setError(result.errors[0]);
      return;
    }
    setConfig((current) => ({
      ...current,
      metadata: {
        ...current.metadata,
        branch_rebased_at: new Date().toISOString(),
        branch_rebased_ontology_signature: result.state.latest_ontology_signature,
      },
    }));
    setObjectViewRebaseResolutions({});
    setNotice(`Object View rebase completed. ${result.state.checks.length} deployability checks rerun.`);
  }

  function restoreVersion(version: number) {
    if (!selectedType) return;
    if (!objectViewEditPermission?.allowed) {
      setError(objectViewEditPermission?.reason || 'Object View edit permission is required.');
      return;
    }
    setConfig((current) =>
      restoreObjectViewConfigVersion({
        objectType: selectedType,
        config: editorShellConfigFor(current),
        version,
        author: user?.email || user?.id || 'platform-ui',
      }),
    );
    setActiveMode('configured');
    setActiveEditorTab('editor');
    setNotice(`Restored version ${version} as an editable draft. Save it to create a new version.`);
  }

  function toggleSection(kind: ObjectViewSectionKind) {
    editConfig((current) => {
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
    editConfig((current) => {
      const base =
        list === 'panel_properties' && selectedType
          ? ensurePanelObjectViewConfiguration({ objectType: selectedType, config: current })
          : current;
      const exists = base[list].includes(name);
      const nextList = exists ? base[list].filter((property) => property !== name) : [...base[list], name];
      return {
        ...base,
        [list]: nextList,
        panel_config:
          list === 'panel_properties' && base.panel_config
            ? {
                ...base.panel_config,
                property_names: nextList,
              }
            : base.panel_config,
      };
    });
  }

  if (embeddedMode) {
    return (
      <section className="of-page" data-object-view-embedded="true" style={{ display: 'grid', gap: 12, padding: 16 }}>
        {error ? (
          <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
            {error}
          </div>
        ) : null}
        <section className="of-panel" style={{ display: 'grid', gap: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <p className="of-eyebrow" style={{ margin: 0 }}>
                {selectedType?.display_name ?? 'Object View'} / {activeFormFactor}
              </p>
              <h1 className="of-heading-lg" style={{ marginTop: 4 }}>
                {objectTitleBarLabel}
              </h1>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
              <span className="of-chip">{activeMode === 'configured' ? 'Custom' : 'Core'}</span>
              {editorShellConfig.branch_label ? <span className="of-chip">Branch {editorShellConfig.branch_label}</span> : null}
              {activeObjectViewTab ? <span className="of-chip">Tab {activeObjectViewTab.title}</span> : null}
              <span className="of-chip of-status-success">Embedded</span>
              <button
                type="button"
                className="of-button"
                disabled={!objectCommentThread?.permissions.can_view}
                onClick={() => setCommentsOpen((open) => !open)}
              >
                Comments
              </button>
            </div>
          </div>

          {commentsOpen ? (
            <ObjectCommentsHelper
              thread={objectCommentThread}
              principal={principal}
              authorDisplayName={user?.email || user?.id || 'viewer'}
              onThreadChange={storeObjectCommentThread}
              onClose={() => setCommentsOpen(false)}
            />
          ) : null}

          {previewLoading || loading ? (
            <p className="of-text-muted" style={{ margin: 0, fontSize: 13 }}>
              Loading Object View...
            </p>
          ) : preview ? (
            <>
              {schemaOnlyPreview && runtimePreviewAccess ? (
                <div className="of-status-warning" style={{ padding: '9px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                  {runtimePreviewAccess.reason}
                </div>
              ) : null}
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                {schemaOnlyPreview
                  ? objectViewVisibleProperties(properties).slice(0, activeFormFactor === 'full' ? 8 : 4).map((property) => (
                      <div key={property.id} className="of-panel-muted" style={{ padding: 10, fontSize: 13 }}>
                        <strong>{property.display_name || property.name}</strong>
                        <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                          {property.property_type} / value restricted
                        </p>
                      </div>
                    ))
                  : summaryEntries.map(([key, value]) => (
                      <div key={key} className="of-panel-muted" style={{ padding: 10, fontSize: 13 }}>
                        <strong>{key}</strong>: {formatUnknown(value)}
                      </div>
                    ))}
              </div>
              {activeFormFactor === 'full' && runtimeObjectViewTabs.length > 0 ? (
                <div className="of-tabbar" style={{ marginTop: 4 }}>
                  {runtimeObjectViewTabs.map((tab) => (
                    <span key={tab.id} className={`of-tab ${tab.id === activeObjectViewTab?.id ? 'of-tab-active' : ''}`}>
                      {tab.runtime_title_visible ? tab.title : activeObjectViewTab?.title ?? tab.title}
                    </span>
                  ))}
                </div>
              ) : null}
              {!schemaOnlyPreview && preview.applicable_actions.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {preview.applicable_actions.slice(0, 6).map((action) => (
                    <span key={action.id} className="of-chip">{action.display_name}</span>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="of-text-muted" style={{ margin: 0, fontSize: 13 }}>
              No object is selected for this embedded Object View.
            </p>
          )}
        </section>
      </section>
    );
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
          disabled={objectTypes.length === 0 || busy || !canEditObjectView}
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
        currentConfig={editorShellConfig}
        getDefaultConfig={defaultConfigForType}
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
          <span className="of-chip">Object views {objectViewsTotal + coreObjectViews.length}</span>
          <span className="of-chip">Object types {objectTypes.length}</span>
          <span className="of-chip">Properties {properties.length}</span>
          <span className="of-chip">Actions {actions.length}</span>
          <span className="of-chip">
            {objectViewModeResolution.selected_mode === 'configured' ? 'Custom Object View' : 'Core Object View'}
          </span>
          {objectViewModeResolution.custom_is_default ? <span className="of-chip of-status-success">Custom default</span> : null}
          {activeMode === 'configured' && editorShellConfig.default_sync?.state === 'synced' ? (
            <span className="of-chip of-status-success">Default custom synced</span>
          ) : null}
          {activeMode === 'configured' && editorShellConfig.default_sync?.state === 'manual' ? (
            <span className="of-chip of-status-warning">User managed</span>
          ) : null}
          {schemaOnlyPreview && selectedTypeAccess ? <span className="of-chip of-status-warning">Schema only</span> : null}
          {objectViewEditPermission ? (
            <span className={`of-chip ${objectViewEditPermission.allowed ? 'of-status-success' : 'of-status-warning'}`}>
              {objectViewEditPermission.allowed ? 'Edit allowed' : 'Edit blocked'}
            </span>
          ) : null}
          {publishedVersion ? <span className="of-chip of-status-success">Published {publishedVersion.display_name ?? publishedVersion.name}</span> : null}
        </div>

        {schemaOnlyPreview && runtimePreviewAccess ? (
          <div className="of-status-warning" style={{ padding: '9px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
            {runtimePreviewAccess.reason}
          </div>
        ) : null}

        {activeMode === 'configured' && objectViewEditPermission && !objectViewEditPermission.allowed ? (
          <div className="of-status-warning" style={{ padding: '9px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
            {objectViewEditPermission.reason}
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {objectViewEditPermission.requirements.filter((requirement) => !requirement.allowed).map((requirement) => (
                <li key={requirement.id}>{requirement.label}</li>
              ))}
            </ul>
          </div>
        ) : null}

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
              disabled={schemaOnlyPreview}
              style={{ marginLeft: 6, width: 'auto', minWidth: 160 }}
            >
              {schemaOnlyPreview ? <option value="">Schema only</option> : null}
              {objects.map((object) => (
                <option key={object.id} value={object.id}>
                  {object.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            Host:
            <select
              value={activeHost}
              onChange={(event) => setActiveHost(event.target.value as ObjectViewToggleHost)}
              className="of-input"
              style={{ marginLeft: 6, width: 'auto' }}
            >
              {OBJECT_VIEW_HOST_OPTIONS.map((host) => (
                <option key={host.id} value={host.id}>
                  {host.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            Object View:
            <select
              value={objectViewModeResolution.selected_mode}
              onChange={(event) => setActiveMode(event.target.value as ObjectViewMode)}
              className="of-input"
              disabled={!objectViewModeResolution.supports_toggle}
              style={{ marginLeft: 6, width: 'auto' }}
            >
              {objectViewModeResolution.options.map((option) => (
                <option key={option.mode} value={option.mode} disabled={!option.enabled}>
                  {option.label}{option.default ? ' default' : ''}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            Form factor:
            <select
              value={activeFormFactor}
              onChange={(event) => {
                const next = event.target.value as ObjectViewFormFactor;
                setActiveFormFactor(next);
                setConfig(defaultConfigForType(selectedTypeId, next));
              }}
              className="of-input"
              style={{ marginLeft: 6, width: 'auto' }}
            >
              <option value="full">Full page</option>
              <option value="panel">Side panel</option>
            </select>
          </label>
        </div>
        {objectViewModeResolution.limitation ? (
          <div className="of-status-warning" style={{ padding: '9px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
            {objectViewModeResolution.limitation}
          </div>
        ) : null}
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
        <>
          <section className="of-panel" style={{ display: 'grid', gap: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <p className="of-eyebrow" style={{ margin: 0 }}>
                  OpenFoundry ontology / {selectedType?.display_name ?? 'Object type'} / {activeFormFactor}
                </p>
                <h2 className="of-heading-md" style={{ marginTop: 4 }}>
                  Object View editor
                </h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  <span className="of-chip">Object View v{editorShellConfig.object_view_version ?? 1}</span>
                  <span className="of-chip">Workshop module v{activeWorkshopModule?.version ?? editorShellConfig.workshop_module_version ?? 1}</span>
                  <span className="of-chip">Preview {previewObjectLabel}</span>
                  <span className="of-chip">{objectViewModeResolution.supports_toggle ? 'Core/custom toggle' : 'Default only'}</span>
                  <span
                    className={`of-chip ${
                      !runtimeBudgetEvaluation.enabled
                        ? ''
                        : runtimeBudgetEvaluation.exceeded
                        ? 'of-status-warning'
                        : 'of-status-success'
                    }`}
                    title={
                      runtimeBudgetEvaluation.enabled
                        ? `Queries ${runtimeUsage.queries} / Linked ${runtimeUsage.linked_object_loads} / Media ${runtimeUsage.media_loads} / Maps ${runtimeUsage.map_loads} / Time-series ${runtimeUsage.time_series_loads} / Widgets ${runtimeUsage.workshop_widget_executions} / Functions ${runtimeUsage.function_backed_display_values}`
                        : 'Runtime performance budgets are disabled'
                    }
                  >
                    {runtimeBudgetEvaluation.enabled
                      ? runtimeBudgetEvaluation.exceeded
                        ? `Budgets exceeded (${runtimeBudgetEvaluation.warnings.length})`
                        : 'Within budgets'
                      : 'Budgets disabled'}
                  </span>
                  {cachedSafeMetadata ? (
                    <span
                      className="of-chip"
                      title="Safe metadata is cached in this session for the current permission context only. Object data is not cached."
                    >
                      Metadata cached
                    </span>
                  ) : null}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>
                  Form factor
                  <select
                    value={activeFormFactor}
                    onChange={(event) => {
                      const next = event.target.value as ObjectViewFormFactor;
                      setActiveFormFactor(next);
                      setConfig(defaultConfigForType(selectedTypeId, next));
                    }}
                    className="of-input"
                    style={{ marginLeft: 6, width: 'auto' }}
                  >
                    <option value="full">Full page</option>
                    <option value="panel">Side panel</option>
                  </select>
                </label>
                <label style={{ fontSize: 12, fontWeight: 600 }}>
                  Preview object
                  <select
                    value={selectedObjectId}
                    onChange={(event) => setSelectedObjectId(event.target.value)}
                    className="of-input"
                    disabled={schemaOnlyPreview}
                    style={{ marginLeft: 6, width: 'auto', minWidth: 150 }}
                  >
                    {schemaOnlyPreview ? <option value="">Schema only</option> : null}
                    {objects.map((object) => (
                      <option key={object.id} value={object.id}>
                        {object.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>
                {editorShellConfig.auto_publish ? (
                  <button
                    type="button"
                    onClick={() => void saveVersion()}
                    className="of-button of-button--primary"
                    disabled={!selectedTypeId || activeMode === 'standard' || busy || !canEditObjectView}
                  >
                    {busy ? 'Saving...' : 'Save and publish'}
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => void saveDraftVersion()} className="of-button" disabled={!selectedTypeId || activeMode === 'standard' || busy || !canEditObjectView}>
                      {busy ? 'Saving...' : 'Save draft'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void publishVersion()}
                      className="of-button of-button--primary"
                      disabled={!selectedTypeId || activeMode === 'standard' || busy || !canEditObjectView}
                    >
                      {busy ? 'Publishing...' : 'Publish'}
                    </button>
                  </>
                )}
                <a className="of-button" href={objectExplorerHref}>
                  Open in Object Explorer
                </a>
                <button
                  type="button"
                  className="of-button"
                  disabled={!objectCommentThread?.permissions.can_view}
                  onClick={() => setCommentsOpen((open) => !open)}
                >
                  Comments
                </button>
              </div>
            </div>
          </section>

          <section className="of-panel" style={{ display: 'grid', gap: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <p className="of-eyebrow" style={{ margin: 0 }}>
                  Runtime performance budgets
                </p>
                <h3 className="of-heading-sm" style={{ marginTop: 4 }}>
                  {runtimeBudgetEvaluation.enabled
                    ? runtimeBudgetEvaluation.exceeded
                      ? `${runtimeBudgetEvaluation.warnings.length} budget warning${
                          runtimeBudgetEvaluation.warnings.length === 1 ? '' : 's'
                        }`
                      : 'All tabs and panels within budget'
                    : 'Budgets disabled'}
                </h3>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={runtimeBudgets.enabled}
                  onChange={(event) =>
                    updateRuntimeBudgets((current) => ({ ...current, enabled: event.target.checked }))
                  }
                  disabled={!canEditObjectView}
                />
                Enforce runtime budgets
              </label>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span className="of-chip" title="Total backing queries observed for this render">
                Queries {runtimeUsage.queries}/{runtimeBudgets.per_render.max_queries}
              </span>
              <span className="of-chip" title="Linked object loads via neighbor traversal">
                Linked {runtimeUsage.linked_object_loads}/{runtimeBudgets.per_render.max_linked_object_loads}
              </span>
              <span className="of-chip" title="Media references rendered (images, attachments)">
                Media {runtimeUsage.media_loads}/{runtimeBudgets.per_render.max_media_loads}
              </span>
              <span className="of-chip" title="Map / geo property renders">
                Maps {runtimeUsage.map_loads}/{runtimeBudgets.per_render.max_map_loads}
              </span>
              <span className="of-chip" title="Time-series property renders">
                Time-series {runtimeUsage.time_series_loads}/{runtimeBudgets.per_render.max_time_series_loads}
              </span>
              <span className="of-chip" title="Workshop widget executions across tabs/panels">
                Widgets {runtimeUsage.workshop_widget_executions}/{runtimeBudgets.per_render.max_workshop_widget_executions}
              </span>
              <span className="of-chip" title="Function-backed display value evaluations">
                Functions {runtimeUsage.function_backed_display_values}/{runtimeBudgets.per_render.max_function_backed_display_values}
              </span>
            </div>
            {runtimeBudgetEvaluation.enabled && runtimeBudgetEvaluation.warnings.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, display: 'grid', gap: 4 }}>
                {runtimeBudgetEvaluation.warnings.slice(0, 8).map((warning, index) => (
                  <li
                    key={`${warning.scope}:${warning.scope_id ?? 'render'}:${warning.metric}:${index}`}
                    className="of-status-warning"
                    style={{ padding: '6px 8px', borderRadius: 'var(--radius-sm)' }}
                  >
                    {warning.message}
                  </li>
                ))}
                {runtimeBudgetEvaluation.warnings.length > 8 ? (
                  <li className="of-text-muted" style={{ padding: '4px 0' }}>
                    +{runtimeBudgetEvaluation.warnings.length - 8} more warnings
                  </li>
                ) : null}
              </ul>
            ) : null}
            {canEditObjectView ? (
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Configure budgets</summary>
                <div
                  style={{
                    display: 'grid',
                    gap: 8,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    marginTop: 10,
                  }}
                >
                  {(
                    [
                      ['max_queries', 'Max queries / render'],
                      ['max_linked_object_loads', 'Max linked object loads'],
                      ['max_media_loads', 'Max media loads'],
                      ['max_map_loads', 'Max map loads'],
                      ['max_time_series_loads', 'Max time-series loads'],
                      ['max_workshop_widget_executions', 'Max Workshop widget executions'],
                      ['max_function_backed_display_values', 'Max function-backed display values'],
                    ] as Array<[keyof ObjectViewRuntimeBudgetLimits, string]>
                  ).map(([key, label]) => (
                    <label key={key} style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                      {label}
                      <input
                        type="number"
                        min={0}
                        className="of-input"
                        value={runtimeBudgets.per_render[key]}
                        onChange={(event) =>
                          updateRuntimeBudgetLimit('per_render', key, Number(event.target.value))
                        }
                        disabled={!runtimeBudgets.enabled}
                      />
                    </label>
                  ))}
                </div>
              </details>
            ) : null}
          </section>

          <section className="of-panel" style={{ display: 'grid', gap: 10, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <p className="of-eyebrow" style={{ margin: 0 }}>
                  {selectedType?.display_name ?? 'Object'} title bar
                </p>
                <h2 className="of-heading-md" style={{ marginTop: 4 }}>
                  {objectTitleBarLabel}
                </h2>
              </div>
              {activeFormFactor === 'full' ? (
                <button type="button" className="of-button" onClick={() => setManageTabsOpen((open) => !open)}>
                  Manage tabs
                </button>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                  <span className={`of-chip ${panelRuntimeConfig?.embed_supported ? 'of-status-success' : 'of-status-warning'}`}>
                    {panelRuntimeConfig?.embed_supported ? 'Panel host ready' : 'Panel host disabled'}
                  </span>
                  {panelRuntimeConfig?.show_open_full_view ? (
                    <a className="of-button" href={panelRuntimeConfig.open_full_view_href}>
                      Open full view
                    </a>
                  ) : null}
                </div>
              )}
            </div>
            {activeFormFactor === 'full' ? (
              <div className="of-tabbar" style={{ marginTop: 0 }}>
                {editorTabs.map((tab) => {
                  const tabWarnings = runtimeBudgetWarningsByTab.get(tab.id) ?? [];
                  const overBudget = tabWarnings.length > 0;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={`of-tab ${tab.id === activeObjectViewTab?.id ? 'of-tab-active' : ''}`}
                      onClick={() =>
                        setEditorShellConfig((current) => ({
                          ...current,
                          selected_tab_id: tab.id,
                          workshop_module_version: tab.module.version,
                        }))
                      }
                      title={
                        overBudget
                          ? tabWarnings.map((warning) => warning.message).join('\n')
                          : undefined
                      }
                    >
                      {tab.title}
                      {overBudget ? (
                        <span
                          aria-label={`${tabWarnings.length} budget warning${tabWarnings.length === 1 ? '' : 's'}`}
                          className="of-chip of-status-warning"
                          style={{ marginLeft: 6, padding: '0 6px', fontSize: 10 }}
                        >
                          !{tabWarnings.length}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {manageTabsOpen && activeFormFactor === 'full' ? (
              <div className="of-panel-muted" style={{ display: 'grid', gap: 10, padding: 12 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                    New tab
                    <input value={newTabTitle} onChange={(event) => setNewTabTitle(event.target.value)} className="of-input" />
                  </label>
                  <button type="button" className="of-button" onClick={addFullObjectViewTab} disabled={!selectedType}>
                    Add tab
                  </button>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {editorTabs.map((tab, index) => (
                    <div key={tab.id} className="of-panel" style={{ display: 'grid', gap: 10, padding: 10 }}>
                      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                          Tab title
                          <input
                            value={tab.title}
                            onChange={(event) => renameFullObjectViewTab(tab.id, event.target.value)}
                            className="of-input"
                          />
                        </label>
                        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                          Visibility
                          <select
                            value={tab.visibility}
                            onChange={(event) =>
                              setFullObjectViewTabVisibility(tab.id, event.target.value as ObjectViewTabVisibility)
                            }
                            className="of-input"
                          >
                            <option value="visible">Visible</option>
                            <option value="hidden">Hidden</option>
                            <option value="conditional">Conditional</option>
                          </select>
                        </label>
                        <label
                          className="of-panel-muted"
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, fontSize: 12, fontWeight: 600 }}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(tab.hidden_in_runtime_when_single)}
                            onChange={(event) =>
                              setFullObjectViewTabVisibility(tab.id, tab.visibility, event.target.checked)
                            }
                          />
                          Hide single runtime tab title
                        </label>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          <span className="of-chip">Order {tab.order + 1}</span>
                          <span className="of-chip">Module v{tab.module.version}</span>
                          <span className="of-chip">{tab.module.object_context_parameter}</span>
                          {tab.id === activeObjectViewTab?.id ? <span className="of-chip of-status-success">Editing</span> : null}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          <button
                            type="button"
                            className="of-button"
                            onClick={() => moveFullObjectViewTab(tab.id, 'up')}
                            disabled={index === 0}
                            style={{ fontSize: 12 }}
                          >
                            Up
                          </button>
                          <button
                            type="button"
                            className="of-button"
                            onClick={() => moveFullObjectViewTab(tab.id, 'down')}
                            disabled={index === editorTabs.length - 1}
                            style={{ fontSize: 12 }}
                          >
                            Down
                          </button>
                          <button
                            type="button"
                            className="of-button"
                            onClick={() =>
                              setEditorShellConfig((current) => ({
                                ...current,
                                selected_tab_id: tab.id,
                                workshop_module_version: tab.module.version,
                              }))
                            }
                            style={{ fontSize: 12 }}
                          >
                            Select
                          </button>
                          <button
                            type="button"
                            className="of-button"
                            onClick={() => deleteFullObjectViewTab(tab.id)}
                            disabled={editorTabs.length <= 1}
                            style={{ fontSize: 12 }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {commentsOpen ? (
            <ObjectCommentsHelper
              thread={objectCommentThread}
              principal={principal}
              authorDisplayName={user?.email || user?.id || 'platform-ui'}
              onThreadChange={storeObjectCommentThread}
              onClose={() => setCommentsOpen(false)}
            />
          ) : null}

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))' }}>
            {activeFormFactor === 'panel' && panelEditorConfig && panelRuntimeConfig ? (
              <section className="of-panel" style={{ padding: 16 }}>
                <p className="of-eyebrow">Panel configuration</p>
                <div style={{ display: 'grid', gap: 10, marginTop: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                    Panel title
                    <input
                      value={panelEditorConfig.title_template}
                      onChange={(event) =>
                        updatePanelConfiguration((panel) => ({
                          ...panel,
                          title_template: event.target.value,
                        }))
                      }
                      className="of-input"
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                    Density
                    <select
                      value={panelEditorConfig.density}
                      onChange={(event) =>
                        updatePanelConfiguration((panel) => ({
                          ...panel,
                          density: event.target.value === 'comfortable' ? 'comfortable' : 'compact',
                        }))
                      }
                      className="of-input"
                    >
                      <option value="compact">Compact</option>
                      <option value="comfortable">Comfortable</option>
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                    Max properties
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={panelEditorConfig.max_properties}
                      onChange={(event) =>
                        updatePanelConfiguration((panel) => {
                          const maxProperties = Math.max(1, Math.min(12, Number(event.target.value) || 1));
                          return {
                            ...panel,
                            max_properties: maxProperties,
                            property_names: panel.property_names.slice(0, maxProperties),
                          };
                        })
                      }
                      className="of-input"
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                    Link groups
                    <input
                      type="number"
                      min={0}
                      max={8}
                      value={panelEditorConfig.max_link_groups}
                      onChange={(event) =>
                        updatePanelConfiguration((panel) => ({
                          ...panel,
                          max_link_groups: Math.max(0, Math.min(8, Number(event.target.value) || 0)),
                        }))
                      }
                      className="of-input"
                    />
                  </label>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  <label className="of-panel-muted" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, fontSize: 12, fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={panelEditorConfig.show_title}
                      onChange={(event) =>
                        updatePanelConfiguration((panel) => ({
                          ...panel,
                          show_title: event.target.checked,
                        }))
                      }
                    />
                    Show title
                  </label>
                  <label className="of-panel-muted" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, fontSize: 12, fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={panelEditorConfig.show_open_full_view}
                      onChange={(event) =>
                        updatePanelConfiguration((panel) => ({
                          ...panel,
                          show_open_full_view: event.target.checked,
                        }))
                      }
                    />
                    Open full view
                  </label>
                  <label className="of-panel-muted" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, fontSize: 12, fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={panelEditorConfig.workshop_widget.enabled}
                      onChange={(event) =>
                        updatePanelConfiguration((panel) => ({
                          ...panel,
                          workshop_widget: {
                            ...panel.workshop_widget,
                            enabled: event.target.checked,
                          },
                        }))
                      }
                    />
                    Workshop widget
                  </label>
                </div>

                <p className="of-eyebrow" style={{ marginTop: 14 }}>
                  Embedding hosts
                </p>
                <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                  {panelEditorConfig.hosts.map((host) => (
                    <label
                      key={host.host}
                      className="of-panel-muted"
                      style={{ display: 'grid', gap: 8, gridTemplateColumns: 'auto 1fr', alignItems: 'center', padding: 10, fontSize: 12 }}
                    >
                      <input
                        type="checkbox"
                        checked={host.enabled}
                        onChange={(event) =>
                          updatePanelConfiguration((panel) => ({
                            ...panel,
                            hosts: panel.hosts.map((entry) =>
                              entry.host === host.host ? { ...entry, enabled: event.target.checked } : entry,
                            ),
                          }))
                        }
                      />
                      <span>
                        <strong>{panelHostLabel(host.host)}</strong>{' '}
                        <span className="of-text-muted">
                          {host.surface} · {host.selected_object_parameter}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>

                <div style={{ display: 'grid', gap: 10, marginTop: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                    Widget ID
                    <input
                      value={panelEditorConfig.workshop_widget.widget_id}
                      onChange={(event) =>
                        updatePanelConfiguration((panel) => ({
                          ...panel,
                          workshop_widget: {
                            ...panel.workshop_widget,
                            widget_id: event.target.value,
                          },
                        }))
                      }
                      className="of-input"
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                    Selected object parameter
                    <input
                      value={panelEditorConfig.workshop_widget.selected_object_parameter}
                      onChange={(event) =>
                        updatePanelConfiguration((panel) => ({
                          ...panel,
                          workshop_widget: {
                            ...panel.workshop_widget,
                            selected_object_parameter: event.target.value || 'selectedObject',
                          },
                        }))
                      }
                      className="of-input"
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                    Widget height
                    <input
                      type="number"
                      min={240}
                      max={900}
                      value={panelEditorConfig.workshop_widget.height_px}
                      onChange={(event) =>
                        updatePanelConfiguration((panel) => ({
                          ...panel,
                          workshop_widget: {
                            ...panel.workshop_widget,
                            height_px: Math.max(240, Math.min(900, Number(event.target.value) || 420)),
                          },
                        }))
                      }
                      className="of-input"
                    />
                  </label>
                </div>

                <p className="of-eyebrow" style={{ marginTop: 14 }}>
                  Runtime
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  <span className="of-chip">{panelRuntimeConfig.title}</span>
                  <span className="of-chip">{panelRuntimeConfig.density}</span>
                  <span className="of-chip">{panelRuntimeConfig.property_names.length} properties</span>
                  <span className="of-chip">{panelHostLabel(panelRuntimeConfig.host)}</span>
                </div>
                {panelRuntimeConfig.show_open_full_view ? (
                  <a className="of-button" href={panelRuntimeConfig.open_full_view_href} style={{ marginTop: 10 }}>
                    Open full view
                  </a>
                ) : null}
              </section>
            ) : null}

            <section className="of-panel" style={{ padding: 16 }}>
            <p className="of-eyebrow">Workshop module</p>
            {activeWorkshopModule ? (
              <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                    Module name
                    <input
                      value={activeWorkshopModule.display_name}
                      onChange={(event) =>
                        updateActiveObjectViewTab((tab) => ({
                          ...tab,
                          module: {
                            ...tab.module,
                            display_name: event.target.value,
                            source: 'user_managed',
                          },
                        }))
                      }
                      className="of-input"
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                    Object context
                    <input
                      value={activeWorkshopModule.object_context_parameter}
                      onChange={(event) =>
                        updateActiveObjectViewTab((tab) => ({
                          ...tab,
                          module: {
                            ...tab.module,
                            object_context_parameter: event.target.value || 'selectedObject',
                            source: 'user_managed',
                          },
                        }))
                      }
                      className="of-input"
                    />
                  </label>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {activeWorkshopModule.widgets.map((widget) => (
                    <div key={widget.id} className="of-panel-muted" style={{ display: 'grid', gap: 6, padding: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <strong style={{ fontSize: 13 }}>{widget.title}</strong>
                        <span className="of-chip">{widget.kind}</span>
                      </div>
                      <input
                        value={widget.title}
                        onChange={(event) => updateActiveWorkshopWidget(widget.id, (current) => ({ ...current, title: event.target.value }))}
                        className="of-input"
                      />
                      <input
                        value={widget.binding}
                        onChange={(event) => updateActiveWorkshopWidget(widget.id, (current) => ({ ...current, binding: event.target.value }))}
                        className="of-input"
                      />
                    </div>
                  ))}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
                  Add widget
                  <select
                    className="of-input"
                    defaultValue=""
                    onChange={(event) => {
                      const kind = event.target.value as ObjectViewSectionKind;
                      if (kind) addWorkshopWidget(kind);
                      event.currentTarget.value = '';
                    }}
                    style={{ width: 'auto' }}
                  >
                    <option value="">Select</option>
                    {SECTION_KINDS.map((kind) => (
                      <option key={kind.id} value={kind.id}>
                        {kind.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <p className="of-text-muted" style={{ marginTop: 8, fontSize: 13 }}>
                No active module.
              </p>
            )}
            </section>
          <section className="of-panel" style={{ padding: 16 }}>
            <p className="of-eyebrow">Configure view</p>
            <label style={{ display: 'block', marginTop: 10, fontSize: 13 }}>
              Title template
              <input
                value={config.title_template}
                onChange={(event) => editConfig((current) => ({ ...current, title_template: event.target.value }))}
                className="of-input"
                style={{ marginTop: 4 }}
              />
            </label>
            <label style={{ display: 'block', marginTop: 8, fontSize: 13 }}>
              Subtitle property
              <select
                value={config.subtitle_property}
                onChange={(event) => editConfig((current) => ({ ...current, subtitle_property: event.target.value }))}
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
                const active = (panelEditorConfig?.property_names ?? config.panel_properties).includes(property.name);
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
                      editConfig((current) => ({
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
                onChange={(event) => editConfig((current) => ({ ...current, comments_enabled: event.target.checked }))}
              />
              Enable comments
            </label>
            {schemaOnlyPreview && config.comments_enabled ? (
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Runtime comments are hidden in schema-only previews.
              </p>
            ) : null}

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={config.auto_publish}
                onChange={(event) => editConfig((current) => ({ ...current, auto_publish: event.target.checked }))}
              />
              Auto publish when saved
            </label>

            <label style={{ display: 'block', marginTop: 8, fontSize: 13 }}>
              Branch label
              <input
                value={config.branch_label}
                onChange={(event) => editConfig((current) => ({ ...current, branch_label: event.target.value }))}
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
                  {schemaOnlyPreview
                    ? `${selectedType?.display_name || selectedType?.name || 'Object'} schema`
                    : renderTemplate(config.title_template, preview.object, preview.summary)}
                </h3>
                <p className="of-text-muted" style={{ marginTop: 4, fontSize: 13 }}>
                  {schemaOnlyPreview
                    ? selectedTypeAccess?.reason
                    : config.subtitle_property
                    ? formatUnknown(preview.summary[config.subtitle_property] ?? preview.object.properties[config.subtitle_property])
                    : `Type: ${objectTypeLabel(objectTypes, preview.object.object_type_id)}`}
                </p>
                <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                  {schemaOnlyPreview ? (
                    objectViewVisibleProperties(properties).slice(0, activeFormFactor === 'full' ? 8 : 4).map((property) => (
                      <div key={property.id} className="of-panel-muted" style={{ padding: 10, fontSize: 13 }}>
                        <strong>{property.display_name || property.name}</strong>: <span className="of-text-muted">{property.property_type} · value restricted</span>
                      </div>
                    ))
                  ) : (
                    summaryEntries.map(([key, value]) => (
                      <div key={key} className="of-panel-muted" style={{ padding: 10, fontSize: 13 }}>
                        <strong>{key}</strong>: {formatUnknown(value)}
                      </div>
                    ))
                  )}
                  {(schemaOnlyPreview ? properties.length === 0 : summaryEntries.length === 0) ? (
                    <p className="of-text-muted" style={{ margin: 0, fontSize: 13 }}>
                      {schemaOnlyPreview ? 'No schema properties returned.' : 'No summary properties selected for this form factor.'}
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
                  ).filter((kind) => !schemaOnlyPreview || !['links', 'timeline', 'comments', 'graph'].includes(kind)).map((kind) => (
                    <li key={kind}>{kind}</li>
                  ))}
                </ul>
                {activeFormFactor === 'full' ? (
                  <>
                    <p className="of-eyebrow" style={{ marginTop: 14 }}>
                      Runtime tabs
                    </p>
                    <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 13 }}>
                      {runtimeObjectViewTabs.map((tab) => (
                        <li key={tab.id}>
                          {tab.runtime_title_visible ? tab.title : `${tab.title} (title hidden in runtime)`}
                        </li>
                      ))}
                      {runtimeObjectViewTabs.length === 0 ? <li className="of-text-muted">No visible runtime tabs.</li> : null}
                    </ul>
                  </>
                ) : null}
                <p className="of-eyebrow" style={{ marginTop: 14 }}>
                  Applicable actions
                </p>
                <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 13 }}>
                  {!schemaOnlyPreview && preview.applicable_actions.map((action) => (
                    <li key={action.id}>
                      {action.display_name} ({action.operation_kind})
                    </li>
                  ))}
                  {schemaOnlyPreview ? <li className="of-text-muted">Hidden until object data is viewable.</li> : null}
                  {!schemaOnlyPreview && preview.applicable_actions.length === 0 ? <li className="of-text-muted">No applicable actions.</li> : null}
                </ul>
              </>
            ) : (
              <p className="of-text-muted">
                {selectedObject ? 'Select an object to preview.' : 'No objects returned for this type.'}
              </p>
            )}
          </section>
          </div>
        </>
      )}

      {activeEditorTab === 'versions' && (
        <section className="of-panel" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div>
              <p className="of-eyebrow">Version history ({activeFormFactor})</p>
              <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                Object View versions save tab edits and the active Workshop module together.
              </p>
            </div>
            <button type="button" onClick={() => setCreateModalOpen(true)} className="of-button" disabled={busy || !canEditObjectView}>
              + Object view
            </button>
          </div>

          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {currentVersionHistory.map((version) => (
              <div key={version.id} className="of-panel-muted" style={{ display: 'grid', gap: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <strong>Object View v{version.object_view_version}</strong>
                    <p className="of-text-muted" style={{ marginTop: 2, fontSize: 11 }}>
                      Module v{version.workshop_module_version} | {version.author} | {formatDate(version.timestamp)}
                    </p>
                    <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                      {version.change_summary}
                    </p>
                    {version.rollback_target_version ? (
                      <p className="of-text-muted" style={{ marginTop: 4, fontSize: 11 }}>
                        Rollback target: v{version.rollback_target_version}
                      </p>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                    {version.publish_state === 'published' ? <span className="of-chip of-status-success">Published</span> : null}
                    {version.publish_state === 'previously_published' ? <span className="of-chip">Previously published</span> : null}
                    {version.publish_state === 'draft' ? <span className="of-chip of-status-warning">Draft</span> : null}
                    <span className="of-chip">{version.tab_ids.length} tabs</span>
                    <button
                      type="button"
                      onClick={() => restoreVersion(version.object_view_version)}
                      className="of-button"
                      disabled={activeMode === 'standard' || !canEditObjectView}
                      style={{ fontSize: 12 }}
                    >
                      Restore draft
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {currentVersionHistory.length === 0 ? (
              <p className="of-text-muted" style={{ margin: 0, fontSize: 13 }}>
                No saved versions yet. Saving this configured Object View will create v{(editorShellConfig.object_view_version ?? 1) + 1}.
              </p>
            ) : null}
          </div>

          {currentPublishedVersion ? (
            <p className="of-text-muted" style={{ marginTop: 12, fontSize: 12 }}>
              Published version: <strong>v{currentPublishedVersion.object_view_version}</strong> ({formatDate(currentPublishedVersion.timestamp)})
            </p>
          ) : null}

          <p className="of-eyebrow" style={{ marginTop: 18 }}>
            Saved object views ({availableViews.length})
          </p>

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
                      {view.status === 'core' ? <span className="of-chip of-status-success">Core</span> : null}
                      {view.status === 'default_synced' ? <span className="of-chip of-status-success">Default custom</span> : null}
                      {view.config?.default_sync?.state === 'manual' ? <span className="of-chip of-status-warning">User managed</span> : null}
                      {isPublished(view) && view.status !== 'core' ? <span className="of-chip of-status-success">Published</span> : null}
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
          <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
            {editorShellConfig.auto_publish
              ? 'Automatic publishing is enabled; saving creates and publishes one joint Object View and Workshop module version.'
              : 'Automatic publishing is disabled; save a draft first or publish the current draft when ready.'}
          </p>
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
            onClick={() => void (editorShellConfig.auto_publish ? saveVersion() : publishVersion())}
            className="of-button of-button--primary"
            style={{ marginTop: 8 }}
            disabled={!selectedTypeId || activeMode === 'standard' || busy || !canEditObjectView}
          >
            {busy ? 'Publishing...' : editorShellConfig.auto_publish ? 'Save and publish current configuration' : 'Publish current configuration'}
          </button>
          {publishedVersion ? (
            <p className="of-text-muted" style={{ marginTop: 14, fontSize: 13 }}>
              Currently published: <strong>{publishedVersion.display_name ?? publishedVersion.name}</strong> (
              {formatDate(publishedVersion.created_at)})
            </p>
          ) : null}
          {currentPublishedVersion ? (
            <p className="of-text-muted" style={{ marginTop: 6, fontSize: 13 }}>
              Current config published version: <strong>v{currentPublishedVersion.object_view_version}</strong>
            </p>
          ) : null}
          <p className="of-eyebrow" style={{ marginTop: 14 }}>
            Generated URLs
          </p>
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            {[
              ['Primary key', generatedObjectViewUrls?.by_primary_key],
              ['Object ID', generatedObjectViewUrls?.by_object_id],
              ['Embedded primary key', generatedObjectViewUrls?.embedded_by_primary_key],
              ['Embedded object ID', generatedObjectViewUrls?.embedded_by_object_id],
            ].map(([label, href]) => (
              <div key={label} className="of-panel-muted" style={{ display: 'grid', gap: 4, padding: 10 }}>
                <span className="of-eyebrow" style={{ margin: 0 }}>{label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, wordBreak: 'break-all' }}>
                  {href || '-'}
                </span>
              </div>
            ))}
          </div>
          {generatedObjectViewUrls?.warnings.length ? (
            <p className="of-text-muted" style={{ marginTop: 8, fontSize: 12 }}>
              {generatedObjectViewUrls.warnings[0]}
            </p>
          ) : null}
          {objectViewMarketplaceOutput ? (
            <>
              <p className="of-eyebrow" style={{ marginTop: 16 }}>
                Marketplace Object View output
              </p>
              <div className="of-panel-muted" style={{ display: 'grid', gap: 10, padding: 10, marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div>
                    <strong>{objectViewMarketplaceOutput.output?.name ?? 'No packageable Object View tabs'}</strong>
                    <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>
                      {objectViewMarketplaceOutput.packaged_resources.length} product output, {objectViewMarketplaceOutput.dependencies.length} dependencies, {objectViewMarketplaceOutput.issues.length} validation issues.
                    </p>
                  </div>
                  <span className={`of-chip${objectViewMarketplaceOutput.valid ? ' of-status-success' : ' of-status-danger'}`}>
                    {objectViewMarketplaceOutput.valid ? 'Packageable' : 'Blocked'}
                  </span>
                </div>
                {activeFormFactor === 'full' && editorTabs.length > 0 ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <p className="of-eyebrow" style={{ margin: 0 }}>Tabs</p>
                    {editorTabs.map((tab) => (
                      <label key={tab.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={marketplaceSelectedTabIds.includes(tab.id)}
                          onChange={(event) =>
                            setMarketplaceSelectedTabIds((current) =>
                              event.target.checked
                                ? [...new Set([...current, tab.id])]
                                : current.filter((id) => id !== tab.id),
                            )
                          }
                        />
                        <span>
                          <strong>{tab.title}</strong>{' '}
                          <span className="of-text-muted">
                            module {tab.module.id} · {tab.module.widgets.length} widgets
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}
                {objectViewMarketplaceOutput.issues.length > 0 ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {objectViewMarketplaceOutput.issues.slice(0, 5).map((issue, index) => (
                      <div key={`${issue.code}-${issue.tab_id || 'output'}-${index}`} className={issue.severity === 'error' ? 'of-status-danger' : 'of-status-warning'} style={{ padding: '7px 9px', borderRadius: 6, fontSize: 12 }}>
                        <strong>{issue.code}:</strong> {issue.message}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                  <div>
                    <p className="of-eyebrow" style={{ marginBottom: 4 }}>Packaged resources JSON</p>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                      {JSON.stringify(objectViewMarketplaceOutput.packaged_resources, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="of-eyebrow" style={{ marginBottom: 4 }}>Manifest JSON</p>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                      {JSON.stringify(objectViewMarketplaceOutput.manifest, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </>
          ) : null}
          {objectViewBranchAdapterState && objectViewBranchAdapterState.branch_label !== 'main' ? (
            <>
              <p className="of-eyebrow" style={{ marginTop: 16 }}>
                Global Branch adapter
              </p>
              <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                Branch {objectViewBranchAdapterState.branch_label} tracks {objectViewBranchAdapterState.resources.length} Object View resources; preview is {objectViewBranchAdapterState.preview.status} and merge checks are {objectViewBranchAdapterState.mergeable ? 'passing' : 'not mergeable'}.
              </p>
              {objectViewProposalIntegration ? (
                <div className="of-panel-muted" style={{ display: 'grid', gap: 8, padding: 10, marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <strong>Ontology proposal preview</strong>
                      <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>
                        {objectViewProposalIntegration.preview.resource_count} resources, {objectViewProposalIntegration.preview.indexing_change_count} indexing changes, {objectViewProposalIntegration.proposal_tasks.length} proposal tasks.
                      </p>
                    </div>
                    <span className={`of-chip${objectViewProposalIntegration.preview.status === 'blocked' ? ' of-status-danger' : objectViewProposalIntegration.preview.status === 'pending' ? ' of-status-warning' : ' of-status-success'}`}>
                      {objectViewProposalIntegration.preview.status}
                    </span>
                  </div>
                  {objectViewProposalIntegration.checks.slice(0, 4).map((check) => (
                    <div key={check.id} className={check.status === 'failed' ? 'of-status-danger' : check.status === 'warning' ? 'of-status-warning' : 'of-status-success'} style={{ padding: '7px 9px', borderRadius: 6, fontSize: 12 }}>
                      <strong>{check.label}:</strong> {check.message}
                    </div>
                  ))}
                </div>
              ) : null}
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                {objectViewBranchAdapterState.resources.slice(0, 6).map((resource) => (
                  <article key={resource.id} className="of-panel-muted" style={{ display: 'grid', gap: 6, padding: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <div>
                        <strong>{resource.label}</strong>
                        <p className="of-text-muted" style={{ marginTop: 2, fontSize: 11 }}>
                          {resource.kind} | v{resource.main_version}{' -> '}v{resource.branch_version}
                        </p>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <span className={`of-chip${resource.requires_rebase ? ' of-status-warning' : ' of-status-success'}`}>
                          {resource.requires_rebase ? 'Needs rebase' : 'Rebased'}
                        </span>
                        <span className="of-chip">{resource.preview_status}</span>
                        <span className="of-chip">{resource.auto_approved ? 'Auto-approved' : resource.approved ? 'Approved' : 'Needs approval'}</span>
                      </div>
                    </div>
                    <a href={resource.href} className="of-link" target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                      Open branched resource
                    </a>
                  </article>
                ))}
              </div>
              <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                {objectViewBranchAdapterState.checks.map((check) => (
                  <div key={check.id} className={check.status === 'failed' ? 'of-status-danger' : check.status === 'warning' ? 'of-status-warning' : 'of-status-success'} style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12 }}>
                    <strong>{check.label}:</strong> {check.message}
                  </div>
                ))}
              </div>
              {objectViewRebaseModel ? (
                <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <p className="of-eyebrow" style={{ margin: 0 }}>Rebase dialog model</p>
                      <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                        {objectViewRebaseModel.auto_accepted_count} auto-accepted, {objectViewRebaseModel.conflict_count} conflicts, {objectViewRebaseModel.unresolved_conflict_count} unresolved.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="of-button"
                      onClick={finishObjectViewRebase}
                      disabled={!objectViewRebaseModel.can_finish}
                      style={{ fontSize: 12 }}
                    >
                      Finish rebase and rerun checks
                    </button>
                  </div>
                  {objectViewRebaseModel.rows.slice(0, 5).map((row) => (
                    <article key={row.resource_id} className="of-panel-muted" style={{ display: 'grid', gap: 8, padding: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <strong>{row.label}</strong>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span className={`of-chip${row.requires_manual_resolution ? ' of-status-danger' : row.auto_accepted ? ' of-status-success' : ''}`}>
                            {row.disposition}
                          </span>
                          <span className="of-chip">{row.kind}</span>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                        {[
                          ['Main', row.main_state?.summary ?? 'Not present on main'],
                          ['Branch', row.branch_state?.summary ?? 'Not present on branch'],
                          ['Result', row.proposed_state?.summary ?? 'No proposed result'],
                        ].map(([label, value]) => (
                          <div key={label} style={{ display: 'grid', gap: 4 }}>
                            <span className="of-eyebrow" style={{ margin: 0 }}>{label}</span>
                            <span className="of-text-muted" style={{ fontSize: 12 }}>{value}</span>
                          </div>
                        ))}
                      </div>
                      {row.conflict_fields.length > 0 ? (
                        <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>
                          Changed fields: {row.conflict_fields.join(', ')}
                        </p>
                      ) : null}
                      {row.requires_manual_resolution || row.resolution_choice ? (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                          Resolution
                          <select
                            value={row.resolution_choice ?? ''}
                            onChange={(event) =>
                              setObjectViewRebaseResolutions((current) => ({
                                ...current,
                                [row.resource_id]: event.target.value as ObjectViewGlobalBranchRebaseResolutionChoice,
                              }))
                            }
                            className="of-input"
                            style={{ width: 'auto' }}
                          >
                            <option value="">Choose...</option>
                            {row.resolution_options.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          {objectViewEmbeddingMatrix ? (
            <>
              <p className="of-eyebrow" style={{ marginTop: 16 }}>
                Application embedding matrix
              </p>
              <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                {objectViewEmbeddingMatrix.summary.full_supported} hosts support full views,{' '}
                {objectViewEmbeddingMatrix.summary.panel_supported} support panels, and{' '}
                {objectViewEmbeddingMatrix.summary.host_header_fallbacks} use host-owned headers.
              </p>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                {objectViewEmbeddingMatrix.entries.map((entry) => (
                  <article key={entry.host} className="of-panel-muted" style={{ display: 'grid', gap: 8, padding: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <div>
                        <strong>{entry.label}</strong>
                        <p className="of-text-muted" style={{ marginTop: 2, fontSize: 11 }}>
                          Full: {objectViewDeliveryLabel(entry.full_delivery)} | Panel: {objectViewDeliveryLabel(entry.panel_delivery)}
                        </p>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <span className="of-chip">{entry.selected_mode === 'configured' ? 'Custom default' : 'Core default'}</span>
                        {entry.supports_core_custom_toggle ? <span className="of-chip of-status-success">Toggle</span> : <span className="of-chip of-status-warning">No toggle</span>}
                        {entry.uses_host_header ? <span className="of-chip">Host header</span> : null}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {entry.embed_href ? <a href={entry.embed_href} className="of-button" target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Open embed</a> : null}
                      {entry.full_href ? <a href={entry.full_href} className="of-button" target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Full</a> : null}
                      {entry.panel_href ? <a href={entry.panel_href} className="of-button" target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Panel</a> : null}
                    </div>
                    {entry.warnings.length ? (
                      <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>
                        {entry.warnings[0]}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            </>
          ) : null}
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

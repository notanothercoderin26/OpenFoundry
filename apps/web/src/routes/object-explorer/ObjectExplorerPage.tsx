import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import {
  buildObjectCommentThread,
  buildCoreObjectViews,
  buildDefaultCustomObjectViews,
  buildObjectExplorerLinkedFilterQuery,
  buildObjectExplorerPivotObjectSetDraft,
  buildObjectExplorerPivotQuery,
  buildObjectExplorerActionPrefill,
  buildObjectExplorerExportAffordances,
  buildObjectExplorerOpenInAffordances,
  buildObjectViewApplicationEmbeddingMatrix,
  buildPanelObjectViewRuntimeConfig,
  buildObjectExplorerSavedLayout,
  buildObjectExplorerSavedQueryState,
  buildObjectExplorerTypeGroups,
  buildObjectInstanceViewPolicy,
  createObjectSet,
  evaluateObjectSet,
  filterObjectsForRestrictedViewPolicy,
  getObjectView,
  groupLinkedObjectsByLinkType,
  listActionTypes,
  listObjects,
  listTypeInterfaces,
  materializeObjectSet,
  searchOntology,
  mergeApplicableInterfaceActions,
  normalizeObjectExplorerProductConfig,
  objectExplorerApplicableActionsForContext,
  objectExplorerVisibleObjectSets,
  objectExplorerVisibleObjectTypes,
  objectExplorerLinksForType,
  objectExplorerLinkedTargetForType,
  objectExplorerSavedArtifactAccess,
  objectExplorerSavedArtifactKind,
  objectExplorerShareLink,
  objectExplorerShareSlug,
  objectCommentThreadKey,
  objectViewConfiguredHref,
  objectViewFullHref,
  objectViewTitle,
  queryObjects,
  redactObjectViewResponseForObjectViewPermissions,
  redactSearchResultForObjectAccess,
  redactSearchResultForObjectSecurityAccess,
  redactSearchResultForRestrictedViewAccess,
  resolveObjectViewModeToggle,
  schemaOnlyObjectViewResponse,
  type ActionType,
  type ObjectExplorerSavedArtifactKind,
  type ObjectExplorerSavedArtifactPrivacy,
  type ObjectExplorerActionContext,
  type ObjectExplorerExportAffordance,
  type ObjectCommentThread,
  type ObjectQueryFilter,
  type ObjectSetFilter,
  type ObjectSetDefinition,
  type ObjectSetEvaluationResponse,
  type ObjectSetTraversal,
  type ObjectInstanceViewPolicy,
  type ObjectType,
  type ObjectViewMode,
  type ObjectViewResponse,
  type OntologyPermissionPrincipal,
  type Property,
  type SearchResult,
} from '@/lib/api/ontology';
import { ActionExecutor } from '@/lib/components/ontology/ActionExecutor';
import { ObjectCommentsHelper } from '@/lib/components/ontology/ObjectCommentsHelper';
import { useAuth } from '@/lib/stores/auth';

import { EmptyState, KeyValueGrid, MetricCard, PanelHeader, SearchResultRow, formatValue } from './components/atoms';
import { objectExplorerKeys, useObjectExplorerInitialData, useTypeProperties } from './queries';

type SearchMode = 'lexical' | 'semantic';
type EvaluationMode = 'preview' | 'materialize';

interface RecentItem {
  kind: string;
  id: string;
  title: string;
  route: string;
  objectTypeId: string | null;
  createdAt: string;
}

interface PropertyFilterDraft {
  property_name: string;
  operator: ObjectQueryFilter['operator'];
  value: string;
}

type LinkedFilterMode = 'has_link' | 'linked_property' | 'object_reference';

interface LinkedFilterDraft {
  mode: LinkedFilterMode;
  link_type_id: string;
  property_name: string;
  operator: ObjectQueryFilter['operator'];
  value: string;
  object_id: string;
}

interface ExplorationContext {
  kind: 'linked_filter' | 'pivot';
  label: string;
  source_object_type_id: string;
  result_object_type_id: string;
  source_object_ids: string[];
  result_object_ids: string[];
  link_type_id: string;
  direction: string;
}

const RECENTS_KEY = 'of.objectExplorer.recents';
const DEFAULT_PROPERTY_FILTER: PropertyFilterDraft = { property_name: '', operator: 'equals', value: '' };
const DEFAULT_LINKED_FILTER: LinkedFilterDraft = {
  mode: 'has_link',
  link_type_id: '',
  property_name: '',
  operator: 'equals',
  value: '',
  object_id: '',
};
const SEARCH_KINDS = [
  { value: '', label: 'All resources' },
  { value: 'object_instance', label: 'Objects' },
  { value: 'object_type', label: 'Object types' },
  { value: 'action_type', label: 'Actions' },
  { value: 'link_type', label: 'Links' },
  { value: 'shared_property_type', label: 'Shared properties' },
];
const OBJECT_EXPLORER_CONFIG = normalizeObjectExplorerProductConfig({
  max_action_selection_count: 1000,
  max_export_selection_count: 5000,
  open_in_targets: ['object_views', 'graph', 'map', 'workshop', 'reports'],
});

const numberFormatter = new Intl.NumberFormat('en-US');
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function readRecents(): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as RecentItem[]) : [];
  } catch {
    return [];
  }
}

function writeRecents(items: RecentItem[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(items.slice(0, 30)));
}

function shortId(value: string | null | undefined, length = 10) {
  if (!value) return '-';
  return value.length <= length ? value : `${value.slice(0, length)}...`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : dateFormatter.format(parsed);
}

function uniqueRecentKey(item: RecentItem) {
  return `${item.kind}:${item.id}`;
}

function propertyKind(property?: Property | null) {
  const raw = `${property?.property_type || ''} ${property?.base_type || ''} ${property?.type_family || ''}`.toLowerCase();
  if (/(int|long|float|double|decimal|number|numeric|currency|percent)/.test(raw)) return 'number';
  if (/(date|time|timestamp)/.test(raw)) return 'date';
  if (/(bool)/.test(raw)) return 'boolean';
  return 'string';
}

function propertyInputType(property?: Property | null) {
  const kind = propertyKind(property);
  if (kind === 'number') return 'number';
  if (kind === 'date') return 'datetime-local';
  return 'text';
}

function operatorOptionsForProperty(property?: Property | null) {
  const kind = propertyKind(property);
  if (kind === 'number' || kind === 'date') {
    return [
      ['equals', 'equals'],
      ['not_equals', 'not equals'],
      ['gt', 'greater than'],
      ['gte', 'greater or equal'],
      ['lt', 'less than'],
      ['lte', 'less or equal'],
      ['is_empty', 'is empty'],
      ['is_not_empty', 'is not empty'],
    ] as const;
  }
  if (kind === 'boolean') {
    return [
      ['equals', 'equals'],
      ['not_equals', 'not equals'],
      ['is_empty', 'is empty'],
      ['is_not_empty', 'is not empty'],
    ] as const;
  }
  return [
    ['equals', 'equals'],
    ['contains', 'contains'],
    ['not_equals', 'not equals'],
    ['is_empty', 'is empty'],
    ['is_not_empty', 'is not empty'],
  ] as const;
}

function coerceFilterValue(value: string, property?: Property | null) {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (propertyKind(property) === 'number') {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : trimmed;
  }
  if (propertyKind(property) === 'boolean') return trimmed.toLowerCase() === 'true';
  return trimmed;
}

function uniqueObjectIds(results: SearchResult[]) {
  return Array.from(new Set(results
    .filter((result) => result.kind === 'object_instance')
    .map((result) => result.id)
    .filter(Boolean)));
}

function splitCompact(value: string) {
  return value
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function downloadText(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function objectToSearchResult(object: { id: string; object_type_id: string; properties: Record<string, unknown> }, objectType?: ObjectType | null): SearchResult {
  const titleProperty = objectType?.title_property || objectType?.primary_key_property || objectType?.primary_key || 'id';
  const title = formatValue(object.properties?.[titleProperty]) || object.id;
  return {
    kind: 'object_instance',
    id: object.id,
    object_type_id: object.object_type_id,
    title,
    subtitle: objectType?.display_name || objectType?.name || object.object_type_id,
    snippet: Object.entries(object.properties || {}).slice(0, 4).map(([key, value]) => `${key}: ${formatValue(value)}`).join(' · '),
    score: 1,
    route: objectViewFullHref(object.object_type_id, object.id),
    metadata: { ...(object.properties || {}) },
  };
}

function objectQueryFiltersFromDrafts(filters: PropertyFilterDraft[], properties: Property[] = []): ObjectQueryFilter[] {
  const propertyByName = new Map(properties.map((property) => [property.name, property]));
  return filters
    .filter((filter) => filter.property_name && (filter.operator === 'is_empty' || filter.operator === 'is_not_empty' || filter.value.trim() !== ''))
    .map((filter) => ({
      property_name: filter.property_name,
      operator: filter.operator,
      value: filter.operator === 'is_empty' || filter.operator === 'is_not_empty' ? undefined : coerceFilterValue(filter.value, propertyByName.get(filter.property_name)),
    }));
}

function objectSetFiltersFromQueryFilters(filters: ObjectQueryFilter[]): ObjectSetFilter[] {
  return filters.map((filter) => ({
    field: filter.property_name,
    operator: filter.operator || 'equals',
    value: filter.value ?? null,
  }));
}

function objectIdFromEvaluationRow(row: Record<string, unknown>) {
  const candidate = (row.base && typeof row.base === 'object') ? row.base as Record<string, unknown> : row;
  return typeof candidate.id === 'string' ? candidate.id : '';
}

function objectTypeIdFromResultSet(results: SearchResult[]) {
  const typeIds = Array.from(new Set(results
    .filter((result) => result.kind === 'object_instance' && result.object_type_id)
    .map((result) => result.object_type_id as string)));
  return typeIds.length === 1 ? typeIds[0] : '';
}

export function ObjectExplorerPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const {
    objectTypes,
    objectTypeGroups,
    objectSets,
    objectViews,
    linkTypes,
    actionTypes,
    loading,
    error: pageError,
  } = useObjectExplorerInitialData();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('lexical');
  const [searchKindFilter, setSearchKindFilter] = useState('object_instance');
  const [searchTypeFilter, setSearchTypeFilter] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [filterTypeId, setFilterTypeId] = useState('');
  const [propertyFilters, setPropertyFilters] = useState<PropertyFilterDraft[]>([{ ...DEFAULT_PROPERTY_FILTER }]);
  const [linkedFilter, setLinkedFilter] = useState<LinkedFilterDraft>({ ...DEFAULT_LINKED_FILTER });
  const [filterLoading, setFilterLoading] = useState(false);
  const [pivotLinkTypeId, setPivotLinkTypeId] = useState('');
  const [explorationContext, setExplorationContext] = useState<ExplorationContext | null>(null);
  const [directOpenTypeId, setDirectOpenTypeId] = useState('');
  const [directOpenObjectId, setDirectOpenObjectId] = useState('');

  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [selectedObject, setSelectedObject] = useState<ObjectViewResponse | null>(null);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [objectViewModePreference, setObjectViewModePreference] = useState<ObjectViewMode | ''>('');
  const [selectedActionId, setSelectedActionId] = useState('');
  const [objectSetActionId, setObjectSetActionId] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [affordanceNotice, setAffordanceNotice] = useState('');
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentThreads, setCommentThreads] = useState<Record<string, ObjectCommentThread>>({});

  const [newSetName, setNewSetName] = useState('Saved exploration');
  const [newSetDescription, setNewSetDescription] = useState('');
  const [newSetType, setNewSetType] = useState('');
  const [newSetWhatIf, setNewSetWhatIf] = useState('');
  const [saveKind, setSaveKind] = useState<ObjectExplorerSavedArtifactKind>('exploration');
  const [savePrivacy, setSavePrivacy] = useState<ObjectExplorerSavedArtifactPrivacy>('private');
  const [saveProjectId, setSaveProjectId] = useState('');
  const [saveFolderPath, setSaveFolderPath] = useState('/Explorations');
  const [saveLayoutView, setSaveLayoutView] = useState('split');
  const [saveColumns, setSaveColumns] = useState('id, title, marking');
  const [lastShareLink, setLastShareLink] = useState('');
  const [pendingShareId, setPendingShareId] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('exploration') || '';
  });
  const [evaluation, setEvaluation] = useState<ObjectSetEvaluationResponse | null>(null);
  const [evaluationSetId, setEvaluationSetId] = useState('');
  const [objectSetBusy, setObjectSetBusy] = useState(false);
  const [objectSetError, setObjectSetError] = useState('');

  useEffect(() => {
    setRecents(readRecents());
  }, []);

  useEffect(() => {
    if (searchTypeFilter) setNewSetType(searchTypeFilter);
  }, [searchTypeFilter]);

  const typeById = useMemo(() => {
    return new Map(objectTypes.map((type) => [type.id, type]));
  }, [objectTypes]);
  const propertiesByObjectType = useMemo(
    () => Object.fromEntries(objectTypes.map((type) => [type.id, type.properties ?? []])),
    [objectTypes],
  );
  const coreObjectViews = useMemo(
    () => buildCoreObjectViews({
      objectTypes,
      propertiesByObjectType,
      linkTypes,
    }),
    [linkTypes, objectTypes, propertiesByObjectType],
  );
  const configuredObjectViews = useMemo(
    () =>
      buildDefaultCustomObjectViews({
        objectTypes,
        propertiesByObjectType,
        linkTypes,
        existingViews: objectViews,
        ownerId: user?.id,
      }),
    [linkTypes, objectTypes, objectViews, propertiesByObjectType, user?.id],
  );
  const allObjectViews = useMemo(
    () => [...coreObjectViews, ...configuredObjectViews],
    [configuredObjectViews, coreObjectViews],
  );
  const principal = useMemo<OntologyPermissionPrincipal>(() => ({
    user_id: user?.id,
    email: user?.email,
    groups: user?.groups || [],
    roles: user?.roles || [],
    permissions: user?.permissions || [],
  }), [user?.id, user?.email, user?.groups, user?.roles, user?.permissions]);
  const instanceAccessByTypeId = useMemo(
    () => new Map(objectTypes.map((type) => [type.id, buildObjectInstanceViewPolicy({ objectType: type, principal })])),
    [objectTypes, principal],
  );
  const visibleObjectTypes = useMemo(
    () => objectExplorerVisibleObjectTypes(objectTypes, principal),
    [objectTypes, principal],
  );
  const visibleObjectTypeIds = useMemo(() => new Set(visibleObjectTypes.map((type) => type.id)), [visibleObjectTypes]);
  const objectTypesWithVisibleRows = useMemo(
    () => visibleObjectTypes.filter((type) => instanceAccessByTypeId.get(type.id)?.can_view_instances ?? true),
    [instanceAccessByTypeId, visibleObjectTypes],
  );
  const visibleObjectSets = useMemo(
    () => objectExplorerVisibleObjectSets(objectSets, objectTypes, principal),
    [objectSets, objectTypes, principal],
  );
  const explorerGroups = useMemo(
    () => buildObjectExplorerTypeGroups(objectTypeGroups, visibleObjectTypes),
    [objectTypeGroups, visibleObjectTypes],
  );
  const visibleRecents = useMemo(
    () => recents.filter((item) => !item.objectTypeId || visibleObjectTypeIds.has(item.objectTypeId)),
    [recents, visibleObjectTypeIds],
  );
  const linkById = useMemo(() => new Map(linkTypes.map((linkType) => [linkType.id, linkType])), [linkTypes]);
  const linkedFilterLinks = useMemo(
    () => objectExplorerLinksForType(linkTypes, filterTypeId, visibleObjectTypeIds)
      .filter((linkType) => {
        const targetId = objectExplorerLinkedTargetForType(linkType, filterTypeId)?.target_object_type_id;
        return Boolean(targetId && (instanceAccessByTypeId.get(targetId)?.can_view_instances ?? true));
      }),
    [filterTypeId, linkTypes, visibleObjectTypeIds, instanceAccessByTypeId],
  );
  const pivotLinks = useMemo(
    () => objectExplorerLinksForType(linkTypes, searchTypeFilter || filterTypeId, visibleObjectTypeIds)
      .filter((linkType) => {
        const targetId = objectExplorerLinkedTargetForType(linkType, searchTypeFilter || filterTypeId)?.target_object_type_id;
        return Boolean(targetId && (instanceAccessByTypeId.get(targetId)?.can_view_instances ?? true));
      }),
    [filterTypeId, linkTypes, searchTypeFilter, visibleObjectTypeIds, instanceAccessByTypeId],
  );
  const linkedFilterLink = linkedFilter.link_type_id ? linkById.get(linkedFilter.link_type_id) ?? null : null;
  const linkedFilterContext = linkedFilterLink ? objectExplorerLinkedTargetForType(linkedFilterLink, filterTypeId) : null;
  const linkedTargetType = linkedFilterContext ? typeById.get(linkedFilterContext.target_object_type_id) : null;

  const typePropertiesQuery = useTypeProperties(filterTypeId);
  const typeProperties = typePropertiesQuery.data ?? [];
  const linkedTargetTypeId = linkedFilterContext?.target_object_type_id ?? '';
  const linkedPropertiesQuery = useTypeProperties(linkedTargetTypeId);
  const linkedProperties = linkedPropertiesQuery.data ?? [];
  const linkedFilterProperty = linkedProperties.find((property) => property.name === linkedFilter.property_name) ?? null;

  const pivotSourceTypeId = searchTypeFilter || filterTypeId || searchResults.find((result) => result.object_type_id)?.object_type_id || '';
  const pivotLinkType = pivotLinkTypeId ? linkById.get(pivotLinkTypeId) ?? null : null;
  const pivotContext = pivotLinkType ? objectExplorerLinkedTargetForType(pivotLinkType, pivotSourceTypeId) : null;
  const pivotTargetType = pivotContext ? typeById.get(pivotContext.target_object_type_id) : null;

  useEffect(() => {
    const fallback = objectTypesWithVisibleRows[0]?.id || visibleObjectTypes[0]?.id || '';
    if (!fallback) return;
    if (!filterTypeId || !visibleObjectTypeIds.has(filterTypeId)) setFilterTypeId(fallback);
    if (!newSetType || !visibleObjectTypeIds.has(newSetType)) setNewSetType(fallback);
    if (!directOpenTypeId || !visibleObjectTypeIds.has(directOpenTypeId)) setDirectOpenTypeId(fallback);
    if (searchTypeFilter && !visibleObjectTypeIds.has(searchTypeFilter)) setSearchTypeFilter('');
  }, [directOpenTypeId, filterTypeId, newSetType, objectTypesWithVisibleRows, searchTypeFilter, visibleObjectTypeIds, visibleObjectTypes]);

  useEffect(() => {
    const fallbackLinkId = linkedFilterLinks[0]?.id ?? '';
    if (linkedFilter.link_type_id && linkedFilterLinks.some((linkType) => linkType.id === linkedFilter.link_type_id)) return;
    setLinkedFilter((current) => ({ ...current, link_type_id: fallbackLinkId }));
  }, [linkedFilter.link_type_id, linkedFilterLinks]);

  useEffect(() => {
    const fallbackLinkId = pivotLinks[0]?.id ?? '';
    if (pivotLinkTypeId && pivotLinks.some((linkType) => linkType.id === pivotLinkTypeId)) return;
    setPivotLinkTypeId(fallbackLinkId);
  }, [pivotLinkTypeId, pivotLinks]);

  useEffect(() => {
    if (typePropertiesQuery.error) {
      setSearchError(typePropertiesQuery.error instanceof Error ? typePropertiesQuery.error.message : 'Failed to load properties');
    }
  }, [typePropertiesQuery.error]);

  useEffect(() => {
    if (!typePropertiesQuery.data) return;
    const properties = typePropertiesQuery.data;
    setPropertyFilters((current) => current.length > 0
      ? current.map((filter, index) => ({
          ...filter,
          property_name: properties.some((property) => property.name === filter.property_name)
            ? filter.property_name
            : index === 0 ? properties[0]?.name ?? '' : '',
        }))
      : [{ ...DEFAULT_PROPERTY_FILTER, property_name: properties[0]?.name ?? '' }]);
  }, [typePropertiesQuery.data]);

  useEffect(() => {
    if (!linkedPropertiesQuery.data) return;
    const properties = linkedPropertiesQuery.data;
    setLinkedFilter((current) => ({
      ...current,
      property_name: properties.some((property) => property.name === current.property_name)
        ? current.property_name
        : properties[0]?.name ?? '',
    }));
  }, [linkedPropertiesQuery.data]);

  useEffect(() => {
    if (!pendingShareId || loading) return;
    const saved = visibleObjectSets.find((objectSet) => objectSet.id === pendingShareId);
    if (!saved) return;
    setPendingShareId('');
    void openSavedExploration(saved);
  }, [loading, pendingShareId, visibleObjectSets]);

  const selectedType = selectedObject ? typeById.get(selectedObject.object.object_type_id) : undefined;
  const selectedObjectAccess = selectedObject?.object.object_view_access ?? (selectedType ? instanceAccessByTypeId.get(selectedType.id) : null);
  const selectedSchemaOnly = Boolean(selectedObjectAccess?.schema_only);
  const selectedObjectViewResolution = useMemo(
    () =>
      selectedType
        ? resolveObjectViewModeToggle({
            views: allObjectViews,
            formFactor: 'panel',
            host: 'object_explorer',
            objectTypeId: selectedType.id,
            requestedMode: objectViewModePreference || undefined,
          })
        : null,
    [allObjectViews, objectViewModePreference, selectedType],
  );
  const selectedPanelRuntimeConfig = useMemo(
    () =>
      selectedType && selectedObjectViewResolution?.active_view?.config
        ? buildPanelObjectViewRuntimeConfig({
            objectType: selectedType,
            config: selectedObjectViewResolution.active_view.config,
            object: selectedObject && !selectedSchemaOnly ? selectedObject.object : null,
            summary: selectedObject?.summary,
            objectId: selectedObject?.object.id,
            host: 'object_explorer',
          })
        : null,
    [selectedObject, selectedObjectViewResolution?.active_view?.config, selectedSchemaOnly, selectedType],
  );
  const selectedObjectEmbeddingEntry = useMemo(
    () =>
      selectedType && selectedObject
        ? buildObjectViewApplicationEmbeddingMatrix({
            objectType: selectedType,
            object: selectedSchemaOnly ? null : selectedObject.object,
            objectId: selectedObject.object.id,
            views: allObjectViews,
            mode: objectViewModePreference || selectedObjectViewResolution?.selected_mode,
            formFactor: 'panel',
            hosts: ['object_explorer'],
          }).entries[0]
        : null,
    [allObjectViews, objectViewModePreference, selectedObject, selectedObjectViewResolution?.selected_mode, selectedSchemaOnly, selectedType],
  );
  const selectedAction = selectedObject?.applicable_actions.find((action) => action.id === selectedActionId) ?? null;
  const selectedActionContext = selectedObject ? {
    object_type_id: selectedObject.object.object_type_id,
    object_type: selectedType ?? null,
    selected_object_ids: [selectedObject.object.id],
    can_view_objects: !selectedSchemaOnly,
  } satisfies ObjectExplorerActionContext : null;
  const selectedActionPrefill = selectedAction && selectedActionContext
    ? buildObjectExplorerActionPrefill(selectedAction, selectedActionContext, OBJECT_EXPLORER_CONFIG)
    : null;
  const selectedPanelProperties = selectedObjectViewResolution?.selected_mode === 'configured'
    ? selectedPanelRuntimeConfig?.property_names ?? []
    : [];
  const summaryEntries = selectedObject
    ? Object.entries(selectedObject.summary)
        .filter(([key]) => selectedPanelProperties.length === 0 || selectedPanelProperties.includes(key))
        .slice(0, selectedObjectViewResolution?.selected_mode === 'configured' ? 4 : 8)
    : [];
  const propertyEntries = selectedObject
    ? Object.entries(selectedObject.object.properties ?? {})
        .filter(([key]) => selectedPanelProperties.length === 0 || selectedPanelProperties.includes(key))
        .slice(0, selectedObjectViewResolution?.selected_mode === 'configured' ? 6 : 12)
    : [];
  const selectedObjectViewTitle = selectedObject && selectedType && selectedObjectViewResolution?.selected_mode === 'configured' && selectedPanelRuntimeConfig?.show_title
    ? selectedPanelRuntimeConfig.title
    : selectedObject
    ? objectViewTitle(selectedObject.object, selectedType)
    : '';
  const selectedFullObjectViewHref = selectedObject
    ? selectedObjectEmbeddingEntry?.full_href
      ? selectedObjectEmbeddingEntry.full_href
      : selectedObjectViewResolution?.selected_mode === 'configured' && selectedPanelRuntimeConfig
      ? selectedPanelRuntimeConfig.open_full_view_href
      : objectViewConfiguredHref({
          objectTypeId: selectedObject.object.object_type_id,
          objectId: selectedObject.object.id,
          mode: 'standard',
          formFactor: 'full',
      })
    : '';
  const selectedObjectCommentThread = useMemo(() => {
    if (!selectedObject || !selectedType) return null;
    const key = objectCommentThreadKey(selectedType.id, selectedObject.object.id, 'object_explorer');
    const existing = commentThreads[key];
    return buildObjectCommentThread({
      objectType: selectedType,
      object: selectedObject.object,
      objectId: selectedObject.object.id,
      comments: existing?.comments,
      activity: existing?.activity,
      notifications: existing?.notifications,
      principal,
      accessPolicy: selectedObjectAccess,
      commentsEnabled: true,
      surface: 'object_explorer',
    });
  }, [commentThreads, principal, selectedObject, selectedObjectAccess, selectedType]);
  function storeSelectedObjectCommentThread(thread: ObjectCommentThread) {
    setCommentThreads((current) => ({ ...current, [thread.id]: thread }));
  }
  const linkedObjectGroups = useMemo(() => groupLinkedObjectsByLinkType(selectedObject?.neighbors ?? []), [selectedObject?.neighbors]);
  const evaluationRows = evaluation?.rows.slice(0, 8) ?? [];
  const currentResultTypeId = searchTypeFilter || objectTypeIdFromResultSet(searchResults) || evaluation?.object_set.base_object_type_id || filterTypeId || '';
  const currentResultObjectIds = useMemo(() => {
    const resultIds = uniqueObjectIds(searchResults.filter((result) => !currentResultTypeId || result.object_type_id === currentResultTypeId));
    if (resultIds.length > 0) return resultIds;
    return uniqueObjectIds((evaluation?.rows ?? [])
      .map((row) => ({
        kind: 'object_instance',
        id: objectIdFromEvaluationRow(row),
        object_type_id: evaluation?.object_set.base_object_type_id ?? currentResultTypeId,
        title: '',
        subtitle: null,
        snippet: '',
        score: 1,
        route: '',
        metadata: {},
      })));
  }, [currentResultTypeId, evaluation?.object_set.base_object_type_id, evaluation?.rows, searchResults]);
  const objectSetActionContext = useMemo<ObjectExplorerActionContext | null>(() => {
    const objectTypeId = currentResultTypeId || evaluation?.object_set.base_object_type_id || '';
    if (!objectTypeId) return null;
    const objectType = typeById.get(objectTypeId) ?? null;
    const access = instanceAccessByTypeId.get(objectTypeId) || buildObjectInstanceViewPolicy({ objectType, principal });
    return {
      object_type_id: objectTypeId,
      object_type: objectType,
      selected_object_ids: currentResultObjectIds,
      object_set_id: evaluation?.object_set.id || evaluationSetId || null,
      object_set_name: evaluation?.object_set.name || newSetName,
      can_view_objects: access.can_view_instances,
    };
  }, [currentResultObjectIds, currentResultTypeId, evaluation?.object_set.id, evaluation?.object_set.name, evaluation?.object_set.base_object_type_id, evaluationSetId, newSetName, typeById, instanceAccessByTypeId, principal]);
  const objectSetActions = useMemo(
    () => objectSetActionContext ? objectExplorerApplicableActionsForContext(actionTypes, objectSetActionContext) : [],
    [actionTypes, objectSetActionContext],
  );
  const objectSetAction = objectSetActions.find((action) => action.id === objectSetActionId) ?? objectSetActions[0] ?? null;
  const objectSetActionPrefill = objectSetAction && objectSetActionContext
    ? buildObjectExplorerActionPrefill(objectSetAction, objectSetActionContext, OBJECT_EXPLORER_CONFIG)
    : null;
  const openInAffordances = objectSetActionContext ? buildObjectExplorerOpenInAffordances(objectSetActionContext, OBJECT_EXPLORER_CONFIG) : [];
  const exportAffordances = objectSetActionContext ? buildObjectExplorerExportAffordances(objectSetActionContext, OBJECT_EXPLORER_CONFIG) : [];

  useEffect(() => {
    if (objectSetActionId && objectSetActions.some((action) => action.id === objectSetActionId)) return;
    setObjectSetActionId(objectSetActions[0]?.id ?? '');
  }, [objectSetActionId, objectSetActions]);

  async function refreshObjectSets() {
    await queryClient.invalidateQueries({ queryKey: objectExplorerKeys.objectSets() });
  }

  function accessForType(typeId: string | null | undefined): ObjectInstanceViewPolicy {
    const objectType = typeId ? typeById.get(typeId) : null;
    return (typeId ? instanceAccessByTypeId.get(typeId) : undefined) || buildObjectInstanceViewPolicy({ objectType, principal });
  }

  function objectResultsFromRows(typeId: string, rows: Array<{ id: string; object_type_id: string; properties: Record<string, unknown> }>) {
    const objectType = typeById.get(typeId) ?? null;
    return rows.map((object) => objectToSearchResult(object, objectType));
  }

  function objectResultsFromEvaluation(typeId: string, rows: Record<string, unknown>[]) {
    const objectType = typeById.get(typeId) ?? null;
    return rows
      .map((row) => {
        const candidate = (row.base && typeof row.base === 'object') ? row.base as Record<string, unknown> : row;
        const id = typeof candidate.id === 'string' ? candidate.id : '';
        if (!id) return null;
        const properties = candidate.properties && typeof candidate.properties === 'object'
          ? candidate.properties as Record<string, unknown>
          : Object.fromEntries(Object.entries(candidate).filter(([key]) => !['id', 'object_type_id'].includes(key)));
        return objectToSearchResult({ id, object_type_id: typeof candidate.object_type_id === 'string' ? candidate.object_type_id : typeId, properties }, objectType);
      })
      .filter((entry): entry is SearchResult => Boolean(entry));
  }

  async function browseType(typeId: string) {
    const objectType = typeById.get(typeId) ?? null;
    const access = accessForType(typeId);
    setSearchError('');
    setHasSearched(true);
    setSearchKindFilter('object_instance');
    setSearchTypeFilter(typeId);
    setFilterTypeId(typeId);
    setExplorationContext(null);
    if (!objectType || !access.can_view_definition || !access.can_view_instances) {
      setSearchResults([]);
      setSearchError(access.reason);
      return;
    }
    setFilterLoading(true);
    try {
      const res = await listObjects(typeId, { page: 1, per_page: 50 });
      const visibleRows = filterObjectsForRestrictedViewPolicy(res.data ?? [], { objectType, principal });
      setSearchResults(objectResultsFromRows(typeId, visibleRows));
    } catch (cause) {
      setSearchError(cause instanceof Error ? cause.message : 'Failed to browse object type');
    } finally {
      setFilterLoading(false);
    }
  }

  async function runPropertyFilters() {
    if (!filterTypeId) return;
    const objectType = typeById.get(filterTypeId) ?? null;
    const access = accessForType(filterTypeId);
    setSearchError('');
    setHasSearched(true);
    setSearchKindFilter('object_instance');
    setSearchTypeFilter(filterTypeId);
    setExplorationContext(null);
    if (!objectType || !access.can_view_definition || !access.can_view_instances) {
      setSearchResults([]);
      setSearchError(access.reason);
      return;
    }
    setFilterLoading(true);
    try {
      const filters = objectQueryFiltersFromDrafts(propertyFilters, typeProperties);
      const res = await queryObjects(filterTypeId, { filters, limit: 50, include_count: true });
      const visibleRows = filterObjectsForRestrictedViewPolicy(res.data ?? [], { objectType, principal });
      setSearchResults(objectResultsFromRows(filterTypeId, visibleRows));
      setNewSetType(filterTypeId);
      if (filters.length > 0) setNewSetName(`${objectType.display_name || objectType.name} filtered exploration`);
    } catch (cause) {
      setSearchError(cause instanceof Error ? cause.message : 'Property filter search failed');
    } finally {
      setFilterLoading(false);
    }
  }

  async function runLinkedExploration() {
    if (!filterTypeId || !linkedFilter.link_type_id) return;
    const linkType = linkById.get(linkedFilter.link_type_id);
    const context = linkType ? objectExplorerLinkedTargetForType(linkType, filterTypeId) : null;
    const baseType = typeById.get(filterTypeId) ?? null;
    const targetType = context ? typeById.get(context.target_object_type_id) ?? null : null;
    const baseAccess = accessForType(filterTypeId);
    const targetAccess = accessForType(context?.target_object_type_id);
    setSearchError('');
    setHasSearched(true);
    setSearchKindFilter('object_instance');
    setSearchTypeFilter(filterTypeId);
    if (!linkType || !context || !baseType || !targetType) {
      setSearchResults([]);
      setSearchError('Pick a visible link type for this object type.');
      return;
    }
    if (!baseAccess.can_view_instances || !targetAccess.can_view_instances) {
      setSearchResults([]);
      setSearchError(!baseAccess.can_view_instances ? baseAccess.reason : targetAccess.reason);
      return;
    }
    setFilterLoading(true);
    try {
      let anchorObjectIds: string[] = [];
      if (linkedFilter.mode === 'object_reference') {
        anchorObjectIds = linkedFilter.object_id.trim() ? [linkedFilter.object_id.trim()] : [];
      } else {
        const targetFilters = linkedFilter.mode === 'linked_property'
          ? objectQueryFiltersFromDrafts([{
              property_name: linkedFilter.property_name,
              operator: linkedFilter.operator,
              value: linkedFilter.value,
            }], linkedProperties)
          : [];
        const targetResponse = await queryObjects(context.target_object_type_id, {
          filters: targetFilters,
          limit: 500,
          include_count: true,
        });
        const visibleTargetRows = filterObjectsForRestrictedViewPolicy(targetResponse.data ?? [], { objectType: targetType, principal });
        anchorObjectIds = visibleTargetRows.map((row) => row.id);
      }
      if (anchorObjectIds.length === 0) {
        setSearchResults([]);
        setExplorationContext({
          kind: 'linked_filter',
          label: `${baseType.display_name || baseType.name} linked through ${linkType.display_name || linkType.name}`,
          source_object_type_id: context.target_object_type_id,
          result_object_type_id: filterTypeId,
          source_object_ids: [],
          result_object_ids: [],
          link_type_id: linkType.id,
          direction: context.reverse_direction,
        });
        return;
      }
      const linkedQuery = buildObjectExplorerLinkedFilterQuery({
        base_object_type_id: filterTypeId,
        anchor_object_ids: anchorObjectIds,
        link_type: linkType,
      });
      if (!linkedQuery) throw new Error('Link type does not connect to the selected object type.');
      const baseFilters = objectQueryFiltersFromDrafts(propertyFilters, typeProperties);
      const response = await queryObjects(filterTypeId, {
        filters: baseFilters,
        search_around: linkedQuery.search_around,
        limit: 50,
        include_count: true,
      });
      const visibleRows = filterObjectsForRestrictedViewPolicy(response.data ?? [], { objectType: baseType, principal });
      const results = objectResultsFromRows(filterTypeId, visibleRows);
      setSearchResults(results);
      setExplorationContext({
        kind: 'linked_filter',
        label: `${baseType.display_name || baseType.name} linked through ${linkType.display_name || linkType.name}`,
        source_object_type_id: context.target_object_type_id,
        result_object_type_id: filterTypeId,
        source_object_ids: anchorObjectIds,
        result_object_ids: results.map((result) => result.id),
        link_type_id: linkType.id,
        direction: linkedQuery.search_around.direction || context.reverse_direction,
      });
      setNewSetType(filterTypeId);
      setNewSetName(`${baseType.display_name || baseType.name} linked exploration`);
    } catch (cause) {
      setSearchError(cause instanceof Error ? cause.message : 'Linked filter search failed');
    } finally {
      setFilterLoading(false);
    }
  }

  async function pivotToLinkedType() {
    const sourceTypeId = searchTypeFilter || filterTypeId || searchResults.find((result) => result.object_type_id)?.object_type_id || '';
    const linkType = linkById.get(pivotLinkTypeId);
    const sourceType = typeById.get(sourceTypeId) ?? null;
    const sourceObjectIds = uniqueObjectIds(searchResults.filter((result) => !sourceTypeId || result.object_type_id === sourceTypeId));
    const pivot = linkType ? buildObjectExplorerPivotQuery({
      source_object_type_id: sourceTypeId,
      source_object_ids: sourceObjectIds,
      link_type: linkType,
    }) : null;
    const targetType = pivot ? typeById.get(pivot.target_object_type_id) ?? null : null;
    const targetAccess = accessForType(pivot?.target_object_type_id);
    setSearchError('');
    setHasSearched(true);
    if (!sourceType || !linkType || !pivot || !targetType) {
      setSearchError('Pick a link that connects to the current result object type.');
      return;
    }
    if (sourceObjectIds.length === 0) {
      setSearchError('Run a search or filter first so the pivot has a source object set.');
      return;
    }
    if (!targetAccess.can_view_instances) {
      setSearchError(targetAccess.reason);
      return;
    }
    setFilterLoading(true);
    try {
      const response = await queryObjects(pivot.target_object_type_id, {
        search_around: pivot.search_around,
        limit: 50,
        include_count: true,
      });
      const visibleRows = filterObjectsForRestrictedViewPolicy(response.data ?? [], { objectType: targetType, principal });
      const results = objectResultsFromRows(pivot.target_object_type_id, visibleRows);
      setSearchResults(results);
      setSearchKindFilter('object_instance');
      setSearchTypeFilter(pivot.target_object_type_id);
      setFilterTypeId(pivot.target_object_type_id);
      setNewSetType(pivot.target_object_type_id);
      setNewSetName(`${targetType.display_name || targetType.name} pivot from ${sourceType.display_name || sourceType.name}`);
      setExplorationContext({
        kind: 'pivot',
        label: `${sourceType.display_name || sourceType.name} -> ${targetType.display_name || targetType.name}`,
        source_object_type_id: sourceTypeId,
        result_object_type_id: pivot.target_object_type_id,
        source_object_ids: sourceObjectIds,
        result_object_ids: results.map((result) => result.id),
        link_type_id: linkType.id,
        direction: pivot.search_around.direction || pivot.context.direction,
      });
    } catch (cause) {
      setSearchError(cause instanceof Error ? cause.message : 'Pivot failed');
    } finally {
      setFilterLoading(false);
    }
  }

  async function openDirectObject() {
    const objectId = directOpenObjectId.trim();
    if (!directOpenTypeId || !objectId) return;
    await selectResult({
      kind: 'object_instance',
      id: objectId,
      object_type_id: directOpenTypeId,
      title: objectId,
      subtitle: typeById.get(directOpenTypeId)?.display_name ?? directOpenTypeId,
      snippet: '',
      score: 1,
      route: objectViewFullHref(directOpenTypeId, objectId),
      metadata: {},
    });
  }

  async function runSearch() {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    setSearchLoading(true);
    setSearchError('');
    setHasSearched(true);
    setExplorationContext(null);
    try {
      const res = await searchOntology({
        query,
        kind: searchKindFilter || undefined,
        object_type_id: searchTypeFilter || undefined,
        limit: 50,
        semantic: searchMode === 'semantic',
      });
      setSearchResults(res.data
        .filter((result) => {
          if (result.kind === 'object_type') return visibleObjectTypeIds.has(result.id);
          if (result.kind !== 'object_instance') return true;
          return Boolean(result.object_type_id && visibleObjectTypeIds.has(result.object_type_id) && accessForType(result.object_type_id).can_view_instances);
        })
        .map((result) => {
          if (result.kind !== 'object_instance') return result;
          const objectType = result.object_type_id ? typeById.get(result.object_type_id) : null;
          return redactSearchResultForObjectSecurityAccess(redactSearchResultForRestrictedViewAccess(
            redactSearchResultForObjectAccess(result, accessForType(result.object_type_id)),
            objectType,
            principal,
          ), objectType, principal);
        }));
    } catch (cause) {
      setSearchError(cause instanceof Error ? cause.message : 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  }

  function rememberResult(result: SearchResult) {
    const recent: RecentItem = {
      kind: result.kind,
      id: result.id,
      title: result.title || result.id,
      route: result.route,
      objectTypeId: result.object_type_id,
      createdAt: new Date().toISOString(),
    };
    const key = uniqueRecentKey(recent);
    const next = [recent, ...recents.filter((item) => uniqueRecentKey(item) !== key)];
    setRecents(next);
    writeRecents(next);
  }

  async function selectResult(result: SearchResult) {
    setSelectedResult(result);
    setPreviewError('');
    setActionNotice('');
    rememberResult(result);

    if (!result.object_type_id || result.kind !== 'object_instance') {
      setSelectedObject(null);
      setSelectedActionId('');
      return;
    }

    const access = accessForType(result.object_type_id);
    const objectType = typeById.get(result.object_type_id) ?? null;
    if (!access.can_view_definition) {
      setSelectedObject(null);
      setSelectedActionId('');
      setPreviewError(access.reason);
      return;
    }
    if (!access.can_view_instances) {
      setSelectedObject(schemaOnlyObjectViewResponse({
        objectType: objectType || result.object_type_id,
        objectId: result.id,
        policy: access,
      }));
      setSelectedActionId('');
      return;
    }

    setPreviewLoading(true);
    try {
      const view = await getObjectView(result.object_type_id, result.id);
      const [implementedInterfaces, loadedActions] = await Promise.all([
        listTypeInterfaces(result.object_type_id).catch(() => []),
        actionTypes.length > 0
          ? Promise.resolve(actionTypes)
          : queryClient
              .fetchQuery({
                queryKey: objectExplorerKeys.actionTypes(),
                queryFn: () => listActionTypes({ per_page: 200 }).then((response) => response.data),
              })
              .catch(() => [] as ActionType[]),
      ]);
      const allActions = loadedActions.length > 0 ? loadedActions : view.applicable_actions;
      const applicableActions = mergeApplicableInterfaceActions(view.applicable_actions, allActions, implementedInterfaces);
      const nextView = redactObjectViewResponseForObjectViewPermissions({
        ...view,
        applicable_actions: applicableActions,
      }, { objectType, objectTypes, principal });
      setSelectedObject(nextView);
      setSelectedActionId(nextView.applicable_actions[0]?.id ?? '');
    } catch (cause) {
      setPreviewError(cause instanceof Error ? cause.message : 'Failed to load object view');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function selectRecent(item: RecentItem) {
    const result: SearchResult = {
      kind: item.kind,
      id: item.id,
      object_type_id: item.objectTypeId,
      title: item.title,
      subtitle: null,
      snippet: '',
      score: 1,
      route: item.route,
      metadata: {},
    };
    await selectResult(result);
  }

  function currentObjectRowsForExport() {
    const resultRows = searchResults
      .filter((result) => result.kind === 'object_instance' && (!objectSetActionContext?.object_type_id || result.object_type_id === objectSetActionContext.object_type_id))
      .map((result) => ({
        id: result.id,
        object_type_id: result.object_type_id,
        title: result.title,
        subtitle: result.subtitle,
        snippet: result.snippet,
        ...result.metadata,
      }));
    if (resultRows.length > 0) return resultRows;
    return (evaluation?.rows ?? []).map((row) => {
      const candidate = (row.base && typeof row.base === 'object') ? row.base as Record<string, unknown> : row;
      const properties = candidate.properties && typeof candidate.properties === 'object' ? candidate.properties as Record<string, unknown> : {};
      return {
        id: typeof candidate.id === 'string' ? candidate.id : objectIdFromEvaluationRow(row),
        object_type_id: typeof candidate.object_type_id === 'string' ? candidate.object_type_id : evaluation?.object_set.base_object_type_id,
        ...properties,
      };
    }).filter((row) => row.id);
  }

  async function copyCurrentObjectIds(affordance: ObjectExplorerExportAffordance) {
    if (!affordance.enabled || !objectSetActionContext) {
      setAffordanceNotice(affordance.reason || 'Copy is unavailable.');
      return;
    }
    const text = currentResultObjectIds.join('\n');
    if (!text || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setAffordanceNotice('Clipboard is unavailable in this browser.');
      return;
    }
    await navigator.clipboard.writeText(text);
    setAffordanceNotice(`Copied ${numberFormatter.format(currentResultObjectIds.length)} object IDs.`);
  }

  function exportCurrentObjects(affordance: ObjectExplorerExportAffordance) {
    if (!affordance.enabled) {
      setAffordanceNotice(affordance.reason || 'Export is unavailable.');
      return;
    }
    const rows = currentObjectRowsForExport();
    if (affordance.id === 'json') {
      downloadText(affordance.file_name, JSON.stringify(rows, null, 2), 'application/json');
      setAffordanceNotice(`Exported ${numberFormatter.format(rows.length)} objects as JSON.`);
      return;
    }
    if (affordance.id === 'csv') {
      const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
      const body = [
        headers.map(csvEscape).join(','),
        ...rows.map((row) => headers.map((header) => csvEscape((row as Record<string, unknown>)[header])).join(',')),
      ].join('\n');
      downloadText(affordance.file_name, body, 'text/csv');
      setAffordanceNotice(`Exported ${numberFormatter.format(rows.length)} objects as CSV.`);
    }
  }

  async function createSet() {
    if (!newSetName.trim() || !newSetType) {
      setObjectSetError('Name and base type are required.');
      return;
    }
    const resultObjectIds = uniqueObjectIds(searchResults.filter((result) => !newSetType || result.object_type_id === newSetType));
    if (saveKind === 'list' && resultObjectIds.length === 0) {
      setObjectSetError('Run an exploration with object results before saving a list.');
      return;
    }
    setObjectSetBusy(true);
    setObjectSetError('');
    try {
      const queryFilters = newSetType === filterTypeId ? objectQueryFiltersFromDrafts(propertyFilters, typeProperties) : [];
      let savedFilters = saveKind === 'list'
        ? [{ field: 'id', operator: 'in', value: resultObjectIds }]
        : objectSetFiltersFromQueryFilters(queryFilters);
      let savedTraversals: ObjectSetTraversal[] = [];
      let savedSearchAround = null;
      if (explorationContext && newSetType === explorationContext.result_object_type_id) {
        const linkType = linkById.get(explorationContext.link_type_id);
        if (linkType) {
          const linkedDraft = buildObjectExplorerPivotObjectSetDraft({
            result_object_ids: explorationContext.result_object_ids,
            result_object_type_id: explorationContext.result_object_type_id,
            source_object_type_id: explorationContext.source_object_type_id,
            source_object_ids: explorationContext.source_object_ids,
            link_type: linkType,
          });
          if (saveKind === 'exploration') savedFilters = [...savedFilters, ...linkedDraft.filters];
          savedTraversals = linkedDraft.traversals;
          savedSearchAround = linkedDraft.search_around;
        }
      }
      const layout = buildObjectExplorerSavedLayout({
        view: saveLayoutView,
        columns: splitCompact(saveColumns),
        preview_panel: true,
        density: 'comfortable',
      });
      const queryState = buildObjectExplorerSavedQueryState({
        query: searchQuery,
        search_mode: searchMode,
        search_kind: searchKindFilter,
        object_type_id: newSetType,
        property_filters: queryFilters,
        linked_filter: linkedFilter.link_type_id ? { ...linkedFilter } : null,
        search_around: savedSearchAround,
        selected_object_ids: resultObjectIds,
        exploration_context: explorationContext ? { ...explorationContext } : null,
      });
      const created = await createObjectSet({
        name: newSetName.trim(),
        description: newSetDescription.trim() || explorationContext?.label || undefined,
        base_object_type_id: newSetType,
        filters: savedFilters,
        traversals: savedTraversals,
        projections: layout.columns,
        what_if_label: newSetWhatIf.trim() || explorationContext?.kind || undefined,
        kind: saveKind,
        query_state: queryState,
        layout,
        privacy: savePrivacy,
        project_id: saveProjectId.trim() || null,
        folder_path: savePrivacy === 'private' ? '/home/Explorations' : saveFolderPath.trim(),
        share_slug: `${objectExplorerShareSlug({ id: String(Date.now()), name: newSetName.trim() })}`,
        selected_object_ids: resultObjectIds,
      });
      await refreshObjectSets();
      setEvaluationSetId(created.id);
      setLastShareLink(objectExplorerShareLink(created, typeof window !== 'undefined' ? window.location.origin : ''));
      const access = accessForType(created.base_object_type_id);
      if (access.can_view_instances) {
        setEvaluation(await evaluateObjectSet(created.id, { limit: 50 }));
      } else {
        setEvaluation(null);
        setObjectSetError(`${access.reason} The object set was created, but rows are hidden.`);
      }
      setNewSetName(searchQuery.trim() ? `${searchQuery.trim()} exploration` : 'Saved exploration');
      setNewSetDescription('');
      setNewSetWhatIf('');
      setSaveKind('exploration');
    } catch (cause) {
      setObjectSetError(cause instanceof Error ? cause.message : 'Failed to create object set');
    } finally {
      setObjectSetBusy(false);
    }
  }

  async function evaluateSet(id: string, mode: EvaluationMode) {
    setObjectSetBusy(true);
    setObjectSetError('');
    setEvaluationSetId(id);
    try {
      const set = objectSets.find((entry) => entry.id === id);
      const access = accessForType(set?.base_object_type_id);
      if (!access.can_view_instances) {
        setEvaluation(null);
        setObjectSetError(`${access.reason} Object Explorer is showing schema only for this set.`);
        return;
      }
      const response =
        mode === 'materialize'
          ? await materializeObjectSet(id, { limit: 500 })
          : await evaluateObjectSet(id, { limit: 50 });
      setEvaluation(response);
      if (mode === 'materialize') await refreshObjectSets();
    } catch (cause) {
      setObjectSetError(cause instanceof Error ? cause.message : `${mode} failed`);
    } finally {
      setObjectSetBusy(false);
    }
  }

  async function openSavedExploration(objectSet: ObjectSetDefinition) {
    const access = objectExplorerSavedArtifactAccess(objectSet, typeById.get(objectSet.base_object_type_id), principal);
    setObjectSetError('');
    setEvaluationSetId(objectSet.id);
    setNewSetType(objectSet.base_object_type_id);
    setFilterTypeId(objectSet.base_object_type_id);
    setSaveKind(objectExplorerSavedArtifactKind(objectSet));
    setSavePrivacy(access.privacy);
    setSaveProjectId(objectSet.project_id || '');
    setSaveFolderPath(objectSet.folder_path || (access.privacy === 'private' ? '/home/Explorations' : '/Shared/Explorations'));
    setSaveLayoutView(typeof objectSet.layout?.view === 'string' ? objectSet.layout.view : 'split');
    setSaveColumns(Array.isArray(objectSet.layout?.columns) && objectSet.layout.columns.length > 0 ? objectSet.layout.columns.join(', ') : objectSet.projections.join(', '));
    setLastShareLink(objectExplorerShareLink(objectSet, typeof window !== 'undefined' ? window.location.origin : ''));

    const queryState = objectSet.query_state || {};
    if (typeof queryState.query === 'string') setSearchQuery(queryState.query);
    if (queryState.search_mode === 'semantic' || queryState.search_mode === 'lexical') setSearchMode(queryState.search_mode);
    if (typeof queryState.search_kind === 'string') setSearchKindFilter(queryState.search_kind);
    setSearchTypeFilter(objectSet.base_object_type_id);
    if (Array.isArray(queryState.property_filters)) {
      setPropertyFilters(queryState.property_filters.map((filter) => ({
        property_name: filter.property_name,
        operator: filter.operator || 'equals',
        value: filter.value === undefined || filter.value === null ? '' : String(filter.value),
      })));
    }

    if (!access.can_view_metadata) {
      setEvaluation(null);
      setSearchResults([]);
      setObjectSetError(access.reason);
      return;
    }
    if (!access.can_view_objects) {
      setEvaluation(null);
      setSearchResults([]);
      setObjectSetError(`${access.reason} The saved ${objectExplorerSavedArtifactKind(objectSet)} is visible, but object data remains restricted.`);
      return;
    }

    setObjectSetBusy(true);
    try {
      const response = await evaluateObjectSet(objectSet.id, { limit: 50 });
      setEvaluation(response);
      setSearchResults(objectResultsFromEvaluation(objectSet.base_object_type_id, response.rows));
      setHasSearched(true);
    } catch (cause) {
      setObjectSetError(cause instanceof Error ? cause.message : 'Failed to open saved exploration');
    } finally {
      setObjectSetBusy(false);
    }
  }

  return (
    <section className="of-page" style={{ display: 'grid', gap: 12 }}>
      <header className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 280 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <Link to="/ontology" className="of-link" style={{ fontSize: 12 }}>
                Ontology
              </Link>
              <span className="of-text-muted">/</span>
              <span className="of-text-muted" style={{ fontSize: 12 }}>Object explorer</span>
            </div>
            <h1 className="of-heading-xl" style={{ marginTop: 8 }}>
              Object explorer
            </h1>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Link to="/ontology/graph" className="of-button">
              Graph
            </Link>
            <Link to="/ontology/object-sets" className="of-button">
              Object sets
            </Link>
            <Link to="/object-views" className="of-button">
              Views
            </Link>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))' }}>
          <MetricCard label="Visible types" value={numberFormatter.format(visibleObjectTypes.length)} />
          <MetricCard label="Saved explorations" value={numberFormatter.format(visibleObjectSets.length)} />
          <MetricCard label="Results" value={numberFormatter.format(searchResults.length)} />
          <MetricCard label="Recent" value={numberFormatter.format(visibleRecents.length)} />
        </div>

        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(min(100%, 360px), 1fr) repeat(3, minmax(min(100%, 150px), auto))', alignItems: 'center' }}>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search objects, actions, links"
            className="of-input"
            onKeyDown={(event) => {
              if (event.key === 'Enter') void runSearch();
            }}
          />
          <div style={{ display: 'inline-flex', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', minHeight: 30 }}>
            {(['lexical', 'semantic'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSearchMode(mode)}
                className={searchMode === mode ? 'of-button of-button--primary' : 'of-button of-button--ghost'}
                style={{ border: 0, borderRadius: 0, minWidth: 76 }}
              >
                {mode === 'lexical' ? 'Lexical' : 'Semantic'}
              </button>
            ))}
          </div>
          <select value={searchKindFilter} onChange={(event) => setSearchKindFilter(event.target.value)} className="of-input">
            {SEARCH_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
          <select value={searchTypeFilter} onChange={(event) => setSearchTypeFilter(event.target.value)} className="of-input">
            <option value="">All types</option>
            {visibleObjectTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.display_name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void runSearch()} disabled={searchLoading || !searchQuery.trim()} className="of-button of-button--primary">
            {searchLoading ? 'Searching' : 'Search'}
          </button>
        </div>

        <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(min(100%, 180px), 220px) minmax(min(100%, 220px), 1fr) auto', alignItems: 'center' }}>
          <select value={directOpenTypeId} onChange={(event) => setDirectOpenTypeId(event.target.value)} className="of-input">
            {visibleObjectTypes.map((type) => (
              <option key={type.id} value={type.id}>{type.display_name || type.name}</option>
            ))}
          </select>
          <input
            value={directOpenObjectId}
            onChange={(event) => setDirectOpenObjectId(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void openDirectObject(); }}
            placeholder="Object primary key or ID"
            className="of-input"
          />
          <button type="button" onClick={() => void openDirectObject()} disabled={!directOpenTypeId || !directOpenObjectId.trim()} className="of-button">
            Open Object View
          </button>
        </div>
      </header>

      {pageError && (
        <div className="of-status-danger" style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
          {pageError}
        </div>
      )}

      {loading ? (
        <section className="of-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading object explorer...
        </section>
      ) : (
        <>
        <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
          <PanelHeader label="Browse object type groups" value={`${explorerGroups.length}`} />
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
            {explorerGroups.map((group) => (
              <article key={group.id} className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <strong>{group.display_name}</strong>
                    {group.description ? <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>{group.description}</p> : null}
                  </div>
                  <span className="of-chip">{group.object_types.length}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {group.object_types.slice(0, 6).map((type) => {
                    const canBrowseRows = accessForType(type.id).can_view_instances;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => void browseType(type.id)}
                        disabled={!canBrowseRows}
                        className="of-button"
                        style={{ fontSize: 12 }}
                        title={canBrowseRows ? `Browse ${type.display_name || type.name}` : accessForType(type.id).reason}
                      >
                        {type.display_name || type.name}
                      </button>
                    );
                  })}
                </div>
              </article>
            ))}
            {explorerGroups.length === 0 && <EmptyState label="No visible object type groups." compact />}
          </div>
        </section>

        <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
          <PanelHeader label="Filters and pivots" value={filterTypeId ? typeById.get(filterTypeId)?.display_name : 'Pick type'} />

          <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
            <PanelHeader label="Property filters" value={`${propertyFilters.length}`} />
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(min(100%, 220px), 260px) minmax(0, 1fr) auto', alignItems: 'start' }}>
              <select value={filterTypeId} onChange={(event) => setFilterTypeId(event.target.value)} className="of-input">
                {objectTypesWithVisibleRows.map((type) => (
                  <option key={type.id} value={type.id}>{type.display_name || type.name}</option>
                ))}
              </select>
              <div style={{ display: 'grid', gap: 6 }}>
                {propertyFilters.map((filter, index) => {
                  const property = typeProperties.find((entry) => entry.name === filter.property_name) ?? null;
                  return (
                    <div key={index} style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(140px, 1fr) minmax(120px, 170px) minmax(120px, 1fr) auto' }}>
                      <select
                        value={filter.property_name}
                        onChange={(event) => setPropertyFilters((current) => current.map((entry, i) => i === index ? { ...entry, property_name: event.target.value, operator: 'equals' } : entry))}
                        className="of-input"
                      >
                        {typeProperties.map((entry) => (
                          <option key={entry.id} value={entry.name}>{entry.display_name || entry.name}</option>
                        ))}
                      </select>
                      <select
                        value={filter.operator}
                        onChange={(event) => setPropertyFilters((current) => current.map((entry, i) => i === index ? { ...entry, operator: event.target.value as ObjectQueryFilter['operator'] } : entry))}
                        className="of-input"
                      >
                        {operatorOptionsForProperty(property).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      {propertyKind(property) === 'boolean' ? (
                        <select
                          value={filter.value || 'true'}
                          onChange={(event) => setPropertyFilters((current) => current.map((entry, i) => i === index ? { ...entry, value: event.target.value } : entry))}
                          disabled={filter.operator === 'is_empty' || filter.operator === 'is_not_empty'}
                          className="of-input"
                        >
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : (
                        <input
                          type={propertyInputType(property)}
                          value={filter.value}
                          onChange={(event) => setPropertyFilters((current) => current.map((entry, i) => i === index ? { ...entry, value: event.target.value } : entry))}
                          disabled={filter.operator === 'is_empty' || filter.operator === 'is_not_empty'}
                          className="of-input"
                          placeholder={propertyKind(property) === 'number' ? 'Number' : propertyKind(property) === 'date' ? 'Date or time' : 'Value'}
                        />
                      )}
                      <button type="button" className="of-button" onClick={() => setPropertyFilters((current) => current.filter((_, i) => i !== index))} disabled={propertyFilters.length <= 1}>Remove</button>
                    </div>
                  );
                })}
                <button type="button" className="of-button" style={{ justifySelf: 'start' }} onClick={() => setPropertyFilters((current) => [...current, { ...DEFAULT_PROPERTY_FILTER, property_name: typeProperties[0]?.name ?? '' }])}>
                  Add filter
                </button>
              </div>
              <button type="button" className="of-button of-button--primary" onClick={() => void runPropertyFilters()} disabled={!filterTypeId || filterLoading}>
                {filterLoading ? 'Filtering' : 'Run filters'}
              </button>
            </div>
          </section>

          <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
            <PanelHeader label="Linked-object filters" value={linkedTargetType ? linkedTargetType.display_name || linkedTargetType.name : 'No link'} />
            {linkedFilterLinks.length > 0 ? (
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(min(100%, 150px), 180px) minmax(min(100%, 220px), 260px) minmax(0, 1fr) auto', alignItems: 'start' }}>
                <select value={linkedFilter.mode} onChange={(event) => setLinkedFilter((current) => ({ ...current, mode: event.target.value as LinkedFilterMode }))} className="of-input">
                  <option value="has_link">Has link</option>
                  <option value="linked_property">Linked property</option>
                  <option value="object_reference">Object reference</option>
                </select>
                <select value={linkedFilter.link_type_id} onChange={(event) => setLinkedFilter((current) => ({ ...current, link_type_id: event.target.value }))} className="of-input">
                  {linkedFilterLinks.map((linkType) => {
                    const target = objectExplorerLinkedTargetForType(linkType, filterTypeId);
                    return (
                      <option key={linkType.id} value={linkType.id}>
                        {linkType.display_name || linkType.name} to {typeById.get(target?.target_object_type_id || '')?.display_name || target?.target_object_type_id}
                      </option>
                    );
                  })}
                </select>
                {linkedFilter.mode === 'linked_property' ? (
                  <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(130px, 1fr) minmax(120px, 160px) minmax(120px, 1fr)' }}>
                    <select value={linkedFilter.property_name} onChange={(event) => setLinkedFilter((current) => ({ ...current, property_name: event.target.value, operator: 'equals' }))} className="of-input">
                      {linkedProperties.map((property) => (
                        <option key={property.id} value={property.name}>{property.display_name || property.name}</option>
                      ))}
                    </select>
                    <select value={linkedFilter.operator} onChange={(event) => setLinkedFilter((current) => ({ ...current, operator: event.target.value as ObjectQueryFilter['operator'] }))} className="of-input">
                      {operatorOptionsForProperty(linkedFilterProperty).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <input
                      type={propertyInputType(linkedFilterProperty)}
                      value={linkedFilter.value}
                      onChange={(event) => setLinkedFilter((current) => ({ ...current, value: event.target.value }))}
                      disabled={linkedFilter.operator === 'is_empty' || linkedFilter.operator === 'is_not_empty'}
                      className="of-input"
                      placeholder="Linked value"
                    />
                  </div>
                ) : linkedFilter.mode === 'object_reference' ? (
                  <input
                    value={linkedFilter.object_id}
                    onChange={(event) => setLinkedFilter((current) => ({ ...current, object_id: event.target.value }))}
                    placeholder={`${linkedTargetType?.display_name || 'Linked object'} ID`}
                    className="of-input"
                  />
                ) : (
                  <div className="of-text-muted" style={{ padding: '6px 0', fontSize: 12 }}>
                    Has visible linked object
                  </div>
                )}
                <button type="button" className="of-button of-button--primary" onClick={() => void runLinkedExploration()} disabled={!linkedFilter.link_type_id || filterLoading}>
                  {filterLoading ? 'Filtering' : 'Run linked filter'}
                </button>
              </div>
            ) : (
              <EmptyState label="No visible link filters for this object type." compact />
            )}
          </section>

          <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
            <PanelHeader label="Pivot linked objects" value={pivotTargetType ? pivotTargetType.display_name || pivotTargetType.name : 'Pick link'} />
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(min(100%, 260px), 320px) minmax(0, 1fr) auto', alignItems: 'center' }}>
              <select value={pivotLinkTypeId} onChange={(event) => setPivotLinkTypeId(event.target.value)} className="of-input" disabled={pivotLinks.length === 0}>
                {pivotLinks.map((linkType) => {
                  const target = objectExplorerLinkedTargetForType(linkType, pivotSourceTypeId);
                  return (
                    <option key={linkType.id} value={linkType.id}>
                      {linkType.display_name || linkType.name} to {typeById.get(target?.target_object_type_id || '')?.display_name || target?.target_object_type_id}
                    </option>
                  );
                })}
              </select>
              <span className="of-text-muted" style={{ fontSize: 12 }}>
                {numberFormatter.format(uniqueObjectIds(searchResults).length)} source objects from the current result set
              </span>
              <button type="button" className="of-button" onClick={() => void pivotToLinkedType()} disabled={!pivotLinkTypeId || filterLoading || uniqueObjectIds(searchResults).length === 0}>
                Pivot
              </button>
            </div>
          </section>
        </section>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', alignItems: 'start' }}>
          <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
            <PanelHeader label="Search results" value={hasSearched ? `${searchResults.length}` : 'Ready'} />

            {searchError && (
              <div className="of-status-danger" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                {searchError}
              </div>
            )}
            {explorationContext && (
              <div className="of-status-success" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span>{explorationContext.label}</span>
                <span>{numberFormatter.format(explorationContext.source_object_ids.length)} source</span>
                <span>{numberFormatter.format(explorationContext.result_object_ids.length)} result</span>
              </div>
            )}

            <div style={{ display: 'grid', gap: 6, maxHeight: 520, overflow: 'auto' }}>
              {searchResults.map((result, index) => (
                <SearchResultRow
                  key={`${result.kind}-${result.id}-${index}`}
                  result={result}
                  selected={selectedResult?.id === result.id && selectedResult.kind === result.kind}
                  typeLabel={result.object_type_id ? typeById.get(result.object_type_id)?.display_name : undefined}
                  onPreview={() => void selectResult(result)}
                />
              ))}
              {searchResults.length === 0 && (
                <EmptyState label={hasSearched ? 'No matching resources.' : 'Run a search to populate the explorer.'} />
              )}
            </div>

            <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 10 }}>
              <PanelHeader
                label="Actions / Open In / Export"
                value={objectSetActionContext ? `${numberFormatter.format(currentResultObjectIds.length)} selected` : 'No set'}
              />
              {affordanceNotice && (
                <div className="of-status-success" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                  {affordanceNotice}
                </div>
              )}
              {objectSetActionContext ? (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {openInAffordances.map((target) => (
                      target.enabled ? (
                        <Link key={target.id} to={target.href} className="of-button">
                          {target.label}
                        </Link>
                      ) : (
                        <button key={target.id} type="button" className="of-button" disabled title={target.reason}>
                          {target.label}
                        </button>
                      )
                    ))}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {exportAffordances.map((exportOption) => (
                      <button
                        key={exportOption.id}
                        type="button"
                        className="of-button"
                        disabled={!exportOption.enabled}
                        title={exportOption.enabled ? exportOption.label : exportOption.reason}
                        onClick={() => {
                          if (exportOption.id === 'copy_ids') void copyCurrentObjectIds(exportOption);
                          else exportCurrentObjects(exportOption);
                        }}
                      >
                        {exportOption.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {objectSetActions.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => {
                            setObjectSetActionId(action.id);
                            setActionNotice('');
                          }}
                          className={(objectSetAction?.id === action.id) ? 'of-button of-button--primary' : 'of-button'}
                        >
                          {action.display_name || action.name}
                        </button>
                      ))}
                      {objectSetActions.length === 0 && <span className="of-text-muted">No actions for this object set.</span>}
                    </div>
                    {objectSetAction && (
                      <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 8 }}>
                        {objectSetActionPrefill?.warning && (
                          <div className="of-status-warning" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                            {objectSetActionPrefill.warning}
                          </div>
                        )}
                        <ActionExecutor
                          action={objectSetAction}
                          initialParameters={objectSetActionPrefill?.initial_parameters}
                          hiddenParams={objectSetActionPrefill?.hidden_params}
                          targetObjectId={objectSetActionPrefill?.target_object_id}
                          batchTargetObjectIds={objectSetActionPrefill?.batch_target_object_ids}
                          emptyMessage={objectSetActionPrefill?.prefilled_parameter_names.length ? 'Selected objects are pre-filled by Object Explorer.' : undefined}
                          disabledReason={objectSetActionPrefill?.blocked_reason}
                          onExecuted={(response) => {
                            setActionNotice('total' in response ? `Batch execution recorded: ${response.succeeded}/${response.total}` : 'Execution recorded.');
                          }}
                        />
                      </div>
                    )}
                    {actionNotice && (
                      <div className="of-status-success" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                        {actionNotice}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <EmptyState label="Run a search, filter, or saved exploration to enable action and export affordances." compact />
              )}
            </section>

            <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
              <PanelHeader label="Recent objects" value={`${visibleRecents.length}`} />
              <div style={{ display: 'grid', gap: 4, maxHeight: 190, overflow: 'auto' }}>
                {visibleRecents.map((item) => (
                  <button
                    key={`${item.kind}-${item.id}`}
                    type="button"
                    onClick={() => void selectRecent(item)}
                    className="of-button of-button--ghost"
                    style={{ justifyContent: 'space-between', minHeight: 32, padding: '4px 6px', textAlign: 'left' }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title}
                      </span>
                      <span className="of-text-muted" style={{ display: 'block', fontSize: 11 }}>
                        {item.kind} - {formatDate(item.createdAt)}
                      </span>
                    </span>
                  </button>
                ))}
                {visibleRecents.length === 0 && <EmptyState label="No recent objects." compact />}
              </div>
            </section>
          </section>

          <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
            <PanelHeader
              label="Panel Object View"
              value={selectedObjectViewResolution?.selected_mode === 'configured' ? 'Custom' : selectedObject ? 'Core' : previewLoading ? 'Loading' : 'Idle'}
            />
            {selectedObjectViewResolution ? (
              <div className="of-panel-muted" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>
                  View
                  <select
                    value={selectedObjectViewResolution.selected_mode}
                    onChange={(event) => setObjectViewModePreference(event.target.value as ObjectViewMode)}
                    className="of-input"
                    disabled={!selectedObjectViewResolution.supports_toggle}
                    style={{ marginLeft: 6, width: 'auto' }}
                  >
                    {selectedObjectViewResolution.options.map((option) => (
                      <option key={option.mode} value={option.mode} disabled={!option.enabled}>
                        {option.label}{option.default ? ' default' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedObjectViewResolution.custom_is_default ? <span className="of-chip of-status-success">Custom default</span> : null}
                {selectedObjectEmbeddingEntry?.uses_host_header ? <span className="of-chip">Object Explorer header</span> : null}
                {!selectedObjectViewResolution.supports_toggle && selectedObjectViewResolution.limitation ? (
                  <span className="of-chip of-status-warning">{selectedObjectViewResolution.limitation}</span>
                ) : null}
              </div>
            ) : null}

            {previewError && (
              <div className="of-status-danger" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                {previewError}
              </div>
            )}

            {previewLoading ? (
              <EmptyState label="Loading object view..." />
            ) : selectedObject ? (
              <>
                <article className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <p className="of-eyebrow">{selectedType?.display_name ?? selectedObject.object.object_type_id}</p>
                      <h2 className="of-heading-md" style={{ marginTop: 4 }}>
                        {selectedSchemaOnly ? `${selectedType?.display_name ?? 'Object'} schema` : selectedObjectViewTitle}
                      </h2>
                      {!selectedSchemaOnly ? (
                        <p className="of-text-muted" style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                          {selectedObject.object.id}
                        </p>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <span className="of-chip">{selectedSchemaOnly ? 'schema only' : selectedObject.object.marking ?? 'unmarked'}</span>
                      {!selectedSchemaOnly ? (
                        <Link to={selectedFullObjectViewHref} className="of-button of-button--primary">
                          Open full Object View
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        className="of-button"
                        disabled={!selectedObjectCommentThread?.permissions.can_view}
                        onClick={() => setCommentsOpen((open) => !open)}
                      >
                        Comments
                      </button>
                      <Link to={`/ontology/${selectedObject.object.object_type_id}`} className="of-button">
                        Open type
                      </Link>
                    </div>
                  </div>

                  {selectedSchemaOnly && selectedObjectAccess ? (
                    <div className="of-status-warning" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                      {selectedObjectAccess.reason}
                    </div>
                  ) : null}

                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))' }}>
                    <MetricCard label="Actions" value={`${selectedObject.applicable_actions.length}`} />
                    <MetricCard label="Rules" value={`${selectedObject.matching_rules.length}`} />
                    <MetricCard label="Timeline" value={`${selectedObject.timeline.length}`} />
                    <MetricCard label="Comments" value={`${selectedObjectCommentThread?.comments.filter((comment) => !comment.deleted_at).length ?? 0}`} />
                  </div>
                </article>

                {commentsOpen ? (
                  <ObjectCommentsHelper
                    thread={selectedObjectCommentThread}
                    principal={principal}
                    authorDisplayName={user?.email || user?.id || 'object-explorer'}
                    onThreadChange={storeSelectedObjectCommentThread}
                    onClose={() => setCommentsOpen(false)}
                  />
                ) : null}

                <section className="of-panel-muted" style={{ padding: 12 }}>
                  <PanelHeader label="Summary" value={`${summaryEntries.length}`} />
                  {selectedSchemaOnly ? <EmptyState label="Summary values are restricted; schema remains available on the object type." compact /> : <KeyValueGrid entries={summaryEntries} />}
                </section>

                <section className="of-panel-muted" style={{ padding: 12 }}>
                  <PanelHeader label="Properties" value={`${propertyEntries.length}`} />
                  {selectedSchemaOnly ? <EmptyState label="Property values are restricted; open the type to inspect property definitions." compact /> : <KeyValueGrid entries={propertyEntries} />}
                </section>

                <section className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 8 }}>
                  <PanelHeader label="Linked objects" value={`${selectedObject.neighbors.length}`} />
                  {selectedSchemaOnly ? (
                    <EmptyState label="Linked-object previews are hidden because object values are restricted." compact />
                  ) : (
                  <div style={{ display: 'grid', gap: 6, maxHeight: 210, overflow: 'auto' }}>
                    {linkedObjectGroups.slice(0, 6).map((group) => (
                      <div key={group.link_type_id} className="of-card" style={{ padding: 8, display: 'grid', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <strong>{group.link_name}</strong>
                          <span className="of-chip">{group.outbound.length} out · {group.inbound.length} in</span>
                        </div>
                        {group.items.slice(0, 3).map((neighbor) => {
                          const neighborSchemaOnly = Boolean(neighbor.object.object_view_access?.schema_only);
                          return neighborSchemaOnly ? (
                            <div key={`${neighbor.link_id}-${neighbor.object.id}`} className="of-text-muted" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                              <span>Schema-only linked object</span>
                              <span>{neighbor.direction}</span>
                            </div>
                          ) : (
                            <Link key={`${neighbor.link_id}-${neighbor.object.id}`} to={objectViewFullHref(neighbor.object)} className="of-link" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                              <span>{objectViewTitle(neighbor.object)}</span>
                              <span className="of-text-muted">{neighbor.direction}</span>
                            </Link>
                          );
                        })}
                      </div>
                    ))}
                    {selectedObject.neighbors.length === 0 && <EmptyState label="No linked objects." compact />}
                  </div>
                  )}
                </section>

                <section className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 10 }}>
                  <PanelHeader label="Applicable actions" value={`${selectedObject.applicable_actions.length}`} />
                  {selectedSchemaOnly ? (
                    <EmptyState label="Action execution is hidden until object data is viewable." compact />
                  ) : (
                  <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {selectedObject.applicable_actions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => {
                          setSelectedActionId(action.id);
                          setActionNotice('');
                        }}
                        className={selectedActionId === action.id ? 'of-button of-button--primary' : 'of-button'}
                      >
                        {action.display_name || action.name}
                      </button>
                    ))}
                    {selectedObject.applicable_actions.length === 0 && <span className="of-text-muted">No actions.</span>}
                  </div>
                  {selectedAction && (
                    <div className="of-panel" style={{ padding: 12 }}>
                      <ActionExecutor
                        action={selectedAction}
                        initialParameters={selectedActionPrefill?.initial_parameters}
                        hiddenParams={selectedActionPrefill?.hidden_params}
                        targetObjectId={selectedActionPrefill?.target_object_id || selectedObject.object.id}
                        batchTargetObjectIds={selectedActionPrefill?.batch_target_object_ids}
                        disabledReason={selectedActionPrefill?.blocked_reason || (selectedObject.object.object_security_access?.blocked ? selectedObject.object.object_security_access.reason : '')}
                        onExecuted={(response) => {
                          setActionNotice('total' in response ? `Batch execution recorded: ${response.succeeded}/${response.total}` : 'Execution recorded.');
                        }}
                      />
                      {selectedActionPrefill?.warning && (
                        <p className="of-text-muted" style={{ margin: '8px 0 0', fontSize: 11 }}>
                          {selectedActionPrefill.warning}
                        </p>
                      )}
                    </div>
                  )}
                  {actionNotice && (
                    <div className="of-status-success" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                      {actionNotice}
                    </div>
                  )}
                  </>
                  )}
                </section>
              </>
            ) : (
              <EmptyState label={selectedResult ? 'Selected resource has no object preview.' : 'Select an object result.'} />
            )}
          </section>

          <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
            <PanelHeader label="Saved explorations" value={`${visibleObjectSets.length}`} />

            {objectSetError && (
              <div className="of-status-danger" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                {objectSetError}
              </div>
            )}

            <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(min(100%, 180px), 1fr) minmax(min(100%, 160px), 180px)' }}>
                <input
                  value={newSetName}
                  onChange={(event) => setNewSetName(event.target.value)}
                  placeholder="Title"
                  className="of-input"
                />
                <select value={saveKind} onChange={(event) => setSaveKind(event.target.value as ObjectExplorerSavedArtifactKind)} className="of-input">
                  <option value="exploration">Exploration</option>
                  <option value="list">Object list</option>
                </select>
              </div>
              <select value={newSetType} onChange={(event) => setNewSetType(event.target.value)} className="of-input">
                <option value="">Pick base type</option>
                {objectTypesWithVisibleRows.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.display_name}
                  </option>
                ))}
              </select>
              <input
                value={newSetDescription}
                onChange={(event) => setNewSetDescription(event.target.value)}
                placeholder="Description"
                className="of-input"
              />
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(min(100%, 120px), 160px) minmax(min(100%, 150px), 1fr)' }}>
                <select value={savePrivacy} onChange={(event) => setSavePrivacy(event.target.value as ObjectExplorerSavedArtifactPrivacy)} className="of-input">
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </select>
                <input
                  value={savePrivacy === 'private' ? '/home/Explorations' : saveFolderPath}
                  onChange={(event) => setSaveFolderPath(event.target.value)}
                  disabled={savePrivacy === 'private'}
                  placeholder="Folder path"
                  className="of-input"
                />
              </div>
              {savePrivacy === 'public' && (
                <input
                  value={saveProjectId}
                  onChange={(event) => setSaveProjectId(event.target.value)}
                  placeholder="Project ID"
                  className="of-input"
                />
              )}
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(min(100%, 120px), 160px) minmax(min(100%, 150px), 1fr)' }}>
                <select value={saveLayoutView} onChange={(event) => setSaveLayoutView(event.target.value)} className="of-input">
                  <option value="split">Split</option>
                  <option value="table">Table</option>
                  <option value="cards">Cards</option>
                </select>
                <input
                  value={saveColumns}
                  onChange={(event) => setSaveColumns(event.target.value)}
                  placeholder="Columns"
                  className="of-input"
                />
              </div>
              <input
                value={newSetWhatIf}
                onChange={(event) => setNewSetWhatIf(event.target.value)}
                placeholder="What-if label"
                className="of-input"
              />
              <button type="button" onClick={() => void createSet()} disabled={objectSetBusy} className="of-button of-button--primary">
                {objectSetBusy ? 'Working' : saveKind === 'list' ? 'Save list' : 'Save exploration'}
              </button>
              {lastShareLink && (
                <a href={lastShareLink} className="of-link" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lastShareLink}
                </a>
              )}
            </section>

            <div style={{ display: 'grid', gap: 6, maxHeight: 300, overflow: 'auto' }}>
              {visibleObjectSets.map((set) => {
                const access = objectExplorerSavedArtifactAccess(set, typeById.get(set.base_object_type_id), principal);
                const shareLink = objectExplorerShareLink(set, typeof window !== 'undefined' ? window.location.origin : '');
                return (
                  <article
                    key={set.id}
                    className={evaluationSetId === set.id ? 'of-panel' : 'of-panel-muted'}
                    style={{ padding: 10, display: 'grid', gap: 8 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {set.name}
                        </strong>
                        <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>
                          {typeById.get(set.base_object_type_id)?.display_name ?? shortId(set.base_object_type_id)}
                        </p>
                      </div>
                      <span className="of-chip">{numberFormatter.format(set.materialized_row_count)} rows</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      <span className="of-chip">{objectExplorerSavedArtifactKind(set)}</span>
                      <span className="of-chip">{access.privacy}</span>
                      {access.schema_only && <span className="of-chip">schema only</span>}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <button type="button" onClick={() => void openSavedExploration(set)} disabled={objectSetBusy} className="of-button of-button--primary">
                        Open
                      </button>
                      <button type="button" onClick={() => void evaluateSet(set.id, 'preview')} disabled={objectSetBusy || !access.can_view_objects} className="of-button">
                        Preview
                      </button>
                      <button type="button" onClick={() => void evaluateSet(set.id, 'materialize')} disabled={objectSetBusy || !access.can_view_objects} className="of-button">
                        Materialize
                      </button>
                      <a href={shareLink} className="of-button">Share</a>
                    </div>
                  </article>
                );
              })}
              {visibleObjectSets.length === 0 && <EmptyState label="No saved explorations." compact />}
            </div>

            {evaluation && (
              <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
                <PanelHeader label="Last evaluation" value={`${evaluation.total_rows} rows`} />
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))' }}>
                  <MetricCard label="Base matches" value={`${evaluation.total_base_matches}`} />
                  <MetricCard label="Neighbors" value={`${evaluation.traversal_neighbor_count}`} />
                  <MetricCard label="Materialized" value={evaluation.materialized ? 'Yes' : 'No'} />
                </div>
                <div style={{ display: 'grid', gap: 6, maxHeight: 240, overflow: 'auto' }}>
                  {evaluationRows.map((row, index) => (
                    <pre
                      key={index}
                      style={{
                        margin: 0,
                        padding: 8,
                        background: 'var(--bg-default)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        overflow: 'auto',
                      }}
                    >
                      {JSON.stringify(row, null, 2)}
                    </pre>
                  ))}
                  {evaluationRows.length === 0 && <EmptyState label="No evaluation rows." compact />}
                </div>
              </section>
            )}
          </section>
        </div>
        </>
      )}
    </section>
  );
}

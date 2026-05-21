import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import './styles.css';

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
  listActionTypes,
  listObjects,
  listTypeInterfaces,
  materializeObjectSet,
  searchOntology,
  mergeApplicableInterfaceActions,
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
  type ObjectSetDefinition,
  type ObjectSetEvaluationResponse,
  type ObjectSetTraversal,
  type ObjectInstanceViewPolicy,
  type ObjectViewMode,
  type ObjectViewResponse,
  type OntologyPermissionPrincipal,
  type SearchResult,
} from '@/lib/api/ontology';
import { useAuth } from '@/lib/stores/auth';

import { AppTabsBar, type AppTabsBarSavedItem } from './components/AppTabsBar';
import { ExplorerTabs, type ExplorerTabDefinition } from './components/ExplorerTabs';
import { PanelHeader } from './components/atoms';
import { BrowseGroupsGrid } from './components/BrowseGroupsGrid';
import { ExplorationsHighlight } from './components/ExplorationsHighlight';
import { ExplorerHero } from './components/ExplorerHero';
import { PropertyFiltersPanel } from './components/PropertyFiltersPanel';
import { LinkedFilterPanel } from './components/LinkedFilterPanel';
import { PivotBreadcrumb } from './components/PivotBreadcrumb';
import { PivotPanel } from './components/PivotPanel';
import { SearchResultsList } from './components/SearchResultsList';
import { RecentObjectsList } from './components/RecentObjectsList';
import { AffordancesPanel } from './components/AffordancesPanel';
import { ObjectPreviewPanel } from './components/ObjectPreviewPanel';
import { SavedExplorationsPanel } from './components/SavedExplorationsPanel';
import { SearchAroundPopover } from './components/SearchAroundPopover';
import { SearchResultsView } from './components/SearchResultsView';
import { SideNavBrowse, type SideNavSelection } from './components/SideNavBrowse';
import { SideNavSearch, type SearchSideNavSelection } from './components/SideNavSearch';
import { TypePreviewPopover } from './components/TypePreviewPopover';
import { objectExplorerKeys, useObjectExplorerInitialData, useTypeProperties } from './queries';
import {
  DEFAULT_LINKED_FILTER,
  DEFAULT_PROPERTY_FILTER,
  OBJECT_EXPLORER_CONFIG,
  numberFormatter,
  objectIdFromEvaluationRow,
  objectQueryFiltersFromDrafts,
  objectSetFiltersFromQueryFilters,
  objectToSearchResult,
  objectTypeIdFromResultSet,
  readFavoriteTypeIds,
  readRecents,
  splitCompact,
  uniqueObjectIds,
  uniqueRecentKey,
  writeFavoriteTypeIds,
  writeRecents,
  csvEscape,
  downloadText,
  type EvaluationMode,
  type ExplorationContext,
  type LinkedFilterDraft,
  type PropertyFilterDraft,
  type RecentItem,
  type SearchMode,
} from './state';
import {
  currentPivot,
  pushPivot,
  rollbackTo,
  type PivotHistory,
} from './pivotState';
import { makeExplorationTab, makeListTab, makeSearchTab, makeTypeTab, useExplorerTabs } from './tabs';
import { useExplorerUrlSelection } from './useUrlSelection';

type ObjectExplorerTab = 'overview' | 'objects' | 'types' | 'artifacts';

function buildTabDefinitions(searchActive: boolean, counts: {
  all: number;
  objects: number;
  types: number;
  artifacts: number;
}): ReadonlyArray<ExplorerTabDefinition<ObjectExplorerTab>> {
  if (!searchActive) {
    return [
      { id: 'overview', label: 'Overview' },
      { id: 'objects', label: 'Objects' },
      { id: 'types', label: 'Object types' },
      { id: 'artifacts', label: 'Artifacts' },
    ];
  }
  return [
    { id: 'overview', label: 'All', count: counts.all },
    { id: 'objects', label: 'Objects', count: counts.objects },
    { id: 'types', label: 'Object types', count: counts.types },
    { id: 'artifacts', label: 'Artifacts', count: counts.artifacts },
  ];
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
  const [, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [filterTypeId, setFilterTypeId] = useState('');
  const [propertyFilters, setPropertyFilters] = useState<PropertyFilterDraft[]>([{ ...DEFAULT_PROPERTY_FILTER }]);
  const [linkedFilter, setLinkedFilter] = useState<LinkedFilterDraft>({ ...DEFAULT_LINKED_FILTER });
  const [filterLoading, setFilterLoading] = useState(false);
  const [pivotLinkTypeId, setPivotLinkTypeId] = useState('');
  const [pivotDepth, setPivotDepth] = useState(1);
  const [pivotHistory, setPivotHistory] = useState<PivotHistory>([]);
  const [explorationContext, setExplorationContext] = useState<ExplorationContext | null>(null);

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

  const [activeTab, setActiveTab] = useState<ObjectExplorerTab>('overview');
  const explorerTabs = useExplorerTabs();
  const urlSelection = useExplorerUrlSelection();
  const [sideNavSelection, setSideNavSelection] = useState<SideNavSelection>({ kind: 'all' });
  const [searchSideNavSelection, setSearchSideNavSelection] = useState<SearchSideNavSelection>({ kind: 'all' });
  const [groupsPage, setGroupsPage] = useState(0);
  const [favoriteTypeIds, setFavoriteTypeIds] = useState<Set<string>>(() => new Set(readFavoriteTypeIds()));
  const [previewTypeId, setPreviewTypeId] = useState<string | null>(null);
  const [searchAroundState, setSearchAroundState] = useState<{ result: SearchResult; anchor: HTMLElement } | null>(null);
  const [scopeTypeIds, setScopeTypeIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setRecents(readRecents());
  }, []);

  // Reflect the active workspace tab into the page state. Switching to
  // the Overview tab clears any in-flight search; switching to a search
  // tab rehydrates its query so the underlying results panel reruns.
  useEffect(() => {
    const tab = explorerTabs.activeTab;
    if (tab.kind === 'overview') {
      setSearchQuery('');
      setSearchResults([]);
      setHasSearched(false);
      setActiveTab('overview');
    } else if (tab.kind === 'search' && tab.query) {
      setSearchQuery(tab.query);
      setActiveTab('objects');
    } else if (tab.kind === 'type' && tab.resourceId) {
      setActiveTab('objects');
      void browseType(tab.resourceId);
    } else if (tab.kind === 'exploration' && tab.resourceId) {
      setPendingShareId(tab.resourceId);
      setActiveTab('artifacts');
    } else if (tab.kind === 'list' && tab.resourceId) {
      setPendingShareId(tab.resourceId);
      setActiveTab('artifacts');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explorerTabs.activeTabId]);

  // Apply the URL's ?tab=… on mount and any time the URL changes
  // externally (browser back/forward, link share). Page-driven tab
  // changes flow back to the URL via the writeTab effect below.
  useEffect(() => {
    const fromUrl = urlSelection.readTab();
    if (fromUrl && fromUrl !== activeTab) setActiveTab(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSelection.readTab]);

  useEffect(() => {
    urlSelection.writeTab(activeTab);
  }, [activeTab, urlSelection]);

  // Same dance for ?group=<id>: read on mount/back-forward, write
  // whenever the user picks a different group in the sidebar.
  useEffect(() => {
    const fromUrl = urlSelection.readGroup();
    if (!fromUrl) return;
    if (sideNavSelection.kind === 'group' && sideNavSelection.groupId === fromUrl) return;
    setSideNavSelection({ kind: 'group', groupId: fromUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSelection.readGroup]);

  useEffect(() => {
    urlSelection.writeGroup(sideNavSelection);
  }, [sideNavSelection, urlSelection]);

  function toggleFavoriteType(typeId: string) {
    setFavoriteTypeIds((current) => {
      const next = new Set(current);
      if (next.has(typeId)) next.delete(typeId);
      else next.add(typeId);
      writeFavoriteTypeIds(Array.from(next));
      return next;
    });
  }

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
    if (searchTypeFilter && !visibleObjectTypeIds.has(searchTypeFilter)) setSearchTypeFilter('');
  }, [filterTypeId, newSetType, objectTypesWithVisibleRows, searchTypeFilter, visibleObjectTypeIds, visibleObjectTypes]);

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
    setPivotHistory([]);
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
    setPivotHistory([]);
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
      depth: pivotDepth,
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
      const step: ExplorationContext = {
        kind: 'pivot',
        label: `${sourceType.display_name || sourceType.name} -> ${targetType.display_name || targetType.name}`,
        source_object_type_id: sourceTypeId,
        result_object_type_id: pivot.target_object_type_id,
        source_object_ids: sourceObjectIds,
        result_object_ids: results.map((result) => result.id),
        link_type_id: linkType.id,
        direction: pivot.search_around.direction || pivot.context.direction,
      };
      setExplorationContext(step);
      setPivotHistory((history) => pushPivot(history, step));
    } catch (cause) {
      setSearchError(cause instanceof Error ? cause.message : 'Pivot failed');
    } finally {
      setFilterLoading(false);
    }
  }

  async function rollbackPivotToIndex(index: number) {
    const truncated = rollbackTo(pivotHistory, index);
    setPivotHistory(truncated);
    const target = currentPivot(truncated);
    if (!target) {
      setExplorationContext(null);
      setSearchResults([]);
      return;
    }
    setExplorationContext(target);
    const targetType = typeById.get(target.result_object_type_id) ?? null;
    if (!targetType) return;
    const ids = target.result_object_ids;
    setFilterLoading(true);
    setSearchError('');
    try {
      if (ids.length === 0) {
        setSearchResults([]);
        return;
      }
      const response = await queryObjects(target.result_object_type_id, {
        filters: [{ property_name: 'id', operator: 'in', value: ids }],
        limit: Math.max(50, ids.length),
        include_count: true,
      });
      const visibleRows = filterObjectsForRestrictedViewPolicy(response.data ?? [], { objectType: targetType, principal });
      setSearchResults(objectResultsFromRows(target.result_object_type_id, visibleRows));
      setSearchKindFilter('object_instance');
      setSearchTypeFilter(target.result_object_type_id);
      setFilterTypeId(target.result_object_type_id);
    } catch (cause) {
      setSearchError(cause instanceof Error ? cause.message : 'Pivot rollback failed');
    } finally {
      setFilterLoading(false);
    }
  }

  async function runSearch() {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    explorerTabs.open(makeSearchTab(query));
    setSearchLoading(true);
    setSearchError('');
    setHasSearched(true);
    setExplorationContext(null);
    setPivotHistory([]);
    try {
      const scopeForServer = scopeTypeIds.size === 1 ? scopeTypeIds.values().next().value : searchTypeFilter || undefined;
      const res = await searchOntology({
        query,
        kind: searchKindFilter || undefined,
        object_type_id: scopeForServer,
        limit: 50,
        semantic: searchMode === 'semantic',
      });
      setSearchResults(res.data
        .filter((result) => {
          if (result.kind === 'object_type') {
            if (!visibleObjectTypeIds.has(result.id)) return false;
            return scopeTypeIds.size === 0 || scopeTypeIds.has(result.id);
          }
          if (result.kind !== 'object_instance') return true;
          if (!result.object_type_id || !visibleObjectTypeIds.has(result.object_type_id)) return false;
          if (!accessForType(result.object_type_id).can_view_instances) return false;
          if (scopeTypeIds.size > 0 && !scopeTypeIds.has(result.object_type_id)) return false;
          return true;
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

  function previewType(typeId: string) {
    setPreviewTypeId(typeId);
  }

  function startExplorationFromPreview(typeId: string) {
    setPreviewTypeId(null);
    setActiveTab('objects');
    void browseType(typeId);
  }

  function handleTypeaheadType(typeId: string) {
    setActiveTab('objects');
    void browseType(typeId);
  }

  function handleTypeaheadSavedSet(set: ObjectSetDefinition) {
    setActiveTab('artifacts');
    void openSavedExploration(set);
  }

  function handleTypeaheadRecent(item: RecentItem) {
    setActiveTab('objects');
    void selectRecent(item);
  }

  const savedExplorationMenuItems: AppTabsBarSavedItem[] = useMemo(
    () =>
      visibleObjectSets
        .filter((set) => objectExplorerSavedArtifactKind(set) !== 'list')
        .slice(0, 50)
        .map((set) => ({
          id: set.id,
          label: set.name || set.id,
          meta: typeById.get(set.base_object_type_id)?.display_name,
        })),
    [visibleObjectSets, typeById],
  );

  const savedListMenuItems: AppTabsBarSavedItem[] = useMemo(
    () =>
      visibleObjectSets
        .filter((set) => objectExplorerSavedArtifactKind(set) === 'list')
        .slice(0, 50)
        .map((set) => ({
          id: set.id,
          label: set.name || set.id,
          meta: typeById.get(set.base_object_type_id)?.display_name,
        })),
    [visibleObjectSets, typeById],
  );

  const tabDefinitions = useMemo(() => {
    const searchActive = hasSearched && searchQuery.trim().length > 0;
    let objects = 0;
    let types = 0;
    let artifacts = 0;
    for (const result of searchResults) {
      if (result.kind === 'object_instance') objects += 1;
      else if (result.kind === 'object_type') types += 1;
      else artifacts += 1;
    }
    return buildTabDefinitions(searchActive, {
      all: searchResults.length,
      objects,
      types,
      artifacts,
    });
  }, [hasSearched, searchQuery, searchResults]);

  function handleTabActivate(tabId: string) {
    explorerTabs.activate(tabId);
  }

  function handleTabClose(tabId: string) {
    explorerTabs.close(tabId);
  }

  function handleOpenExplorationFromMenu(item: AppTabsBarSavedItem) {
    const set = visibleObjectSets.find((candidate) => candidate.id === item.id);
    if (!set) return;
    explorerTabs.open(makeExplorationTab(set.id, item.label));
    void openSavedExploration(set);
  }

  function handleOpenListFromMenu(item: AppTabsBarSavedItem) {
    const set = visibleObjectSets.find((candidate) => candidate.id === item.id);
    if (!set) return;
    explorerTabs.open(makeListTab(set.id, item.label));
    void openSavedExploration(set);
  }

  return (
    <section className="oe of-page" style={{ display: 'grid', gap: 12 }}>
      <AppTabsBar
        tabs={explorerTabs.tabs}
        activeTabId={explorerTabs.activeTabId}
        savedExplorations={savedExplorationMenuItems}
        savedLists={savedListMenuItems}
        onActivate={handleTabActivate}
        onClose={handleTabClose}
        onNewExploration={explorerTabs.openNewOverview}
        onOpenExploration={handleOpenExplorationFromMenu}
        onOpenList={handleOpenListFromMenu}
      />
      <ExplorerHero
        visibleObjectTypes={visibleObjectTypes}
        visibleObjectSets={visibleObjectSets}
        visibleRecents={visibleRecents}
        groups={explorerGroups}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        scopeTypeIds={scopeTypeIds}
        setScopeTypeIds={setScopeTypeIds}
        onRunSearch={() => void runSearch()}
        onSelectTypeFromTypeahead={handleTypeaheadType}
        onSelectSavedSetFromTypeahead={handleTypeaheadSavedSet}
        onSelectRecentFromTypeahead={handleTypeaheadRecent}
        onClickExplore={() => setActiveTab('types')}
        onClickResults={() => setActiveTab('objects')}
      />

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
          <ExplorerTabs tabs={tabDefinitions} active={activeTab} onChange={setActiveTab} />

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(200px, 240px) minmax(0, 1fr)', alignItems: 'start' }}>
            {hasSearched && searchQuery.trim().length > 0 ? (
              <SideNavSearch
                searchResults={searchResults}
                groups={explorerGroups}
                typeById={typeById}
                selection={searchSideNavSelection}
                onSelect={(next) => {
                  setSearchSideNavSelection(next);
                  if (next.kind === 'all') {
                    setScopeTypeIds(new Set());
                    setActiveTab('overview');
                  } else if (next.kind === 'type') {
                    setScopeTypeIds(new Set([next.typeId]));
                    setActiveTab('objects');
                  } else if (next.kind === 'group') {
                    const group = explorerGroups.find((entry) => entry.id === next.groupId);
                    setScopeTypeIds(new Set(group?.object_type_ids ?? []));
                    setActiveTab('types');
                  } else if (next.kind === 'artifacts') {
                    setActiveTab('artifacts');
                  }
                }}
                onViewAllObjectTypeFilters={() => setActiveTab('objects')}
                onViewAllGroupFilters={() => setActiveTab('types')}
              />
            ) : (
              <SideNavBrowse
                groups={explorerGroups}
                selection={sideNavSelection}
                onSelect={(next) => {
                  setSideNavSelection(next);
                  if (next.kind === 'explorations') setActiveTab('artifacts');
                  else if (activeTab === 'artifacts') setActiveTab('overview');
                }}
                favoritesCount={favoriteTypeIds.size}
                explorationsCount={visibleObjectSets.length}
                page={groupsPage}
                onChangePage={setGroupsPage}
              />
            )}

            <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
              {hasSearched && searchQuery.trim().length > 0 ? (
                <SearchResultsView
                  results={searchResults}
                  typeById={typeById}
                  query={searchQuery}
                  activeTab={activeTab}
                  onOpenResult={(result) => void selectResult(result)}
                  onExploreType={(typeId) => {
                    const type = typeById.get(typeId);
                    explorerTabs.open(makeTypeTab(typeId, type?.display_name || type?.name || typeId));
                  }}
                  onChangeActiveTab={(next) => setActiveTab(next)}
                  onSearchAround={(result, anchor) => setSearchAroundState({ result, anchor })}
                />
              ) : (
                <>
                  {activeTab === 'overview' && (
                <>
                  <ExplorationsHighlight
                    objectSets={visibleObjectSets}
                    typeById={typeById}
                    onOpen={(set) => void openSavedExploration(set)}
                  />
                  <BrowseGroupsGrid
                    groups={explorerGroups}
                    linkTypes={linkTypes}
                    accessForType={accessForType}
                    onBrowse={(typeId) => {
                      const type = typeById.get(typeId);
                      explorerTabs.open(makeTypeTab(typeId, type?.display_name || type?.name || typeId));
                    }}
                    onPreviewType={previewType}
                    favoriteTypeIds={favoriteTypeIds}
                    onToggleFavorite={toggleFavoriteType}
                    selection={sideNavSelection}
                  />
                </>
              )}

              {activeTab === 'types' && (
                <BrowseGroupsGrid
                  groups={explorerGroups}
                  linkTypes={linkTypes}
                  accessForType={accessForType}
                  onBrowse={(typeId) => {
                    const type = typeById.get(typeId);
                    explorerTabs.open(makeTypeTab(typeId, type?.display_name || type?.name || typeId));
                  }}
                  onPreviewType={previewType}
                  favoriteTypeIds={favoriteTypeIds}
                  onToggleFavorite={toggleFavoriteType}
                  selection={sideNavSelection}
                />
              )}

              {activeTab === 'objects' && (
                <>
                  <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
                    <PanelHeader label="Filters and pivots" value={filterTypeId ? typeById.get(filterTypeId)?.display_name : 'Pick type'} />

                    <PropertyFiltersPanel
                      filterTypeId={filterTypeId}
                      onChangeFilterTypeId={setFilterTypeId}
                      objectTypesWithVisibleRows={objectTypesWithVisibleRows}
                      propertyFilters={propertyFilters}
                      setPropertyFilters={setPropertyFilters}
                      typeProperties={typeProperties}
                      filterLoading={filterLoading}
                      onRunFilters={() => void runPropertyFilters()}
                    />

                    <LinkedFilterPanel
                      filterTypeId={filterTypeId}
                      linkedFilter={linkedFilter}
                      setLinkedFilter={setLinkedFilter}
                      linkedFilterLinks={linkedFilterLinks}
                      linkedProperties={linkedProperties}
                      linkedFilterProperty={linkedFilterProperty}
                      linkedTargetType={linkedTargetType}
                      typeById={typeById}
                      filterLoading={filterLoading}
                      onRunLinkedFilter={() => void runLinkedExploration()}
                    />

                    <PivotPanel
                      pivotLinkTypeId={pivotLinkTypeId}
                      onChangePivotLinkTypeId={setPivotLinkTypeId}
                      pivotLinks={pivotLinks}
                      pivotSourceTypeId={pivotSourceTypeId}
                      pivotTargetType={pivotTargetType}
                      typeById={typeById}
                      searchResults={searchResults}
                      filterLoading={filterLoading}
                      pivotDepth={pivotDepth}
                      onChangePivotDepth={setPivotDepth}
                      onPivot={() => void pivotToLinkedType()}
                    />
                  </section>

                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', alignItems: 'start' }}>
                    <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
                      <PivotBreadcrumb
                        history={pivotHistory}
                        typeById={typeById}
                        onRollback={(index) => void rollbackPivotToIndex(index)}
                        onClear={() => void rollbackPivotToIndex(-1)}
                        disabled={filterLoading}
                      />
                      <SearchResultsList
                        searchResults={searchResults}
                        hasSearched={hasSearched}
                        searchError={searchError}
                        explorationContext={explorationContext}
                        selectedResult={selectedResult}
                        typeById={typeById}
                        onPreview={(result) => void selectResult(result)}
                      />

                      <AffordancesPanel
                        objectSetActionContext={objectSetActionContext}
                        currentResultObjectIds={currentResultObjectIds}
                        openInAffordances={openInAffordances}
                        exportAffordances={exportAffordances}
                        objectSetActions={objectSetActions}
                        objectSetAction={objectSetAction}
                        objectSetActionPrefill={objectSetActionPrefill}
                        affordanceNotice={affordanceNotice}
                        actionNotice={actionNotice}
                        setObjectSetActionId={setObjectSetActionId}
                        setActionNotice={setActionNotice}
                        onCopyIds={(affordance) => void copyCurrentObjectIds(affordance)}
                        onExport={exportCurrentObjects}
                      />

                      <RecentObjectsList recents={visibleRecents} onSelect={(item) => void selectRecent(item)} />
                    </section>

                    <ObjectPreviewPanel
                      selectedObject={selectedObject}
                      selectedResult={selectedResult}
                      selectedType={selectedType}
                      selectedObjectAccess={selectedObjectAccess}
                      selectedSchemaOnly={selectedSchemaOnly}
                      selectedObjectViewResolution={selectedObjectViewResolution}
                      selectedObjectViewTitle={selectedObjectViewTitle}
                      selectedObjectEmbeddingEntry={selectedObjectEmbeddingEntry}
                      selectedFullObjectViewHref={selectedFullObjectViewHref}
                      selectedObjectCommentThread={selectedObjectCommentThread}
                      storeSelectedObjectCommentThread={storeSelectedObjectCommentThread}
                      commentsOpen={commentsOpen}
                      setCommentsOpen={setCommentsOpen}
                      previewLoading={previewLoading}
                      previewError={previewError}
                      summaryEntries={summaryEntries}
                      propertyEntries={propertyEntries}
                      selectedActionId={selectedActionId}
                      setSelectedActionId={setSelectedActionId}
                      selectedAction={selectedAction}
                      selectedActionPrefill={selectedActionPrefill}
                      actionNotice={actionNotice}
                      setActionNotice={setActionNotice}
                      principal={principal}
                      authorDisplayName={user?.email || user?.id || 'object-explorer'}
                      setObjectViewModePreference={setObjectViewModePreference}
                    />
                  </div>
                </>
              )}

              {activeTab === 'artifacts' && (
                <SavedExplorationsPanel
                  visibleObjectSets={visibleObjectSets}
                  typeById={typeById}
                  principal={principal}
                  objectTypesWithVisibleRows={objectTypesWithVisibleRows}
                  evaluationSetId={evaluationSetId}
                  evaluation={evaluation}
                  evaluationRows={evaluationRows}
                  objectSetBusy={objectSetBusy}
                  objectSetError={objectSetError}
                  newSetName={newSetName}
                  setNewSetName={setNewSetName}
                  newSetType={newSetType}
                  setNewSetType={setNewSetType}
                  newSetDescription={newSetDescription}
                  setNewSetDescription={setNewSetDescription}
                  newSetWhatIf={newSetWhatIf}
                  setNewSetWhatIf={setNewSetWhatIf}
                  saveKind={saveKind}
                  setSaveKind={setSaveKind}
                  savePrivacy={savePrivacy}
                  setSavePrivacy={setSavePrivacy}
                  saveProjectId={saveProjectId}
                  setSaveProjectId={setSaveProjectId}
                  saveFolderPath={saveFolderPath}
                  setSaveFolderPath={setSaveFolderPath}
                  saveLayoutView={saveLayoutView}
                  setSaveLayoutView={setSaveLayoutView}
                  saveColumns={saveColumns}
                  setSaveColumns={setSaveColumns}
                  lastShareLink={lastShareLink}
                  onCreateSet={() => void createSet()}
                  onOpenSavedExploration={(set) => void openSavedExploration(set)}
                  onEvaluateSet={(id, mode) => void evaluateSet(id, mode)}
                />
              )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {previewTypeId && (
        <TypePreviewPopover
          typeId={previewTypeId}
          typeById={typeById}
          linkTypes={linkTypes}
          onClose={() => setPreviewTypeId(null)}
          onStartExploration={startExplorationFromPreview}
        />
      )}

      <SearchAroundPopover
        anchor={searchAroundState?.anchor ?? null}
        sourceObjectTypeId={searchAroundState?.result.object_type_id ?? null}
        linkTypes={linkTypes}
        typeById={typeById}
        onClose={() => setSearchAroundState(null)}
        onSelect={(option) => {
          if (!searchAroundState) return;
          const result = searchAroundState.result;
          const label = `Search for "${result.title || result.id}" ↔ ${option.label}`;
          explorerTabs.open({
            id: `search-around:${result.id}:${option.linkType.id}`,
            kind: 'search',
            label,
            query: result.title || result.id,
          });
          setActiveTab('objects');
          setScopeTypeIds(new Set([option.targetTypeId]));
          setSearchAroundState(null);
        }}
      />
    </section>
  );
}

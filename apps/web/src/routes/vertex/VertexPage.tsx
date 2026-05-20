import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Core,
  ElementDefinition,
  EventObject,
  StylesheetStyle,
} from 'cytoscape';

import { CytoscapeCanvas } from '@components/CytoscapeCanvas';
import { EChartView } from '@/lib/components/analytics/EChartView';
import {
  getOntologyGraph,
  expandNeighbors,
  listObjects,
  listObjectTypes,
  listQuiverVisualFunctions,
  searchOntology,
  runGraphReasoningBlock,
  shortestPath,
  approximateCentrality,
  simulateObjectScenarios,
  type GraphEdge,
  type GraphNode,
  type GraphResponse,
  type NeighborLink,
  type ObjectInstance,
  type ObjectScenarioSimulationResponse,
  type ObjectType,
  type QuiverVisualFunction,
  type ScenarioSimulationCandidate,
  type SearchResult,
} from '@/lib/api/ontology';
import { listVertexScenarios, promoteScenarioToActions, saveVertexScenario, scenarioDiffSummary, type VertexScenario } from '@/lib/api/vertexScenarios';
import type { ObjectRef, TraverseResultGroup } from '@/lib/api/vertexTraversal';
import { useCurrentUser } from '@/lib/stores/auth';
import { SearchAroundPanel } from './search-around/SearchAroundPanel';
import { LinkSummaryDropdown } from './search-around/LinkSummaryDropdown';
import { HistogramFacets, type HistogramFilterChip } from './search-around/HistogramFacets';
import { TemplateBuilder, type BuilderLayerOption } from './template/TemplateBuilder';
import { UseTemplateDialog } from './template/UseTemplateDialog';
import { listGraphTemplates, type GraphTemplate } from '@/lib/api/vertexTemplates';
import { EventBadgeOverlay, type NodeEventBadge } from './EventBadgeOverlay';
import { SelectionBorderOverlay, type SelectionRingSpec } from './SelectionBorderOverlay';
import { useSearchParams } from 'react-router-dom';

type LayoutMode = 'cose' | 'breadthfirst' | 'grid' | 'circle' | 'concentric' | 'radial' | 'cartesian';
type NodeDisplayMode = 'compact' | 'card';
type SidebarTab = 'selection' | 'events' | 'series' | 'layers' | 'media' | 'scenarios' | 'histogram';

interface VertexTemplate {
  id: string;
  name: string;
  description: string;
  rootTypeId: string;
  rootObjectId: string;
  depth: number;
  layout: LayoutMode;
  nodeDisplayMode: NodeDisplayMode;
  subtitleField: string;
  extendedLabelField: string;
  colorByField: string;
  timeField: string;
  eventStartField: string;
  eventEndField: string;
  mediaField: string;
  annotationField: string;
  sharedLensId: string;
  createdAt: string;
  updatedAt: string;
}

interface VertexAnnotation {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  note: string;
}

interface ScenarioDraft {
  name: string;
  description: string;
  propertyName: string;
  propertyValue: string;
}

interface SystemGraphTemplate {
  id: string;
  key: string;
  version: string;
  name: string;
  description: string;
  orgsEnabled: string[];
  rootTypeHint: string;
  depth: number;
  traversalPattern: string;
}

const LAYOUT_OPTIONS: Array<{ id: LayoutMode; label: string }> = [
  { id: 'cose', label: 'Auto' },
  { id: 'breadthfirst', label: 'Hierarchy' },
  { id: 'grid', label: 'Grid' },
  { id: 'circle', label: 'Circular' },
  { id: 'concentric', label: 'Cluster' },
  { id: 'radial', label: 'Radial' },
  { id: 'cartesian', label: 'Cartesian' },
];

const SIDEBAR_TABS: Array<{ id: SidebarTab; label: string }> = [
  { id: 'selection', label: 'Selection' },
  { id: 'events', label: 'Events' },
  { id: 'series', label: 'Series' },
  { id: 'layers', label: 'Layers' },
  { id: 'histogram', label: 'Histogram' },
  { id: 'media', label: 'Media' },
  { id: 'scenarios', label: 'Scenarios' },
];

const STORAGE_KEYS = {
  templates: 'of.vertex.templates',
  annotations: 'of.vertex.annotations',
  systemGraphs: 'of.vertex.system-graphs.v1',
  // D.1 — Saved styles bundle visualisation fields (subtitle, color
  // by, layout, etc.) into a named profile so the same graph can be
  // viewed through multiple lenses without losing the previous one.
  savedStyles: 'of.vertex.saved-styles.v1',
  activeStyle: 'of.vertex.saved-styles.active.v1',
  // D.1 — Saved selections are named groups of node ids with a
  // colour. Each node shows a coloured ring for every visible
  // selection it belongs to.
  savedSelections: 'of.vertex.saved-selections.v1',
  // D.3 — Group-into-edge persists which transactional node ids are
  // currently collapsed onto which (source -> target) bucket so the
  // grouping survives a re-render without losing the original
  // nodes (they are kept in the bucket payload and restored on
  // ungroup).
  edgeGroupings: 'of.vertex.edge-groupings.v1',
};

// ---- D.1 — Saved styles / Saved selections wire shapes ----
//
// SavedStyle bundles the visualisation surface a user has tuned for
// this graph. Switching profiles restores every field in one go; the
// graph data itself (root type, depth, seed objects) is independent.
interface SavedStyle {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  fields: {
    subtitleField: string;
    extendedLabelField: string;
    colorByField: string;
    timeField: string;
    eventStartField: string;
    eventEndField: string;
    mediaField: string;
    annotationField: string;
    nodeDisplayMode: NodeDisplayMode;
    layoutMode: LayoutMode;
    nodeLabelProperty: string;
    nodeSizeProperty: string;
    edgeLabelProperty: string;
    nodeIconMode: 'dot' | 'diamond' | 'hexagon';
  };
}

// A saved selection is a named bag of node ids. `visible` controls
// whether the coloured ring shows around its members on the canvas.
interface SavedSelection {
  id: string;
  name: string;
  color: string;
  nodeIds: string[];
  visible: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---- D.3 — Edge grouping ----
//
// When the user collapses transactional nodes into an edge, we keep
// the original node ids in the bucket so Ungroup can restore them.
// Buckets are keyed by `${source}::${target}` (sorted, so order is
// irrelevant) plus a discriminator if the same pair has multiple
// groupings.
interface EdgeGrouping {
  id: string;
  endpointA: string;
  endpointB: string;
  collapsedNodeIds: string[];
  label: string;
  createdAt: string;
}

const SELECTION_PALETTE = ['#f97316', '#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#eab308'];

function nextSelectionColor(existing: SavedSelection[]): string {
  for (const colour of SELECTION_PALETTE) {
    if (!existing.some((s) => s.color === colour)) return colour;
  }
  return SELECTION_PALETTE[existing.length % SELECTION_PALETTE.length];
}

function createId() {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
}

// Pretty-print an aggregated number for an edge label. Integers stay
// integer, floats are clipped to two decimals so the canvas does not
// drown in significant figures.
function formatAggregate(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toFixed(2);
}

function parseObjectId(node: GraphNode | null) {
  if (!node || !node.id.startsWith('object:')) return '';
  return node.id.slice('object:'.length);
}

function selectedTypeIdFromNode(node: GraphNode | null) {
  const value = node?.metadata?.['object_type_id'];
  return typeof value === 'string' ? value : '';
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function numericValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function objectLabelFromProperties(properties: Record<string, unknown>) {
  for (const key of ['name', 'title', 'display_name', 'label', 'code', 'identifier', 'id']) {
    const value = properties[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return 'Object';
}

function looksLikeIso(value: unknown) {
  return typeof value === 'string' && /\d{4}-\d{2}-\d{2}/.test(value);
}

function detectDateField(properties: Record<string, unknown>) {
  const keys = Object.keys(properties);
  return (
    keys.find((key) => /date|time|timestamp|day|week|month/i.test(key) && looksLikeIso(properties[key])) ??
    keys.find((key) => looksLikeIso(properties[key])) ??
    ''
  );
}

function detectMetricField(properties: Record<string, unknown>) {
  const keys = Object.keys(properties);
  return (
    keys.find(
      (key) =>
        /score|value|count|duration|delay|cost|risk|load|temperature|pressure/i.test(key) &&
        numericValue(properties[key]) !== null,
    ) ??
    keys.find((key) => numericValue(properties[key]) !== null) ??
    ''
  );
}

function detectTemporalFields(properties: Record<string, unknown>) {
  const keys = Object.keys(properties);
  const start =
    keys.find((key) => /start|opened|begin|from|scheduled_start/i.test(key) && looksLikeIso(properties[key])) ??
    '';
  const end =
    keys.find((key) => /end|closed|finish|to|scheduled_end/i.test(key) && looksLikeIso(properties[key])) ??
    '';
  return { start, end };
}

function detectMediaField(properties: Record<string, unknown>) {
  const keys = Object.keys(properties);
  return (
    keys.find((key) => /image|media|photo|thumbnail|diagram|url/i.test(key) && typeof properties[key] === 'string') ??
    ''
  );
}

function detectAnnotationField(properties: Record<string, unknown>) {
  return Object.keys(properties).find((key) => /coordinate|bbox|bound|annotation|polygon|box/i.test(key)) ?? '';
}

function coerceScenarioValue(raw: string, original: unknown) {
  if (typeof original === 'number') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : original;
  }
  if (typeof original === 'boolean') return raw.trim().toLowerCase() === 'true';
  if (typeof original === 'object' && raw.trim().startsWith('{')) {
    try {
      return JSON.parse(raw);
    } catch {
      return original;
    }
  }
  return raw;
}

function normalizeAnnotationFrame(x: number, y: number, width: number, height: number) {
  const scale = Math.max(x, y, width, height) > 100 ? 10 : 1;
  return {
    x: Math.max(0, Math.min(90, x / scale)),
    y: Math.max(0, Math.min(90, y / scale)),
    width: Math.max(4, Math.min(70, width / scale)),
    height: Math.max(4, Math.min(70, height / scale)),
  };
}

function parseCoordinates(value: unknown) {
  if (Array.isArray(value) && value.length >= 4) {
    const [x, y, width, height] = value.map((item) => Number(item));
    if ([x, y, width, height].every((item) => Number.isFinite(item))) {
      return normalizeAnnotationFrame(x, y, width, height);
    }
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      return parseCoordinates(JSON.parse(value));
    } catch {
      const parts = value.split(/[,\s]+/).map((item) => Number(item));
      if (parts.length >= 4 && parts.every((item) => Number.isFinite(item))) {
        return normalizeAnnotationFrame(parts[0], parts[1], parts[2], parts[3]);
      }
    }
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const x = Number(record.x ?? record.left ?? 0);
    const y = Number(record.y ?? record.top ?? 0);
    const width = Number(record.width ?? record.w ?? 0);
    const height = Number(record.height ?? record.h ?? 0);
    if ([x, y, width, height].every((item) => Number.isFinite(item))) {
      return normalizeAnnotationFrame(x, y, width, height);
    }
  }
  return null;
}

function loadTemplatesFromStorage(): VertexTemplate[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.templates) ?? '[]');
  } catch {
    return [];
  }
}

function loadAnnotationsFromStorage(): Record<string, VertexAnnotation[]> {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.annotations) ?? '{}');
  } catch {
    return {};
  }
}

function defaultSystemGraphTemplates(): SystemGraphTemplate[] {
  return [
    { id: 'sg1', key: 'supply_chain', version: '1.0.0', name: 'Supply chain', description: 'Vendor to facilities traversal.', orgsEnabled: ['global', 'ops'], rootTypeHint: 'Vendor', depth: 2, traversalPattern: 'Vendor -[supplies]-> Facility -[ships_to]-> DistributionCenter' },
    { id: 'sg2', key: 'fraud_ring', version: '1.0.0', name: 'Fraud rings', description: 'Account ring detection traversal.', orgsEnabled: ['global', 'risk'], rootTypeHint: 'Account', depth: 3, traversalPattern: 'Account -[transacted]-> Account -[linked_to]-> Identity' },
    { id: 'sg3', key: 'infrastructure_dependencies', version: '1.0.0', name: 'Infrastructure dependencies', description: 'Service dependency traversal.', orgsEnabled: ['global', 'platform'], rootTypeHint: 'Service', depth: 2, traversalPattern: 'Service -[depends_on]-> Service -[hosted_on]-> Cluster' },
  ];
}

function loadSystemGraphs(): SystemGraphTemplate[] {
  if (typeof localStorage === 'undefined') return defaultSystemGraphTemplates();
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.systemGraphs) ?? '[]') as unknown;
    if (Array.isArray(parsed) && parsed.length) return parsed as SystemGraphTemplate[];
  } catch {}
  return defaultSystemGraphTemplates();
}

export function VertexPage() {
  const [searchParams] = useSearchParams();
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [visualFunctions, setVisualFunctions] = useState<QuiverVisualFunction[]>([]);
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [graphLoading, setGraphLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [neighborLoading, setNeighborLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');

  const [rootTypeId, setRootTypeId] = useState('');
  const [rootObjectId, setRootObjectId] = useState('');
  const [depth, setDepth] = useState(2);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('cose');
  const [nodeDisplayMode, setNodeDisplayMode] = useState<NodeDisplayMode>('compact');
  const [activeTab, setActiveTab] = useState<SidebarTab>('selection');

  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState('');
  const cyRef = useRef<Core | null>(null);
  // We also keep the cytoscape Core in React state so child overlays
  // (event badges, future linked-events context menu) re-render when
  // the canvas instance becomes available.
  const [cyInstance, setCyInstance] = useState<Core | null>(null);
  // Right-click context menu for a graph node. The {x, y} are
  // relative to the canvas wrapper (renderedPosition from cytoscape).
  const [nodeContextMenu, setNodeContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [pinnedPositions, setPinnedPositions] = useState<Record<string, { x: number; y: number }>>({});

  // D.1 — Saved styles (profile snapshots of the visualisation
  // fields) and Saved selections (named bags of node ids with a
  // colour ring). Both persist to localStorage per analysisRid so
  // they survive a reload.
  const [savedStyles, setSavedStyles] = useState<SavedStyle[]>([]);
  const [activeStyleId, setActiveStyleId] = useState<string>('');
  const [savedSelections, setSavedSelections] = useState<SavedSelection[]>([]);
  // D.3 — Edge groupings collapse transactional nodes between two
  // endpoints onto the edge between them; the original nodes are
  // kept in the bucket so Ungroup can restore them.
  const [edgeGroupings, setEdgeGroupings] = useState<EdgeGrouping[]>([]);

  // D.2 — Advanced settings the gear-icon companion of each layout
  // populates. Stored as a single record so the panel can render the
  // right controls based on the active layoutMode.
  const [layoutAdvanced, setLayoutAdvanced] = useState({
    hierarchyReverse: false,
    hierarchyOrientation: 'tb' as 'tb' | 'lr',
    hierarchyRoots: [] as string[], // node ids; empty = automatic
    clusterByProperty: '' as string,
    cartesianXProperty: '' as string,
    cartesianYProperty: '' as string,
    cartesianReverseX: false,
    cartesianReverseY: false,
    radialDensity: 3 as number, // 1-5 spacing factor
  });

  // D.4 — Edge styling bundle. Drives cytoscape curve-style (line
  // type), per-edge width from a property (or count for aggregate
  // edges produced by D.3), arrow visibility, edge label, and label
  // aggregation across grouped edges.
  const [edgeStyling, setEdgeStyling] = useState({
    lineType: 'curved' as 'curved' | 'straight' | 'orthogonal',
    widthByProperty: '' as string,
    widthAggregate: 'sum' as 'sum' | 'count' | 'avg' | 'max',
    widthMin: 1 as number,
    widthMax: 8 as number,
    widthInvert: false,
    showArrows: true,
    showReversed: false,
    labelByProperty: '' as string,
    labelAggregate: 'count' as 'sum' | 'count' | 'avg' | 'max',
  });

  const [subtitleField, setSubtitleField] = useState('');
  const [extendedLabelField, setExtendedLabelField] = useState('');
  const [colorByField, setColorByField] = useState('');
  const [timeField, setTimeField] = useState('');
  const [eventStartField, setEventStartField] = useState('');
  const [eventEndField, setEventEndField] = useState('');
  const [mediaField, setMediaField] = useState('');
  const [annotationField, setAnnotationField] = useState('');
  const [selectedLensId, setSelectedLensId] = useState('');

  const [templates, setTemplates] = useState<VertexTemplate[]>(() => loadTemplatesFromStorage());
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');

  // ── Graph template authoring (Phase Vertex-A) ──
  // The TemplateBuilder drawer asks for object/non-object parameters,
  // Search Around bindings, layer styling, and graph defaults; the
  // UseTemplateDialog prompts a consumer for the matching values.
  const [templateBuilderOpen, setTemplateBuilderOpen] = useState(false);
  const [useTemplateOpen, setUseTemplateOpen] = useState(false);
  const [savedGraphTemplates, setSavedGraphTemplates] = useState<GraphTemplate[]>([]);
  const [activeGraphTemplate, setActiveGraphTemplate] = useState<GraphTemplate | null>(null);

  const [neighborResults, setNeighborResults] = useState<NeighborLink[]>([]);
  const [neighborPage, setNeighborPage] = useState(1);
  const [neighborTotal, setNeighborTotal] = useState(0);
  const [neighborHasMore, setNeighborHasMore] = useState(false);
  const [neighborHiddenCount, setNeighborHiddenCount] = useState(0);
  const [neighborRestrictedCount, setNeighborRestrictedCount] = useState(0);
  const [explainOnDemand, setExplainOnDemand] = useState(false);
  const [lastExplainPlan, setLastExplainPlan] = useState<string>('');
  const [lastExpansionCost, setLastExpansionCost] = useState<{ estimated: number; actual: number; rows: number; indices: number } | null>(null);
  const [analysisBudgetCpuSeconds, setAnalysisBudgetCpuSeconds] = useState(0.05);
  const [allowOverBudgetExpansion, setAllowOverBudgetExpansion] = useState(false);
  const [neighborLinkTypeFilter, setNeighborLinkTypeFilter] = useState('');
  const [neighborTargetTypeFilter, setNeighborTargetTypeFilter] = useState('');
  const [neighborHopDepth, setNeighborHopDepth] = useState<1 | 2 | 3>(1);
  const [searchAroundFilter, setSearchAroundFilter] = useState('');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState<SearchResult[]>([]);
  const [seedSource, setSeedSource] = useState<'single_object' | 'object_set' | 'object_explorer' | 'workshop_variable'>('single_object');
  const [seedObjectSetRid, setSeedObjectSetRid] = useState('');
  const [seedAppliedFilters, setSeedAppliedFilters] = useState('');
  const [traversalPattern, setTraversalPattern] = useState('Person -[owns]-> Account -[transacted]-> Person');
  const [traversalFilter, setTraversalFilter] = useState('');
  const [traversalPlan, setTraversalPlan] = useState<string[]>([]);
  const [traversalWarning, setTraversalWarning] = useState('');
  const [nodeTypeFilter, setNodeTypeFilter] = useState('');
  const [nodePropertyFilter, setNodePropertyFilter] = useState('');
  const [minDegreeFilter, setMinDegreeFilter] = useState(0);
  const [edgeTypeFilter, setEdgeTypeFilter] = useState('');
  const [groupByMode, setGroupByMode] = useState<'none' | 'type' | 'property'>('none');
  const [groupByProperty, setGroupByProperty] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [inlineSearchQuery, setInlineSearchQuery] = useState('');
  const inlineSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [nodeLabelProperty, setNodeLabelProperty] = useState('');
  const [nodeSizeProperty, setNodeSizeProperty] = useState('');
  const [nodeIconMode, setNodeIconMode] = useState<'dot' | 'diamond' | 'hexagon'>('dot');
  const [edgeLabelProperty, setEdgeLabelProperty] = useState('');
  const [edgeDashEnabled, setEdgeDashEnabled] = useState(false);

  const [cachedTypeRows, setCachedTypeRows] = useState<Record<string, ObjectInstance[]>>({});
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0);
  const [timelineEventTypes, setTimelineEventTypes] = useState<string[]>([]);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [timelineSpeedMs, setTimelineSpeedMs] = useState(900);
  const [timelineRange, setTimelineRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  const [customAnnotations, setCustomAnnotations] = useState<Record<string, VertexAnnotation[]>>(() =>
    loadAnnotationsFromStorage(),
  );
  const [annotationLabel, setAnnotationLabel] = useState('');
  const [annotationColor, setAnnotationColor] = useState('#ef4444');
  const [annotationNote, setAnnotationNote] = useState('');
  const [annotationX, setAnnotationX] = useState(18);
  const [annotationY, setAnnotationY] = useState(18);
  const [annotationWidth, setAnnotationWidth] = useState(24);
  const [annotationHeight, setAnnotationHeight] = useState(16);
  const [mediaPermissionMode, setMediaPermissionMode] = useState<'allowed' | 'denied'>('allowed');
  const [mediaMarkings, setMediaMarkings] = useState('public');
  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [mediaAttachmentByNode, setMediaAttachmentByNode] = useState<Record<string, { type: 'image' | 'video' | 'pdf'; url: string; markings: string }>>({});
  const [systemGraphTemplates] = useState<SystemGraphTemplate[]>(() => loadSystemGraphs());
  const [selectedSystemGraphId, setSelectedSystemGraphId] = useState('');
  const [currentOrg, setCurrentOrg] = useState('global');

  const [scenarioDrafts, setScenarioDrafts] = useState<ScenarioDraft[]>([
    {
      name: 'Optimistic case',
      description: 'Improve one modeled input to understand downstream impact.',
      propertyName: '',
      propertyValue: '',
    },
    {
      name: 'Stress case',
      description: 'Apply a second override to compare a more constrained state.',
      propertyName: '',
      propertyValue: '',
    },
  ]);
  const [scenarioResponse, setScenarioResponse] = useState<ObjectScenarioSimulationResponse | null>(null);
  const [analysisRid] = useState('ri.foundry.main.vertex-analysis.local-default');
  const [activeBranchRid, setActiveBranchRid] = useState('');
  // Search Around panel toggle + tenant resolved from the signed-in
  // user's organization. When the user has no org set, the panel
  // surfaces an inline error from the backend (400) rather than
  // crashing here.
  const [searchAroundOpen, setSearchAroundOpen] = useState(false);
  const currentUser = useCurrentUser();
  const vertexTenant = currentUser?.organization_id ?? '';
  // Slice 6: link-summary dropdown shown next to "Expand neighbors"
  // and chip-based filters minted from the Histogram tab.
  const [linkSummaryOpen, setLinkSummaryOpen] = useState(false);
  const [histogramChips, setHistogramChips] = useState<HistogramFilterChip[]>([]);
  const [activeBranchName, setActiveBranchName] = useState('');
  const [proposalApproved, setProposalApproved] = useState(false);
  const [workshopReadOnly, setWorkshopReadOnly] = useState(false);
  const [workshopObjectSetVariable, setWorkshopObjectSetVariable] = useState('');
  const [hoveredElementId, setHoveredElementId] = useState('');
  const [objectViewHopBudget, setObjectViewHopBudget] = useState(2);
  const [centralityCache, setCentralityCache] = useState<Record<string, Array<{ nodeId: string; betweenness: number; eigenvector: number }>>>({});
  const [pathResult, setPathResult] = useState<string[]>([]);
  const [savedScenarios, setSavedScenarios] = useState<VertexScenario[]>([]);
  const [showScenarioOverlay, setShowScenarioOverlay] = useState(true);
  const [showBaselineLayer, setShowBaselineLayer] = useState(true);
  const [promotedActionsPreview, setPromotedActionsPreview] = useState<Array<{order:number;actionId:string;mode:string;approval:string;payload:unknown}>>([]);

  const typeMap = useMemo(() => new Map(objectTypes.map((item) => [item.id, item])), [objectTypes]);

  // Pull the per-app capabilities each object type has been tagged
  // with — Vertex consumes app_capabilities.vertex_event to render
  // notification-style badges and colour event rows in the sidebar.
  // We key by both id and display_name so we can look up an event by
  // whichever label the graph node was rendered with.
  const eventIntentByTypeKey = useMemo(() => {
    const map = new Map<string, { intent: string; tone: string; valueProperty?: string; valueUnit?: string }>();
    const toneFor = (intent: string): string => {
      switch (intent) {
        case 'danger':
          return '#f87171';
        case 'warning':
          return '#fbbf24';
        case 'success':
          return '#34d399';
        case 'primary':
          return '#60a5fa';
        default:
          return '#94a3b8';
      }
    };
    for (const t of objectTypes) {
      const vEvent = (t.app_capabilities?.vertex_event ?? null) as
        | { event_intent?: string; value_property_id?: string; value_unit?: string }
        | null;
      if (!vEvent?.event_intent || vEvent.event_intent === 'none') continue;
      const entry = {
        intent: vEvent.event_intent,
        tone: toneFor(vEvent.event_intent),
        valueProperty: vEvent.value_property_id,
        valueUnit: vEvent.value_unit,
      };
      map.set(t.id, entry);
      map.set(t.display_name, entry);
      if (t.name) map.set(t.name, entry);
    }
    return map;
  }, [objectTypes]);
  const selectedNode = useMemo(
    () => graph?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [graph, selectedNodeId],
  );
  const selectedNodeProperties = useMemo(
    () => (selectedNode ? parseRecord(selectedNode.metadata?.properties) : {}),
    [selectedNode],
  );
  const selectedEdge = useMemo(() => graph?.edges.find((edge) => edge.id === selectedEdgeId) ?? null, [graph, selectedEdgeId]);

  // Persist templates / annotations when they change.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inlineSearchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.templates, JSON.stringify(templates));
    }
  }, [templates]);
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.annotations, JSON.stringify(customAnnotations));
    }
  }, [customAnnotations]);
  useEffect(() => {
    let cancelled = false;
    listVertexScenarios(analysisRid)
      .then((scenarios) => {
        if (!cancelled) setSavedScenarios(scenarios);
      })
      .catch(() => {
        if (!cancelled) setSavedScenarios([]);
      });
    return () => {
      cancelled = true;
    };
  }, [analysisRid]);
  useEffect(() => {
    setActiveBranchRid(searchParams.get('branchRid') ?? '');
    setActiveBranchName(searchParams.get('branchName') ?? '');
    setWorkshopReadOnly((searchParams.get('workshopReadOnly') ?? '') === '1');
    setWorkshopObjectSetVariable(searchParams.get('workshopObjectSetVariable') ?? '');
    const hop = Number(searchParams.get('hopBudget') ?? '');
    if (Number.isFinite(hop) && hop > 0) setObjectViewHopBudget(Math.min(6, hop));

    // Seed preloads from the URL — `objectSetRid` wins over the
    // single-object `objectRid` when both are present (one is a
    // superset of the other), and either takes precedence over the
    // pre-existing `seedObjectSetRid` query so a fresh deep-link
    // always lands on the requested set.
    const preloadSet = searchParams.get('objectSetRid') ?? searchParams.get('seedObjectSetRid');
    const preloadObject = searchParams.get('objectRid');
    if (preloadSet) {
      setSeedObjectSetRid(preloadSet);
    } else if (preloadObject) {
      // Single-object preloads borrow the seed channel — the
      // traversal endpoint accepts either an object set rid or a
      // single object rid as the seed payload.
      setSeedObjectSetRid(preloadObject);
    }
  }, [searchParams]);

  // Global key handlers: Esc dismisses any floating overlay (right-
  // click menu) and Cmd/Ctrl+K focuses the inline graph search.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setNodeContextMenu(null);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inlineSearchInputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // D.1 / D.3 — Hydrate saved styles, saved selections, and edge
  // groupings from localStorage when the analysisRid changes (and
  // persist them whenever they mutate). Each is namespaced by
  // analysisRid so multiple graphs in the same browser don't bleed
  // into each other.
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      const stylesRaw = localStorage.getItem(`${STORAGE_KEYS.savedStyles}:${analysisRid}`);
      const activeStyleRaw = localStorage.getItem(`${STORAGE_KEYS.activeStyle}:${analysisRid}`);
      const selectionsRaw = localStorage.getItem(`${STORAGE_KEYS.savedSelections}:${analysisRid}`);
      const edgeGroupingsRaw = localStorage.getItem(`${STORAGE_KEYS.edgeGroupings}:${analysisRid}`);
      if (stylesRaw) setSavedStyles(JSON.parse(stylesRaw) as SavedStyle[]);
      if (activeStyleRaw) setActiveStyleId(activeStyleRaw);
      if (selectionsRaw) setSavedSelections(JSON.parse(selectionsRaw) as SavedSelection[]);
      if (edgeGroupingsRaw) setEdgeGroupings(JSON.parse(edgeGroupingsRaw) as EdgeGrouping[]);
    } catch {
      // ignore malformed localStorage payloads — they will be
      // overwritten by the next mutation.
    }
  }, [analysisRid]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(`${STORAGE_KEYS.savedStyles}:${analysisRid}`, JSON.stringify(savedStyles));
  }, [analysisRid, savedStyles]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    if (activeStyleId) {
      localStorage.setItem(`${STORAGE_KEYS.activeStyle}:${analysisRid}`, activeStyleId);
    } else {
      localStorage.removeItem(`${STORAGE_KEYS.activeStyle}:${analysisRid}`);
    }
  }, [analysisRid, activeStyleId]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(`${STORAGE_KEYS.savedSelections}:${analysisRid}`, JSON.stringify(savedSelections));
  }, [analysisRid, savedSelections]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(`${STORAGE_KEYS.edgeGroupings}:${analysisRid}`, JSON.stringify(edgeGroupings));
  }, [analysisRid, edgeGroupings]);

  // D.2 — Persist the layout advanced settings per analysisRid so a
  // tuned Cartesian/Hierarchy/Cluster comes back after a reload.
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(`of.vertex.layout-advanced.v1:${analysisRid}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<typeof layoutAdvanced>;
        setLayoutAdvanced((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore malformed payloads
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisRid]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(`of.vertex.layout-advanced.v1:${analysisRid}`, JSON.stringify(layoutAdvanced));
  }, [analysisRid, layoutAdvanced]);

  // D.4 — Persist edge styling per analysisRid.
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(`of.vertex.edge-styling.v1:${analysisRid}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<typeof edgeStyling>;
        setEdgeStyling((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore malformed payloads
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisRid]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(`of.vertex.edge-styling.v1:${analysisRid}`, JSON.stringify(edgeStyling));
  }, [analysisRid, edgeStyling]);

  // ---- D.1 — Saved style helpers ----

  function snapshotStyleFields(): SavedStyle['fields'] {
    return {
      subtitleField,
      extendedLabelField,
      colorByField,
      timeField,
      eventStartField,
      eventEndField,
      mediaField,
      annotationField,
      nodeDisplayMode,
      layoutMode,
      nodeLabelProperty,
      nodeSizeProperty,
      edgeLabelProperty,
      nodeIconMode,
    };
  }

  function applyStyleSnapshot(fields: SavedStyle['fields']) {
    setSubtitleField(fields.subtitleField);
    setExtendedLabelField(fields.extendedLabelField);
    setColorByField(fields.colorByField);
    setTimeField(fields.timeField);
    setEventStartField(fields.eventStartField);
    setEventEndField(fields.eventEndField);
    setMediaField(fields.mediaField);
    setAnnotationField(fields.annotationField);
    setNodeDisplayMode(fields.nodeDisplayMode);
    setLayoutMode(fields.layoutMode);
    setNodeLabelProperty(fields.nodeLabelProperty);
    setNodeSizeProperty(fields.nodeSizeProperty);
    setEdgeLabelProperty(fields.edgeLabelProperty);
    setNodeIconMode(fields.nodeIconMode);
  }

  function createSavedStyle(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const style: SavedStyle = {
      id: createId(),
      name: trimmed,
      createdAt: now,
      updatedAt: now,
      fields: snapshotStyleFields(),
    };
    setSavedStyles((prev) => [style, ...prev]);
    setActiveStyleId(style.id);
  }

  function applySavedStyle(id: string) {
    const target = savedStyles.find((s) => s.id === id);
    if (!target) return;
    applyStyleSnapshot(target.fields);
    setActiveStyleId(id);
  }

  function deleteSavedStyle(id: string) {
    setSavedStyles((prev) => prev.filter((s) => s.id !== id));
    setActiveStyleId((current) => (current === id ? '' : current));
  }

  function overwriteSavedStyle(id: string) {
    const now = new Date().toISOString();
    setSavedStyles((prev) =>
      prev.map((s) => (s.id === id ? { ...s, updatedAt: now, fields: snapshotStyleFields() } : s)),
    );
  }

  // ---- D.1 — Saved selection helpers ----

  function createSavedSelection(name: string, nodeIds: string[]) {
    const trimmed = name.trim();
    if (!trimmed || nodeIds.length === 0) return;
    const now = new Date().toISOString();
    const colour = nextSelectionColor(savedSelections);
    const selection: SavedSelection = {
      id: createId(),
      name: trimmed,
      color: colour,
      nodeIds: Array.from(new Set(nodeIds)),
      visible: true,
      createdAt: now,
      updatedAt: now,
    };
    setSavedSelections((prev) => [selection, ...prev]);
  }

  function toggleSavedSelectionVisible(id: string) {
    setSavedSelections((prev) => prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)));
  }

  function deleteSavedSelection(id: string) {
    setSavedSelections((prev) => prev.filter((s) => s.id !== id));
  }

  function renameSavedSelection(id: string, name: string) {
    setSavedSelections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name: name.trim() || s.name, updatedAt: new Date().toISOString() } : s)),
    );
  }

  function quickSelectSaved(id: string) {
    const target = savedSelections.find((s) => s.id === id);
    if (!target) return;
    setSelectedNodeIds(target.nodeIds);
    setSelectedNodeId(target.nodeIds[0] ?? '');
  }

  // Compute the colour rings per node from the currently visible
  // saved selections. The ring order follows the savedSelections
  // array so the most recently added selection ends up as the outer
  // ring — keeping the visual hierarchy stable across renders.
  const selectionRings = useMemo<SelectionRingSpec>(() => {
    const byNode: Record<string, string[]> = {};
    for (const selection of savedSelections) {
      if (!selection.visible) continue;
      for (const nodeId of selection.nodeIds) {
        if (!byNode[nodeId]) byNode[nodeId] = [];
        byNode[nodeId].push(selection.color);
      }
    }
    return { byNode };
  }, [savedSelections]);

  // ---- D.3 — Group into edge / Ungroup helpers ----

  // groupSelectedIntoEdge collapses the currently selected nodes
  // onto an aggregate edge when they share a transactional shape:
  // every selected node has exactly two distinct neighbours, and
  // all selected nodes share the *same* unordered pair of
  // neighbours. Returns a human-readable error string when the
  // selection does not qualify so the caller can surface it.
  function groupSelectedIntoEdge(): string | null {
    if (!graph || selectedNodeIds.length === 0) {
      return 'Select one or more transactional nodes first.';
    }
    const adjacency = new Map<string, Set<string>>();
    for (const edge of graph.edges) {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
      if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
      adjacency.get(edge.source)!.add(edge.target);
      adjacency.get(edge.target)!.add(edge.source);
    }
    let endpoints: [string, string] | null = null;
    for (const nodeId of selectedNodeIds) {
      const neighbours = Array.from(adjacency.get(nodeId) ?? []);
      if (neighbours.length !== 2) {
        return 'Each selected node must have exactly two distinct neighbours to be grouped into an edge.';
      }
      const sorted = neighbours.sort() as [string, string];
      if (!endpoints) {
        endpoints = sorted;
      } else if (endpoints[0] !== sorted[0] || endpoints[1] !== sorted[1]) {
        return 'Selected nodes must share the same two endpoints to collapse onto a single edge.';
      }
    }
    if (!endpoints) return 'Unable to determine grouping endpoints.';
    const labelTypeMap = new Map<string, number>();
    for (const nodeId of selectedNodeIds) {
      const node = graph.nodes.find((n) => n.id === nodeId);
      const key = (node?.secondary_label || node?.kind || 'item').toString();
      labelTypeMap.set(key, (labelTypeMap.get(key) ?? 0) + 1);
    }
    const labelParts = Array.from(labelTypeMap.entries()).map(([type, count]) => `${count} ${type}`);
    const label = labelParts.join(' · ');
    const grouping: EdgeGrouping = {
      id: createId(),
      endpointA: endpoints[0],
      endpointB: endpoints[1],
      collapsedNodeIds: Array.from(new Set(selectedNodeIds)),
      label,
      createdAt: new Date().toISOString(),
    };
    setEdgeGroupings((prev) => [grouping, ...prev]);
    setSelectedNodeIds([]);
    setSelectedNodeId('');
    return null;
  }

  function ungroupEdgeGrouping(id: string) {
    setEdgeGroupings((prev) => prev.filter((g) => g.id !== id));
  }

  function ungroupAggregateEdge(edgeId: string) {
    // Aggregate edges live under the synthetic id `grouping:<id>`.
    if (!edgeId.startsWith('grouping:')) return;
    const id = edgeId.slice('grouping:'.length);
    ungroupEdgeGrouping(id);
  }

  // Initial catalog load.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const [typesResponse, lensResponse] = await Promise.all([
          listObjectTypes({ per_page: 200 }),
          listQuiverVisualFunctions({ per_page: 100, include_shared: true }).catch(() => ({
            data: [] as QuiverVisualFunction[],
            total: 0,
            page: 1,
            per_page: 100,
          })),
        ]);
        if (cancelled) return;
        setObjectTypes(typesResponse.data);
        setVisualFunctions(lensResponse.data);
        if (typesResponse.data[0]) {
          setRootTypeId((current) => current || typesResponse.data[0].id);
        }
      } catch (cause) {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : 'Failed to load Vertex');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-select the first matching lens when the root type changes.
  useEffect(() => {
    if (!rootTypeId || selectedLensId) return;
    const matching = visualFunctions.find((lens) => lens.primary_type_id === rootTypeId);
    if (matching) setSelectedLensId(matching.id);
  }, [rootTypeId, visualFunctions, selectedLensId]);

  // Pull the user's saved graph templates so the "Use template…"
  // button has something to open. Refreshes when the builder closes
  // (a new template was likely just created).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const resp = await listGraphTemplates({ per_page: 100 });
        if (!cancelled) setSavedGraphTemplates(resp.items ?? []);
      } catch {
        if (!cancelled) setSavedGraphTemplates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateBuilderOpen]);

  // Load the graph whenever rootTypeId / rootObjectId / depth change.
  const loadGraph = useCallback(async () => {
    if (!rootTypeId && !rootObjectId) return;
    setGraphLoading(true);
    setLoadError('');
    setScenarioResponse(null);
    try {
      const next = await getOntologyGraph({
        root_object_id: rootObjectId || undefined,
        root_type_id: rootObjectId ? undefined : rootTypeId || undefined,
        depth,
        limit: 120,
      });
      setGraph(next);
      setSelectedNodeId(next.nodes[0]?.id ?? '');
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Failed to load Vertex graph');
      setGraph(null);
    } finally {
      setGraphLoading(false);
    }
  }, [rootTypeId, rootObjectId, depth]);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  // Cache the rows of the selected node's type.
  useEffect(() => {
    const typeId = selectedTypeIdFromNode(selectedNode);
    if (!typeId || cachedTypeRows[typeId]) return;
    let cancelled = false;
    (async () => {
      const rows: ObjectInstance[] = [];
      let page = 1;
      let total = 0;
      try {
        do {
          const response = await listObjects(typeId, { page, per_page: 100 });
          rows.push(...response.data);
          total = response.total;
          page += 1;
        } while (rows.length < total);
      } catch {
        // ignore — leave cache untouched
      }
      if (!cancelled) setCachedTypeRows((prev) => ({ ...prev, [typeId]: rows }));
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedNode, cachedTypeRows]);

  // Hydrate field defaults whenever the selected node changes.
  useEffect(() => {
    if (!selectedNode) return;
    const properties = parseRecord(selectedNode.metadata?.properties);
    setSubtitleField((current) => current || detectDateField(properties) || Object.keys(properties)[0] || '');
    setExtendedLabelField((current) => current || detectMetricField(properties));
    setColorByField((current) => current || detectMetricField(properties));
    setTimeField((current) => current || detectDateField(properties));
    const temporal = detectTemporalFields(properties);
    setEventStartField((current) => current || temporal.start);
    setEventEndField((current) => current || temporal.end);
    setMediaField((current) => current || detectMediaField(properties));
    setAnnotationField((current) => current || detectAnnotationField(properties));
    setScenarioDrafts((drafts) =>
      drafts[0]?.propertyName
        ? drafts
        : drafts.map((draft) => ({
            ...draft,
            propertyName: detectMetricField(properties) || Object.keys(properties)[0] || '',
          })),
    );
  }, [selectedNode]);

  // ── Derived data ──

  const selectedObjectRows = useMemo(() => {
    const typeId = selectedTypeIdFromNode(selectedNode);
    return typeId ? cachedTypeRows[typeId] ?? [] : [];
  }, [selectedNode, cachedTypeRows]);

  const selectedSeriesRows = useMemo(() => {
    if (!selectedObjectRows.length || !timeField || !extendedLabelField) return [];
    const buckets: Record<string, number> = {};
    for (const row of selectedObjectRows) {
      const bucket = String(row.properties[timeField] ?? '').slice(0, 10);
      if (!bucket) continue;
      const value = numericValue(row.properties[extendedLabelField]);
      if (value === null) continue;
      buckets[bucket] = (buckets[bucket] ?? 0) + value;
    }
    return Object.entries(buckets)
      .map(([date, value]) => ({ date, value: Number(value.toFixed(2)) }))
      .sort((left, right) => left.date.localeCompare(right.date));
  }, [selectedObjectRows, timeField, extendedLabelField]);

  const selectedGroupedRows = useMemo(() => {
    if (!selectedObjectRows.length) return [];
    const key = subtitleField || Object.keys(selectedObjectRows[0].properties)[0] || '';
    const buckets: Record<string, number> = {};
    for (const row of selectedObjectRows) {
      const group = String(row.properties[key] ?? 'Unknown');
      const value = numericValue(row.properties[extendedLabelField]);
      buckets[group] = (buckets[group] ?? 0) + (value ?? 1);
    }
    return Object.entries(buckets)
      .map(([group, value]) => ({ group, value: Number(value.toFixed(2)) }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 12);
  }, [selectedObjectRows, subtitleField, extendedLabelField]);

  const eventRows = useMemo(() => {
    if (!graph || !selectedNode) return [];
    const focus = selectedNode;
    const adjacentIds = graph.edges
      .filter((edge) => edge.source === focus.id || edge.target === focus.id)
      .map((edge) => (edge.source === focus.id ? edge.target : edge.source));
    const currentTime = selectedSeriesRows[currentTimeIndex]?.date;
    return graph.nodes
      .filter((node) => adjacentIds.includes(node.id))
      .map((node) => {
        const properties = parseRecord(node.metadata?.properties);
        const temporal = detectTemporalFields(properties);
        const start = String(properties[eventStartField || temporal.start] ?? '');
        const end = String(properties[eventEndField || temporal.end] ?? '');
        return {
          nodeId: node.id,
          label: node.label,
          start,
          end,
          typeLabel: node.secondary_label ?? node.kind,
          active:
            currentTime != null
              ? start.slice(0, 10) <= currentTime && currentTime <= end.slice(0, 10)
              : false,
        };
      })
      .filter((row) => row.start && row.end);
  }, [graph, selectedNode, selectedSeriesRows, currentTimeIndex, eventStartField, eventEndField]);

  const timelineTypeOptions = useMemo(
    () => Array.from(new Set(eventRows.map((row) => row.typeLabel))).filter(Boolean),
    [eventRows],
  );

  const filteredTimelineRows = useMemo(() => {
    return eventRows.filter((row) => {
      if (timelineEventTypes.length > 0 && !timelineEventTypes.includes(row.typeLabel)) return false;
      const idx = selectedSeriesRows.findIndex((series) => series.date === currentTimeLabel());
      if (idx < timelineRange.start || idx > timelineRange.end) return false;
      return true;
    });
  }, [eventRows, timelineEventTypes, timelineRange, selectedSeriesRows]);

  const timelineVisibleNodeIds = useMemo(() => new Set(filteredTimelineRows.filter((row) => row.active).map((row) => row.nodeId)), [filteredTimelineRows]);

  function nodeLabelFor(node: GraphNode) {
    const properties = parseRecord(node.metadata?.properties);
    const parts = [node.label];
    if (subtitleField && properties[subtitleField] != null) parts.push(String(properties[subtitleField]));
    if (extendedLabelField && properties[extendedLabelField] != null) parts.push(String(properties[extendedLabelField]));
    return parts.join('\n');
  }

  function nodeColorFor(node: GraphNode) {
    const properties = parseRecord(node.metadata?.properties);
    if (node.metadata?.scenario_changed === true) return '#f97316';
    if (node.metadata?.scenario_deleted === true) return '#ef4444';
    const eventMatch = eventRows.find((row) => row.nodeId === node.id);
    if (eventMatch?.active) return '#dc2626';
    if (colorByField) {
      const value = numericValue(properties[colorByField]);
      if (value !== null) {
        if (value >= 90) return '#991b1b';
        if (value >= 60) return '#ea580c';
        if (value >= 30) return '#0f766e';
      }
    }
    return node.color || '#2458b8';
  }

  function edgeWidthFor(edge: GraphEdge) {
    if (edge.metadata?.simulated === true) return 3.6;
    if (edge.metadata?.crosses_organization_boundary === true) return 2.8;
    return 1.8;
  }

  // Cytoscape elements + stylesheet, derived from graph + styling fields.
  const filteredGraph = useMemo(() => {
    if (!graph) return null;
    const degreeMap = new Map<string, number>();
    for (const edge of graph.edges) {
      degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + 1);
      degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + 1);
    }
    const visibleNodes = graph.nodes.filter((node) => {
      if (timelineVisibleNodeIds.size > 0 && !timelineVisibleNodeIds.has(node.id) && node.id !== selectedNodeId) return false;
      const typeOk = !nodeTypeFilter || selectedTypeIdFromNode(node) === nodeTypeFilter;
      const degreeOk = (degreeMap.get(node.id) ?? 0) >= minDegreeFilter;
      const propertyOk =
        !nodePropertyFilter ||
        JSON.stringify(parseRecord(node.metadata?.properties)).toLowerCase().includes(nodePropertyFilter.toLowerCase());
      if (!(typeOk && degreeOk && propertyOk)) return false;
      // Slice 6 — apply Histogram tab chips. A node passes when
      // every `to` chip matches AND no `out` chip matches. The
      // synthetic `@object_type` property compares against the
      // node's resolved typeId.
      if (histogramChips.length > 0) {
        const nodeProps = parseRecord(node.metadata?.properties);
        const typeId = selectedTypeIdFromNode(node);
        const matchesChip = (chip: HistogramFilterChip): boolean => {
          const actual =
            chip.property === '@object_type' ? typeId : nodeProps[chip.property];
          return JSON.stringify(actual) === JSON.stringify(chip.value);
        };
        for (const chip of histogramChips) {
          const matched = matchesChip(chip);
          if (chip.mode === 'to' && !matched) return false;
          if (chip.mode === 'out' && matched) return false;
        }
      }
      const props = parseRecord(node.metadata?.properties);
      const groupKey =
        groupByMode === 'type'
          ? selectedTypeIdFromNode(node) || 'unknown'
          : groupByMode === 'property'
          ? String(props[groupByProperty] ?? 'Unknown')
          : '';
      if (groupKey && collapsedGroups[groupKey]) return false;
      return true;
    });
    const visibleSet = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = graph.edges.filter((edge) => {
      if (!visibleSet.has(edge.source) || !visibleSet.has(edge.target)) return false;
      return !edgeTypeFilter || String(edge.metadata?.link_type_id ?? '').includes(edgeTypeFilter);
    });
    return { ...graph, nodes: visibleNodes, edges: visibleEdges };
  }, [graph, nodeTypeFilter, minDegreeFilter, nodePropertyFilter, edgeTypeFilter, groupByMode, groupByProperty, collapsedGroups, timelineVisibleNodeIds, selectedNodeId, histogramChips]);

  const groupCounts = useMemo(() => {
    if (!graph || groupByMode === 'none') return [] as Array<{ key: string; count: number }>;
    const buckets: Record<string, number> = {};
    for (const node of graph.nodes) {
      const props = parseRecord(node.metadata?.properties);
      const key =
        groupByMode === 'type'
          ? selectedTypeIdFromNode(node) || 'unknown'
          : String(props[groupByProperty] ?? 'Unknown');
      buckets[key] = (buckets[key] ?? 0) + 1;
    }
    return Object.entries(buckets).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  }, [graph, groupByMode, groupByProperty]);

  // Per-node aggregation of linked events. For every non-event node
  // we count how many adjacent nodes resolve to a type that has been
  // tagged with a vertex_event intent, and surface the most severe
  // intent so the badge tone reflects the worst signal.
  const nodeEventBadges = useMemo<Record<string, NodeEventBadge>>(() => {
    if (!filteredGraph) return {};
    const SEVERITY: Record<string, number> = {
      danger: 4,
      warning: 3,
      primary: 2,
      success: 1,
    };
    // Adjacency: build a Set per node id.
    const adjacency = new Map<string, Set<string>>();
    for (const edge of filteredGraph.edges) {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
      if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
      adjacency.get(edge.source)!.add(edge.target);
      adjacency.get(edge.target)!.add(edge.source);
    }
    const nodeById = new Map(filteredGraph.nodes.map((n) => [n.id, n]));
    const lookupIntent = (node: typeof filteredGraph.nodes[number]) => {
      const a = eventIntentByTypeKey.get(node.secondary_label ?? '');
      if (a) return a;
      return eventIntentByTypeKey.get(node.kind ?? '');
    };
    const out: Record<string, NodeEventBadge> = {};
    for (const node of filteredGraph.nodes) {
      // Event-shaped nodes themselves are not target hosts — they
      // are the badge data, not the badge owner.
      if (lookupIntent(node)) continue;
      const neighbours = adjacency.get(node.id);
      if (!neighbours || neighbours.size === 0) continue;
      let count = 0;
      let topIntent: string | null = null;
      let topTone: string | null = null;
      let topSeverity = -1;
      for (const otherId of neighbours) {
        const other = nodeById.get(otherId);
        if (!other) continue;
        const entry = lookupIntent(other);
        if (!entry) continue;
        count += 1;
        const sev = SEVERITY[entry.intent] ?? 0;
        if (sev > topSeverity) {
          topSeverity = sev;
          topIntent = entry.intent;
          topTone = entry.tone;
        }
      }
      if (count > 0 && topIntent && topTone) {
        out[node.id] = {
          count,
          intent: topIntent,
          tone: topTone,
          label: `${count} linked ${topIntent} event${count === 1 ? '' : 's'}`,
        };
      }
    }
    return out;
  }, [filteredGraph, eventIntentByTypeKey]);

  const cyElements = useMemo<ElementDefinition[]>(() => {
    if (!filteredGraph) return [];
    // D.3 — Compute the set of node ids that are currently
    // collapsed onto an aggregate edge. Those nodes (and edges
    // incident to them) are removed from the canvas in favour of a
    // single synthetic edge per grouping.
    const collapsedNodeIds = new Set<string>();
    for (const grouping of edgeGroupings) {
      for (const id of grouping.collapsedNodeIds) collapsedNodeIds.add(id);
    }
    // D.2 — Helper: cluster-by-property hashes the value to a stable
    // integer so cytoscape can sort nodes onto the same ring.
    const clusterProp = layoutMode === 'concentric' ? layoutAdvanced.clusterByProperty.trim() : '';
    const hashString = (s: string): number => {
      let h = 0;
      for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h + s.charCodeAt(i)) | 0;
      }
      return Math.abs(h);
    };
    // D.2 — Cartesian: read the chosen X/Y properties, normalise them
    // to a [-N, N] viewport-shaped range, and surface as preset
    // positions. Skipped if any property is missing on the node.
    const cartesianActive = layoutMode === 'cartesian';
    const xProp = layoutAdvanced.cartesianXProperty.trim();
    const yProp = layoutAdvanced.cartesianYProperty.trim();
    type Bounds = { min: number; max: number };
    const cartesianBounds: { x: Bounds; y: Bounds } = {
      x: { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
      y: { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
    };
    if (cartesianActive && xProp && yProp) {
      for (const node of filteredGraph.nodes) {
        const props = parseRecord(node.metadata?.properties);
        const xn = Number(numericValue(props[xProp]));
        const yn = Number(numericValue(props[yProp]));
        if (Number.isFinite(xn)) {
          cartesianBounds.x.min = Math.min(cartesianBounds.x.min, xn);
          cartesianBounds.x.max = Math.max(cartesianBounds.x.max, xn);
        }
        if (Number.isFinite(yn)) {
          cartesianBounds.y.min = Math.min(cartesianBounds.y.min, yn);
          cartesianBounds.y.max = Math.max(cartesianBounds.y.max, yn);
        }
      }
    }
    const cartesianRange = 480; // pixels half-extent
    const normalise = (v: number, b: Bounds, reverse: boolean): number | null => {
      if (!Number.isFinite(v) || b.min === b.max) return reverse ? cartesianRange : -cartesianRange;
      const t = (v - b.min) / (b.max - b.min);
      const scaled = (reverse ? 1 - t : t) * cartesianRange * 2 - cartesianRange;
      return scaled;
    };
    const nodeElements = filteredGraph.nodes
      .filter((node) => !collapsedNodeIds.has(node.id))
      .map((node) => {
        const props = parseRecord(node.metadata?.properties);
        let presetPosition: { x: number; y: number } | undefined = pinnedPositions[node.id];
        if (cartesianActive && xProp && yProp && !presetPosition) {
          const xn = Number(numericValue(props[xProp]));
          const yn = Number(numericValue(props[yProp]));
          const nx = normalise(xn, cartesianBounds.x, layoutAdvanced.cartesianReverseX);
          const ny = normalise(yn, cartesianBounds.y, layoutAdvanced.cartesianReverseY);
          if (nx != null && ny != null) presetPosition = { x: nx, y: ny };
        }
        const clusterRank = clusterProp
          ? (() => {
              const raw = props[clusterProp];
              if (raw == null) return 0;
              const num = Number(numericValue(raw));
              if (Number.isFinite(num)) return num;
              return hashString(String(raw)) % 100;
            })()
          : 0;
        return {
          data: {
            id: node.id,
            label:
              nodeLabelProperty && props[nodeLabelProperty] != null
                ? String(props[nodeLabelProperty])
                : nodeLabelFor(node),
            color: nodeColorFor(node),
            size:
              nodeSizeProperty && numericValue(props[nodeSizeProperty]) != null
                ? Math.max(24, Math.min(86, Number(numericValue(props[nodeSizeProperty]))))
                : nodeDisplayMode === 'card'
                ? 60
                : 26,
            clusterRank,
          },
          classes: selectedNodeIds.includes(node.id) ? 'is-multi-selected' : '',
          ...(presetPosition ? { position: presetPosition } : {}),
        };
      });
    // D.4 — Per-property width scaling. Collect the global range of
    // the chosen property across the visible edges so we can
    // normalise each edge into the [widthMin, widthMax] band.
    const widthProp = edgeStyling.widthByProperty.trim();
    const widthValues: number[] = [];
    if (widthProp) {
      for (const edge of filteredGraph.edges) {
        if (collapsedNodeIds.has(edge.source) || collapsedNodeIds.has(edge.target)) continue;
        const raw = edge.metadata?.[widthProp];
        const num = Number(numericValue(raw));
        if (Number.isFinite(num)) widthValues.push(num);
      }
    }
    const widthDomain = {
      min: widthValues.length > 0 ? Math.min(...widthValues) : 0,
      max: widthValues.length > 0 ? Math.max(...widthValues) : 0,
    };
    const scaleWidth = (value: number): number => {
      const lo = edgeStyling.widthMin;
      const hi = edgeStyling.widthMax;
      if (widthDomain.max === widthDomain.min) return (lo + hi) / 2;
      const t = (value - widthDomain.min) / (widthDomain.max - widthDomain.min);
      const norm = edgeStyling.widthInvert ? 1 - t : t;
      return lo + norm * (hi - lo);
    };
    // D.4 — Aggregate helper used both for per-edge labels and for
    // the synthetic D.3 grouping edges. `count` ignores the value
    // and returns the number of contributing edges.
    const aggregate = (values: number[], kind: typeof edgeStyling.widthAggregate): number => {
      if (values.length === 0) return 0;
      switch (kind) {
        case 'sum':
          return values.reduce((a, b) => a + b, 0);
        case 'avg':
          return values.reduce((a, b) => a + b, 0) / values.length;
        case 'max':
          return Math.max(...values);
        case 'count':
        default:
          return values.length;
      }
    };
    const edgeElements = filteredGraph.edges
      .filter((edge) => !collapsedNodeIds.has(edge.source) && !collapsedNodeIds.has(edge.target))
      .map((edge) => {
        let width = edgeWidthFor(edge) + (edge.metadata?.simulated === true ? 0.6 : 0);
        if (widthProp) {
          const num = Number(numericValue(edge.metadata?.[widthProp]));
          if (Number.isFinite(num)) width = scaleWidth(num);
        }
        const labelProp = edgeStyling.labelByProperty.trim() || edgeLabelProperty;
        const label = labelProp && edge.metadata?.[labelProp] != null
          ? String(edge.metadata[labelProp])
          : edge.label;
        return {
          data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            label,
            width,
            lineStyle: edgeDashEnabled || edge.metadata?.simulated === true ? 'dashed' : 'solid',
          },
          classes: selectedEdgeId === edge.id ? 'is-edge-selected' : '',
        };
      });
    // Synthetic aggregate edges, one per grouping. We only add the
    // synthetic edge when both endpoints survive the node filter
    // — otherwise the grouping is dangling and we drop it from the
    // canvas this render.
    const surviving = new Set(nodeElements.map((n) => n.data.id));
    // Pre-index the original edges by endpoint pair for the D.3
    // aggregate lookup so we don't rescan filteredGraph.edges per
    // grouping.
    const edgesByEndpoints = new Map<string, typeof filteredGraph.edges>();
    for (const edge of filteredGraph.edges) {
      const pair = [edge.source, edge.target].sort().join('::');
      if (!edgesByEndpoints.has(pair)) edgesByEndpoints.set(pair, []);
      edgesByEndpoints.get(pair)!.push(edge);
    }
    const aggregateEdges = edgeGroupings
      .filter((g) => surviving.has(g.endpointA) && surviving.has(g.endpointB))
      .map((g) => {
        const collapsedSet = new Set(g.collapsedNodeIds);
        // Find every original edge incident to any collapsed node.
        // The aggregate property is read off those edges; the
        // count is the number of collapsed nodes that participate.
        const incident = filteredGraph.edges.filter(
          (e) => collapsedSet.has(e.source) || collapsedSet.has(e.target),
        );
        const widthValuesForGrouping = widthProp
          ? incident
              .map((e) => Number(numericValue(e.metadata?.[widthProp])))
              .filter((n) => Number.isFinite(n))
          : [];
        const labelProp = edgeStyling.labelByProperty.trim();
        const labelValuesForGrouping = labelProp
          ? incident
              .map((e) => Number(numericValue(e.metadata?.[labelProp])))
              .filter((n) => Number.isFinite(n))
          : [];
        const width = widthProp && widthValuesForGrouping.length > 0
          ? scaleWidth(aggregate(widthValuesForGrouping, edgeStyling.widthAggregate))
          : 3 + Math.min(4, Math.log2(g.collapsedNodeIds.length + 1));
        const label = labelProp && labelValuesForGrouping.length > 0
          ? `${g.label} · ${edgeStyling.labelAggregate} ${labelProp} = ${formatAggregate(aggregate(labelValuesForGrouping, edgeStyling.labelAggregate))}`
          : g.label;
        return {
          data: {
            id: `grouping:${g.id}`,
            source: g.endpointA,
            target: g.endpointB,
            label,
            width,
            lineStyle: 'solid',
          },
          classes: 'is-aggregate-edge',
        };
      });
    return [...nodeElements, ...edgeElements, ...aggregateEdges];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredGraph, subtitleField, extendedLabelField, colorByField, eventRows, pinnedPositions, nodeLabelProperty, nodeSizeProperty, nodeDisplayMode, selectedNodeIds, edgeLabelProperty, edgeDashEnabled, selectedEdgeId, edgeGroupings, layoutMode, layoutAdvanced, edgeStyling]);

  const cyStylesheet = useMemo<StylesheetStyle[]>(() => {
    const fontSize = nodeDisplayMode === 'card' ? 11 : 10;
    const padding = nodeDisplayMode === 'card' ? '18px' : '12px';
    const maxWidth = nodeDisplayMode === 'card' ? '150' : '110';
    const shape = nodeIconMode === 'diamond' ? 'diamond' : nodeIconMode === 'hexagon' ? 'hexagon' : 'ellipse';
    return [
      {
        selector: 'node',
        style: {
          'background-color': 'data(color)',
          label: 'data(label)',
          color: '#10233f',
          'font-size': fontSize,
          'font-family': 'Georgia, "Times New Roman", serif',
          'text-wrap': 'wrap',
          'text-max-width': maxWidth,
          'text-valign': 'center',
          'text-halign': 'center',
          width: 'data(size)',
          height: 'data(size)',
          shape,
          padding,
          'border-width': 1.4,
          'border-color': '#d6dfef',
        },
      },
      {
        selector: 'node:selected',
        style: { 'border-color': '#0f172a', 'border-width': 4 },
      },
      {
        selector: 'node.is-multi-selected',
        style: { 'border-color': '#7c3aed', 'border-width': 4 },
      },
      {
        selector: 'node.of-inline-match',
        style: { 'border-color': '#f59e0b', 'border-width': 5 },
      },
      {
        selector: 'edge',
        style: {
          label: 'data(label)',
          width: 'data(width)' as unknown as number,
          'line-color': '#94a3b8',
          'target-arrow-color': '#94a3b8',
          'source-arrow-color': '#94a3b8',
          // D.4 — Arrow visibility + direction. When `showReversed`
          // is on we paint the arrow at the source end instead of
          // the target end.
          'target-arrow-shape': edgeStyling.showArrows && !edgeStyling.showReversed ? 'triangle' : 'none',
          'source-arrow-shape': edgeStyling.showArrows && edgeStyling.showReversed ? 'triangle' : 'none',
          // D.4 — Line type maps to cytoscape's curve-style:
          //   curved      → bezier   (default)
          //   straight    → straight
          //   orthogonal  → taxi     (right-angled edges)
          'curve-style':
            edgeStyling.lineType === 'straight'
              ? 'straight'
              : edgeStyling.lineType === 'orthogonal'
              ? 'taxi'
              : 'bezier',
          'line-style': 'data(lineStyle)' as unknown as 'solid',
          'font-size': 9,
          color: '#64748b',
          'text-rotation': 'autorotate',
        },
      },
      {
        selector: 'edge.is-edge-selected',
        style: { 'line-color': '#7c3aed', 'target-arrow-color': '#7c3aed', 'source-arrow-color': '#7c3aed', width: 4 },
      },
      {
        selector: 'edge.is-aggregate-edge',
        style: {
          'line-color': '#475569',
          'target-arrow-color': '#475569',
          'source-arrow-color': '#475569',
          'font-weight': 600,
        },
      },
    ];
  }, [nodeDisplayMode, nodeIconMode, edgeStyling]);

  const cyLayout = useMemo(() => {
    const base = { animate: true, padding: 36 };
    switch (layoutMode) {
      case 'breadthfirst': {
        // Hierarchy: directed BFS with optional reverse and explicit
        // root nodes. `transform` swaps x/y for left-to-right
        // orientation; `reverse` flips the depth axis.
        const isLR = layoutAdvanced.hierarchyOrientation === 'lr';
        return {
          ...base,
          name: 'breadthfirst',
          directed: true,
          roots: layoutAdvanced.hierarchyRoots.length > 0 ? layoutAdvanced.hierarchyRoots : undefined,
          transform: (_node: unknown, pos: { x: number; y: number }) => {
            let x = pos.x;
            let y = pos.y;
            if (isLR) {
              const tmp = x;
              x = y;
              y = tmp;
            }
            if (layoutAdvanced.hierarchyReverse) {
              if (isLR) x = -x;
              else y = -y;
            }
            return { x, y };
          },
        } as Parameters<typeof CytoscapeCanvas>[0]['layout'];
      }
      case 'concentric': {
        // Cluster by property: nodes that share the same value end up
        // on the same ring. Empty property falls back to default
        // concentric which clusters by degree.
        const prop = layoutAdvanced.clusterByProperty.trim();
        if (!prop) {
          return { ...base, name: 'concentric' } as Parameters<typeof CytoscapeCanvas>[0]['layout'];
        }
        return {
          ...base,
          name: 'concentric',
          concentric: (node: { data: (k: string) => unknown }) => {
            const raw = node.data('clusterRank');
            return typeof raw === 'number' ? raw : 0;
          },
          levelWidth: () => 1,
        } as Parameters<typeof CytoscapeCanvas>[0]['layout'];
      }
      case 'radial': {
        // Single-ring concentric anchored at the selected node when
        // one is selected; otherwise just lay everything on one ring.
        const center = selectedNodeId;
        const density = Math.max(1, Math.min(5, layoutAdvanced.radialDensity));
        return {
          ...base,
          name: 'concentric',
          concentric: (node: { id: () => string }) => (node.id() === center ? 100 : 1),
          levelWidth: () => 1,
          minNodeSpacing: 10 * density,
        } as Parameters<typeof CytoscapeCanvas>[0]['layout'];
      }
      case 'cartesian': {
        // Use the positions already set on each node by cyElements
        // (we precompute them from the X/Y property selection).
        return { ...base, name: 'preset' } as Parameters<typeof CytoscapeCanvas>[0]['layout'];
      }
      default:
        return { ...base, name: layoutMode } as Parameters<typeof CytoscapeCanvas>[0]['layout'];
    }
  }, [layoutMode, layoutAdvanced, selectedNodeId]);

  const handleCytoscapeReady = useCallback((cy: Core) => {
    cyRef.current = cy;
    setCyInstance(cy);
    cy.on('tap', 'node', (event: EventObject) => {
      const id = String(event.target.id());
      setSelectedNodeId(id);
      const maybeMulti = (event.originalEvent as MouseEvent | undefined)?.shiftKey;
      setSelectedNodeIds((prev) => (maybeMulti ? Array.from(new Set([...prev, id])) : [id]));
      setSelectedEdgeId('');
      setNodeContextMenu(null);
    });
    cy.on('tap', 'edge', (event: EventObject) => {
      setSelectedEdgeId(String(event.target.id()));
      setNodeContextMenu(null);
    });
    // Tap on empty canvas dismisses the context menu.
    cy.on('tap', (event: EventObject) => {
      if (event.target === cy) setNodeContextMenu(null);
    });
    cy.on('cxttap', 'node', (event: EventObject) => {
      const id = String(event.target.id());
      const rp = event.target.renderedPosition();
      setSelectedNodeId(id);
      setNodeContextMenu({ nodeId: id, x: rp.x, y: rp.y });
      const orig = event.originalEvent as MouseEvent | TouchEvent | undefined;
      if (orig && typeof (orig as MouseEvent).preventDefault === 'function') {
        (orig as MouseEvent).preventDefault();
      }
    });
    cy.on('mouseover', 'node,edge', (event: EventObject) => {
      setHoveredElementId(String(event.target.id()));
    });
    cy.on('dragfree', 'node', (event: EventObject) => {
      const id = String(event.target.id());
      const pos = event.target.position();
      setPinnedPositions((prev) => ({ ...prev, [id]: { x: pos.x, y: pos.y } }));
      event.target.lock();
    });
    cy.on('viewport pan zoom', () => {
      // A repositioning gesture invalidates the floating context menu
      // — we close it rather than chase the node around.
      setNodeContextMenu(null);
    });
  }, []);

  function runInlineSearch() {
    const query = inlineSearchQuery.trim().toLowerCase();
    if (!query || !cyRef.current || !filteredGraph) return;
    const match = filteredGraph.nodes.find((node) => {
      const props = parseRecord(node.metadata?.properties);
      return (
        node.id.toLowerCase().includes(query) ||
        node.label.toLowerCase().includes(query) ||
        JSON.stringify(props).toLowerCase().includes(query)
      );
    });
    if (!match) return;
    setSelectedNodeId(match.id);
    setSelectedNodeIds([match.id]);
    const target = cyRef.current.$id(match.id);
    cyRef.current.elements().removeClass('of-inline-match');
    target.addClass('of-inline-match');
    cyRef.current.animate({ center: { eles: target }, duration: 250 });
  }

  // ── Actions ──

  function applyTemplate(template: VertexTemplate) {
    setSelectedTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateDescription(template.description);
    setRootTypeId(template.rootTypeId);
    setRootObjectId(template.rootObjectId);
    setDepth(template.depth);
    setLayoutMode(template.layout);
    setNodeDisplayMode(template.nodeDisplayMode);
    setSubtitleField(template.subtitleField);
    setExtendedLabelField(template.extendedLabelField);
    setColorByField(template.colorByField);
    setTimeField(template.timeField);
    setEventStartField(template.eventStartField);
    setEventEndField(template.eventEndField);
    setMediaField(template.mediaField);
    setAnnotationField(template.annotationField);
    setSelectedLensId(template.sharedLensId);
  }

  // The legacy localStorage-based saveTemplate() helper was retired
  // when the backend-backed TemplateBuilder + UseTemplateDialog
  // wizard landed below. The related `templates` / `templateName` /
  // `templateDescription` state remains in this page only because
  // older surfaces still read it (load-existing, delete) — its
  // setter callers all live elsewhere in this component.

  function deleteTemplate(id: string) {
    setTemplates((prev) => prev.filter((item) => item.id !== id));
    if (selectedTemplateId === id) {
      setSelectedTemplateId('');
      setTemplateName('');
      setTemplateDescription('');
    }
  }

  async function runGlobalSearch() {
    const query = globalSearchQuery.trim();
    if (!query) {
      setGlobalSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const response = await searchOntology({
        query,
        object_type_id: rootTypeId || undefined,
        semantic: true,
        limit: 10,
      });
      setGlobalSearchResults(response.data);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Failed to search graph resources');
    } finally {
      setSearchLoading(false);
    }
  }

  async function loadNeighborsForSelection() {
    if (!selectedNode) return;
    const objectId = parseObjectId(selectedNode);
    const typeId = selectedTypeIdFromNode(selectedNode);
    if (!objectId || !typeId) return;
    setNeighborLoading(true);
    try {
      const next = await expandNeighbors(typeId, objectId, {
        link_type_ids: neighborLinkTypeFilter.trim() ? [neighborLinkTypeFilter.trim()] : undefined,
        target_object_type_ids: neighborTargetTypeFilter.trim() ? [neighborTargetTypeFilter.trim()] : undefined,
        hop_depth: neighborHopDepth,
        page: neighborPage,
        page_size: 25,
      });
      if ((next.cost?.estimated_cpu_seconds ?? 0) > analysisBudgetCpuSeconds && !allowOverBudgetExpansion) {
        setLoadError(`Expansion exceeds budget (${next.cost?.estimated_cpu_seconds}s > ${analysisBudgetCpuSeconds}s). Confirm override to continue.`);
        return;
      }
      setNeighborResults(next.data);
      setNeighborTotal(next.total);
      setNeighborHasMore(next.has_more);
      setNeighborHiddenCount(next.hidden_count);
      setNeighborRestrictedCount(next.visibility?.restricted_edges_filtered ?? 0);
      if (next.cost) {
        setLastExpansionCost({
          estimated: next.cost.estimated_cpu_seconds,
          actual: next.cost.actual_cpu_seconds,
          rows: next.cost.rows_scanned,
          indices: next.cost.indices_hit,
        });
      }
      if (explainOnDemand && next.explain_plan) {
        setLastExplainPlan(
          `${next.explain_plan.strategy} using ${next.explain_plan.link_index}; pushed ${next.explain_plan.pushed_filters.join(', ') || 'none'}; estimated rows ${next.explain_plan.estimated_rows_scanned}`,
        );
      }
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Failed to search around the selected node');
    } finally {
      setNeighborLoading(false);
    }
  }

  function addNeighborToGraph(neighbor: NeighborLink) {
    if (!graph || !selectedNode) return;
    const typeItem = typeMap.get(neighbor.object.object_type_id);
    const nodeId = `object:${neighbor.object.id}`;
    let next = graph;
    if (!next.nodes.some((node) => node.id === nodeId)) {
      const newNode: GraphNode = {
        id: nodeId,
        kind: 'object_instance',
        label: objectLabelFromProperties(neighbor.object.properties),
        secondary_label: typeItem?.display_name ?? neighbor.object.object_type_id,
        color: typeItem?.color ?? null,
        route: `/ontology/${neighbor.object.object_type_id}#object-${neighbor.object.id}`,
        metadata: {
          object_type_id: neighbor.object.object_type_id,
          properties: neighbor.object.properties,
        },
      };
      next = { ...next, nodes: [...next.nodes, newNode], total_nodes: next.total_nodes + 1 };
    }
    const edgeId = `neighbor:${neighbor.link_id}:${selectedNode.id}:${neighbor.object.id}`;
    if (!next.edges.some((edge) => edge.id === edgeId)) {
      const nextEdge: GraphEdge = {
        id: edgeId,
        kind: 'link_instance',
        source: neighbor.direction === 'outbound' ? selectedNode.id : nodeId,
        target: neighbor.direction === 'outbound' ? nodeId : selectedNode.id,
        label: neighbor.link_name,
        metadata: { link_type_id: neighbor.link_type_id, search_around: true },
      };
      next = { ...next, edges: [...next.edges, nextEdge], total_edges: next.total_edges + 1 };
    }
    setGraph(next);
  }

  function addSearchResultToGraph(result: SearchResult) {
    if (!result.object_type_id) return;
    setSeedSource('object_explorer');
    setRootTypeId(result.object_type_id);
    if (result.kind === 'object_instance') setRootObjectId(result.id);
  }

  // Merges a TraverseResponse.groups[] payload (returned by the
  // /api/v1/ontology/traverse multi-step Search Around endpoint) into
  // the current Cytoscape graph. Each ObjectRef becomes a GraphNode;
  // existing nodes (matched by composite id `type:id`) are not
  // duplicated. Edges are not added — the traverse endpoint returns
  // only the resulting set, not link instances; the user can run a
  // subsequent neighbour expansion to populate edges if desired.
  function addTraverseGroupsToGraph(groups: TraverseResultGroup[]) {
    if (!graph || groups.length === 0) return;
    let next = graph;
    const existing = new Set(next.nodes.map((n) => n.id));
    for (const group of groups) {
      for (const item of group.items) {
        const nodeId = `${item.object_type_id}:${item.object_id}`;
        if (existing.has(nodeId)) continue;
        existing.add(nodeId);
        // `properties_json` arrives pre-parsed: the Go side serializes
        // a json.RawMessage which the gateway delivers as inline JSON.
        // Accept the parsed shape directly; tolerate the legacy string
        // form (older backends) by reparsing.
        let properties: Record<string, unknown> = {};
        const rawProps: unknown = item.properties_json;
        if (rawProps && typeof rawProps === 'object') {
          properties = rawProps as Record<string, unknown>;
        } else if (typeof rawProps === 'string' && rawProps.length > 0) {
          try {
            properties = JSON.parse(rawProps) as Record<string, unknown>;
          } catch {
            properties = {};
          }
        }
        const newNode: GraphNode = {
          id: nodeId,
          kind: 'object_instance',
          label: item.display_label || item.object_id,
          secondary_label: null,
          color: null,
          route: `/ontology/${item.object_type_id}#object-${item.object_id}`,
          metadata: { object_type_id: item.object_type_id, properties },
        };
        next = {
          ...next,
          nodes: [...next.nodes, newNode],
          total_nodes: next.total_nodes + 1,
        };
      }
    }
    setGraph(next);
  }

  // Slice 6: when the user picks a relation from the LinkSummary
  // dropdown, run the existing single-hop neighbour expansion for
  // that specific link type. This reuses `expandNeighbors` so the
  // visual + cost-accounting paths stay identical to the legacy
  // Expand neighbors button.
  async function handleExpandFromLinkSummary(linkTypeId: string) {
    if (!selectedNode) return;
    const objectId = parseObjectId(selectedNode);
    const typeId = selectedTypeIdFromNode(selectedNode);
    if (!objectId || !typeId) return;
    setLinkSummaryOpen(false);
    setNeighborLoading(true);
    try {
      const next = await expandNeighbors(typeId, objectId, {
        link_type_ids: [linkTypeId],
        hop_depth: 1,
        page: 1,
        page_size: 50,
      });
      setNeighborResults(next.data);
      setNeighborTotal(next.total);
    } catch (cause: unknown) {
      setLoadError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setNeighborLoading(false);
    }
  }

  // The Search Around panel's "Set starting objects" button asks the
  // user to pick objects from the canvas — we forward that to the
  // existing single-selection state so the panel sees the new set
  // through its `startingSet` prop.
  function handleSetStartingObjects() {
    // No-op shim: the panel watches `startingSet` derived from
    // selectedNode, so the user simply selects a node on the canvas.
    // Surfaced as an info toast for affordance parity with Palantir.
    setSearchAroundOpen(true);
  }

  // Derive ObjectRef[] from the current canvas selection. The panel
  // re-renders whenever `selectedNode` changes.
  const searchAroundStartingSet: ObjectRef[] = useMemo(() => {
    if (!selectedNode) return [];
    const typeId = selectedTypeIdFromNode(selectedNode);
    const objectId = parseObjectId(selectedNode);
    if (!typeId || !objectId) return [];
    return [
      {
        object_type_id: typeId,
        object_id: objectId,
        display_label: selectedNode.label,
      },
    ];
  }, [selectedNode]);

  // Slice 6 — facets in the Histogram tab aggregate over the full
  // visible graph, not just the current selection. Each visible node
  // contributes its ObjectRef. Multi-select narrows the set when
  // multiple nodes are selected (matches Palantir's "2 objects |
  // Filter to | Filter out" behaviour at the bottom of the panel).
  const histogramObjectRefs: ObjectRef[] = useMemo(() => {
    if (!graph) return [];
    const focus = selectedNodeIds.length > 0 ? new Set(selectedNodeIds) : null;
    const out: ObjectRef[] = [];
    for (const node of graph.nodes) {
      const typeId = selectedTypeIdFromNode(node);
      const objectId = parseObjectId(node);
      if (!typeId || !objectId) continue;
      if (focus && !focus.has(node.id)) continue;
      out.push({ object_type_id: typeId, object_id: objectId, display_label: node.label });
    }
    return out;
  }, [graph, selectedNodeIds]);

  const resolveTypeName = useCallback(
    (typeId: string) => typeMap.get(typeId)?.display_name ?? typeId,
    [typeMap],
  );

  function addHistogramChip(chip: HistogramFilterChip) {
    setHistogramChips((prev) => {
      const key = JSON.stringify([chip.property, chip.value, chip.mode]);
      if (prev.some((p) => JSON.stringify([p.property, p.value, p.mode]) === key)) {
        return prev;
      }
      return [...prev, chip];
    });
  }
  function removeHistogramChip(chip: HistogramFilterChip) {
    const key = JSON.stringify([chip.property, chip.value, chip.mode]);
    setHistogramChips((prev) =>
      prev.filter((p) => JSON.stringify([p.property, p.value, p.mode]) !== key),
    );
  }
  function clearHistogramChips() {
    setHistogramChips([]);
  }

  async function runScenarios() {
    if (!selectedNode) return;
    const objectId = parseObjectId(selectedNode);
    const typeId = selectedTypeIdFromNode(selectedNode);
    if (!objectId || !typeId) return;
    setScenarioLoading(true);
    try {
      const candidates: ScenarioSimulationCandidate[] = scenarioDrafts
        .filter((draft) => draft.name.trim() && draft.propertyName.trim())
        .map((draft) => {
          const original = selectedNodeProperties[draft.propertyName];
          return {
            name: draft.name.trim(),
            description: draft.description.trim(),
            operations: [
              { properties_patch: { [draft.propertyName]: coerceScenarioValue(draft.propertyValue, original) } },
            ],
          };
        });
      const response = await simulateObjectScenarios(typeId, objectId, {
        scenarios: candidates,
        include_baseline: true,
        ...(activeBranchRid ? { depth: Math.max(1, Math.min(3, objectViewHopBudget)) } : {}),
      });
      setScenarioResponse(response);
      const staged = candidates.flatMap((candidate) =>
        candidate.operations.map((op) => ({
          kind: 'property_change' as const,
          targetObjectId: objectId,
          targetTypeId: typeId,
          propertyName: Object.keys(op.properties_patch ?? {})[0] ?? '',
          propertyValue: Object.values(op.properties_patch ?? {})[0],
        })),
      );
      saveVertexScenario({
        analysisRid,
        name: candidates[0]?.name || 'Scenario',
        description: candidates[0]?.description || '',
        edits: staged,
        branchRid: activeBranchRid || null,
        branchName: activeBranchName || null,
        ephemeralOverlay: !activeBranchRid,
      });
      try {
        setSavedScenarios(await listVertexScenarios(analysisRid));
      } catch {
        // refresh failed — leave the in-memory list as-is so the
        // success notice below still surfaces.
      }
      setNotice(
        `Simulated ${response.scenarios.length} Vertex scenario${
          response.scenarios.length === 1 ? '' : 's'
        }.`,
      );
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Failed to simulate scenarios');
    } finally {
      setScenarioLoading(false);
    }
  }

  function promoteScenarioToMainGuarded() {
    if (activeBranchRid && !proposalApproved) {
      setLoadError('Promotion to main is blocked on non-main branches until proposal flow is approved.');
      return;
    }
    setNotice(activeBranchRid ? 'Promotion proposal approved; ready to promote to main.' : 'Promoted to main.');
  }

  async function runTraversalFromSelection() {
    if (!selectedNode) return;
    const typeId = selectedTypeIdFromNode(selectedNode);
    const objectId = parseObjectId(selectedNode);
    if (!typeId || !objectId) return;
    const hops = traversalPattern
      .split('->')
      .map((s) => s.trim())
      .filter(Boolean);
    setTraversalPlan(hops);
    setTraversalWarning('');
    if (hops.length >= 3 && !traversalFilter.trim()) {
      setTraversalWarning('Potential unbounded fan-out: add link/target filters before deep traversal.');
    }
    let frontier: Array<{ typeId: string; objectId: string }> = [{ typeId, objectId }];
    for (let hopIndex = 0; hopIndex < Math.min(3, hops.length); hopIndex += 1) {
      const nextFrontier: Array<{ typeId: string; objectId: string }> = [];
      for (const item of frontier.slice(0, 15)) {
        const result = await expandNeighbors(item.typeId, item.objectId, {
          page: 1,
          page_size: 25,
          hop_depth: 1,
          link_type_ids: traversalFilter.trim() ? [traversalFilter.trim()] : undefined,
          target_object_type_ids: neighborTargetTypeFilter.trim() ? [neighborTargetTypeFilter.trim()] : undefined,
        });
        for (const neighbor of result.data) {
          addNeighborToGraph(neighbor);
          nextFrontier.push({ typeId: neighbor.object.object_type_id, objectId: neighbor.object.id });
        }
      }
      frontier = nextFrontier;
      if (frontier.length > 120) {
        setTraversalWarning('Traversal frontier exceeded 120 nodes; results truncated to keep graph responsive.');
        break;
      }
    }
  }

  // ── Annotations ──

  function activeMediaUrl() {
    const value = selectedNodeProperties[mediaField];
    if (typeof value === 'string') return value;
    const typeLabel = typeMap.get(selectedTypeIdFromNode(selectedNode))?.display_name ?? 'system';
    const svg = encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 520"><rect width="900" height="520" fill="#1e3a8a"/><text x="64" y="64" fill="#e2e8f0" font-size="28" font-family="Georgia, serif">Vertex media layer</text><text x="64" y="100" fill="#93c5fd" font-size="18" font-family="Georgia, serif">${typeLabel}</text></svg>`,
    );
    return `data:image/svg+xml;charset=UTF-8,${svg}`;
  }

  const graphAnnotations = useMemo<VertexAnnotation[]>(() => {
    const annotations: VertexAnnotation[] = [];
    const selectedId = parseObjectId(selectedNode);
    annotations.push(...(selectedId ? customAnnotations[selectedId] ?? [] : []));
    if (!graph || !annotationField) return annotations;
    for (const node of graph.nodes) {
      const properties = parseRecord(node.metadata?.properties);
      const parsed = parseCoordinates(properties[annotationField]);
      if (!parsed) continue;
      annotations.push({
        id: `graph-${node.id}`,
        label: node.label,
        x: parsed.x,
        y: parsed.y,
        width: parsed.width,
        height: parsed.height,
        color: '#38bdf8',
        note: node.secondary_label ?? '',
      });
    }
    return annotations;
  }, [selectedNode, customAnnotations, graph, annotationField]);

  function addAnnotation() {
    const selectedId = parseObjectId(selectedNode);
    if (!selectedId || !annotationLabel.trim()) return;
    const next: VertexAnnotation = {
      id: createId(),
      label: annotationLabel.trim(),
      x: annotationX,
      y: annotationY,
      width: annotationWidth,
      height: annotationHeight,
      color: annotationColor,
      note: annotationNote.trim(),
    };
    setCustomAnnotations((prev) => ({
      ...prev,
      [selectedId]: [...(prev[selectedId] ?? []), next],
    }));
    setAnnotationLabel('');
    setAnnotationNote('');
  }

  function removeAnnotation(id: string) {
    const selectedId = parseObjectId(selectedNode);
    if (!selectedId) return;
    setCustomAnnotations((prev) => ({
      ...prev,
      [selectedId]: (prev[selectedId] ?? []).filter((item) => item.id !== id),
    }));
  }

  function currentTimeLabel() {
    return selectedSeriesRows[currentTimeIndex]?.date ?? 'No timeline';
  }

  function graphHashKey() {
    if (!graph) return 'empty';
    return `${graph.nodes.length}:${graph.edges.length}:${graph.nodes[0]?.id ?? ''}:${graph.edges[0]?.id ?? ''}`;
  }

  function computeCentralityCached() {
    if (!graph) return;
    const key = graphHashKey();
    const cached = centralityCache[key];
    if (cached) {
      setNotice(`Loaded cached centrality for subgraph ${key}.`);
      return;
    }
    const rows = approximateCentrality(graph);
    setCentralityCache((prev) => ({ ...prev, [key]: rows }));
    setNotice(`Computed centrality for subgraph ${key}.`);
  }

  function computeShortestPathForSelection() {
    if (!graph || selectedNodeIds.length < 2) return;
    const path = shortestPath(graph, selectedNodeIds[0], selectedNodeIds[1]);
    setPathResult(path);
  }

  function detectedMediaType(url: string): 'image' | 'video' | 'pdf' {
    const lower = url.toLowerCase();
    if (lower.endsWith('.pdf')) return 'pdf';
    if (/\.(mp4|webm|mov)$/.test(lower)) return 'video';
    return 'image';
  }

  function attachMediaToSelection() {
    if (!selectedNode || !mediaUrlInput.trim()) return;
    setMediaAttachmentByNode((prev) => ({
      ...prev,
      [selectedNode.id]: { type: detectedMediaType(mediaUrlInput.trim()), url: mediaUrlInput.trim(), markings: mediaMarkings || 'public' },
    }));
    setMediaUrlInput('');
  }

  function applySystemGraphTemplate(template: SystemGraphTemplate) {
    setSelectedSystemGraphId(template.id);
    setTraversalPattern(template.traversalPattern);
    setDepth(template.depth);
    const hint = objectTypes.find((item) => item.display_name.toLowerCase().includes(template.rootTypeHint.toLowerCase()));
    if (hint) setRootTypeId(hint.id);
    setNotice(`Applied system graph template "${template.name}" v${template.version}.`);
  }

  useEffect(() => {
    setTimelineRange({ start: 0, end: Math.max(0, selectedSeriesRows.length - 1) });
  }, [selectedSeriesRows.length]);

  useEffect(() => {
    if (!timelinePlaying || selectedSeriesRows.length <= 1) return;
    const handle = window.setInterval(() => {
      setCurrentTimeIndex((prev) => {
        const next = prev + 1;
        if (next > timelineRange.end) return timelineRange.start;
        return next;
      });
    }, timelineSpeedMs);
    return () => window.clearInterval(handle);
  }, [timelinePlaying, timelineSpeedMs, selectedSeriesRows.length, timelineRange.start, timelineRange.end]);

  useEffect(() => {
    const key = `of.vertex.timeline.cursor:${analysisRid}`;
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, String(currentTimeIndex));
  }, [analysisRid, currentTimeIndex]);

  useEffect(() => {
    const key = `of.vertex.timeline.cursor:${analysisRid}`;
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) setCurrentTimeIndex(parsed);
  }, [analysisRid]);

  const selectedLens = useMemo(
    () => visualFunctions.find((item) => item.id === selectedLensId) ?? null,
    [visualFunctions, selectedLensId],
  );

  // ── Render ──

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <div
        className="of-panel"
        style={{
          padding: 24,
          background: 'linear-gradient(135deg, #081428 0%, #10284f 52%, #1d4f91 100%)',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
          <div style={{ maxWidth: 720 }}>
            <p className="of-eyebrow" style={{ color: '#bae6fd' }}>
              Vertex
            </p>
            <h1 className="of-heading-xl" style={{ marginTop: 8, color: '#fff' }}>
              Visualize, simulate, and annotate your digital twin as a dedicated graph product.
            </h1>
            <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.7, color: '#e0f2fe' }}>
              Graph exploration, graph templates, event badges, time-series sidecars, media layers,
              and what-if scenario simulation in one product.
            </p>
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', minWidth: 360 }}>
            {[
              { label: 'Templates', value: templates.length },
              { label: 'Graph nodes', value: graph?.total_nodes ?? 0 },
              { label: 'Scenarios', value: scenarioResponse?.scenarios.length ?? 0 },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'rgba(255,255,255,0.08)',
                  padding: 12,
                }}
              >
                <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#bae6fd' }}>
                  {stat.label}
                </p>
                <p style={{ marginTop: 6, fontSize: 22, fontWeight: 600, color: '#fff' }}>{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {loadError && (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {loadError}
        </div>
      )}
      {notice && (
        <div className="of-status-success" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {notice}
        </div>
      )}
      {activeBranchRid && (
        <div className="of-status-warning" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          Branch mode: {activeBranchName || activeBranchRid}. Traversal reads branch-scoped object/link versions.
        </div>
      )}

      <div className="of-panel" style={{ padding: 20 }}>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Field label="Object type">
            <select className="of-select" value={rootTypeId} onChange={(e) => setRootTypeId(e.target.value)}>
              {objectTypes.map((typeItem) => (
                <option key={typeItem.id} value={typeItem.id}>
                  {typeItem.display_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Root object id">
            <input
              className="of-input"
              value={rootObjectId}
              onChange={(e) => setRootObjectId(e.target.value)}
              placeholder="Optional object UUID"
            />
          </Field>
          <Field label="Seed source">
            <select className="of-select" value={seedSource} onChange={(e) => setSeedSource(e.target.value as typeof seedSource)}>
              <option value="single_object">Single object</option>
              <option value="object_set">Object set</option>
              <option value="object_explorer">Object Explorer selection</option>
              <option value="workshop_variable">Workshop variable</option>
            </select>
          </Field>
          <Field label="Seed object set RID">
            <input className="of-input" value={seedObjectSetRid} onChange={(e) => setSeedObjectSetRid(e.target.value)} placeholder="ri.foundry.main.object-set..." />
          </Field>
          <Field label="Object View hop budget">
            <input className="of-input" type="number" min={1} max={6} value={objectViewHopBudget} onChange={(e) => setObjectViewHopBudget(Math.max(1, Math.min(6, Number(e.target.value) || 2)))} />
          </Field>
          <Field label="Applied filters">
            <input className="of-input" value={seedAppliedFilters} onChange={(e) => setSeedAppliedFilters(e.target.value)} placeholder="country=ES,status=active" />
          </Field>
          <Field label="Depth">
            <input
              type="number"
              className="of-input"
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              min={1}
              max={4}
            />
          </Field>
          <Field label="Layout">
            <select className="of-select" value={layoutMode} onChange={(e) => setLayoutMode(e.target.value as LayoutMode)}>
              {LAYOUT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          {(layoutMode === 'breadthfirst' || layoutMode === 'concentric' || layoutMode === 'radial' || layoutMode === 'cartesian') && (
            <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>
                {layoutMode === 'breadthfirst' && 'Hierarchy settings'}
                {layoutMode === 'concentric' && 'Cluster settings'}
                {layoutMode === 'radial' && 'Radial settings'}
                {layoutMode === 'cartesian' && 'Cartesian settings'}
              </p>
              {layoutMode === 'breadthfirst' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <input
                        type="radio"
                        name="hierarchy-orientation"
                        checked={layoutAdvanced.hierarchyOrientation === 'tb'}
                        onChange={() => setLayoutAdvanced((prev) => ({ ...prev, hierarchyOrientation: 'tb' }))}
                      />
                      Top → Bottom
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <input
                        type="radio"
                        name="hierarchy-orientation"
                        checked={layoutAdvanced.hierarchyOrientation === 'lr'}
                        onChange={() => setLayoutAdvanced((prev) => ({ ...prev, hierarchyOrientation: 'lr' }))}
                      />
                      Left → Right
                    </label>
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={layoutAdvanced.hierarchyReverse}
                      onChange={(e) => setLayoutAdvanced((prev) => ({ ...prev, hierarchyReverse: e.target.checked }))}
                    />
                    Reverse depth axis
                  </label>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <span className="of-text-muted" style={{ fontSize: 11 }}>
                      Root nodes: {layoutAdvanced.hierarchyRoots.length > 0 ? `${layoutAdvanced.hierarchyRoots.length} pinned` : 'automatic'}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="of-btn of-btn-ghost"
                        onClick={() => setLayoutAdvanced((prev) => ({ ...prev, hierarchyRoots: selectedNodeIds }))}
                        disabled={selectedNodeIds.length === 0}
                        title="Use the currently selected nodes as the root layer"
                      >
                        Use selection
                      </button>
                      <button
                        type="button"
                        className="of-btn of-btn-ghost"
                        onClick={() => setLayoutAdvanced((prev) => ({ ...prev, hierarchyRoots: [] }))}
                        disabled={layoutAdvanced.hierarchyRoots.length === 0}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </>
              )}
              {layoutMode === 'concentric' && (
                <Field label="Cluster by property">
                  <input
                    className="of-input"
                    value={layoutAdvanced.clusterByProperty}
                    onChange={(e) => setLayoutAdvanced((prev) => ({ ...prev, clusterByProperty: e.target.value }))}
                    placeholder="Property name (numeric or categorical)"
                  />
                </Field>
              )}
              {layoutMode === 'radial' && (
                <Field label={`Density (${layoutAdvanced.radialDensity})`}>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={layoutAdvanced.radialDensity}
                    onChange={(e) => setLayoutAdvanced((prev) => ({ ...prev, radialDensity: Number(e.target.value) }))}
                  />
                </Field>
              )}
              {layoutMode === 'cartesian' && (
                <>
                  <div style={{ display: 'grid', gap: 6, gridTemplateColumns: '1fr 1fr' }}>
                    <Field label="X property">
                      <input
                        className="of-input"
                        value={layoutAdvanced.cartesianXProperty}
                        onChange={(e) => setLayoutAdvanced((prev) => ({ ...prev, cartesianXProperty: e.target.value }))}
                        placeholder="Numeric property"
                      />
                    </Field>
                    <Field label="Y property">
                      <input
                        className="of-input"
                        value={layoutAdvanced.cartesianYProperty}
                        onChange={(e) => setLayoutAdvanced((prev) => ({ ...prev, cartesianYProperty: e.target.value }))}
                        placeholder="Numeric property"
                      />
                    </Field>
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={layoutAdvanced.cartesianReverseX}
                        onChange={(e) => setLayoutAdvanced((prev) => ({ ...prev, cartesianReverseX: e.target.checked }))}
                      />
                      Reverse X
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={layoutAdvanced.cartesianReverseY}
                        onChange={(e) => setLayoutAdvanced((prev) => ({ ...prev, cartesianReverseY: e.target.checked }))}
                      />
                      Reverse Y
                    </label>
                  </div>
                </>
              )}
            </div>
          )}
          <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>Edge styling</p>
            <Field label="Line type">
              <select
                className="of-select"
                value={edgeStyling.lineType}
                onChange={(e) =>
                  setEdgeStyling((prev) => ({ ...prev, lineType: e.target.value as typeof prev.lineType }))
                }
              >
                <option value="curved">Curved (bezier)</option>
                <option value="straight">Straight</option>
                <option value="orthogonal">Orthogonal (right-angled)</option>
              </select>
            </Field>
            <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={edgeStyling.showArrows}
                  onChange={(e) => setEdgeStyling((prev) => ({ ...prev, showArrows: e.target.checked }))}
                />
                Show arrows
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={edgeStyling.showReversed}
                  onChange={(e) => setEdgeStyling((prev) => ({ ...prev, showReversed: e.target.checked }))}
                  disabled={!edgeStyling.showArrows}
                />
                Show reversed
              </label>
            </div>
            <Field label="Width by property">
              <input
                className="of-input"
                value={edgeStyling.widthByProperty}
                placeholder="Numeric edge property (e.g. weight)"
                onChange={(e) => setEdgeStyling((prev) => ({ ...prev, widthByProperty: e.target.value }))}
              />
            </Field>
            {edgeStyling.widthByProperty.trim() !== '' && (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  <Field label="Min px">
                    <input
                      type="number"
                      className="of-input"
                      min={0.5}
                      max={20}
                      step={0.5}
                      value={edgeStyling.widthMin}
                      onChange={(e) =>
                        setEdgeStyling((prev) => ({ ...prev, widthMin: Number(e.target.value) || 1 }))
                      }
                    />
                  </Field>
                  <Field label="Max px">
                    <input
                      type="number"
                      className="of-input"
                      min={1}
                      max={40}
                      step={0.5}
                      value={edgeStyling.widthMax}
                      onChange={(e) =>
                        setEdgeStyling((prev) => ({ ...prev, widthMax: Number(e.target.value) || 8 }))
                      }
                    />
                  </Field>
                  <Field label="Aggregate">
                    <select
                      className="of-select"
                      value={edgeStyling.widthAggregate}
                      onChange={(e) =>
                        setEdgeStyling((prev) => ({
                          ...prev,
                          widthAggregate: e.target.value as typeof prev.widthAggregate,
                        }))
                      }
                    >
                      <option value="sum">Sum</option>
                      <option value="count">Count</option>
                      <option value="avg">Average</option>
                      <option value="max">Max</option>
                    </select>
                  </Field>
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={edgeStyling.widthInvert}
                    onChange={(e) => setEdgeStyling((prev) => ({ ...prev, widthInvert: e.target.checked }))}
                  />
                  Invert scale (low value → thick edge)
                </label>
              </div>
            )}
            <Field label="Label by property">
              <input
                className="of-input"
                value={edgeStyling.labelByProperty}
                placeholder="Edge property (numeric for aggregate)"
                onChange={(e) => setEdgeStyling((prev) => ({ ...prev, labelByProperty: e.target.value }))}
              />
            </Field>
            {edgeStyling.labelByProperty.trim() !== '' && (
              <Field label="Label aggregate (for grouped edges)">
                <select
                  className="of-select"
                  value={edgeStyling.labelAggregate}
                  onChange={(e) =>
                    setEdgeStyling((prev) => ({
                      ...prev,
                      labelAggregate: e.target.value as typeof prev.labelAggregate,
                    }))
                  }
                >
                  <option value="sum">Sum</option>
                  <option value="count">Count</option>
                  <option value="avg">Average</option>
                  <option value="max">Max</option>
                </select>
              </Field>
            )}
          </div>
          <Field label="Node mode">
            <select
              className="of-select"
              value={nodeDisplayMode}
              onChange={(e) => setNodeDisplayMode(e.target.value as NodeDisplayMode)}
            >
              <option value="compact">Compact</option>
              <option value="card">Object card</option>
            </select>
          </Field>
          <Field label="Quiver lens">
            <select className="of-select" value={selectedLensId} onChange={(e) => setSelectedLensId(e.target.value)}>
              <option value="">No shared lens</option>
              {visualFunctions.map((lens) => (
                <option key={lens.id} value={lens.id}>
                  {lens.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <input
            className="of-input"
            value={globalSearchQuery}
            onChange={(e) => setGlobalSearchQuery(e.target.value)}
            placeholder="Find objects or types"
            style={{ flex: 1, minWidth: 240 }}
          />
          <button type="button" className="of-btn" onClick={() => void runGlobalSearch()} disabled={searchLoading}>
            {searchLoading ? '…' : 'Search'}
          </button>
          <button
            type="button"
            className="of-btn of-btn-primary"
            onClick={() => void loadGraph()}
            disabled={graphLoading}
          >
            {graphLoading ? 'Loading…' : 'Load graph'}
          </button>
          <button
            type="button"
            className="of-btn"
            onClick={() => setTemplateBuilderOpen(true)}
            disabled={!graph}
            title={graph ? 'Save the current graph as a reusable template' : 'Load a graph first'}
          >
            Save as template
          </button>
          <button
            type="button"
            className="of-btn"
            onClick={() => {
              setActiveGraphTemplate(savedGraphTemplates[0] ?? null);
              setUseTemplateOpen(true);
            }}
            disabled={savedGraphTemplates.length === 0}
            title={savedGraphTemplates.length === 0 ? 'No templates yet' : 'Open a saved template'}
          >
            Use template…
          </button>
          <input ref={inlineSearchInputRef} className="of-input" value={inlineSearchQuery} onChange={(e) => setInlineSearchQuery(e.target.value)} placeholder="Search visible graph (⌘/Ctrl+K)" style={{ minWidth: 240 }} />
          <button type="button" className="of-btn" onClick={runInlineSearch}>Find</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 8, marginTop: 10 }}>
          <input className="of-input" value={nodeTypeFilter} onChange={(e) => setNodeTypeFilter(e.target.value)} placeholder="Filter node type id" />
          <input className="of-input" value={nodePropertyFilter} onChange={(e) => setNodePropertyFilter(e.target.value)} placeholder="Filter node property value" />
          <input className="of-input" value={edgeTypeFilter} onChange={(e) => setEdgeTypeFilter(e.target.value)} placeholder="Filter edge type id" />
          <input className="of-input" type="number" value={minDegreeFilter} onChange={(e) => setMinDegreeFilter(Number(e.target.value) || 0)} placeholder="Min degree" />
          <select className="of-select" value={groupByMode} onChange={(e) => setGroupByMode(e.target.value as 'none' | 'type' | 'property')}>
            <option value="none">No grouping</option>
            <option value="type">Group by type</option>
            <option value="property">Group by property</option>
          </select>
          <input className="of-input" value={groupByProperty} onChange={(e) => setGroupByProperty(e.target.value)} placeholder="Group property key" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 8, marginTop: 10 }}>
          <input className="of-input" value={nodeLabelProperty} onChange={(e) => setNodeLabelProperty(e.target.value)} placeholder="Node label property" />
          <input className="of-input" value={nodeSizeProperty} onChange={(e) => setNodeSizeProperty(e.target.value)} placeholder="Node size property" />
          <select className="of-select" value={nodeIconMode} onChange={(e) => setNodeIconMode(e.target.value as 'dot' | 'diamond' | 'hexagon')}>
            <option value="dot">Node icon: Dot</option>
            <option value="diamond">Node icon: Diamond</option>
            <option value="hexagon">Node icon: Hexagon</option>
          </select>
          <input className="of-input" value={edgeLabelProperty} onChange={(e) => setEdgeLabelProperty(e.target.value)} placeholder="Edge label property" />
          <label className="of-text-muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={edgeDashEnabled} onChange={(e) => setEdgeDashEnabled(e.target.checked)} /> Dashed edges override
          </label>
        </div>
        {groupCounts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {groupCounts.slice(0, 12).map((group) => (
              <button key={group.key} type="button" className="of-btn" onClick={() => setCollapsedGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}>
                {collapsedGroups[group.key] ? 'Expand' : 'Collapse'} {group.key} ({group.count})
              </button>
            ))}
          </div>
        )}
        <div className="of-panel-muted" style={{ marginTop: 12, padding: 12 }}>
          <p className="of-eyebrow">Seed metadata</p>
          <div className="of-text-muted" style={{ fontSize: 12, marginTop: 6 }}>
            Type: {seedSource.replaceAll('_', ' ')} · Count: {rootObjectId ? 1 : graph?.total_nodes ?? 0}
          </div>
          <div className="of-text-muted" style={{ fontSize: 12, marginTop: 4 }}>
            Filters: {seedAppliedFilters.trim() || '(none)'}
          </div>
          {(seedSource === 'object_set' || seedSource === 'workshop_variable') && (
            <div className="of-text-muted" style={{ fontSize: 12, marginTop: 4 }}>
              Source RID/variable: {seedObjectSetRid || workshopObjectSetVariable || searchParams.get('seedObjectSetRid') || searchParams.get('workshopVariable') || '(not provided)'}
            </div>
          )}
          <div className="of-text-muted" style={{ fontSize: 12, marginTop: 4 }}>
            Workshop mode: {workshopReadOnly ? 'Read-only' : 'Full-edit'} · Hover binding: {hoveredElementId || '(none)'}
          </div>
        </div>

        {globalSearchResults.length > 0 && (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginTop: 16 }}>
            {globalSearchResults.map((result) => (
              <button
                key={`${result.kind}-${result.id}`}
                type="button"
                onClick={() => addSearchResultToGraph(result)}
                style={{
                  textAlign: 'left',
                  padding: 16,
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-panel-muted)',
                  cursor: 'pointer',
                }}
              >
                <p className="of-eyebrow">{result.kind.replaceAll('_', ' ')}</p>
                <div style={{ marginTop: 8, fontWeight: 500, color: 'var(--text-strong)' }}>{result.title}</div>
                <div className="of-text-muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {result.subtitle ?? result.snippet}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1.42fr) 380px' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <section className="of-panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                borderBottom: '1px solid var(--border-subtle)',
                padding: '16px 20px',
              }}
            >
              <div>
                <p className="of-eyebrow">Graph canvas</p>
                <h2 className="of-heading-md" style={{ marginTop: 4 }}>
                  Editable system graph
                </h2>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <span className="of-chip of-status-info">Nodes {graph?.total_nodes ?? 0}</span>
                <span className="of-chip of-status-success">Edges {graph?.total_edges ?? 0}</span>
                <span className="of-chip of-status-warning">Timeline {currentTimeLabel()}</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 270px' }}>
              <div style={{ position: 'relative', borderRight: '1px solid var(--border-subtle)' }}>
                <CytoscapeCanvas
                  elements={cyElements}
                  stylesheet={cyStylesheet}
                  layout={cyLayout}
                  height={640}
                  onReady={handleCytoscapeReady}
                />
                <EventBadgeOverlay cy={cyInstance} badges={nodeEventBadges} />
                <SelectionBorderOverlay cy={cyInstance} selectionRings={selectionRings} />
                {nodeContextMenu && (
                  <div
                    role="menu"
                    style={{
                      position: 'absolute',
                      top: nodeContextMenu.y + 12,
                      left: nodeContextMenu.x + 12,
                      background: 'rgba(15, 23, 42, 0.98)',
                      color: '#e2e8f0',
                      border: '1px solid rgba(148, 163, 184, 0.25)',
                      borderRadius: 8,
                      padding: 6,
                      boxShadow: '0 8px 18px rgba(0,0,0,0.35)',
                      minWidth: 200,
                      zIndex: 30,
                    }}
                    onMouseLeave={() => setNodeContextMenu(null)}
                  >
                    <button
                      type="button"
                      className="of-btn of-btn-ghost"
                      style={{ width: '100%', justifyContent: 'flex-start', color: 'inherit' }}
                      onClick={() => {
                        setSelectedNodeId(nodeContextMenu.nodeId);
                        setActiveTab('events');
                        setNodeContextMenu(null);
                      }}
                      disabled={!nodeEventBadges[nodeContextMenu.nodeId]}
                      title={
                        nodeEventBadges[nodeContextMenu.nodeId]
                          ? nodeEventBadges[nodeContextMenu.nodeId].label ?? 'Open linked events'
                          : 'No linked events tagged for this node'
                      }
                    >
                      Open linked events
                      {nodeEventBadges[nodeContextMenu.nodeId]
                        ? ` · ${nodeEventBadges[nodeContextMenu.nodeId].count}`
                        : ''}
                    </button>
                    <button
                      type="button"
                      className="of-btn of-btn-ghost"
                      style={{ width: '100%', justifyContent: 'flex-start', color: 'inherit' }}
                      onClick={() => {
                        setSelectedNodeId(nodeContextMenu.nodeId);
                        setActiveTab('series');
                        setNodeContextMenu(null);
                      }}
                    >
                      Open series
                    </button>
                    <button
                      type="button"
                      className="of-btn of-btn-ghost"
                      style={{ width: '100%', justifyContent: 'flex-start', color: 'inherit' }}
                      onClick={() => {
                        setSelectedNodeId(nodeContextMenu.nodeId);
                        setActiveTab('selection');
                        setNodeContextMenu(null);
                      }}
                    >
                      Show properties
                    </button>
                  </div>
                )}
                {histogramChips.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 10,
                      top: 10,
                      right: 10,
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 8px',
                      borderRadius: 4,
                      background: 'rgba(255,255,255,0.92)',
                      border: '1px solid var(--border-default)',
                      pointerEvents: 'auto',
                    }}
                  >
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Filters:</span>
                    {histogramChips.map((chip, i) => (
                      <span
                        key={i}
                        className={`of-chip ${chip.mode === 'out' ? 'of-status-warning' : 'of-status-info'}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                      >
                        {chip.label}
                        <button
                          type="button"
                          className="of-btn of-btn-ghost"
                          onClick={() => removeHistogramChip(chip)}
                          aria-label={`Remove filter ${chip.label}`}
                          style={{ minHeight: 16, padding: '0 4px', fontSize: 10 }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      className="of-btn of-btn-ghost"
                      onClick={clearHistogramChips}
                      style={{ marginLeft: 'auto', minHeight: 20, padding: '0 6px', fontSize: 11 }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
                {workshopReadOnly && (
                  <div style={{ position: 'absolute', right: 10, top: 10 }} className="of-chip of-status-info">
                    Workshop read-only
                  </div>
                )}
                {graphLoading && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(255,255,255,0.7)',
                      fontSize: 13,
                      color: 'var(--text-muted)',
                    }}
                  >
                    Loading Vertex graph…
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gap: 16, padding: 16 }}>
                <div className="of-panel-muted" style={{ padding: 16 }}>
                  <p className="of-eyebrow">Graph template</p>
                  <input
                    className="of-input"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Template name"
                    style={{ marginTop: 12, fontSize: 13 }}
                  />
                  <textarea
                    className="of-textarea"
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="Describe when to reuse this template"
                    style={{ marginTop: 12, fontSize: 13, minHeight: 80 }}
                  />
                  <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                    {templates.slice(0, 6).map((template) => (
                      <div
                        key={template.id}
                        style={{
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-md)',
                          background: '#fff',
                          padding: 12,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => applyTemplate(template)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            background: 'transparent',
                            border: 0,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          <div style={{ fontWeight: 500, color: 'var(--text-strong)' }}>{template.name}</div>
                          <div className="of-text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                            {template.updatedAt.slice(0, 10)} ·{' '}
                            {LAYOUT_OPTIONS.find((item) => item.id === template.layout)?.label}
                          </div>
                        </button>
                        <button
                          type="button"
                          className="of-btn of-btn-danger"
                          onClick={() => deleteTemplate(template.id)}
                          style={{ marginTop: 12, minHeight: 28, fontSize: 11 }}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="of-panel-muted" style={{ padding: 16 }}>
                  <p className="of-eyebrow">Search around</p>
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', marginTop: 8 }}>
                    <label className="of-text-muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={explainOnDemand} onChange={(e) => setExplainOnDemand(e.target.checked)} /> EXPLAIN on demand
                    </label>
                    <label className="of-text-muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={allowOverBudgetExpansion} onChange={(e) => setAllowOverBudgetExpansion(e.target.checked)} /> Allow over-budget
                    </label>
                  </div>
                  <input className="of-input" type="number" min={0.001} step={0.001} value={analysisBudgetCpuSeconds} onChange={(e) => setAnalysisBudgetCpuSeconds(Math.max(0.001, Number(e.target.value) || 0.05))} placeholder="Analysis budget CPU seconds" style={{ marginTop: 8 }} />
                  <button
                    type="button"
                    className="of-btn of-btn-primary"
                    onClick={() => void loadNeighborsForSelection()}
                    disabled={neighborLoading || !selectedNode}
                    style={{ marginTop: 12, width: '100%' }}
                  >
                    {neighborLoading ? 'Loading…' : 'Load related objects'}
                  </button>
                  <input
                    className="of-input"
                    value={searchAroundFilter}
                    onChange={(e) => setSearchAroundFilter(e.target.value)}
                    placeholder="Filter neighbors"
                    style={{ marginTop: 12, fontSize: 13 }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 84px', gap: 8, marginTop: 8 }}>
                    <input className="of-input" value={neighborLinkTypeFilter} onChange={(e) => setNeighborLinkTypeFilter(e.target.value)} placeholder="Link type id" />
                    <input className="of-input" value={neighborTargetTypeFilter} onChange={(e) => setNeighborTargetTypeFilter(e.target.value)} placeholder="Target type id" />
                    <select className="of-select" value={neighborHopDepth} onChange={(e) => setNeighborHopDepth(Number(e.target.value) as 1 | 2 | 3)}>
                      <option value={1}>1 hop</option>
                      <option value={2}>2 hops</option>
                      <option value={3}>3 hops</option>
                    </select>
                  </div>
                  <div className="of-text-muted" style={{ fontSize: 12, marginTop: 8 }}>
                    Total: {neighborTotal} · Hidden: {neighborHiddenCount} not visible · Restricted edges filtered: {neighborRestrictedCount} · Page: {neighborPage}
                  </div>
                  {lastExpansionCost && (
                    <div className="of-text-muted" style={{ fontSize: 12, marginTop: 8 }}>
                      Cost est/actual CPU·s: {lastExpansionCost.estimated} / {lastExpansionCost.actual} · rows scanned {lastExpansionCost.rows} · indices hit {lastExpansionCost.indices}
                    </div>
                  )}
                  {lastExplainPlan && <div className="of-panel-muted" style={{ marginTop: 8, padding: 8, fontSize: 12 }}>{lastExplainPlan}</div>}
                  <div style={{ display: 'grid', gap: 8, marginTop: 12, maxHeight: 240, overflowY: 'auto' }}>
                    {neighborResults
                      .filter((neighbor) => {
                        const query = searchAroundFilter.trim().toLowerCase();
                        if (!query) return true;
                        return `${neighbor.link_name} ${objectLabelFromProperties(neighbor.object.properties)}`
                          .toLowerCase()
                          .includes(query);
                      })
                      .map((neighbor) => (
                        <button
                          key={neighbor.link_id}
                          type="button"
                          onClick={() => addNeighborToGraph(neighbor)}
                          style={{
                            textAlign: 'left',
                            padding: 12,
                            border: '1px solid var(--border-default)',
                            background: '#fff',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontWeight: 500, color: 'var(--text-strong)' }}>
                            {objectLabelFromProperties(neighbor.object.properties)}
                          </div>
                          <div className="of-text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                            {neighbor.direction} via {neighbor.link_name}
                          </div>
                        </button>
                      ))}
                    {!neighborLoading && neighborResults.length === 0 && (
                      <div
                        style={{
                          border: '1px dashed var(--border-default)',
                          borderRadius: 'var(--radius-md)',
                          padding: '12px 16px',
                          fontSize: 13,
                          color: 'var(--text-muted)',
                        }}
                      >
                        Load neighbors from the current selection to expand the graph.
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button type="button" className="of-btn" onClick={() => setNeighborPage((p) => Math.max(1, p - 1))} disabled={neighborPage <= 1}>
                      Prev
                    </button>
                    <button type="button" className="of-btn" onClick={() => setNeighborPage((p) => p + 1)} disabled={!neighborHasMore}>
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr' }}>
            <section className="of-panel" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <p className="of-eyebrow">Time series</p>
                  <h2 className="of-heading-md" style={{ marginTop: 4 }}>
                    Series view
                  </h2>
                </div>
                {selectedLens && (
                  <span className="of-chip of-status-info">{selectedLens.name}</span>
                )}
              </div>
              <div style={{ marginTop: 16, height: 320 }}>
                <EChartView
                  rows={selectedSeriesRows.map((row) => ({ date: row.date, value: row.value }))}
                  categoryKey="date"
                  valueKeys={['value']}
                  mode="line"
                  emptyLabel="Select an object-backed node with time and numeric properties to open the series view."
                  onCategoryClick={(value) => {
                    const index = selectedSeriesRows.findIndex((row) => row.date === value);
                    setCurrentTimeIndex(index >= 0 ? index : 0);
                  }}
                  markCategoryValue={selectedSeriesRows[currentTimeIndex]?.date ?? null}
                  eventBands={eventRows
                    .filter((row) => Boolean(row.start) && Boolean(row.end))
                    .map((row) => {
                      const intent = eventIntentByTypeKey.get(row.typeLabel);
                      return {
                        from: row.start.slice(0, 10),
                        to: row.end.slice(0, 10),
                        tone: intent?.tone ?? '#94a3b8',
                        label: row.label,
                      };
                    })}
                />
              </div>
              {selectedSeriesRows.length > 1 && (
                <>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, selectedSeriesRows.length - 1)}
                    value={currentTimeIndex}
                    onChange={(e) => setCurrentTimeIndex(Number(e.target.value))}
                    style={{ marginTop: 16, width: '100%', accentColor: '#2458b8' }}
                  />
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'auto 1fr auto', marginTop: 10 }}>
                    <button type="button" className={timelinePlaying ? 'of-btn of-btn-primary' : 'of-btn'} onClick={() => setTimelinePlaying((v) => !v)}>
                      {timelinePlaying ? 'Pause' : 'Play'}
                    </button>
                    <input type="range" min={250} max={2000} step={50} value={timelineSpeedMs} onChange={(e) => setTimelineSpeedMs(Number(e.target.value))} />
                    <span className="of-text-muted" style={{ fontSize: 12 }}>{timelineSpeedMs}ms</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                    <input className="of-input" type="number" min={0} max={timelineRange.end} value={timelineRange.start} onChange={(e) => setTimelineRange((r) => ({ ...r, start: Math.max(0, Number(e.target.value) || 0) }))} placeholder="Range start" />
                    <input className="of-input" type="number" min={timelineRange.start} max={Math.max(0, selectedSeriesRows.length - 1)} value={timelineRange.end} onChange={(e) => setTimelineRange((r) => ({ ...r, end: Math.max(r.start, Number(e.target.value) || r.start) }))} placeholder="Range end" />
                  </div>
                </>
              )}
            </section>

            <section className="of-panel" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <p className="of-eyebrow">Graph readouts</p>
                  <h2 className="of-heading-md" style={{ marginTop: 4 }}>
                    Histogram and extended labels
                  </h2>
                </div>
                <span className="of-text-muted" style={{ fontSize: 12 }}>
                  {subtitleField || 'No group field yet'}
                </span>
              </div>
              <div style={{ marginTop: 16, height: 320 }}>
                <EChartView
                  rows={selectedGroupedRows.map((row) => ({ group: row.group, value: row.value }))}
                  categoryKey="group"
                  valueKeys={['value']}
                  mode="bar"
                  emptyLabel="Select a node to derive grouped readouts from its object type."
                />
              </div>
            </section>
          </div>
        </div>

        <aside style={{ display: 'grid', gap: 16 }}>
          <section className="of-panel" style={{ padding: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SIDEBAR_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={activeTab === tab.id ? 'of-btn of-btn-primary' : 'of-btn'}
                  onClick={() => setActiveTab(tab.id)}
                  style={{ minHeight: 30, fontSize: 12, padding: '0 10px' }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </section>

          {activeTab === 'selection' && (
            <SidebarSection title="Selection" subtitle={selectedNode?.label ?? 'Choose a node'}>
              <p className="of-text-muted" style={{ fontSize: 13 }}>
                {selectedNode?.secondary_label ?? 'No object selected.'}
              </p>
              <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                {Object.entries(selectedNodeProperties)
                  .slice(0, 12)
                  .map(([key, value]) => (
                    <div key={key} className="of-panel-muted" style={{ padding: '12px 16px' }}>
                      <p className="of-eyebrow">{key}</p>
                      <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-strong)' }}>
                        {stringifyValue(value)}
                      </p>
                    </div>
                  ))}
              </div>
              {selectedNode?.route && (
                <a
                  href={selectedNode.route}
                  className="of-btn"
                  style={{ display: 'inline-flex', marginTop: 16, fontSize: 13 }}
                >
                  Open source object
                </a>
              )}
              <div className="of-panel-muted" style={{ marginTop: 12, padding: 12 }}>
                <p className="of-eyebrow">Actions</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  <button type="button" className="of-btn" onClick={() => void loadNeighborsForSelection()}>Expand neighbors</button>
                  <button
                    type="button"
                    className={`of-btn ${linkSummaryOpen ? 'of-btn-primary' : ''}`}
                    onClick={() => setLinkSummaryOpen((v) => !v)}
                    disabled={!selectedNode}
                  >
                    Search around…
                  </button>
                  <button type="button" className="of-btn" onClick={() => setActiveTab('scenarios')}>Run what-if</button>
                  <button type="button" className="of-btn" onClick={() => setActiveTab('events')}>Recent events</button>
                  <button
                    type="button"
                    className="of-btn"
                    onClick={() => {
                      if (selectedNodeIds.length === 0) {
                        window.alert('Select at least one node first.');
                        return;
                      }
                      const name = window.prompt(`Name this selection (${selectedNodeIds.length} node(s))`);
                      if (name) createSavedSelection(name, selectedNodeIds);
                    }}
                    disabled={selectedNodeIds.length === 0}
                    title="Save the currently selected nodes as a named group"
                  >
                    Save selection
                  </button>
                  <button
                    type="button"
                    className="of-btn"
                    onClick={() => {
                      const err = groupSelectedIntoEdge();
                      if (err) window.alert(err);
                    }}
                    disabled={selectedNodeIds.length === 0}
                    title="Collapse transactional nodes (each with two distinct neighbours) onto an aggregate edge between those neighbours"
                  >
                    Group into edge
                  </button>
                  {edgeGroupings.length > 0 && (
                    <button
                      type="button"
                      className="of-btn"
                      onClick={() => {
                        if (selectedEdgeId.startsWith('grouping:')) {
                          ungroupAggregateEdge(selectedEdgeId);
                          return;
                        }
                        // Default: ungroup the most recent aggregate edge.
                        ungroupEdgeGrouping(edgeGroupings[0].id);
                      }}
                      title={
                        selectedEdgeId.startsWith('grouping:')
                          ? 'Ungroup the selected aggregate edge'
                          : `Ungroup the most recent aggregate edge (${edgeGroupings[0].label})`
                      }
                    >
                      Ungroup edge
                    </button>
                  )}
                </div>
                {linkSummaryOpen && selectedNode && vertexTenant && (
                  <div style={{ marginTop: 8 }}>
                    <LinkSummaryDropdown
                      tenant={vertexTenant}
                      objectId={parseObjectId(selectedNode)}
                      objectTypeId={selectedTypeIdFromNode(selectedNode)}
                      onExpand={(entry) => void handleExpandFromLinkSummary(entry.link_type_id)}
                      onAddFilters={(_entry) => {
                        setLinkSummaryOpen(false);
                        setSearchAroundOpen(true);
                      }}
                      onClose={() => setLinkSummaryOpen(false)}
                    />
                  </div>
                )}
                {selectedEdge && (
                  <div className="of-text-muted" style={{ fontSize: 12, marginTop: 8 }}>
                    Selected edge: {selectedEdge.label} ({selectedEdge.source} → {selectedEdge.target})
                  </div>
                )}
              </div>
              {selectedNodeIds.length > 1 && (
                <div className="of-panel-muted" style={{ marginTop: 12, padding: 12 }}>
                  <p className="of-eyebrow">Multi-select summary</p>
                  <p className="of-text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Selected nodes: {selectedNodeIds.length}
                  </p>
                  <p className="of-text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Shared keys: {Object.keys(selectedNodeProperties).slice(0, 6).join(', ') || '(none)'}
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button type="button" className="of-btn" onClick={() => setSelectedNodeIds([])}>Clear selection</button>
                    <button type="button" className="of-btn">Bulk action (preview)</button>
                  </div>
                </div>
              )}
              <div className="of-panel-muted" style={{ padding: 12, marginTop: 16 }}>
                <p className="of-eyebrow">Traversal plan</p>
                <input className="of-input" value={traversalPattern} onChange={(e) => setTraversalPattern(e.target.value)} style={{ marginTop: 8 }} />
                <input className="of-input" value={traversalFilter} onChange={(e) => setTraversalFilter(e.target.value)} placeholder="Link filter per hop (optional)" style={{ marginTop: 8 }} />
                <button type="button" className="of-btn of-btn-primary" onClick={() => void runTraversalFromSelection()} style={{ marginTop: 8 }}>
                  Run multi-hop traversal
                </button>
                {traversalPlan.length > 0 && (
                  <div className="of-text-muted" style={{ fontSize: 12, marginTop: 8 }}>
                    {traversalPlan.map((hop, i) => <div key={`${hop}-${i}`}>Hop {i + 1}: {hop}</div>)}
                  </div>
                )}
                {traversalWarning && <div className="of-status-warning" style={{ marginTop: 8, padding: 8 }}>{traversalWarning}</div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  <button type="button" className="of-btn" onClick={computeCentralityCached}>Centrality (cached)</button>
                  <button type="button" className="of-btn" onClick={computeShortestPathForSelection} disabled={selectedNodeIds.length < 2}>Shortest path (2 selected)</button>
                  <button
                    type="button"
                    className="of-btn"
                    onClick={() => {
                      if (!graph) return;
                      const res = runGraphReasoningBlock({ block: 'neighbor_expansion', graph });
                      setNotice(`AIP block ${res.block} executed with permission-aware mode.`);
                    }}
                  >
                    Run AIP block
                  </button>
                </div>
                {pathResult.length > 0 && (
                  <div className="of-text-muted" style={{ fontSize: 12, marginTop: 8 }}>
                    Path: {pathResult.join(' → ')}
                  </div>
                )}
              </div>
            </SidebarSection>
          )}

          {activeTab === 'events' && (
            <SidebarSection title="Associated events" subtitle="Timeline-aware event badges">
              <p className="of-text-muted" style={{ fontSize: 13, marginTop: 8 }}>
                Neighbor objects with start and end timestamps are surfaced as Vertex-style events
                around the current selection.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {timelineTypeOptions.map((type) => {
                  const active = timelineEventTypes.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      className={active ? 'of-btn of-btn-primary' : 'of-btn'}
                      onClick={() =>
                        setTimelineEventTypes((prev) =>
                          prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type],
                        )
                      }
                      style={{ minHeight: 26, fontSize: 11 }}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                {filteredTimelineRows.map((row) => {
                  const eventConfig = eventIntentByTypeKey.get(row.typeLabel);
                  const tone = eventConfig?.tone ?? null;
                  return (
                    <button
                      key={row.nodeId}
                      type="button"
                      onClick={() => setSelectedNodeId(row.nodeId)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: 16,
                        border: `1px solid ${row.active ? '#fecaca' : tone ? `${tone}55` : 'var(--border-default)'}`,
                        background: row.active ? '#fff5f5' : 'var(--bg-panel-muted)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        borderLeft: tone ? `4px solid ${tone}` : undefined,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {tone && (
                            <span
                              aria-hidden
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                background: tone,
                                display: 'inline-block',
                              }}
                            />
                          )}
                          <div style={{ fontWeight: 500, color: 'var(--text-strong)' }}>{row.label}</div>
                        </div>
                        <span
                          className={`of-chip ${row.active ? 'of-status-danger' : 'of-status-info'}`}
                          style={{ fontSize: 11, fontWeight: 600 }}
                        >
                          {row.active ? 'Active' : 'Scheduled'}
                        </span>
                      </div>
                      <div className="of-text-muted" style={{ fontSize: 12, marginTop: 8 }}>
                        {row.typeLabel}
                        {eventConfig?.intent ? ` · ${eventConfig.intent}` : ''} · {row.start.slice(0, 10)} → {row.end.slice(0, 10)}
                      </div>
                    </button>
                  );
                })}
                {eventRows.length === 0 && (
                  <div
                    style={{
                      border: '1px dashed var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 16px',
                      fontSize: 13,
                      color: 'var(--text-muted)',
                    }}
                  >
                    No temporal neighbors were detected for the current selection.
                  </div>
                )}
              </div>
            </SidebarSection>
          )}

          {activeTab === 'series' && (
            <SidebarSection title="Series handoff" subtitle="Time-series actions">
              <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                <div className="of-panel-muted" style={{ padding: 16 }}>
                  <p style={{ fontWeight: 500, color: 'var(--text-strong)' }}>Current timeline point</p>
                  <p className="of-text-muted" style={{ fontSize: 13, marginTop: 8 }}>
                    {currentTimeLabel()}
                  </p>
                </div>
                <div className="of-panel-muted" style={{ padding: 16 }}>
                  <p style={{ fontWeight: 500, color: 'var(--text-strong)' }}>Series field</p>
                  <p className="of-text-muted" style={{ fontSize: 13, marginTop: 8 }}>
                    {timeField || 'Set a time field in Layers'}
                  </p>
                </div>
                <a href="/quiver" className="of-btn" style={{ fontSize: 13 }}>
                  Open in Quiver
                </a>
              </div>
            </SidebarSection>
          )}

          {activeTab === 'layers' && (
            <SidebarSection title="Layer styling" subtitle="Object and edge display options">
              <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                <Field label="Subtitle field">
                  <input className="of-input" value={subtitleField} onChange={(e) => setSubtitleField(e.target.value)} />
                </Field>
                <Field label="Extended label field">
                  <input
                    className="of-input"
                    value={extendedLabelField}
                    onChange={(e) => setExtendedLabelField(e.target.value)}
                  />
                </Field>
                <Field label="Color by field">
                  <input className="of-input" value={colorByField} onChange={(e) => setColorByField(e.target.value)} />
                </Field>
                <Field label="Time field">
                  <input className="of-input" value={timeField} onChange={(e) => setTimeField(e.target.value)} />
                </Field>
                <Field label="Event start / end">
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
                    <input
                      className="of-input"
                      value={eventStartField}
                      onChange={(e) => setEventStartField(e.target.value)}
                      placeholder="start"
                    />
                    <input
                      className="of-input"
                      value={eventEndField}
                      onChange={(e) => setEventEndField(e.target.value)}
                      placeholder="end"
                    />
                  </div>
                </Field>
              </div>
              <div className="of-panel-muted" style={{ marginTop: 12, padding: 12 }}>
                <p className="of-eyebrow">System graph templates</p>
                <input className="of-input" value={currentOrg} onChange={(e) => setCurrentOrg(e.target.value)} placeholder="Current org id" style={{ marginTop: 8 }} />
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  {systemGraphTemplates
                    .filter((template) => template.orgsEnabled.includes('global') || template.orgsEnabled.includes(currentOrg))
                    .map((template) => (
                      <button key={template.id} type="button" className={selectedSystemGraphId === template.id ? 'of-btn of-btn-primary' : 'of-btn'} onClick={() => applySystemGraphTemplate(template)}>
                        {template.name} · v{template.version}
                      </button>
                    ))}
                </div>
              </div>

              <div className="of-panel-muted" style={{ marginTop: 12, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <p className="of-eyebrow" style={{ margin: 0 }}>Saved styles</p>
                  <button
                    type="button"
                    className="of-btn of-btn-ghost"
                    onClick={() => {
                      const name = window.prompt('Name this style profile');
                      if (name) createSavedStyle(name);
                    }}
                    title="Snapshot the current style fields as a named profile"
                  >
                    + New style
                  </button>
                </div>
                {savedStyles.length === 0 ? (
                  <p className="of-text-muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
                    No saved styles yet. Tune the fields above and snapshot them with <strong>+ New style</strong>.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                    {savedStyles.map((style) => {
                      const active = activeStyleId === style.id;
                      return (
                        <div
                          key={style.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: 8,
                            borderRadius: 6,
                            border: active ? '1px solid #67e8f9' : '1px solid var(--border-subtle)',
                          }}
                        >
                          <button
                            type="button"
                            className="of-btn of-btn-ghost"
                            style={{ flex: 1, justifyContent: 'flex-start' }}
                            onClick={() => applySavedStyle(style.id)}
                            title={`Apply ${style.name}`}
                          >
                            {active && '✓ '}
                            {style.name}
                          </button>
                          <button
                            type="button"
                            className="of-btn of-btn-ghost"
                            onClick={() => overwriteSavedStyle(style.id)}
                            title="Overwrite with current fields"
                          >
                            ⟳
                          </button>
                          <button
                            type="button"
                            className="of-btn of-btn-ghost"
                            onClick={() => deleteSavedStyle(style.id)}
                            title="Delete style"
                            style={{ color: '#f87171' }}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="of-panel-muted" style={{ marginTop: 12, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <p className="of-eyebrow" style={{ margin: 0 }}>Saved selections</p>
                  <button
                    type="button"
                    className="of-btn of-btn-ghost"
                    onClick={() => {
                      if (selectedNodeIds.length === 0) {
                        window.alert('Select at least one node first.');
                        return;
                      }
                      const name = window.prompt(`Name this selection (${selectedNodeIds.length} node(s))`);
                      if (name) createSavedSelection(name, selectedNodeIds);
                    }}
                    title="Save the currently selected nodes as a named group"
                  >
                    + Save selection
                  </button>
                </div>
                {savedSelections.length === 0 ? (
                  <p className="of-text-muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
                    Select nodes on the canvas, then save them as a named group with its own colour ring.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                    {savedSelections.map((selection) => (
                      <div
                        key={selection.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: 8,
                          borderRadius: 6,
                          border: '1px solid var(--border-subtle)',
                          opacity: selection.visible ? 1 : 0.55,
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            background: selection.color,
                            border: '2px solid #ffffff',
                            boxShadow: '0 0 0 1px rgba(148,163,184,0.3)',
                          }}
                        />
                        <input
                          type="text"
                          className="of-input"
                          defaultValue={selection.name}
                          onBlur={(e) => renameSavedSelection(selection.id, e.target.value)}
                          style={{ flex: 1, padding: '4px 6px', fontSize: 12 }}
                        />
                        <span className="of-text-muted" style={{ fontSize: 11 }}>{selection.nodeIds.length}</span>
                        <button
                          type="button"
                          className="of-btn of-btn-ghost"
                          onClick={() => quickSelectSaved(selection.id)}
                          title="Select these nodes"
                        >
                          ➤
                        </button>
                        <button
                          type="button"
                          className="of-btn of-btn-ghost"
                          onClick={() => toggleSavedSelectionVisible(selection.id)}
                          title={selection.visible ? 'Hide ring' : 'Show ring'}
                        >
                          {selection.visible ? '👁' : '◌'}
                        </button>
                        <button
                          type="button"
                          className="of-btn of-btn-ghost"
                          onClick={() => deleteSavedSelection(selection.id)}
                          title="Delete selection"
                          style={{ color: '#f87171' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SidebarSection>
          )}

          {activeTab === 'histogram' && (
            <SidebarSection title="Histogram" subtitle="Property breakdowns + Filter to / Filter out">
              <HistogramFacets
                tenant={vertexTenant}
                objectRefs={histogramObjectRefs}
                chips={histogramChips}
                onAddChip={addHistogramChip}
                onRemoveChip={removeHistogramChip}
                resolveTypeName={resolveTypeName}
              />
            </SidebarSection>
          )}

          {activeTab === 'media' && (
            <SidebarSection title="Media layers" subtitle="Image annotations and overlays">
              <div className="of-panel-muted" style={{ marginTop: 12, padding: 12 }}>
                <p className="of-eyebrow">Media set policy</p>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', marginTop: 8 }}>
                  <select className="of-select" value={mediaPermissionMode} onChange={(e) => setMediaPermissionMode(e.target.value as 'allowed' | 'denied')}>
                    <option value="allowed">Allowed</option>
                    <option value="denied">Denied</option>
                  </select>
                  <input className="of-input" value={mediaMarkings} onChange={(e) => setMediaMarkings(e.target.value)} placeholder="markings" />
                </div>
                <input className="of-input" value={mediaUrlInput} onChange={(e) => setMediaUrlInput(e.target.value)} placeholder="media URL (image/video/pdf)" style={{ marginTop: 8 }} />
                <button type="button" className="of-btn of-btn-primary" style={{ marginTop: 8 }} onClick={attachMediaToSelection} disabled={!selectedNode || mediaPermissionMode === 'denied'}>
                  Attach media to selected node
                </button>
                {mediaPermissionMode === 'denied' && <div className="of-status-warning" style={{ marginTop: 8, padding: 8 }}>Access denied due to permission/marking policy.</div>}
              </div>
              <div
                style={{
                  marginTop: 16,
                  overflow: 'hidden',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: '#0f172a',
                }}
              >
                <div style={{ position: 'relative', aspectRatio: '16 / 10', width: '100%', overflow: 'hidden' }}>
                  <img
                    src={activeMediaUrl()}
                    alt="Vertex media layer"
                    style={{ height: '100%', width: '100%', objectFit: 'cover' }}
                  />
                  {graphAnnotations.map((annotation) => (
                    <div
                      key={annotation.id}
                      style={{
                        position: 'absolute',
                        left: `${annotation.x}%`,
                        top: `${annotation.y}%`,
                        width: `${annotation.width}%`,
                        height: `${annotation.height}%`,
                        border: `2px solid ${annotation.color}`,
                        background: `${annotation.color}22`,
                        borderRadius: 8,
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          left: 4,
                          top: 4,
                          padding: '2px 6px',
                          background: 'rgba(0,0,0,0.6)',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 600,
                          color: '#fff',
                        }}
                      >
                        {annotation.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {selectedNode && mediaAttachmentByNode[selectedNode.id] && mediaPermissionMode === 'allowed' && (
                <div className="of-panel-muted" style={{ marginTop: 12, padding: 12 }}>
                  <p className="of-eyebrow">Inline media thumbnail</p>
                  {mediaAttachmentByNode[selectedNode.id].type === 'image' && <img src={mediaAttachmentByNode[selectedNode.id].url} alt="attachment" style={{ width: '100%', marginTop: 8, borderRadius: 8 }} />}
                  {mediaAttachmentByNode[selectedNode.id].type === 'video' && <video src={mediaAttachmentByNode[selectedNode.id].url} controls style={{ width: '100%', marginTop: 8, borderRadius: 8 }} />}
                  {mediaAttachmentByNode[selectedNode.id].type === 'pdf' && <a href={mediaAttachmentByNode[selectedNode.id].url} target="_blank" rel="noreferrer" className="of-btn" style={{ marginTop: 8 }}>Open PDF</a>}
                </div>
              )}

              <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
                  <input
                    className="of-input"
                    value={mediaField}
                    onChange={(e) => setMediaField(e.target.value)}
                    placeholder="media property"
                  />
                  <input
                    className="of-input"
                    value={annotationField}
                    onChange={(e) => setAnnotationField(e.target.value)}
                    placeholder="annotation property"
                  />
                </div>
                <input
                  className="of-input"
                  value={annotationLabel}
                  onChange={(e) => setAnnotationLabel(e.target.value)}
                  placeholder="annotation label"
                />
                <textarea
                  className="of-textarea"
                  value={annotationNote}
                  onChange={(e) => setAnnotationNote(e.target.value)}
                  placeholder="note"
                  style={{ minHeight: 70 }}
                />
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(4, 1fr)' }}>
                  <input
                    type="number"
                    className="of-input"
                    value={annotationX}
                    onChange={(e) => setAnnotationX(Number(e.target.value))}
                    placeholder="x %"
                  />
                  <input
                    type="number"
                    className="of-input"
                    value={annotationY}
                    onChange={(e) => setAnnotationY(Number(e.target.value))}
                    placeholder="y %"
                  />
                  <input
                    type="number"
                    className="of-input"
                    value={annotationWidth}
                    onChange={(e) => setAnnotationWidth(Number(e.target.value))}
                    placeholder="w %"
                  />
                  <input
                    type="number"
                    className="of-input"
                    value={annotationHeight}
                    onChange={(e) => setAnnotationHeight(Number(e.target.value))}
                    placeholder="h %"
                  />
                </div>
                <input
                  type="color"
                  value={annotationColor}
                  onChange={(e) => setAnnotationColor(e.target.value)}
                  style={{ height: 44, width: '100%', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)' }}
                />
                <button type="button" className="of-btn of-btn-primary" onClick={addAnnotation}>
                  Create annotation
                </button>
                <div style={{ display: 'grid', gap: 8 }}>
                  {graphAnnotations
                    .filter((item) => item.id && !item.id.startsWith('graph-'))
                    .map((annotation) => (
                      <div
                        key={annotation.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-panel-muted)',
                          padding: 12,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 500, color: 'var(--text-strong)' }}>{annotation.label}</div>
                          <div className="of-text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                            {annotation.note || 'No note'}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="of-btn of-btn-danger"
                          onClick={() => removeAnnotation(annotation.id)}
                          style={{ minHeight: 28, fontSize: 11 }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            </SidebarSection>
          )}

          {activeTab === 'scenarios' && (
            <SidebarSection title="Scenarios" subtitle="What-if simulation">
              <p className="of-text-muted" style={{ fontSize: 13, marginTop: 8 }}>
                Run multi-case overrides on the selected root object and inspect graph deltas,
                impacted objects, and rule outcomes.
              </p>
              <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
                  <input className="of-input" value={activeBranchRid} onChange={(e) => setActiveBranchRid(e.target.value)} placeholder="Active branch RID (optional)" />
                  <input className="of-input" value={activeBranchName} onChange={(e) => setActiveBranchName(e.target.value)} placeholder="Active branch name (optional)" />
                </div>
                {scenarioDrafts.map((draft, index) => (
                  <div key={index} className="of-panel-muted" style={{ padding: 16 }}>
                    <input
                      className="of-input"
                      value={draft.name}
                      onChange={(e) =>
                        setScenarioDrafts((prev) => prev.map((item, i) => (i === index ? { ...item, name: e.target.value } : item)))
                      }
                    />
                    <textarea
                      className="of-textarea"
                      value={draft.description}
                      onChange={(e) =>
                        setScenarioDrafts((prev) =>
                          prev.map((item, i) => (i === index ? { ...item, description: e.target.value } : item)),
                        )
                      }
                      style={{ marginTop: 12, minHeight: 70, fontSize: 13 }}
                    />
                    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
                      <input
                        className="of-input"
                        value={draft.propertyName}
                        onChange={(e) =>
                          setScenarioDrafts((prev) =>
                            prev.map((item, i) => (i === index ? { ...item, propertyName: e.target.value } : item)),
                          )
                        }
                        placeholder="property"
                      />
                      <input
                        className="of-input"
                        value={draft.propertyValue}
                        onChange={(e) =>
                          setScenarioDrafts((prev) =>
                            prev.map((item, i) => (i === index ? { ...item, propertyValue: e.target.value } : item)),
                          )
                        }
                        placeholder="override"
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="of-btn of-btn-primary"
                  onClick={() => void runScenarios()}
                  disabled={scenarioLoading || !selectedNode}
                >
                  {scenarioLoading ? 'Simulating…' : 'Run scenarios'}
                </button>
              </div>

              {scenarioResponse && (
                <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button type="button" className={showBaselineLayer ? 'of-btn of-btn-primary' : 'of-btn'} onClick={() => setShowBaselineLayer((v) => !v)}>Baseline layer</button>
                    <button type="button" className={showScenarioOverlay ? 'of-btn of-btn-primary' : 'of-btn'} onClick={() => setShowScenarioOverlay((v) => !v)}>Scenario overlay</button>
                  </div>
                  {scenarioResponse.scenarios.map((result) => (
                    <div key={result.scenario_id} className="of-panel-muted" style={{ padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{result.name}</div>
                          <div className="of-text-muted" style={{ fontSize: 13, marginTop: 4 }}>
                            {result.description ?? 'Scenario result'}
                          </div>
                        </div>
                        <span className="of-chip of-status-info" style={{ fontSize: 11, fontWeight: 600 }}>
                          Goal {result.summary.goal_score}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', marginTop: 12, fontSize: 13 }}>
                        <Stat label="Changed" value={result.summary.changed_object_count} />
                        <Stat label="Schedules" value={result.summary.schedule_count} />
                        <Stat label="Advisory" value={result.summary.advisory_rule_matches} />
                        <Stat label="Boundaries" value={result.summary.boundary_crossings} />
                      </div>
                      <div style={{ marginTop: 10 }}>
                        {(() => {
                          const diff = scenarioDiffSummary(
                            scenarioResponse.baseline?.graph.total_nodes ?? graph?.total_nodes ?? 0,
                            scenarioResponse.baseline?.graph.total_edges ?? graph?.total_edges ?? 0,
                            result.graph.total_nodes,
                            result.graph.total_edges,
                          );
                          return (
                            <div className="of-text-muted" style={{ fontSize: 12 }}>
                              Δnodes +{diff.changedNodes}/-{diff.removedNodes} · Δedges +{diff.changedEdges}/-{diff.removedEdges} · degree {diff.degree} · centrality {diff.centrality} · cluster {diff.clusterSize}
                            </div>
                          );
                        })()}
                      </div>
                      <button
                        type="button"
                        className="of-btn"
                        style={{ marginTop: 10 }}
                        onClick={() => {
                          const source = savedScenarios.find((s) => s.name === result.name) ?? savedScenarios[0];
                          if (!source) return;
                          setPromotedActionsPreview(promoteScenarioToActions(source));
                        }}
                      >
                        Promote to Actions
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {savedScenarios.length > 0 && (
                <div style={{ marginTop: 16 }} className="of-panel-muted">
                  <div style={{ padding: 12 }}>
                    <p className="of-eyebrow">Saved vertex_scenario rows</p>
                    {savedScenarios.slice(0, 5).map((scenario) => (
                      <div key={scenario.id} className="of-text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                        {scenario.name} · {scenario.branchName || 'ephemeral overlay'} · edits {scenario.edits.length}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {promotedActionsPreview.length > 0 && (
                <div className="of-panel-muted" style={{ marginTop: 12, padding: 12 }}>
                  <p className="of-eyebrow">Promotion preview (approval required)</p>
                  {promotedActionsPreview.map((action) => (
                    <div key={`${action.order}-${action.actionId}`} className="of-text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                      #{action.order} {action.actionId} · {action.mode} · {action.approval}
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button type="button" className="of-btn" onClick={() => setProposalApproved(true)}>Approve proposal</button>
                    <button type="button" className="of-btn of-btn-primary" onClick={promoteScenarioToMainGuarded}>Promote to main</button>
                  </div>
                </div>
              )}
            </SidebarSection>
          )}
        </aside>
      </div>

      {loading && (
        <div className="of-text-muted" style={{ fontSize: 13, textAlign: 'center', padding: 16 }}>
          Loading Vertex…
        </div>
      )}

      {/* Floating toggle for the Search Around panel. Placed on the
          right edge so it stays accessible regardless of which left
          sidebar tab is open. */}
      {!searchAroundOpen && (
        <button
          type="button"
          className="of-btn"
          onClick={() => setSearchAroundOpen(true)}
          aria-label="Open Search Around panel"
          style={{
            position: 'fixed',
            top: 72,
            right: 12,
            zIndex: 20,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            paddingInline: 10,
          }}
        >
          <span aria-hidden style={{ fontSize: 12 }}>Search Around</span>
        </button>
      )}
      <SearchAroundPanel
        open={searchAroundOpen}
        onClose={() => setSearchAroundOpen(false)}
        tenant={vertexTenant}
        startingSet={searchAroundStartingSet}
        branchContext={activeBranchRid || undefined}
        onAddToGraph={addTraverseGroupsToGraph}
        onRequestSetStartingObjects={handleSetStartingObjects}
      />

      <TemplateBuilder
        open={templateBuilderOpen}
        onClose={() => setTemplateBuilderOpen(false)}
        sourceGraphId={graph?.root_object_id ?? null}
        availableLayers={objectTypes.map<BuilderLayerOption>((t) => ({
          id: t.id,
          label: t.display_name,
        }))}
        availableObjectTypes={objectTypes.map((t) => ({ id: t.id, display_name: t.display_name }))}
        onSaved={(tpl) => {
          setSavedGraphTemplates((prev) => [tpl, ...prev.filter((t) => t.id !== tpl.id)]);
        }}
      />

      <UseTemplateDialog
        open={useTemplateOpen}
        template={activeGraphTemplate}
        onClose={() => setUseTemplateOpen(false)}
        preloadObjectRid={searchParams.get('objectRid')}
        preloadObjectSetRid={searchParams.get('objectSetRid')}
        onInstantiated={(resp) => {
          if (resp.graph?.id) {
            window.location.hash = `#/vertex?graphId=${resp.graph.id}`;
          }
        }}
      />
    </section>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <label style={{ display: 'block', fontSize: 13 }}>
      <div className="of-eyebrow" style={{ marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </label>
  );
}

interface SidebarSectionProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

function SidebarSection({ title, subtitle, children }: SidebarSectionProps) {
  return (
    <section className="of-panel" style={{ padding: 24 }}>
      <p className="of-eyebrow">{title}</p>
      <h2 className="of-heading-md" style={{ marginTop: 4 }}>
        {subtitle}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-sm)',
        background: '#fff',
        padding: '8px 12px',
      }}
    >
      <span className="of-text-muted">{label}</span> {value}
    </div>
  );
}

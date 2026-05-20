import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Core, ElementDefinition, EventObject, LayoutOptions, StylesheetStyle } from 'cytoscape';

import { getOntologyGraph, listObjectTypes, type GraphEdge, type GraphNode, type GraphResponse, type ObjectType } from '@/lib/api/ontology';
import { CytoscapeCanvas } from '@/lib/components/CytoscapeCanvas';
import { Glyph } from '@/lib/components/ui/Glyph';

type Mode = 'schema' | 'object';

interface GraphLoadOverride {
  mode?: Mode;
  rootObjectId?: string;
  rootTypeId?: string;
  depth?: number;
  limit?: number;
}

const NODE_KIND_COLORS: Record<string, string> = {
  object_type: '#2563eb',
  object_instance: '#0f766e',
  interface: '#7c3aed',
};

const ONTOLOGY_GRAPH_STYLESHEET: StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      label: 'data(label)',
      color: '#f8fafc',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': '118px',
      'font-size': 11,
      'font-weight': 600,
      width: 118,
      height: 46,
      shape: 'round-rectangle',
      'border-color': '#64748b',
      'border-width': 2,
      'overlay-opacity': 0,
    },
  },
  {
    selector: 'node[kind = "object_instance"]',
    style: {
      shape: 'ellipse',
      width: 58,
      height: 58,
      'text-valign': 'bottom',
      'text-margin-y': 8,
      'text-max-width': '130px',
    },
  },
  {
    selector: 'node[kind = "interface"]',
    style: {
      shape: 'diamond',
      width: 70,
      height: 70,
      'text-valign': 'bottom',
      'text-margin-y': 8,
    },
  },
  {
    selector: 'node.is-connected',
    style: {
      'border-color': '#22c55e',
      'border-width': 4,
    },
  },
  {
    selector: 'node.is-selected',
    style: {
      'border-color': '#f59e0b',
      'border-width': 5,
      'z-index': 20,
    },
  },
  {
    selector: 'node.is-dimmed',
    style: {
      opacity: 0.28,
    },
  },
  {
    selector: 'edge',
    style: {
      width: 1.6,
      'line-color': '#64748b',
      'target-arrow-color': '#64748b',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      label: 'data(label)',
      'font-size': 9,
      color: '#cbd5e1',
      'text-rotation': 'autorotate',
      'text-background-color': '#0f172a',
      'text-background-opacity': 0.82,
      'text-background-padding': '2px',
    },
  },
  {
    selector: 'edge.is-connected',
    style: {
      width: 3,
      'line-color': '#22c55e',
      'target-arrow-color': '#22c55e',
      'z-index': 10,
    },
  },
  {
    selector: 'edge.is-dimmed',
    style: {
      opacity: 0.18,
    },
  },
];

export function OntologyGraphPage() {
  const [types, setTypes] = useState<ObjectType[]>([]);
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [mode, setMode] = useState<Mode>('schema');
  const [rootObjectId, setRootObjectId] = useState('');
  const [rootTypeId, setRootTypeId] = useState('');
  const [depth, setDepth] = useState(2);
  const [limit, setLimit] = useState(80);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const initialLoadRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    listObjectTypes({ per_page: 200 })
      .then((res) => {
        if (!cancelled) setTypes(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const loadGraph = useCallback(async (override: GraphLoadOverride = {}, nextSelectionId = '') => {
    const nextMode = override.mode ?? mode;
    const nextRootObjectId = override.rootObjectId ?? rootObjectId;
    const nextRootTypeId = override.rootTypeId ?? rootTypeId;
    const nextDepth = override.depth ?? depth;
    const nextLimit = override.limit ?? limit;

    setBusy(true);
    setError('');
    try {
      const res = await getOntologyGraph({
        root_object_id: nextMode === 'object' ? nextRootObjectId.trim() || undefined : undefined,
        root_type_id: nextMode === 'schema' ? nextRootTypeId || undefined : undefined,
        depth: nextDepth,
        limit: nextLimit,
      });
      setGraph(res);
      setSelectedNodeId(
        nextSelectionId && res.nodes.some((node) => node.id === nextSelectionId)
          ? nextSelectionId
          : '',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load graph');
    } finally {
      setBusy(false);
    }
  }, [depth, limit, mode, rootObjectId, rootTypeId]);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    void loadGraph();
  }, [loadGraph]);

  const selectedNode = useMemo(
    () => graph?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [graph, selectedNodeId],
  );

  const handleModeChange = (nextMode: Mode) => {
    setMode(nextMode);
    setSelectedNodeId('');
  };

  const handleFocusNode = async (node: GraphNode) => {
    const objectId = objectIdFromNode(node);
    if (objectId) {
      setMode('object');
      setRootObjectId(objectId);
      await loadGraph({ mode: 'object', rootObjectId: objectId }, node.id);
      return;
    }

    const typeId = typeIdFromNode(node);
    if (typeId) {
      setMode('schema');
      setRootTypeId(typeId);
      await loadGraph({ mode: 'schema', rootTypeId: typeId }, node.id);
    }
  };

  return (
    <section className="of-page ontology-graph-page">
      <header className="ontology-graph-header">
        <div>
          <Link to="/ontology" className="ontology-graph-backlink">
            Ontology
          </Link>
          <h1 className="of-heading-xl" style={{ marginTop: 4 }}>Ontology graph</h1>
          <div className="ontology-graph-chip-row" style={{ marginTop: 8 }}>
            <span className="of-chip of-status-info">{graph?.mode ?? mode}</span>
            <span className="of-chip">{graph?.total_nodes ?? 0} nodes</span>
            <span className="of-chip">{graph?.total_edges ?? 0} edges</span>
            {graph?.summary.scope && <span className="of-chip of-status-success">{graph.summary.scope}</span>}
          </div>
        </div>
        <div className="ontology-graph-header-actions">
          <button type="button" onClick={() => void loadGraph()} disabled={busy} className="of-button">
            <Glyph name="graph" size={15} />
            {busy ? 'Loading' : 'Refresh'}
          </button>
          <Link to="/ontology/types" className="of-button of-button--primary">
            <Glyph name="plus" size={15} />
            Type
          </Link>
        </div>
      </header>

      <section className="of-toolbar ontology-graph-toolbar" aria-label="Ontology graph controls">
        <div className="ontology-graph-segment" aria-label="Graph mode">
          <button
            type="button"
            onClick={() => handleModeChange('schema')}
            className={mode === 'schema' ? 'of-button of-button--primary' : 'of-button'}
          >
            Schema
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('object')}
            className={mode === 'object' ? 'of-button of-button--primary' : 'of-button'}
          >
            Object
          </button>
        </div>

        {mode === 'schema' ? (
          <label className="ontology-graph-field">
            <span>Root type</span>
            <select value={rootTypeId} onChange={(event) => setRootTypeId(event.target.value)} className="of-input">
              <option value="">All types</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>{type.display_name || type.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <label className="ontology-graph-field ontology-graph-field--wide">
            <span>Root object</span>
            <input
              value={rootObjectId}
              onChange={(event) => setRootObjectId(event.target.value)}
              placeholder="object id"
              className="of-input"
            />
          </label>
        )}

        <label className="ontology-graph-field ontology-graph-field--small">
          <span>Depth</span>
          <input
            type="number"
            min={1}
            max={6}
            value={depth}
            onChange={(event) => setDepth(clampNumber(event.target.value, 1, 6, 2))}
            className="of-input"
          />
        </label>
        <label className="ontology-graph-field ontology-graph-field--small">
          <span>Limit</span>
          <input
            type="number"
            min={10}
            max={120}
            value={limit}
            onChange={(event) => setLimit(clampNumber(event.target.value, 10, 120, 80))}
            className="of-input"
          />
        </label>
        <button type="button" onClick={() => void loadGraph()} disabled={busy} className="of-button of-button--primary">
          Load
        </button>
      </section>

      {error && (
        <div role="alert" className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {graph && <OntologyGraphStats graph={graph} />}

      {!graph && busy ? (
        <section className="of-panel ontology-graph-empty">Loading graph...</section>
      ) : graph && graph.nodes.length === 0 ? (
        <section className="of-panel ontology-graph-empty">No graph nodes returned.</section>
      ) : graph ? (
        <OntologyGraphWorkspace
          graph={graph}
          selectedNode={selectedNode}
          selectedNodeId={selectedNodeId}
          busy={busy}
          onSelectNode={setSelectedNodeId}
          onClearSelection={() => setSelectedNodeId('')}
          onFocusNode={(node) => void handleFocusNode(node)}
        />
      ) : null}
    </section>
  );
}

function OntologyGraphStats({ graph }: { graph: GraphResponse }) {
  const stats = [
    { label: 'Node kinds', value: formatCountMap(graph.summary.node_kinds) },
    { label: 'Edge kinds', value: formatCountMap(graph.summary.edge_kinds) },
    { label: 'Root neighbors', value: graph.summary.root_neighbor_count },
    { label: 'Max hops', value: graph.summary.max_hops_reached },
    { label: 'Boundary crossings', value: graph.summary.boundary_crossings },
    { label: 'Sensitive objects', value: graph.summary.sensitive_objects },
  ];

  return (
    <section className="ontology-graph-stat-strip" aria-label="Ontology graph summary">
      {stats.map((stat) => (
        <div key={stat.label} className="ontology-graph-stat">
          <span>{stat.label}</span>
          <strong>{stat.value}</strong>
        </div>
      ))}
    </section>
  );
}

interface OntologyGraphWorkspaceProps {
  graph: GraphResponse;
  selectedNode: GraphNode | null;
  selectedNodeId: string;
  busy: boolean;
  onSelectNode: (nodeId: string) => void;
  onClearSelection: () => void;
  onFocusNode: (node: GraphNode) => void;
}

function OntologyGraphWorkspace({
  graph,
  selectedNode,
  selectedNodeId,
  busy,
  onSelectNode,
  onClearSelection,
  onFocusNode,
}: OntologyGraphWorkspaceProps) {
  const graphKey = useMemo(
    () => `${graph.mode}:${graph.root_type_id ?? ''}:${graph.root_object_id ?? ''}:${graph.nodes.map((node) => node.id).join('|')}`,
    [graph],
  );

  const connectedEdges = useMemo(
    () => selectedNodeId
      ? graph.edges.filter((edge) => edge.source === selectedNodeId || edge.target === selectedNodeId)
      : [],
    [graph.edges, selectedNodeId],
  );

  const connectedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const edge of connectedEdges) {
      ids.add(edge.source);
      ids.add(edge.target);
    }
    ids.delete(selectedNodeId);
    return ids;
  }, [connectedEdges, selectedNodeId]);

  const elements = useMemo<ElementDefinition[]>(() => {
    const hasSelection = Boolean(selectedNodeId);
    const nodes = graph.nodes.map((node) => {
      const classes = [
        selectedNodeId === node.id ? 'is-selected' : '',
        connectedNodeIds.has(node.id) ? 'is-connected' : '',
        hasSelection && selectedNodeId !== node.id && !connectedNodeIds.has(node.id) ? 'is-dimmed' : '',
      ].filter(Boolean).join(' ');

      return {
        data: {
          id: node.id,
          label: node.label,
          secondaryLabel: node.secondary_label,
          kind: node.kind,
          color: node.color || NODE_KIND_COLORS[node.kind] || '#475569',
          route: node.route,
        },
        classes,
      };
    });

    const edges = graph.edges.map((edge) => {
      const incident = selectedNodeId && (edge.source === selectedNodeId || edge.target === selectedNodeId);
      return {
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label || edge.kind,
          kind: edge.kind,
        },
        classes: [
          incident ? 'is-connected' : '',
          hasSelection && !incident ? 'is-dimmed' : '',
        ].filter(Boolean).join(' '),
      };
    });

    return [...nodes, ...edges];
  }, [connectedNodeIds, graph, selectedNodeId]);

  const layout = useMemo<LayoutOptions>(
    () => graph.mode === 'schema'
      ? { name: 'fcose', animate: false, padding: 32, nodeSeparation: 72 }
      : { name: 'breadthfirst', directed: true, animate: false, padding: 32, spacingFactor: 1.35 },
    [graph.mode],
  );

  const handleReady = useCallback((cy: Core) => {
    cy.removeListener('tap');
    cy.on('tap', 'node', (event: EventObject) => {
      onSelectNode(String(event.target.id()));
    });
    cy.on('tap', (event: EventObject) => {
      if (event.target === cy) onClearSelection();
    });
  }, [onClearSelection, onSelectNode]);

  return (
    <div className="ontology-graph-workspace">
      <section className="of-panel ontology-graph-canvas-panel">
        <div className="ontology-graph-canvas-header">
          <div>
            <p className="of-eyebrow">Graph</p>
            <div className="ontology-graph-legend">
              {Object.entries(NODE_KIND_COLORS).map(([kind, color]) => (
                <span key={kind}>
                  <i style={{ background: color }} />
                  {formatKind(kind)}
                </span>
              ))}
            </div>
          </div>
          {busy && <span className="of-chip of-status-info">Loading</span>}
        </div>
        <div className="ontology-graph-canvas-frame">
          <CytoscapeCanvas
            key={graphKey}
            elements={elements}
            stylesheet={ONTOLOGY_GRAPH_STYLESHEET}
            layout={layout}
            height={660}
            onReady={handleReady}
            className="ontology-graph-canvas"
            testHandle="ontology-graph"
          />
        </div>
      </section>

      <OntologyGraphSidebar
        graph={graph}
        selectedNode={selectedNode}
        connectedEdges={connectedEdges}
        connectedNodeIds={connectedNodeIds}
        onFocusNode={onFocusNode}
      />
    </div>
  );
}

interface OntologyGraphSidebarProps {
  graph: GraphResponse;
  selectedNode: GraphNode | null;
  connectedEdges: GraphEdge[];
  connectedNodeIds: Set<string>;
  onFocusNode: (node: GraphNode) => void;
}

function OntologyGraphSidebar({
  graph,
  selectedNode,
  connectedEdges,
  connectedNodeIds,
  onFocusNode,
}: OntologyGraphSidebarProps) {
  const connectedNodes = useMemo(
    () => graph.nodes.filter((node) => connectedNodeIds.has(node.id)),
    [connectedNodeIds, graph.nodes],
  );

  if (!selectedNode) {
    return (
      <aside className="of-panel ontology-graph-sidebar">
        <div className="ontology-graph-empty ontology-graph-empty--sidebar">
          Select a node to inspect focus, metadata, and connected types.
        </div>
      </aside>
    );
  }

  const metadata = metadataEntries(selectedNode.metadata);
  const canFocus = Boolean(typeIdFromNode(selectedNode) || objectIdFromNode(selectedNode));

  return (
    <aside className="of-panel ontology-graph-sidebar">
      <div className="ontology-graph-sidebar-body">
        <div>
          <div className="ontology-graph-sidebar-title">
            <div>
              <p className="of-eyebrow">{formatKind(selectedNode.kind)}</p>
              <h2>{selectedNode.label}</h2>
            </div>
            <span
              className="ontology-graph-node-swatch"
              style={{ background: selectedNode.color || NODE_KIND_COLORS[selectedNode.kind] || '#475569' }}
              aria-hidden="true"
            />
          </div>
          {selectedNode.secondary_label && (
            <p className="of-text-muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
              {selectedNode.secondary_label}
            </p>
          )}
          <div className="ontology-graph-id">{selectedNode.id}</div>
        </div>

        <div className="ontology-graph-action-row">
          <button type="button" onClick={() => onFocusNode(selectedNode)} disabled={!canFocus} className="of-button of-button--primary">
            <Glyph name="graph" size={15} />
            Focus
          </button>
          {selectedNode.route && (
            <Link to={selectedNode.route} className="of-button">
              Open
            </Link>
          )}
        </div>

        <section className="ontology-graph-sidebar-section">
          <p className="of-eyebrow">Connected types</p>
          {connectedNodes.length === 0 ? (
            <p className="of-text-muted" style={{ margin: '8px 0 0', fontSize: 12 }}>No adjacent nodes.</p>
          ) : (
            <ul className="ontology-graph-neighbor-list">
              {connectedNodes.map((node) => (
                <li key={node.id} className="ontology-graph-neighbor">
                  <div>
                    <strong>{node.label}</strong>
                    <span>{formatKind(node.kind)}</span>
                  </div>
                  {edgeLabelsBetween(selectedNode.id, node.id, connectedEdges).map((label) => (
                    <em key={label}>{label}</em>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ontology-graph-sidebar-section">
          <p className="of-eyebrow">Metadata</p>
          {metadata.length === 0 ? (
            <p className="of-text-muted" style={{ margin: '8px 0 0', fontSize: 12 }}>No metadata.</p>
          ) : (
            <dl className="ontology-graph-kv">
              {metadata.map(([key, value]) => (
                <div key={key} className="ontology-graph-kv-row">
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>
    </aside>
  );
}

function clampNumber(value: string, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function formatKind(kind: string) {
  return kind.replace(/_/g, ' ');
}

function formatCountMap(value: Record<string, number>) {
  const entries = Object.entries(value);
  if (entries.length === 0) return '0';
  return entries.map(([key, count]) => `${formatKind(key)} ${count}`).join(', ');
}

function metadataEntries(metadata: Record<string, unknown>) {
  return Object.entries(metadata ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => [formatKind(key), readableValue(value)] as const);
}

function readableValue(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function typeIdFromNode(node: GraphNode) {
  if (node.kind === 'object_type' && node.id.startsWith('type:')) return node.id.slice('type:'.length);
  const value = node.metadata?.object_type_id;
  return typeof value === 'string' ? value : null;
}

function objectIdFromNode(node: GraphNode) {
  if (node.kind === 'object_instance' && node.id.startsWith('object:')) return node.id.slice('object:'.length);
  return null;
}

function edgeLabelsBetween(sourceId: string, targetId: string, edges: GraphEdge[]) {
  return edges
    .filter((edge) => (
      (edge.source === sourceId && edge.target === targetId) ||
      (edge.source === targetId && edge.target === sourceId)
    ))
    .map((edge) => edge.label || formatKind(edge.kind));
}

// Workshop "Vertex Graph" embed widget — renders a saved Vertex graph
// (or a graph template) inside a Workshop module. Closes PoC gap #1
// (Foundry-native `vertex_graph_embed`).
//
// Scope of this initial slice:
//   - Resolve the saved graph RID from `resource.{kind,rid,variable_id,
//     override_rid}` via runtime primitive values.
//   - Fetch the graph through `getVertexAnalysis` (vertex-service GET
//     /api/v1/vertex/graphs/{id}).
//   - Render the first seed object set as cytoscape nodes (no edges).
//     Live multi-hop expansion lives in the Vertex app proper — the
//     embed is a viewport per the Palantir contract, with deep-link
//     "Open in Vertex" for the full canvas.
//   - User → Workshop selection sync via `selected_objects_variable_id`
//     + `selected_objects_change` event.
//
// Out of scope here (tracked as follow-up):
//   - Drawing resolved edges from `layout_state_json` / live traversal.
//   - Template parameter binding (`parameters[]`).
//   - Scenario load / regenerate.
//   - Append-on-parameter-change.
//   - Side panels beyond Legend / Selection / Info.

import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Core, ElementDefinition, StylesheetStyle } from 'cytoscape';

import type { AppWidget } from '@/lib/api/apps';
import type { ObjectInstance } from '@/lib/api/ontology';
import { CytoscapeCanvas } from '@/lib/components/CytoscapeCanvas';
import { getVertexAnalysis } from '@/lib/api/vertexAnalyses';

import { useRuntime } from './workshop-runtime-context';
import { useWorkshopData } from './workshop-context';
import { executeWorkshopObjectSet } from './workshopObjectSets';
import {
  graphIdFromRid,
  readRefreshKey,
  readWidgetVertexGraphEmbedProps,
  resolveGraphRid,
  type VertexGraphEmbedProps,
} from './workshopVertexGraph';

interface Props {
  widget: AppWidget;
}

const STYLESHEET: StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'background-color': '#2d72d2',
      'label': 'data(label)',
      'color': '#0f172a',
      'font-size': 10,
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 6,
      'width': 28,
      'height': 28,
      'border-width': 2,
      'border-color': '#fff',
    },
  },
  {
    selector: 'node:selected',
    style: {
      'background-color': '#c026d3',
      'border-color': '#581c87',
      'border-width': 3,
    },
  },
];

const MAX_NODES = 200;

export function WorkshopVertexGraphEmbedWidget({ widget }: Props) {
  const runtime = useRuntime();
  const workshopData = useWorkshopData();
  const cfg = useMemo<VertexGraphEmbedProps>(() => readWidgetVertexGraphEmbedProps(widget), [widget.props]);

  const rid = resolveGraphRid(cfg, runtime.primitiveValues);
  const refreshKey = readRefreshKey(cfg, runtime.primitiveValues);

  // Fetch the saved Vertex graph. The query key includes refreshKey
  // so a runtime "Refresh key" variable change forces a re-fetch.
  const graphQuery = useQuery({
    queryKey: ['vertex-graph-embed', rid, refreshKey],
    queryFn: () => getVertexAnalysis(rid),
    enabled: rid.length > 0,
    staleTime: 30_000,
  });

  // Resolve the first seed object set into cytoscape nodes. We pull
  // the variable from WorkshopDataContext so the same filter chain
  // the rest of the module honours applies.
  const seedRid = graphQuery.data?.seedObjectSetRid ?? '';
  const objectsQuery = useQuery({
    queryKey: ['vertex-graph-embed-objects', rid, seedRid, refreshKey],
    queryFn: async () => {
      if (!seedRid) return [];
      // The seed RID matches a Workshop variable id when present;
      // fall through to a generic execution otherwise.
      const variable = workshopData.variables.find((entry) => entry.id === seedRid) ?? null;
      const objectTypeId = variable?.object_type_id ?? '';
      if (!objectTypeId) return [];
      const response = await executeWorkshopObjectSet({
        variable,
        variables: workshopData.variables,
        objectTypeId,
        limit: MAX_NODES,
      });
      return response.data;
    },
    enabled: graphQuery.isSuccess && Boolean(seedRid),
    staleTime: 30_000,
  });

  const elements = useMemo<ElementDefinition[]>(() => {
    const nodes = objectsQuery.data ?? [];
    return nodes.slice(0, MAX_NODES).map((object) => ({
      data: {
        id: object.id,
        label: pickLabel(object),
        object_type_id: object.object_type_id,
      },
      group: 'nodes',
    }));
  }, [objectsQuery.data]);

  // Wire cytoscape `tap` → Workshop `selected_objects` variable +
  // `selected_objects_change` event. Selection is user→Workshop only,
  // per the Foundry contract.
  const cyRef = useRef<Core | null>(null);
  const handleReady = (cy: Core) => {
    cyRef.current = cy;
    cy.removeListener('tap');
    cy.on('tap', (event) => {
      // tap on background clears selection
      if (event.target === cy) {
        emitSelection([]);
        return;
      }
    });
    cy.on('tap', 'node', (event) => {
      const id = String(event.target.data('id'));
      const objects = (objectsQuery.data ?? []).filter((entry) => entry.id === id);
      emitSelection(objects);
    });
  };

  // Push objects_on_subgraph whenever the node set changes.
  useEffect(() => {
    if (!cfg.objectsOnSubgraphVariableId) return;
    runtime.setSelectedObjectSet(cfg.objectsOnSubgraphVariableId, objectsQuery.data ?? []);
  }, [cfg.objectsOnSubgraphVariableId, objectsQuery.data, runtime]);

  function emitSelection(objects: ObjectInstance[]) {
    if (cfg.selectedObjectsVariableId) {
      runtime.setSelectedObjectSet(cfg.selectedObjectsVariableId, objects);
    }
    void runtime.dispatchEvents(widget, 'selected_objects_change', {
      object_ids: objects.map((entry) => entry.id),
    });
  }

  // Honour the zoom_to input — when the bound Workshop variable
  // changes, fit the viewport to those nodes.
  const zoomToObjects = cfg.zoomToVariableId ? runtime.selectedObjectSets[cfg.zoomToVariableId] ?? [] : [];
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || zoomToObjects.length === 0) return;
    const ids = new Set(zoomToObjects.map((entry) => entry.id));
    const target = cy.nodes().filter((node) => ids.has(String(node.data('id'))));
    if (target.length > 0) {
      cy.fit(target, 40);
    }
  }, [zoomToObjects]);

  if (!rid) {
    return <EmbedPlaceholder title={widget.title} message={cfg.incompleteInputsMessage} />;
  }

  if (graphQuery.isLoading) {
    return <EmbedShell title={widget.title}><p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Loading saved graph…</p></EmbedShell>;
  }

  if (graphQuery.error) {
    const message = graphQuery.error instanceof Error ? graphQuery.error.message : 'Failed to load Vertex graph';
    return (
      <EmbedShell title={widget.title}>
        <div role="alert" style={errorStyle()}>{message}</div>
      </EmbedShell>
    );
  }

  if (!graphQuery.data) {
    return <EmbedShell title={widget.title}><div role="alert" style={errorStyle()}>Vertex graph not found or marking-restricted.</div></EmbedShell>;
  }

  const graph = graphQuery.data;
  const nodes = objectsQuery.data ?? [];
  const graphRoute = `/vertex/${graphIdFromRid(graph.rid)}`;

  return (
    <section
      aria-label={widget.title || graph.title || 'Vertex graph'}
      style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: 320, background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden' }}
    >
      {cfg.panels.info ? (
        <header style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', background: '#f8fafc' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Vertex Graph</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{graph.title || widget.title}</div>
            {graph.description ? <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>{graph.description}</p> : null}
          </div>
          {cfg.capabilities.enableTransitionToVertex ? (
            <a
              href={graphRoute}
              target="_blank"
              rel="noreferrer"
              className="of-button"
              style={{ padding: '6px 9px', fontSize: 12, textDecoration: 'none' }}
            >
              Open in Vertex ↗
            </a>
          ) : null}
        </header>
      ) : null}

      <div style={{ position: 'relative', minHeight: 220 }}>
        {objectsQuery.isLoading ? (
          <div style={loadingOverlayStyle()}>
            <span className="of-text-muted" style={{ fontSize: 12 }}>Resolving seed objects…</span>
          </div>
        ) : null}
        {elements.length > 0 ? (
          <CytoscapeCanvas
            elements={elements}
            stylesheet={STYLESHEET}
            height="100%"
            onReady={handleReady}
            testHandle={`workshop-vertex-${widget.id}`}
          />
        ) : (
          <div style={emptyStyle()}>
            <p className="of-text-muted" style={{ margin: 0, fontSize: 12, textAlign: 'center' }}>
              {seedRid
                ? 'No objects resolved from the seed object set.'
                : 'This saved graph has no seed object set — open it in Vertex to add objects.'}
            </p>
          </div>
        )}
      </div>

      {cfg.panels.legend ? (
        <footer style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', background: '#fafbfc', fontSize: 11, color: 'var(--text-muted)' }}>
          <span>{nodes.length} object{nodes.length === 1 ? '' : 's'}</span>
          {graph.markings && graph.markings.length > 0 ? (
            <span>Markings: {graph.markings.join(', ')}</span>
          ) : null}
          {cfg.capabilities.readOnly ? <span>Read-only</span> : null}
        </footer>
      ) : null}
    </section>
  );
}

function pickLabel(object: ObjectInstance): string {
  const props = (object.properties ?? {}) as Record<string, unknown>;
  const candidates = ['display_name', 'name', 'title', 'label'];
  for (const key of candidates) {
    const value = props[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return object.id;
}

function EmbedShell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={title || 'Vertex graph'}
      style={{ display: 'grid', placeItems: 'center', minHeight: 220, padding: 24, background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 6 }}
    >
      <div style={{ textAlign: 'center', display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Vertex Graph</div>
        {children}
      </div>
    </section>
  );
}

function EmbedPlaceholder({ title, message }: { title?: string; message: string }) {
  return (
    <EmbedShell title={title}>
      <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>{message}</p>
    </EmbedShell>
  );
}

function loadingOverlayStyle(): React.CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    background: 'rgba(255, 255, 255, 0.7)',
    zIndex: 1,
  };
}

function emptyStyle(): React.CSSProperties {
  return {
    height: '100%',
    minHeight: 220,
    display: 'grid',
    placeItems: 'center',
    padding: 24,
  };
}

function errorStyle(): React.CSSProperties {
  return {
    padding: '8px 10px',
    border: '1px solid #fecaca',
    background: '#fff1f2',
    color: '#b42318',
    borderRadius: 4,
    fontSize: 12,
  };
}

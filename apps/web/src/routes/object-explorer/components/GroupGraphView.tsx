import { useEffect, useMemo, useRef, useState } from 'react';
import type { Core, ElementDefinition, LayoutOptions, StylesheetStyle } from 'cytoscape';

import {
  objectExplorerLinkedTargetForType,
  type LinkType,
  type ObjectType,
} from '@/lib/api/ontology';

import { CytoscapeCanvas } from '@/lib/components/CytoscapeCanvas';
import './GroupGraphView.css';

export interface GroupGraphViewProps {
  groupDisplayName: string;
  objectTypes: ObjectType[];
  linkTypes: LinkType[];
  onPreviewType?: (typeId: string) => void;
  onExploreType?: (typeId: string) => void;
  onRemoveGroup?: () => void;
}

const STYLE: StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'background-color': '#ffffff',
      'border-color': '#aab4c0',
      'border-width': 1,
      label: 'data(label)',
      color: '#182026',
      'font-size': '11px',
      'text-margin-y': -10,
      'text-valign': 'top',
      'text-halign': 'center',
      'text-wrap': 'ellipsis',
      'text-max-width': '140px',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.9,
      'text-background-padding': '2px',
      width: 26,
      height: 26,
      shape: 'round-rectangle',
    },
  },
  {
    selector: 'edge',
    style: {
      width: 1,
      'line-color': '#d3d8de',
      'curve-style': 'bezier',
      label: 'data(label)',
      'font-size': '10px',
      color: '#5c7080',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.95,
      'text-background-padding': '2px',
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#1f6feb',
      'border-width': 2,
    },
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': '#1f6feb',
      color: '#1f6feb',
      width: 1.5,
    },
  },
];

type Popover =
  | null
  | { kind: 'node'; typeId: string; x: number; y: number }
  | { kind: 'edge'; sourceId: string; targetId: string; x: number; y: number };

export function GroupGraphView({
  groupDisplayName,
  objectTypes,
  linkTypes,
  onPreviewType,
  onExploreType,
  onRemoveGroup,
}: GroupGraphViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [popover, setPopover] = useState<Popover>(null);

  const typeIds = useMemo(() => new Set(objectTypes.map((type) => type.id)), [objectTypes]);
  const typeById = useMemo(() => new Map(objectTypes.map((type) => [type.id, type])), [objectTypes]);

  const { elements, linksBetween } = useMemo(() => {
    const nodes: ElementDefinition[] = objectTypes.map((type) => ({
      data: { id: type.id, label: type.display_name || type.name },
    }));

    const edgeLinks = new Map<string, LinkType[]>();
    for (const linkType of linkTypes) {
      for (const objectType of objectTypes) {
        const target = objectExplorerLinkedTargetForType(linkType, objectType.id);
        if (!target) continue;
        if (!typeIds.has(target.target_object_type_id)) continue;
        if (objectType.id === target.target_object_type_id) continue;
        const a = objectType.id;
        const b = target.target_object_type_id;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        const bucket = edgeLinks.get(key) ?? [];
        if (!bucket.some((existing) => existing.id === linkType.id)) bucket.push(linkType);
        edgeLinks.set(key, bucket);
      }
    }

    const edges: ElementDefinition[] = Array.from(edgeLinks.entries()).map(([key, links], index) => {
      const [source, target] = key.split('|');
      return {
        data: {
          id: `edge-${index}-${source}-${target}`,
          source,
          target,
          label: `↔ ${links.length}`,
        },
      };
    });

    return { elements: [...nodes, ...edges], linksBetween: edgeLinks };
  }, [linkTypes, objectTypes, typeIds]);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) setPopover(null);
    }
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  function handleReady(cy: Core) {
    cyRef.current = cy;
    cy.removeAllListeners();
    cy.on('tap', 'node', (event) => {
      const node = event.target;
      const id = node.id();
      const renderedPosition = node.renderedPosition();
      setPopover({ kind: 'node', typeId: id, x: renderedPosition.x, y: renderedPosition.y });
    });
    cy.on('tap', 'edge', (event) => {
      const edge = event.target;
      const data = edge.data() as { source: string; target: string };
      const midpoint = edge.renderedMidpoint();
      setPopover({
        kind: 'edge',
        sourceId: data.source,
        targetId: data.target,
        x: midpoint.x,
        y: midpoint.y,
      });
    });
    cy.on('tap', (event) => {
      if (event.target === cy) setPopover(null);
    });
  }

  function handleZoom(factor: number) {
    const cy = cyRef.current;
    if (!cy) return;
    const next = Math.max(0.1, Math.min(5, cy.zoom() * factor));
    cy.zoom({ level: next, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }

  function handleFit() {
    const cy = cyRef.current;
    if (!cy) return;
    cy.fit(undefined, 24);
  }

  function handleRelayout() {
    const cy = cyRef.current;
    if (!cy) return;
    cy.layout({ name: 'fcose', animate: false } as LayoutOptions).run();
  }

  if (objectTypes.length === 0) {
    return <div className="oe-graph oe-graph__empty">No object types in this group.</div>;
  }

  return (
    <div className="oe-graph" ref={containerRef}>
      <div className="oe-graph__canvas">
        <CytoscapeCanvas elements={elements} stylesheet={STYLE} height={320} onReady={handleReady} />
      </div>

      <div className="oe-graph__toolbar">
        <button
          type="button"
          className="oe-graph__icon-btn oe-graph__icon-btn--text"
          onClick={handleRelayout}
          title="Re-run layout"
        >
          <LayoutGlyph /> Layout
        </button>
        {onRemoveGroup && (
          <button
            type="button"
            className="oe-graph__icon-btn oe-graph__icon-btn--text"
            onClick={onRemoveGroup}
            title={`Hide ${groupDisplayName} from the overview`}
          >
            <RemoveGlyph /> Remove
          </button>
        )}
      </div>

      <div className="oe-graph__legend" role="note" aria-label="Graph legend">
        <div className="oe-graph__legend-row">
          <span className="oe-graph__legend-swatch" data-kind="type" />
          Object type
        </div>
        <div className="oe-graph__legend-row">
          <span className="oe-graph__legend-swatch" data-kind="group" />
          Object type group
        </div>
      </div>

      <div className="oe-graph__zoom" role="group" aria-label="Zoom">
        <button type="button" className="oe-graph__zoom-btn" onClick={() => handleZoom(1.2)} title="Zoom in">
          +
        </button>
        <button type="button" className="oe-graph__zoom-btn" onClick={() => handleZoom(1 / 1.2)} title="Zoom out">
          −
        </button>
        <button type="button" className="oe-graph__zoom-btn" onClick={handleFit} title="Fit to view">
          ⤢
        </button>
      </div>

      {popover && popover.kind === 'node' && (
        <NodeMenu
          x={popover.x}
          y={popover.y}
          name={typeById.get(popover.typeId)?.display_name ?? popover.typeId}
          onPreview={() => {
            onPreviewType?.(popover.typeId);
            setPopover(null);
          }}
          onExplore={() => {
            onExploreType?.(popover.typeId);
            setPopover(null);
          }}
        />
      )}

      {popover && popover.kind === 'edge' && (
        <EdgePopover
          x={popover.x}
          y={popover.y}
          sourceName={typeById.get(popover.sourceId)?.display_name ?? popover.sourceId}
          targetName={typeById.get(popover.targetId)?.display_name ?? popover.targetId}
          links={
            linksBetween.get(
              popover.sourceId < popover.targetId
                ? `${popover.sourceId}|${popover.targetId}`
                : `${popover.targetId}|${popover.sourceId}`,
            ) ?? []
          }
        />
      )}
    </div>
  );
}

function NodeMenu({
  x,
  y,
  name,
  onPreview,
  onExplore,
}: {
  x: number;
  y: number;
  name: string;
  onPreview: () => void;
  onExplore: () => void;
}) {
  return (
    <div className="oe-graph__popover" style={{ left: x + 12, top: y + 12 }} role="menu" aria-label={name}>
      <p className="oe-graph__popover-heading">{name}</p>
      <button type="button" className="oe-graph__menu-item" onClick={onPreview} role="menuitem">
        Preview
      </button>
      <button type="button" className="oe-graph__menu-item" onClick={onExplore} role="menuitem">
        Start exploration
      </button>
    </div>
  );
}

function EdgePopover({
  x,
  y,
  sourceName,
  targetName,
  links,
}: {
  x: number;
  y: number;
  sourceName: string;
  targetName: string;
  links: LinkType[];
}) {
  return (
    <div className="oe-graph__popover" style={{ left: x + 12, top: y + 12 }} role="dialog">
      <p className="oe-graph__popover-heading">
        {sourceName} ↔ {targetName}
      </p>
      {links.length === 0 ? (
        <p className="oe-graph__menu-empty">No link types.</p>
      ) : (
        links.map((link) => (
          <div key={link.id} className="oe-graph__menu-item" aria-readonly="true">
            {link.display_name || link.name}
          </div>
        ))
      )}
    </div>
  );
}

function LayoutGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="12" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.5 5.5l1.5 5M10.5 5.5l-1.5 5M6 4h4" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function RemoveGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m2 8 12 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M1 2l14 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

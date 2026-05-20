// Foundry-style top-right node badges (writeback, backing, object-type).
// SVG layer that follows cytoscape node positions; uses each node's
// renderedBoundingBox() so the badges sit on the top-right edge regardless
// of node width or zoom level. Subscribes to the same cy events as the
// vertex SelectionBorderOverlay so pan/zoom/drag/layout stay in sync.

import { useEffect, useState } from 'react';
import type { Core, NodeSingular } from 'cytoscape';

export type NodeBadgeKind = 'writeback' | 'backing' | 'object-type';

export interface NodeBadgeSpec {
  kind: NodeBadgeKind;
  tooltip: string;
}

export interface NodeRelatedShortcut {
  count: number;
  onClick: () => void;
}

interface NodeBadgeOverlayProps {
  cy: Core | null;
  badgesByNode: Record<string, NodeBadgeSpec[]>;
  /** Per-node "open related items" shortcut. Rendered as a small
   *  right-edge chevron on every entry; clicking selects the node
   *  and opens the Related items drawer. Optional — pass undefined
   *  or an empty record to hide the shortcut. */
  relatedShortcutByNode?: Record<string, NodeRelatedShortcut>;
}

interface PositionedBadge extends NodeBadgeSpec {
  nodeId: string;
  cx: number;
  cy: number;
  index: number;
}

interface PositionedShortcut {
  nodeId: string;
  cx: number;
  cy: number;
  count: number;
}

const BADGE_RADIUS = 9;
const BADGE_SPACING = 20;
const BADGE_FILL = '#ffffff';
const BADGE_STROKE = '#3b4250';

export function NodeBadgeOverlay({ cy, badgesByNode, relatedShortcutByNode }: NodeBadgeOverlayProps) {
  const [positioned, setPositioned] = useState<PositionedBadge[]>([]);
  const [shortcuts, setShortcuts] = useState<PositionedShortcut[]>([]);

  useEffect(() => {
    if (!cy) {
      setPositioned([]);
      setShortcuts([]);
      return undefined;
    }
    const recompute = () => {
      const out: PositionedBadge[] = [];
      for (const [nodeId, badges] of Object.entries(badgesByNode)) {
        if (!badges || badges.length === 0) continue;
        const element = cy.$id(nodeId);
        if (element.length === 0 || !element.isNode()) continue;
        const node = element as NodeSingular;
        const bb = node.renderedBoundingBox();
        // Anchor at the top-right corner; stack badges horizontally to the
        // left so multiple badges remain visible on the same node.
        for (let i = 0; i < badges.length; i++) {
          const offsetX = -i * BADGE_SPACING;
          out.push({
            ...badges[i],
            nodeId,
            index: i,
            cx: bb.x2 + offsetX,
            cy: bb.y1,
          });
        }
      }
      setPositioned(out);
      if (relatedShortcutByNode) {
        const shortOut: PositionedShortcut[] = [];
        for (const [nodeId, spec] of Object.entries(relatedShortcutByNode)) {
          if (!spec || spec.count === 0) continue;
          const element = cy.$id(nodeId);
          if (element.length === 0 || !element.isNode()) continue;
          const node = element as NodeSingular;
          const bb = node.renderedBoundingBox();
          shortOut.push({
            nodeId,
            cx: bb.x2 + 14,
            cy: (bb.y1 + bb.y2) / 2,
            count: spec.count,
          });
        }
        setShortcuts(shortOut);
      } else {
        setShortcuts([]);
      }
    };
    recompute();
    cy.on('viewport', recompute);
    cy.on('position', 'node', recompute);
    cy.on('layoutstop', recompute);
    cy.on('add remove', recompute);
    return () => {
      cy.off('viewport', recompute);
      cy.off('position', 'node', recompute);
      cy.off('layoutstop', recompute);
      cy.off('add remove', recompute);
    };
  }, [cy, badgesByNode, relatedShortcutByNode]);

  if (positioned.length === 0 && shortcuts.length === 0) return null;
  return (
    <svg
      aria-hidden="false"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {positioned.map((p) => (
        <g key={`${p.nodeId}::${p.kind}::${p.index}`} transform={`translate(${p.cx} ${p.cy})`}>
          <circle r={BADGE_RADIUS} fill={BADGE_FILL} stroke={BADGE_STROKE} strokeWidth={1} />
          <BadgeGlyph kind={p.kind} />
          {/* SVG <title> renders as a native tooltip on hover. */}
          <title>{p.tooltip}</title>
          {/* An invisible larger circle widens the hover hit-target so the
              tooltip is easier to discover without enabling pointer events
              on the rest of the canvas. */}
          <circle r={BADGE_RADIUS} fill="transparent" style={{ pointerEvents: 'all' }} />
        </g>
      ))}
      {shortcuts.map((s) => (
        <g
          key={`related::${s.nodeId}`}
          transform={`translate(${s.cx} ${s.cy})`}
          style={{ cursor: 'pointer', pointerEvents: 'all' }}
          onClick={() => {
            const handler = relatedShortcutByNode?.[s.nodeId];
            if (handler) handler.onClick();
          }}
        >
          <circle r={BADGE_RADIUS} fill={BADGE_FILL} stroke={BADGE_STROKE} strokeWidth={1} />
          <path
            d="M-2 -3 L2 0 L-2 3"
            stroke={BADGE_STROKE}
            strokeWidth={1.4}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <title>{`Show ${s.count} related artifact${s.count === 1 ? '' : 's'}`}</title>
        </g>
      ))}
    </svg>
  );
}

function BadgeGlyph({ kind }: { kind: NodeBadgeKind }) {
  switch (kind) {
    case 'writeback':
      // Cloud with up-arrow.
      return (
        <g stroke={BADGE_STROKE} strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M-5 1.5a3 3 0 0 1 1.2-5.4 4 4 0 0 1 7.6 0 3 3 0 0 1 1.2 5.4z" />
          <path d="M0 -2v4 M-1.6 -0.4L0 -2l1.6 1.6" />
        </g>
      );
    case 'backing':
      // Globe.
      return (
        <g stroke={BADGE_STROKE} strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle r={5} />
          <path d="M-5 0h10 M0 -5a8 8 0 0 1 2.5 5 8 8 0 0 1-2.5 5 8 8 0 0 1-2.5-5 8 8 0 0 1 2.5-5z" />
        </g>
      );
    case 'object-type':
      // Chain link.
      return (
        <g stroke={BADGE_STROKE} strokeWidth={1.3} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M-1.2 1.2a2.5 2.5 0 0 0 3.6 0l1.7-1.7a2.5 2.5 0 0 0-3.6-3.6l-0.6 0.6" />
          <path d="M1.2 -1.2a2.5 2.5 0 0 0-3.6 0l-1.7 1.7a2.5 2.5 0 0 0 3.6 3.6l0.6-0.6" />
        </g>
      );
  }
}

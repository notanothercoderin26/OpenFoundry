// Absolute-positioned overlay that paints notification-style badges
// on top of the Vertex canvas. The cytoscape instance owns the node
// coordinates; we listen for pan/zoom/layout events and re-derive the
// rendered (screen) positions for the nodes that have linked events.

import { useEffect, useState } from 'react';
import type { Core, NodeSingular } from 'cytoscape';

export interface NodeEventBadge {
  count: number;
  intent: string;
  tone: string;
  label?: string;
}

interface EventBadgeOverlayProps {
  cy: Core | null;
  badges: Record<string, NodeEventBadge>;
}

interface Positioned extends NodeEventBadge {
  id: string;
  x: number;
  y: number;
}

export function EventBadgeOverlay({ cy, badges }: EventBadgeOverlayProps) {
  const [positioned, setPositioned] = useState<Positioned[]>([]);

  useEffect(() => {
    if (!cy) {
      setPositioned([]);
      return;
    }
    const recompute = () => {
      const out: Positioned[] = [];
      for (const [id, badge] of Object.entries(badges)) {
        const element = cy.$id(id);
        if (element.length === 0 || !element.isNode()) continue;
        const node = element as NodeSingular;
        const pos = node.renderedPosition();
        out.push({ id, x: pos.x, y: pos.y, ...badge });
      }
      setPositioned(out);
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
  }, [cy, badges]);

  if (positioned.length === 0) return null;
  return (
    <div
      aria-hidden={false}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {positioned.map((p) => (
        <span
          key={p.id}
          role="img"
          aria-label={p.label ?? `${p.count} ${p.intent} event(s)`}
          title={p.label ?? `${p.count} ${p.intent} event(s)`}
          style={{
            position: 'absolute',
            // Sit at the upper-right shoulder of the node. The 12px
            // offsets are eyeballed against the default cytoscape
            // node radius — they are tweakable per-style later.
            top: p.y - 26,
            left: p.x + 10,
            minWidth: 18,
            height: 18,
            padding: '0 5px',
            borderRadius: 10,
            background: p.tone,
            color: '#0f172a',
            fontWeight: 700,
            fontSize: 10,
            lineHeight: '14px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #ffffff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
            // Slightly translucent when over-counted to avoid
            // dominating the canvas for nodes with many events.
            opacity: p.count >= 100 ? 0.92 : 1,
            transform: 'translate(-50%, 0)',
          }}
        >
          {p.count >= 100 ? '99+' : p.count}
        </span>
      ))}
    </div>
  );
}

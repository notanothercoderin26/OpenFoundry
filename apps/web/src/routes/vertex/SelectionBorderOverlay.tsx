// Coloured rings around nodes that belong to one or more visible
// saved selections. The rings are SVG circles anchored to each
// node's renderedPosition() — when a node belongs to multiple
// selections, the colours are stacked as concentric outer rings so
// every membership is visible at a glance (capped at 3 to keep the
// canvas readable for nodes with deep overlap).

import { useEffect, useState } from 'react';
import type { Core, NodeSingular } from 'cytoscape';

const RING_BASE_RADIUS = 22;
const RING_STEP = 6;
const RING_THICKNESS = 3;
const MAX_RINGS_PER_NODE = 3;

export interface SelectionRingSpec {
  // Map of nodeId → ordered list of colours (one ring per colour).
  byNode: Record<string, string[]>;
}

interface SelectionBorderOverlayProps {
  cy: Core | null;
  selectionRings: SelectionRingSpec;
}

interface PositionedRing {
  id: string;
  x: number;
  y: number;
  colours: string[];
}

export function SelectionBorderOverlay({ cy, selectionRings }: SelectionBorderOverlayProps) {
  const [positioned, setPositioned] = useState<PositionedRing[]>([]);

  useEffect(() => {
    if (!cy) {
      setPositioned([]);
      return;
    }
    const recompute = () => {
      const out: PositionedRing[] = [];
      for (const [id, rawColours] of Object.entries(selectionRings.byNode)) {
        if (!rawColours || rawColours.length === 0) continue;
        const element = cy.$id(id);
        if (element.length === 0 || !element.isNode()) continue;
        const node = element as NodeSingular;
        const pos = node.renderedPosition();
        out.push({
          id,
          x: pos.x,
          y: pos.y,
          colours: rawColours.slice(0, MAX_RINGS_PER_NODE),
        });
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
  }, [cy, selectionRings]);

  if (positioned.length === 0) return null;
  return (
    <svg
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {positioned.flatMap((p) =>
        p.colours.map((colour, idx) => (
          <circle
            key={`${p.id}::${idx}::${colour}`}
            cx={p.x}
            cy={p.y}
            r={RING_BASE_RADIUS + idx * RING_STEP}
            fill="none"
            stroke={colour}
            strokeWidth={RING_THICKNESS}
            strokeOpacity={0.85}
          />
        )),
      )}
    </svg>
  );
}

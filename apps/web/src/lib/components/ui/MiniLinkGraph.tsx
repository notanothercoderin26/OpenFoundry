import { Fragment, useMemo } from 'react';

import { Glyph, type GlyphName } from './Glyph';
import { groupColor, type GroupColor } from './groupColors';

export interface MiniLinkGraphNode {
  id: string;
  label: string;
  glyph?: GlyphName;
  /** Stable colour key. Defaults to `label`. */
  colorKey?: string;
  color?: GroupColor;
  /** Optional explicit position in the [0,1]×[0,1] space. */
  x?: number;
  y?: number;
}

export interface MiniLinkGraphEdge {
  from: string;
  to: string;
  /** Cardinality label, typically "1" or "*". */
  label?: string;
}

interface MiniLinkGraphProps {
  nodes: ReadonlyArray<MiniLinkGraphNode>;
  edges: ReadonlyArray<MiniLinkGraphEdge>;
  width?: number;
  height?: number;
  className?: string;
}

interface LaidOutNode extends MiniLinkGraphNode {
  cx: number;
  cy: number;
}

const NODE_W = 130;
const NODE_H = 32;
const PAD = 18;

/**
 * Distribute nodes that don't carry explicit positions across a simple
 * grid that fits inside the [0,1] × [0,1] coordinate space.
 */
function autoLayout(nodes: ReadonlyArray<MiniLinkGraphNode>): LaidOutNode[] {
  const N = nodes.length;
  if (N === 0) return [];
  const cols = Math.min(N, Math.max(1, Math.ceil(Math.sqrt(N))));
  const rows = Math.ceil(N / cols);
  return nodes.map((n, i) => {
    if (n.x != null && n.y != null) {
      return { ...n, cx: n.x, cy: n.y };
    }
    const r = Math.floor(i / cols);
    const c = i % cols;
    const cx = cols === 1 ? 0.5 : c / (cols - 1);
    const cy = rows === 1 ? 0.5 : r / (rows - 1);
    return { ...n, cx, cy };
  });
}

/**
 * Foundry-style mini link-type preview. Not interactive — meant for cards.
 * Renders rectangular node tiles connected by straight edges with optional
 * cardinality labels (`1` / `*`).
 */
export function MiniLinkGraph({
  nodes,
  edges,
  width = 320,
  height = 140,
  className,
}: MiniLinkGraphProps) {
  const laidOut = useMemo(() => autoLayout(nodes), [nodes]);
  const innerW = width - PAD * 2 - NODE_W;
  const innerH = height - PAD * 2 - NODE_H;

  const positioned = laidOut.map((n) => ({
    ...n,
    px: PAD + n.cx * Math.max(innerW, 0),
    py: PAD + n.cy * Math.max(innerH, 0),
  }));

  const byId = new Map(positioned.map((n) => [n.id, n] as const));

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={`Link graph with ${nodes.length} nodes and ${edges.length} edges`}
    >
      {edges.map((edge, i) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;
        const x1 = from.px + NODE_W / 2;
        const y1 = from.py + NODE_H / 2;
        const x2 = to.px + NODE_W / 2;
        const y2 = to.py + NODE_H / 2;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        return (
          <Fragment key={`e-${i}`}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#cdd2d8"
              strokeWidth={1}
            />
            {edge.label ? (
              <g transform={`translate(${mx} ${my})`}>
                <rect
                  x={-10}
                  y={-9}
                  width={20}
                  height={18}
                  rx={9}
                  fill="#ffffff"
                  stroke="#e5e8eb"
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="#5f6b7c"
                >
                  {edge.label}
                </text>
              </g>
            ) : null}
          </Fragment>
        );
      })}

      {positioned.map((n) => {
        const palette = n.color ?? groupColor(n.colorKey ?? n.label);
        return (
          <g key={n.id} transform={`translate(${n.px} ${n.py})`}>
            <rect
              x={0}
              y={0}
              width={NODE_W}
              height={NODE_H}
              rx={4}
              fill="#ffffff"
              stroke="#e5e8eb"
            />
            <g transform="translate(8 8)">
              <rect width={16} height={16} rx={3} fill={palette.soft} />
              <g transform="translate(2 2)" color={palette.base}>
                <Glyph name={n.glyph ?? 'cube'} size={12} tone={palette.base} />
              </g>
            </g>
            <text
              x={32}
              y={NODE_H / 2}
              dominantBaseline="middle"
              fontSize={12}
              fontWeight={500}
              fill="#1c2127"
            >
              {n.label.length > 14 ? `${n.label.slice(0, 13)}…` : n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

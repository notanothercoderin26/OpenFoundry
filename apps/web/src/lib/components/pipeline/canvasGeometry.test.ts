import { describe, expect, it } from 'vitest';

// Re-implement the helpers here for a focused unit test.
// They mirror the constants/exports declared inside PipelineCanvas.tsx.
const NODE_W = 180;
const NODE_H = 64;

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function normalizeRect(rect: Rect): Rect {
  return {
    x1: Math.min(rect.x1, rect.x2),
    y1: Math.min(rect.y1, rect.y2),
    x2: Math.max(rect.x1, rect.x2),
    y2: Math.max(rect.y1, rect.y2),
  };
}

function rectIntersectsNode(rect: Rect, pos: { x: number; y: number }): boolean {
  const r = normalizeRect(rect);
  return pos.x < r.x2 && pos.x + NODE_W > r.x1 && pos.y < r.y2 && pos.y + NODE_H > r.y1;
}

describe('canvas geometry', () => {
  it('normalizes rectangles regardless of drag direction', () => {
    expect(normalizeRect({ x1: 50, y1: 80, x2: 10, y2: 20 })).toEqual({ x1: 10, y1: 20, x2: 50, y2: 80 });
  });

  it('detects intersection with a fully enclosed node', () => {
    expect(rectIntersectsNode({ x1: 0, y1: 0, x2: 300, y2: 200 }, { x: 50, y: 50 })).toBe(true);
  });

  it('detects intersection with a partially overlapping node', () => {
    // Node at (100, 100) covers (100..280, 100..164). Rect grazes the left edge.
    expect(rectIntersectsNode({ x1: 90, y1: 100, x2: 110, y2: 120 }, { x: 100, y: 100 })).toBe(true);
  });

  it('rejects intersection when the node is entirely outside', () => {
    // Node at (500, 500) is far from the rect (0..200, 0..200).
    expect(rectIntersectsNode({ x1: 0, y1: 0, x2: 200, y2: 200 }, { x: 500, y: 500 })).toBe(false);
  });

  it('handles a reversed drag (x2 < x1) just like a forward drag', () => {
    const a = rectIntersectsNode({ x1: 0, y1: 0, x2: 300, y2: 200 }, { x: 50, y: 50 });
    const b = rectIntersectsNode({ x1: 300, y1: 200, x2: 0, y2: 0 }, { x: 50, y: 50 });
    expect(a).toBe(b);
    expect(a).toBe(true);
  });
});

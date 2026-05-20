import { describe, expect, it } from 'vitest';
import type { Core } from 'cytoscape';

import { cytoscapeToSvg } from './exportSvg';

interface FakeNode {
  id: string;
  data: Record<string, unknown>;
  bb: { x1: number; y1: number; x2: number; y2: number };
}

interface FakeEdge {
  source: string;
  target: string;
}

// Hand-rolled Cytoscape stub so the test can run without a DOM. We
// only need the surface area cytoscapeToSvg actually touches.
function fakeCore(nodes: FakeNode[], edges: FakeEdge[]): Core {
  const wrap = (collection: FakeNode[] | FakeEdge[]) => {
    return {
      length: collection.length,
      forEach: (fn: (entry: unknown) => void) => {
        for (const entry of collection) fn(wrapEntry(entry));
      },
    };
  };
  const wrapEntry = (entry: FakeNode | FakeEdge) => {
    if ('bb' in entry) {
      return {
        id: () => entry.id,
        data: (key: string) => entry.data[key],
        boundingBox: () => entry.bb,
      };
    }
    return {
      source: () => ({ id: () => entry.source }),
      target: () => ({ id: () => entry.target }),
    };
  };
  return {
    nodes: () => wrap(nodes),
    edges: () => wrap(edges),
  } as unknown as Core;
}

describe('cytoscapeToSvg', () => {
  it('produces a valid xml declaration + svg root element', () => {
    const cy = fakeCore(
      [
        {
          id: 'a',
          data: { displayLabel: 'a', color: '#aabbcc', borderColor: '#000' },
          bb: { x1: 0, y1: 0, x2: 80, y2: 26 },
        },
      ],
      [],
    );
    const out = cytoscapeToSvg(cy);
    expect(out.startsWith('<?xml')).toBe(true);
    expect(out).toContain('<svg ');
    expect(out).toContain('</svg>');
    expect(out).toContain('viewBox="');
  });

  it('emits one <rect> per visible node and one <line> per edge', () => {
    const cy = fakeCore(
      [
        { id: 'a', data: { displayLabel: 'a', color: '#fff' }, bb: { x1: 0, y1: 0, x2: 40, y2: 20 } },
        { id: 'b', data: { displayLabel: 'b', color: '#fff' }, bb: { x1: 100, y1: 0, x2: 140, y2: 20 } },
      ],
      [{ source: 'a', target: 'b' }],
    );
    const out = cytoscapeToSvg(cy);
    expect((out.match(/<rect /g) ?? []).length).toBe(2);
    expect((out.match(/<line /g) ?? []).length).toBe(1);
    expect(out).toContain('marker-end="url(#of-arrow)"');
  });

  it('escapes XML special characters in labels', () => {
    const cy = fakeCore(
      [
        {
          id: 'a',
          data: { displayLabel: '<weird> "label"', color: '#fff' },
          bb: { x1: 0, y1: 0, x2: 40, y2: 20 },
        },
      ],
      [],
    );
    const out = cytoscapeToSvg(cy);
    expect(out).toContain('&lt;weird&gt; &quot;label&quot;');
    expect(out).not.toContain('<weird>');
  });

  it('falls back to a minimal svg when there are no visible nodes', () => {
    const cy = fakeCore([], []);
    const out = cytoscapeToSvg(cy);
    expect(out).toContain('width="0"');
    expect(out).toContain('<svg ');
  });
});

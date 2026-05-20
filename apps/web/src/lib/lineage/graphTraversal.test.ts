import { describe, expect, it } from 'vitest';

import type { LineageEdge, LineageGraph, LineageNode } from '@/lib/api/pipelines';

import {
  ancestorsOf,
  commonAncestors,
  commonDescendants,
  descendantsOf,
  expandFromSeeds,
  inBetweenNodes,
} from './graphTraversal';

function node(id: string): LineageNode {
  return { id, kind: 'dataset', label: id, marking: 'public', metadata: {} };
}

function edge(source: string, target: string): LineageEdge {
  return {
    id: `${source}->${target}`,
    source,
    source_kind: 'dataset',
    target,
    target_kind: 'dataset',
    relation_kind: 'derives_from',
    pipeline_id: null,
    workflow_id: null,
    node_id: null,
    step_id: null,
    effective_marking: 'public',
    metadata: {},
  };
}

// a → b → c → d
//      ↘ e ↗
//      f → c
const diamond: LineageGraph = {
  nodes: ['a', 'b', 'c', 'd', 'e', 'f'].map(node),
  edges: [edge('a', 'b'), edge('b', 'c'), edge('c', 'd'), edge('b', 'e'), edge('e', 'c'), edge('f', 'c')],
};

describe('graphTraversal', () => {
  it('walks all ancestors and descendants by default', () => {
    expect([...ancestorsOf('d', diamond)].sort()).toEqual(['a', 'b', 'c', 'e', 'f']);
    expect([...descendantsOf('a', diamond)].sort()).toEqual(['b', 'c', 'd', 'e']);
  });

  it('limits depth when maxDepth is given', () => {
    expect([...ancestorsOf('d', diamond, 1)]).toEqual(['c']);
    expect([...ancestorsOf('d', diamond, 2)].sort()).toEqual(['b', 'c', 'e', 'f']);
    expect([...descendantsOf('a', diamond, 1)]).toEqual(['b']);
  });

  it('finds in-between nodes between two seeds and excludes the seeds', () => {
    const result = inBetweenNodes(['a', 'd'], diamond);
    expect([...result].sort()).toEqual(['b', 'c', 'e']);
  });

  it('returns an empty set when fewer than 2 seeds are given', () => {
    expect(inBetweenNodes([], diamond).size).toBe(0);
    expect(inBetweenNodes(['a'], diamond).size).toBe(0);
    expect(commonAncestors(['a'], diamond).size).toBe(0);
    expect(commonDescendants(['a'], diamond).size).toBe(0);
  });

  it('finds common ancestors of multiple seeds', () => {
    expect([...commonAncestors(['c', 'd'], diamond)].sort()).toEqual(['a', 'b', 'e', 'f']);
    expect([...commonAncestors(['d', 'e'], diamond)].sort()).toEqual(['a', 'b']);
    expect([...commonAncestors(['a', 'd'], diamond)]).toEqual([]);
  });

  it('finds common descendants of multiple seeds', () => {
    expect([...commonDescendants(['a', 'f'], diamond)].sort()).toEqual(['c', 'd']);
    expect([...commonDescendants(['e', 'f'], diamond)].sort()).toEqual(['c', 'd']);
  });

  it('expands by parent and child depth from seeds', () => {
    expect([...expandFromSeeds(['c'], diamond, 1, 1)].sort()).toEqual(['b', 'd', 'e', 'f']);
    expect([...expandFromSeeds(['c'], diamond, 2, 0)].sort()).toEqual(['a', 'b', 'e', 'f']);
  });

  it('returns an empty set when both depths are zero', () => {
    expect(expandFromSeeds(['a'], diamond, 0, 0).size).toBe(0);
  });

  it('survives cycles without infinite loops or echoing the seed', () => {
    const cyclic: LineageGraph = {
      nodes: ['x', 'y', 'z'].map(node),
      edges: [edge('x', 'y'), edge('y', 'z'), edge('z', 'x')],
    };
    expect([...descendantsOf('x', cyclic)].sort()).toEqual(['y', 'z']);
    expect([...ancestorsOf('x', cyclic)].sort()).toEqual(['y', 'z']);
  });
});

import type { LineageEdge, LineageGraph } from '@/lib/api/pipelines';

interface Adjacency {
  parents: Map<string, string[]>;
  children: Map<string, string[]>;
}

function buildAdjacency(edges: LineageEdge[]): Adjacency {
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const edge of edges) {
    if (!children.has(edge.source)) children.set(edge.source, []);
    children.get(edge.source)!.push(edge.target);
    if (!parents.has(edge.target)) parents.set(edge.target, []);
    parents.get(edge.target)!.push(edge.source);
  }
  return { parents, children };
}

function walk(
  starts: Iterable<string>,
  next: Map<string, string[]>,
  maxDepth = Infinity,
): Set<string> {
  const visited = new Set<string>();
  let frontier: string[] = [];
  for (const id of starts) frontier.push(id);
  let depth = 0;
  while (frontier.length > 0 && depth < maxDepth) {
    const nextFrontier: string[] = [];
    for (const id of frontier) {
      for (const neighbor of next.get(id) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        nextFrontier.push(neighbor);
      }
    }
    frontier = nextFrontier;
    depth += 1;
  }
  return visited;
}

export function ancestorsOf(nodeId: string, graph: LineageGraph, maxDepth = Infinity): Set<string> {
  const result = walk([nodeId], buildAdjacency(graph.edges).parents, maxDepth);
  result.delete(nodeId);
  return result;
}

export function descendantsOf(nodeId: string, graph: LineageGraph, maxDepth = Infinity): Set<string> {
  const result = walk([nodeId], buildAdjacency(graph.edges).children, maxDepth);
  result.delete(nodeId);
  return result;
}

/**
 * Nodes that lie on a directed path between any pair of the given seeds.
 * Foundry's "Add in-between": for every pair (a, b) we collect
 * descendants(a) ∩ ancestors(b) in both directions. Endpoints excluded.
 */
export function inBetweenNodes(seedIds: string[], graph: LineageGraph): Set<string> {
  if (seedIds.length < 2) return new Set();
  const { parents, children } = buildAdjacency(graph.edges);
  const seedSet = new Set(seedIds);
  const result = new Set<string>();

  const descendantsCache = new Map<string, Set<string>>();
  const ancestorsCache = new Map<string, Set<string>>();
  const desc = (id: string): Set<string> => {
    let cached = descendantsCache.get(id);
    if (!cached) {
      cached = walk([id], children);
      descendantsCache.set(id, cached);
    }
    return cached;
  };
  const anc = (id: string): Set<string> => {
    let cached = ancestorsCache.get(id);
    if (!cached) {
      cached = walk([id], parents);
      ancestorsCache.set(id, cached);
    }
    return cached;
  };

  for (let i = 0; i < seedIds.length; i++) {
    const dI = desc(seedIds[i]);
    for (let j = 0; j < seedIds.length; j++) {
      if (i === j) continue;
      const aJ = anc(seedIds[j]);
      for (const id of dI) {
        if (aJ.has(id) && !seedSet.has(id)) result.add(id);
      }
    }
  }
  return result;
}

/**
 * Common ancestors: nodes that are ancestors of every seed. Seeds excluded.
 */
export function commonAncestors(seedIds: string[], graph: LineageGraph): Set<string> {
  if (seedIds.length < 2) return new Set();
  const { parents } = buildAdjacency(graph.edges);
  const seedSet = new Set(seedIds);
  let acc: Set<string> | null = null;
  for (const id of seedIds) {
    const anc = walk([id], parents);
    if (acc === null) {
      acc = new Set<string>(anc);
    } else {
      const next = new Set<string>();
      for (const candidate of acc) if (anc.has(candidate)) next.add(candidate);
      acc = next;
    }
    if (acc.size === 0) break;
  }
  if (!acc) return new Set();
  for (const id of seedSet) acc.delete(id);
  return acc;
}

/**
 * Common descendants: nodes that are descendants of every seed. Seeds excluded.
 */
export function commonDescendants(seedIds: string[], graph: LineageGraph): Set<string> {
  if (seedIds.length < 2) return new Set();
  const { children } = buildAdjacency(graph.edges);
  const seedSet = new Set(seedIds);
  let acc: Set<string> | null = null;
  for (const id of seedIds) {
    const desc = walk([id], children);
    if (acc === null) {
      acc = new Set<string>(desc);
    } else {
      const next = new Set<string>();
      for (const candidate of acc) if (desc.has(candidate)) next.add(candidate);
      acc = next;
    }
    if (acc.size === 0) break;
  }
  if (!acc) return new Set();
  for (const id of seedSet) acc.delete(id);
  return acc;
}

/**
 * Foundry's main "Add N nodes" Expand action: walk up `parentLevels` hops and
 * down `childLevels` hops from each seed. Seeds excluded from the result.
 */
export function expandFromSeeds(
  seedIds: string[],
  graph: LineageGraph,
  parentLevels: number,
  childLevels: number,
): Set<string> {
  if (seedIds.length === 0) return new Set();
  const { parents, children } = buildAdjacency(graph.edges);
  const seedSet = new Set(seedIds);
  const result = new Set<string>();
  if (parentLevels > 0) {
    for (const id of walk(seedIds, parents, parentLevels)) {
      if (!seedSet.has(id)) result.add(id);
    }
  }
  if (childLevels > 0) {
    for (const id of walk(seedIds, children, childLevels)) {
      if (!seedSet.has(id)) result.add(id);
    }
  }
  return result;
}

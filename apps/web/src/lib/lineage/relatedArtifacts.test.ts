import { describe, expect, it } from 'vitest';

import type { LineageEdge, LineageGraph, LineageNode } from '@/lib/api/pipelines';

import {
  collectRelatedArtifacts,
  distinctRelatedKinds,
  sortRelatedArtifacts,
} from './relatedArtifacts';

function node(id: string, kind: string, metadata: Record<string, unknown> = {}, label = id): LineageNode {
  return { id, kind, label, marking: 'public', metadata };
}

function edge(source: string, target: string, source_kind = 'dataset', target_kind = 'application'): LineageEdge {
  return {
    id: `${source}->${target}`,
    source,
    source_kind,
    target,
    target_kind,
    relation_kind: 'consumed_by',
    pipeline_id: null,
    workflow_id: null,
    node_id: null,
    step_id: null,
    effective_marking: 'public',
    metadata: {},
  };
}

const graph: LineageGraph = {
  nodes: [
    node('d1', 'dataset'),
    node('d2', 'dataset'),
    node('app1', 'application', {
      path: '/projects/aviation/dashboard',
      created_at: '2026-03-21T07:15:00Z',
      last_modified_at: '2026-04-11T06:39:00Z',
    }),
    node('app2', 'application', { path: '/projects/aviation/airline_report', created_at: '2024-10-12T15:08:00Z', last_modified_at: '2024-10-25T21:17:00Z' }),
    node('ot1', 'object_type', { path: '/ontology/aviation/Flight' }),
    node('trash1', 'application', { is_trashed: true, path: '/projects/old' }),
    node('auto1', 'application', { autosaved: true, path: '/scratch/auto' }),
    node('upstream_app', 'application', { path: '/upstream' }),
    node('pipeline1', 'pipeline'), // core kind, excluded
  ],
  edges: [
    edge('d1', 'app1'),
    edge('d2', 'app2'),
    edge('d1', 'app2'), // d1 also feeds app2 — should only appear once
    edge('d1', 'ot1', 'dataset', 'object_type'),
    edge('d1', 'trash1'),
    edge('d1', 'auto1'),
    edge('upstream_app', 'd1', 'application', 'dataset'), // upstream artifact
    edge('d1', 'pipeline1', 'dataset', 'pipeline'),       // core kind, excluded
  ],
};

describe('collectRelatedArtifacts', () => {
  it('returns direct neighbors of selected nodes excluding core lineage kinds', () => {
    const items = collectRelatedArtifacts({
      nodes: graph.nodes,
      edges: graph.edges,
      selectedNodeIds: ['d1'],
    });
    const ids = items.map((i) => i.id).sort();
    // Excludes core kinds (pipeline1), excludes auto/trash by default.
    // d1→app1, d1→app2 (also touched by d2), d1→ot1, upstream_app→d1.
    expect(ids).toEqual(['app1', 'app2', 'ot1', 'upstream_app']);
  });

  it('classifies neighbors as upstream vs downstream relative to the selection', () => {
    const items = collectRelatedArtifacts({
      nodes: graph.nodes,
      edges: graph.edges,
      selectedNodeIds: ['d1'],
    });
    const direction = (id: string) => items.find((i) => i.id === id)?.direction;
    expect(direction('app1')).toBe('downstream');
    expect(direction('upstream_app')).toBe('upstream');
  });

  it('honors includeAutosaved and includeTrash toggles', () => {
    const items = collectRelatedArtifacts({
      nodes: graph.nodes,
      edges: graph.edges,
      selectedNodeIds: ['d1'],
      includeAutosaved: true,
      includeTrash: true,
    });
    const ids = items.map((i) => i.id).sort();
    expect(ids).toContain('auto1');
    expect(ids).toContain('trash1');
  });

  it('honors the allowedKinds filter', () => {
    const items = collectRelatedArtifacts({
      nodes: graph.nodes,
      edges: graph.edges,
      selectedNodeIds: ['d1'],
      allowedKinds: new Set(['object_type']),
    });
    const ids = items.map((i) => i.id);
    expect(ids).toEqual(['ot1']);
  });

  it('de-dupes when a neighbor is connected to multiple selected nodes', () => {
    const items = collectRelatedArtifacts({
      nodes: graph.nodes,
      edges: graph.edges,
      selectedNodeIds: ['d1', 'd2'],
    });
    const app2Count = items.filter((i) => i.id === 'app2').length;
    expect(app2Count).toBe(1);
  });

  it('excludes neighbors that are themselves part of the selection', () => {
    const items = collectRelatedArtifacts({
      nodes: graph.nodes,
      edges: graph.edges,
      selectedNodeIds: ['d1', 'app1'],
    });
    expect(items.find((i) => i.id === 'app1')).toBeUndefined();
  });

  it('returns nothing when no nodes are selected', () => {
    const items = collectRelatedArtifacts({
      nodes: graph.nodes,
      edges: graph.edges,
      selectedNodeIds: [],
    });
    expect(items).toEqual([]);
  });
});

describe('sortRelatedArtifacts', () => {
  const items = collectRelatedArtifacts({
    nodes: graph.nodes,
    edges: graph.edges,
    selectedNodeIds: ['d1', 'd2'],
  });

  it('sorts newest first by createdAt', () => {
    const sorted = sortRelatedArtifacts(items, 'newest');
    expect(sorted[0].id).toBe('app1'); // 2026 > 2024
  });

  it('sorts oldest first by createdAt', () => {
    const sorted = sortRelatedArtifacts(items, 'oldest');
    // app2 has 2024 timestamp so it's oldest
    expect(sorted[0].id).toBe('app2');
  });

  it('sorts by name (label)', () => {
    const sorted = sortRelatedArtifacts(items, 'name');
    const labels = sorted.map((i) => i.label);
    expect(labels).toEqual([...labels].sort());
  });
});

describe('distinctRelatedKinds', () => {
  it('returns sorted distinct kinds', () => {
    const items = collectRelatedArtifacts({
      nodes: graph.nodes,
      edges: graph.edges,
      selectedNodeIds: ['d1'],
    });
    expect(distinctRelatedKinds(items)).toEqual(['application', 'object_type']);
  });
});

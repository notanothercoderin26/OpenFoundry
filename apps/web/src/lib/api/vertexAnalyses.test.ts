import { beforeEach, describe, expect, it } from 'vitest';

import {
  autosaveVertexLayoutDraft,
  compassVertexAnalysisPath,
  createVertexAnalysis,
  forkVertexAnalysis,
  getVertexLayoutDraft,
  listVertexAnalysisVersions,
  saveVertexAnalysisVersion,
} from './vertexAnalyses';

describe('vertex analyses api', () => {
  beforeEach(() => {
    const backing = new Map<string, string>();
    (globalThis as { localStorage?: Storage }).localStorage = {
      clear: () => backing.clear(),
      getItem: (key: string) => backing.get(key) ?? null,
      key: (index: number) => [...backing.keys()][index] ?? null,
      removeItem: (key: string) => {
        backing.delete(key);
      },
      setItem: (key: string, value: string) => {
        backing.set(key, value);
      },
      get length() {
        return backing.size;
      },
    } as Storage;
  });

  it('creates version and fork without private user layout', () => {
    const analysis = createVertexAnalysis({
      title: 'Fraud ring',
      description: 'Primary exploration',
      seedObjectSetRid: 'ri.foundry.main.object-set.seed-1',
      layoutState: { mode: 'cose' },
      layerConfiguration: { layers: ['base'] },
      scenarioSet: ['default'],
      branchContext: { branchRid: null, branchName: null },
      owningProjectRid: 'ri.compass.main.project.p1',
      organizations: ['org-a'],
      markings: ['restricted'],
      ownerUserId: 'alice',
    });

    autosaveVertexLayoutDraft(analysis.rid, 'alice', { x: 10, y: 20 });
    const version = saveVertexAnalysisVersion(analysis.rid, 'alice', 'Pinned key entities');
    const fork = forkVertexAnalysis(analysis.rid, 'bob');

    expect(version?.analysisRid).toBe(analysis.rid);
    expect(listVertexAnalysisVersions(analysis.rid)).toHaveLength(1);
    expect(fork?.ownerUserId).toBe('bob');
    expect(getVertexLayoutDraft(fork!.rid, 'bob')).toBeNull();
  });

  it('produces stable path for Compass discovery', () => {
    const path = compassVertexAnalysisPath('ri.foundry.main.vertex-analysis.a1', 'Risk Lens');
    expect(path).toContain('/vertex/analyses/');
    expect(path).toContain('ri.foundry.main.vertex-analysis.a1--risk-lens');
  });
});

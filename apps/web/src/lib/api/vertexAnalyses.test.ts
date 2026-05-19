import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  autosaveVertexLayoutDraft,
  compassVertexAnalysisPath,
  createVertexAnalysis,
  forkVertexAnalysis,
  getVertexLayoutDraft,
  listVertexAnalysisVersions,
  saveVertexAnalysisVersion,
  type VertexAnalysis,
} from './vertexAnalyses';

// ── Test scaffolding ──────────────────────────────────────────────
// vertexAnalyses now hits the real vertex-service HTTP API; tests
// mock fetch by routing each request to a small in-memory map of
// fixture responses keyed by `${method} ${pathSuffix}`.

interface Handler {
  status?: number;
  body: unknown;
}

let handlers: Map<string, Handler[]>;

function setHandler(method: string, pathSuffix: string, handler: Handler | Handler[]) {
  const key = `${method} ${pathSuffix}`;
  handlers.set(key, Array.isArray(handler) ? handler : [handler]);
}

function mockFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = url.replace(/^.*\/api\/v1/, '');

      for (const [key, queue] of handlers.entries()) {
        const [hMethod, hPath] = key.split(' ');
        if (hMethod !== method) continue;
        if (hPath === path || hPath === path.split('?')[0]) {
          const next = queue.shift() ?? { body: null };
          return new Response(JSON.stringify(next.body), {
            status: next.status ?? 200,
            headers: { 'content-type': 'application/json' },
          });
        }
      }
      return new Response(JSON.stringify({ error: 'not stubbed: ' + method + ' ' + path }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}

function wireGraph(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    rid: 'ri.vertex.main.graph.aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    title: 'Fraud ring',
    description: 'Primary exploration',
    seed_object_refs: ['ri.foundry.main.object-set.seed-1'],
    branch_context: JSON.stringify({ branchRid: null, branchName: null }),
    model_rid: '',
    layout_state_json: { mode: 'cose' },
    layer_configuration_json: { layers: ['base'] },
    timeline_state_json: null,
    project_id: 'p1',
    organizations: ['org-a'],
    markings: ['restricted'],
    owner_id: 'alice',
    created_at: '2026-05-19T00:00:00Z',
    updated_at: '2026-05-19T00:00:00Z',
    ...overrides,
  };
}

describe('vertex analyses api', () => {
  beforeEach(() => {
    handlers = new Map();
    mockFetch();
    // Layout drafts still use localStorage (per-user, session local).
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates version and fork without private user layout', async () => {
    // POST /vertex/graphs → create
    setHandler('POST', '/vertex/graphs', { body: wireGraph() });
    // PATCH /vertex/graphs/{id} → layout immediate patch
    setHandler('PATCH', '/vertex/graphs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', { body: wireGraph() });
    // POST /vertex/graphs/{id}/versions → version create
    setHandler('POST', '/vertex/graphs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/versions', {
      body: {
        id: 'vvvvvvvv-vvvv-vvvv-vvvv-vvvvvvvvvvvv',
        graph_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        version: 1,
        changelog: 'Pinned key entities',
        snapshot_json: wireGraph(),
        author_id: 'alice',
        created_at: '2026-05-19T00:01:00Z',
      },
    });
    // GET versions list
    setHandler('GET', '/vertex/graphs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/versions', {
      body: {
        data: [
          {
            id: 'vvvvvvvv-vvvv-vvvv-vvvv-vvvvvvvvvvvv',
            graph_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            version: 1,
            changelog: 'Pinned key entities',
            snapshot_json: wireGraph(),
            author_id: 'alice',
            created_at: '2026-05-19T00:01:00Z',
          },
        ],
        total: 1,
        page: 1,
        per_page: 50,
      },
    });
    // Fork sequence: GET source, then POST fork
    setHandler('GET', '/vertex/graphs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', { body: wireGraph() });
    setHandler('POST', '/vertex/graphs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/fork', {
      body: wireGraph({
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        rid: 'ri.vertex.main.graph.bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        owner_id: 'bob',
        title: 'Fraud ring (fork)',
      }),
    });

    const input: Omit<VertexAnalysis, 'rid' | 'createdAt' | 'updatedAt'> = {
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
    };
    const analysis = await createVertexAnalysis(input);

    autosaveVertexLayoutDraft(analysis.rid, 'alice', { x: 10, y: 20 });
    const version = await saveVertexAnalysisVersion(analysis.rid, 'alice', 'Pinned key entities');
    const fork = await forkVertexAnalysis(analysis.rid, 'bob');

    expect(version?.analysisRid).toBe(analysis.rid);
    const versions = await listVertexAnalysisVersions(analysis.rid);
    expect(versions).toHaveLength(1);
    expect(fork?.ownerUserId).toBe('bob');
    expect(getVertexLayoutDraft(fork!.rid, 'bob')).toBeNull();
  });

  it('produces stable path for Compass discovery', () => {
    const path = compassVertexAnalysisPath('ri.foundry.main.vertex-analysis.a1', 'Risk Lens');
    expect(path).toContain('/vertex/analyses/');
    expect(path).toContain('ri.foundry.main.vertex-analysis.a1--risk-lens');
  });
});

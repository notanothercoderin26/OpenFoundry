import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetForTests,
  acknowledgeWarning,
  diffStagedEdit,
  discard,
  discardAll,
  findEdit,
  findEditForResource,
  getConflictCount,
  getEditCount,
  newClientId,
  resolveConflict,
  save,
  stage,
  updateDraft,
  type StagedEdit,
} from './ontologyWorkingState';

beforeEach(() => {
  mockSessionStorage();
  _resetForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stage()', () => {
  it('creates a new edit and assigns a client id', () => {
    const id = stage({
      op: 'create',
      resource: 'object_type',
      label: 'Aircraft',
      draft: { name: 'Aircraft' },
    });
    expect(id).toMatch(/.+/);
    const edit = findEdit(id);
    expect(edit?.op).toBe('create');
    expect(edit?.status).toBe('pending');
    expect(getEditCount()).toBe(1);
  });

  it('folds an update into an existing edit for the same resource', () => {
    const first = stage({
      op: 'update',
      resource: 'object_type',
      resourceId: 'ot-1',
      expectedVersion: 3,
      originalSnapshot: { display_name: 'Aircraft', description: '' },
      label: 'Aircraft',
      draft: { display_name: 'Aircraft 2', description: '' },
    });
    const second = stage({
      op: 'update',
      resource: 'object_type',
      resourceId: 'ot-1',
      expectedVersion: 3,
      originalSnapshot: { display_name: 'Aircraft', description: '' },
      label: 'Aircraft',
      draft: { display_name: 'Aircraft 2', description: 'updated' },
    });
    expect(second).toBe(first);
    expect(getEditCount()).toBe(1);
    const edit = findEdit(first);
    expect((edit?.draft as Record<string, unknown>).description).toBe('updated');
    // The original snapshot must be preserved across folds so the
    // audit log shows the true "before" once the edit saves.
    expect(edit?.originalSnapshot).toEqual({ display_name: 'Aircraft', description: '' });
  });

  it('replaces a pending update with a delete when the user deletes the same resource', () => {
    stage({
      op: 'update',
      resource: 'link_type',
      resourceId: 'lt-1',
      expectedVersion: 1,
      originalSnapshot: { display_name: 'Flies' },
      label: 'Flies',
      draft: { display_name: 'Aviates' },
    });
    expect(getEditCount()).toBe(1);
    stage({
      op: 'delete',
      resource: 'link_type',
      resourceId: 'lt-1',
      expectedVersion: 1,
      originalSnapshot: { display_name: 'Flies' },
      label: 'Flies',
    });
    expect(getEditCount()).toBe(1);
    const edit = findEditForResource('link_type', 'lt-1');
    expect(edit?.op).toBe('delete');
    expect(edit?.draft).toBeNull();
  });
});

describe('updateDraft()', () => {
  it('patches the draft without re-folding', () => {
    const id = stage({
      op: 'update',
      resource: 'object_type',
      resourceId: 'ot-1',
      expectedVersion: 2,
      originalSnapshot: { display_name: 'Aircraft' },
      label: 'Aircraft',
      draft: { display_name: 'Aircraft v1' },
    });
    updateDraft(id, { display_name: 'Aircraft v2' });
    const edit = findEdit(id);
    expect((edit?.draft as Record<string, unknown>).display_name).toBe('Aircraft v2');
  });
});

describe('discard()', () => {
  it('removes an edit by client id', () => {
    const id = stage({
      op: 'create',
      resource: 'object_type',
      label: 'Aircraft',
      draft: {},
    });
    discard(id);
    expect(getEditCount()).toBe(0);
    expect(findEdit(id)).toBeUndefined();
  });

  it('discardAll() clears the store', () => {
    stage({ op: 'create', resource: 'object_type', label: 'a', draft: {} });
    stage({ op: 'create', resource: 'link_type', label: 'b', draft: {} });
    discardAll();
    expect(getEditCount()).toBe(0);
  });
});

describe('acknowledgeWarning()', () => {
  it('records the confirmed warning code', () => {
    const id = stage({
      op: 'update',
      resource: 'object_type',
      resourceId: 'ot-1',
      expectedVersion: 1,
      originalSnapshot: {},
      label: 'Aircraft',
      draft: {},
    });
    acknowledgeWarning(id, 'discouraged_primary_key_type');
    const edit = findEdit(id);
    expect(edit?.confirmedWarnings).toContain('discouraged_primary_key_type');
  });

  it('does not double-record the same warning', () => {
    const id = stage({
      op: 'update',
      resource: 'object_type',
      resourceId: 'ot-1',
      expectedVersion: 1,
      originalSnapshot: {},
      label: 'Aircraft',
      draft: {},
    });
    acknowledgeWarning(id, 'x');
    acknowledgeWarning(id, 'x');
    expect(findEdit(id)?.confirmedWarnings).toEqual(['x']);
  });
});

describe('resolveConflict()', () => {
  it('use_latest discards the edit', () => {
    const id = stage({
      op: 'update',
      resource: 'object_type',
      resourceId: 'ot-1',
      expectedVersion: 1,
      originalSnapshot: {},
      label: 'Aircraft',
      draft: { display_name: 'Aircraft 2' },
    });
    // Simulate the save flow assigning a conflict.
    const edit = findEdit(id);
    if (edit) {
      (edit as { conflict?: unknown }).conflict = {
        current_version: 7,
        current_body: { display_name: 'Aircraft 7' },
      };
      edit.status = 'conflict';
    }
    resolveConflict(id, 'use_latest');
    expect(findEdit(id)).toBeUndefined();
  });

  it('keep_mine rebumps the expected_version and clears the conflict', () => {
    const id = stage({
      op: 'update',
      resource: 'object_type',
      resourceId: 'ot-1',
      expectedVersion: 1,
      originalSnapshot: { display_name: 'Aircraft' },
      label: 'Aircraft',
      draft: { display_name: 'Aircraft 2' },
    });
    const edit = findEdit(id);
    if (edit) {
      (edit as { conflict?: unknown }).conflict = {
        current_version: 7,
        current_body: { display_name: 'Aircraft 7' },
      };
      edit.status = 'conflict';
    }
    resolveConflict(id, 'keep_mine');
    const updated = findEdit(id);
    expect(updated?.expectedVersion).toBe(7);
    expect(updated?.conflict).toBeUndefined();
    expect(updated?.status).toBe('pending');
    expect(updated?.originalSnapshot).toEqual({ display_name: 'Aircraft 7' });
  });
});

describe('save()', () => {
  it('removes edits that committed and keeps conflicts', async () => {
    const okId = stage({
      op: 'update',
      resource: 'object_type',
      resourceId: 'ot-1',
      expectedVersion: 1,
      originalSnapshot: { display_name: 'A' },
      label: 'A',
      draft: { display_name: 'A2' },
    });
    const conflictId = stage({
      op: 'update',
      resource: 'link_type',
      resourceId: 'lt-1',
      expectedVersion: 1,
      originalSnapshot: { display_name: 'L' },
      label: 'L',
      draft: { display_name: 'L2' },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, {
          batch_id: 'batch-x',
          status: 'failed',
          results: [
            { client_id: okId, resource: 'object_type', op: 'update', status: 'ok' },
            {
              client_id: conflictId,
              resource: 'link_type',
              op: 'update',
              status: 'conflict',
              current_version: 9,
              current_body: { display_name: 'L from server' },
            },
          ],
        }),
      ),
    );

    const resp = await save();
    expect(resp?.status).toBe('failed');
    // The OK edit is gone because it committed (the failed-batch
    // status doesn't change that — server confirms which individual
    // edits applied via per-edit result codes).
    expect(findEdit(okId)).toBeUndefined();
    const conflict = findEdit(conflictId);
    expect(conflict?.status).toBe('conflict');
    expect(conflict?.conflict?.current_version).toBe(9);
    expect(getConflictCount()).toBe(1);
  });

  it('marks transport errors and pulls edits back to pending', async () => {
    const id = stage({
      op: 'create',
      resource: 'object_type',
      label: 'Aircraft',
      draft: { name: 'Aircraft' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const resp = await save();
    expect(resp).toBeNull();
    expect(findEdit(id)?.status).toBe('pending');
  });

  it('is a no-op when there are no edits', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    const resp = await save();
    expect(resp).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('diffStagedEdit()', () => {
  it('skips housekeeping fields and reports only changed values', () => {
    const edit: StagedEdit = {
      clientId: 'c1',
      op: 'update',
      resource: 'object_type',
      resourceId: 'ot-1',
      expectedVersion: 1,
      originalSnapshot: {
        display_name: 'Aircraft',
        description: 'a',
        version: 1,
        updated_at: '2024',
      },
      draft: {
        display_name: 'Aircraft 2',
        description: 'a',
        version: 2,
        updated_at: '2025',
      },
      label: 'Aircraft',
      status: 'pending',
      errors: [],
      warnings: [],
      confirmedWarnings: [],
      createdAt: 0,
    };
    const diffs = diffStagedEdit(edit);
    expect(diffs).toEqual([
      { path: 'display_name', before: 'Aircraft', after: 'Aircraft 2' },
    ]);
  });

  it('returns empty diffs for create and delete edits', () => {
    const create: StagedEdit = {
      clientId: 'c',
      op: 'create',
      resource: 'object_type',
      resourceId: null,
      expectedVersion: null,
      originalSnapshot: null,
      draft: { display_name: 'A' },
      label: 'A',
      status: 'pending',
      errors: [],
      warnings: [],
      confirmedWarnings: [],
      createdAt: 0,
    };
    expect(diffStagedEdit(create)).toEqual([]);
  });
});

describe('cross-reference creates', () => {
  // The CreateObjectTypeWizard relies on this contract: pre-assign a
  // uuid via newClientId(), stage create-object_type with that id in
  // the body, then stage one create-property per row using the same
  // uuid as `object_type_id`. The backend honours pre-assigned ids on
  // creates so the entire batch commits atomically without resolving
  // ids round-trip.
  it('propagates the same uuid through the wire payload for related creates', async () => {
    const objectTypeId = newClientId();
    expect(objectTypeId.length).toBeGreaterThan(0);

    stage({
      clientId: objectTypeId,
      op: 'create',
      resource: 'object_type',
      label: 'Aircraft',
      draft: { id: objectTypeId, name: 'aircraft', display_name: 'Aircraft' },
    });
    stage({
      op: 'create',
      resource: 'property',
      label: 'Tail Number',
      draft: {
        object_type_id: objectTypeId,
        name: 'tail_number',
        display_name: 'Tail Number',
        property_type: 'string',
      },
    });

    const captured: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        if (init?.body) {
          captured.push(JSON.parse(init.body as string));
        }
        return jsonResponse(200, {
          batch_id: 'batch-x',
          status: 'ok',
          results: [
            { client_id: objectTypeId, resource: 'object_type', op: 'create', status: 'ok' },
            { client_id: 'p-1', resource: 'property', op: 'create', status: 'ok' },
          ],
        });
      }),
    );

    await save();

    expect(captured).toHaveLength(1);
    const body = captured[0] as { edits: Array<Record<string, unknown>> };
    const objectTypeEdit = body.edits.find((e) => e.resource === 'object_type');
    const propertyEdit = body.edits.find((e) => e.resource === 'property');

    // The object type create carries the pre-assigned uuid in both
    // the envelope (`client_id`) and the body (`id`).
    expect(objectTypeEdit?.client_id).toBe(objectTypeId);
    expect((objectTypeEdit?.body as { id: string }).id).toBe(objectTypeId);
    // The property's body references the same uuid via object_type_id.
    expect((propertyEdit?.body as { object_type_id: string }).object_type_id).toBe(objectTypeId);
  });
});

// ── helpers (copied from auth.test.ts pattern) ───────────────────────

function mockSessionStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

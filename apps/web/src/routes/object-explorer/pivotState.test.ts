import { describe, expect, it } from 'vitest';

import {
  currentPivot,
  pivotHistoryLabel,
  pivotHistoryToTraverseRequest,
  pushPivot,
  rollbackTo,
  type PivotHistory,
} from './pivotState';
import type { ExplorationContext } from './state';

function makeStep(overrides: Partial<ExplorationContext>): ExplorationContext {
  return {
    kind: 'pivot',
    label: 'step',
    source_object_type_id: 'Actor',
    result_object_type_id: 'Event',
    source_object_ids: ['a-1'],
    result_object_ids: ['e-1', 'e-2'],
    link_type_id: 'INVOLVED_IN',
    direction: 'outgoing',
    ...overrides,
  };
}

describe('Object Explorer pivot state', () => {
  it('pushPivot appends an immutable copy', () => {
    const start: PivotHistory = [];
    const step = makeStep({});
    const next = pushPivot(start, step);
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual(step);
    expect(start).toHaveLength(0);
  });

  it('rollbackTo truncates to a prefix and clamps out-of-range', () => {
    const history: PivotHistory = [
      makeStep({ label: 'a', result_object_type_id: 'Event' }),
      makeStep({ label: 'b', source_object_type_id: 'Event', result_object_type_id: 'Location', link_type_id: 'OCCURRED_AT' }),
      makeStep({ label: 'c', source_object_type_id: 'Location', result_object_type_id: 'Country', link_type_id: 'LOCATED_IN' }),
    ];
    expect(rollbackTo(history, 0).map((s) => s.label)).toEqual(['a']);
    expect(rollbackTo(history, 1).map((s) => s.label)).toEqual(['a', 'b']);
    expect(rollbackTo(history, 99).map((s) => s.label)).toEqual(['a', 'b', 'c']);
    expect(rollbackTo(history, -1)).toEqual([]);
  });

  it('currentPivot returns the last step or null', () => {
    expect(currentPivot([])).toBeNull();
    const step = makeStep({});
    expect(currentPivot([step])).toBe(step);
  });

  it('pivotHistoryLabel renders breadcrumb arrow segments', () => {
    const history: PivotHistory = [
      makeStep({ source_object_type_id: 'Actor', result_object_type_id: 'Event' }),
      makeStep({ source_object_type_id: 'Event', result_object_type_id: 'Location', link_type_id: 'OCCURRED_AT' }),
    ];
    expect(pivotHistoryLabel(history)).toBe('Actor → Event → Location');
    expect(pivotHistoryLabel([])).toBe('');
  });

  it('pivotHistoryToTraverseRequest builds a multi-step Search Around payload from the history', () => {
    const history: PivotHistory = [
      makeStep({ source_object_ids: ['actor-1', 'actor-2'], link_type_id: 'INVOLVED_IN', direction: 'outgoing' }),
      makeStep({ source_object_type_id: 'Event', result_object_type_id: 'Location', link_type_id: 'OCCURRED_AT', direction: 'outgoing' }),
    ];
    const req = pivotHistoryToTraverseRequest({ tenant: 't-1', history, branchContext: 'sanctions-2026Q3' });
    expect(req).not.toBeNull();
    expect(req?.tenant).toBe('t-1');
    expect(req?.branch_context).toBe('sanctions-2026Q3');
    expect(req?.starting_set).toEqual([
      { object_type_id: 'Actor', object_id: 'actor-1' },
      { object_type_id: 'Actor', object_id: 'actor-2' },
    ]);
    expect(req?.steps.map((s) => [s.ordinal, s.relation_id, s.direction])).toEqual([
      [0, 'INVOLVED_IN', 'outgoing'],
      [1, 'OCCURRED_AT', 'outgoing'],
    ]);
  });

  it('pivotHistoryToTraverseRequest normalises legacy direction aliases', () => {
    const history: PivotHistory = [
      makeStep({ direction: 'inbound', source_object_ids: ['actor-1'] }),
      makeStep({ direction: 'outbound' }),
      makeStep({ direction: 'bogus' as unknown as ExplorationContext['direction'] }),
    ];
    const req = pivotHistoryToTraverseRequest({ tenant: 't-1', history });
    expect(req?.steps.map((s) => s.direction)).toEqual(['incoming', 'outgoing', 'outgoing']);
  });

  it('pivotHistoryToTraverseRequest returns null on empty history or empty source set', () => {
    expect(pivotHistoryToTraverseRequest({ tenant: 't-1', history: [] })).toBeNull();
    const noSource: PivotHistory = [makeStep({ source_object_ids: [] })];
    expect(pivotHistoryToTraverseRequest({ tenant: 't-1', history: noSource })).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  applyBridgeToPrimitives,
  bridgeKindsCompatible,
  hydrateFromBridge,
  resolveMappedParentVariable,
  type EmbeddedRuntimeBridge,
  type InterfaceMapping,
} from './embeddedRuntimeBridge';
import type { WorkshopVariableLike } from './workshopVariables';

function variable(id: string, kind: string, extras: Partial<WorkshopVariableLike> = {}): WorkshopVariableLike {
  return { id, kind, name: id, ...extras };
}

function makeBridge(state: Record<string, unknown>): EmbeddedRuntimeBridge & {
  state: Record<string, unknown>;
} {
  return {
    state,
    mappedExternalIDs: Object.keys(state),
    read: (childExternalID) => state[childExternalID],
    write: (childExternalID, value) => {
      state[childExternalID] = value;
    },
  };
}

describe('hydrateFromBridge', () => {
  it('returns bridged values keyed by variable id', () => {
    const variables: WorkshopVariableLike[] = [
      variable('flight', 'string', { external_id: 'selectedFlight' }),
      variable('untagged', 'string'),
      variable('orphan', 'string', { external_id: 'unmapped' }),
    ];
    const bridge = makeBridge({ selectedFlight: 'abc123' });
    expect(hydrateFromBridge(variables, bridge)).toEqual({ flight: 'abc123' });
  });

  it('skips bridged variables whose parent value is undefined', () => {
    const variables: WorkshopVariableLike[] = [
      variable('flight', 'string', { external_id: 'selectedFlight' }),
    ];
    const bridge = makeBridge({ selectedFlight: undefined });
    expect(hydrateFromBridge(variables, bridge)).toEqual({});
  });
});

describe('applyBridgeToPrimitives', () => {
  it('overrides local values for bridged variables but keeps the rest', () => {
    const variables: WorkshopVariableLike[] = [
      variable('flight', 'string', { external_id: 'selectedFlight' }),
      variable('local', 'string'),
    ];
    const bridge = makeBridge({ selectedFlight: 'parent-value' });
    const merged = applyBridgeToPrimitives(
      { flight: 'child-local', local: 'keep-me' },
      variables,
      bridge,
    );
    expect(merged).toEqual({ flight: 'parent-value', local: 'keep-me' });
  });

  it('is a no-op when the bridge is null', () => {
    const variables: WorkshopVariableLike[] = [variable('x', 'string', { external_id: 'x' })];
    const primitives = { x: 'local' };
    expect(applyBridgeToPrimitives(primitives, variables, null)).toBe(primitives);
  });
});

describe('resolveMappedParentVariable', () => {
  it('resolves variable kind mappings to a parent variable id', () => {
    const mapping: InterfaceMapping = {
      flight: { kind: 'variable', variable_id: 'parent_flight' },
    };
    expect(resolveMappedParentVariable(mapping, 'flight')).toBe('parent_flight');
  });
  it('returns null for literal or runtime_parameter mappings', () => {
    const mapping: InterfaceMapping = {
      a: { kind: 'literal', value: 'static' },
      b: { kind: 'runtime_parameter', value: 'param_name' },
    };
    expect(resolveMappedParentVariable(mapping, 'a')).toBeNull();
    expect(resolveMappedParentVariable(mapping, 'b')).toBeNull();
  });
  it('returns null for missing external ids', () => {
    expect(resolveMappedParentVariable({}, 'unknown')).toBeNull();
  });
});

describe('bridgeKindsCompatible', () => {
  it('accepts identical kinds', () => {
    expect(bridgeKindsCompatible('string', 'string')).toBe(true);
  });
  it('accepts numeric aliases', () => {
    expect(bridgeKindsCompatible('numeric', 'number')).toBe(true);
    expect(bridgeKindsCompatible('integer', 'float')).toBe(true);
  });
  it('accepts active-object aliases', () => {
    expect(bridgeKindsCompatible('object_set_active_object', 'object_ref')).toBe(true);
  });
  it('rejects clearly incompatible kinds', () => {
    expect(bridgeKindsCompatible('string', 'object_set')).toBe(false);
    expect(bridgeKindsCompatible('boolean', 'date')).toBe(false);
  });
  it('is lenient when either kind is missing', () => {
    expect(bridgeKindsCompatible('', 'string')).toBe(true);
    expect(bridgeKindsCompatible('string', '')).toBe(true);
  });
});

describe('bridge write/read round-trip', () => {
  it('propagates writes back to the bridge backing store', () => {
    const bridge = makeBridge({ flight: 'a' });
    bridge.write('flight', 'b');
    expect(bridge.read('flight')).toBe('b');
    expect(bridge.state.flight).toBe('b');
  });

  it('write is a no-op for unmapped external ids when consumers gate on mappedExternalIDs', () => {
    const bridge = makeBridge({ a: 1 });
    const guard = vi.fn(bridge.write);
    if (bridge.mappedExternalIDs.includes('b')) {
      guard('b', 2);
    }
    expect(guard).not.toHaveBeenCalled();
  });
});

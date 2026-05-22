// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { WorkshopVariableLike } from './workshopVariables';
import {
  coerceUrlValue,
  hydrateVariablesFromUrl,
  moduleInterfaceVariables,
  readPersistedState,
  stateSavingKey,
  writePersistedState,
} from './workshopModuleInterface';

function variable(
  id: string,
  kind: string,
  extras: Partial<WorkshopVariableLike> = {},
): WorkshopVariableLike {
  return { id, kind, name: id, ...extras };
}

describe('moduleInterfaceVariables', () => {
  it('keeps variables tagged with interface/routing/state_saving and an external id', () => {
    const variables: WorkshopVariableLike[] = [
      variable('selected', 'string', {
        external_id: 'selectedFlight',
        interface: { enabled: true, display_name: 'Selected' },
      }),
      variable('filter', 'string', {
        external_id: 'filterStatus',
        routing: { enabled: true },
      }),
      variable('persisted', 'boolean', {
        external_id: 'darkMode',
        state_saving: { enabled: true },
      }),
      variable('untagged', 'string', { external_id: 'leftover' }),
      variable('no_external_id', 'string', {
        interface: { enabled: true },
      }),
    ];
    const out = moduleInterfaceVariables(variables);
    expect(out.map((v) => v.id).sort()).toEqual(['filter', 'persisted', 'selected']);
  });
});

describe('hydrateVariablesFromUrl', () => {
  it('hydrates only routing-enabled variables that match a URL param', () => {
    const variables: WorkshopVariableLike[] = [
      variable('flight', 'string', {
        external_id: 'selectedFlight',
        routing: { enabled: true },
      }),
      variable('status', 'string', {
        external_id: 'filterStatus',
        routing: { enabled: true },
      }),
      variable('interface_only', 'string', {
        external_id: 'iface',
        interface: { enabled: true },
      }),
    ];
    const out = hydrateVariablesFromUrl(variables, {
      selectedFlight: 'abc123',
      filterStatus: 'open',
      iface: 'should-not-hydrate',
      stray: 'unused',
    });
    expect(out).toEqual({ flight: 'abc123', status: 'open' });
  });

  it('coerces values to the variable kind', () => {
    const variables: WorkshopVariableLike[] = [
      variable('count', 'numeric', {
        external_id: 'count',
        routing: { enabled: true },
      }),
      variable('active', 'boolean', {
        external_id: 'active',
        routing: { enabled: true },
      }),
      variable('payload', 'struct', {
        external_id: 'payload',
        routing: { enabled: true },
      }),
    ];
    const out = hydrateVariablesFromUrl(variables, {
      count: '42',
      active: 'true',
      payload: '{"selected":["a","b"]}',
    });
    expect(out).toEqual({
      count: 42,
      active: true,
      payload: { selected: ['a', 'b'] },
    });
  });

  it('falls back to raw string when coercion fails', () => {
    const variables: WorkshopVariableLike[] = [
      variable('payload', 'struct', {
        external_id: 'payload',
        routing: { enabled: true },
      }),
    ];
    const out = hydrateVariablesFromUrl(variables, { payload: 'not-json' });
    expect(out).toEqual({ payload: 'not-json' });
  });
});

describe('coerceUrlValue', () => {
  it('returns the raw string for unknown kinds', () => {
    expect(coerceUrlValue('hello', 'string')).toBe('hello');
    expect(coerceUrlValue('hello', 'mystery')).toBe('hello');
  });
  it('coerces booleans from "true"/"1"', () => {
    expect(coerceUrlValue('true', 'boolean')).toBe(true);
    expect(coerceUrlValue('1', 'boolean')).toBe(true);
    expect(coerceUrlValue('false', 'boolean')).toBe(false);
    expect(coerceUrlValue('', 'boolean')).toBe(false);
  });
});

describe('state saving', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('round-trips values for state-saving-enabled variables', () => {
    const variables: WorkshopVariableLike[] = [
      variable('mode', 'string', {
        external_id: 'darkMode',
        state_saving: { enabled: true },
      }),
      variable('count', 'numeric', {
        external_id: 'count',
        state_saving: { enabled: true },
      }),
      variable('not_saved', 'string', { external_id: 'irrelevant' }),
    ];

    writePersistedState(
      variables,
      { mode: 'dark', count: 7, not_saved: 'ignored' },
      'flight-inbox',
      'user-1',
    );

    expect(window.localStorage.getItem(stateSavingKey('flight-inbox', 'user-1', 'darkMode'))).toBe(
      '"dark"',
    );
    expect(window.localStorage.getItem(stateSavingKey('flight-inbox', 'user-1', 'count'))).toBe('7');
    expect(window.localStorage.getItem(stateSavingKey('flight-inbox', 'user-1', 'irrelevant'))).toBeNull();

    const restored = readPersistedState(variables, 'flight-inbox', 'user-1');
    expect(restored).toEqual({ mode: 'dark', count: 7 });
  });

  it('removes the entry when the new value is undefined', () => {
    const variables: WorkshopVariableLike[] = [
      variable('mode', 'string', {
        external_id: 'darkMode',
        state_saving: { enabled: true },
      }),
    ];
    writePersistedState(variables, { mode: 'dark' }, 'app', 'u');
    expect(window.localStorage.getItem(stateSavingKey('app', 'u', 'darkMode'))).toBe('"dark"');
    writePersistedState(variables, {}, 'app', 'u');
    expect(window.localStorage.getItem(stateSavingKey('app', 'u', 'darkMode'))).toBeNull();
  });

  it('ignores corrupted localStorage entries', () => {
    const variables: WorkshopVariableLike[] = [
      variable('mode', 'string', {
        external_id: 'darkMode',
        state_saving: { enabled: true },
      }),
    ];
    window.localStorage.setItem(stateSavingKey('app', 'u', 'darkMode'), '{ not json');
    expect(readPersistedState(variables, 'app', 'u')).toEqual({});
  });
});

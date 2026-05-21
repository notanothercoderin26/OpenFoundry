import { describe, expect, it } from 'vitest';

import type { ObjectType } from '@/lib/api/ontology';

import { compareTypesByProminence, isProminentType } from './prominence';

function makeType(partial: Partial<ObjectType> & Pick<ObjectType, 'id'>): ObjectType {
  return {
    id: partial.id,
    name: partial.id,
    display_name: partial.display_name ?? partial.id,
    description: '',
    primary_key_property: null,
    icon: null,
    color: null,
    properties: [],
    status: partial.status,
    visibility: partial.visibility,
  } as unknown as ObjectType;
}

describe('isProminentType', () => {
  it('returns true for favourited active types', () => {
    const type = makeType({ id: 'a' });
    expect(isProminentType(type, { favorites: new Set(['a']) })).toBe(true);
  });

  it('returns true for types with a positive object count', () => {
    const type = makeType({ id: 'a' });
    expect(isProminentType(type, { counts: new Map([['a', 12]]) })).toBe(true);
    expect(isProminentType(type, { counts: new Map([['a', 0]]) })).toBe(false);
  });

  it('returns false for deprecated or hidden types regardless of signals', () => {
    expect(
      isProminentType(makeType({ id: 'a', status: 'deprecated' }), {
        favorites: new Set(['a']),
        counts: new Map([['a', 100]]),
      }),
    ).toBe(false);
    expect(
      isProminentType(makeType({ id: 'a', visibility: 'hidden' }), {
        favorites: new Set(['a']),
      }),
    ).toBe(false);
  });

  it('returns false when there is no count and no favourite', () => {
    expect(isProminentType(makeType({ id: 'a' }))).toBe(false);
  });
});

describe('compareTypesByProminence', () => {
  it('puts prominent types first, then sorts by count desc, then by name', () => {
    const aircraft = makeType({ id: 'aircraft', display_name: '[Example Data] Aircraft' });
    const flight = makeType({ id: 'flight', display_name: '[Example Data] Flight' });
    const obsolete = makeType({ id: 'obsolete', display_name: 'Obsolete', status: 'deprecated' });
    const empty = makeType({ id: 'empty', display_name: 'Empty' });
    const types = [obsolete, empty, aircraft, flight];
    const counts = new Map<string, number>([
      [aircraft.id, 10],
      [flight.id, 100],
      [obsolete.id, 9999],
    ]);
    types.sort(compareTypesByProminence({ counts }));
    expect(types.map((t) => t.id)).toEqual(['flight', 'aircraft', 'empty', 'obsolete']);
  });
});

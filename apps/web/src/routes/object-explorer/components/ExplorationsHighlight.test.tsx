// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ObjectSetDefinition, ObjectType } from '@/lib/api/ontology';

import { ExplorationsHighlight } from './ExplorationsHighlight';

afterEach(() => cleanup());

function makeType(id: string, displayName: string, color: string | null = null): ObjectType {
  return {
    id,
    name: id,
    display_name: displayName,
    description: '',
    primary_key_property: null,
    icon: null,
    color,
    properties: [],
  } as unknown as ObjectType;
}

function makeSet(partial: Partial<ObjectSetDefinition> & Pick<ObjectSetDefinition, 'id' | 'name' | 'base_object_type_id'>): ObjectSetDefinition {
  return {
    id: partial.id,
    name: partial.name,
    description: '',
    base_object_type_id: partial.base_object_type_id,
    filters: [],
    traversals: [],
    join: null,
    projections: [],
    what_if_label: null,
    policy: { mode: 'public', visibility: 'normal' },
    kind: partial.kind,
    materialized_snapshot: null,
    materialized_at: null,
    materialized_row_count: 0,
    owner_id: 'me',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  } as unknown as ObjectSetDefinition;
}

const flight = makeType('flight', '[Example Data] Flight', '#1f77b4');
const airport = makeType('airport', '[Example Data] Airport', '#9467bd');
const typeById = new Map<string, ObjectType>([
  [flight.id, flight],
  [airport.id, airport],
]);

describe('ExplorationsHighlight', () => {
  it('renders nothing when there are no saved sets', () => {
    const { container } = render(
      <ExplorationsHighlight objectSets={[]} typeById={typeById} onOpen={() => undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the eyebrow count and one card per saved set', () => {
    const sets = [
      makeSet({ id: 's1', name: 'My Flights list', base_object_type_id: flight.id, kind: 'list' }),
      makeSet({ id: 's2', name: 'My Airport exploration', base_object_type_id: airport.id, kind: 'exploration' }),
    ];
    render(
      <ExplorationsHighlight objectSets={sets} typeById={typeById} onOpen={() => undefined} />,
    );

    expect(screen.getByText('My explorations & lists')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByRole('button', { name: /My Flights list/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /My Airport exploration/i })).toBeTruthy();
  });

  it('invokes onOpen with the clicked saved set', () => {
    const onOpen = vi.fn();
    const set = makeSet({ id: 's1', name: 'My Flights list', base_object_type_id: flight.id, kind: 'list' });
    render(
      <ExplorationsHighlight objectSets={[set]} typeById={typeById} onOpen={onOpen} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /My Flights list/i }));
    expect(onOpen).toHaveBeenCalledWith(set);
  });

  it('caps the number of cards at the limit', () => {
    const sets = Array.from({ length: 10 }, (_, i) =>
      makeSet({ id: `s${i}`, name: `Set ${i}`, base_object_type_id: flight.id, kind: 'list' }),
    );
    render(
      <ExplorationsHighlight objectSets={sets} typeById={typeById} onOpen={() => undefined} limit={4} />,
    );
    const cards = screen.getAllByRole('button');
    expect(cards.length).toBe(4);
    // Chip in the eyebrow still reflects the total.
    expect(screen.getByText('10')).toBeTruthy();
  });
});

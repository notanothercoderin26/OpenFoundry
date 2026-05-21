// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ObjectSetDefinition, ObjectType } from '@/lib/api/ontology';

import { SearchTypeahead } from './SearchTypeahead';
import type { RecentItem } from '../state';

afterEach(() => cleanup());

function makeType(id: string, displayName: string, status?: string): ObjectType {
  return {
    id,
    name: id,
    display_name: displayName,
    description: '',
    primary_key_property: null,
    icon: null,
    color: null,
    properties: [],
    status,
  } as unknown as ObjectType;
}

function makeSet(id: string, name: string, baseTypeId = 'flight'): ObjectSetDefinition {
  return {
    id,
    name,
    description: '',
    base_object_type_id: baseTypeId,
    filters: [],
    traversals: [],
    join: null,
    projections: [],
    what_if_label: null,
    policy: { mode: 'public', visibility: 'normal' },
    materialized_snapshot: null,
    materialized_at: null,
    materialized_row_count: 0,
    owner_id: 'me',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  } as unknown as ObjectSetDefinition;
}

function makeRecent(title: string): RecentItem {
  return {
    kind: 'object',
    id: title.toLowerCase(),
    title,
    route: '/x',
    objectTypeId: null,
    createdAt: '2024-01-01',
  };
}

const passenger = makeType('passenger', '[Airport Security] Passenger', 'experimental');
const airline = makeType('airline', '[Example Data] Airline');
const aircraft = makeType('aircraft', '[Example Data] Aircraft');

describe('SearchTypeahead', () => {
  it('renders nothing when closed or query empty', () => {
    const { rerender, container } = render(
      <SearchTypeahead
        query=""
        open={true}
        types={[passenger]}
        savedSets={[]}
        recents={[]}
        onSelectType={() => undefined}
        onSelectSavedSet={() => undefined}
        onSelectRecent={() => undefined}
        onSearchAll={() => undefined}
      />,
    );
    expect(container.firstChild).toBeNull();
    rerender(
      <SearchTypeahead
        query="air"
        open={false}
        types={[passenger]}
        savedSets={[]}
        recents={[]}
        onSelectType={() => undefined}
        onSelectSavedSet={() => undefined}
        onSelectRecent={() => undefined}
        onSearchAll={() => undefined}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the highlighted "Search for" row and the type suggestions', () => {
    render(
      <SearchTypeahead
        query="air"
        open={true}
        types={[airline, aircraft, passenger]}
        savedSets={[]}
        recents={[]}
        onSelectType={() => undefined}
        onSelectSavedSet={() => undefined}
        onSelectRecent={() => undefined}
        onSearchAll={() => undefined}
      />,
    );
    expect(screen.getByText(/Search for/i)).toBeTruthy();
    expect(screen.getByText('[Airport Security] Passenger')).toBeTruthy();
    expect(screen.getByText('[Example Data] Airline')).toBeTruthy();
    expect(screen.getByText('Experimental')).toBeTruthy();
  });

  it('caps suggestions at maxSuggestions and shows "View all results" when there are more', () => {
    const many = Array.from({ length: 10 }, (_, i) => makeType(`a${i}`, `Airline ${i}`));
    render(
      <SearchTypeahead
        query="airline"
        open={true}
        types={many}
        savedSets={[]}
        recents={[]}
        onSelectType={() => undefined}
        onSelectSavedSet={() => undefined}
        onSelectRecent={() => undefined}
        onSearchAll={() => undefined}
        maxSuggestions={4}
      />,
    );
    expect(screen.queryByText('Airline 5')).toBeNull();
    expect(screen.getByText(/View all results/i)).toBeTruthy();
  });

  it('calls onSearchAll for the top action and for "View all results"', () => {
    const onSearchAll = vi.fn();
    render(
      <SearchTypeahead
        query="air"
        open={true}
        types={[makeType('a', 'Airline A'), makeType('b', 'Airline B'), makeType('c', 'Airline C')]}
        savedSets={[]}
        recents={[]}
        onSelectType={() => undefined}
        onSelectSavedSet={() => undefined}
        onSelectRecent={() => undefined}
        onSearchAll={onSearchAll}
        maxSuggestions={2}
      />,
    );
    fireEvent.mouseDown(screen.getByText(/Search for/i));
    fireEvent.mouseDown(screen.getByText(/View all results/i));
    expect(onSearchAll).toHaveBeenCalledTimes(2);
  });

  it('calls onSelectType/SavedSet/Recent for the matching rows', () => {
    const onType = vi.fn();
    const onSet = vi.fn();
    const onRecent = vi.fn();
    render(
      <SearchTypeahead
        query="air"
        open={true}
        types={[airline]}
        savedSets={[makeSet('s1', 'Airline list')]}
        recents={[makeRecent('Airline recent')]}
        onSelectType={onType}
        onSelectSavedSet={onSet}
        onSelectRecent={onRecent}
        onSearchAll={() => undefined}
      />,
    );
    fireEvent.mouseDown(screen.getByText('[Example Data] Airline'));
    fireEvent.mouseDown(screen.getByText('Airline list'));
    fireEvent.mouseDown(screen.getByText('Airline recent'));
    expect(onType).toHaveBeenCalledWith('airline');
    expect(onSet).toHaveBeenCalledTimes(1);
    expect(onRecent).toHaveBeenCalledTimes(1);
  });

  it('shows an empty hint when nothing matches', () => {
    render(
      <SearchTypeahead
        query="zzz"
        open={true}
        types={[airline]}
        savedSets={[]}
        recents={[]}
        onSelectType={() => undefined}
        onSelectSavedSet={() => undefined}
        onSelectRecent={() => undefined}
        onSearchAll={() => undefined}
      />,
    );
    expect(screen.getByText(/No type-ahead matches/i)).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ObjectExplorerTypeGroup, ObjectType, SearchResult } from '@/lib/api/ontology';

import { SideNavSearch, type SearchSideNavSelection } from './SideNavSearch';

afterEach(() => cleanup());

function makeType(id: string, displayName: string): ObjectType {
  return {
    id,
    name: id,
    display_name: displayName,
    description: '',
    primary_key_property: null,
    icon: null,
    color: null,
    properties: [],
  } as unknown as ObjectType;
}

function makeResult(partial: Partial<SearchResult> & Pick<SearchResult, 'kind' | 'id'>): SearchResult {
  return {
    kind: partial.kind,
    id: partial.id,
    object_type_id: partial.object_type_id ?? null,
    title: partial.title ?? partial.id,
    subtitle: null,
    snippet: '',
    score: 1,
    route: '',
    metadata: {},
  } as SearchResult;
}

function makeGroup(id: string, displayName: string, typeIds: string[]): ObjectExplorerTypeGroup {
  return {
    id,
    name: id,
    display_name: displayName,
    description: '',
    object_types: [],
    object_type_ids: typeIds,
  };
}

const aircraft = makeType('aircraft', '[Example Data] Aircraft');
const flight = makeType('flight', '[Example Data] Flight');

const typeById = new Map<string, ObjectType>([
  [aircraft.id, aircraft],
  [flight.id, flight],
]);

const aviationGroup = makeGroup('aviation', 'Aviation', [aircraft.id, flight.id]);

describe('SideNavSearch', () => {
  it('renders the All results count and the per-type filters sorted by hits', () => {
    const results: SearchResult[] = [
      makeResult({ kind: 'object_instance', id: 'a1', object_type_id: aircraft.id }),
      makeResult({ kind: 'object_instance', id: 'a2', object_type_id: aircraft.id }),
      makeResult({ kind: 'object_instance', id: 'f1', object_type_id: flight.id }),
      makeResult({ kind: 'object_type', id: aircraft.id, object_type_id: aircraft.id }),
    ];
    render(
      <SideNavSearch
        searchResults={results}
        groups={[aviationGroup]}
        typeById={typeById}
        selection={{ kind: 'all' }}
        onSelect={() => undefined}
        onViewAllObjectTypeFilters={() => undefined}
        onViewAllGroupFilters={() => undefined}
      />,
    );

    const allResultsBtn = screen.getByRole('button', { name: /All results/i });
    expect(within(allResultsBtn).getByText('4')).toBeTruthy();

    const typeFilterButtons = screen.getAllByRole('button').filter((btn) =>
      btn.textContent?.includes('Aircraft') || btn.textContent?.includes('Flight'),
    );
    expect(typeFilterButtons[0].textContent).toContain('Aircraft');
    expect(within(typeFilterButtons[0]).getByText('2')).toBeTruthy();
    expect(typeFilterButtons[1].textContent).toContain('Flight');
    expect(within(typeFilterButtons[1]).getByText('1')).toBeTruthy();
  });

  it('shows the "View N other filters" link when more than the top limit exist', () => {
    const extraType = makeType('passenger', '[Example Data] Passenger');
    const extra2 = makeType('route', '[Example Data] Route');
    const extra3 = makeType('runway', '[Example Data] Runway');
    const extraTypeMap = new Map(typeById);
    extraTypeMap.set(extraType.id, extraType);
    extraTypeMap.set(extra2.id, extra2);
    extraTypeMap.set(extra3.id, extra3);

    const results: SearchResult[] = [
      makeResult({ kind: 'object_instance', id: '1', object_type_id: aircraft.id }),
      makeResult({ kind: 'object_instance', id: '2', object_type_id: flight.id }),
      makeResult({ kind: 'object_instance', id: '3', object_type_id: extraType.id }),
      makeResult({ kind: 'object_instance', id: '4', object_type_id: extra2.id }),
      makeResult({ kind: 'object_instance', id: '5', object_type_id: extra3.id }),
    ];
    const onViewAll = vi.fn();
    render(
      <SideNavSearch
        searchResults={results}
        groups={[]}
        typeById={extraTypeMap}
        selection={{ kind: 'all' }}
        onSelect={() => undefined}
        onViewAllObjectTypeFilters={onViewAll}
        onViewAllGroupFilters={() => undefined}
        topTypeFilterLimit={4}
      />,
    );

    const moreLink = screen.getByText(/View 1 other filter/i);
    fireEvent.click(moreLink);
    expect(onViewAll).toHaveBeenCalled();
  });

  it('emits the right selection when an object type filter is clicked', () => {
    const results: SearchResult[] = [
      makeResult({ kind: 'object_instance', id: 'a1', object_type_id: aircraft.id }),
    ];
    const onSelect = vi.fn<(next: SearchSideNavSelection) => void>();
    render(
      <SideNavSearch
        searchResults={results}
        groups={[aviationGroup]}
        typeById={typeById}
        selection={{ kind: 'all' }}
        onSelect={onSelect}
        onViewAllObjectTypeFilters={() => undefined}
        onViewAllGroupFilters={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Aircraft/i }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'type', typeId: aircraft.id });
  });

  it('disables artifact rows whose count is zero', () => {
    render(
      <SideNavSearch
        searchResults={[]}
        groups={[]}
        typeById={typeById}
        selection={{ kind: 'all' }}
        onSelect={() => undefined}
        onViewAllObjectTypeFilters={() => undefined}
        onViewAllGroupFilters={() => undefined}
      />,
    );
    const comparisonBtn = screen.getByRole('button', { name: /Comparison Views/i });
    expect(comparisonBtn.getAttribute('data-disabled')).toBe('true');
    expect(comparisonBtn.getAttribute('aria-disabled')).toBe('true');
  });

  it('classifies workshop modules as Modules artifacts', () => {
    const results: SearchResult[] = [
      makeResult({ kind: 'workshop_module', id: 'm1' }),
      makeResult({ kind: 'workshop_module', id: 'm2' }),
    ];
    render(
      <SideNavSearch
        searchResults={results}
        groups={[]}
        typeById={typeById}
        selection={{ kind: 'all' }}
        onSelect={() => undefined}
        onViewAllObjectTypeFilters={() => undefined}
        onViewAllGroupFilters={() => undefined}
      />,
    );
    const modulesBtn = screen.getByRole('button', { name: /Modules/i });
    expect(within(modulesBtn).getByText('2')).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { buildObjectExplorerTypeGroups, ObjectType } from '@/lib/api/ontology';

import { ScopeFilter } from './ScopeFilter';

type ExplorerGroup = ReturnType<typeof buildObjectExplorerTypeGroups>[number];

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

function makeGroup(id: string, displayName: string, types: ObjectType[], description = ''): ExplorerGroup {
  return {
    id,
    name: id,
    display_name: displayName,
    description,
    object_types: types,
    object_type_ids: types.map((type) => type.id),
  } as ExplorerGroup;
}

const aircraft = makeType('aircraft', '[Example Data] Aircraft');
const flight = makeType('flight', '[Example Data] Flight');
const route = makeType('route', '[Example Data] Route');
const airport = makeType('airport', '[Example Data] Airport');
const passenger = makeType('passenger', '[Example Data] Passenger');
const types = [aircraft, flight, route, airport, passenger];
const aviation = makeGroup('aviation', 'Aviation', types);

function openPopover() {
  fireEvent.click(screen.getByRole('button', { name: /^All/i }));
}

describe('ScopeFilter', () => {
  it('toggles open / closed on the trigger', () => {
    render(
      <ScopeFilter
        groups={[aviation]}
        visibleObjectTypes={types}
        selectedTypeIds={new Set()}
        onChangeSelected={() => undefined}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    openPopover();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('renders group cards with a truncated member preview', () => {
    render(
      <ScopeFilter
        groups={[aviation]}
        visibleObjectTypes={types}
        selectedTypeIds={new Set()}
        onChangeSelected={() => undefined}
      />,
    );
    openPopover();
    const group = screen.getByText('Aviation').closest('button')!;
    expect(within(group).getByText(/Aircraft.+Flight.+Route.+Airport, …/)).toBeTruthy();
  });

  it('selects every type in a group when the card is clicked', () => {
    const onChange = vi.fn();
    render(
      <ScopeFilter
        groups={[aviation]}
        visibleObjectTypes={types}
        selectedTypeIds={new Set()}
        onChangeSelected={onChange}
      />,
    );
    openPopover();
    fireEvent.click(screen.getByText('Aviation'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as Set<string>;
    expect(Array.from(next).sort()).toEqual(types.map((type) => type.id).sort());
  });

  it('shows the header label and Remove all filters link based on selection size', () => {
    const { rerender } = render(
      <ScopeFilter
        groups={[aviation]}
        visibleObjectTypes={types}
        selectedTypeIds={new Set()}
        onChangeSelected={() => undefined}
      />,
    );
    openPopover();
    expect(screen.getByText('Searching all objects')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Remove all filters/i }) as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <ScopeFilter
        groups={[aviation]}
        visibleObjectTypes={types}
        selectedTypeIds={new Set([aircraft.id])}
        onChangeSelected={() => undefined}
      />,
    );
    expect(screen.getByText('Searching selected')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Remove all filters/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders count and proportion bar in the types tab when counts are provided', () => {
    const counts = new Map([
      [aircraft.id, 25],
      [flight.id, 100],
      [route.id, 5],
    ]);
    render(
      <ScopeFilter
        groups={[aviation]}
        visibleObjectTypes={types}
        selectedTypeIds={new Set()}
        onChangeSelected={() => undefined}
        countsByType={counts}
      />,
    );
    openPopover();
    fireEvent.click(screen.getByRole('tab', { name: 'Object types' }));

    // Counts visible
    expect(screen.getByText('100')).toBeTruthy();
    expect(screen.getByText('25')).toBeTruthy();

    // Sorted by count desc → first row should be Flight
    const rows = screen.getAllByRole('button').filter((b) => b.className.includes('oe-scope__type'));
    expect(rows[0].textContent).toContain('[Example Data] Flight');

    // The Flight row has a 100% bar; Route should be much narrower.
    const flightBar = rows[0].querySelector<HTMLElement>('.oe-scope__type-bar-fill');
    const routeRow = rows.find((row) => row.textContent?.includes('[Example Data] Route'))!;
    const routeBar = routeRow.querySelector<HTMLElement>('.oe-scope__type-bar-fill');
    expect(flightBar?.style.width).toBe('100%');
    expect(parseFloat(routeBar?.style.width ?? '0')).toBeLessThan(10);
  });

  it('paginates the types list with Show more', () => {
    const extra = [
      makeType('t1', 'Type 1'),
      makeType('t2', 'Type 2'),
      makeType('t3', 'Type 3'),
      makeType('t4', 'Type 4'),
      makeType('t5', 'Type 5'),
      makeType('t6', 'Type 6'),
      makeType('t7', 'Type 7'),
      makeType('t8', 'Type 8'),
    ];
    const all = [...types, ...extra];
    render(
      <ScopeFilter
        groups={[]}
        visibleObjectTypes={all}
        selectedTypeIds={new Set()}
        onChangeSelected={() => undefined}
        initialTypePageSize={5}
      />,
    );
    openPopover();
    fireEvent.click(screen.getByRole('tab', { name: 'Object types' }));
    expect(screen.queryByText('Type 8')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Show more/i }));
    expect(screen.getByText('Type 8')).toBeTruthy();
  });

  it('closes on Escape', () => {
    render(
      <ScopeFilter
        groups={[aviation]}
        visibleObjectTypes={types}
        selectedTypeIds={new Set()}
        onChangeSelected={() => undefined}
      />,
    );
    openPopover();
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

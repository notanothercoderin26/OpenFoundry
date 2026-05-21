// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LinkType, ObjectType } from '@/lib/api/ontology';

import { SearchAroundPopover } from './SearchAroundPopover';

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

function makeLink(id: string, source: string, target: string, displayName?: string): LinkType {
  return {
    id,
    name: id,
    display_name: displayName ?? id,
    description: '',
    source_type_id: source,
    target_type_id: target,
    cardinality: 'many_to_many',
    owner_id: 'sys',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  } as unknown as LinkType;
}

const flight = makeType('flight', '[Example Data] Flight');
const airport = makeType('airport', '[Example Data] Airport');
const route = makeType('route', '[Example Data] Route');
const aircraft = makeType('aircraft', '[Example Data] Aircraft');

const typeById = new Map<string, ObjectType>([
  [flight.id, flight],
  [airport.id, airport],
  [route.id, route],
  [aircraft.id, aircraft],
]);

const linkTypes: LinkType[] = [
  makeLink('flight-airport', flight.id, airport.id, 'Arriving Flights'),
  makeLink('flight-route', flight.id, route.id, 'Departing Routes'),
  makeLink('flight-aircraft', flight.id, aircraft.id, 'Aircraft'),
  makeLink('orphan', 'other', airport.id, 'Unrelated'),
];

function renderWithAnchor(overrides: { sourceTypeId?: string | null; onSelect?: (option: import('./SearchAroundPopover').SearchAroundOption) => void; onClose?: () => void } = {}) {
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  const props = {
    anchor,
    sourceObjectTypeId: overrides.sourceTypeId ?? flight.id,
    linkTypes,
    typeById,
    onSelect: overrides.onSelect ?? (() => undefined),
    onClose: overrides.onClose ?? (() => undefined),
  };
  const utils = render(<SearchAroundPopover {...props} />);
  return { ...utils, anchor, props };
}

describe('SearchAroundPopover', () => {
  it('returns null when no anchor is provided', () => {
    const { container } = render(
      <SearchAroundPopover
        anchor={null}
        sourceObjectTypeId={flight.id}
        linkTypes={linkTypes}
        typeById={typeById}
        onSelect={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('lists only link types reachable from the source object type, sorted by label', () => {
    renderWithAnchor();
    const items = screen.getAllByRole('option').map((node) => node.textContent ?? '');
    expect(items.length).toBe(3);
    expect(items[0]).toContain('Aircraft');
    expect(items[1]).toContain('Arriving Flights');
    expect(items[2]).toContain('Departing Routes');
    expect(items.find((label) => label.includes('Unrelated'))).toBeUndefined();
  });

  it('filters the list as the user types', () => {
    renderWithAnchor();
    fireEvent.change(screen.getByPlaceholderText(/Select a type below/i), { target: { value: 'depart' } });
    const items = screen.getAllByRole('option');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('Departing Routes');
  });

  it('shows an empty message when no link types match', () => {
    renderWithAnchor();
    fireEvent.change(screen.getByPlaceholderText(/Select a type below/i), { target: { value: 'zzz' } });
    expect(screen.getByText(/No matching link types/i)).toBeTruthy();
  });

  it('first item is highlighted by default and Arrow keys move the highlight', () => {
    renderWithAnchor();
    const items = () => screen.getAllByRole('option');
    expect(items()[0].getAttribute('aria-selected')).toBe('true');
    const input = screen.getByPlaceholderText(/Select a type below/i);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(items()[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(items()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('fires onSelect with the active option when Enter is pressed', () => {
    const onSelect = vi.fn();
    renderWithAnchor({ onSelect });
    const input = screen.getByPlaceholderText(/Select a type below/i);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({
      label: 'Arriving Flights',
      targetTypeId: airport.id,
    });
  });

  it('fires onSelect when a row is clicked', () => {
    const onSelect = vi.fn();
    renderWithAnchor({ onSelect });
    fireEvent.click(screen.getByRole('option', { name: /Aircraft/i }));
    expect(onSelect).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    renderWithAnchor({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders the empty message when the source object type has no links', () => {
    renderWithAnchor({ sourceTypeId: 'unknown' });
    expect(screen.getByText(/No linked types available/i)).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LinkType, ObjectType, Property } from '@/lib/api/ontology';

import { TypePreviewPopover } from './TypePreviewPopover';

vi.mock('../queries', () => ({
  useTypeProperties: () => ({ data: undefined, isLoading: false }),
}));

afterEach(() => cleanup());

function makeType(partial: Partial<ObjectType> & Pick<ObjectType, 'id' | 'name'>): ObjectType {
  return {
    id: partial.id,
    name: partial.name,
    display_name: partial.display_name ?? partial.name,
    description: partial.description ?? '',
    primary_key_property: partial.primary_key_property ?? null,
    title_property: partial.title_property ?? null,
    icon: null,
    color: partial.color ?? null,
    properties: partial.properties ?? [],
    visibility: partial.visibility ?? 'normal',
  } as unknown as ObjectType;
}

function makeProperty(name: string, propertyType: string): Property {
  return {
    id: name,
    object_type_id: 'flight',
    name,
    display_name: name.replace(/_/g, ' '),
    description: '',
    property_type: propertyType,
  } as unknown as Property;
}

function makeLinkType(id: string, sourceId: string, targetId: string, displayName = id): LinkType {
  return {
    id,
    name: id,
    display_name: displayName,
    description: '',
    source_type_id: sourceId,
    target_type_id: targetId,
    cardinality: 'many_to_many',
    owner_id: 'sys',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  } as unknown as LinkType;
}

const flight = makeType({
  id: 'flight',
  name: 'flight',
  display_name: '[Example Data] Flight',
  description: 'Example flight type.',
  title_property: 'flight_display_name',
  primary_key_property: 'flight_id',
  visibility: 'normal',
  properties: [
    makeProperty('flight_display_name', 'string'),
    makeProperty('flight_id', 'string'),
    makeProperty('elapsed_time', 'long'),
    makeProperty('departure_time', 'timestamp'),
  ],
});
const airport = makeType({ id: 'airport', name: 'airport', display_name: '[Example Data] Airport' });

const typeById = new Map<string, ObjectType>([
  [flight.id, flight],
  [airport.id, airport],
]);

const linkTypes: LinkType[] = [
  makeLinkType('flight-airport', flight.id, airport.id, 'departs from'),
  makeLinkType('flight-orphan', flight.id, 'missing', 'unknown target'),
];

describe('TypePreviewPopover', () => {
  it('renders the type header, description, visibility and counts', () => {
    render(
      <TypePreviewPopover
        typeId={flight.id}
        typeById={typeById}
        linkTypes={linkTypes}
        onClose={() => undefined}
        onStartExploration={() => undefined}
      />,
    );

    expect(screen.getByText('[Example Data] Flight')).toBeTruthy();
    expect(screen.getByText('Object Type')).toBeTruthy();
    expect(screen.getByText('Example flight type.')).toBeTruthy();
    expect(screen.getByText('Normal')).toBeTruthy();

    const propertiesHeading = screen.getByText(/^Properties$/i).parentElement!;
    expect(within(propertiesHeading).getByText('(4)')).toBeTruthy();
  });

  it('tags the title and primary key properties', () => {
    render(
      <TypePreviewPopover
        typeId={flight.id}
        typeById={typeById}
        linkTypes={linkTypes}
        onClose={() => undefined}
        onStartExploration={() => undefined}
      />,
    );
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.getByText('Primary key')).toBeTruthy();
  });

  it('shows a warning glyph next to linked types whose target is missing', () => {
    render(
      <TypePreviewPopover
        typeId={flight.id}
        typeById={typeById}
        linkTypes={linkTypes}
        onClose={() => undefined}
        onStartExploration={() => undefined}
      />,
    );
    const warning = screen.getByLabelText('Linked object type is unresolved');
    expect(warning.textContent).toContain('⚠');
  });

  it('closes when the backdrop is clicked but not when the dialog body is clicked', () => {
    const onClose = vi.fn();
    render(
      <TypePreviewPopover
        typeId={flight.id}
        typeById={typeById}
        linkTypes={linkTypes}
        onClose={onClose}
        onStartExploration={() => undefined}
      />,
    );
    fireEvent.click(screen.getByText('[Example Data] Flight'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <TypePreviewPopover
        typeId={flight.id}
        typeById={typeById}
        linkTypes={linkTypes}
        onClose={onClose}
        onStartExploration={() => undefined}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('emits onStartExploration with the typeId from the footer button', () => {
    const onStart = vi.fn();
    render(
      <TypePreviewPopover
        typeId={flight.id}
        typeById={typeById}
        linkTypes={linkTypes}
        onClose={() => undefined}
        onStartExploration={onStart}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Start exploring/i }));
    expect(onStart).toHaveBeenCalledWith(flight.id);
  });

  it('renders the "View →" link only when onViewProperties is provided', () => {
    const onView = vi.fn();
    const { rerender } = render(
      <TypePreviewPopover
        typeId={flight.id}
        typeById={typeById}
        linkTypes={linkTypes}
        onClose={() => undefined}
        onStartExploration={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: /View →/i })).toBeNull();
    rerender(
      <TypePreviewPopover
        typeId={flight.id}
        typeById={typeById}
        linkTypes={linkTypes}
        onClose={() => undefined}
        onStartExploration={() => undefined}
        onViewProperties={onView}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /View →/i }));
    expect(onView).toHaveBeenCalledWith(flight.id);
  });
});

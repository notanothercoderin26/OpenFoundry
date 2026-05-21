// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  buildObjectExplorerTypeGroups,
  LinkType,
  ObjectInstanceViewPolicy,
  ObjectType,
} from '@/lib/api/ontology';

import { BrowseGroupsGrid } from './BrowseGroupsGrid';
import type { SideNavSelection } from './SideNavBrowse';

type ExplorerGroup = ReturnType<typeof buildObjectExplorerTypeGroups>[number];

afterEach(() => cleanup());

function makeType(id: string, displayName: string, description = ''): ObjectType {
  return {
    id,
    name: id,
    display_name: displayName,
    description,
    primary_key_property: null,
    icon: null,
    color: null,
    properties: [],
  } as unknown as ObjectType;
}

function makeGroup(id: string, displayName: string, types: ObjectType[]): ExplorerGroup {
  return {
    id,
    name: id,
    display_name: displayName,
    description: '',
    object_types: types,
    object_type_ids: types.map((type) => type.id),
  } as ExplorerGroup;
}

const aircraft = makeType('aircraft', '[Example Data] Aircraft', 'Example aircraft type.');
const flight = makeType('flight', '[Example Data] Flight');
const route = makeType('route', '[Example Data] Route');

const aviation = makeGroup('aviation', 'Aviation', [aircraft, flight, route]);

const fullAccess: ObjectInstanceViewPolicy = {
  can_view_instances: true,
  reason: '',
  restricted_view_id: null,
} as ObjectInstanceViewPolicy;
function accessForType(): ObjectInstanceViewPolicy {
  return fullAccess;
}

const noLinks: LinkType[] = [];
const allSelection: SideNavSelection = { kind: 'all' };

describe('BrowseGroupsGrid', () => {
  it('renders one top-level section per group with eyebrow + count + cards', () => {
    render(
      <BrowseGroupsGrid
        groups={[aviation]}
        linkTypes={noLinks}
        accessForType={accessForType}
        onBrowse={() => undefined}
        onPreviewType={() => undefined}
        favoriteTypeIds={new Set()}
        onToggleFavorite={() => undefined}
        selection={allSelection}
      />,
    );
    expect(screen.getByText('Aviation')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText(aircraft.display_name)).toBeTruthy();
    expect(screen.getByText(flight.display_name)).toBeTruthy();
    expect(screen.getByText(route.display_name)).toBeTruthy();
  });

  it('puts FAVORITES first and shows descriptions for favorited cards', () => {
    render(
      <BrowseGroupsGrid
        groups={[aviation]}
        linkTypes={noLinks}
        accessForType={accessForType}
        onBrowse={() => undefined}
        onPreviewType={() => undefined}
        favoriteTypeIds={new Set([aircraft.id])}
        onToggleFavorite={() => undefined}
        selection={allSelection}
      />,
    );
    const sectionTitles = screen.getAllByText(/Favorites|Aviation/);
    expect(sectionTitles[0].textContent).toBe('Favorites');
    expect(screen.getByText('Example aircraft type.')).toBeTruthy();
  });

  it('emits onBrowse when the card body is activated', () => {
    const onBrowse = vi.fn();
    render(
      <BrowseGroupsGrid
        groups={[aviation]}
        linkTypes={noLinks}
        accessForType={accessForType}
        onBrowse={onBrowse}
        onPreviewType={() => undefined}
        favoriteTypeIds={new Set()}
        onToggleFavorite={() => undefined}
        selection={allSelection}
      />,
    );
    const card = screen.getByText(aircraft.display_name).closest('.oe-type-card') as HTMLElement;
    fireEvent.click(card);
    expect(onBrowse).toHaveBeenCalledWith(aircraft.id);
  });

  it('emits onPreviewType and onToggleFavorite from the per-card icon buttons', () => {
    const onPreview = vi.fn();
    const onFav = vi.fn();
    render(
      <BrowseGroupsGrid
        groups={[aviation]}
        linkTypes={noLinks}
        accessForType={accessForType}
        onBrowse={() => undefined}
        onPreviewType={onPreview}
        favoriteTypeIds={new Set()}
        onToggleFavorite={onFav}
        selection={allSelection}
      />,
    );
    const card = screen.getByText(aircraft.display_name).closest('.oe-type-card') as HTMLElement;
    fireEvent.click(within(card).getByLabelText(`Preview ${aircraft.display_name}`));
    expect(onPreview).toHaveBeenCalledWith(aircraft.id);
    fireEvent.click(within(card).getByLabelText(`Add ${aircraft.display_name} to favorites`));
    expect(onFav).toHaveBeenCalledWith(aircraft.id);
  });

  it('renders the count chip using formatCount when counts are provided', () => {
    render(
      <BrowseGroupsGrid
        groups={[aviation]}
        linkTypes={noLinks}
        accessForType={accessForType}
        onBrowse={() => undefined}
        onPreviewType={() => undefined}
        favoriteTypeIds={new Set()}
        onToggleFavorite={() => undefined}
        selection={allSelection}
        countsByType={new Map([[aircraft.id, 7280], [flight.id, 65740]])}
      />,
    );
    expect(screen.getByText('7.28k')).toBeTruthy();
    expect(screen.getByText('65.74k')).toBeTruthy();
  });

  it('shows the empty message when the favorites selection has no favorites', () => {
    render(
      <BrowseGroupsGrid
        groups={[aviation]}
        linkTypes={noLinks}
        accessForType={accessForType}
        onBrowse={() => undefined}
        onPreviewType={() => undefined}
        favoriteTypeIds={new Set()}
        onToggleFavorite={() => undefined}
        selection={{ kind: 'favorites' }}
      />,
    );
    expect(screen.getByText(/No favorite object types yet/i)).toBeTruthy();
  });
});

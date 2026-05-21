// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ObjectType, SearchResult } from '@/lib/api/ontology';

import { SearchResultObjectsSection } from './SearchResultObjectsSection';

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

function makeResult(partial: Partial<SearchResult> & Pick<SearchResult, 'id' | 'object_type_id'>): SearchResult {
  return {
    kind: partial.kind ?? 'object_instance',
    id: partial.id,
    object_type_id: partial.object_type_id ?? null,
    title: partial.title ?? partial.id,
    subtitle: partial.subtitle ?? null,
    snippet: partial.snippet ?? '',
    score: partial.score ?? 1,
    route: '',
    metadata: partial.metadata ?? {},
  } as SearchResult;
}

const runway = makeType('runway', '[Example Data] Runway', 'Example object type created by Palantir for training purposes - represents runways at airports');
const typeById = new Map([[runway.id, runway]]);

const results: SearchResult[] = [
  makeResult({
    id: 'AKP-1 (02/20)',
    object_type_id: runway.id,
    title: 'AKP-1 (02/20)',
    metadata: {
      display_airport_name: 'Anaktuvuk Pass Airport',
      display_airport_city_name_full: 'Anaktuvuk Pass, AK',
    },
  }),
  makeResult({
    id: 'KFP-1 (14/32)',
    object_type_id: runway.id,
    title: 'KFP-1 (14/32)',
    metadata: {
      display_airport_name: 'False Pass Airport',
      display_airport_city_name_full: 'False Pass, AK',
    },
  }),
];

describe('SearchResultObjectsSection', () => {
  it('renders the panel pill, eyebrow with type name + count, and per-row highlights', () => {
    render(
      <SearchResultObjectsSection
        results={results}
        typeById={typeById}
        query="pass"
        onOpenResult={() => undefined}
        onExploreType={() => undefined}
        onViewAllObjects={() => undefined}
      />,
    );
    expect(screen.getByText('Objects')).toBeTruthy();
    expect(screen.getByText('[Example Data] Runway')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getAllByText('Pass').length).toBeGreaterThan(0);
  });

  it('renders an "Explore all N" link that fires onExploreType', () => {
    const onExplore = vi.fn();
    render(
      <SearchResultObjectsSection
        results={results}
        typeById={typeById}
        query="pass"
        onOpenResult={() => undefined}
        onExploreType={onExplore}
        onViewAllObjects={() => undefined}
      />,
    );
    fireEvent.click(screen.getByText(/Explore all 2 \[Example Data\] Runways/));
    expect(onExplore).toHaveBeenCalledWith(runway.id);
  });

  it('renders "View all objects ›" footer that fires onViewAllObjects', () => {
    const onViewAll = vi.fn();
    render(
      <SearchResultObjectsSection
        results={results}
        typeById={typeById}
        query="pass"
        onOpenResult={() => undefined}
        onExploreType={() => undefined}
        onViewAllObjects={onViewAll}
      />,
    );
    fireEvent.click(screen.getByText(/View all objects/));
    expect(onViewAll).toHaveBeenCalled();
  });

  it('caps rendered rows per type at the initialRowsPerType cap', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      makeResult({ id: `r${i}`, object_type_id: runway.id, title: `Runway ${i} Pass` }),
    );
    render(
      <SearchResultObjectsSection
        results={many}
        typeById={typeById}
        query="pass"
        initialRowsPerType={2}
        onOpenResult={() => undefined}
        onExploreType={() => undefined}
        onViewAllObjects={() => undefined}
      />,
    );
    expect(screen.getAllByRole('button').filter((el) => el.className.includes('oe-search-row')).length).toBe(2);
  });

  it('shows the empty state pill when there are no objects', () => {
    render(
      <SearchResultObjectsSection
        results={[]}
        typeById={typeById}
        query="x"
        onOpenResult={() => undefined}
        onExploreType={() => undefined}
        onViewAllObjects={() => undefined}
      />,
    );
    expect(screen.getByText(/No matching objects/i)).toBeTruthy();
  });

  it('calls onOpenResult when a row is activated', () => {
    const onOpen = vi.fn();
    render(
      <SearchResultObjectsSection
        results={results}
        typeById={typeById}
        query="pass"
        onOpenResult={onOpen}
        onExploreType={() => undefined}
        onViewAllObjects={() => undefined}
      />,
    );
    const row = screen.getByText('AKP-1 (02/20)').closest('.oe-search-row') as HTMLElement;
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'AKP-1 (02/20)' }));
  });

  it('shows Search around hover affordance when handler is provided', () => {
    const onSearchAround = vi.fn();
    render(
      <SearchResultObjectsSection
        results={results}
        typeById={typeById}
        query="pass"
        onOpenResult={() => undefined}
        onExploreType={() => undefined}
        onViewAllObjects={() => undefined}
        onSearchAround={onSearchAround}
      />,
    );
    const row = screen.getByText('AKP-1 (02/20)').closest('.oe-search-row') as HTMLElement;
    const link = within(row).getByLabelText(/Search around/);
    fireEvent.click(link);
    expect(onSearchAround).toHaveBeenCalled();
  });
});

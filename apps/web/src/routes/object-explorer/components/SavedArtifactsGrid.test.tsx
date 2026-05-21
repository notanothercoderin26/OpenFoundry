// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ObjectSetDefinition,
  ObjectType,
  OntologyPermissionPrincipal,
} from '@/lib/api/ontology';

import { SavedArtifactsGrid } from './SavedArtifactsGrid';

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
    kind: partial.kind ?? 'exploration',
    materialized_snapshot: null,
    materialized_at: null,
    materialized_row_count: 0,
    owner_id: 'me',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  } as unknown as ObjectSetDefinition;
}

const flight = makeType('flight', '[Example Data] Flight');
const typeById = new Map<string, ObjectType>([[flight.id, flight]]);

const principal: OntologyPermissionPrincipal = {
  user_id: 'me',
  roles: ['admin'],
  permissions: ['ontology:manage'],
} as unknown as OntologyPermissionPrincipal;

describe('SavedArtifactsGrid', () => {
  it('renders Artifacts header with + New artifact CTA on the right', () => {
    const onCreate = vi.fn();
    render(
      <SavedArtifactsGrid
        visibleObjectSets={[]}
        typeById={typeById}
        principal={principal}
        evaluationSetId=""
        evaluation={null}
        evaluationRows={[]}
        objectSetBusy={false}
        objectSetError=""
        onCreate={onCreate}
        onOpenSavedExploration={() => undefined}
        onEvaluateSet={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /New artifact/i }));
    expect(onCreate).toHaveBeenCalled();
  });

  it('groups saved sets under Explorations & Lists and hides empty extra categories', () => {
    const sets = [
      makeSet({ id: 's1', name: 'My flights list', base_object_type_id: flight.id, kind: 'list' }),
      makeSet({ id: 's2', name: 'High delay exploration', base_object_type_id: flight.id, kind: 'exploration' }),
    ];
    render(
      <SavedArtifactsGrid
        visibleObjectSets={sets}
        typeById={typeById}
        principal={principal}
        evaluationSetId=""
        evaluation={null}
        evaluationRows={[]}
        objectSetBusy={false}
        objectSetError=""
        onCreate={() => undefined}
        onOpenSavedExploration={() => undefined}
        onEvaluateSet={() => undefined}
      />,
    );
    const explorationsHeading = screen.getByText('Explorations & Lists');
    const headRow = explorationsHeading.parentElement!;
    expect(within(headRow).getByText('2')).toBeTruthy();
    expect(screen.getByText('My flights list')).toBeTruthy();
    expect(screen.getByText('High delay exploration')).toBeTruthy();
    expect(screen.queryByText('Comparison Views')).toBeNull();
    expect(screen.queryByText('Modules')).toBeNull();
  });

  it('opens a saved set on card click and emits preview/materialize from the actions', () => {
    const onOpen = vi.fn();
    const onEvaluate = vi.fn();
    const set = makeSet({ id: 's1', name: 'My flights list', base_object_type_id: flight.id, kind: 'list' });
    render(
      <SavedArtifactsGrid
        visibleObjectSets={[set]}
        typeById={typeById}
        principal={principal}
        evaluationSetId=""
        evaluation={null}
        evaluationRows={[]}
        objectSetBusy={false}
        objectSetError=""
        onCreate={() => undefined}
        onOpenSavedExploration={onOpen}
        onEvaluateSet={onEvaluate}
      />,
    );
    const card = screen.getByText('My flights list').closest('.oe-artifacts__card') as HTMLElement;
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith(set);
    fireEvent.click(within(card).getByLabelText(/Preview /));
    expect(onEvaluate).toHaveBeenCalledWith('s1', 'preview');
    fireEvent.click(within(card).getByLabelText(/Materialize /));
    expect(onEvaluate).toHaveBeenCalledWith('s1', 'materialize');
  });

  it('surfaces the object-set error inline', () => {
    render(
      <SavedArtifactsGrid
        visibleObjectSets={[]}
        typeById={typeById}
        principal={principal}
        evaluationSetId=""
        evaluation={null}
        evaluationRows={[]}
        objectSetBusy={false}
        objectSetError="boom: backend exploded"
        onCreate={() => undefined}
        onOpenSavedExploration={() => undefined}
        onEvaluateSet={() => undefined}
      />,
    );
    expect(screen.getByText(/boom: backend exploded/i)).toBeTruthy();
  });
});

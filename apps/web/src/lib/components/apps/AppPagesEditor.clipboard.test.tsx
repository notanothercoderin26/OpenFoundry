import { describe, expect, it } from 'vitest';

import type { AppOverlay, AppWidget, PageLayout } from '@/lib/api/apps';

import {
  duplicateVariablesForPaste,
  findVariableRefsInOverlay,
  findVariableRefsInWidget,
  preparePastedOverlay,
  preparePastedWidget,
  remapVariableRefsInOverlay,
  remapVariableRefsInWidget,
  type VariableLike,
} from './AppPagesEditor';

const layout: PageLayout = { kind: 'grid', columns: 12, gap: '1rem', max_width: '' };

const variables: VariableLike[] = [
  { id: 'trail-set', kind: 'object_set_definition', name: 'Trails' },
  { id: 'trail-active', kind: 'object_set_active_object', name: 'Active trail' },
  { id: 'show_drawer', kind: 'primitive', name: 'Show drawer' },
];

function widget(overrides: Partial<AppWidget> = {}): AppWidget {
  return {
    id: 'w1',
    widget_type: 'object_table',
    title: 'Trail Table',
    description: '',
    position: { x: 0, y: 0, width: 8, height: 4 },
    props: {},
    binding: null,
    events: [],
    children: [],
    ...overrides,
  };
}

describe('findVariableRefsInWidget', () => {
  it('collects single _variable_id and plural _variable_ids props', () => {
    const w = widget({
      props: {
        source_variable_id: 'trail-set',
        active_object_variable_id: 'trail-active',
        unrelated_string: 'trail-active', // not a var-suffixed key → ignored
        feature_variable_ids: ['trail-set', 'trail-active'],
      },
    });
    const refs = findVariableRefsInWidget(w, variables);
    expect(refs).toEqual(new Set(['trail-set', 'trail-active']));
  });

  it('ignores values that do not match any known variable id', () => {
    const w = widget({
      props: {
        source_variable_id: 'does-not-exist',
        active_object_variable_id: 'trail-active',
      },
    });
    expect(findVariableRefsInWidget(w, variables)).toEqual(new Set(['trail-active']));
  });

  it('recurses into children', () => {
    const w = widget({
      props: {},
      children: [
        widget({ id: 'w2', props: { source_variable_id: 'trail-set' } }),
      ],
    });
    expect(findVariableRefsInWidget(w, variables)).toEqual(new Set(['trail-set']));
  });
});

describe('duplicateVariablesForPaste', () => {
  it('returns one new entry per matching ref with new id and " copy" name suffix', () => {
    const refs = ['trail-set', 'trail-active'];
    const { newVariables, mapping } = duplicateVariablesForPaste(refs, variables);
    expect(newVariables).toHaveLength(2);
    expect(mapping['trail-set']).not.toBe('trail-set');
    expect(mapping['trail-active']).not.toBe('trail-active');
    expect(newVariables.find((v) => v.id === mapping['trail-set'])?.name).toBe('Trails copy');
    expect(newVariables.find((v) => v.id === mapping['trail-active'])?.name).toBe('Active trail copy');
  });

  it('silently drops refs that have no matching source variable', () => {
    const { newVariables, mapping } = duplicateVariablesForPaste(['nope'], variables);
    expect(newVariables).toHaveLength(0);
    expect(mapping).toEqual({});
  });
});

describe('remapVariableRefsInWidget', () => {
  it('rewrites *_variable_id and *_variable_ids props using the mapping', () => {
    const w = widget({
      props: {
        source_variable_id: 'trail-set',
        feature_variable_ids: ['trail-set', 'trail-active'],
        unrelated_string: 'trail-set',
      },
    });
    const remapped = remapVariableRefsInWidget(w, {
      'trail-set': 'trail-set-NEW',
      'trail-active': 'trail-active-NEW',
    });
    expect(remapped.props.source_variable_id).toBe('trail-set-NEW');
    expect(remapped.props.feature_variable_ids).toEqual(['trail-set-NEW', 'trail-active-NEW']);
    // Unrelated string keys are NOT rewritten even if their value matches.
    expect(remapped.props.unrelated_string).toBe('trail-set');
  });

  it('returns the same widget reference when the mapping is empty', () => {
    const w = widget({ props: { source_variable_id: 'trail-set' } });
    expect(remapVariableRefsInWidget(w, {})).toBe(w);
  });
});

describe('preparePastedWidget', () => {
  it('regenerates the widget id and titles the copy without touching variables in same mode', () => {
    const w = widget({
      id: 'original',
      title: 'Trail Table',
      props: { source_variable_id: 'trail-set' },
    });
    const { widget: pasted, newVariables } = preparePastedWidget(w, 'same', variables);
    expect(pasted.id).not.toBe('original');
    expect(pasted.title).toBe('Trail Table copy');
    expect(pasted.props.source_variable_id).toBe('trail-set');
    expect(newVariables).toHaveLength(0);
  });

  it('duplicates referenced variables in duplicate mode and rewires the pasted widget', () => {
    const w = widget({
      id: 'original',
      props: { source_variable_id: 'trail-set' },
    });
    const { widget: pasted, newVariables } = preparePastedWidget(w, 'duplicate', variables);
    expect(newVariables).toHaveLength(1);
    expect(pasted.props.source_variable_id).toBe(newVariables[0].id);
    expect(pasted.props.source_variable_id).not.toBe('trail-set');
    expect(newVariables[0].name).toBe('Trails copy');
  });

  it('regenerates child widget ids on paste', () => {
    const w = widget({
      id: 'original',
      children: [widget({ id: 'child1' }), widget({ id: 'child2' })],
    });
    const { widget: pasted } = preparePastedWidget(w, 'same', []);
    const childIds = pasted.children.map((child) => child.id);
    expect(childIds).not.toContain('child1');
    expect(childIds).not.toContain('child2');
    expect(new Set(childIds).size).toBe(2);
  });
});

describe('findVariableRefsInOverlay + preparePastedOverlay', () => {
  function overlay(overrides: Partial<AppOverlay> = {}): AppOverlay {
    return {
      id: 'ov1',
      name: 'Detail',
      overlay_type: 'drawer',
      visible_variable_id: 'show_drawer',
      layout,
      widgets: [widget({ id: 'w1', props: { source_variable_id: 'trail-set' } })],
      sections: [],
      props: {},
      events: [],
      ...overrides,
    };
  }

  it('finds visible_variable_id + widget variable refs', () => {
    const refs = findVariableRefsInOverlay(overlay(), variables);
    expect(refs).toEqual(new Set(['show_drawer', 'trail-set']));
  });

  it('paste-duplicate generates new vars for both overlay and inner widget refs', () => {
    const { overlay: pasted, newVariables } = preparePastedOverlay(overlay(), 'duplicate', variables);
    expect(newVariables).toHaveLength(2);
    expect(pasted.visible_variable_id).not.toBe('show_drawer');
    expect(pasted.widgets?.[0].props.source_variable_id).not.toBe('trail-set');
    // The names of the duplicates carry " copy" suffix.
    expect(newVariables.map((v) => v.name).sort()).toEqual(['Show drawer copy', 'Trails copy']);
  });

  it('paste-same keeps variable references intact, only regenerates ids', () => {
    const source = overlay({ id: 'original' });
    const { overlay: pasted, newVariables } = preparePastedOverlay(source, 'same', variables);
    expect(pasted.id).not.toBe('original');
    expect(pasted.visible_variable_id).toBe('show_drawer');
    expect(pasted.widgets?.[0].id).not.toBe('w1');
    expect(pasted.widgets?.[0].props.source_variable_id).toBe('trail-set');
    expect(newVariables).toHaveLength(0);
  });
});

describe('remapVariableRefsInOverlay', () => {
  it('rewires overlay.visible_variable_id + nested widget refs', () => {
    const source: AppOverlay = {
      id: 'ov',
      name: 'X',
      overlay_type: 'modal',
      visible_variable_id: 'show_drawer',
      layout,
      widgets: [widget({ id: 'w1', props: { source_variable_id: 'trail-set' } })],
      sections: [],
    };
    const remapped = remapVariableRefsInOverlay(source, {
      show_drawer: 'show_drawer-NEW',
      'trail-set': 'trail-set-NEW',
    });
    expect(remapped.visible_variable_id).toBe('show_drawer-NEW');
    expect(remapped.widgets?.[0].props.source_variable_id).toBe('trail-set-NEW');
  });
});

import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { AppSection, PageLayout } from '@/lib/api/apps';

import {
  augmentRuntimeParametersForLoopItem,
  isSectionDropZone,
  readDropPayload,
  resolveColumns,
  resolveLayoutKind,
  resolveSectionStyling,
  SectionRenderer,
  sortByPosition,
} from './SectionRenderer';

const ctx = {
  globalFilter: '',
  runtimeParameters: {},
  interactivePromptSeed: '',
  primaryInteractiveAgentWidgetId: null,
  onAction: async () => undefined,
};

function emptySection(overrides: Partial<AppSection>): AppSection {
  return {
    id: overrides.id ?? 'sec',
    title: overrides.title,
    description: overrides.description,
    layout:
      overrides.layout ?? ({ kind: 'grid', columns: 12, gap: '1rem', max_width: '' } as PageLayout),
    widgets: overrides.widgets ?? [],
    sections: overrides.sections ?? [],
    visible: overrides.visible,
    props: overrides.props,
  };
}

describe('resolveLayoutKind', () => {
  it('defaults to grid when missing or blank', () => {
    expect(resolveLayoutKind(undefined)).toBe('grid');
    expect(resolveLayoutKind(null)).toBe('grid');
    expect(resolveLayoutKind({ kind: '' } as PageLayout)).toBe('grid');
    expect(resolveLayoutKind({ kind: '   ' } as PageLayout)).toBe('grid');
  });

  it('accepts the six Foundry-parity kinds plus grid', () => {
    for (const kind of ['grid', 'columns', 'rows', 'tabs', 'flow', 'toolbar', 'loop']) {
      expect(resolveLayoutKind({ kind } as PageLayout)).toBe(kind);
    }
  });

  it('falls back to grid for unknown kinds', () => {
    expect(resolveLayoutKind({ kind: 'pyramid' } as PageLayout)).toBe('grid');
  });
});

describe('resolveColumns', () => {
  it('clamps to [1, 24] and defaults to 12 when invalid', () => {
    expect(resolveColumns(undefined)).toBe(12);
    expect(resolveColumns({ columns: 0 } as PageLayout)).toBe(12);
    expect(resolveColumns({ columns: -5 } as PageLayout)).toBe(12);
    expect(resolveColumns({ columns: 50 } as PageLayout)).toBe(24);
    expect(resolveColumns({ columns: 8 } as PageLayout)).toBe(8);
    expect(resolveColumns({ columns: Number.NaN } as unknown as PageLayout)).toBe(12);
  });
});

describe('sortByPosition', () => {
  it('orders top-to-bottom, then left-to-right', () => {
    const items = [
      { id: 'a', position: { x: 4, y: 1 } },
      { id: 'b', position: { x: 0, y: 0 } },
      { id: 'c', position: { x: 8, y: 0 } },
      { id: 'd', position: { x: 0, y: 1 } },
    ];
    expect(sortByPosition(items).map((item) => item.id)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('treats missing position as origin', () => {
    const items = [{ id: 'a' }, { id: 'b', position: { x: 1, y: 0 } }, { id: 'c' }];
    const result = sortByPosition(items).map((item) => item.id);
    // 'a' and 'c' both at (0,0); 'b' at (1,0) — stable sort keeps a,c before b.
    expect(result).toEqual(['a', 'c', 'b']);
  });
});

describe('SectionRenderer', () => {
  it('returns null when section.visible is explicitly false', () => {
    const html = renderToString(
      <SectionRenderer section={emptySection({ id: 'hidden', visible: false })} {...ctx} />,
    );
    expect(html).toBe('');
  });

  it('renders columns sections with flex-row body and a data attribute', () => {
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'main',
          title: 'Filters and table',
          layout: { kind: 'columns', columns: 12, gap: '12px', max_width: '' } as PageLayout,
        })}
        {...ctx}
      />,
    );
    expect(html).toContain('of-app-section--columns');
    expect(html).toContain('data-section-kind="columns"');
    expect(html).toContain('data-section-id="main"');
    expect(html).toContain('flex-direction:row');
    expect(html).toContain('Filters and table');
  });

  it('renders rows sections with flex-column body and scrolling when requested', () => {
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'stack',
          layout: {
            kind: 'rows',
            columns: 12,
            gap: '8px',
            max_width: '',
            scrollable: true,
          } as PageLayout,
        })}
        {...ctx}
      />,
    );
    expect(html).toContain('of-app-section--rows');
    expect(html).toContain('flex-direction:column');
    expect(html).toContain('overflow-y:auto');
  });

  it('still falls back to grid display for unknown kinds via resolveLayoutKind', () => {
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'unknown-kind',
          layout: { kind: 'pyramid', columns: 6, gap: '1rem', max_width: '' } as PageLayout,
        })}
        {...ctx}
      />,
    );
    // resolveLayoutKind reclassifies unknown kinds as grid, so the data
    // attribute reflects that — there is no longer any kind that renders
    // a `--unknown` class.
    expect(html).toContain('of-app-section--grid');
    expect(html).toContain('data-section-kind="grid"');
    expect(html).toContain('display:grid');
    expect(html).toContain('grid-template-columns:repeat(6, minmax(0, 1fr))');
  });

  it('renders flow sections as an always-scrolling vertical container', () => {
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'long',
          layout: { kind: 'flow', columns: 12, gap: '12px', max_width: '' } as PageLayout,
        })}
        {...ctx}
      />,
    );
    expect(html).toContain('of-app-section--flow');
    expect(html).toContain('data-section-kind="flow"');
    expect(html).toContain('flex-direction:column');
    expect(html).toContain('overflow-y:auto');
    expect(html).toContain('height:100%');
  });

  it('renders toolbar sections as a wrapping horizontal strip with tight defaults', () => {
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'bar',
          layout: { kind: 'toolbar', columns: 12, gap: '', max_width: '' } as PageLayout,
        })}
        {...ctx}
      />,
    );
    expect(html).toContain('of-app-section--toolbar');
    expect(html).toContain('data-section-kind="toolbar"');
    expect(html).toContain('flex-direction:row');
    expect(html).toContain('flex-wrap:wrap');
    expect(html).toContain('align-items:center');
    // Default gap for toolbar is 8px when not otherwise specified.
    expect(html).toMatch(/gap:8px/);
  });

  it('respects a custom gap on toolbar sections', () => {
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'bar-custom-gap',
          layout: { kind: 'toolbar', columns: 12, gap: '20px', max_width: '' } as PageLayout,
        })}
        {...ctx}
      />,
    );
    expect(html).toContain('gap:20px');
  });

  it('renders nested sections recursively', () => {
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'outer',
          layout: { kind: 'columns', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
          sections: [
            emptySection({
              id: 'left',
              layout: { kind: 'rows', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
            }),
            emptySection({
              id: 'right',
              layout: { kind: 'grid', columns: 4, gap: '1rem', max_width: '' } as PageLayout,
            }),
          ],
        })}
        {...ctx}
      />,
    );
    expect(html).toContain('data-section-id="outer"');
    expect(html).toContain('data-section-id="left"');
    expect(html).toContain('data-section-id="right"');
    expect(html).toContain('of-app-section--rows');
    expect(html).toContain('of-app-section--grid');
  });

  it('shows an empty-state hint when there are no widgets or nested sections', () => {
    const html = renderToString(
      <SectionRenderer section={emptySection({ id: 'empty' })} {...ctx} />,
    );
    expect(html).toContain('No content in this section.');
  });
});

describe('SectionRenderer tabs layout', () => {
  it('renders one tab button per visible child section with aria attributes', () => {
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'tabbed',
          layout: { kind: 'tabs', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
          sections: [
            emptySection({ id: 'overview', title: 'Overview' }),
            emptySection({ id: 'details', title: 'Details' }),
            emptySection({ id: 'settings', title: 'Settings' }),
          ],
        })}
        {...ctx}
      />,
    );
    expect(html).toContain('of-app-section--tabs');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('data-tab-id="overview"');
    expect(html).toContain('data-tab-id="details"');
    expect(html).toContain('data-tab-id="settings"');
    expect(html).toContain('aria-controls="of-tabpanel-overview"');
  });

  it('marks the first visible tab active and renders its panel only', () => {
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'tabbed',
          layout: { kind: 'tabs', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
          sections: [
            emptySection({ id: 'first', title: 'First' }),
            emptySection({ id: 'second', title: 'Second' }),
          ],
        })}
        {...ctx}
      />,
    );
    // The active tab's panel is rendered; the inactive one is not in the DOM.
    expect(html).toContain('id="of-tabpanel-first"');
    expect(html).not.toContain('id="of-tabpanel-second"');
    // The active tab button advertises aria-selected="true"; the inactive one
    // advertises "false". renderToString emits the attribute literally.
    expect(html).toMatch(/data-tab-id="first"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-tab-id="first"/);
    expect(html).toMatch(/data-tab-id="second"[^>]*aria-selected="false"|aria-selected="false"[^>]*data-tab-id="second"/);
  });

  it('skips tabs whose visible flag is false', () => {
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'tabbed',
          layout: { kind: 'tabs', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
          sections: [
            emptySection({ id: 'visible-1', title: 'Visible' }),
            emptySection({ id: 'hidden', title: 'Hidden', visible: false }),
            emptySection({ id: 'visible-2', title: 'Also visible' }),
          ],
        })}
        {...ctx}
      />,
    );
    expect(html).toContain('data-tab-id="visible-1"');
    expect(html).not.toContain('data-tab-id="hidden"');
    expect(html).toContain('data-tab-id="visible-2"');
  });

  it('falls back to "Tab N" labels when a child section has no title', () => {
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'tabbed',
          layout: { kind: 'tabs', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
          sections: [
            emptySection({ id: 'a' }),
            emptySection({ id: 'b', title: '   ' }),
          ],
        })}
        {...ctx}
      />,
    );
    expect(html).toContain('>Tab 1<');
    expect(html).toContain('>Tab 2<');
  });

  it('shows an empty hint when the tabs section has no child sections', () => {
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'empty-tabs',
          layout: { kind: 'tabs', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
        })}
        {...ctx}
      />,
    );
    expect(html).toContain('No tabs in this section.');
    expect(html).not.toContain('role="tablist"');
  });
});

describe('augmentRuntimeParametersForLoopItem', () => {
  it('preserves base parameters and adds item_index', () => {
    const out = augmentRuntimeParametersForLoopItem({ user_id: '42' }, 'apple', 0);
    expect(out.user_id).toBe('42');
    expect(out.item_index).toBe('0');
    expect(out.item).toBe('apple');
  });

  it('flattens object items into item.<key> entries (one level deep)', () => {
    const out = augmentRuntimeParametersForLoopItem(
      {},
      { id: 'trail-1', label: 'Mesa Trail', miles: 6.07 },
      2,
    );
    expect(out.item_index).toBe('2');
    expect(out['item.id']).toBe('trail-1');
    expect(out['item.label']).toBe('Mesa Trail');
    expect(out['item.miles']).toBe('6.07');
  });

  it('JSON-stringifies nested object values rather than dropping them', () => {
    const out = augmentRuntimeParametersForLoopItem(
      {},
      { id: 'x', tags: ['a', 'b'], meta: { kind: 'pin' } },
      0,
    );
    expect(out['item.tags']).toBe('["a","b"]');
    expect(out['item.meta']).toBe('{"kind":"pin"}');
  });

  it('skips null and undefined values without throwing', () => {
    const out = augmentRuntimeParametersForLoopItem(
      {},
      { id: 'x', label: null, miles: undefined },
      0,
    );
    expect(out['item.id']).toBe('x');
    expect(out['item.label']).toBeUndefined();
    expect(out['item.miles']).toBeUndefined();
  });
});

describe('SectionRenderer loop layout', () => {
  it('renders one .of-app-section__loop-item per entry in props.loop_items', () => {
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'feed',
          layout: { kind: 'loop', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
          props: { loop_items: ['a', 'b', 'c'] },
        })}
        {...ctx}
      />,
    );
    expect(html).toContain('of-app-section--loop');
    expect(html).toContain('data-section-kind="loop"');
    expect(html).toContain('data-loop-index="0"');
    expect(html).toContain('data-loop-index="1"');
    expect(html).toContain('data-loop-index="2"');
    expect(html).not.toContain('data-loop-index="3"');
  });

  it('shows a configurable empty-state message when loop_items is empty or missing', () => {
    const empty = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'empty',
          layout: { kind: 'loop', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
          props: { loop_items: [], loop_empty_message: 'Nothing in the queue.' },
        })}
        {...ctx}
      />,
    );
    expect(empty).toContain('Nothing in the queue.');

    const missing = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'missing',
          layout: { kind: 'loop', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
          props: {},
        })}
        {...ctx}
      />,
    );
    expect(missing).toContain('No items to loop over.');
  });

  it('caps iterations at loop_max_items (default 100)', () => {
    const items = Array.from({ length: 250 }, (_, idx) => `item-${idx}`);
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'capped',
          layout: { kind: 'loop', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
          props: { loop_items: items },
        })}
        {...ctx}
      />,
    );
    const matches = html.match(/data-loop-index="/g) ?? [];
    expect(matches.length).toBe(100);
  });

  it('honors an explicit loop_max_items cap', () => {
    const items = Array.from({ length: 10 }, (_, idx) => `item-${idx}`);
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'cap-3',
          layout: { kind: 'loop', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
          props: { loop_items: items, loop_max_items: 3 },
        })}
        {...ctx}
      />,
    );
    const matches = html.match(/data-loop-index="/g) ?? [];
    expect(matches.length).toBe(3);
  });
});

describe('resolveSectionStyling', () => {
  it('defaults header format to block with no extra classes when no props given', () => {
    const out = resolveSectionStyling(undefined);
    expect(out.headerFormat).toBe('block');
    expect(out.classNames).toEqual(['of-app-section--header-block']);
    expect(out.style).toEqual({});
  });

  it('honors header_format / border_style / padding presets', () => {
    const out = resolveSectionStyling({
      header_format: 'floating',
      border_style: 'outer-shadow',
      padding: 'regular',
    });
    expect(out.headerFormat).toBe('floating');
    expect(out.classNames).toEqual(
      expect.arrayContaining([
        'of-app-section--header-floating',
        'of-app-section--border-outer-shadow',
        'of-app-section--padding-regular',
      ]),
    );
    expect(out.style).toEqual({});
  });

  it('maps preset backgrounds to classes and raw hex/css to inline style', () => {
    const presets = resolveSectionStyling({ background_color: 'gray-3' });
    expect(presets.classNames).toContain('of-app-section--bg-gray-3');
    expect(presets.style.background).toBeUndefined();

    const hex = resolveSectionStyling({ background_color: '#abcdef' });
    expect(hex.classNames).not.toContain('of-app-section--bg-#abcdef');
    expect(hex.style.background).toBe('#abcdef');

    const transparent = resolveSectionStyling({ background_color: 'transparent' });
    expect(transparent.classNames).toContain('of-app-section--bg-transparent');
  });

  it('emits inline padding for custom mode and omits the preset class', () => {
    const out = resolveSectionStyling({
      padding: 'custom',
      padding_custom: { top: 10, right: 20, bottom: 30, left: 40 },
    });
    expect(out.classNames).not.toContain('of-app-section--padding-custom');
    expect(out.style.padding).toBe('10px 20px 30px 40px');
  });

  it('rejects negative padding values and invalid enums', () => {
    const out = resolveSectionStyling({
      padding: 'custom',
      padding_custom: { top: -5, right: 20 },
      header_format: 'sparkly',
      border_style: 'doubled',
    });
    expect(out.headerFormat).toBe('block');
    expect(out.classNames.some((c) => c.startsWith('of-app-section--border-'))).toBe(false);
    // Negative `top` is dropped, only `right` kept and others default to 0.
    expect(out.style.padding).toBe('0px 20px 0px 0px');
  });
});

describe('SectionRenderer styling', () => {
  it('renders header_format=contained with header rendered inside the body container', () => {
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'contained',
          title: 'Inside the body',
          layout: { kind: 'grid', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
          props: { header_format: 'contained' },
        })}
        {...ctx}
      />,
    );
    expect(html).toContain('of-app-section--header-contained');
    // The header should appear AFTER the opening of __body — i.e. nested
    // inside the body div, not above it.
    const bodyStart = html.indexOf('of-app-section__body');
    const headerStart = html.indexOf('of-app-section__header');
    expect(bodyStart).toBeGreaterThan(0);
    expect(headerStart).toBeGreaterThan(bodyStart);
  });

  it('renders header_format=block (default) with header before the body', () => {
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'blocky',
          title: 'Header above',
          layout: { kind: 'grid', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
        })}
        {...ctx}
      />,
    );
    expect(html).toContain('of-app-section--header-block');
    const bodyStart = html.indexOf('of-app-section__body');
    const headerStart = html.indexOf('of-app-section__header');
    expect(headerStart).toBeGreaterThan(0);
    expect(headerStart).toBeLessThan(bodyStart);
  });

  it('applies border + padding + bg classes to the section element', () => {
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'styled',
          layout: { kind: 'grid', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
          props: {
            border_style: 'bordered',
            padding: 'compact',
            background_color: 'gray-2',
          },
        })}
        {...ctx}
      />,
    );
    expect(html).toContain('of-app-section--border-bordered');
    expect(html).toContain('of-app-section--padding-compact');
    expect(html).toContain('of-app-section--bg-gray-2');
  });

  it('applies inline background style for raw hex values', () => {
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'hex',
          layout: { kind: 'grid', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
          props: { background_color: '#0f172a' },
        })}
        {...ctx}
      />,
    );
    expect(html).toMatch(/background:#0f172a|background-color:#0f172a/);
  });

  it('falls back to default block layout on tabs/loop regardless of header_format', () => {
    // Tabs+loop must ignore header_format=contained because their bodies are
    // not single containers; the contained-mode rendering only kicks in for
    // grid/columns/rows/flow/toolbar.
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'tabs-contained',
          title: 'Ignored?',
          layout: { kind: 'tabs', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
          props: { header_format: 'contained' },
          sections: [emptySection({ id: 't1', title: 'One' })],
        })}
        {...ctx}
      />,
    );
    const tablistAt = html.indexOf('role="tablist"');
    const headerAt = html.indexOf('of-app-section__header');
    expect(headerAt).toBeGreaterThan(0);
    expect(tablistAt).toBeGreaterThan(0);
    expect(headerAt).toBeLessThan(tablistAt);
  });
});

describe('Blueprint background presets', () => {
  it.each([
    'red-3',
    'orange-3',
    'yellow-3',
    'green-3',
    'turquoise-3',
    'cerulean-3',
    'blue-3',
    'indigo-3',
    'violet-3',
    'magenta-3',
  ] as const)('treats %s as a preset class, not an inline hex', (preset) => {
    const out = resolveSectionStyling({ background_color: preset });
    expect(out.classNames).toContain(`of-app-section--bg-${preset}`);
    expect(out.style.background).toBeUndefined();
  });
});

describe('isSectionDropZone', () => {
  it('returns true when drop_zone or drop_handling prop is true', () => {
    expect(isSectionDropZone({ drop_zone: true })).toBe(true);
    expect(isSectionDropZone({ drop_handling: true })).toBe(true);
    expect(isSectionDropZone({ drop_zone: false })).toBe(false);
    expect(isSectionDropZone({})).toBe(false);
    expect(isSectionDropZone(undefined)).toBe(false);
  });
});

describe('readDropPayload', () => {
  function makeDT(entries: Record<string, string>): DataTransfer {
    return {
      types: Object.keys(entries),
      getData: (key: string) => entries[key] ?? '',
    } as unknown as DataTransfer;
  }

  it('parses application/json when present', () => {
    const dt = makeDT({ 'application/json': '{"id":"trail-1","label":"Mesa"}' });
    const out = readDropPayload(dt);
    expect(out.data).toEqual({ id: 'trail-1', label: 'Mesa' });
    expect(out.raw_text).toBe('{"id":"trail-1","label":"Mesa"}');
    expect(out.drag_types).toEqual(['application/json']);
  });

  it('falls back to text/plain parsed as JSON when application/json is missing', () => {
    const dt = makeDT({ 'text/plain': '{"a":1}' });
    const out = readDropPayload(dt);
    expect(out.data).toEqual({ a: 1 });
    expect(out.drag_types).toEqual(['text/plain']);
  });

  it('returns raw text when text/plain is not valid JSON', () => {
    const dt = makeDT({ 'text/plain': 'just a string' });
    const out = readDropPayload(dt);
    expect(out.data).toBe('just a string');
    expect(out.raw_text).toBe('just a string');
  });

  it('returns nulls when no data is available', () => {
    expect(readDropPayload(null)).toEqual({ data: null, raw_text: '', drag_types: [] });
    expect(readDropPayload(undefined)).toEqual({ data: null, raw_text: '', drag_types: [] });
    const empty = readDropPayload(makeDT({}));
    expect(empty.data).toBeNull();
    expect(empty.raw_text).toBe('');
  });
});

describe('SectionRenderer drop zone rendering', () => {
  it('adds drop-zone class and data-drop-zone attribute when configured', () => {
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'dropper',
          layout: { kind: 'grid', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
          props: { drop_zone: true },
        })}
        {...ctx}
      />,
    );
    expect(html).toContain('of-app-section--drop-zone');
    expect(html).toContain('data-drop-zone="true"');
    // Initially the section is not the active drop target.
    expect(html).toContain('data-drop-target="false"');
  });

  it('does not add drop-zone class when not configured', () => {
    const html = renderToString(
      <SectionRenderer
        section={emptySection({
          id: 'no-drop',
          layout: { kind: 'grid', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
        })}
        {...ctx}
      />,
    );
    expect(html).not.toContain('of-app-section--drop-zone');
    expect(html).not.toContain('data-drop-zone');
  });
});

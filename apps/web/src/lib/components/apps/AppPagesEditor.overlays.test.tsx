import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { AppOverlay, AppPage } from '@/lib/api/apps';

import {
  addOverlayToPage,
  defaultOverlay,
  duplicateOverlayInPage,
  OverlayInspector,
  PagesOutline,
  patchOverlayInPage,
  removeOverlayFromPage,
} from './AppPagesEditor';

const blankPage: AppPage = {
  id: 'p1',
  name: 'Main',
  path: '/',
  description: '',
  layout: { kind: 'grid', columns: 12, gap: '1rem', max_width: '1280px' },
  widgets: [],
  visible: true,
};

function makeOverlay(overrides: Partial<AppOverlay> = {}): AppOverlay {
  return {
    id: 'ov1',
    name: 'Detail',
    overlay_type: 'drawer',
    layout: { kind: 'grid', columns: 12, gap: '1rem', max_width: '' },
    widgets: [],
    sections: [],
    props: {},
    events: [],
    ...overrides,
  };
}

describe('defaultOverlay', () => {
  it('returns a drawer with sensible defaults and a seed text widget', () => {
    const overlay = defaultOverlay();
    expect(overlay.overlay_type).toBe('drawer');
    expect(overlay.name).toBe('New overlay');
    expect(overlay.widgets ?? []).toHaveLength(1);
    expect((overlay.props as Record<string, unknown>).position).toBe('right');
    expect((overlay.props as Record<string, unknown>).size).toBe(360);
    expect((overlay.props as Record<string, unknown>).header_enabled).toBe(true);
    expect((overlay.props as Record<string, unknown>).close_on_backdrop_click).toBe(true);
  });
});

describe('addOverlayToPage', () => {
  it('appends the overlay only to the matching page', () => {
    const pages: AppPage[] = [
      { ...blankPage, id: 'p1', overlays: [] },
      { ...blankPage, id: 'p2', overlays: [makeOverlay({ id: 'ov0' })] },
    ];
    const overlay = makeOverlay({ id: 'new-ov', name: 'Detail drawer' });
    const next = addOverlayToPage(pages, 'p1', overlay);
    expect(next[0].overlays).toEqual([overlay]);
    expect(next[1].overlays?.map((o) => o.id)).toEqual(['ov0']);
  });

  it('initialises overlays array when the page had none', () => {
    const pages: AppPage[] = [{ ...blankPage, id: 'p1' }];
    const overlay = makeOverlay({ id: 'first' });
    const next = addOverlayToPage(pages, 'p1', overlay);
    expect(next[0].overlays).toEqual([overlay]);
  });
});

describe('removeOverlayFromPage', () => {
  it('removes only the matching overlay', () => {
    const pages: AppPage[] = [
      {
        ...blankPage,
        id: 'p1',
        overlays: [makeOverlay({ id: 'a' }), makeOverlay({ id: 'b' })],
      },
    ];
    const next = removeOverlayFromPage(pages, 'p1', 'a');
    expect(next[0].overlays?.map((o) => o.id)).toEqual(['b']);
  });
});

describe('patchOverlayInPage', () => {
  it('merges the patch into the targeted overlay only', () => {
    const pages: AppPage[] = [
      {
        ...blankPage,
        id: 'p1',
        overlays: [makeOverlay({ id: 'a', name: 'Original' }), makeOverlay({ id: 'b', name: 'Untouched' })],
      },
    ];
    const next = patchOverlayInPage(pages, 'p1', 'a', { name: 'Renamed' });
    expect(next[0].overlays?.[0].name).toBe('Renamed');
    expect(next[0].overlays?.[1].name).toBe('Untouched');
  });
});

describe('duplicateOverlayInPage', () => {
  it('returns the source pages unchanged when overlay id is unknown', () => {
    const pages: AppPage[] = [{ ...blankPage, id: 'p1', overlays: [] }];
    const result = duplicateOverlayInPage(pages, 'p1', 'missing');
    expect(result.pages).toBe(pages);
    expect(result.newId).toBe('');
  });

  it('produces a new id and copies the source overlay with " copy" suffix', () => {
    const pages: AppPage[] = [
      {
        ...blankPage,
        id: 'p1',
        overlays: [
          makeOverlay({
            id: 'a',
            name: 'Detail',
            widgets: [
              {
                id: 'w1',
                widget_type: 'text',
                title: '',
                description: '',
                position: { x: 0, y: 0, width: 12, height: 1 },
                props: { content: 'hi' },
                binding: null,
                events: [],
                children: [],
              },
            ],
          }),
        ],
      },
    ];
    const result = duplicateOverlayInPage(pages, 'p1', 'a');
    expect(result.newId).not.toBe('');
    expect(result.newId).not.toBe('a');
    const overlays = result.pages[0].overlays ?? [];
    expect(overlays).toHaveLength(2);
    expect(overlays[1].name).toBe('Detail copy');
    // Widgets must have fresh ids to avoid collisions.
    expect(overlays[1].widgets?.[0].id).not.toBe('w1');
  });
});

const noop = () => undefined;

describe('PagesOutline renders an overlay sub-section', () => {
  it('shows the Overlays group with an Add button when the page is selected', () => {
    const page: AppPage = {
      ...blankPage,
      id: 'p1',
      overlays: [makeOverlay({ id: 'a', name: 'Detail drawer' })],
    };
    const html = renderToString(
      <PagesOutline
        pages={[page]}
        selectedPageId="p1"
        selectedWidgetId=""
        selectedOverlayId="a"
        onSelectPage={noop}
        onSelectWidget={noop}
        onAddPage={noop}
        onDuplicatePage={noop}
        onDeletePage={noop}
        onAddOverlay={noop}
        onSelectOverlay={noop}
        onDuplicateOverlay={noop}
        onDeleteOverlay={noop}
      />,
    );
    expect(html).toContain('data-testid="overlays-outline-p1"');
    expect(html).toContain('data-testid="overlay-add-p1"');
    expect(html).toContain('data-testid="overlay-row-a"');
    expect(html).toContain('Detail drawer');
    expect(html).toContain('data-testid="overlay-duplicate"');
    expect(html).toContain('data-testid="overlay-delete"');
  });

  it('hides the overlays group when the onAddOverlay handler is not provided (backward compat)', () => {
    const html = renderToString(
      <PagesOutline
        pages={[{ ...blankPage, id: 'p1', overlays: [makeOverlay({ id: 'a' })] }]}
        selectedPageId="p1"
        selectedWidgetId=""
        onSelectPage={noop}
        onSelectWidget={noop}
        onAddPage={noop}
        onDuplicatePage={noop}
        onDeletePage={noop}
      />,
    );
    expect(html).not.toContain('data-testid="overlays-outline-p1"');
  });
});

describe('OverlayInspector renders all property knobs', () => {
  it('renders name / type / visible variable / position / size inputs', () => {
    const overlay = makeOverlay({
      id: 'a',
      name: 'Detail',
      overlay_type: 'drawer',
      visible_variable_id: 'show_drawer',
      props: { position: 'left', size: 420, header_enabled: true, header_title: 'Detail', header_icon: '★' },
    });
    const html = renderToString(
      <OverlayInspector overlay={overlay} onPatch={noop} onDuplicate={noop} onDelete={noop} />,
    );
    expect(html).toContain('data-testid="overlay-inspector"');
    expect(html).toContain('data-testid="overlay-name-input"');
    expect(html).toContain('data-testid="overlay-type-select"');
    expect(html).toContain('data-testid="overlay-visible-var-input"');
    expect(html).toContain('data-testid="overlay-position-select"');
    expect(html).toContain('data-testid="overlay-size-input"');
    expect(html).toContain('data-testid="overlay-header-enabled"');
    expect(html).toContain('data-testid="overlay-header-title-input"');
    expect(html).toContain('data-testid="overlay-header-icon-input"');
    expect(html).toContain('data-testid="overlay-show-backdrop"');
    expect(html).toContain('data-testid="overlay-close-on-backdrop"');
    expect(html).toContain('data-testid="overlay-backdrop-opacity-input"');
    expect(html).toMatch(/value="420"/);
    expect(html).toMatch(/value="show_drawer"/);
  });

  it('hides drawer-only fields when the overlay is a modal', () => {
    const overlay = makeOverlay({ id: 'a', overlay_type: 'modal' });
    const html = renderToString(
      <OverlayInspector overlay={overlay} onPatch={noop} onDuplicate={noop} onDelete={noop} />,
    );
    expect(html).not.toContain('data-testid="overlay-position-select"');
    // Header / backdrop fields are still present for modals.
    expect(html).toContain('data-testid="overlay-header-enabled"');
    expect(html).toContain('data-testid="overlay-show-backdrop"');
  });
});

import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AppHeader, readHeaderConfig, resolveLogoMode, type AppHeaderConfig } from './AppHeader';

const baseProps = {
  fallbackTitle: 'My App',
  fallbackSubtitle: 'My subtitle',
  fallbackLogoUrl: null,
  appId: 'app-1',
  publishedVersionNumber: 1,
  publishedAt: '2026-05-11T00:00:00Z',
  embed: null,
  primaryCtaUrl: '',
  primaryCtaLabel: '',
  formatDate: (value: string | null | undefined) => value ?? '',
};

describe('readHeaderConfig', () => {
  it('returns an empty config for non-object inputs', () => {
    expect(readHeaderConfig(undefined)).toEqual({});
    expect(readHeaderConfig(null)).toEqual({});
    expect(readHeaderConfig(42)).toEqual({});
    expect(readHeaderConfig('nope')).toEqual({});
  });

  it('coerces and ignores unknown fields safely', () => {
    const cfg = readHeaderConfig({
      enabled: true,
      title: 'Custom',
      title_color: '#abcdef',
      logo_mode: 'icon',
      icon: '✈️',
      icon_color: '#ff0000',
      orientation: 'vertical',
      width: 240,
      height: '99',
      collapsible: true,
      collapsed_by_default: true,
      collapsed_image_url: 'https://cdn/x.png',
      favoriting_enabled: true,
      background_color: '#222',
      logo_position: 'top',
      image_height: 40,
      image_url: 'https://cdn/y.png',
      total_garbage: { wat: true },
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.title).toBe('Custom');
    expect(cfg.title_color).toBe('#abcdef');
    expect(cfg.logo_mode).toBe('icon');
    expect(cfg.icon).toBe('✈️');
    expect(cfg.orientation).toBe('vertical');
    expect(cfg.width).toBe(240);
    expect(cfg.height).toBe(99);
    expect(cfg.collapsible).toBe(true);
    expect(cfg.collapsed_image_url).toBe('https://cdn/x.png');
    expect(cfg.logo_position).toBe('top');
  });

  it('drops invalid enum values to undefined', () => {
    const cfg = readHeaderConfig({
      logo_mode: 'sparkle',
      orientation: 'diagonal',
      logo_position: 'middle',
    });
    expect(cfg.logo_mode).toBeUndefined();
    expect(cfg.orientation).toBeUndefined();
    expect(cfg.logo_position).toBeUndefined();
  });
});

describe('resolveLogoMode', () => {
  it('honors an explicit logo_mode', () => {
    expect(resolveLogoMode({ logo_mode: 'none' }, 'https://x/y.png')).toBe('none');
    expect(resolveLogoMode({ logo_mode: 'icon', icon: 'a' }, null)).toBe('icon');
  });

  it('infers image when image_url present, icon when icon present, fallback otherwise', () => {
    expect(resolveLogoMode({ image_url: 'https://x/y.png' }, null)).toBe('image');
    expect(resolveLogoMode({ icon: '★' }, null)).toBe('icon');
    expect(resolveLogoMode({}, 'https://x/y.png')).toBe('image');
    expect(resolveLogoMode({}, null)).toBe('none');
  });
});

describe('AppHeader rendering', () => {
  it('renders default horizontal header with fallback title and logo url', () => {
    const html = renderToString(
      <AppHeader
        {...baseProps}
        config={{}}
        fallbackLogoUrl="https://cdn/example.png"
      />,
    );
    expect(html).toContain('data-orientation="horizontal"');
    expect(html).toContain('data-collapsed="false"');
    expect(html).toContain('of-app-runtime__header--horizontal');
    expect(html).toContain('My App');
    expect(html).toContain('My subtitle');
    expect(html).toContain('src="https://cdn/example.png"');
    // React SSR splits adjacent text/expression with a comment marker.
    expect(html).toMatch(/<span class="of-chip">v(?:<!-- -->)?1<\/span>/);
  });

  it('returns null when config.enabled is false', () => {
    const html = renderToString(
      <AppHeader {...baseProps} config={{ enabled: false }} />,
    );
    expect(html).toBe('');
  });

  it('renders icon-mode logo with custom icon color', () => {
    const html = renderToString(
      <AppHeader
        {...baseProps}
        config={{ logo_mode: 'icon', icon: '★', icon_color: '#ff5500' }}
      />,
    );
    expect(html).toContain('data-icon="★"');
    expect(html).toMatch(/color:#ff5500|color: ?#ff5500/);
    expect(html).not.toContain('<img');
  });

  it('applies custom title color and background color', () => {
    const config: AppHeaderConfig = {
      title: 'Mission Control',
      title_color: '#10b981',
      background_color: '#0f172a',
    };
    const html = renderToString(<AppHeader {...baseProps} config={config} />);
    expect(html).toContain('Mission Control');
    // The title color sits on the h2, background sits on the header element.
    expect(html).toMatch(/style="color:#10b981"/);
    expect(html).toMatch(/background:#0f172a|background-color:#0f172a/);
  });

  it('renders vertical orientation with configured width and brand stacked', () => {
    const html = renderToString(
      <AppHeader
        {...baseProps}
        config={{ orientation: 'vertical', width: 240 }}
      />,
    );
    expect(html).toContain('data-orientation="vertical"');
    expect(html).toContain('of-app-runtime__header--vertical');
    expect(html).toMatch(/width:240px/);
  });

  it('renders collapsible vertical header with collapsed-by-default initial state', () => {
    const html = renderToString(
      <AppHeader
        {...baseProps}
        appId="app-collapsed-initial"
        config={{
          orientation: 'vertical',
          collapsible: true,
          collapsed_by_default: true,
        }}
      />,
    );
    expect(html).toContain('data-collapsed="true"');
    expect(html).toContain('is-collapsed');
    // The brand text block is removed entirely when collapsed.
    expect(html).not.toContain('My subtitle');
    // The collapse-toggle button is present with aria-expanded reflecting state.
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-testid="app-header-collapse-toggle"');
  });

  it('uses collapsed_image_url when present and collapsed in vertical mode', () => {
    const html = renderToString(
      <AppHeader
        {...baseProps}
        appId="app-collapsed-img"
        config={{
          orientation: 'vertical',
          collapsible: true,
          collapsed_by_default: true,
          image_url: 'https://cdn/full.png',
          collapsed_image_url: 'https://cdn/tiny.png',
          logo_mode: 'image',
        }}
      />,
    );
    expect(html).toContain('src="https://cdn/tiny.png"');
    expect(html).not.toContain('src="https://cdn/full.png"');
  });

  it('shows the favoriting button only when favoriting_enabled is true', () => {
    const off = renderToString(
      <AppHeader {...baseProps} config={{}} />,
    );
    expect(off).not.toContain('data-testid="app-header-favorite"');

    const on = renderToString(
      <AppHeader {...baseProps} config={{ favoriting_enabled: true }} />,
    );
    expect(on).toContain('data-testid="app-header-favorite"');
    // Initial state (no localStorage entry in SSR) is "not favorited".
    expect(on).toContain('☆');
    expect(on).toContain('aria-pressed="false"');
  });

  it('does NOT render a collapse toggle when orientation is horizontal even with collapsible=true', () => {
    const html = renderToString(
      <AppHeader
        {...baseProps}
        config={{ orientation: 'horizontal', collapsible: true }}
      />,
    );
    expect(html).not.toContain('app-header-collapse-toggle');
  });

  it('respects logo_position via class hook', () => {
    const html = renderToString(
      <AppHeader
        {...baseProps}
        config={{ logo_position: 'center' }}
      />,
    );
    expect(html).toContain('of-app-runtime__header--logo-center');
  });

  it('renders header widgets when configured AND onAction is provided', () => {
    const html = renderToString(
      <AppHeader
        {...baseProps}
        config={{
          widgets: [
            {
              id: 'hw1',
              widget_type: 'text',
              title: '',
              description: '',
              position: { x: 0, y: 0, width: 4, height: 1 },
              props: { content: 'Header widget body' },
              binding: null,
              events: [],
              children: [],
            },
          ],
        }}
        onAction={async () => undefined}
      />,
    );
    expect(html).toContain('data-testid="app-header-widgets"');
    expect(html).toContain('data-widget-id="hw1"');
  });

  it('omits the header widgets container when no widgets are configured', () => {
    const html = renderToString(<AppHeader {...baseProps} config={{}} onAction={async () => undefined} />);
    expect(html).not.toContain('data-testid="app-header-widgets"');
  });

  it('omits the header widgets container when widgets are present but onAction is missing', () => {
    const html = renderToString(
      <AppHeader
        {...baseProps}
        config={{
          widgets: [
            {
              id: 'hw1', widget_type: 'text', title: '', description: '',
              position: { x: 0, y: 0, width: 4, height: 1 }, props: {}, binding: null, events: [], children: [],
            },
          ],
        }}
      />,
    );
    // Without an onAction dispatcher the renderer can't safely wire events;
    // we skip rendering rather than mounting widgets that would silently
    // drop interactions.
    expect(html).not.toContain('data-testid="app-header-widgets"');
  });
});

describe('readHeaderConfig widgets parsing', () => {
  it('parses a valid widgets array', () => {
    const cfg = readHeaderConfig({
      widgets: [
        { id: 'a', widget_type: 'button_group', title: '', description: '', position: { x: 0, y: 0, width: 4, height: 1 }, props: {}, binding: null, events: [], children: [] },
      ],
    });
    expect(cfg.widgets).toHaveLength(1);
    expect(cfg.widgets?.[0].id).toBe('a');
  });

  it('drops entries that have no string id', () => {
    const cfg = readHeaderConfig({
      widgets: [
        { id: 'ok' },
        { not_id: 'x' },
        null,
        'string',
      ],
    });
    expect(cfg.widgets).toHaveLength(1);
    expect(cfg.widgets?.[0].id).toBe('ok');
  });

  it('returns undefined when widgets is not an array', () => {
    expect(readHeaderConfig({ widgets: 'nope' }).widgets).toBeUndefined();
    expect(readHeaderConfig({ widgets: { id: 'x' } }).widgets).toBeUndefined();
    expect(readHeaderConfig({}).widgets).toBeUndefined();
  });
});

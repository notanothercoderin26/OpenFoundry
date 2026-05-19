import { describe, expect, it } from 'vitest';

import type { AppOverlay, PageLayout } from '@/lib/api/apps';

import {
  readOverlayProps,
  resolveOverlayType,
  resolveOverlayVisibility,
} from './AppOverlayRenderer';

const baseOverlay: AppOverlay = {
  id: 'ov',
  name: 'Detail',
  overlay_type: 'drawer',
  layout: { kind: 'grid', columns: 12, gap: '1rem', max_width: '' } as PageLayout,
};

describe('readOverlayProps', () => {
  it('returns sensible defaults when nothing is configured', () => {
    const props = readOverlayProps(undefined);
    expect(props.position).toBe('right');
    expect(props.size).toBeUndefined();
    expect(props.header_enabled).toBe(true);
    expect(props.header_title).toBeNull();
    expect(props.header_icon).toBeNull();
    expect(props.close_on_backdrop_click).toBe(true);
    expect(props.show_backdrop).toBe(true);
    expect(props.backdrop_opacity).toBe(0.5);
  });

  it('respects explicit overrides', () => {
    const props = readOverlayProps({
      position: 'left',
      size: 480,
      header_enabled: false,
      header_title: 'Trail details',
      header_icon: '★',
      close_on_backdrop_click: false,
      show_backdrop: false,
      backdrop_opacity: 0.2,
    });
    expect(props.position).toBe('left');
    expect(props.size).toBe(480);
    expect(props.header_enabled).toBe(false);
    expect(props.header_title).toBe('Trail details');
    expect(props.header_icon).toBe('★');
    expect(props.close_on_backdrop_click).toBe(false);
    expect(props.show_backdrop).toBe(false);
    expect(props.backdrop_opacity).toBe(0.2);
  });

  it('clamps invalid opacity / size / position to defaults', () => {
    const props = readOverlayProps({
      position: 'top', // invalid
      size: -10,        // invalid
      backdrop_opacity: 2, // out of range
    });
    expect(props.position).toBe('right');
    expect(props.size).toBeUndefined();
    expect(props.backdrop_opacity).toBe(0.5);
  });
});

describe('resolveOverlayType', () => {
  it('returns "modal" only when overlay_type === "modal"', () => {
    expect(resolveOverlayType('modal')).toBe('modal');
    expect(resolveOverlayType('drawer')).toBe('drawer');
    expect(resolveOverlayType('unknown')).toBe('drawer');
    expect(resolveOverlayType(undefined)).toBe('drawer');
  });
});

describe('resolveOverlayVisibility', () => {
  it('returns false when there is no visible_variable_id', () => {
    expect(resolveOverlayVisibility(baseOverlay, { something: true })).toBe(false);
  });

  it('coerces the variable value to a boolean', () => {
    const o: AppOverlay = { ...baseOverlay, visible_variable_id: 'show_drawer' };
    expect(resolveOverlayVisibility(o, { show_drawer: true })).toBe(true);
    expect(resolveOverlayVisibility(o, { show_drawer: 'yes' })).toBe(true);
    expect(resolveOverlayVisibility(o, { show_drawer: 0 })).toBe(false);
    expect(resolveOverlayVisibility(o, { show_drawer: false })).toBe(false);
    expect(resolveOverlayVisibility(o, {})).toBe(false);
  });
});

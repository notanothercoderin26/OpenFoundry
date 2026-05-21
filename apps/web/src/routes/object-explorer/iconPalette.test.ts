import { describe, expect, it } from 'vitest';

import { iconBackground, pickIconPaletteIndex } from './iconPalette';

describe('pickIconPaletteIndex', () => {
  it('returns a value in [0, 12)', () => {
    const samples = ['airline', 'aircraft', 'passenger', 'flight', '', 'a'];
    for (const seed of samples) {
      const index = pickIconPaletteIndex(seed);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(12);
    }
  });

  it('is deterministic for the same seed', () => {
    expect(pickIconPaletteIndex('aircraft')).toBe(pickIconPaletteIndex('aircraft'));
  });

  it('spreads across multiple slots over varied seeds', () => {
    const slots = new Set<number>();
    for (const seed of ['airline', 'aircraft', 'passenger', 'flight', 'route', 'delay', 'runway', 'airport']) {
      slots.add(pickIconPaletteIndex(seed));
    }
    expect(slots.size).toBeGreaterThanOrEqual(3);
  });
});

describe('iconBackground', () => {
  it('returns the override when provided', () => {
    expect(iconBackground('aircraft', '#ff0000')).toBe('#ff0000');
  });

  it('falls back to a palette CSS variable when override is null or empty', () => {
    expect(iconBackground('aircraft', null)).toMatch(/^var\(--oe-icon-\d+\)$/);
    expect(iconBackground('aircraft', '')).toMatch(/^var\(--oe-icon-\d+\)$/);
    expect(iconBackground('aircraft')).toMatch(/^var\(--oe-icon-\d+\)$/);
  });
});

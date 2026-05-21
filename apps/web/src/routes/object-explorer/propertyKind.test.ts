import { describe, expect, it } from 'vitest';

import { classifyPropertyKind, propertyKindGlyph, propertyKindLabel } from './propertyKind';

describe('classifyPropertyKind', () => {
  it.each([
    ['string', 'string'],
    ['STR', 'string'],
    ['text', 'string'],
    ['long_string', 'string'],
    ['long', 'number'],
    ['Integer', 'number'],
    ['double', 'number'],
    ['decimal', 'number'],
    ['int64', 'number'],
    ['boolean', 'boolean'],
    ['bool', 'boolean'],
    ['date', 'date'],
    ['time', 'time'],
    ['timestamp', 'timestamp'],
    ['DateTime', 'timestamp'],
    ['geo_point', 'geopoint'],
    ['geoshape', 'geoshape'],
    ['polygon', 'geoshape'],
    ['attachment', 'attachment'],
    ['media_set', 'attachment'],
    ['object_id', 'reference'],
    ['uuid', 'reference'],
    ['rid', 'reference'],
    ['array_string', 'array'],
    ['list_long', 'array'],
    ['weird_thing', 'unknown'],
    ['', 'unknown'],
  ])('classifies %s as %s', (input, expected) => {
    expect(classifyPropertyKind(input)).toBe(expected);
  });
});

describe('propertyKindGlyph', () => {
  it('always returns a non-empty glyph', () => {
    for (const kind of [
      'string',
      'number',
      'boolean',
      'date',
      'time',
      'timestamp',
      'geopoint',
      'geoshape',
      'attachment',
      'reference',
      'array',
      'unknown',
    ] as const) {
      expect(propertyKindGlyph(kind).length).toBeGreaterThan(0);
    }
  });
});

describe('propertyKindLabel', () => {
  it('returns a humanised label for each kind', () => {
    expect(propertyKindLabel('string')).toBe('String');
    expect(propertyKindLabel('geopoint')).toBe('Geo point');
    expect(propertyKindLabel('unknown')).toBe('Property');
  });
});

import { describe, expect, it, vi } from 'vitest';

import type { SearchResult } from '@/lib/api/ontology';
import type { WorkshopVariableFilter } from './workshopVariables';
import {
  buildWorkshopSearchRequest,
  compileWorkshopFiltersToSearch,
  fetchWorkshopObjectSetViaSearch,
  searchResultToObjectInstance,
} from './workshopObjectSetsSearch';

describe('compileWorkshopFiltersToSearch (B03 G2)', () => {
  it('returns an empty array for no filters', () => {
    expect(compileWorkshopFiltersToSearch(undefined)).toEqual([]);
    expect(compileWorkshopFiltersToSearch([])).toEqual([]);
  });

  it('defaults a missing operator to equals', () => {
    const filters: WorkshopVariableFilter[] = [{ property_name: 'country_iso2', value: 'UA' }];
    expect(compileWorkshopFiltersToSearch(filters)).toEqual([
      { property_name: 'country_iso2', operator: 'equals', value: 'UA' },
    ]);
  });

  it('lower-cases and trims explicit operators', () => {
    const filters: WorkshopVariableFilter[] = [
      { property_name: 'title', operator: 'CONTAINS', value: 'Wagner' },
    ];
    expect(compileWorkshopFiltersToSearch(filters)).toEqual([
      { property_name: 'title', operator: 'contains', value: 'Wagner' },
    ]);
  });

  it('compiles min/max into a between filter', () => {
    const filters: WorkshopVariableFilter[] = [
      { property_name: 'event_datetime_utc', min: '2026-05-17T00:00:00Z', max: '2026-05-20T00:00:00Z' },
    ];
    expect(compileWorkshopFiltersToSearch(filters)).toEqual([
      {
        property_name: 'event_datetime_utc',
        operator: 'between',
        min: '2026-05-17T00:00:00Z',
        max: '2026-05-20T00:00:00Z',
      },
    ]);
  });

  it('skips filters without a property name', () => {
    const filters: WorkshopVariableFilter[] = [
      { property_name: '   ', value: 'x' },
      { property_name: 'country_iso2', value: 'UA' },
    ];
    expect(compileWorkshopFiltersToSearch(filters)).toHaveLength(1);
  });
});

describe('buildWorkshopSearchRequest', () => {
  it('produces the geopolitics PoC Workshop query verbatim', () => {
    const request = buildWorkshopSearchRequest({
      objectTypeId: 'Event',
      filters: [
        { property_name: 'country_iso2', operator: 'equals', value: 'UA' },
        { property_name: 'cameo_quad_class', operator: 'equals', value: 'MATERIAL_CONF' },
        { property_name: 'event_datetime_utc', operator: 'gte', value: '2026-05-17T00:00:00Z' },
      ],
      query: '',
      limit: 100,
    });
    expect(request).toEqual({
      query: '',
      object_type_id: 'Event',
      limit: 100,
      filters: [
        { property_name: 'country_iso2', operator: 'equals', value: 'UA' },
        { property_name: 'cameo_quad_class', operator: 'equals', value: 'MATERIAL_CONF' },
        { property_name: 'event_datetime_utc', operator: 'gte', value: '2026-05-17T00:00:00Z' },
      ],
    });
  });

  it('clamps limit to backend maximum (100)', () => {
    const request = buildWorkshopSearchRequest({
      objectTypeId: 'Actor',
      filters: [],
      limit: 9999,
    });
    expect(request.limit).toBe(100);
  });

  it('drops empty object_type_id', () => {
    const request = buildWorkshopSearchRequest({ objectTypeId: '', filters: [], query: 'wagner' });
    expect(request).not.toHaveProperty('object_type_id');
    expect(request.query).toBe('wagner');
  });
});

describe('searchResultToObjectInstance', () => {
  it('projects metadata into ObjectInstance.properties (minus marking fields)', () => {
    const hit: SearchResult = {
      kind: 'object',
      id: 'actor-1',
      object_type_id: 'Actor',
      title: 'Wagner Group',
      subtitle: null,
      snippet: 'Wagner Group',
      score: 1.2,
      route: '/ontology/types/Actor/objects/actor-1',
      metadata: {
        display_name: 'Wagner Group',
        country_iso2: 'RU',
        markings: ['OPEN-SOURCE'],
      },
    };
    const obj = searchResultToObjectInstance(hit);
    expect(obj.id).toBe('actor-1');
    expect(obj.object_type_id).toBe('Actor');
    expect(obj.properties).toEqual({ display_name: 'Wagner Group', country_iso2: 'RU' });
    expect(obj.properties).not.toHaveProperty('markings');
    expect(obj.marking).toBe('OPEN-SOURCE');
  });

  it('survives metadata without marking fields', () => {
    const hit: SearchResult = {
      kind: 'object',
      id: 'e-1',
      object_type_id: 'Event',
      title: 'Skirmish',
      subtitle: null,
      snippet: '',
      score: 0.5,
      route: '/ontology/types/Event/objects/e-1',
      metadata: { name: 'Skirmish' },
    };
    const obj = searchResultToObjectInstance(hit);
    expect(obj.marking).toBeUndefined();
    expect(obj.properties.name).toBe('Skirmish');
  });
});

describe('fetchWorkshopObjectSetViaSearch', () => {
  it('routes through the injected searchOntology client and projects hits', async () => {
    const searchOntology = vi.fn().mockResolvedValue({
      query: '',
      total: 2,
      data: [
        {
          kind: 'object',
          id: 'ev-1',
          object_type_id: 'Event',
          title: 'Skirmish A',
          subtitle: null,
          snippet: '',
          score: 1,
          route: '/ontology/types/Event/objects/ev-1',
          metadata: { country_iso2: 'UA', cameo_quad_class: 'MATERIAL_CONF' },
        },
        {
          kind: 'object',
          id: 'ev-2',
          object_type_id: 'Event',
          title: 'Skirmish B',
          subtitle: null,
          snippet: '',
          score: 0.8,
          route: '/ontology/types/Event/objects/ev-2',
          metadata: { country_iso2: 'UA', cameo_quad_class: 'MATERIAL_CONF' },
        },
      ] satisfies SearchResult[],
    });

    const result = await fetchWorkshopObjectSetViaSearch(
      {
        objectTypeId: 'Event',
        filters: [
          { property_name: 'country_iso2', value: 'UA' },
          { property_name: 'cameo_quad_class', value: 'MATERIAL_CONF' },
        ],
        limit: 100,
      },
      { searchOntology },
    );

    expect(searchOntology).toHaveBeenCalledTimes(1);
    const sent = searchOntology.mock.calls[0][0];
    expect(sent.object_type_id).toBe('Event');
    expect(sent.filters).toHaveLength(2);
    expect(sent.filters[0]).toEqual({ property_name: 'country_iso2', operator: 'equals', value: 'UA' });
    expect(result.total).toBe(2);
    expect(result.data.map((o) => o.id)).toEqual(['ev-1', 'ev-2']);
    expect(result.data[0].properties.country_iso2).toBe('UA');
  });

  it('surfaces backend errors as rejections', async () => {
    const searchOntology = vi.fn().mockRejectedValue(new Error('vespa timeout'));
    await expect(
      fetchWorkshopObjectSetViaSearch(
        { objectTypeId: 'Event', filters: [] },
        { searchOntology },
      ),
    ).rejects.toThrow('vespa timeout');
  });
});

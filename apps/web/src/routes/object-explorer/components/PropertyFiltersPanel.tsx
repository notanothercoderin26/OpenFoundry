import type { Dispatch, SetStateAction } from 'react';

import type { ObjectQueryFilter, ObjectType, Property } from '@/lib/api/ontology';

import { PanelHeader } from './atoms';
import {
  DEFAULT_PROPERTY_FILTER,
  operatorOptionsForProperty,
  propertyInputType,
  propertyKind,
  type PropertyFilterDraft,
} from '../state';

interface PropertyFiltersPanelProps {
  filterTypeId: string;
  onChangeFilterTypeId: (typeId: string) => void;
  objectTypesWithVisibleRows: ObjectType[];
  propertyFilters: PropertyFilterDraft[];
  setPropertyFilters: Dispatch<SetStateAction<PropertyFilterDraft[]>>;
  typeProperties: Property[];
  filterLoading: boolean;
  onRunFilters: () => void;
}

export function PropertyFiltersPanel({
  filterTypeId,
  onChangeFilterTypeId,
  objectTypesWithVisibleRows,
  propertyFilters,
  setPropertyFilters,
  typeProperties,
  filterLoading,
  onRunFilters,
}: PropertyFiltersPanelProps) {
  return (
    <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
      <PanelHeader label="Property filters" value={`${propertyFilters.length}`} />
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(min(100%, 220px), 260px) minmax(0, 1fr) auto', alignItems: 'start' }}>
        <select value={filterTypeId} onChange={(event) => onChangeFilterTypeId(event.target.value)} className="of-input">
          {objectTypesWithVisibleRows.map((type) => (
            <option key={type.id} value={type.id}>{type.display_name || type.name}</option>
          ))}
        </select>
        <div style={{ display: 'grid', gap: 6 }}>
          {propertyFilters.map((filter, index) => {
            const property = typeProperties.find((entry) => entry.name === filter.property_name) ?? null;
            return (
              <div key={index} style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(140px, 1fr) minmax(120px, 170px) minmax(120px, 1fr) auto' }}>
                <select
                  value={filter.property_name}
                  onChange={(event) => setPropertyFilters((current) => current.map((entry, i) => i === index ? { ...entry, property_name: event.target.value, operator: 'equals' } : entry))}
                  className="of-input"
                >
                  {typeProperties.map((entry) => (
                    <option key={entry.id} value={entry.name}>{entry.display_name || entry.name}</option>
                  ))}
                </select>
                <select
                  value={filter.operator}
                  onChange={(event) => setPropertyFilters((current) => current.map((entry, i) => i === index ? { ...entry, operator: event.target.value as ObjectQueryFilter['operator'] } : entry))}
                  className="of-input"
                >
                  {operatorOptionsForProperty(property).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                {propertyKind(property) === 'boolean' ? (
                  <select
                    value={filter.value || 'true'}
                    onChange={(event) => setPropertyFilters((current) => current.map((entry, i) => i === index ? { ...entry, value: event.target.value } : entry))}
                    disabled={filter.operator === 'is_empty' || filter.operator === 'is_not_empty'}
                    className="of-input"
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    type={propertyInputType(property)}
                    value={filter.value}
                    onChange={(event) => setPropertyFilters((current) => current.map((entry, i) => i === index ? { ...entry, value: event.target.value } : entry))}
                    disabled={filter.operator === 'is_empty' || filter.operator === 'is_not_empty'}
                    className="of-input"
                    placeholder={propertyKind(property) === 'number' ? 'Number' : propertyKind(property) === 'date' ? 'Date or time' : 'Value'}
                  />
                )}
                <button
                  type="button"
                  className="of-button"
                  onClick={() => setPropertyFilters((current) => current.filter((_, i) => i !== index))}
                  disabled={propertyFilters.length <= 1}
                >
                  Remove
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="of-button"
            style={{ justifySelf: 'start' }}
            onClick={() => setPropertyFilters((current) => [...current, { ...DEFAULT_PROPERTY_FILTER, property_name: typeProperties[0]?.name ?? '' }])}
          >
            Add filter
          </button>
        </div>
        <button
          type="button"
          className="of-button of-button--primary"
          onClick={onRunFilters}
          disabled={!filterTypeId || filterLoading}
        >
          {filterLoading ? 'Filtering' : 'Run filters'}
        </button>
      </div>
    </section>
  );
}

import type { Dispatch, SetStateAction } from 'react';

import {
  objectExplorerLinkedTargetForType,
  type LinkType,
  type ObjectQueryFilter,
  type ObjectType,
  type Property,
} from '@/lib/api/ontology';

import { EmptyState, PanelHeader } from './atoms';
import {
  operatorOptionsForProperty,
  propertyInputType,
  type LinkedFilterDraft,
  type LinkedFilterMode,
} from '../state';

interface LinkedFilterPanelProps {
  filterTypeId: string;
  linkedFilter: LinkedFilterDraft;
  setLinkedFilter: Dispatch<SetStateAction<LinkedFilterDraft>>;
  linkedFilterLinks: LinkType[];
  linkedProperties: Property[];
  linkedFilterProperty: Property | null;
  linkedTargetType: ObjectType | null | undefined;
  typeById: Map<string, ObjectType>;
  filterLoading: boolean;
  onRunLinkedFilter: () => void;
}

export function LinkedFilterPanel({
  filterTypeId,
  linkedFilter,
  setLinkedFilter,
  linkedFilterLinks,
  linkedProperties,
  linkedFilterProperty,
  linkedTargetType,
  typeById,
  filterLoading,
  onRunLinkedFilter,
}: LinkedFilterPanelProps) {
  return (
    <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
      <PanelHeader
        label="Linked-object filters"
        value={linkedTargetType ? linkedTargetType.display_name || linkedTargetType.name : 'No link'}
      />
      {linkedFilterLinks.length > 0 ? (
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(min(100%, 150px), 180px) minmax(min(100%, 220px), 260px) minmax(0, 1fr) auto', alignItems: 'start' }}>
          <select
            value={linkedFilter.mode}
            onChange={(event) => setLinkedFilter((current) => ({ ...current, mode: event.target.value as LinkedFilterMode }))}
            className="of-input"
          >
            <option value="has_link">Has link</option>
            <option value="linked_property">Linked property</option>
            <option value="object_reference">Object reference</option>
          </select>
          <select
            value={linkedFilter.link_type_id}
            onChange={(event) => setLinkedFilter((current) => ({ ...current, link_type_id: event.target.value }))}
            className="of-input"
          >
            {linkedFilterLinks.map((linkType) => {
              const target = objectExplorerLinkedTargetForType(linkType, filterTypeId);
              return (
                <option key={linkType.id} value={linkType.id}>
                  {linkType.display_name || linkType.name} to {typeById.get(target?.target_object_type_id || '')?.display_name || target?.target_object_type_id}
                </option>
              );
            })}
          </select>
          {linkedFilter.mode === 'linked_property' ? (
            <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(130px, 1fr) minmax(120px, 160px) minmax(120px, 1fr)' }}>
              <select
                value={linkedFilter.property_name}
                onChange={(event) => setLinkedFilter((current) => ({ ...current, property_name: event.target.value, operator: 'equals' }))}
                className="of-input"
              >
                {linkedProperties.map((property) => (
                  <option key={property.id} value={property.name}>{property.display_name || property.name}</option>
                ))}
              </select>
              <select
                value={linkedFilter.operator}
                onChange={(event) => setLinkedFilter((current) => ({ ...current, operator: event.target.value as ObjectQueryFilter['operator'] }))}
                className="of-input"
              >
                {operatorOptionsForProperty(linkedFilterProperty).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <input
                type={propertyInputType(linkedFilterProperty)}
                value={linkedFilter.value}
                onChange={(event) => setLinkedFilter((current) => ({ ...current, value: event.target.value }))}
                disabled={linkedFilter.operator === 'is_empty' || linkedFilter.operator === 'is_not_empty'}
                className="of-input"
                placeholder="Linked value"
              />
            </div>
          ) : linkedFilter.mode === 'object_reference' ? (
            <input
              value={linkedFilter.object_id}
              onChange={(event) => setLinkedFilter((current) => ({ ...current, object_id: event.target.value }))}
              placeholder={`${linkedTargetType?.display_name || 'Linked object'} ID`}
              className="of-input"
            />
          ) : (
            <div className="of-text-muted" style={{ padding: '6px 0', fontSize: 12 }}>
              Has visible linked object
            </div>
          )}
          <button
            type="button"
            className="of-button of-button--primary"
            onClick={onRunLinkedFilter}
            disabled={!linkedFilter.link_type_id || filterLoading}
          >
            {filterLoading ? 'Filtering' : 'Run linked filter'}
          </button>
        </div>
      ) : (
        <EmptyState label="No visible link filters for this object type." compact />
      )}
    </section>
  );
}

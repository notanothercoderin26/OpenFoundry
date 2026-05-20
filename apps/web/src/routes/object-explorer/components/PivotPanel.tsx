import {
  objectExplorerLinkedTargetForType,
  type LinkType,
  type ObjectType,
  type SearchResult,
} from '@/lib/api/ontology';

import { PanelHeader } from './atoms';
import { numberFormatter, uniqueObjectIds } from '../state';

interface PivotPanelProps {
  pivotLinkTypeId: string;
  onChangePivotLinkTypeId: (linkTypeId: string) => void;
  pivotLinks: LinkType[];
  pivotSourceTypeId: string;
  pivotTargetType: ObjectType | null | undefined;
  typeById: Map<string, ObjectType>;
  searchResults: SearchResult[];
  filterLoading: boolean;
  onPivot: () => void;
}

export function PivotPanel({
  pivotLinkTypeId,
  onChangePivotLinkTypeId,
  pivotLinks,
  pivotSourceTypeId,
  pivotTargetType,
  typeById,
  searchResults,
  filterLoading,
  onPivot,
}: PivotPanelProps) {
  const sourceCount = uniqueObjectIds(searchResults).length;
  return (
    <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
      <PanelHeader
        label="Pivot linked objects"
        value={pivotTargetType ? pivotTargetType.display_name || pivotTargetType.name : 'Pick link'}
      />
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(min(100%, 260px), 320px) minmax(0, 1fr) auto', alignItems: 'center' }}>
        <select
          value={pivotLinkTypeId}
          onChange={(event) => onChangePivotLinkTypeId(event.target.value)}
          className="of-input"
          disabled={pivotLinks.length === 0}
        >
          {pivotLinks.map((linkType) => {
            const target = objectExplorerLinkedTargetForType(linkType, pivotSourceTypeId);
            return (
              <option key={linkType.id} value={linkType.id}>
                {linkType.display_name || linkType.name} to {typeById.get(target?.target_object_type_id || '')?.display_name || target?.target_object_type_id}
              </option>
            );
          })}
        </select>
        <span className="of-text-muted" style={{ fontSize: 12 }}>
          {numberFormatter.format(sourceCount)} source objects from the current result set
        </span>
        <button
          type="button"
          className="of-button"
          onClick={onPivot}
          disabled={!pivotLinkTypeId || filterLoading || sourceCount === 0}
        >
          Pivot
        </button>
      </div>
    </section>
  );
}

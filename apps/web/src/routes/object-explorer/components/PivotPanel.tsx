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
  pivotDepth: number;
  onChangePivotDepth: (depth: number) => void;
  onPivot: () => void;
}

const DEPTH_OPTIONS = [1, 2, 3, 4] as const;

export function PivotPanel({
  pivotLinkTypeId,
  onChangePivotLinkTypeId,
  pivotLinks,
  pivotSourceTypeId,
  pivotTargetType,
  typeById,
  searchResults,
  filterLoading,
  pivotDepth,
  onChangePivotDepth,
  onPivot,
}: PivotPanelProps) {
  const sourceCount = uniqueObjectIds(searchResults).length;
  return (
    <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
      <PanelHeader
        label="Pivot linked objects"
        value={pivotTargetType ? pivotTargetType.display_name || pivotTargetType.name : 'Pick link'}
      />
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(min(100%, 240px), 300px) auto minmax(0, 1fr) auto', alignItems: 'center' }}>
        <select
          value={pivotLinkTypeId}
          onChange={(event) => onChangePivotLinkTypeId(event.target.value)}
          className="of-input"
          disabled={pivotLinks.length === 0}
          data-testid="object-explorer-pivot-link-type"
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
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span className="of-text-muted">Hops</span>
          <select
            className="of-input"
            value={pivotDepth}
            onChange={(event) => onChangePivotDepth(Number(event.target.value))}
            data-testid="object-explorer-pivot-depth"
            style={{ width: 64 }}
          >
            {DEPTH_OPTIONS.map((depth) => (
              <option key={depth} value={depth}>{depth}</option>
            ))}
          </select>
        </label>
        <span className="of-text-muted" style={{ fontSize: 12 }}>
          {numberFormatter.format(sourceCount)} source objects from the current result set
        </span>
        <button
          type="button"
          className="of-button"
          onClick={onPivot}
          disabled={!pivotLinkTypeId || filterLoading || sourceCount === 0}
          data-testid="object-explorer-pivot-run"
        >
          Pivot
        </button>
      </div>
    </section>
  );
}

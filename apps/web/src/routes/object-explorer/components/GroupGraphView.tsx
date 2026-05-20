import { useMemo } from 'react';
import type { ElementDefinition, StylesheetStyle } from 'cytoscape';

import {
  objectExplorerLinkedTargetForType,
  type LinkType,
  type ObjectType,
} from '@/lib/api/ontology';

import { CytoscapeCanvas } from '@/lib/components/CytoscapeCanvas';

interface GroupGraphViewProps {
  objectTypes: ObjectType[];
  linkTypes: LinkType[];
  onSelectType?: (typeId: string) => void;
}

const stylesheet: StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'background-color': '#2d72d2',
      'label': 'data(label)',
      'color': '#0f1624',
      'font-size': '11px',
      'text-margin-y': -6,
      'text-valign': 'top',
      'text-halign': 'center',
      'text-wrap': 'ellipsis',
      'text-max-width': '120px',
      'width': 24,
      'height': 24,
      'border-width': 1,
      'border-color': '#1f4e9d',
    },
  },
  {
    selector: 'edge',
    style: {
      'width': 1.5,
      'line-color': '#9ba6b8',
      'target-arrow-color': '#9ba6b8',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'label': 'data(label)',
      'font-size': '10px',
      'color': '#566378',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.85,
      'text-background-padding': '2px',
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#f1b400',
      'border-width': 3,
    },
  },
];

export function GroupGraphView({ objectTypes, linkTypes, onSelectType }: GroupGraphViewProps) {
  const typeIds = useMemo(() => new Set(objectTypes.map((type) => type.id)), [objectTypes]);

  const elements = useMemo<ElementDefinition[]>(() => {
    const nodes: ElementDefinition[] = objectTypes.map((type) => ({
      data: { id: type.id, label: type.display_name || type.name },
    }));

    const edgeCounts = new Map<string, number>();
    for (const linkType of linkTypes) {
      for (const objectType of objectTypes) {
        const target = objectExplorerLinkedTargetForType(linkType, objectType.id);
        if (!target) continue;
        if (!typeIds.has(target.target_object_type_id)) continue;
        if (objectType.id === target.target_object_type_id) continue;
        const a = objectType.id;
        const b = target.target_object_type_id;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
      }
    }

    const edges: ElementDefinition[] = Array.from(edgeCounts.entries()).map(([key, count], index) => {
      const [source, target] = key.split('|');
      return {
        data: {
          id: `edge-${index}-${source}-${target}`,
          source,
          target,
          label: `↔ ${count}`,
        },
      };
    });

    return [...nodes, ...edges];
  }, [linkTypes, objectTypes, typeIds]);

  if (objectTypes.length === 0) {
    return (
      <div className="of-text-muted" style={{ padding: 24, textAlign: 'center', fontSize: 12 }}>
        No object types in this group.
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <CytoscapeCanvas
        elements={elements}
        stylesheet={stylesheet}
        height={280}
        onReady={(cy) => {
          cy.removeListener('tap', 'node');
          cy.on('tap', 'node', (event) => {
            const id = event.target.id();
            if (id && onSelectType) onSelectType(id);
          });
        }}
      />
    </div>
  );
}

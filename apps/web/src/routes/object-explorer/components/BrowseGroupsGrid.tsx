import type { ObjectInstanceViewPolicy } from '@/lib/api/ontology';
import type { buildObjectExplorerTypeGroups } from '@/lib/api/ontology';

import { EmptyState, PanelHeader } from './atoms';

type ExplorerGroup = ReturnType<typeof buildObjectExplorerTypeGroups>[number];

interface BrowseGroupsGridProps {
  groups: ExplorerGroup[];
  accessForType: (typeId: string | null | undefined) => ObjectInstanceViewPolicy;
  onBrowse: (typeId: string) => void;
}

export function BrowseGroupsGrid({ groups, accessForType, onBrowse }: BrowseGroupsGridProps) {
  return (
    <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
      <PanelHeader label="Browse object type groups" value={`${groups.length}`} />
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
        {groups.map((group) => (
          <article key={group.id} className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <strong>{group.display_name}</strong>
                {group.description ? (
                  <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>
                    {group.description}
                  </p>
                ) : null}
              </div>
              <span className="of-chip">{group.object_types.length}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {group.object_types.slice(0, 6).map((type) => {
                const access = accessForType(type.id);
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => onBrowse(type.id)}
                    disabled={!access.can_view_instances}
                    className="of-button"
                    style={{ fontSize: 12 }}
                    title={access.can_view_instances ? `Browse ${type.display_name || type.name}` : access.reason}
                  >
                    {type.display_name || type.name}
                  </button>
                );
              })}
            </div>
          </article>
        ))}
        {groups.length === 0 && <EmptyState label="No visible object type groups." compact />}
      </div>
    </section>
  );
}

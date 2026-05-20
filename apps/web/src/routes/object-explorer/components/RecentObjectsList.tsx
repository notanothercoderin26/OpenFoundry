import { EmptyState, PanelHeader } from './atoms';
import { formatDate, type RecentItem } from '../state';

interface RecentObjectsListProps {
  recents: RecentItem[];
  onSelect: (item: RecentItem) => void;
}

export function RecentObjectsList({ recents, onSelect }: RecentObjectsListProps) {
  return (
    <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
      <PanelHeader label="Recent objects" value={`${recents.length}`} />
      <div style={{ display: 'grid', gap: 4, maxHeight: 190, overflow: 'auto' }}>
        {recents.map((item) => (
          <button
            key={`${item.kind}-${item.id}`}
            type="button"
            onClick={() => onSelect(item)}
            className="of-button of-button--ghost"
            style={{ justifyContent: 'space-between', minHeight: 32, padding: '4px 6px', textAlign: 'left' }}
          >
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.title}
              </span>
              <span className="of-text-muted" style={{ display: 'block', fontSize: 11 }}>
                {item.kind} - {formatDate(item.createdAt)}
              </span>
            </span>
          </button>
        ))}
        {recents.length === 0 && <EmptyState label="No recent objects." compact />}
      </div>
    </section>
  );
}

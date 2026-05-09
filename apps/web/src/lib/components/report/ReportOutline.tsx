import { Glyph } from '@/lib/components/ui/Glyph';

import type { ReportDefinition, ReportExecutionPreview } from '@/lib/api/reports';

interface OutlineEntry {
  id: string;
  title: string;
  kind: 'kpi' | 'table' | 'chart' | 'narrative' | 'map' | 'group';
  group?: string;
}

interface ReportOutlineProps {
  report: ReportDefinition | null;
  preview: ReportExecutionPreview | null;
  pinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  activeId?: string;
}

const KIND_TONE: Record<OutlineEntry['kind'], string> = {
  kpi: '#0ea5e9',
  table: '#0891b2',
  chart: '#7c3aed',
  narrative: '#f59e0b',
  map: '#16a34a',
  group: '#1f5ea8',
};

function buildEntries(
  report: ReportDefinition | null,
  preview: ReportExecutionPreview | null,
): OutlineEntry[] {
  const sections = report?.template?.sections ?? [];
  const previewByKind = new Map(preview?.sections.map((entry) => [entry.section_id, entry]) ?? []);

  const grouped: OutlineEntry[] = [];
  if (preview?.sections?.length) {
    grouped.push({
      id: 'group:datasets',
      title: 'Datasets',
      kind: 'group',
      group: 'datasets',
    });
  }
  for (const section of sections) {
    grouped.push({
      id: section.id,
      title: section.title,
      kind: section.kind,
      group: previewByKind.has(section.id) ? 'analysis' : 'design',
    });
  }
  if (sections.length === 0 && preview?.sections.length) {
    for (const section of preview.sections) {
      grouped.push({
        id: section.section_id,
        title: section.title,
        kind: section.kind,
      });
    }
  }
  if (grouped.filter((entry) => entry.kind !== 'group').length > 0) {
    grouped.unshift({ id: 'group:analysis', title: 'Analysis', kind: 'group', group: 'analysis' });
  }
  return grouped;
}

export function ReportOutline({
  report,
  preview,
  pinned,
  onTogglePin,
  onClose,
  onSelect,
  activeId,
}: ReportOutlineProps) {
  const entries = buildEntries(report, preview);
  return (
    <aside
      aria-label="Report outline"
      style={{
        width: 260,
        flex: '0 0 260px',
        background: '#ffffff',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
        height: 'fit-content',
        position: 'sticky',
        top: 12,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>Outline</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            onClick={onTogglePin}
            aria-pressed={pinned}
            title={pinned ? 'Unpin outline' : 'Pin outline'}
            style={iconButtonStyle(pinned)}
          >
            <PinIcon active={pinned} />
          </button>
          <button type="button" onClick={onClose} title="Hide outline" aria-label="Hide outline" style={iconButtonStyle(false)}>
            <Glyph name="x" size={14} />
          </button>
        </span>
      </header>

      {entries.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, padding: '8px 4px' }}>
          The outline appears once the report defines sections or generates a preview.
        </p>
      ) : (
        <nav style={{ display: 'grid', gap: 2 }}>
          {entries.map((entry) =>
            entry.kind === 'group' ? (
              <div
                key={entry.id}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  padding: '8px 4px 4px',
                }}
              >
                {entry.title}
              </div>
            ) : (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelect(entry.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '6px 6px',
                  background: activeId === entry.id ? 'var(--bg-chip-active)' : 'transparent',
                  border: 0,
                  borderRadius: 'var(--radius-sm)',
                  textAlign: 'left',
                  color: activeId === entry.id ? 'var(--status-info)' : 'var(--text-link)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (activeId !== entry.id) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  if (activeId !== entry.id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <KindBadge kind={entry.kind} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.title}</span>
              </button>
            ),
          )}
        </nav>
      )}
    </aside>
  );
}

function iconButtonStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    border: 0,
    background: 'transparent',
    color: active ? 'var(--status-info)' : 'var(--text-muted)',
    borderRadius: 'var(--radius-sm)',
  };
}

function PinIcon({ active }: { active: boolean }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} aria-hidden>
      <path
        d="M9 4h6l-1 5 4 4-3 1v6l-3-3-3 3v-6l-3-1 4-4z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function KindBadge({ kind }: { kind: OutlineEntry['kind'] }) {
  if (kind === 'group') return null;
  const tone = KIND_TONE[kind];
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        background: '#f3f4f6',
        borderRadius: 2,
        color: tone,
      }}
    >
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden>
        {kind === 'narrative' ? (
          <>
            <path d="M5 5h14v14H5z" stroke={tone} strokeWidth={1.6} />
            <path d="M8 9h8M8 12h8M8 15h5" stroke={tone} strokeWidth={1.6} strokeLinecap="round" />
          </>
        ) : kind === 'kpi' ? (
          <path d="M5 16l4-7 4 5 5-9" stroke={tone} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        ) : kind === 'chart' ? (
          <>
            <path d="M5 19V5" stroke={tone} strokeWidth={1.6} strokeLinecap="round" />
            <path d="M5 19h14" stroke={tone} strokeWidth={1.6} strokeLinecap="round" />
            <path d="M9 16v-5M13 16V8M17 16v-3" stroke={tone} strokeWidth={1.6} strokeLinecap="round" />
          </>
        ) : kind === 'map' ? (
          <path
            d="M9 4 5 6v14l4-2 6 2 4-2V4l-4 2-6-2z"
            stroke={tone}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
        ) : (
          <>
            <path d="M5 6h14v12H5z" stroke={tone} strokeWidth={1.6} />
            <path d="M5 10h14M5 14h14M9 6v12M14 6v12" stroke={tone} strokeWidth={1.6} />
          </>
        )}
      </svg>
    </span>
  );
}

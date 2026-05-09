import { useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

import type { ReportDefinition } from '@/lib/api/reports';

interface ReportSidebarProps {
  reports: ReportDefinition[];
  selectedReportId: string;
  busy?: boolean;
  starredIds: Set<string>;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onToggleStar: (id: string) => void;
}

type SidebarFilter = 'all' | 'starred' | 'mine';

export function ReportSidebar({
  reports,
  selectedReportId,
  busy = false,
  starredIds,
  onSelect,
  onCreate,
  onToggleStar,
}: ReportSidebarProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SidebarFilter>('all');

  const visible = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    return reports.filter((report) => {
      const matchesQuery = !lowered
        ? true
        : report.name.toLowerCase().includes(lowered) ||
          report.description.toLowerCase().includes(lowered) ||
          report.tags.some((tag) => tag.toLowerCase().includes(lowered));
      if (!matchesQuery) return false;
      if (filter === 'starred') return starredIds.has(report.id);
      if (filter === 'mine') return !!report.owner;
      return true;
    });
  }, [reports, query, filter, starredIds]);

  return (
    <aside
      aria-label="Report library"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 280,
        flex: '0 0 280px',
        background: '#ffffff',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        minHeight: 0,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--border-default)' }}>
        <div>
          <p className="of-eyebrow" style={{ margin: 0 }}>
            Library
          </p>
          <h2 style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--text-strong)' }}>
            Reports
          </h2>
        </div>
        <button type="button" className="of-btn of-btn-primary" onClick={onCreate} disabled={busy}>
          <Glyph name="plus" size={14} tone="#ffffff" />
          New
        </button>
      </header>

      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-default)', display: 'grid', gap: 8 }}>
        <div style={{ position: 'relative' }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reports…"
            className="of-input"
            style={{ paddingLeft: 32, height: 30, fontSize: 13, width: '100%' }}
          />
          <span aria-hidden style={{ position: 'absolute', top: 7, left: 9, color: 'var(--text-muted)' }}>
            <Glyph name="search" size={14} />
          </span>
        </div>
        <div role="tablist" style={{ display: 'flex', gap: 4 }}>
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'starred', label: 'Starred' },
              { id: 'mine', label: 'Owned' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              role="tab"
              type="button"
              onClick={() => setFilter(tab.id)}
              aria-selected={filter === tab.id}
              style={{
                flex: 1,
                fontSize: 12,
                padding: '4px 8px',
                border: '1px solid var(--border-default)',
                background: filter === tab.id ? 'var(--bg-chip-active)' : '#ffffff',
                color: filter === tab.id ? 'var(--status-info)' : 'var(--text-default)',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="of-scrollbar" style={{ overflowY: 'auto', padding: 8, flex: 1, minHeight: 0 }}>
        {visible.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: 12, textAlign: 'center' }}>
            {query ? 'No reports match your search.' : 'No reports yet — start by creating one.'}
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
            {visible.map((report) => {
              const active = report.id === selectedReportId;
              const starred = starredIds.has(report.id);
              return (
                <li key={report.id}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      borderRadius: 'var(--radius-md)',
                      background: active ? 'var(--bg-chip-active)' : 'transparent',
                      border: active ? '1px solid var(--status-info)' : '1px solid transparent',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(report.id)}
                      style={{
                        flex: 1,
                        textAlign: 'left',
                        background: 'transparent',
                        border: 0,
                        padding: '8px 8px',
                        color: active ? 'var(--status-info)' : 'var(--text-strong)',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        if (!active) (e.currentTarget.parentElement as HTMLElement).style.background = 'var(--bg-hover)';
                      }}
                      onMouseLeave={(e) => {
                        if (!active) (e.currentTarget.parentElement as HTMLElement).style.background = 'transparent';
                      }}
                    >
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{report.name}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                        {report.generator_kind.toUpperCase()} · {report.schedule.cadence}
                        {report.last_generated_at ? ` · ${new Date(report.last_generated_at).toLocaleDateString()}` : ''}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleStar(report.id)}
                      aria-label={starred ? 'Unstar' : 'Star'}
                      style={{
                        background: 'transparent',
                        border: 0,
                        padding: '4px 8px',
                        color: starred ? '#eab308' : 'var(--text-muted)',
                        fontSize: 14,
                      }}
                    >
                      {starred ? '★' : '☆'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

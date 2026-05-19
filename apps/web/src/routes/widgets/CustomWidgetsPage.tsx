import { useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

type Framework = 'react' | 'vue' | 'web-component';
type WidgetStatus = 'published' | 'draft' | 'deprecated';

interface CustomWidget {
  id: string;
  name: string;
  description: string;
  category: 'chart' | 'object-view' | 'input' | 'industry';
  framework: Framework;
  status: WidgetStatus;
  workshopApps: number;
  version: string;
  updatedAt: string;
  themeColor: string;
}

const MOCK_WIDGETS: CustomWidget[] = [
  {
    id: 'w-flight-plan',
    name: 'Flight Plan Map',
    description: 'Interactive waypoint visualization with altitude profile and reroute action.',
    category: 'industry',
    framework: 'react',
    status: 'published',
    workshopApps: 4,
    version: '1.4.2',
    updatedAt: '2026-05-17T11:20:00Z',
    themeColor: '#22d3ee',
  },
  {
    id: 'w-signature-pad',
    name: 'Signature Pad',
    description: 'Capture digital signatures with pressure curves and ontology Action binding.',
    category: 'input',
    framework: 'react',
    status: 'published',
    workshopApps: 12,
    version: '2.0.0',
    updatedAt: '2026-05-15T09:08:00Z',
    themeColor: '#a78bfa',
  },
  {
    id: 'w-radar-chart',
    name: 'Radar Chart Plus',
    description: 'Multi-axis radar visualization with comparison overlays and export to PNG.',
    category: 'chart',
    framework: 'web-component',
    status: 'published',
    workshopApps: 9,
    version: '1.2.1',
    updatedAt: '2026-05-14T16:42:00Z',
    themeColor: '#f472b6',
  },
  {
    id: 'w-asset-3d',
    name: 'Asset 3D Viewer',
    description: 'GLTF-based 3D viewer for industrial assets with hot-spot annotations.',
    category: 'object-view',
    framework: 'react',
    status: 'draft',
    workshopApps: 1,
    version: '0.9.0',
    updatedAt: '2026-05-18T13:55:00Z',
    themeColor: '#fb923c',
  },
  {
    id: 'w-gantt',
    name: 'Operational Gantt',
    description: 'Resource-aware Gantt for maintenance windows with drag-to-reschedule.',
    category: 'chart',
    framework: 'react',
    status: 'published',
    workshopApps: 6,
    version: '3.1.0',
    updatedAt: '2026-05-13T07:14:00Z',
    themeColor: '#facc15',
  },
  {
    id: 'w-incident-banner',
    name: 'Incident Banner (legacy)',
    description: 'Top-of-app status banner for active incidents. Superseded by the platform banner.',
    category: 'object-view',
    framework: 'vue',
    status: 'deprecated',
    workshopApps: 0,
    version: '1.0.4',
    updatedAt: '2025-11-02T10:30:00Z',
    themeColor: '#94a3b8',
  },
];

const STATUS_TONE: Record<WidgetStatus, string> = {
  published: '#34d399',
  draft: '#facc15',
  deprecated: '#94a3b8',
};

const STATUS_LABEL: Record<WidgetStatus, string> = {
  published: 'Published',
  draft: 'Draft',
  deprecated: 'Deprecated',
};

const CATEGORY_LABEL: Record<CustomWidget['category'], string> = {
  chart: 'Chart',
  'object-view': 'Object view',
  input: 'Input',
  industry: 'Industry',
};

const FRAMEWORK_LABEL: Record<Framework, string> = {
  react: 'React',
  vue: 'Vue',
  'web-component': 'Web Component',
};

function formatRelative(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day(s) ago`;
  return `${Math.round(days / 30)} mo ago`;
}

export function CustomWidgetsPage() {
  const [categoryFilter, setCategoryFilter] = useState<'all' | CustomWidget['category']>('all');

  const filtered = useMemo(
    () => MOCK_WIDGETS.filter((w) => categoryFilter === 'all' || w.category === categoryFilter),
    [categoryFilter],
  );

  const stats = useMemo(() => {
    const published = MOCK_WIDGETS.filter((w) => w.status === 'published');
    const usedInApps = published.reduce((sum, w) => sum + w.workshopApps, 0);
    const frameworkCounts = new Map<Framework, number>();
    for (const w of MOCK_WIDGETS) {
      frameworkCounts.set(w.framework, (frameworkCounts.get(w.framework) ?? 0) + 1);
    }
    return {
      total: MOCK_WIDGETS.length,
      published: published.length,
      usedInApps,
      frameworks: frameworkCounts.size,
    };
  }, []);

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header className="of-hero-strip">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">Application development · Custom Widgets</p>
            <h1 className="of-heading-xl" style={{ margin: 0 }}>Custom Widgets</h1>
            <p className="of-text-muted" style={{ margin: 0 }}>
              Extend Workshop with bespoke frontend components — domain-specific visualizations, input
              controls, and object views deployed inside OpenFoundry's security boundary.
            </p>
          </div>
          <button type="button" className="of-btn of-btn-primary" disabled title="Publishing CLI ships in Phase 4.x">
            <Glyph name="plus" size={14} /> Publish widget
          </button>
        </div>
      </header>

      <section
        className="of-panel"
        style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      >
        {[
          { label: 'Widgets', value: stats.total.toString(), tone: '#a78bfa' },
          { label: 'Published', value: stats.published.toString(), tone: STATUS_TONE.published },
          { label: 'Used in Workshop apps', value: stats.usedInApps.toString(), tone: '#22d3ee' },
          { label: 'Frameworks supported', value: stats.frameworks.toString(), tone: '#f472b6' },
        ].map((m) => (
          <div key={m.label} style={{ display: 'grid', gap: 4 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: m.tone }}>{m.value}</p>
          </div>
        ))}
      </section>

      <section className="of-panel" style={{ padding: 12 }}>
        <div role="tablist" aria-label="Filter by category" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(['all', 'chart', 'object-view', 'input', 'industry'] as const).map((c) => {
            const active = categoryFilter === c;
            const label = c === 'all' ? 'All categories' : CATEGORY_LABEL[c as CustomWidget['category']];
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? 'of-chip of-chip-active' : 'of-chip'}
                onClick={() => setCategoryFilter(c)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>
          Widget gallery{' '}
          <span className="of-text-muted" style={{ fontSize: 14, fontWeight: 400 }}>({filtered.length})</span>
        </h2>
        {filtered.length === 0 ? (
          <div className="of-panel" style={{ padding: 24, textAlign: 'center' }}>
            <p className="of-text-muted" style={{ margin: 0 }}>No widgets in this category yet.</p>
          </div>
        ) : (
          <div className="of-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {filtered.map((w) => (
              <article key={w.id} className="of-card" aria-label={w.name}>
                <div
                  aria-hidden="true"
                  style={{
                    height: 56,
                    borderRadius: 10,
                    background: `linear-gradient(135deg, ${w.themeColor}55, ${w.themeColor}11)`,
                    border: `1px solid ${w.themeColor}33`,
                    marginBottom: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Glyph name="cube" size={22} tone={w.themeColor} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <h3 className="of-heading-md" style={{ margin: 0 }}>{w.name}</h3>
                    <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 11 }}>
                      v{w.version} · {FRAMEWORK_LABEL[w.framework]}
                    </p>
                  </div>
                  <span
                    className="of-chip"
                    style={{ color: STATUS_TONE[w.status], borderColor: `${STATUS_TONE[w.status]}55` }}
                  >
                    {STATUS_LABEL[w.status]}
                  </span>
                </div>
                <p className="of-text-muted" style={{ minHeight: 48, fontSize: 13, lineHeight: 1.5, marginTop: 10 }}>
                  {w.description}
                </p>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: '1px solid rgba(148, 163, 184, 0.15)',
                  }}
                >
                  <span className="of-text-muted" style={{ fontSize: 12 }}>
                    {w.workshopApps} app{w.workshopApps === 1 ? '' : 's'} · {CATEGORY_LABEL[w.category]}
                  </span>
                  <span className="of-text-muted" style={{ fontSize: 12 }}>
                    {formatRelative(w.updatedAt)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

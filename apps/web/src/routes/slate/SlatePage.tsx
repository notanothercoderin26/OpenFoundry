import { useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

type Visibility = 'internal' | 'public';
type AppStatus = 'draft' | 'published' | 'archived';

interface SlateApp {
  id: string;
  name: string;
  description: string;
  visibility: Visibility;
  status: AppStatus;
  updatedAt: string;
  owner: string;
  themeColor: string;
}

interface SlateTemplate {
  id: string;
  name: string;
  description: string;
  category: 'dashboard' | 'portal' | 'workflow' | 'landing';
  themeColor: string;
}

const MOCK_APPS: SlateApp[] = [
  {
    id: 'inventory-dashboard',
    name: 'Inventory Dashboard',
    description: 'Live stock levels, low-stock alerts, and reorder actions wired into the supply ontology.',
    visibility: 'internal',
    status: 'published',
    updatedAt: '2026-05-12T10:32:00Z',
    owner: 'logistics-team',
    themeColor: '#22d3ee',
  },
  {
    id: 'field-ops-console',
    name: 'Field Ops Console',
    description: 'Operational console for field technicians: assignments, route notes, and incident reports.',
    visibility: 'internal',
    status: 'published',
    updatedAt: '2026-05-10T08:05:00Z',
    owner: 'ops-platform',
    themeColor: '#a78bfa',
  },
  {
    id: 'customer-portal',
    name: 'Customer Portal',
    description: 'Public-facing portal where customers track shipments, raise tickets, and download invoices.',
    visibility: 'public',
    status: 'published',
    updatedAt: '2026-05-08T14:21:00Z',
    owner: 'cx-team',
    themeColor: '#f472b6',
  },
  {
    id: 'incident-triage',
    name: 'Incident Triage',
    description: 'On-call workspace for incident commanders with run-books, timelines, and post-mortem stubs.',
    visibility: 'internal',
    status: 'draft',
    updatedAt: '2026-05-05T19:48:00Z',
    owner: 'reliability',
    themeColor: '#fb923c',
  },
  {
    id: 'public-status',
    name: 'Public Status Page',
    description: 'Service health, scheduled maintenance windows, and subscriber notifications.',
    visibility: 'public',
    status: 'published',
    updatedAt: '2026-04-29T07:00:00Z',
    owner: 'reliability',
    themeColor: '#34d399',
  },
  {
    id: 'finance-pulse',
    name: 'Finance Pulse',
    description: 'Daily revenue, refunds, and dunning workflow for the finance leadership team.',
    visibility: 'internal',
    status: 'archived',
    updatedAt: '2026-03-21T11:12:00Z',
    owner: 'finance-ops',
    themeColor: '#fbbf24',
  },
];

const TEMPLATES: SlateTemplate[] = [
  {
    id: 'tpl-ops-dashboard',
    name: 'Operations Dashboard',
    description: 'KPIs, drill-downs, and quick actions for an operations team.',
    category: 'dashboard',
    themeColor: '#22d3ee',
  },
  {
    id: 'tpl-customer-portal',
    name: 'Customer Portal',
    description: 'Authenticated portal with profile, transactions, and support tickets.',
    category: 'portal',
    themeColor: '#a78bfa',
  },
  {
    id: 'tpl-incident-flow',
    name: 'Incident Workflow',
    description: 'Triage queue, response timeline, and post-incident review pages.',
    category: 'workflow',
    themeColor: '#fb923c',
  },
  {
    id: 'tpl-marketing-landing',
    name: 'Marketing Landing',
    description: 'Public landing page with hero, features, and sign-up form.',
    category: 'landing',
    themeColor: '#f472b6',
  },
];

const VISIBILITY_LABEL: Record<'all' | Visibility, string> = {
  all: 'All apps',
  internal: 'Internal',
  public: 'Public',
};

const STATUS_LABEL: Record<AppStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

const STATUS_TONE: Record<AppStatus, string> = {
  draft: '#fbbf24',
  published: '#34d399',
  archived: '#94a3b8',
};

function formatUpdated(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
}

export function SlatePage() {
  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState<'all' | Visibility>('all');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return MOCK_APPS.filter((app) => {
      if (visibility !== 'all' && app.visibility !== visibility) return false;
      if (!term) return true;
      return (
        app.name.toLowerCase().includes(term) ||
        app.description.toLowerCase().includes(term) ||
        app.owner.toLowerCase().includes(term)
      );
    });
  }, [search, visibility]);

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header className="of-hero-strip">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">Application development · Web App Studio</p>
            <h1 className="of-heading-xl" style={{ margin: 0 }}>Web App Studio</h1>
            <p className="of-text-muted" style={{ margin: 0 }}>
              Build drag-and-drop applications with custom styling. Publish internally or expose them to users
              outside OpenFoundry with the same governance controls.
            </p>
          </div>
          <button type="button" className="of-btn of-btn-primary" disabled title="Builder UI lands in Phase 4.2">
            <Glyph name="plus" size={14} /> Create app
          </button>
        </div>
      </header>

      <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 280px', maxWidth: 480 }}>
            <Glyph name="search" size={14} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search apps by name, description, or owner"
              aria-label="Search apps"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'inherit',
                fontSize: 14,
              }}
            />
          </label>
          <div role="tablist" aria-label="Filter by visibility" style={{ display: 'flex', gap: 6 }}>
            {(['all', 'internal', 'public'] as const).map((option) => {
              const active = visibility === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={active ? 'of-chip of-chip-active' : 'of-chip'}
                  onClick={() => setVisibility(option)}
                >
                  {VISIBILITY_LABEL[option]}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>
          Your apps <span className="of-text-muted" style={{ fontSize: 14, fontWeight: 400 }}>({filtered.length})</span>
        </h2>
        {filtered.length === 0 ? (
          <div className="of-panel" style={{ padding: 24, textAlign: 'center' }}>
            <p className="of-text-muted" style={{ margin: 0 }}>No apps match these filters.</p>
          </div>
        ) : (
          <div className="of-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {filtered.map((app) => (
              <article key={app.id} className="of-card" aria-label={app.name}>
                <div
                  aria-hidden="true"
                  style={{
                    height: 64,
                    borderRadius: 12,
                    background: `linear-gradient(135deg, ${app.themeColor}55, ${app.themeColor}11)`,
                    border: `1px solid ${app.themeColor}33`,
                    marginBottom: 12,
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <h3 className="of-heading-md" style={{ margin: 0 }}>{app.name}</h3>
                    <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                      {app.visibility === 'public' ? 'Public' : 'Internal'} · {app.owner}
                    </p>
                  </div>
                  <span
                    className="of-chip"
                    style={{ color: STATUS_TONE[app.status], borderColor: `${STATUS_TONE[app.status]}55` }}
                  >
                    {STATUS_LABEL[app.status]}
                  </span>
                </div>
                <p className="of-text-muted" style={{ minHeight: 48, fontSize: 13, lineHeight: 1.5, marginTop: 12 }}>
                  {app.description}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <span className="of-text-muted" style={{ fontSize: 12 }}>
                    Updated {formatUpdated(app.updatedAt)}
                  </span>
                  <button type="button" className="of-btn of-btn-ghost" disabled>
                    Open
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>Start from a template</h2>
        <div className="of-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {TEMPLATES.map((tpl) => (
            <article key={tpl.id} className="of-card" aria-label={tpl.name}>
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex',
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: `${tpl.themeColor}28`,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 12,
                }}
              >
                <Glyph name="cube" size={18} tone={tpl.themeColor} />
              </span>
              <h3 className="of-heading-md" style={{ margin: 0 }}>{tpl.name}</h3>
              <p className="of-text-muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6, minHeight: 48 }}>
                {tpl.description}
              </p>
              <p className="of-text-muted" style={{ fontSize: 12, marginTop: 8, textTransform: 'capitalize' }}>
                {tpl.category}
              </p>
            </article>
          ))}
        </div>
      </section>

      <aside
        className="of-panel"
        style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div>
          <p className="of-eyebrow" style={{ margin: 0 }}>Preview</p>
          <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            This page demonstrates the Web App Studio shell. The drag-and-drop builder, publishing flow, and OSDK
            bindings ship in Phase 4.2.
          </p>
        </div>
        <span className="of-chip">Roadmap · Phase 4.2</span>
      </aside>
    </section>
  );
}

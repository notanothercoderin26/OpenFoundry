import { useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

type Stage = 'development' | 'staging' | 'production';
type Visibility = 'internal' | 'public';

interface OsdkApp {
  id: string;
  name: string;
  description: string;
  stage: Stage;
  visibility: Visibility;
  sdkVersion: string;
  hostedAt: string;
  ontologyTypes: number;
  monthlyRequests: number;
  lastDeployedAt: string;
  themeColor: string;
}

const MOCK_APPS: OsdkApp[] = [
  {
    id: 'osdk-fleet',
    name: 'Fleet Operations Console',
    description: 'Custom React app for fleet operators with live route updates, driver chat, and shipment search.',
    stage: 'production',
    visibility: 'internal',
    sdkVersion: '2.4.1',
    hostedAt: 'fleet.apps.openfoundry.internal',
    ontologyTypes: 6,
    monthlyRequests: 1_840_000,
    lastDeployedAt: '2026-05-16T10:32:00Z',
    themeColor: '#22d3ee',
  },
  {
    id: 'osdk-customer-portal',
    name: 'Customer Self-Service Portal',
    description: 'Public-facing OSDK app for customers to track shipments, manage subscriptions, and open tickets.',
    stage: 'production',
    visibility: 'public',
    sdkVersion: '2.3.7',
    hostedAt: 'portal.acme-customers.com',
    ontologyTypes: 4,
    monthlyRequests: 940_000,
    lastDeployedAt: '2026-05-14T13:00:00Z',
    themeColor: '#a78bfa',
  },
  {
    id: 'osdk-field-pwa',
    name: 'Field Tech PWA',
    description: 'Offline-capable progressive web app for field technicians, syncs work orders on reconnect.',
    stage: 'staging',
    visibility: 'internal',
    sdkVersion: '2.4.0-rc.3',
    hostedAt: 'field.staging.apps.openfoundry.internal',
    ontologyTypes: 3,
    monthlyRequests: 24_000,
    lastDeployedAt: '2026-05-18T08:14:00Z',
    themeColor: '#f472b6',
  },
  {
    id: 'osdk-billing',
    name: 'Billing Cockpit',
    description: 'Internal billing review app with reconciliation actions and ledger comparison.',
    stage: 'development',
    visibility: 'internal',
    sdkVersion: '2.4.1',
    hostedAt: '—',
    ontologyTypes: 8,
    monthlyRequests: 0,
    lastDeployedAt: '2026-05-18T16:05:00Z',
    themeColor: '#facc15',
  },
];

const STAGE_TONE: Record<Stage, string> = {
  development: '#94a3b8',
  staging: '#facc15',
  production: '#34d399',
};

const STAGE_LABEL: Record<Stage, string> = {
  development: 'Development',
  staging: 'Staging',
  production: 'Production',
};

function formatNumber(n: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(n);
}

function formatRelative(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} day(s) ago`;
}

export function OsdkAppsPage() {
  const [stageFilter, setStageFilter] = useState<'all' | Stage>('all');

  const filtered = useMemo(
    () => MOCK_APPS.filter((a) => stageFilter === 'all' || a.stage === stageFilter),
    [stageFilter],
  );

  const stats = useMemo(() => {
    const totalReq = MOCK_APPS.reduce((sum, a) => sum + a.monthlyRequests, 0);
    return {
      apps: MOCK_APPS.length,
      production: MOCK_APPS.filter((a) => a.stage === 'production').length,
      public: MOCK_APPS.filter((a) => a.visibility === 'public').length,
      requests: totalReq,
    };
  }, []);

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header className="of-hero-strip">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">Application development · Ontology SDK Apps</p>
            <h1 className="of-heading-xl" style={{ margin: 0 }}>Ontology SDK Apps</h1>
            <p className="of-text-muted" style={{ margin: 0 }}>
              Build fully-custom React apps backed by ontology APIs. Hosted on OpenFoundry subdomains or
              external domains, with the platform's governance and audit baked in.
            </p>
          </div>
          <button type="button" className="of-btn of-btn-primary" disabled title="OSDK init CLI ships in Phase 4.x">
            <Glyph name="plus" size={14} /> Create OSDK app
          </button>
        </div>
      </header>

      <section
        className="of-panel"
        style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      >
        {[
          { label: 'Apps', value: stats.apps.toString(), tone: '#a78bfa' },
          { label: 'In production', value: stats.production.toString(), tone: STAGE_TONE.production },
          { label: 'Public-facing', value: stats.public.toString(), tone: '#f472b6' },
          { label: 'Requests / month', value: formatNumber(stats.requests), tone: '#22d3ee' },
        ].map((m) => (
          <div key={m.label} style={{ display: 'grid', gap: 4 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: m.tone }}>{m.value}</p>
          </div>
        ))}
      </section>

      <section className="of-panel" style={{ padding: 12 }}>
        <div role="tablist" aria-label="Filter by stage" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(['all', 'development', 'staging', 'production'] as const).map((s) => {
            const active = stageFilter === s;
            const label = s === 'all' ? 'All stages' : STAGE_LABEL[s as Stage];
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? 'of-chip of-chip-active' : 'of-chip'}
                onClick={() => setStageFilter(s)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>
          Your OSDK apps{' '}
          <span className="of-text-muted" style={{ fontSize: 14, fontWeight: 400 }}>({filtered.length})</span>
        </h2>
        {filtered.length === 0 ? (
          <div className="of-panel" style={{ padding: 24, textAlign: 'center' }}>
            <p className="of-text-muted" style={{ margin: 0 }}>No apps at this stage yet.</p>
          </div>
        ) : (
          <div className="of-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            {filtered.map((a) => (
              <article key={a.id} className="of-card" aria-label={a.name}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: `${a.themeColor}28`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Glyph name="app" size={18} tone={a.themeColor} />
                    </span>
                    <div>
                      <h3 className="of-heading-md" style={{ margin: 0 }}>{a.name}</h3>
                      <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>
                        SDK v{a.sdkVersion} · {a.visibility === 'public' ? 'Public' : 'Internal'}
                      </p>
                    </div>
                  </div>
                  <span
                    className="of-chip"
                    style={{ color: STAGE_TONE[a.stage], borderColor: `${STAGE_TONE[a.stage]}55` }}
                  >
                    {STAGE_LABEL[a.stage]}
                  </span>
                </header>
                <p className="of-text-muted" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, minHeight: 48 }}>
                  {a.description}
                </p>
                <dl
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 8,
                    margin: '12px 0',
                    paddingTop: 12,
                    borderTop: '1px solid rgba(148, 163, 184, 0.15)',
                  }}
                >
                  <div>
                    <dt className="of-eyebrow" style={{ margin: 0, fontSize: 10 }}>Ontology types</dt>
                    <dd style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600 }}>{a.ontologyTypes}</dd>
                  </div>
                  <div>
                    <dt className="of-eyebrow" style={{ margin: 0, fontSize: 10 }}>Requests / mo</dt>
                    <dd style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600 }}>{formatNumber(a.monthlyRequests)}</dd>
                  </div>
                </dl>
                <p
                  className="of-text-muted"
                  style={{
                    margin: 0,
                    fontSize: 11,
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {a.hostedAt}
                </p>
                <p className="of-text-muted" style={{ margin: '6px 0 0', fontSize: 11 }}>
                  Last deploy {formatRelative(a.lastDeployedAt)}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

import { useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
type EndpointStatus = 'live' | 'draft' | 'disabled';

interface CustomEndpoint {
  id: string;
  method: Method;
  path: string;
  description: string;
  ontologyOperation: string;
  status: EndpointStatus;
  authMode: 'oauth2' | 'api-key' | 'public';
  callsLast24h: number;
  successRate: number;
  p95LatencyMs: number;
  updatedAt: string;
}

const MOCK_ENDPOINTS: CustomEndpoint[] = [
  {
    id: 'ep-shipments-create',
    method: 'POST',
    path: '/v1/partners/acme/shipments',
    description: 'Accepts inbound shipment manifests from ACME partner systems.',
    ontologyOperation: 'create Shipment via partner_shipment_action',
    status: 'live',
    authMode: 'oauth2',
    callsLast24h: 12_480,
    successRate: 0.998,
    p95LatencyMs: 142,
    updatedAt: '2026-05-15T10:08:00Z',
  },
  {
    id: 'ep-order-status',
    method: 'GET',
    path: '/v1/customers/:customerId/orders/:orderId/status',
    description: 'Customer self-service order status with custom response shape.',
    ontologyOperation: 'query Order by customer + order id',
    status: 'live',
    authMode: 'api-key',
    callsLast24h: 84_320,
    successRate: 0.9996,
    p95LatencyMs: 36,
    updatedAt: '2026-05-12T16:42:00Z',
  },
  {
    id: 'ep-status-public',
    method: 'GET',
    path: '/v1/public/system-status',
    description: 'Public-facing system status feed consumed by the status page.',
    ontologyOperation: 'query IncidentSummary, filtered to public visibility',
    status: 'live',
    authMode: 'public',
    callsLast24h: 196_200,
    successRate: 1.0,
    p95LatencyMs: 18,
    updatedAt: '2026-05-10T08:14:00Z',
  },
  {
    id: 'ep-cancel-order',
    method: 'DELETE',
    path: '/v1/customers/:customerId/orders/:orderId',
    description: 'Cancels an order; binds to the cancel_order Action with refund policy.',
    ontologyOperation: 'invoke cancel_order Action',
    status: 'draft',
    authMode: 'oauth2',
    callsLast24h: 0,
    successRate: 0,
    p95LatencyMs: 0,
    updatedAt: '2026-05-18T14:11:00Z',
  },
  {
    id: 'ep-driver-checkin',
    method: 'PUT',
    path: '/v1/fleet/drivers/:driverId/checkin',
    description: 'Driver mobile app check-in; persists location and status on the Driver object.',
    ontologyOperation: 'update Driver location + status',
    status: 'live',
    authMode: 'oauth2',
    callsLast24h: 38_410,
    successRate: 0.9988,
    p95LatencyMs: 58,
    updatedAt: '2026-05-09T11:20:00Z',
  },
  {
    id: 'ep-legacy-orders',
    method: 'GET',
    path: '/v1/legacy/orders',
    description: 'Legacy order feed retained for the deprecated ACME integration. Scheduled to retire 2026-09-01.',
    ontologyOperation: 'query Order (legacy projection)',
    status: 'disabled',
    authMode: 'api-key',
    callsLast24h: 0,
    successRate: 0,
    p95LatencyMs: 0,
    updatedAt: '2026-04-18T08:00:00Z',
  },
];

const METHOD_TONE: Record<Method, string> = {
  GET: '#22d3ee',
  POST: '#34d399',
  PUT: '#facc15',
  DELETE: '#f87171',
};

const STATUS_TONE: Record<EndpointStatus, string> = {
  live: '#34d399',
  draft: '#facc15',
  disabled: '#94a3b8',
};

const STATUS_LABEL: Record<EndpointStatus, string> = {
  live: 'Live',
  draft: 'Draft',
  disabled: 'Disabled',
};

const AUTH_LABEL: Record<CustomEndpoint['authMode'], string> = {
  oauth2: 'OAuth 2.0',
  'api-key': 'API key',
  public: 'Public',
};

function formatNumber(n: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(n);
}

function formatPercent(n: number) {
  if (n === 0) return '—';
  return `${(n * 100).toFixed(n >= 0.999 ? 2 : 1)}%`;
}

function formatRelative(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} day(s) ago`;
}

export function CustomEndpointsPage() {
  const [statusFilter, setStatusFilter] = useState<'all' | EndpointStatus>('all');

  const filtered = useMemo(
    () => MOCK_ENDPOINTS.filter((e) => statusFilter === 'all' || e.status === statusFilter),
    [statusFilter],
  );

  const stats = useMemo(() => {
    const live = MOCK_ENDPOINTS.filter((e) => e.status === 'live');
    const totalCalls = live.reduce((sum, e) => sum + e.callsLast24h, 0);
    const weightedSuccess =
      totalCalls > 0
        ? live.reduce((sum, e) => sum + e.successRate * e.callsLast24h, 0) / totalCalls
        : 0;
    const p95s = live.map((e) => e.p95LatencyMs).filter((v) => v > 0);
    const avgP95 = p95s.length > 0 ? Math.round(p95s.reduce((a, b) => a + b, 0) / p95s.length) : 0;
    return {
      total: MOCK_ENDPOINTS.length,
      live: live.length,
      calls24h: totalCalls,
      successRate: weightedSuccess,
      avgP95,
    };
  }, []);

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header className="of-hero-strip">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">Application development · Custom APIs</p>
            <h1 className="of-heading-xl" style={{ margin: 0 }}>Custom APIs</h1>
            <p className="of-text-muted" style={{ margin: 0 }}>
              Expose user-defined HTTP endpoints with custom URL patterns and response shapes. Endpoints bind
              to ontology operations and inherit OpenFoundry's governance, rate limits, and audit.
            </p>
          </div>
          <button type="button" className="of-btn of-btn-primary" disabled title="Endpoint editor ships in Phase 4.x">
            <Glyph name="plus" size={14} /> New endpoint
          </button>
        </div>
      </header>

      <section
        className="of-panel"
        style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      >
        {[
          { label: 'Endpoints', value: stats.total.toString(), tone: '#a78bfa' },
          { label: 'Live', value: stats.live.toString(), tone: STATUS_TONE.live },
          { label: 'Calls (24h)', value: formatNumber(stats.calls24h), tone: '#22d3ee' },
          { label: 'Success rate', value: formatPercent(stats.successRate), tone: '#34d399' },
          { label: 'Avg p95 latency', value: stats.avgP95 ? `${stats.avgP95} ms` : '—', tone: '#f472b6' },
        ].map((m) => (
          <div key={m.label} style={{ display: 'grid', gap: 4 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: m.tone }}>{m.value}</p>
          </div>
        ))}
      </section>

      <section className="of-panel" style={{ padding: 12 }}>
        <div role="tablist" aria-label="Filter by status" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(['all', 'live', 'draft', 'disabled'] as const).map((s) => {
            const active = statusFilter === s;
            const label = s === 'all' ? 'All endpoints' : STATUS_LABEL[s as EndpointStatus];
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? 'of-chip of-chip-active' : 'of-chip'}
                onClick={() => setStatusFilter(s)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>
          Endpoints{' '}
          <span className="of-text-muted" style={{ fontSize: 14, fontWeight: 400 }}>({filtered.length})</span>
        </h2>
        <div className="of-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(15, 23, 42, 0.45)' }}>
                {['Method', 'Path', 'Auth', 'Status', 'Calls (24h)', 'Success', 'p95', 'Updated'].map((h) => (
                  <th key={h} className="of-eyebrow" style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} style={{ borderTop: '1px solid rgba(148, 163, 184, 0.12)' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <span
                      className="of-chip"
                      style={{
                        color: METHOD_TONE[e.method],
                        borderColor: `${METHOD_TONE[e.method]}55`,
                        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                        fontSize: 11,
                      }}
                    >
                      {e.method}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>
                    <p
                      style={{
                        margin: 0,
                        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                        fontSize: 12,
                      }}
                    >
                      {e.path}
                    </p>
                    <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 11 }}>{e.description}</p>
                    <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 11, fontStyle: 'italic' }}>
                      ↳ {e.ontologyOperation}
                    </p>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12 }} className="of-text-muted">
                    {AUTH_LABEL[e.authMode]}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span
                      className="of-chip"
                      style={{ color: STATUS_TONE[e.status], borderColor: `${STATUS_TONE[e.status]}55` }}
                    >
                      {STATUS_LABEL[e.status]}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{formatNumber(e.callsLast24h)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{formatPercent(e.successRate)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{e.p95LatencyMs ? `${e.p95LatencyMs} ms` : '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12 }} className="of-text-muted">
                    {formatRelative(e.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

import { useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

type Algorithm = 'AES-256-GCM' | 'ChaCha20-Poly1305' | 'SHA-256-HMAC' | 'AES-256-SIV';
type ChannelStatus = 'active' | 'rotating' | 'paused';
type OperationKind = 'encrypt' | 'decrypt' | 'hash' | 'verify';
type OperationOutcome = 'succeeded' | 'denied' | 'failed';

interface CryptoChannel {
  id: string;
  name: string;
  description: string;
  algorithm: Algorithm;
  status: ChannelStatus;
  keyVersion: number;
  rotatesEvery: string;
  lastRotatedAt: string;
  operationsLast24h: number;
  authorizedGroups: string[];
}

interface CryptoOperation {
  id: string;
  channel: string;
  kind: OperationKind;
  outcome: OperationOutcome;
  caller: string;
  payloadSize: string;
  durationMs: number;
  occurredAt: string;
}

const MOCK_CHANNELS: CryptoChannel[] = [
  {
    id: 'ch-pii-rest',
    name: 'PII at-rest',
    description: 'Application-layer encryption for PII fields stored beyond the platform key envelope.',
    algorithm: 'AES-256-GCM',
    status: 'active',
    keyVersion: 7,
    rotatesEvery: 'every 90 days',
    lastRotatedAt: '2026-04-22T08:00:00Z',
    operationsLast24h: 38_410,
    authorizedGroups: ['platform-admins', 'pii-readers'],
  },
  {
    id: 'ch-finance-hash',
    name: 'Finance reference hashing',
    description: 'Deterministic hashing for cross-system reconciliation of account references.',
    algorithm: 'SHA-256-HMAC',
    status: 'active',
    keyVersion: 3,
    rotatesEvery: 'every 180 days',
    lastRotatedAt: '2026-02-04T09:30:00Z',
    operationsLast24h: 9_120,
    authorizedGroups: ['finance-ops'],
  },
  {
    id: 'ch-partner-share',
    name: 'Partner share envelope',
    description: 'Encryption used by Peer Manager outbound shares for ACME partner enrollment.',
    algorithm: 'AES-256-SIV',
    status: 'rotating',
    keyVersion: 12,
    rotatesEvery: 'every 30 days',
    lastRotatedAt: '2026-05-18T10:14:00Z',
    operationsLast24h: 2_404,
    authorizedGroups: ['peer-bridge', 'platform-admins'],
  },
  {
    id: 'ch-legacy-payments',
    name: 'Legacy payments channel',
    description: 'Retained for read-back of pre-migration payment records. Decryption only.',
    algorithm: 'ChaCha20-Poly1305',
    status: 'paused',
    keyVersion: 1,
    rotatesEvery: 'frozen',
    lastRotatedAt: '2025-11-10T12:00:00Z',
    operationsLast24h: 0,
    authorizedGroups: ['finance-ops'],
  },
];

const MOCK_OPERATIONS: CryptoOperation[] = [
  { id: 'op-1', channel: 'PII at-rest',                kind: 'encrypt', outcome: 'succeeded', caller: 'service:ingest',         payloadSize: '4.2 MB',  durationMs: 38,  occurredAt: '2026-05-18T15:48:00Z' },
  { id: 'op-2', channel: 'PII at-rest',                kind: 'decrypt', outcome: 'succeeded', caller: 'user:m.alvarez',         payloadSize: '12 KB',   durationMs: 6,   occurredAt: '2026-05-18T15:42:00Z' },
  { id: 'op-3', channel: 'Partner share envelope',     kind: 'encrypt', outcome: 'succeeded', caller: 'service:peer-bridge',    payloadSize: '184 MB',  durationMs: 412, occurredAt: '2026-05-18T15:14:00Z' },
  { id: 'op-4', channel: 'Finance reference hashing',  kind: 'hash',    outcome: 'succeeded', caller: 'service:reconciler',     payloadSize: '256 KB',  durationMs: 22,  occurredAt: '2026-05-18T14:30:00Z' },
  { id: 'op-5', channel: 'PII at-rest',                kind: 'decrypt', outcome: 'denied',    caller: 'user:n.diaz',            payloadSize: '12 KB',   durationMs: 3,   occurredAt: '2026-05-18T13:54:00Z' },
  { id: 'op-6', channel: 'Legacy payments channel',    kind: 'decrypt', outcome: 'succeeded', caller: 'service:report-runner',  payloadSize: '880 KB',  durationMs: 64,  occurredAt: '2026-05-17T22:18:00Z' },
];

const STATUS_TONE: Record<ChannelStatus, string> = {
  active: '#34d399',
  rotating: '#facc15',
  paused: '#94a3b8',
};

const STATUS_LABEL: Record<ChannelStatus, string> = {
  active: 'Active',
  rotating: 'Rotating',
  paused: 'Paused',
};

const KIND_TONE: Record<OperationKind, string> = {
  encrypt: '#22d3ee',
  decrypt: '#a78bfa',
  hash: '#34d399',
  verify: '#facc15',
};

const OUTCOME_TONE: Record<OperationOutcome, string> = {
  succeeded: '#34d399',
  denied: '#f87171',
  failed: '#fbbf24',
};

const OUTCOME_LABEL: Record<OperationOutcome, string> = {
  succeeded: 'Succeeded',
  denied: 'Denied',
  failed: 'Failed',
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

export function CipherPage() {
  const [statusFilter, setStatusFilter] = useState<'all' | ChannelStatus>('all');

  const filtered = useMemo(
    () => MOCK_CHANNELS.filter((c) => statusFilter === 'all' || c.status === statusFilter),
    [statusFilter],
  );

  const stats = useMemo(() => {
    return {
      channels: MOCK_CHANNELS.length,
      active: MOCK_CHANNELS.filter((c) => c.status === 'active').length,
      operations: MOCK_CHANNELS.reduce((sum, c) => sum + c.operationsLast24h, 0),
      denied: MOCK_OPERATIONS.filter((o) => o.outcome === 'denied').length,
    };
  }, []);

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header className="of-hero-strip">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">Security & Governance · Crypto Service</p>
            <h1 className="of-heading-xl" style={{ margin: 0 }}>Crypto Service</h1>
            <p className="of-text-muted" style={{ margin: 0 }}>
              Application-layer encryption, hashing, and key-rotation channels for sensitive payloads — an
              additional privacy layer on top of OpenFoundry's at-rest encryption.
            </p>
          </div>
          <button type="button" className="of-btn of-btn-primary" disabled title="Channel editor ships in Phase 4.x">
            <Glyph name="plus" size={14} /> New channel
          </button>
        </div>
      </header>

      <section
        className="of-panel"
        style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      >
        {[
          { label: 'Channels', value: stats.channels.toString(), tone: '#a78bfa' },
          { label: 'Active', value: stats.active.toString(), tone: STATUS_TONE.active },
          { label: 'Operations (24h)', value: formatNumber(stats.operations), tone: '#22d3ee' },
          { label: 'Denied requests', value: stats.denied.toString(), tone: OUTCOME_TONE.denied },
        ].map((m) => (
          <div key={m.label} style={{ display: 'grid', gap: 4 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: m.tone }}>{m.value}</p>
          </div>
        ))}
      </section>

      <section className="of-panel" style={{ padding: 12 }}>
        <div role="tablist" aria-label="Filter channels" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(['all', 'active', 'rotating', 'paused'] as const).map((s) => {
            const active = statusFilter === s;
            const label = s === 'all' ? 'All channels' : STATUS_LABEL[s as ChannelStatus];
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
          Cryptographic channels{' '}
          <span className="of-text-muted" style={{ fontSize: 14, fontWeight: 400 }}>({filtered.length})</span>
        </h2>
        <div className="of-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
          {filtered.map((c) => (
            <article key={c.id} className="of-card" aria-label={c.name}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: 'rgba(167, 139, 250, 0.18)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Glyph name="lock" size={16} tone="#a78bfa" />
                  </span>
                  <div>
                    <h3 className="of-heading-md" style={{ margin: 0 }}>{c.name}</h3>
                    <p
                      className="of-text-muted"
                      style={{
                        margin: '2px 0 0',
                        fontSize: 11,
                        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                      }}
                    >
                      {c.algorithm} · v{c.keyVersion}
                    </p>
                  </div>
                </div>
                <span
                  className="of-chip"
                  style={{ color: STATUS_TONE[c.status], borderColor: `${STATUS_TONE[c.status]}55` }}
                >
                  {STATUS_LABEL[c.status]}
                </span>
              </header>
              <p className="of-text-muted" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, minHeight: 44 }}>
                {c.description}
              </p>
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  margin: '12px 0 0',
                  paddingTop: 10,
                  borderTop: '1px solid rgba(148, 163, 184, 0.15)',
                }}
              >
                <div>
                  <dt className="of-eyebrow" style={{ margin: 0, fontSize: 10 }}>Rotates</dt>
                  <dd style={{ margin: '4px 0 0', fontSize: 12 }}>{c.rotatesEvery}</dd>
                </div>
                <div>
                  <dt className="of-eyebrow" style={{ margin: 0, fontSize: 10 }}>Last rotated</dt>
                  <dd className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{formatRelative(c.lastRotatedAt)}</dd>
                </div>
                <div>
                  <dt className="of-eyebrow" style={{ margin: 0, fontSize: 10 }}>Operations (24h)</dt>
                  <dd style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600 }}>{formatNumber(c.operationsLast24h)}</dd>
                </div>
                <div>
                  <dt className="of-eyebrow" style={{ margin: 0, fontSize: 10 }}>Authorized groups</dt>
                  <dd style={{ margin: '4px 0 0', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {c.authorizedGroups.map((g) => (
                      <span key={g} className="of-chip" style={{ fontSize: 10 }}>{g}</span>
                    ))}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>Recent operations</h2>
        <div className="of-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(15, 23, 42, 0.45)' }}>
                {['When', 'Channel', 'Op', 'Caller', 'Payload', 'Duration', 'Outcome'].map((h) => (
                  <th key={h} className="of-eyebrow" style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_OPERATIONS.map((o) => (
                <tr key={o.id} style={{ borderTop: '1px solid rgba(148, 163, 184, 0.12)' }}>
                  <td style={{ padding: '10px 14px', fontSize: 12 }} className="of-text-muted">
                    {formatRelative(o.occurredAt)}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{o.channel}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span
                      className="of-chip"
                      style={{
                        color: KIND_TONE[o.kind],
                        borderColor: `${KIND_TONE[o.kind]}55`,
                        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                        fontSize: 11,
                      }}
                    >
                      {o.kind}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '10px 14px',
                      fontSize: 12,
                      fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    }}
                  >
                    {o.caller}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{o.payloadSize}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{o.durationMs} ms</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span
                      className="of-chip"
                      style={{ color: OUTCOME_TONE[o.outcome], borderColor: `${OUTCOME_TONE[o.outcome]}55` }}
                    >
                      {OUTCOME_LABEL[o.outcome]}
                    </span>
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

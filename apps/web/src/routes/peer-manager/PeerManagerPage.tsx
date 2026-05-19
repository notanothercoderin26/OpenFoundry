import { useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

type PeerStatus = 'active' | 'pending' | 'paused' | 'failed';
type PeeringTab = 'ontology' | 'files';

interface PeerProfile {
  id: string;
  name: string;
  description: string;
  status: PeerStatus;
  region: string;
  ontologySharedTypes: number;
  fileShares: number;
  lastSyncAt: string;
  themeColor: string;
}

interface OntologyShare {
  id: string;
  objectType: string;
  direction: 'inbound' | 'outbound' | 'bidirectional';
  peer: string;
  count: number;
  lastSyncedAt: string;
}

interface FileShare {
  id: string;
  datasetName: string;
  peer: string;
  direction: 'inbound' | 'outbound';
  sizeMB: number;
  status: 'synced' | 'syncing' | 'paused';
  lastSyncedAt: string;
}

const MOCK_PEERS: PeerProfile[] = [
  {
    id: 'peer-eu',
    name: 'OpenFoundry EU',
    description: 'European production enrollment hosted in Frankfurt for GDPR-bound workloads.',
    status: 'active',
    region: 'eu-central-1',
    ontologySharedTypes: 4,
    fileShares: 12,
    lastSyncAt: '2026-05-18T15:48:00Z',
    themeColor: '#22d3ee',
  },
  {
    id: 'peer-apac',
    name: 'OpenFoundry APAC',
    description: 'APAC production enrollment serving Singapore and Sydney customers.',
    status: 'active',
    region: 'ap-southeast-1',
    ontologySharedTypes: 2,
    fileShares: 5,
    lastSyncAt: '2026-05-18T14:02:00Z',
    themeColor: '#a78bfa',
  },
  {
    id: 'peer-partner-acme',
    name: 'ACME Logistics (partner)',
    description: 'Partner enrollment exchanging shipment manifests under DPA-2026-04.',
    status: 'pending',
    region: 'us-east-1',
    ontologySharedTypes: 1,
    fileShares: 0,
    lastSyncAt: '2026-05-18T10:30:00Z',
    themeColor: '#f472b6',
  },
  {
    id: 'peer-sandbox',
    name: 'Internal Sandbox',
    description: 'Long-lived sandbox enrollment used by the data science team for experiments.',
    status: 'paused',
    region: 'us-east-1',
    ontologySharedTypes: 3,
    fileShares: 2,
    lastSyncAt: '2026-05-15T09:14:00Z',
    themeColor: '#94a3b8',
  },
];

const MOCK_ONTOLOGY_SHARES: OntologyShare[] = [
  { id: 'os-1', objectType: 'Shipment',  direction: 'bidirectional', peer: 'OpenFoundry EU',   count: 8_420, lastSyncedAt: '2026-05-18T15:48:00Z' },
  { id: 'os-2', objectType: 'Customer',  direction: 'outbound',      peer: 'OpenFoundry EU',   count: 12_300, lastSyncedAt: '2026-05-18T15:48:00Z' },
  { id: 'os-3', objectType: 'Warehouse', direction: 'outbound',      peer: 'OpenFoundry APAC', count: 88,    lastSyncedAt: '2026-05-18T14:02:00Z' },
  { id: 'os-4', objectType: 'Shipment',  direction: 'inbound',       peer: 'ACME Logistics (partner)', count: 0, lastSyncedAt: '2026-05-18T10:30:00Z' },
];

const MOCK_FILE_SHARES: FileShare[] = [
  { id: 'fs-1', datasetName: 'gold/customers',         peer: 'OpenFoundry EU',   direction: 'outbound', sizeMB: 480, status: 'synced',  lastSyncedAt: '2026-05-18T15:48:00Z' },
  { id: 'fs-2', datasetName: 'gold/orders-eu',         peer: 'OpenFoundry EU',   direction: 'inbound',  sizeMB: 920, status: 'synced',  lastSyncedAt: '2026-05-18T15:30:00Z' },
  { id: 'fs-3', datasetName: 'silver/inventory-apac',  peer: 'OpenFoundry APAC', direction: 'inbound',  sizeMB: 210, status: 'syncing', lastSyncedAt: '2026-05-18T14:02:00Z' },
  { id: 'fs-4', datasetName: 'bronze/sandbox-raw',     peer: 'Internal Sandbox', direction: 'outbound', sizeMB: 30,  status: 'paused',  lastSyncedAt: '2026-05-15T09:14:00Z' },
];

const STATUS_TONE: Record<PeerStatus, string> = {
  active: '#34d399',
  pending: '#facc15',
  paused: '#94a3b8',
  failed: '#f87171',
};

const STATUS_LABEL: Record<PeerStatus, string> = {
  active: 'Active',
  pending: 'Pending',
  paused: 'Paused',
  failed: 'Failed',
};

const DIRECTION_LABEL: Record<'inbound' | 'outbound' | 'bidirectional', string> = {
  inbound: '← Inbound',
  outbound: 'Outbound →',
  bidirectional: '↔ Bidirectional',
};

const FILE_STATUS_TONE: Record<FileShare['status'], string> = {
  synced: '#34d399',
  syncing: '#facc15',
  paused: '#94a3b8',
};

function formatRelative(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} day(s) ago`;
}

function formatSize(mb: number) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

export function PeerManagerPage() {
  const [tab, setTab] = useState<PeeringTab>('ontology');

  const summary = useMemo(() => {
    return {
      peers: MOCK_PEERS.length,
      active: MOCK_PEERS.filter((p) => p.status === 'active').length,
      ontologyShares: MOCK_ONTOLOGY_SHARES.length,
      fileShares: MOCK_FILE_SHARES.length,
    };
  }, []);

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header className="of-hero-strip">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">Data integration · Peer Manager</p>
            <h1 className="of-heading-xl" style={{ margin: 0 }}>Peer Manager</h1>
            <p className="of-text-muted" style={{ margin: 0 }}>
              Securely exchange ontology objects and files between enrollments while preserving governance and
              access controls.
            </p>
          </div>
          <button type="button" className="of-btn of-btn-primary" disabled title="Onboarding wizard ships in Phase 4.x">
            <Glyph name="plus" size={14} /> Add peer
          </button>
        </div>
      </header>

      <section
        className="of-panel"
        style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      >
        {[
          { label: 'Peers', value: summary.peers.toString(), tone: '#a78bfa' },
          { label: 'Active', value: summary.active.toString(), tone: STATUS_TONE.active },
          { label: 'Ontology shares', value: summary.ontologyShares.toString(), tone: '#22d3ee' },
          { label: 'File shares', value: summary.fileShares.toString(), tone: '#f472b6' },
        ].map((m) => (
          <div key={m.label} style={{ display: 'grid', gap: 4 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: m.tone }}>{m.value}</p>
          </div>
        ))}
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>Peer profiles</h2>
        <div className="of-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          {MOCK_PEERS.map((p) => (
            <article key={p.id} className="of-card" aria-label={p.name}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: `${p.themeColor}28`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Glyph name="link" size={16} tone={p.themeColor} />
                  </span>
                  <div>
                    <h3 className="of-heading-md" style={{ margin: 0 }}>{p.name}</h3>
                    <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>{p.region}</p>
                  </div>
                </div>
                <span
                  className="of-chip"
                  style={{ color: STATUS_TONE[p.status], borderColor: `${STATUS_TONE[p.status]}55` }}
                >
                  {STATUS_LABEL[p.status]}
                </span>
              </header>
              <p className="of-text-muted" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, minHeight: 48 }}>
                {p.description}
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
                  <dt className="of-eyebrow" style={{ margin: 0, fontSize: 10 }}>Object types</dt>
                  <dd style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600 }}>{p.ontologySharedTypes}</dd>
                </div>
                <div>
                  <dt className="of-eyebrow" style={{ margin: 0, fontSize: 10 }}>File shares</dt>
                  <dd style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600 }}>{p.fileShares}</dd>
                </div>
              </dl>
              <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>
                Last sync {formatRelative(p.lastSyncAt)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
        <div role="tablist" aria-label="Share type" style={{ display: 'flex', gap: 6 }}>
          {(['ontology', 'files'] as const).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? 'of-chip of-chip-active' : 'of-chip'}
                onClick={() => setTab(t)}
              >
                {t === 'ontology' ? 'Ontology shares' : 'File shares'}
              </button>
            );
          })}
        </div>

        {tab === 'ontology' ? (
          <div style={{ overflow: 'hidden', borderRadius: 8, border: '1px solid rgba(148, 163, 184, 0.18)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.45)' }}>
                  {['Object type', 'Peer', 'Direction', 'Objects', 'Last sync'].map((h) => (
                    <th key={h} className="of-eyebrow" style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_ONTOLOGY_SHARES.map((s) => (
                  <tr key={s.id} style={{ borderTop: '1px solid rgba(148, 163, 184, 0.12)' }}>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{s.objectType}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13 }}>{s.peer}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13 }} className="of-text-muted">
                      {DIRECTION_LABEL[s.direction]}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13 }}>{s.count.toLocaleString()}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13 }} className="of-text-muted">
                      {formatRelative(s.lastSyncedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ overflow: 'hidden', borderRadius: 8, border: '1px solid rgba(148, 163, 184, 0.18)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.45)' }}>
                  {['Dataset', 'Peer', 'Direction', 'Size', 'Status', 'Last sync'].map((h) => (
                    <th key={h} className="of-eyebrow" style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_FILE_SHARES.map((f) => (
                  <tr key={f.id} style={{ borderTop: '1px solid rgba(148, 163, 184, 0.12)' }}>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{f.datasetName}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13 }}>{f.peer}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13 }} className="of-text-muted">
                      {DIRECTION_LABEL[f.direction]}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13 }}>{formatSize(f.sizeMB)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        className="of-chip"
                        style={{ color: FILE_STATUS_TONE[f.status], borderColor: `${FILE_STATUS_TONE[f.status]}55` }}
                      >
                        {f.status === 'synced' ? 'Synced' : f.status === 'syncing' ? 'Syncing' : 'Paused'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13 }} className="of-text-muted">
                      {formatRelative(f.lastSyncedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

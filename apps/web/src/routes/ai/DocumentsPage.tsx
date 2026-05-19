import { useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

type Strategy = 'raw-text' | 'ocr' | 'layout-ocr' | 'vlm';
type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

interface StrategyDef {
  id: Strategy;
  name: string;
  description: string;
  cost: string;
  themeColor: string;
}

interface ExtractionJob {
  id: string;
  documentName: string;
  pages: number;
  strategy: Strategy;
  status: JobStatus;
  qualityScore: number | null;
  durationSec: number | null;
  tokens: number | null;
  startedAt: string;
}

const STRATEGIES: StrategyDef[] = [
  {
    id: 'raw-text',
    name: 'Raw text',
    description: 'Parse the embedded text layer of PDFs and digital documents directly.',
    cost: 'Lowest cost',
    themeColor: '#34d399',
  },
  {
    id: 'ocr',
    name: 'OCR',
    description: 'Optical character recognition for scanned documents without an embedded text layer.',
    cost: 'Medium cost',
    themeColor: '#22d3ee',
  },
  {
    id: 'layout-ocr',
    name: 'Layout-aware OCR',
    description: 'OCR with layout preservation for tables, columns, and headers.',
    cost: 'High cost',
    themeColor: '#a78bfa',
  },
  {
    id: 'vlm',
    name: 'Vision LLM',
    description: 'Vision-language model extraction with customizable prompts and structured output.',
    cost: 'Highest cost',
    themeColor: '#f472b6',
  },
];

const MOCK_JOBS: ExtractionJob[] = [
  {
    id: 'job-1',
    documentName: 'Q1-financials.pdf',
    pages: 28,
    strategy: 'layout-ocr',
    status: 'succeeded',
    qualityScore: 0.94,
    durationSec: 142,
    tokens: 18_450,
    startedAt: '2026-05-18T09:30:00Z',
  },
  {
    id: 'job-2',
    documentName: 'Bill-of-lading-batch.zip',
    pages: 312,
    strategy: 'vlm',
    status: 'running',
    qualityScore: null,
    durationSec: null,
    tokens: null,
    startedAt: '2026-05-18T15:12:00Z',
  },
  {
    id: 'job-3',
    documentName: 'Customer-feedback-2026-Q1.docx',
    pages: 14,
    strategy: 'raw-text',
    status: 'succeeded',
    qualityScore: 0.99,
    durationSec: 6,
    tokens: 3_220,
    startedAt: '2026-05-17T18:45:00Z',
  },
  {
    id: 'job-4',
    documentName: 'Legal-contract-v3.pdf',
    pages: 64,
    strategy: 'ocr',
    status: 'failed',
    qualityScore: null,
    durationSec: 32,
    tokens: 0,
    startedAt: '2026-05-17T11:09:00Z',
  },
];

const STATUS_TONE: Record<JobStatus, string> = {
  queued: '#94a3b8',
  running: '#facc15',
  succeeded: '#34d399',
  failed: '#f87171',
};

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
};

function strategyName(id: Strategy) {
  return STRATEGIES.find((s) => s.id === id)?.name ?? id;
}

function formatRelative(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} day(s) ago`;
}

export function DocumentsPage() {
  const [strategy, setStrategy] = useState<Strategy>('layout-ocr');

  const succeeded = MOCK_JOBS.filter((j) => j.status === 'succeeded');
  const avgQuality =
    succeeded.length > 0
      ? Math.round((succeeded.reduce((sum, j) => sum + (j.qualityScore ?? 0), 0) / succeeded.length) * 100)
      : 0;
  const totalTokens = MOCK_JOBS.reduce((sum, j) => sum + (j.tokens ?? 0), 0);
  const avgDuration =
    succeeded.length > 0
      ? Math.round(succeeded.reduce((sum, j) => sum + (j.durationSec ?? 0), 0) / succeeded.length)
      : 0;

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header className="of-hero-strip">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">AI Platform · Document AI</p>
            <h1 className="of-heading-xl" style={{ margin: 0 }}>Document AI</h1>
            <p className="of-text-muted" style={{ margin: 0 }}>
              Compare extraction strategies — OCR, layout-aware, and vision LLMs — then promote the winning
              strategy into a Python transform with one click.
            </p>
          </div>
          <button type="button" className="of-btn of-btn-primary" disabled title="Extraction runner ships in Phase 4.x">
            <Glyph name="plus" size={14} /> New extraction
          </button>
        </div>
      </header>

      <section
        className="of-panel"
        style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
      >
        {[
          { label: 'Avg. quality', value: `${avgQuality}%`, tone: '#34d399' },
          { label: 'Avg. duration', value: `${avgDuration}s`, tone: '#22d3ee' },
          { label: 'Tokens this week', value: totalTokens.toLocaleString(), tone: '#a78bfa' },
          { label: 'Active jobs', value: MOCK_JOBS.filter((j) => j.status === 'running').length.toString(), tone: '#facc15' },
        ].map((m) => (
          <div key={m.label} style={{ display: 'grid', gap: 4 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: m.tone }}>{m.value}</p>
          </div>
        ))}
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>Extraction strategies</h2>
        <div className="of-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {STRATEGIES.map((s) => {
            const active = strategy === s.id;
            return (
              <button
                key={s.id}
                type="button"
                className="of-card"
                onClick={() => setStrategy(s.id)}
                style={{
                  textAlign: 'left',
                  padding: 14,
                  cursor: 'pointer',
                  border: active ? `1px solid ${s.themeColor}` : undefined,
                }}
                aria-pressed={active}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-flex',
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: `${s.themeColor}28`,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 10,
                  }}
                >
                  <Glyph name="document" size={16} tone={s.themeColor} />
                </span>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{s.name}</p>
                <p className="of-text-muted" style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.5 }}>{s.description}</p>
                <p className="of-text-muted" style={{ margin: '8px 0 0', fontSize: 11 }}>{s.cost}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>Recent jobs</h2>
        <div className="of-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(15, 23, 42, 0.45)' }}>
                {['Document', 'Strategy', 'Status', 'Quality', 'Duration', 'Tokens', 'Started'].map((h) => (
                  <th key={h} className="of-eyebrow" style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_JOBS.map((j) => (
                <tr key={j.id} style={{ borderTop: '1px solid rgba(148, 163, 184, 0.12)' }}>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>
                    {j.documentName}
                    <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>{j.pages} pages</p>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{strategyName(j.strategy)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span className="of-chip" style={{ color: STATUS_TONE[j.status], borderColor: `${STATUS_TONE[j.status]}55` }}>
                      {STATUS_LABEL[j.status]}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>
                    {j.qualityScore == null ? '—' : `${Math.round(j.qualityScore * 100)}%`}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>
                    {j.durationSec == null ? '—' : `${j.durationSec}s`}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>
                    {j.tokens == null ? '—' : j.tokens.toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }} className="of-text-muted">
                    {formatRelative(j.startedAt)}
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

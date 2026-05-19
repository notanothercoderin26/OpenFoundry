import { useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

interface ThreadDocument {
  id: string;
  name: string;
  pages: number;
}

interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: { doc: string; page: number }[];
}

interface Thread {
  id: string;
  title: string;
  documents: ThreadDocument[];
  messages: ThreadMessage[];
  updatedAt: string;
}

const MOCK_THREADS: Thread[] = [
  {
    id: 'th-rfp',
    title: 'RFP review · ACME procurement',
    updatedAt: '2026-05-18T11:24:00Z',
    documents: [
      { id: 'd1', name: 'ACME-RFP-2026.pdf', pages: 42 },
      { id: 'd2', name: 'Vendor-Q&A-attachment.pdf', pages: 8 },
    ],
    messages: [
      { id: 'm1', role: 'user', text: 'What SLAs does ACME require for incident response?' },
      {
        id: 'm2',
        role: 'assistant',
        text:
          '15-minute acknowledgement for Severity-1, 1-hour acknowledgement for Severity-2. Resolution targets are 4 hours and 8 hours respectively, with optional escalation paths described in §6.3.',
        citations: [
          { doc: 'ACME-RFP-2026.pdf', page: 18 },
          { doc: 'ACME-RFP-2026.pdf', page: 19 },
        ],
      },
      { id: 'm3', role: 'user', text: 'Do they accept third-party SOC 2 reports?' },
      {
        id: 'm4',
        role: 'assistant',
        text: 'Yes, but only if issued within the last 12 months and accompanied by the bridge letter from the auditor.',
        citations: [{ doc: 'Vendor-Q&A-attachment.pdf', page: 3 }],
      },
    ],
  },
  {
    id: 'th-incident',
    title: 'Incident report · CHK-1042 post-mortem',
    updatedAt: '2026-05-17T16:08:00Z',
    documents: [
      { id: 'd3', name: 'CHK-1042-post-mortem.docx', pages: 6 },
      { id: 'd4', name: 'Grafana-snapshot.png', pages: 1 },
    ],
    messages: [
      { id: 'm5', role: 'user', text: 'What was the root cause?' },
      {
        id: 'm6',
        role: 'assistant',
        text: 'Misconfigured retry policy on the checkout-orchestrator service amplified a transient database failover into a 23-minute outage.',
        citations: [{ doc: 'CHK-1042-post-mortem.docx', page: 2 }],
      },
    ],
  },
];

function formatRelative(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} day(s) ago`;
}

export function ThreadsPage() {
  const [activeThreadId, setActiveThreadId] = useState<string>(MOCK_THREADS[0].id);
  const [draft, setDraft] = useState('');

  const activeThread = useMemo(
    () => MOCK_THREADS.find((t) => t.id === activeThreadId) ?? MOCK_THREADS[0],
    [activeThreadId],
  );

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header className="of-hero-strip">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">AI Platform · AI Threads</p>
            <h1 className="of-heading-xl" style={{ margin: 0 }}>AI Threads</h1>
            <p className="of-text-muted" style={{ margin: 0 }}>
              Multi-document chat with citation-backed answers. Upload PDFs, transcripts, or reports and ask
              questions across them.
            </p>
          </div>
          <button type="button" className="of-btn of-btn-primary" disabled title="New thread arrives in Phase 4.x">
            <Glyph name="plus" size={14} /> New thread
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(220px, 1fr) minmax(0, 2fr) minmax(220px, 1fr)' }}>
        <aside className="of-panel" style={{ padding: 12, display: 'grid', gap: 8, alignSelf: 'start' }}>
          <p className="of-eyebrow" style={{ margin: 0 }}>Threads</p>
          {MOCK_THREADS.map((t) => {
            const active = t.id === activeThreadId;
            return (
              <button
                key={t.id}
                type="button"
                className="of-card"
                onClick={() => setActiveThreadId(t.id)}
                style={{
                  textAlign: 'left',
                  padding: 10,
                  cursor: 'pointer',
                  border: active ? '1px solid #67e8f9' : undefined,
                }}
              >
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{t.title}</p>
                <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 11 }}>
                  {t.documents.length} doc(s) · {formatRelative(t.updatedAt)}
                </p>
              </button>
            );
          })}
        </aside>

        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <h2 className="of-heading-md" style={{ margin: 0 }}>{activeThread.title}</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {activeThread.messages.map((m) => (
              <div
                key={m.id}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: m.role === 'user' ? 'rgba(167, 139, 250, 0.12)' : 'rgba(15, 23, 42, 0.4)',
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                }}
              >
                <p className="of-eyebrow" style={{ margin: 0 }}>{m.role === 'user' ? 'You' : 'Assistant'}</p>
                <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.55 }}>{m.text}</p>
                {m.citations && m.citations.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {m.citations.map((c, idx) => (
                      <span key={`${m.id}-c${idx}`} className="of-chip" style={{ fontSize: 11 }}>
                        {c.doc} · p.{c.page}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask a follow-up about these documents…"
              aria-label="New message"
              style={{
                background: 'rgba(15, 23, 42, 0.35)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: 10,
                padding: '10px 12px',
                color: 'inherit',
                fontSize: 14,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="of-btn of-btn-primary" disabled>
                <Glyph name="sparkles" size={14} /> Send
              </button>
            </div>
          </div>
        </section>

        <aside className="of-panel" style={{ padding: 14, display: 'grid', gap: 10, alignSelf: 'start' }}>
          <p className="of-eyebrow" style={{ margin: 0 }}>Documents in this thread</p>
          {activeThread.documents.map((d) => (
            <div key={d.id} className="of-card" style={{ padding: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
              <Glyph name="document" size={16} tone="#facc15" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.name}
                </p>
                <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>{d.pages} pages</p>
              </div>
            </div>
          ))}
          <button type="button" className="of-btn of-btn-ghost" disabled>
            <Glyph name="plus" size={12} /> Attach document
          </button>
        </aside>
      </div>
    </section>
  );
}

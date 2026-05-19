import { useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

interface AssistExchange {
  id: string;
  question: string;
  answer: string;
  sources: string[];
  timestamp: string;
}

const SUGGESTED_PROMPTS: { id: string; label: string; prompt: string }[] = [
  { id: 's1', label: 'Pipeline basics', prompt: 'How do I author a streaming pipeline in Pipeline Builder?' },
  { id: 's2', label: 'Workshop variables', prompt: 'What are Workshop variables and when should I use them?' },
  { id: 's3', label: 'Action types', prompt: 'How do I define an Action Type that mutates an ontology object?' },
  { id: 's4', label: 'Code repos', prompt: 'How are protected merges configured in Code Repositories?' },
];

const HISTORY: AssistExchange[] = [
  {
    id: 'ex-1',
    question: 'How do I make a build run only when an upstream dataset is healthy?',
    answer:
      'In Pipeline Builder, open the build settings and add a precondition referencing the upstream dataset. Use the "Skip if upstream unhealthy" toggle so builds enter the "skipped" state instead of failing when the upstream check is red.',
    sources: ['Pipeline Builder · Build conditions', 'Foundry Rules · Health checks'],
    timestamp: '2026-05-18T13:42:00Z',
  },
  {
    id: 'ex-2',
    question: 'Where do I see the audit trail for a published Workshop app?',
    answer:
      'Open the Workshop app, click the share menu, and choose "Audit history". Detailed read/write events are also surfaced in Approvals for any change subject to review.',
    sources: ['Workshop · Sharing', 'Approvals overview'],
    timestamp: '2026-05-17T17:08:00Z',
  },
];

function formatRelative(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} day(s) ago`;
}

export function AssistPage() {
  const [prompt, setPrompt] = useState('');

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header className="of-hero-strip">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">AI Platform · AI Assist</p>
            <h1 className="of-heading-xl" style={{ margin: 0 }}>AI Assist</h1>
            <p className="of-text-muted" style={{ margin: 0 }}>
              In-product help for OpenFoundry. Ask questions about docs, navigate to apps, or get step-by-step
              guidance grounded in your enrollment's documentation.
            </p>
          </div>
          <span className="of-chip">Roadmap · Phase 4.2</span>
        </div>
      </header>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 2fr) minmax(220px, 1fr)' }}>
        <section style={{ display: 'grid', gap: 12 }}>
          <div className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Ask anything about OpenFoundry…"
              aria-label="Assist prompt"
              style={{
                width: '100%',
                resize: 'vertical',
                background: 'rgba(15, 23, 42, 0.35)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: 10,
                padding: 12,
                color: 'inherit',
                fontFamily: 'inherit',
                fontSize: 14,
                lineHeight: 1.5,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="of-btn of-btn-ghost" onClick={() => setPrompt('')} disabled={!prompt.trim()}>
                Clear
              </button>
              <button type="button" className="of-btn of-btn-primary" disabled title="Assist engine lands in Phase 4.x">
                <Glyph name="asterisk" size={14} /> Ask
              </button>
            </div>
          </div>

          <h2 className="of-heading-md" style={{ margin: 0 }}>Recent answers</h2>
          {HISTORY.map((ex) => (
            <article key={ex.id} className="of-panel" style={{ padding: 14, display: 'grid', gap: 8 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>{ex.question}</p>
              <p className="of-text-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{ex.answer}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ex.sources.map((s) => (
                    <span key={s} className="of-chip" style={{ fontSize: 11 }}>{s}</span>
                  ))}
                </div>
                <span className="of-text-muted" style={{ fontSize: 11 }}>{formatRelative(ex.timestamp)}</span>
              </div>
            </article>
          ))}
        </section>

        <aside className="of-panel" style={{ padding: 14, display: 'grid', gap: 10, alignSelf: 'start' }}>
          <p className="of-eyebrow" style={{ margin: 0 }}>Suggested prompts</p>
          {SUGGESTED_PROMPTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="of-card"
              onClick={() => setPrompt(s.prompt)}
              style={{ textAlign: 'left', padding: 10, cursor: 'pointer' }}
            >
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{s.label}</p>
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.4 }}>{s.prompt}</p>
            </button>
          ))}
        </aside>
      </div>
    </section>
  );
}

import { useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

type StepStatus = 'planned' | 'running' | 'succeeded' | 'failed' | 'skipped';

interface ToolCall {
  id: string;
  tool: string;
  arguments: string;
  result: string;
  status: 'succeeded' | 'failed';
}

interface PlanStep {
  id: string;
  description: string;
  status: StepStatus;
  toolCalls: ToolCall[];
}

interface OperatorSession {
  id: string;
  prompt: string;
  status: 'planning' | 'running' | 'awaiting-approval' | 'succeeded' | 'failed';
  startedAt: string;
  steps: PlanStep[];
}

const MOCK_SESSIONS: OperatorSession[] = [
  {
    id: 'sess-1',
    prompt: 'Create a streaming pipeline that ingests Stripe webhook events into the Payments ontology.',
    status: 'awaiting-approval',
    startedAt: '2026-05-18T14:55:00Z',
    steps: [
      {
        id: 's1',
        description: 'Discover existing Stripe data connection',
        status: 'succeeded',
        toolCalls: [
          {
            id: 't1',
            tool: 'data-connection.list',
            arguments: '{ source: "stripe" }',
            result: 'Found 1 connection: stripe-prod (read scope: webhooks)',
            status: 'succeeded',
          },
        ],
      },
      {
        id: 's2',
        description: 'Locate or create the Payment object type',
        status: 'succeeded',
        toolCalls: [
          {
            id: 't2',
            tool: 'ontology.find_type',
            arguments: '{ name: "Payment" }',
            result: 'Found Payment object type (rid: ri.ontology.0123-payment)',
            status: 'succeeded',
          },
        ],
      },
      {
        id: 's3',
        description: 'Design pipeline mapping webhook payload → Payment',
        status: 'running',
        toolCalls: [
          {
            id: 't3',
            tool: 'pipeline.draft',
            arguments: '{ source: "stripe-prod", target: "Payment", mode: "stream" }',
            result: 'Draft pipeline created: ri.pipeline.draft-9b21 (awaiting approval)',
            status: 'succeeded',
          },
        ],
      },
      {
        id: 's4',
        description: 'Request approval and publish the pipeline',
        status: 'planned',
        toolCalls: [],
      },
    ],
  },
  {
    id: 'sess-2',
    prompt: 'Add a column to the Invoice dataset that flags overdue invoices.',
    status: 'succeeded',
    startedAt: '2026-05-17T10:21:00Z',
    steps: [
      { id: 's5', description: 'Open Invoice dataset and inspect schema', status: 'succeeded', toolCalls: [] },
      { id: 's6', description: 'Add computed column is_overdue', status: 'succeeded', toolCalls: [] },
      { id: 's7', description: 'Run a sample build and validate output', status: 'succeeded', toolCalls: [] },
    ],
  },
];

const STATUS_TONE: Record<StepStatus, string> = {
  planned: '#94a3b8',
  running: '#facc15',
  succeeded: '#34d399',
  failed: '#f87171',
  skipped: '#475569',
};

const STATUS_GLYPH: Record<StepStatus, string> = {
  planned: '○',
  running: '◐',
  succeeded: '●',
  failed: '✕',
  skipped: '—',
};

const SESSION_STATUS_LABEL: Record<OperatorSession['status'], string> = {
  planning: 'Planning',
  running: 'Running',
  'awaiting-approval': 'Awaiting approval',
  succeeded: 'Succeeded',
  failed: 'Failed',
};

const SESSION_STATUS_TONE: Record<OperatorSession['status'], string> = {
  planning: '#94a3b8',
  running: '#facc15',
  'awaiting-approval': '#22d3ee',
  succeeded: '#34d399',
  failed: '#f87171',
};

function formatRelative(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} day(s) ago`;
}

export function OperatorPage() {
  const [activeId, setActiveId] = useState(MOCK_SESSIONS[0].id);
  const [prompt, setPrompt] = useState('');

  const active = useMemo(
    () => MOCK_SESSIONS.find((s) => s.id === activeId) ?? MOCK_SESSIONS[0],
    [activeId],
  );

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header className="of-hero-strip">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">AI Platform · AI Operator</p>
            <h1 className="of-heading-xl" style={{ margin: 0 }}>AI Operator</h1>
            <p className="of-text-muted" style={{ margin: 0 }}>
              Describe what you want done and the operator plans, executes, and reports back — respecting your
              permissions and surfacing every tool call it makes for review.
            </p>
          </div>
          <span className="of-chip">Roadmap · Phase 4.2</span>
        </div>
      </header>

      <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 10 }}>
        <p className="of-eyebrow" style={{ margin: 0 }}>Start a new session</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="e.g. Add a streaming branch to the orders pipeline that publishes to the analytics dataset…"
          aria-label="Operator prompt"
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
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="of-btn of-btn-ghost" onClick={() => setPrompt('')} disabled={!prompt.trim()}>
            Clear
          </button>
          <button type="button" className="of-btn of-btn-primary" disabled title="Operator engine ships in Phase 4.x">
            <Glyph name="sparkles" size={14} /> Plan
          </button>
        </div>
      </section>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(240px, 1fr) minmax(0, 2fr)' }}>
        <aside className="of-panel" style={{ padding: 12, display: 'grid', gap: 8, alignSelf: 'start' }}>
          <p className="of-eyebrow" style={{ margin: 0 }}>Recent sessions</p>
          {MOCK_SESSIONS.map((s) => {
            const isActive = s.id === activeId;
            return (
              <button
                key={s.id}
                type="button"
                className="of-card"
                onClick={() => setActiveId(s.id)}
                style={{
                  textAlign: 'left',
                  padding: 10,
                  cursor: 'pointer',
                  border: isActive ? '1px solid #67e8f9' : undefined,
                }}
              >
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
                  {s.prompt.length > 80 ? `${s.prompt.slice(0, 80)}…` : s.prompt}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span
                    className="of-chip"
                    style={{
                      fontSize: 10,
                      color: SESSION_STATUS_TONE[s.status],
                      borderColor: `${SESSION_STATUS_TONE[s.status]}55`,
                    }}
                  >
                    {SESSION_STATUS_LABEL[s.status]}
                  </span>
                  <span className="of-text-muted" style={{ fontSize: 11 }}>{formatRelative(s.startedAt)}</span>
                </div>
              </button>
            );
          })}
        </aside>

        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <h2 className="of-heading-md" style={{ margin: 0 }}>Plan & execution trace</h2>
              <p className="of-text-muted" style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5 }}>
                "{active.prompt}"
              </p>
            </div>
            <span
              className="of-chip"
              style={{
                color: SESSION_STATUS_TONE[active.status],
                borderColor: `${SESSION_STATUS_TONE[active.status]}55`,
              }}
            >
              {SESSION_STATUS_LABEL[active.status]}
            </span>
          </header>

          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
            {active.steps.map((step) => (
              <li
                key={step.id}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                  background: 'rgba(15, 23, 42, 0.35)',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span aria-hidden="true" style={{ color: STATUS_TONE[step.status], fontSize: 18, lineHeight: 1, marginTop: 2 }}>
                    {STATUS_GLYPH[step.status]}
                  </span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{step.description}</p>
                  </div>
                </div>
                {step.toolCalls.length > 0 && (
                  <div style={{ display: 'grid', gap: 6, marginLeft: 28 }}>
                    {step.toolCalls.map((tc) => (
                      <div
                        key={tc.id}
                        style={{
                          padding: 8,
                          borderRadius: 8,
                          background: 'rgba(15, 23, 42, 0.5)',
                          border: '1px solid rgba(148, 163, 184, 0.12)',
                          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                          fontSize: 12,
                          display: 'grid',
                          gap: 4,
                        }}
                      >
                        <span style={{ color: '#67e8f9' }}>{tc.tool}({tc.arguments})</span>
                        <span className="of-text-muted" style={{ fontStyle: 'italic' }}>↳ {tc.result}</span>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>

          {active.status === 'awaiting-approval' && (
            <div
              className="of-status-success"
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 13,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>The operator paused before publishing changes. Review the trace and approve when ready.</span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="of-btn of-btn-ghost" disabled>Reject</button>
                <button type="button" className="of-btn of-btn-primary" disabled>Approve & continue</button>
              </span>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

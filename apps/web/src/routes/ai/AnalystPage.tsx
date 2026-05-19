import { useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

interface AnalysisStep {
  kind: 'search' | 'filter' | 'aggregate' | 'chart' | 'answer';
  label: string;
  detail?: string;
}

interface Analysis {
  id: string;
  question: string;
  objectTypes: string[];
  steps: AnalysisStep[];
  answer: string;
  chart?: { kind: 'bar' | 'line'; series: { label: string; value: number }[] };
  createdAt: string;
}

const OBJECT_TYPES = ['Order', 'Shipment', 'Customer', 'Driver', 'Warehouse', 'Invoice', 'Incident'];

const MOCK_ANALYSES: Analysis[] = [
  {
    id: 'an-1',
    question: 'Which warehouses missed their on-time shipment rate last week?',
    objectTypes: ['Warehouse', 'Shipment'],
    steps: [
      { kind: 'search', label: 'Found 1,402 Shipment objects with ship_date in last 7 days' },
      { kind: 'aggregate', label: 'Grouped by warehouse, computed on_time_rate' },
      { kind: 'filter', label: 'Filtered to warehouses below 90% threshold' },
      { kind: 'chart', label: 'Rendered ranked bar chart' },
    ],
    answer:
      'Three warehouses are below the 90% on-time threshold. Berlin North leads the regressions at 78%, followed by Lyon Central (82%) and Madrid East (85%).',
    chart: {
      kind: 'bar',
      series: [
        { label: 'Berlin North', value: 78 },
        { label: 'Lyon Central', value: 82 },
        { label: 'Madrid East', value: 85 },
        { label: 'Warsaw Hub', value: 92 },
      ],
    },
    createdAt: '2026-05-18T12:14:00Z',
  },
  {
    id: 'an-2',
    question: 'Show me incident counts by severity over the last month.',
    objectTypes: ['Incident'],
    steps: [
      { kind: 'search', label: 'Found 318 Incident objects in the last 30 days' },
      { kind: 'aggregate', label: 'Grouped by severity and week' },
      { kind: 'chart', label: 'Rendered stacked area chart' },
    ],
    answer:
      'Severity-1 incidents trended down (12 → 6 over four weeks). Severity-3 incidents are up sharply (45 → 78), driven by checkout latency alerts in week 3.',
    createdAt: '2026-05-15T09:46:00Z',
  },
];

function formatRelative(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} day(s) ago`;
}

const STEP_ICON: Record<AnalysisStep['kind'], string> = {
  search: '🔍',
  filter: '🧮',
  aggregate: 'Σ',
  chart: '📊',
  answer: '✓',
};

function MiniBarChart({ series }: { series: { label: string; value: number }[] }) {
  const max = Math.max(...series.map((s) => s.value), 1);
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {series.map((s) => (
        <div key={s.label} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 60px', gap: 8, alignItems: 'center' }}>
          <span className="of-text-muted" style={{ fontSize: 12 }}>{s.label}</span>
          <div style={{ height: 8, background: 'rgba(148, 163, 184, 0.15)', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                width: `${(s.value / max) * 100}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #a78bfa, #22d3ee)',
              }}
            />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{s.value}%</span>
        </div>
      ))}
    </div>
  );
}

export function AnalystPage() {
  const [question, setQuestion] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['Order', 'Shipment']);

  function toggleType(t: string) {
    setSelectedTypes((tags) => (tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]));
  }

  const sortedAnalyses = useMemo(
    () => [...MOCK_ANALYSES].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [],
  );

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header className="of-hero-strip">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">AI Platform · AI Analyst</p>
            <h1 className="of-heading-xl" style={{ margin: 0 }}>AI Analyst</h1>
            <p className="of-text-muted" style={{ margin: 0 }}>
              Ask natural-language questions over your ontology. The analyst searches data, transforms it,
              and explains the result with charts and a trace of what it did.
            </p>
          </div>
          <span className="of-chip">Roadmap · Phase 4.2</span>
        </div>
      </header>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 2fr) minmax(220px, 1fr)' }}>
        <section style={{ display: 'grid', gap: 12 }}>
          <div className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              placeholder="Ask a question about your operational data…"
              aria-label="Analyst question"
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span className="of-text-muted" style={{ fontSize: 12 }}>
                Scope: {selectedTypes.length === 0 ? 'all ontology types' : selectedTypes.join(', ')}
              </span>
              <button type="button" className="of-btn of-btn-primary" disabled title="Analyst engine lands in Phase 4.x">
                <Glyph name="sparkles" size={14} /> Analyze
              </button>
            </div>
          </div>

          <h2 className="of-heading-md" style={{ margin: 0 }}>Recent analyses</h2>
          {sortedAnalyses.map((an) => (
            <article key={an.id} className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>{an.question}</p>
                  <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                    {formatRelative(an.createdAt)}
                  </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {an.objectTypes.map((t) => (
                    <span key={t} className="of-chip" style={{ fontSize: 11 }}>{t}</span>
                  ))}
                </div>
              </header>
              <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                {an.steps.map((step, i) => (
                  <li key={`${an.id}-${i}`} className="of-text-muted" style={{ fontSize: 12, display: 'flex', gap: 6 }}>
                    <span aria-hidden="true">{STEP_ICON[step.kind]}</span>
                    <span>{step.label}</span>
                  </li>
                ))}
              </ol>
              {an.chart && <MiniBarChart series={an.chart.series} />}
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{an.answer}</p>
            </article>
          ))}
        </section>

        <aside className="of-panel" style={{ padding: 14, display: 'grid', gap: 10, alignSelf: 'start' }}>
          <p className="of-eyebrow" style={{ margin: 0 }}>Scope by object type</p>
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
            Restrict which ontology types the analyst may search.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {OBJECT_TYPES.map((t) => {
              const active = selectedTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  className={active ? 'of-chip of-chip-active' : 'of-chip'}
                  onClick={() => toggleType(t)}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}

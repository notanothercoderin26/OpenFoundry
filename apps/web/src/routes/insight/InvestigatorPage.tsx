import { useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

type StepKind = 'start' | 'traverse' | 'filter' | 'aggregate';

interface PathStep {
  id: string;
  kind: StepKind;
  description: string;
  detail?: string;
  outputCount: number;
}

interface ResultRow {
  id: string;
  primaryLabel: string;
  pivotLabel: string;
  metric: string;
  status: string;
  statusTone: string;
}

interface Investigation {
  id: string;
  name: string;
  description: string;
  startingType: string;
  steps: PathStep[];
  results: ResultRow[];
}

const OBJECT_TYPES = ['Order', 'Shipment', 'Customer', 'Driver', 'Warehouse', 'Invoice', 'Incident', 'Asset'];

const MOCK_INVESTIGATION: Investigation = {
  id: 'inv-1',
  name: 'Late-shipment customer impact',
  description:
    'Starting from shipments that missed their SLA last week, traverse to the impacted customers and rank by lifetime value.',
  startingType: 'Shipment',
  steps: [
    {
      id: 'p1',
      kind: 'start',
      description: 'Begin with Shipment objects',
      detail: 'ship_date in last 7 days',
      outputCount: 1402,
    },
    {
      id: 'p2',
      kind: 'filter',
      description: 'Filter to SLA misses',
      detail: 'on_time_rate < target_sla',
      outputCount: 187,
    },
    {
      id: 'p3',
      kind: 'traverse',
      description: 'Traverse → Customer',
      detail: 'via shipment.customer_id',
      outputCount: 142,
    },
    {
      id: 'p4',
      kind: 'aggregate',
      description: 'Aggregate by customer with LTV ranking',
      detail: 'order by ltv DESC',
      outputCount: 142,
    },
  ],
  results: [
    { id: 'r1', primaryLabel: 'Northwind Logistics', pivotLabel: '4 missed', metric: '$1.2M LTV', status: 'At risk', statusTone: '#f87171' },
    { id: 'r2', primaryLabel: 'Apex Distribution', pivotLabel: '3 missed', metric: '$890k LTV', status: 'At risk', statusTone: '#f87171' },
    { id: 'r3', primaryLabel: 'Bravo Retailer', pivotLabel: '5 missed', metric: '$620k LTV', status: 'Watchlist', statusTone: '#facc15' },
    { id: 'r4', primaryLabel: 'Coastal Outfitters', pivotLabel: '2 missed', metric: '$540k LTV', status: 'Watchlist', statusTone: '#facc15' },
    { id: 'r5', primaryLabel: 'Delta Foods', pivotLabel: '1 missed', metric: '$310k LTV', status: 'Normal', statusTone: '#34d399' },
  ],
};

const STEP_GLYPH: Record<StepKind, string> = {
  start: '●',
  traverse: '→',
  filter: '⊂',
  aggregate: 'Σ',
};

const STEP_TONE: Record<StepKind, string> = {
  start: '#a78bfa',
  traverse: '#22d3ee',
  filter: '#fb923c',
  aggregate: '#34d399',
};

export function InvestigatorPage() {
  const [startingType, setStartingType] = useState(MOCK_INVESTIGATION.startingType);

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header className="of-hero-strip">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">Analytics & Operations · Investigator</p>
            <h1 className="of-heading-xl" style={{ margin: 0 }}>Investigator</h1>
            <p className="of-text-muted" style={{ margin: 0 }}>
              Follow relationships between ontology objects to build multi-step queries. Pivot, filter, and apply
              actions without writing code.
            </p>
          </div>
          <button type="button" className="of-btn of-btn-primary" disabled title="Save lands in Phase 4.x">
            <Glyph name="bookmark" size={14} /> Save analysis
          </button>
        </div>
      </header>

      <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 10 }}>
        <p className="of-eyebrow" style={{ margin: 0 }}>Starting object type</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {OBJECT_TYPES.map((t) => {
            const active = startingType === t;
            return (
              <button
                key={t}
                type="button"
                className={active ? 'of-chip of-chip-active' : 'of-chip'}
                onClick={() => setStartingType(t)}
              >
                {t}
              </button>
            );
          })}
        </div>
      </section>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(280px, 1fr) minmax(0, 2fr)' }}>
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12, alignSelf: 'start' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 className="of-heading-md" style={{ margin: 0 }}>Analysis path</h2>
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{MOCK_INVESTIGATION.name}</p>
            </div>
            <button type="button" className="of-btn of-btn-ghost" disabled title="Step builder ships in Phase 4.x">
              <Glyph name="plus" size={12} />
            </button>
          </header>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {MOCK_INVESTIGATION.steps.map((step) => (
              <li
                key={step.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                  background: 'rgba(15, 23, 42, 0.35)',
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: `${STEP_TONE[step.kind]}28`,
                      color: STEP_TONE[step.kind],
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  >
                    {STEP_GLYPH[step.kind]}
                  </span>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{step.description}</p>
                </div>
                {step.detail && (
                  <p
                    className="of-text-muted"
                    style={{
                      margin: '0 0 0 32px',
                      fontSize: 11,
                      fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    }}
                  >
                    {step.detail}
                  </p>
                )}
                <p className="of-text-muted" style={{ margin: '0 0 0 32px', fontSize: 11 }}>
                  {step.outputCount.toLocaleString()} object(s) out
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 className="of-heading-md" style={{ margin: 0 }}>Results</h2>
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                {MOCK_INVESTIGATION.results.length} customer(s) impacted by SLA misses
              </p>
            </div>
            <span className="of-chip">Read-only preview</span>
          </header>
          <div style={{ overflow: 'hidden', borderRadius: 8, border: '1px solid rgba(148, 163, 184, 0.18)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.45)' }}>
                  {['Customer', 'Missed shipments', 'LTV', 'Status'].map((h) => (
                    <th
                      key={h}
                      className="of-eyebrow"
                      style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11 }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_INVESTIGATION.results.map((row) => (
                  <tr key={row.id} style={{ borderTop: '1px solid rgba(148, 163, 184, 0.12)' }}>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{row.primaryLabel}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13 }} className="of-text-muted">{row.pivotLabel}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13 }}>{row.metric}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span className="of-chip" style={{ color: row.statusTone, borderColor: `${row.statusTone}55` }}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="of-btn of-btn-ghost" disabled>Export CSV</button>
            <button type="button" className="of-btn of-btn-primary" disabled>Apply action…</button>
          </div>
        </section>
      </div>
    </section>
  );
}

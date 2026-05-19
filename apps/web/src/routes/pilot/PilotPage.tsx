import { useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

type GenerationStatus = 'generating' | 'ready' | 'failed';

interface Generation {
  id: string;
  prompt: string;
  appName: string;
  ontologyContext: string[];
  status: GenerationStatus;
  createdAt: string;
  summary: string;
  themeColor: string;
}

interface PromptExample {
  id: string;
  label: string;
  prompt: string;
}

const MOCK_GENERATIONS: Generation[] = [
  {
    id: 'gen-1',
    prompt: 'Build a delivery tracking app where dispatchers see active routes and reassign drivers.',
    appName: 'Delivery Tracker',
    ontologyContext: ['Driver', 'Route', 'Shipment'],
    status: 'ready',
    createdAt: '2026-05-18T14:02:00Z',
    summary:
      'Generated a 4-page app with route map, driver assignment drawer, and reassignment Action. Seeded 24 sample shipments.',
    themeColor: '#22d3ee',
  },
  {
    id: 'gen-2',
    prompt: 'I need a customer onboarding portal that captures KYC documents and tracks review status.',
    appName: 'KYC Onboarding Portal',
    ontologyContext: ['Customer', 'KYCDocument', 'ReviewCase'],
    status: 'ready',
    createdAt: '2026-05-17T09:34:00Z',
    summary:
      'Generated a public portal with document upload, status timeline, and a reviewer queue with assignment actions.',
    themeColor: '#a78bfa',
  },
  {
    id: 'gen-3',
    prompt: 'Create a maintenance scheduling console for plant managers.',
    appName: 'Maintenance Console',
    ontologyContext: ['Asset', 'MaintenanceTask', 'Technician'],
    status: 'generating',
    createdAt: '2026-05-18T15:48:00Z',
    summary: 'Generating ontology bindings and seed data. Estimated 2 minutes remaining.',
    themeColor: '#fb923c',
  },
];

const EXAMPLES: PromptExample[] = [
  {
    id: 'ex-inventory',
    label: 'Inventory dashboard',
    prompt:
      'Build an inventory dashboard showing stock levels per warehouse, with a reorder action when stock drops below threshold.',
  },
  {
    id: 'ex-incident',
    label: 'Incident triage console',
    prompt:
      'Create an incident triage console with severity filters, ownership assignment, and a runbook drawer linked to each incident type.',
  },
  {
    id: 'ex-public-status',
    label: 'Public status page',
    prompt:
      'Build a public status page that shows current service health, scheduled maintenance, and lets visitors subscribe to incident updates by email.',
  },
];

const STATUS_LABEL: Record<GenerationStatus, string> = {
  generating: 'Generating',
  ready: 'Ready',
  failed: 'Failed',
};

const STATUS_TONE: Record<GenerationStatus, string> = {
  generating: '#facc15',
  ready: '#34d399',
  failed: '#f87171',
};

function formatRelative(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const delta = Date.now() - date.getTime();
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function PilotPage() {
  const [prompt, setPrompt] = useState('');
  const [contextTags, setContextTags] = useState<string[]>([]);
  const [contextDraft, setContextDraft] = useState('');

  const promptIsEmpty = prompt.trim().length === 0;

  function addContextTag() {
    const tag = contextDraft.trim();
    if (!tag) return;
    if (contextTags.includes(tag)) {
      setContextDraft('');
      return;
    }
    setContextTags((tags) => [...tags, tag]);
    setContextDraft('');
  }

  function removeContextTag(tag: string) {
    setContextTags((tags) => tags.filter((t) => t !== tag));
  }

  function fillFromExample(example: PromptExample) {
    setPrompt(example.prompt);
  }

  const sortedGenerations = useMemo(
    () => [...MOCK_GENERATIONS].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [],
  );

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header className="of-hero-strip">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">Application development · AI App Builder</p>
            <h1 className="of-heading-xl" style={{ margin: 0 }}>AI App Builder</h1>
            <p className="of-text-muted" style={{ margin: 0 }}>
              Describe the application you want and the builder generates the ontology, pages, and seed data for
              you. Iterate by chatting, then publish through OpenFoundry's standard release flow.
            </p>
          </div>
          <span className="of-chip">Roadmap · Phase 4.2</span>
        </div>
      </header>

      <section className="of-panel" style={{ padding: 20, display: 'grid', gap: 14 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>Describe your app</h2>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Build a field-ops console where technicians see today's work orders, mark them complete, and capture photos…"
          rows={5}
          aria-label="App description prompt"
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

        <div style={{ display: 'grid', gap: 6 }}>
          <p className="of-eyebrow" style={{ margin: 0 }}>Ontology context (optional)</p>
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
            Reference object types the generator should reuse. Press Enter to add.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {contextTags.map((tag) => (
              <span key={tag} className="of-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {tag}
                <button
                  type="button"
                  onClick={() => removeContextTag(tag)}
                  aria-label={`Remove ${tag}`}
                  style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
                >
                  <Glyph name="x" size={11} />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={contextDraft}
              onChange={(e) => setContextDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addContextTag();
                }
              }}
              placeholder="Add object type (e.g. Driver)"
              aria-label="Add ontology context"
              style={{
                background: 'rgba(15, 23, 42, 0.35)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: 8,
                padding: '6px 10px',
                color: 'inherit',
                fontSize: 13,
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            className="of-btn of-btn-ghost"
            onClick={() => {
              setPrompt('');
              setContextTags([]);
            }}
            disabled={promptIsEmpty && contextTags.length === 0}
          >
            Clear
          </button>
          <button
            type="button"
            className="of-btn of-btn-primary"
            disabled
            title="Generation engine lands in Phase 4.2"
          >
            <Glyph name="sparkles" size={14} /> Generate app
          </button>
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>Example prompts</h2>
        <div className="of-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {EXAMPLES.map((example) => (
            <button
              key={example.id}
              type="button"
              className="of-card"
              onClick={() => fillFromExample(example)}
              style={{ textAlign: 'left', cursor: 'pointer' }}
            >
              <p className="of-eyebrow" style={{ margin: 0 }}>{example.label}</p>
              <p className="of-text-muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>
                {example.prompt}
              </p>
              <p className="of-text-muted" style={{ fontSize: 12, marginTop: 10, color: '#facc15' }}>
                Use this prompt →
              </p>
            </button>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>
          Recent generations <span className="of-text-muted" style={{ fontSize: 14, fontWeight: 400 }}>({sortedGenerations.length})</span>
        </h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {sortedGenerations.map((gen) => (
            <article key={gen.id} className="of-panel" style={{ padding: 16, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: `${gen.themeColor}28`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Glyph name="app" size={18} tone={gen.themeColor} />
                  </span>
                  <div>
                    <h3 className="of-heading-md" style={{ margin: 0 }}>{gen.appName}</h3>
                    <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                      {formatRelative(gen.createdAt)}
                    </p>
                  </div>
                </div>
                <span
                  className="of-chip"
                  style={{ color: STATUS_TONE[gen.status], borderColor: `${STATUS_TONE[gen.status]}55` }}
                >
                  {STATUS_LABEL[gen.status]}
                </span>
              </div>
              <p className="of-text-muted" style={{ fontSize: 13, margin: 0, fontStyle: 'italic' }}>
                "{gen.prompt}"
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>{gen.summary}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {gen.ontologyContext.map((tag) => (
                  <span key={tag} className="of-chip">{tag}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

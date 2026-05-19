import { Glyph } from '@/lib/components/ui/Glyph';

type DeploymentStatus = 'draft' | 'staging' | 'production';

interface Chatbot {
  id: string;
  name: string;
  description: string;
  knowledgeSources: number;
  tools: number;
  monthlyConversations: number;
  status: DeploymentStatus;
  themeColor: string;
  surfaces: ('internal' | 'sdk' | 'api')[];
}

const MOCK_CHATBOTS: Chatbot[] = [
  {
    id: 'cb-support',
    name: 'Customer Support Triage',
    description: 'Answers tier-1 support questions, opens tickets in the ticketing ontology, and escalates ambiguous cases.',
    knowledgeSources: 4,
    tools: 3,
    monthlyConversations: 12_480,
    status: 'production',
    themeColor: '#22d3ee',
    surfaces: ['internal', 'sdk'],
  },
  {
    id: 'cb-procurement',
    name: 'Procurement Helper',
    description: 'Helps employees draft purchase requests by guiding them through policy and finding approved vendors.',
    knowledgeSources: 2,
    tools: 2,
    monthlyConversations: 1_204,
    status: 'staging',
    themeColor: '#a78bfa',
    surfaces: ['internal'],
  },
  {
    id: 'cb-onboarding',
    name: 'New Hire Onboarding',
    description: 'Day-1 guide for new hires: where to find HR docs, IT requests, and intro meetings.',
    knowledgeSources: 5,
    tools: 1,
    monthlyConversations: 320,
    status: 'production',
    themeColor: '#f472b6',
    surfaces: ['internal'],
  },
  {
    id: 'cb-public-faq',
    name: 'Public Status FAQ',
    description: 'Embedded on the public status page; answers FAQs and surfaces relevant incidents.',
    knowledgeSources: 3,
    tools: 0,
    monthlyConversations: 5_640,
    status: 'production',
    themeColor: '#fb923c',
    surfaces: ['api'],
  },
  {
    id: 'cb-policy',
    name: 'Policy Compliance Coach',
    description: 'Internal compliance assistant that explains policies and flags potential violations during chats.',
    knowledgeSources: 6,
    tools: 4,
    monthlyConversations: 0,
    status: 'draft',
    themeColor: '#facc15',
    surfaces: ['internal'],
  },
];

const STATUS_TONE: Record<DeploymentStatus, string> = {
  draft: '#94a3b8',
  staging: '#facc15',
  production: '#34d399',
};

const STATUS_LABEL: Record<DeploymentStatus, string> = {
  draft: 'Draft',
  staging: 'Staging',
  production: 'Production',
};

const SURFACE_LABEL: Record<'internal' | 'sdk' | 'api', string> = {
  internal: 'Internal',
  sdk: 'OSDK',
  api: 'Public API',
};

function formatNumber(n: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(n);
}

export function ChatbotStudioPage() {
  const totalChats = MOCK_CHATBOTS.reduce((sum, c) => sum + c.monthlyConversations, 0);
  const inProduction = MOCK_CHATBOTS.filter((c) => c.status === 'production').length;

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header className="of-hero-strip">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">AI Platform · Chatbot Studio</p>
            <h1 className="of-heading-xl" style={{ margin: 0 }}>Chatbot Studio</h1>
            <p className="of-text-muted" style={{ margin: 0 }}>
              Build LLM-powered chatbots grounded in your ontology, custom tools, and documents. Deploy them
              internally, through the SDK, or as a public API.
            </p>
          </div>
          <button type="button" className="of-btn of-btn-primary" disabled title="Builder UI ships in Phase 4.x">
            <Glyph name="plus" size={14} /> New chatbot
          </button>
        </div>
      </header>

      <section
        className="of-panel"
        style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
      >
        {[
          { label: 'Chatbots', value: MOCK_CHATBOTS.length.toString(), tone: '#a78bfa' },
          { label: 'In production', value: inProduction.toString(), tone: '#34d399' },
          { label: 'Conversations / month', value: formatNumber(totalChats), tone: '#22d3ee' },
          {
            label: 'Surfaces in use',
            value: new Set(MOCK_CHATBOTS.flatMap((c) => c.surfaces)).size.toString(),
            tone: '#f472b6',
          },
        ].map((m) => (
          <div key={m.label} style={{ display: 'grid', gap: 4 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: m.tone }}>{m.value}</p>
          </div>
        ))}
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>Your chatbots</h2>
        <div className="of-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          {MOCK_CHATBOTS.map((c) => (
            <article key={c.id} className="of-card" aria-label={c.name}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: `${c.themeColor}28`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Glyph name="sparkles" size={18} tone={c.themeColor} />
                  </span>
                  <div>
                    <h3 className="of-heading-md" style={{ margin: 0 }}>{c.name}</h3>
                  </div>
                </div>
                <span className="of-chip" style={{ color: STATUS_TONE[c.status], borderColor: `${STATUS_TONE[c.status]}55` }}>
                  {STATUS_LABEL[c.status]}
                </span>
              </div>
              <p className="of-text-muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 12, minHeight: 56 }}>
                {c.description}
              </p>
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8,
                  margin: '12px 0',
                  paddingTop: 12,
                  borderTop: '1px solid rgba(148, 163, 184, 0.15)',
                }}
              >
                <div>
                  <dt className="of-eyebrow" style={{ margin: 0, fontSize: 10 }}>Knowledge</dt>
                  <dd style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600 }}>{c.knowledgeSources}</dd>
                </div>
                <div>
                  <dt className="of-eyebrow" style={{ margin: 0, fontSize: 10 }}>Tools</dt>
                  <dd style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600 }}>{c.tools}</dd>
                </div>
                <div>
                  <dt className="of-eyebrow" style={{ margin: 0, fontSize: 10 }}>Chats / mo</dt>
                  <dd style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600 }}>{formatNumber(c.monthlyConversations)}</dd>
                </div>
              </dl>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {c.surfaces.map((s) => (
                  <span key={s} className="of-chip" style={{ fontSize: 11 }}>{SURFACE_LABEL[s]}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

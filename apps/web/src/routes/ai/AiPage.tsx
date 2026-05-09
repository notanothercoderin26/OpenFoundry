import { useEffect, useMemo, useRef, useState } from 'react';

import { getOverview, type AiPlatformOverview } from '@/lib/api/ai';
import { notifications } from '@stores/notifications';

import { AipHero } from './AipHero';
import { renderConsole, type ConsoleId } from './AiConsoles';

type TopTab = 'capabilities' | 'getting-started' | 'architecture' | 'platform-updates';

type DocsPageId =
  | 'overview'
  | 'features'
  | 'get-started'
  | 'best-practices'
  | 'supported-llms'
  | 'llm-apis'
  | 'ai-ethics'
  | 'compute-usage'
  | 'observability'
  | 'admin-enable'
  | 'admin-capacity'
  | 'byom'
  | 'byom-register'
  | 'byom-use';

type AppPageId =
  | 'app-fde'
  | 'app-analyst'
  | 'app-assist'
  | 'app-chatbot'
  | 'app-doc-intel'
  | 'app-evals'
  | 'app-logic'
  | 'app-model-catalog'
  | 'app-threads';

type ConsolePageId = `console-${ConsoleId}`;

type PageId = DocsPageId | AppPageId | ConsolePageId;

interface NavItem {
  id: PageId;
  label: string;
}

interface NavSection {
  title: string | null;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'AI PLATFORM (AIP)',
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'features', label: 'AIP features' },
      { id: 'get-started', label: 'Get started with AIP' },
      { id: 'best-practices', label: 'Best practices for LLM prompt engineering' },
      { id: 'supported-llms', label: 'Supported LLMs' },
      { id: 'llm-apis', label: 'LLM-provider compatible APIs' },
      { id: 'ai-ethics', label: 'AI ethics and governance' },
      { id: 'compute-usage', label: 'Compute usage with AIP' },
      { id: 'observability', label: 'AIP observability' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { id: 'admin-enable', label: 'Enable AIP features' },
      { id: 'admin-capacity', label: 'LLM capacity management' },
    ],
  },
  {
    title: 'Bring your own model',
    items: [
      { id: 'byom', label: 'Bring your own model to AIP' },
      { id: 'byom-register', label: 'Register an LLM using function interfaces' },
      { id: 'byom-use', label: 'Use registered LLM' },
    ],
  },
  {
    title: 'CONSOLE (LIVE)',
    items: [
      { id: 'console-providers', label: 'Providers' },
      { id: 'console-prompts', label: 'Prompts' },
      { id: 'console-knowledge', label: 'Knowledge bases' },
      { id: 'console-tools', label: 'Tools' },
      { id: 'console-agents', label: 'Agents' },
      { id: 'console-chat', label: 'Chat' },
      { id: 'console-guardrails', label: 'Guardrails' },
    ],
  },
  {
    title: 'APPLICATIONS',
    items: [
      { id: 'app-fde', label: 'AI FDE' },
      { id: 'app-analyst', label: 'AIP Analyst' },
      { id: 'app-assist', label: 'AIP Assist' },
      { id: 'app-chatbot', label: 'AIP Chatbot Studio' },
      { id: 'app-doc-intel', label: 'AIP Document Intelligence' },
      { id: 'app-evals', label: 'AIP Evals' },
      { id: 'app-logic', label: 'AIP Logic' },
      { id: 'app-model-catalog', label: 'AIP Model Catalog' },
      { id: 'app-threads', label: 'AIP Threads' },
    ],
  },
];

const PAGE_TITLES: Record<PageId, string> = {
  overview: 'AIP overview',
  features: 'AIP features',
  'get-started': 'Get started with AIP',
  'best-practices': 'Best practices for LLM prompt engineering',
  'supported-llms': 'Supported LLMs',
  'llm-apis': 'LLM-provider compatible APIs',
  'ai-ethics': 'AI ethics and governance',
  'compute-usage': 'Compute usage with AIP',
  observability: 'AIP observability',
  'admin-enable': 'Enable AIP features',
  'admin-capacity': 'LLM capacity management',
  byom: 'Bring your own model to AIP',
  'byom-register': 'Register an LLM using function interfaces',
  'byom-use': 'Use registered LLM',
  'app-fde': 'AI FDE',
  'app-analyst': 'AIP Analyst',
  'app-assist': 'AIP Assist',
  'app-chatbot': 'AIP Chatbot Studio',
  'app-doc-intel': 'AIP Document Intelligence',
  'app-evals': 'AIP Evals',
  'app-logic': 'AIP Logic',
  'app-model-catalog': 'AIP Model Catalog',
  'app-threads': 'AIP Threads',
  'console-providers': 'Providers',
  'console-prompts': 'Prompts',
  'console-knowledge': 'Knowledge bases',
  'console-tools': 'Tools',
  'console-agents': 'Agents',
  'console-chat': 'Chat',
  'console-guardrails': 'Guardrails',
};

const TOP_TABS: Array<{ id: TopTab; label: string }> = [
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'getting-started', label: 'Getting started' },
  { id: 'architecture', label: 'Architecture center' },
  { id: 'platform-updates', label: 'Platform updates' },
];

interface TocEntry {
  id: string;
  label: string;
}

const PAGE_TOCS: Partial<Record<PageId, TocEntry[]>> = {
  overview: [
    { id: 'seamless-integration', label: 'Seamless integration' },
    { id: 'security-governance', label: 'Security and governance' },
    { id: 'model-management', label: 'Model management' },
    { id: 'scalability-performance', label: 'Scalability and performance' },
    { id: 'explainability-transparency', label: 'Explainability and transparency' },
  ],
  features: [
    { id: 'application-references', label: 'AIP application references' },
    { id: 'application-capabilities', label: 'AIP applications and capabilities' },
    { id: 'developer-toolchain', label: 'AIP and the developer toolchain' },
    { id: 'platform-applications', label: 'AIP features in platform applications' },
  ],
  'get-started': [
    { id: 'gs-foundry-aip', label: 'Foundry & AIP fundamentals' },
    { id: 'gs-aip-tour', label: 'AIP guided tour' },
    { id: 'gs-aip-workflow', label: 'Build your first AIP workflow' },
  ],
};

function formatNumber(n: number) {
  return new Intl.NumberFormat('en-US').format(n);
}

function formatPercent(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
}

export function AiPage() {
  const [topTab, setTopTab] = useState<TopTab>('capabilities');
  const [page, setPage] = useState<PageId>('overview');
  const [overview, setOverview] = useState<AiPlatformOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [activeAnchor, setActiveAnchor] = useState<string>('');
  const mainRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingOverview(true);
    getOverview()
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch((cause) => {
        const message = cause instanceof Error ? cause.message : 'Failed to load AI overview';
        notifications.error(message);
      })
      .finally(() => {
        if (!cancelled) setLoadingOverview(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toc = PAGE_TOCS[page] ?? [];

  // IntersectionObserver to highlight active TOC anchor on scroll
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (toc.length === 0 || !mainRef.current) {
      setActiveAnchor('');
      return;
    }
    setActiveAnchor(toc[0]?.id ?? '');
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveAnchor(visible[0].target.id);
        }
      },
      { root: mainRef.current, rootMargin: '0px 0px -65% 0px', threshold: [0, 0.5, 1] },
    );
    toc.forEach((entry) => {
      const el = document.getElementById(entry.id);
      if (el) observer.observe(el);
    });
    observerRef.current = observer;
    return () => {
      observer.disconnect();
    };
  }, [toc, page]);

  function navigateTo(id: PageId) {
    setPage(id);
    setTopTab('capabilities');
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }

  function scrollToAnchor(anchorId: string) {
    const el = document.getElementById(anchorId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveAnchor(anchorId);
    }
  }

  return (
    <div className="of-page">
      <div className="of-aip">
        <div className="of-aip__tabbar">
          {TOP_TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTopTab(entry.id)}
              className={`of-aip__tab${topTab === entry.id ? ' of-aip__tab--active' : ''}`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="of-aip__layout">
          <aside className="of-aip__leftnav">
            {NAV_SECTIONS.map((section, idx) => (
              <div key={`${section.title ?? 'main'}-${idx}`} className="of-aip__leftnav-section">
                {section.title && <span className="of-aip__leftnav-section-title">{section.title}</span>}
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateTo(item.id)}
                    className={`of-aip__leftnav-item${page === item.id ? ' of-aip__leftnav-item--active' : ''}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </aside>

          <main className="of-aip__main" ref={mainRef}>
            <PageBreadcrumb page={page} onJump={navigateTo} />
            <h1 className="of-aip__title">{PAGE_TITLES[page]}</h1>
            <PageContent
              page={page}
              overview={overview}
              loadingOverview={loadingOverview}
              onNavigate={navigateTo}
            />
          </main>

          {toc.length > 0 && (
            <aside className="of-aip__rightnav">
              <p className="of-aip__rightnav-title">On this page</p>
              <button
                type="button"
                className="of-aip__rightnav-item of-aip__rightnav-item--root"
                onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                {PAGE_TITLES[page]}
              </button>
              {toc.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => scrollToAnchor(entry.id)}
                  className={`of-aip__rightnav-item${activeAnchor === entry.id ? ' of-aip__rightnav-item--active' : ''}`}
                >
                  {entry.label}
                </button>
              ))}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

function PageBreadcrumb({ page, onJump }: { page: PageId; onJump: (id: PageId) => void }) {
  return (
    <nav className="of-aip__breadcrumb" aria-label="Breadcrumb">
      <button type="button" onClick={() => onJump('overview')}>AI Platform (AIP)</button>
      <span>›</span>
      <span>{PAGE_TITLES[page]}</span>
    </nav>
  );
}

interface PageContentProps {
  page: PageId;
  overview: AiPlatformOverview | null;
  loadingOverview: boolean;
  onNavigate: (page: PageId) => void;
}

function PageContent({ page, overview, loadingOverview, onNavigate }: PageContentProps) {
  if (page === 'overview') {
    return <OverviewContent overview={overview} loadingOverview={loadingOverview} />;
  }
  if (page === 'features') return <FeaturesContent />;
  if (page === 'get-started') return <GetStartedContent onNavigate={onNavigate} />;
  if (page === 'best-practices') return <BestPracticesContent />;
  if (page === 'supported-llms') return <SupportedLlmsContent overview={overview} />;
  if (page === 'llm-apis') return <LlmApisContent />;
  if (page === 'ai-ethics') return <AiEthicsContent />;
  if (page === 'compute-usage') return <ComputeUsageContent overview={overview} />;
  if (page === 'observability') return <ObservabilityContent overview={overview} />;
  if (page === 'admin-enable') return <AdminEnableContent />;
  if (page === 'admin-capacity') return <AdminCapacityContent overview={overview} />;
  if (page === 'byom') return <ByomContent />;
  if (page === 'byom-register') return <ByomRegisterContent />;
  if (page === 'byom-use') return <ByomUseContent />;

  if (page.startsWith('console-')) {
    const id = page.slice('console-'.length) as ConsoleId;
    return <>{renderConsole(id)}</>;
  }
  if (page.startsWith('app-')) {
    return <ApplicationContent appId={page as AppPageId} onNavigate={onNavigate} />;
  }
  return null;
}

function OverviewContent({ overview, loadingOverview }: { overview: AiPlatformOverview | null; loadingOverview: boolean }) {
  return (
    <>
      <div className="of-aip__hero">
        <AipHero />
      </div>

      <div className="of-aip__lead">
        <p>
          The AI Platform (intelligence layer) of OpenFoundry connects to user data and operators. AIP is designed to
          drive automation across operational workflows, embedding a comprehensive suite of tools that can be used by
          everyone in an organization, from developers to frontline users.
        </p>
        <p>
          AIP&apos;s toolkit fuses the AI Logic, AI Chatbot Studio, and AI Agent Studio with{' '}
          <a href="#model-management">multimodal model management</a>. AIP enables the development of automation,
          analysis and applications that integrate with external knowledge, embedding a comprehensive suite of patterns
          and primitives to ground LLM-based generations on the data, decisions, signals and resource state of the
          organization.
        </p>
        <p>
          Together with OpenFoundry, AIP&apos;s core operations platform — pure AssetX — AIP&apos;s mission is to be a
          tool for autonomous software development. AIP forms an operating system that can deliver a full range of AI
          experiences. From end-to-end LLM applications to native agentic experiences with embedded models using language
          models to applications that embed AI to it.
        </p>
        <p>
          The remainder of this page provides a brief overview of key AIP capabilities. For more details about AIP&apos;s
          capabilities, we recommend reviewing the <a href="#"><strong>AIP documentation</strong></a>, including the AIP
          features reference.
        </p>
      </div>

      <h2 id="seamless-integration" className="of-aip__sectionHeading">Seamless integration</h2>
      <section className="of-aip__section">
        <p>
          AIP can integrate seamlessly with any organization&apos;s existing data on a OpenFoundry environment. This
          enables you to build and interact with LLM-powered agents and workflows that leverage data specific to your
          organization. AIP provides robust tooling and transparency, allowing users to understand and trust the responses
          generated by LLMs.
        </p>
        <p>
          To learn more about how OpenFoundry connects user data with foundation models and orchestrates LLM responses,
          read our overview of{' '}
          <a href="#observability">AIP observability</a> and the{' '}
          <a href="#supported-llms">supported language model catalog</a>.
        </p>
        {overview && (
          <div className="of-aip__statgrid">
            <StatCard label="Configured providers" value={formatNumber(overview.provider_count)} />
            <StatCard label="Private gateways" value={formatNumber(overview.private_provider_count)} />
            <StatCard label="Multimodal" value={formatNumber(overview.multimodal_provider_count)} />
          </div>
        )}
      </section>

      <h2 id="security-governance" className="of-aip__sectionHeading">Security and governance</h2>
      <section className="of-aip__section">
        <p>
          All foundations of OpenFoundry&apos;s platform <a href="#ai-ethics">security measures</a> for the protection of
          sensitive data is consistent with industry regulations. AIP provides robust access control, audit logging, and
          policy controls to maintain data integrity and transparency. Moreover, built-in governance tooling such as
          guardrails ensures the safety of all AI-generated outputs.
        </p>
        <p>
          To learn more about how a Site secures access, see our published works on platform security, the{' '}
          <a href="#ai-ethics">AIP Security and Privacy Statement</a>, and our supplementary{' '}
          <a href="#ai-ethics">Palantir AIP FAQs</a>.
        </p>
        {overview && (
          <div className="of-aip__statgrid">
            <StatCard label="Guardrail blocks" value={formatNumber(overview.blocked_guardrail_events)} />
            <StatCard label="Conversations" value={formatNumber(overview.conversation_count)} />
            <StatCard label="Cache hit rate" value={formatPercent(overview.cache_hit_rate)} />
          </div>
        )}
      </section>

      <h2 id="model-management" className="of-aip__sectionHeading">Model management</h2>
      <section className="of-aip__section">
        <p>
          AIP provides a comprehensive suite of tools for building, training, and deploying large language models.
          Supporting a range of different large language model setups including foundation models, AIP&apos;s built-in
          tooling caters to a variety of use cases. Additionally, AIP enables users to fine-tune and customize models to
          suit specific use cases, and AIP&apos;s embedded performance helpers efficiently manage models efficiently
          throughout their lifecycle.
        </p>
        {overview && (
          <div className="of-aip__statgrid">
            <StatCard label="Stored prompts" value={formatNumber(overview.prompt_count)} />
            <StatCard label="Knowledge bases" value={formatNumber(overview.knowledge_base_count)} />
            <StatCard label="Indexed chunks" value={formatNumber(overview.indexed_chunk_count)} />
            <StatCard label="Indexed documents" value={formatNumber(overview.indexed_document_count)} />
          </div>
        )}
      </section>

      <h2 id="scalability-performance" className="of-aip__sectionHeading">Scalability and performance</h2>
      <section className="of-aip__section">
        <p>
          Designed to handle large-scale data operations, AIP ensures that AI models can be deployed and scaled according
          to organizational needs. The platform&apos;s architecture supports distribution computing, allowing for
          high-performance processing and load that whatever environments you would for mission critical applications. AIP
          also provides granular control of resources and limits.
        </p>
        <p>
          To learn more about the tools that enable developers to monitor and optimize the performance of the agents and
          applications that are built with the platform&apos;s tools, see our{' '}
          <a href="#observability">observability documentation</a>.
        </p>
        {overview && (
          <div className="of-aip__statgrid">
            <StatCard label="Cache entries" value={formatNumber(overview.cache_entry_count)} />
            <StatCard label="Benchmark runs" value={formatNumber(overview.benchmark_run_count)} />
            <StatCard label="Active agents" value={formatNumber(overview.agent_count)} />
          </div>
        )}
      </section>

      <h2 id="explainability-transparency" className="of-aip__sectionHeading">Explainability and transparency</h2>
      <section className="of-aip__section">
        <p>
          Trust is critical when looking at workflows for production deployment. AIP works very well from
          beneficiability and transparency to set up from any other perspective. AIP provides tools for generating and
          explaining model decisions, helping users understand and trust the outputs. This is a vital for organizations
          to add trust as well-informed decisions in many sense. Additionally, AIP offers extensive workflow features to
          ensure outcomes from the platform are based on operational decisions.
        </p>
        <p>
          Note: AIP feature availability is subject to change and may differ between customers.
        </p>
        {overview && (
          <div className="of-aip__statgrid">
            <StatCard label="Prompt tokens" value={formatNumber(overview.llm_prompt_tokens)} />
            <StatCard label="Completion tokens" value={formatNumber(overview.llm_completion_tokens)} />
            <StatCard label="Estimated LLM cost" value={formatCurrency(overview.estimated_llm_cost_usd)} />
          </div>
        )}
        {loadingOverview && (
          <p className="of-text-muted" style={{ marginTop: 12, fontSize: 12 }}>Loading live platform stats…</p>
        )}
      </section>
    </>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="of-aip__statcard">
      <div className="of-aip__statcard-label">{label}</div>
      <div className="of-aip__statcard-value">{value}</div>
      {sub && <div className="of-aip__statcard-sub">{sub}</div>}
    </div>
  );
}

function FeaturesContent() {
  return (
    <div className="of-aip__lead">
      <p>
        Applications across the OpenFoundry platform leverage AIP&apos;s capabilities to surface rich user experiences
        and increase productivity. They can be split into two main categories — applications that natively use AIP, and
        platform features that have AIP-powered capabilities embedded within them.
      </p>
      <h2 id="application-references" className="of-aip__sectionHeading">AIP application references</h2>
      <p>
        AIP-native and AIP-powered applications can be navigated from the Applications panel on the left side of this
        page. Each application has a dedicated documentation guide, with capabilities tailored to its specific
        operational role.
      </p>
      <h2 id="application-capabilities" className="of-aip__sectionHeading">AIP applications and capabilities</h2>
      <p>
        AIP enables operators to build AI workflows on top of organizational ontology. Operators can author{' '}
        <strong>AIP Logic</strong> functions, evaluate them with <strong>AIP Evals</strong>, surface them through{' '}
        <strong>AIP Chatbot Studio</strong>, and observe their behavior across <strong>AIP Threads</strong>.
      </p>
      <h2 id="developer-toolchain" className="of-aip__sectionHeading">AIP and the developer toolchain</h2>
      <p>
        AIP integrates with the OpenFoundry developer toolchain. Users can author transformations, register tools, and
        publish prompt templates that are then available across all AIP surfaces.
      </p>
      <h2 id="platform-applications" className="of-aip__sectionHeading">AIP features in platform applications</h2>
      <p>
        Platform applications such as <strong>Pipeline Builder</strong>, <strong>Notebooks</strong>, and{' '}
        <strong>Workshop</strong> all surface AIP features inline. Users can ask the in-product copilot for help, request
        AI Assist suggestions on prose, and trigger guided pipeline edits from natural language prompts.
      </p>
    </div>
  );
}

function GetStartedContent({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  return (
    <div className="of-aip__lead">
      <p>
        To help you understand the conceptual basics of OpenFoundry and AIP, we recommend that you study the relevant
        educational content in the OpenFoundry Learning portal. This module is designed to provide you with a
        foundational understanding of the platform and AIP&apos;s approach to building data management systems.
      </p>
      <h2 id="gs-foundry-aip" className="of-aip__sectionHeading">Foundry &amp; AIP fundamentals</h2>
      <p>
        Designed for users new to OpenFoundry. This course is designed to provide you with a foundational understanding
        of the platform and AIP&apos;s approach to building data management systems.
      </p>
      <h2 id="gs-aip-tour" className="of-aip__sectionHeading">AIP guided tour</h2>
      <p>
        This 30-minute course covers how to scope and prioritize use cases in the platform. The tour walks through{' '}
        <button type="button" className="of-link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }} onClick={() => onNavigate('console-providers')}>provider configuration</button>,{' '}
        <button type="button" className="of-link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }} onClick={() => onNavigate('console-prompts')}>prompt authoring</button>,
        and a basic agent execution flow.
      </p>
      <h2 id="gs-aip-workflow" className="of-aip__sectionHeading">Build your first AIP workflow</h2>
      <p>
        This hands-on course takes you through the process of building an AI Assistant with AIP in 90 minutes. The course
        covers how to teach information for PDFs, incorporate the data into the Ontology, configure an AIP Chatbot
        (formerly known as an AIP Agent) based on your knowledge graph, and build an interactive application with your
        Chatbot.
      </p>
    </div>
  );
}

function BestPracticesContent() {
  return (
    <div className="of-aip__lead">
      <p>
        Effective LLM prompts are short, specific, and grounded in the operator&apos;s domain language. Use system
        prompts to lock the assistant&apos;s persona, and reference variables to interpolate context at render time.
      </p>
      <p>
        OpenFoundry stores prompts as versioned templates. Treat each iteration as a small, reviewable change — leave
        notes on what was tested, and use guardrail evaluation before promoting a prompt to production.
      </p>
    </div>
  );
}

function SupportedLlmsContent({ overview }: { overview: AiPlatformOverview | null }) {
  return (
    <div className="of-aip__lead">
      <p>
        AIP exposes a multi-provider gateway that fronts every supported LLM. Providers are configured per environment
        with route rules, cost tiers, and modality declarations.
      </p>
      <p>
        OpenAI, Anthropic, Google, Mistral, and self-hosted endpoints (Ollama, vLLM, Bedrock) are first-class. Bring your
        own model is documented under <em>Bring your own model</em>.
      </p>
      {overview && (
        <div className="of-aip__statgrid">
          <StatCard label="Configured providers" value={formatNumber(overview.provider_count)} />
          <StatCard label="Multimodal" value={formatNumber(overview.multimodal_provider_count)} />
          <StatCard label="Private gateways" value={formatNumber(overview.private_provider_count)} />
        </div>
      )}
    </div>
  );
}

function LlmApisContent() {
  return (
    <div className="of-aip__lead">
      <p>
        OpenFoundry exposes a Provider-compatible Chat Completions API and an Embeddings API behind the gateway. Existing
        OpenAI-compatible SDKs work without modification — point the base URL at <code>/api/ai/v1</code>.
      </p>
      <p>
        Auth is handled via API keys issued from <em>Settings · API keys</em>. Each request is routed by the gateway
        according to provider weights, fallbacks, and modality requirements.
      </p>
    </div>
  );
}

function AiEthicsContent() {
  return (
    <div className="of-aip__lead">
      <p>
        AIP is grounded in the same governance model as the rest of OpenFoundry: ABAC-driven access controls, audit
        trails, and a guardrails service that runs over every prompt and completion before it crosses the trust
        boundary.
      </p>
      <p>
        Operators can configure guardrail rules per workspace, force specific use cases through the private network, and
        require human review for any action with high blast radius.
      </p>
    </div>
  );
}

function ComputeUsageContent({ overview }: { overview: AiPlatformOverview | null }) {
  return (
    <div className="of-aip__lead">
      <p>
        Compute usage is metered per provider invocation. Token counts and estimated cost are recorded on every
        completion and aggregated in the platform overview.
      </p>
      {overview && (
        <div className="of-aip__statgrid">
          <StatCard label="Prompt tokens" value={formatNumber(overview.llm_prompt_tokens)} />
          <StatCard label="Completion tokens" value={formatNumber(overview.llm_completion_tokens)} />
          <StatCard label="Estimated cost" value={formatCurrency(overview.estimated_llm_cost_usd)} />
          <StatCard label="Cache hit rate" value={formatPercent(overview.cache_hit_rate)} />
        </div>
      )}
    </div>
  );
}

function ObservabilityContent({ overview }: { overview: AiPlatformOverview | null }) {
  return (
    <div className="of-aip__lead">
      <p>
        AIP observability surfaces the full lifecycle of every request: provider routing, guardrail verdicts, semantic
        cache hits, latency, and the citations returned by retrieval-augmented generation.
      </p>
      <p>
        Threads, traces, and run reports are available under the <strong>AIP Threads</strong> application. The
        platform-wide overview below shows aggregate counters.
      </p>
      {overview && (
        <div className="of-aip__statgrid">
          <StatCard label="Conversations" value={formatNumber(overview.conversation_count)} />
          <StatCard label="Cache entries" value={formatNumber(overview.cache_entry_count)} />
          <StatCard label="Cache hit rate" value={formatPercent(overview.cache_hit_rate)} />
          <StatCard label="Guardrail blocks" value={formatNumber(overview.blocked_guardrail_events)} />
        </div>
      )}
    </div>
  );
}

function AdminEnableContent() {
  return (
    <div className="of-aip__lead">
      <p>
        AIP capabilities are toggled per workspace. Workspace administrators can enable the Logic, Chatbot Studio, and
        Threads applications from <em>Control Panel · AI</em>.
      </p>
      <p>
        Provider availability is governed by route rules: when a workspace requires a private network, only providers
        flagged with <code>network_scope: private</code> are eligible.
      </p>
    </div>
  );
}

function AdminCapacityContent({ overview }: { overview: AiPlatformOverview | null }) {
  return (
    <div className="of-aip__lead">
      <p>
        LLM capacity is configured at the provider level via <code>load_balance_weight</code>,{' '}
        <code>max_output_tokens</code>, and the gateway-level rate limits.
      </p>
      <p>
        When a provider is throttled, the gateway transparently fails over to the next eligible candidate listed in{' '}
        <code>fallback_provider_ids</code>.
      </p>
      {overview && (
        <div className="of-aip__statgrid">
          <StatCard label="Active providers" value={formatNumber(overview.provider_count)} />
          <StatCard label="Cache entries" value={formatNumber(overview.cache_entry_count)} />
        </div>
      )}
    </div>
  );
}

function ByomContent() {
  return (
    <div className="of-aip__lead">
      <p>
        OpenFoundry can connect to any OpenAI-compatible API by registering an LLM provider. Self-hosted deployments
        such as vLLM, Ollama, TGI, and AWS Bedrock all surface as standard providers in the gateway.
      </p>
      <p>
        See the <em>Register an LLM using function interfaces</em> guide for the full registration flow.
      </p>
    </div>
  );
}

function ByomRegisterContent() {
  return (
    <div className="of-aip__lead">
      <p>
        Bring your own model by configuring a new provider with the model&apos;s endpoint URL, API mode (commonly{' '}
        <code>chat_completions</code>), supported modalities, and credential reference. The credential reference must
        resolve to a secret stored in the platform secret manager.
      </p>
    </div>
  );
}

function ByomUseContent() {
  return (
    <div className="of-aip__lead">
      <p>
        Once a provider is registered and enabled, it is selectable as a <code>preferred_provider_id</code> on any chat
        completion call and participates in benchmark runs alongside the platform-managed providers.
      </p>
    </div>
  );
}

interface AppEntry {
  id: AppPageId;
  title: string;
  description: string;
  console: ConsoleId | null;
}

const APPLICATIONS: AppEntry[] = [
  { id: 'app-fde', title: 'AI FDE', description: 'Forward-deployed engineer copilot for embedding domain context inside ontology-driven workflows.', console: 'agents' },
  { id: 'app-analyst', title: 'AIP Analyst', description: 'Analyst-grade AI assistant that grounds responses in the active ontology and dataset context.', console: 'chat' },
  { id: 'app-assist', title: 'AIP Assist', description: 'In-product writing helper. Suggests rewrites, translations, and corrections inline.', console: 'knowledge' },
  { id: 'app-chatbot', title: 'AIP Chatbot Studio', description: 'Author production chatbots that bind to ontology objects, tools, and knowledge bases.', console: 'agents' },
  { id: 'app-doc-intel', title: 'AIP Document Intelligence', description: 'Parse and extract structured information from documents, contracts, and forms.', console: 'tools' },
  { id: 'app-evals', title: 'AIP Evals', description: 'Run guardrail and capability evaluations across prompts and pipelines.', console: 'guardrails' },
  { id: 'app-logic', title: 'AIP Logic', description: 'Author guided LLM transforms (Use LLM, Regex extract, Classify) over tabular data.', console: 'prompts' },
  { id: 'app-model-catalog', title: 'AIP Model Catalog', description: 'Browse, configure, and govern every LLM provider available to the workspace.', console: 'providers' },
  { id: 'app-threads', title: 'AIP Threads', description: 'Inspect every conversation, agent run, and tool invocation across the platform.', console: 'chat' },
];

function ApplicationContent({ appId, onNavigate }: { appId: AppPageId; onNavigate: (page: PageId) => void }) {
  const app = useMemo(() => APPLICATIONS.find((entry) => entry.id === appId), [appId]);
  if (!app) return null;
  return (
    <div className="of-aip__lead">
      <p>{app.description}</p>
      {app.console && (
        <p>
          <button
            type="button"
            className="of-button of-button--primary"
            onClick={() => onNavigate(`console-${app.console!}` as PageId)}
          >
            Open the {PAGE_TITLES[`console-${app.console!}` as PageId]} console
          </button>
        </p>
      )}
      <h2 className="of-aip__sectionHeading">Other AIP applications</h2>
      <div className="of-aip__app-grid">
        {APPLICATIONS.filter((entry) => entry.id !== appId).map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="of-aip__app-card"
            onClick={() => onNavigate(entry.id)}
          >
            <span className="of-aip__app-card-icon">{entry.title.split(' ').map((word) => word[0]).join('').slice(0, 2)}</span>
            <span>
              <p className="of-aip__app-card-title">{entry.title}</p>
              <p className="of-aip__app-card-desc">{entry.description}</p>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// LLM Model Catalog admin surface (B04 §AC#3/#5).
//
// Three sections, each driven by TanStack Query against
// `lib/api/llmCatalog`:
//   - Models table: list/filter, capability badges, per-row PATCH for
//     the enabled flag, and a side panel for quotas + feature mapping.
//   - AIP feature → models matrix: row per feature
//     (aip-chatbot, ai-analyst, document-ai), cell per (provider,
//     model_id) showing whether the model is enabled for that feature.
//   - Provider health: status badge per upstream from
//     /api/v1/llm/providers/health.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getProviderHealth,
  listLlmModels,
  updateLlmModel,
  type LlmCapability,
  type LlmModel,
  type LlmProvider,
  type ProviderState,
  type ProviderStatus,
} from '@/lib/api/llmCatalog';

const KNOWN_FEATURES = ['aip-chatbot', 'ai-analyst', 'document-ai'] as const;
type KnownFeature = (typeof KNOWN_FEATURES)[number];

const PROVIDER_LABEL: Record<LlmProvider, string> = {
  ANTHROPIC: 'Anthropic',
  OPENAI: 'OpenAI',
  AZURE: 'Azure OpenAI',
  OLLAMA: 'Ollama',
  BEDROCK: 'AWS Bedrock',
};

const CAPABILITY_TONE: Record<LlmCapability, string> = {
  CHAT: 'bg-sky-500/20 text-sky-200',
  TEXT: 'bg-slate-500/20 text-slate-200',
  TOOLS: 'bg-emerald-500/20 text-emerald-200',
  VISION: 'bg-amber-500/20 text-amber-100',
};

const STATUS_TONE: Record<ProviderStatus, string> = {
  ok: 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40',
  degraded: 'bg-amber-500/20 text-amber-100 ring-amber-400/40',
  down: 'bg-rose-500/20 text-rose-200 ring-rose-400/40',
  unknown: 'bg-slate-500/20 text-slate-200 ring-slate-400/40',
};

const STATUS_LABEL: Record<ProviderStatus, string> = {
  ok: 'Online',
  degraded: 'Degraded',
  down: 'Down',
  unknown: 'Unknown',
};

export const llmCatalogQueryKey = ['llm', 'models'] as const;
export const llmProviderHealthQueryKey = ['llm', 'providers', 'health'] as const;

export function LlmCatalogPage() {
  return (
    <div className="space-y-8 p-6 text-slate-100">
      <header>
        <h1 className="text-2xl font-semibold">LLM Model Catalog</h1>
        <p className="mt-1 text-sm text-slate-400">
          Registered chat-capable models, quotas, AIP feature mappings, and upstream health.
        </p>
      </header>
      <ProviderHealthSection />
      <ModelsSection />
      <FeatureMatrixSection />
    </div>
  );
}

// ─── Provider health badges ────────────────────────────────────────────

function ProviderHealthSection() {
  const result = useQuery({
    queryKey: llmProviderHealthQueryKey,
    queryFn: getProviderHealth,
    refetchInterval: 15_000,
  });

  if (result.isLoading) {
    return <SectionCard title="Provider health" subtitle="Loading…" />;
  }
  if (result.isError || !result.data) {
    return (
      <SectionCard
        title="Provider health"
        subtitle="No probe wired (set OLLAMA_BASE_URL / AZURE_OPENAI_BASE_URL on llm-catalog-service)."
      />
    );
  }
  const { providers, checked_at } = result.data;
  if (providers.length === 0) {
    return <SectionCard title="Provider health" subtitle="No providers configured." />;
  }
  return (
    <SectionCard
      title="Provider health"
      subtitle={`Last checked ${new Date(checked_at).toLocaleTimeString()}`}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {providers.map((p) => (
          <ProviderHealthCard key={p.provider} state={p} />
        ))}
      </div>
    </SectionCard>
  );
}

function ProviderHealthCard({ state }: { state: ProviderState }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between">
        <div className="font-medium">{PROVIDER_LABEL[state.provider] ?? state.provider}</div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS_TONE[state.status]}`}
          title={state.error || STATUS_LABEL[state.status]}
        >
          {STATUS_LABEL[state.status]}
        </span>
      </div>
      <div className="mt-2 text-xs text-slate-400">
        Latency {state.latency_ms} ms
        {state.http_status ? ` · HTTP ${state.http_status}` : ''}
      </div>
      {state.error ? (
        <div className="mt-2 truncate text-xs text-rose-300" title={state.error}>
          {state.error}
        </div>
      ) : null}
    </div>
  );
}

// ─── Models table ──────────────────────────────────────────────────────

function ModelsSection() {
  const qc = useQueryClient();
  const [providerFilter, setProviderFilter] = useState<LlmProvider | ''>('');
  const [capabilityFilter, setCapabilityFilter] = useState<LlmCapability | ''>('');
  const [featureFilter, setFeatureFilter] = useState<string>('');
  const [onlyEnabled, setOnlyEnabled] = useState(false);

  const params = useMemo(
    () => ({
      provider: providerFilter || undefined,
      capability: capabilityFilter || undefined,
      feature: featureFilter || undefined,
      only_enabled: onlyEnabled,
    }),
    [providerFilter, capabilityFilter, featureFilter, onlyEnabled],
  );

  const result = useQuery({
    queryKey: [...llmCatalogQueryKey, params],
    queryFn: () => listLlmModels(params),
  });
  const models = result.data?.data ?? [];

  const toggleEnabled = useMutation({
    mutationFn: ({ rid, enabled }: { rid: string; enabled: boolean }) =>
      updateLlmModel(rid, { enabled }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: llmCatalogQueryKey });
    },
  });

  return (
    <SectionCard
      title="Registered models"
      subtitle={`${models.length} model${models.length === 1 ? '' : 's'}`}
    >
      <div className="mb-4 flex flex-wrap gap-3">
        <FilterSelect
          label="Provider"
          value={providerFilter}
          onChange={(v) => setProviderFilter(v as LlmProvider | '')}
          options={[
            ['', 'All'],
            ['OLLAMA', 'Ollama'],
            ['OPENAI', 'OpenAI'],
            ['AZURE', 'Azure OpenAI'],
            ['ANTHROPIC', 'Anthropic'],
            ['BEDROCK', 'Bedrock'],
          ]}
        />
        <FilterSelect
          label="Capability"
          value={capabilityFilter}
          onChange={(v) => setCapabilityFilter(v as LlmCapability | '')}
          options={[
            ['', 'All'],
            ['CHAT', 'CHAT'],
            ['TEXT', 'TEXT'],
            ['TOOLS', 'TOOLS'],
            ['VISION', 'VISION'],
          ]}
        />
        <FilterSelect
          label="AIP feature"
          value={featureFilter}
          onChange={setFeatureFilter}
          options={[['', 'All'], ...KNOWN_FEATURES.map<[string, string]>((f) => [f, f])]}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyEnabled}
            onChange={(e) => setOnlyEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-slate-700 bg-slate-800"
          />
          Only enabled
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="pb-2 pr-4">Provider</th>
              <th className="pb-2 pr-4">Model</th>
              <th className="pb-2 pr-4">Capabilities</th>
              <th className="pb-2 pr-4">Features</th>
              <th className="pb-2 pr-4">Quotas</th>
              <th className="pb-2 pr-4">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {result.isLoading ? (
              <tr>
                <td colSpan={6} className="py-4 text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : models.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-4 text-slate-400">
                  No models match these filters.
                </td>
              </tr>
            ) : (
              models.map((m) => (
                <ModelRow
                  key={m.rid}
                  model={m}
                  onToggle={(enabled) => toggleEnabled.mutate({ rid: m.rid, enabled })}
                  toggling={
                    toggleEnabled.isPending &&
                    toggleEnabled.variables?.rid === m.rid
                  }
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function ModelRow({
  model,
  onToggle,
  toggling,
}: {
  model: LlmModel;
  onToggle: (enabled: boolean) => void;
  toggling: boolean;
}) {
  return (
    <tr className="border-t border-slate-800/80">
      <td className="py-3 pr-4">
        <div className="font-medium">{PROVIDER_LABEL[model.provider] ?? model.provider}</div>
      </td>
      <td className="py-3 pr-4">
        <div className="font-mono text-xs text-slate-300">{model.model_id}</div>
        <div className="text-xs text-slate-500">{model.display_name}</div>
      </td>
      <td className="py-3 pr-4">
        <div className="flex flex-wrap gap-1">
          {model.capabilities.map((c) => (
            <span
              key={c}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold ${CAPABILITY_TONE[c]}`}
            >
              {c}
            </span>
          ))}
        </div>
      </td>
      <td className="py-3 pr-4">
        <div className="flex flex-wrap gap-1">
          {model.enabled_for_features.length === 0 ? (
            <span className="text-xs text-slate-500">none</span>
          ) : (
            model.enabled_for_features.map((f) => (
              <span key={f} className="rounded bg-slate-700/40 px-1.5 py-0.5 text-[10px] text-slate-200">
                {f}
              </span>
            ))
          )}
        </div>
      </td>
      <td className="py-3 pr-4 text-xs text-slate-400">
        {model.quotas.requests_per_minute ? `${model.quotas.requests_per_minute} rpm` : '—'}
        {model.quotas.tokens_per_minute ? ` · ${model.quotas.tokens_per_minute.toLocaleString()} tpm` : ''}
      </td>
      <td className="py-3 pr-4">
        <button
          type="button"
          onClick={() => onToggle(!model.enabled)}
          disabled={toggling}
          aria-label={model.enabled ? 'Disable model' : 'Enable model'}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
            model.enabled ? 'bg-emerald-500' : 'bg-slate-700'
          } ${toggling ? 'opacity-50' : ''}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
              model.enabled ? 'translate-x-4' : 'translate-x-1'
            }`}
          />
        </button>
      </td>
    </tr>
  );
}

// ─── AIP feature → models matrix ───────────────────────────────────────

function FeatureMatrixSection() {
  const result = useQuery({
    queryKey: [...llmCatalogQueryKey, 'all-for-matrix'],
    queryFn: () => listLlmModels({}),
  });
  const models = result.data?.data ?? [];

  if (result.isLoading) {
    return <SectionCard title="AIP feature → models" subtitle="Loading…" />;
  }
  return (
    <SectionCard
      title="AIP feature → models"
      subtitle="Which models are wired to each AIP product surface."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="pb-2 pr-4">Feature</th>
              {models.map((m) => (
                <th key={m.rid} className="pb-2 pr-4">
                  <div className="font-medium text-slate-200">
                    {PROVIDER_LABEL[m.provider] ?? m.provider}
                  </div>
                  <div className="font-mono text-[10px] text-slate-500">{m.model_id}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {KNOWN_FEATURES.map((feature) => (
              <FeatureRow key={feature} feature={feature} models={models} />
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function FeatureRow({ feature, models }: { feature: KnownFeature; models: LlmModel[] }) {
  return (
    <tr className="border-t border-slate-800/80">
      <td className="py-3 pr-4 font-mono text-xs text-slate-300">{feature}</td>
      {models.map((m) => {
        const present = m.enabled_for_features.includes(feature);
        return (
          <td key={m.rid} className="py-3 pr-4">
            {present ? (
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                  m.enabled
                    ? 'bg-emerald-500/20 text-emerald-200'
                    : 'bg-slate-500/20 text-slate-400 line-through'
                }`}
                title={m.enabled ? 'Enabled and selectable' : 'Wired but model is disabled'}
              >
                ✓ wired
              </span>
            ) : (
              <span className="text-slate-700">·</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-6">
      <div className="mb-4">
        <h2 className="text-lg font-medium text-slate-100">{title}</h2>
        {subtitle ? <p className="text-xs text-slate-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
      >
        {options.map(([v, lbl]) => (
          <option key={v} value={v}>
            {lbl}
          </option>
        ))}
      </select>
    </label>
  );
}

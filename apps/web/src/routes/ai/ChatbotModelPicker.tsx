// Single-dropdown LLM model picker for Chatbot Studio (B04 §AC#3).
//
// Pulls `capability=CHAT & feature=aip-chatbot & only_enabled=true`
// from llm-catalog-service and persists the chosen rid in
// localStorage so the demo's Ollama ↔ Azure pivot survives a page
// reload. Re-renders against the live provider-health probe so the
// option label shows a status badge ("Down" / "Degraded") — Chatbot
// Studio operators can see at a glance that Azure is unreachable
// before the user clicks Send.

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  getProviderHealth,
  listLlmModels,
  type LlmModel,
  type LlmProvider,
  type ProviderStatus,
} from '@/lib/api/llmCatalog';

const STORAGE_KEY = 'chatbot-studio.selected-model-rid';

const PROVIDER_LABEL: Record<LlmProvider, string> = {
  ANTHROPIC: 'Anthropic',
  OPENAI: 'OpenAI',
  AZURE: 'Azure OpenAI',
  OLLAMA: 'Ollama',
  BEDROCK: 'AWS Bedrock',
};

const STATUS_SUFFIX: Record<ProviderStatus, string> = {
  ok: '',
  degraded: ' · degraded',
  down: ' · DOWN',
  unknown: '',
};

interface ChatbotModelPickerProps {
  value: string;
  onChange: (rid: string) => void;
}

export function ChatbotModelPicker({ value, onChange }: ChatbotModelPickerProps) {
  const models = useQuery({
    queryKey: ['llm', 'models', { capability: 'CHAT', feature: 'aip-chatbot', only_enabled: true }],
    queryFn: () => listLlmModels({ capability: 'CHAT', feature: 'aip-chatbot', only_enabled: true }),
  });
  const health = useQuery({
    queryKey: ['llm', 'providers', 'health'],
    queryFn: getProviderHealth,
    refetchInterval: 15_000,
  });

  const statusByProvider = useMemo(() => {
    const out: Partial<Record<LlmProvider, ProviderStatus>> = {};
    for (const p of health.data?.providers ?? []) {
      out[p.provider] = p.status;
    }
    return out;
  }, [health.data]);

  // Default selection: first model from the list, biased toward an
  // `ok` provider when health data is available.
  useEffect(() => {
    const list = models.data?.data ?? [];
    if (list.length === 0) return;
    if (value && list.some((m) => m.rid === value)) return;
    const preferred = list.find((m) => statusByProvider[m.provider] === 'ok') ?? list[0];
    onChange(preferred.rid);
  }, [models.data, value, onChange, statusByProvider]);

  const list = models.data?.data ?? [];

  return (
    <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <span className="of-eyebrow" style={{ margin: 0 }}>
        Model
      </span>
      <select
        aria-label="Chatbot model"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          try {
            localStorage.setItem(STORAGE_KEY, e.target.value);
          } catch {
            /* localStorage may be unavailable in tests */
          }
        }}
        disabled={models.isLoading || list.length === 0}
        style={{
          background: 'rgba(15, 23, 42, 0.6)',
          color: 'inherit',
          border: '1px solid rgba(148, 163, 184, 0.3)',
          borderRadius: 6,
          padding: '4px 8px',
          fontSize: 13,
          minWidth: 260,
        }}
      >
        {models.isLoading ? (
          <option value="">Loading…</option>
        ) : list.length === 0 ? (
          <option value="">No chat-capable models</option>
        ) : (
          list.map((m) => <ModelOption key={m.rid} model={m} status={statusByProvider[m.provider]} />)
        )}
      </select>
    </label>
  );
}

function ModelOption({ model, status }: { model: LlmModel; status?: ProviderStatus }) {
  const suffix = status ? STATUS_SUFFIX[status] : '';
  const provider = PROVIDER_LABEL[model.provider] ?? model.provider;
  return (
    <option value={model.rid} disabled={status === 'down'}>
      {provider} · {model.model_id}
      {suffix}
    </option>
  );
}

// readStoredModelRid is the recommended way for callers to initialise
// their `value` state — exposed so tests + parent components share the
// same key.
export function readStoredModelRid(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

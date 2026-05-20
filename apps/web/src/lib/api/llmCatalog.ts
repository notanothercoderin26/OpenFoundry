// Wire client for llm-catalog-service (B04).
//
// Distinct from `lib/api/ai.ts::LlmProvider`: that older surface mapped
// the Rust era's `provider/model/endpoint/credential` envelope. The
// post-B04 catalog stores one row per (provider, model_id) tuple with
// capability tags, AIP-feature allowlist, per-model quotas, and an
// enabled flag. Mirrors `services/llm-catalog-service/internal/models`.
import api from './client';

export type LlmProvider = 'ANTHROPIC' | 'OPENAI' | 'AZURE' | 'OLLAMA' | 'BEDROCK';

export type LlmCapability = 'CHAT' | 'TEXT' | 'VISION' | 'TOOLS';

export interface LlmQuotas {
  requests_per_minute?: number;
  tokens_per_minute?: number;
  max_concurrent_requests?: number;
  daily_token_budget?: number;
  daily_cost_budget_usd_cents?: number;
}

export interface LlmModel {
  rid: string;
  provider: LlmProvider;
  model_id: string;
  display_name: string;
  context_window: number;
  input_cost_per_1k: number;
  output_cost_per_1k: number;
  capabilities: LlmCapability[];
  quotas: LlmQuotas;
  enabled_for_features: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface RegisterLlmModelBody {
  provider: LlmProvider;
  model_id: string;
  display_name?: string;
  context_window?: number;
  input_cost_per_1k?: number;
  output_cost_per_1k?: number;
  capabilities?: LlmCapability[];
  quotas?: LlmQuotas;
  enabled_for_features?: string[];
  enabled?: boolean;
}

export interface UpdateLlmModelBody {
  display_name?: string;
  context_window?: number;
  input_cost_per_1k?: number;
  output_cost_per_1k?: number;
  capabilities?: LlmCapability[];
  quotas?: LlmQuotas;
  enabled_for_features?: string[];
  enabled?: boolean;
}

interface ListModelsResponse {
  data: LlmModel[];
}

export interface ListModelsParams {
  provider?: LlmProvider;
  capability?: LlmCapability;
  feature?: string;
  only_enabled?: boolean;
}

function queryString(params: ListModelsParams): string {
  const q = new URLSearchParams();
  if (params.provider) q.set('provider', params.provider);
  if (params.capability) q.set('capability', params.capability);
  if (params.feature) q.set('feature', params.feature);
  if (params.only_enabled) q.set('only_enabled', 'true');
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function listLlmModels(params: ListModelsParams = {}): Promise<ListModelsResponse> {
  return api.get<ListModelsResponse>(`/llm/models${queryString(params)}`);
}

export function getLlmModel(rid: string): Promise<LlmModel> {
  return api.get<LlmModel>(`/llm/models/${rid}`);
}

export function registerLlmModel(body: RegisterLlmModelBody): Promise<LlmModel> {
  return api.post<LlmModel>('/llm/models', body);
}

export function updateLlmModel(rid: string, body: UpdateLlmModelBody): Promise<LlmModel> {
  return api.patch<LlmModel>(`/llm/models/${rid}`, body);
}

// Provider health probe (B04 §AC#6).
export type ProviderStatus = 'unknown' | 'ok' | 'degraded' | 'down';

export interface ProviderState {
  provider: LlmProvider;
  status: ProviderStatus;
  last_check_at: string;
  latency_ms: number;
  http_status?: number;
  error?: string;
}

export interface ProviderHealthSnapshot {
  providers: ProviderState[];
  checked_at: string;
}

export function getProviderHealth(): Promise<ProviderHealthSnapshot> {
  return api.get<ProviderHealthSnapshot>('/llm/providers/health');
}

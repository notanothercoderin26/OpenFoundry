// B07 wire client for agent-runtime-service Threads + ReAct trace.
//
// Mirrors `services/agent-runtime-service/internal/models/threads.go`
// verbatim. The agent surface lives at /api/v1/agent-runtime/threads;
// retrieval-context lives at /api/v1/retrieval.

import { api } from './client';

export type ToolKind =
  | 'object_query'
  | 'action'
  | 'function'
  | 'retrieval'
  | 'command'
  | 'request_clarification';

export interface ToolDefinition {
  name: string;
  kind: ToolKind;
  description?: string;
  config?: Record<string, unknown>;
}

export interface ToolManifest {
  tools: ToolDefinition[];
}

export interface Thread {
  id: string;
  user_id?: string;
  title: string;
  agent_id?: string;
  model_rid?: string;
  tool_manifest: ToolManifest;
  max_tool_calls: number;
  max_prompt_tokens: number;
  status: 'active' | 'archived' | 'closed';
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateThreadBody {
  title: string;
  agent_id?: string;
  model_rid?: string;
  tools?: ToolDefinition[];
  max_tool_calls?: number;
  max_prompt_tokens?: number;
  metadata?: Record<string, unknown>;
}

export type ThreadMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ThreadMessage {
  id: string;
  thread_id: string;
  position: number;
  role: ThreadMessageRole;
  content: string;
  tool_name?: string;
  tool_call_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface PostMessageBody {
  role?: ThreadMessageRole;
  content: string;
  from_replay?: boolean;
}

export interface PostMessageResponse {
  user_message: ThreadMessage;
  assistant_message?: ThreadMessage;
  tool_messages?: ThreadMessage[];
  budget_exhausted?: boolean;
  steps_used: number;
}

export type TraceStepKind =
  | 'plan'
  | 'tool_call'
  | 'observation'
  | 'final'
  | 'error'
  | 'budget_exhausted';

export interface ThreadTraceStep {
  id: string;
  thread_id: string;
  message_id?: string;
  step_index: number;
  kind: TraceStepKind;
  tool_name?: string;
  payload?: Record<string, unknown>;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  created_at: string;
}

const THREADS_BASE = '/agent-runtime/threads';

export function listThreads(limit = 50) {
  return api.get<{ data: Thread[] }>(`${THREADS_BASE}?limit=${limit}`);
}

export function createThread(body: CreateThreadBody) {
  return api.post<Thread>(THREADS_BASE, body);
}

export function getThread(id: string) {
  return api.get<Thread>(`${THREADS_BASE}/${id}`);
}

export function deleteThread(id: string) {
  return api.delete<void>(`${THREADS_BASE}/${id}`);
}

export function listThreadMessages(id: string) {
  return api.get<{ data: ThreadMessage[] }>(`${THREADS_BASE}/${id}/messages`);
}

export function postThreadMessage(id: string, body: PostMessageBody) {
  return api.post<PostMessageResponse>(`${THREADS_BASE}/${id}/messages`, body);
}

export function getThreadTrace(id: string) {
  return api.get<{ data: ThreadTraceStep[] }>(`${THREADS_BASE}/${id}/trace`);
}

// ── Retrieval-context document upload ─────────────────────────────────

export interface UploadDocumentBody {
  knowledge_base_id: string;
  title: string;
  content: string;
  content_type?: string;
  metadata?: Record<string, unknown>;
}

export interface UploadedDocument {
  id: string;
  knowledge_base_id: string;
  title: string;
  chunk_count: number;
  created_at: string;
}

export function uploadRetrievalDocument(body: UploadDocumentBody) {
  return api.post<UploadedDocument>('/retrieval/documents', body);
}

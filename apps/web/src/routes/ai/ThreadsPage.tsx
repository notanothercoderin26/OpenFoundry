// B07 §AC#1/#2/#4 — Threads UI backed by the real agent-runtime
// service.
//
// Layout: three-pane.
//   - Left: thread list (refetched every 30 s) + "New thread" button.
//   - Center: message stream of the selected thread + composer.
//     Sending a message hits POST /threads/{id}/messages and
//     re-renders with the assistant + tool turns the ReAct loop
//     produced.
//   - Right: ReAct trace panel + document uploader (drops a text
//     doc into the demo knowledge base so the `retrieval` tool can
//     find it).

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createThread,
  getThreadTrace,
  listThreadMessages,
  listThreads,
  postThreadMessage,
  uploadRetrievalDocument,
  type Thread,
  type ThreadMessage,
  type ThreadTraceStep,
  type ToolDefinition,
} from '@/lib/api/threads';

const DEFAULT_TOOLS: ToolDefinition[] = [
  {
    name: 'FindAircraftByTail',
    kind: 'object_query',
    description: 'Find an aircraft by its tail number.',
    config: { type_id: 'Aircraft' },
  },
  {
    name: 'ScheduleMaintenance',
    kind: 'action',
    description: 'Schedule a B-check or other maintenance action on an aircraft.',
    config: { action_id: 'schedule-maintenance' },
  },
  {
    name: 'SearchManuals',
    kind: 'retrieval',
    description: 'Search the operations knowledge base for relevant documents.',
    config: { knowledge_base_id: 'ops-manuals' },
  },
];

const threadsKey = ['agent-runtime', 'threads'] as const;

export function ThreadsPage() {
  const qc = useQueryClient();
  const threadsQuery = useQuery({
    queryKey: threadsKey,
    queryFn: () => listThreads(50),
    refetchInterval: 30_000,
  });
  const threads = threadsQuery.data?.data ?? [];

  const [selectedID, setSelectedID] = useState<string | null>(null);
  const selected = useMemo(() => threads.find((t) => t.id === selectedID) ?? null, [threads, selectedID]);
  // Auto-select the most recent thread once the list loads.
  useEffect(() => {
    if (selectedID == null && threads.length > 0) {
      setSelectedID(threads[0].id);
    }
  }, [threads, selectedID]);

  const newThread = useMutation({
    mutationFn: () =>
      createThread({
        title: 'New conversation',
        tools: DEFAULT_TOOLS,
        max_tool_calls: 6,
        max_prompt_tokens: 16000,
      }),
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: threadsKey });
      setSelectedID(created.id);
    },
  });

  return (
    <div className="grid h-full gap-3 p-4 text-slate-100 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
      <ThreadListPane
        threads={threads}
        selectedID={selectedID}
        onSelect={setSelectedID}
        loading={threadsQuery.isLoading}
        onNew={() => newThread.mutate()}
        creating={newThread.isPending}
      />
      <MessagesPane key={selected?.id ?? 'empty'} thread={selected} />
      <SidePane thread={selected} />
    </div>
  );
}

// ── Left: thread list ──────────────────────────────────────────────────

function ThreadListPane({
  threads,
  selectedID,
  onSelect,
  loading,
  onNew,
  creating,
}: {
  threads: Thread[];
  selectedID: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  onNew: () => void;
  creating: boolean;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-200">Threads</h2>
        <button
          type="button"
          onClick={onNew}
          disabled={creating}
          className="rounded bg-sky-500/20 px-2 py-1 text-xs text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
        >
          + New
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : threads.length === 0 ? (
        <p className="text-xs text-slate-400">No threads yet. Click + New to start one.</p>
      ) : (
        <ul className="space-y-1">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                className={`block w-full rounded p-2 text-left text-xs transition ${
                  t.id === selectedID
                    ? 'border border-sky-400/60 bg-sky-500/10'
                    : 'border border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="font-medium text-slate-100">{t.title || 'Untitled'}</div>
                <div className="text-[10px] text-slate-500">
                  {new Date(t.updated_at).toLocaleString()}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Center: messages + composer ────────────────────────────────────────

function MessagesPane({ thread }: { thread: Thread | null }) {
  const qc = useQueryClient();
  const messages = useQuery({
    queryKey: ['agent-runtime', 'thread-messages', thread?.id],
    queryFn: () => (thread ? listThreadMessages(thread.id) : Promise.resolve({ data: [] })),
    enabled: !!thread,
  });

  const [composer, setComposer] = useState('');
  const send = useMutation({
    mutationFn: () => {
      if (!thread) throw new Error('no thread selected');
      const content = composer.trim();
      if (!content) throw new Error('composer empty');
      return postThreadMessage(thread.id, { role: 'user', content });
    },
    onSuccess: async () => {
      setComposer('');
      if (thread) {
        await qc.invalidateQueries({ queryKey: ['agent-runtime', 'thread-messages', thread.id] });
        await qc.invalidateQueries({ queryKey: ['agent-runtime', 'thread-trace', thread.id] });
      }
    },
  });

  if (!thread) {
    return (
      <section className="flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">
        Select a thread or start a new one.
      </section>
    );
  }

  const rows = messages.data?.data ?? [];
  return (
    <section className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/40">
      <header className="border-b border-slate-800 p-3">
        <h2 className="text-base font-medium text-slate-100">{thread.title}</h2>
        <div className="mt-1 text-xs text-slate-500">
          Budgets: max {thread.max_tool_calls} tool calls · {thread.max_prompt_tokens.toLocaleString()} tokens
        </div>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.isLoading ? (
          <p className="text-xs text-slate-400">Loading messages…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-slate-400">No messages yet. Ask something to start the conversation.</p>
        ) : (
          rows.map((m) => <MessageRow key={m.id} message={m} />)
        )}
        {send.isPending ? <p className="text-xs text-slate-500">Agent is thinking…</p> : null}
        {send.isError ? <p className="text-xs text-rose-300">Send failed: {(send.error as Error).message}</p> : null}
      </div>
      <form
        className="border-t border-slate-800 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <textarea
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          placeholder="Ask the agent…"
          rows={2}
          className="w-full rounded border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            disabled={!composer.trim() || send.isPending}
            className="rounded bg-sky-500 px-3 py-1 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </section>
  );
}

const ROLE_TONE: Record<ThreadMessage['role'], string> = {
  user: 'border-sky-500/30 bg-sky-500/5',
  assistant: 'border-emerald-500/30 bg-emerald-500/5',
  tool: 'border-amber-500/30 bg-amber-500/5',
  system: 'border-slate-700/40 bg-slate-700/10',
};

function MessageRow({ message }: { message: ThreadMessage }) {
  return (
    <div className={`rounded border px-3 py-2 ${ROLE_TONE[message.role]}`}>
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-400">
        <span>
          {message.role}
          {message.tool_name ? ` · ${message.tool_name}` : ''}
        </span>
        <span>{new Date(message.created_at).toLocaleTimeString()}</span>
      </div>
      <div className="whitespace-pre-wrap text-sm text-slate-100">{message.content}</div>
    </div>
  );
}

// ── Right: trace + uploader ────────────────────────────────────────────

function SidePane({ thread }: { thread: Thread | null }) {
  return (
    <section className="space-y-3">
      <TracePanel thread={thread} />
      <DocumentUploadPanel />
    </section>
  );
}

const TRACE_TONE: Record<ThreadTraceStep['kind'], string> = {
  plan: 'bg-slate-700/40 text-slate-200',
  tool_call: 'bg-sky-500/20 text-sky-200',
  observation: 'bg-emerald-500/20 text-emerald-200',
  final: 'bg-emerald-500/30 text-emerald-100',
  error: 'bg-rose-500/20 text-rose-200',
  budget_exhausted: 'bg-amber-500/30 text-amber-100',
};

function TracePanel({ thread }: { thread: Thread | null }) {
  const trace = useQuery({
    queryKey: ['agent-runtime', 'thread-trace', thread?.id],
    queryFn: () => (thread ? getThreadTrace(thread.id) : Promise.resolve({ data: [] })),
    enabled: !!thread,
    refetchInterval: thread ? 5_000 : false,
  });
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
      <h2 className="mb-2 text-sm font-medium text-slate-200">ReAct trace</h2>
      {!thread ? (
        <p className="text-xs text-slate-500">Pick a thread to see its trace.</p>
      ) : trace.isLoading ? (
        <p className="text-xs text-slate-400">Loading trace…</p>
      ) : (trace.data?.data ?? []).length === 0 ? (
        <p className="text-xs text-slate-500">No trace yet.</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {trace.data?.data.map((s) => (
            <li key={s.id} className="rounded border border-slate-800 p-2">
              <div className="flex items-center justify-between">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TRACE_TONE[s.kind]}`}>
                  {s.kind}
                </span>
                <span className="font-mono text-[10px] text-slate-500">#{s.step_index}</span>
              </div>
              {s.tool_name ? (
                <div className="mt-1 font-mono text-[10px] text-slate-400">{s.tool_name}</div>
              ) : null}
              {s.payload ? (
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-[10px] text-slate-400">
                  {JSON.stringify(s.payload, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DocumentUploadPanel() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const upload = useMutation({
    mutationFn: () =>
      uploadRetrievalDocument({
        knowledge_base_id: 'ops-manuals',
        title: title || 'Untitled',
        content: body,
      }),
    onSuccess: () => {
      setTitle('');
      setBody('');
    },
  });
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
      <h2 className="mb-2 text-sm font-medium text-slate-200">Upload to knowledge base</h2>
      <p className="mb-2 text-xs text-slate-500">
        Paste text below — chunks are embedded and become available to the `SearchManuals` tool.
      </p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="mb-2 w-full rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Document text"
        rows={4}
        className="mb-2 w-full rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
      />
      <div className="flex items-center justify-between gap-2 text-[10px]">
        {upload.isError ? (
          <span className="text-rose-300">Upload failed</span>
        ) : (
          <span className="text-slate-500">Knowledge base: ops-manuals</span>
        )}
        <button
          type="button"
          onClick={() => upload.mutate()}
          disabled={!body.trim() || upload.isPending}
          className="rounded bg-emerald-500/20 px-2 py-1 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
        >
          {upload.isPending ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {upload.data ? (
        <p className="mt-2 text-[10px] text-emerald-300">
          ✓ {upload.data.title} · {upload.data.chunk_count} chunk{upload.data.chunk_count === 1 ? '' : 's'}
        </p>
      ) : null}
    </div>
  );
}

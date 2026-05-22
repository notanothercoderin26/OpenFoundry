import { useEffect, useState } from 'react';

import { MonacoEditor } from '@/lib/components/MonacoEditor';
import { Glyph } from '@/lib/components/ui/Glyph';
import { notifications } from '@stores/notifications';

import { HelperTodoBanner } from './HelperTodoBanner';

type SqlSubTab = 'editor' | 'favorites' | 'history';

interface SqlEntry {
  id: string;
  label: string;
  query: string;
  saved_at: string;
}

const FAVS_KEY = 'of:code-repos:sql:favorites:v1';
const HIST_KEY = 'of:code-repos:sql:history:v1';
const MAX_HISTORY = 30;

function readEntries(key: string): SqlEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is SqlEntry =>
        entry &&
        typeof entry === 'object' &&
        typeof (entry as { id?: unknown }).id === 'string' &&
        typeof (entry as { query?: unknown }).query === 'string',
    );
  } catch {
    return [];
  }
}

function writeEntries(key: string, entries: ReadonlyArray<SqlEntry>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(entries));
  } catch {
    // ignore — scratchpad persistence is best-effort
  }
}

const STARTER_QUERY = `-- SQL Scratchpad
-- Prepend a branch with backticks to target a non-master view, e.g.
--   SELECT * FROM \`feature/x\`.\`/Project/dataset\`
SELECT 1 AS hello;`;

/**
 * SQL Scratchpad helper. Phase 1 keeps the editor + favourites + history
 * fully client-side because the master plan §10 B11 (sql_history table)
 * has not shipped yet. Once it does, the two arrays here can be swapped
 * for TanStack Query results without touching the UI.
 */
export function SqlScratchpadHelper() {
  const [subTab, setSubTab] = useState<SqlSubTab>('editor');
  const [query, setQuery] = useState<string>(STARTER_QUERY);
  const [favorites, setFavorites] = useState<SqlEntry[]>(() => readEntries(FAVS_KEY));
  const [history, setHistory] = useState<SqlEntry[]>(() => readEntries(HIST_KEY));

  useEffect(() => {
    writeEntries(FAVS_KEY, favorites);
  }, [favorites]);
  useEffect(() => {
    writeEntries(HIST_KEY, history);
  }, [history]);

  function recordRun() {
    if (!query.trim()) return;
    const entry: SqlEntry = {
      id: crypto.randomUUID(),
      label: query.split('\n').find((line) => line.trim().length > 0)?.slice(0, 60) ?? 'SQL run',
      query,
      saved_at: new Date().toISOString(),
    };
    setHistory((current) => [entry, ...current].slice(0, MAX_HISTORY));
    notifications.info('Pretend-running query — wire the SQL execution backend to see real results');
  }

  function saveFavorite() {
    if (!query.trim()) return;
    const labelInput = window.prompt('Save query as…', favorites[0]?.label ?? 'My query');
    if (!labelInput) return;
    const entry: SqlEntry = {
      id: crypto.randomUUID(),
      label: labelInput,
      query,
      saved_at: new Date().toISOString(),
    };
    setFavorites((current) => [entry, ...current].slice(0, 50));
    notifications.success(`Saved “${labelInput}” to favorites`);
  }

  function loadEntry(entry: SqlEntry) {
    setQuery(entry.query);
    setSubTab('editor');
  }

  function deleteEntry(setter: typeof setFavorites, id: string) {
    setter((current) => current.filter((entry) => entry.id !== id));
  }

  return (
    <div className="flex flex-col h-full">
      <HelperTodoBanner
        backendGap="B11"
        description="Favourites and history live in localStorage until /sql/history ships. Query execution is also pending."
      />
      <div className="flex items-center gap-1 px-2 py-1 border-b border-of-border bg-of-surface-raised">
        {(['editor', 'favorites', 'history'] as SqlSubTab[]).map((tab) => {
          const active = tab === subTab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setSubTab(tab)}
              className={`inline-flex items-center h-7 px-2 rounded-of-sm text-of-12 font-of-medium capitalize ${
                active
                  ? 'bg-of-accent-soft text-of-accent'
                  : 'text-of-text-muted hover:bg-of-surface-muted hover:text-of-text'
              }`}
            >
              {tab}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={recordRun}
            className="inline-flex items-center gap-1.5 h-7 px-2 rounded-of-sm text-of-12 font-of-medium bg-of-accent text-white hover:bg-of-accent-hover"
          >
            <Glyph name="run" size={12} tone="currentColor" />
            Run
          </button>
          <button
            type="button"
            onClick={saveFavorite}
            className="inline-flex items-center gap-1.5 h-7 px-2 rounded-of-sm text-of-12 font-of-medium text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
          >
            <Glyph name="star" size={12} tone="currentColor" />
            Save
          </button>
        </div>
      </div>

      {subTab === 'editor' ? (
        <div className="flex-1 min-h-0 border-t border-of-border">
          <MonacoEditor
            value={query}
            language="sql"
            minHeight={220}
            onChange={(value) => setQuery(value)}
          />
        </div>
      ) : subTab === 'favorites' ? (
        <SqlEntryList
          entries={favorites}
          emptyLabel="No favourites saved yet. Hit Save to keep a query around."
          onSelect={loadEntry}
          onDelete={(id) => deleteEntry(setFavorites, id)}
        />
      ) : (
        <SqlEntryList
          entries={history}
          emptyLabel="No history yet. Run a query to populate this list."
          onSelect={loadEntry}
          onDelete={(id) => deleteEntry(setHistory, id)}
        />
      )}
    </div>
  );
}

interface SqlEntryListProps {
  entries: ReadonlyArray<SqlEntry>;
  emptyLabel: string;
  onSelect: (entry: SqlEntry) => void;
  onDelete: (id: string) => void;
}

function SqlEntryList({ entries, emptyLabel, onSelect, onDelete }: SqlEntryListProps) {
  if (entries.length === 0) {
    return (
      <div className="px-3 py-6 text-of-12 text-of-text-soft text-center">{emptyLabel}</div>
    );
  }
  return (
    <ul className="flex-1 min-h-0 overflow-auto divide-y divide-of-border">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-start gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => onSelect(entry)}
            className="flex-1 min-w-0 text-left"
          >
            <p className="text-of-13 text-of-text truncate" title={entry.label}>
              {entry.label}
            </p>
            <pre className="mt-0.5 text-of-12 text-of-text-soft font-mono whitespace-pre-wrap line-clamp-2">
              {entry.query}
            </pre>
            <p className="mt-1 text-of-12 text-of-text-soft">{new Date(entry.saved_at).toLocaleString()}</p>
          </button>
          <button
            type="button"
            aria-label={`Delete ${entry.label}`}
            onClick={() => onDelete(entry.id)}
            className="inline-flex items-center justify-center w-6 h-6 rounded-of-sm text-of-text-soft hover:bg-of-danger-soft hover:text-of-danger"
          >
            <Glyph name="trash" size={12} tone="currentColor" />
          </button>
        </li>
      ))}
    </ul>
  );
}

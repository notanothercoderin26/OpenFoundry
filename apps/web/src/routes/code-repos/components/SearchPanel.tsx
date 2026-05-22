import { useMemo, useRef, type FormEvent } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

import { useRepoState } from '../state/RepoContext';
import { openFiles } from '../state/useOpenFiles';

interface MatchSpan {
  start: number;
  end: number;
}

function findMatches(snippet: string, query: string): MatchSpan[] {
  if (!query) return [];
  const lower = snippet.toLowerCase();
  const needle = query.toLowerCase();
  const spans: MatchSpan[] = [];
  let cursor = 0;
  while (cursor < lower.length) {
    const index = lower.indexOf(needle, cursor);
    if (index === -1) break;
    spans.push({ start: index, end: index + needle.length });
    cursor = index + needle.length;
  }
  return spans;
}

function HighlightedSnippet({ snippet, query }: { snippet: string; query: string }) {
  const matches = useMemo(() => findMatches(snippet, query), [snippet, query]);
  if (matches.length === 0) {
    return <span>{snippet}</span>;
  }
  const parts: Array<{ text: string; highlight: boolean }> = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      parts.push({ text: snippet.slice(cursor, match.start), highlight: false });
    }
    parts.push({ text: snippet.slice(match.start, match.end), highlight: true });
    cursor = match.end;
  }
  if (cursor < snippet.length) {
    parts.push({ text: snippet.slice(cursor), highlight: false });
  }
  return (
    <span>
      {parts.map((part, index) =>
        part.highlight ? (
          <mark key={index} className="bg-of-warning-soft text-of-text rounded-sm px-0.5">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </span>
  );
}

/**
 * Foundry-style code search panel. Wraps the existing searchFiles endpoint
 * (the only server-side index available today) and renders results with
 * inline highlight matching. Clicking a result opens the file in the
 * editor and pre-registers it with useOpenFiles for the multi-tab editor.
 *
 * Phase 0 of the master plan already exposed searchQuery / searchResults
 * / runSearchAction through useRepoState, so this component reuses them
 * verbatim — no new mutation handlers and no extra round-trips.
 */
export function SearchPanel() {
  const { files, searchQuery, searchResults, busy, setSearchQuery, runSearchAction, selectFile } =
    useRepoState();
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!searchQuery.trim() || busy) return;
    void runSearchAction();
  }

  function openResult(path: string) {
    const file = files.find((entry) => entry.path === path);
    selectFile(path);
    if (file) {
      openFiles.open(path, file.language);
    } else {
      openFiles.open(path);
    }
  }

  return (
    <aside
      aria-label="Search panel"
      className="flex flex-col w-72 shrink-0 border-r border-of-border bg-of-surface"
    >
      <header className="flex items-center h-9 px-2 border-b border-of-border bg-of-surface-raised">
        <span className="text-of-12 font-of-semibold uppercase tracking-wider text-of-text-muted">
          Search
        </span>
      </header>

      <form className="p-2" onSubmit={handleSubmit}>
        <div className="relative">
          <input
            ref={inputRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search in files…"
            className="w-full h-8 pl-7 pr-16 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
          />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-of-text-soft">
            <Glyph name="search" size={12} tone="currentColor" />
          </span>
          <button
            type="submit"
            disabled={busy || !searchQuery.trim()}
            className={`absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center h-6 px-2 rounded-of-sm text-of-12 font-of-medium ${
              busy || !searchQuery.trim()
                ? 'bg-of-surface-muted text-of-text-soft cursor-not-allowed'
                : 'bg-of-accent text-white hover:bg-of-accent-hover'
            }`}
          >
            Search
          </button>
        </div>
      </form>

      <div className="px-2 pb-1 text-of-12 text-of-text-soft">
        {searchResults.length === 0
          ? 'Run a query to surface indexed snippets.'
          : `${searchResults.length} match${searchResults.length === 1 ? '' : 'es'}`}
      </div>

      <div className="flex-1 min-h-0 overflow-auto pb-2">
        <ul className="space-y-1 px-1">
          {searchResults.map((result, index) => (
            <li key={`${result.path}-${index}`}>
              <button
                type="button"
                onClick={() => openResult(result.path)}
                className="w-full text-left px-2 py-1.5 rounded-of-sm hover:bg-of-surface-muted focus:bg-of-surface-muted focus:outline-none"
              >
                <p className="text-of-12 font-mono text-of-text truncate">{result.path}</p>
                <p className="mt-0.5 text-of-12 text-of-text-muted line-clamp-2">
                  <HighlightedSnippet snippet={result.snippet} query={searchQuery} />
                </p>
                <p className="mt-0.5 text-of-12 text-of-text-soft">
                  {result.branch_name} · score {(result.score ?? 0).toFixed(2)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

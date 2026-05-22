import { useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

import { useRepoIdentity } from '../../../state/RepoContext';

interface DocsEntry {
  id: string;
  label: string;
  url: string;
}

function entriesForLanguage(language: string | undefined): DocsEntry[] {
  switch (language) {
    case 'python':
      return [
        { id: 'python', label: 'Python 3 docs', url: 'https://docs.python.org/3/' },
        { id: 'foundry-py', label: 'OpenFoundry Python SDK', url: '/developers' },
      ];
    case 'typescript':
    case 'javascript':
      return [
        { id: 'ts', label: 'TypeScript docs', url: 'https://www.typescriptlang.org/docs/' },
        { id: 'mdn', label: 'MDN JavaScript', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript' },
      ];
    case 'sql':
      return [
        { id: 'postgres', label: 'PostgreSQL SQL reference', url: 'https://www.postgresql.org/docs/current/sql.html' },
      ];
    case 'java':
      return [
        { id: 'java', label: 'Java SE API', url: 'https://docs.oracle.com/en/java/javase/21/docs/api/' },
      ];
    case 'rust':
      return [
        { id: 'rust', label: 'Rust std library', url: 'https://doc.rust-lang.org/std/' },
      ];
    case 'go':
      return [
        { id: 'go', label: 'Go standard library', url: 'https://pkg.go.dev/std' },
      ];
    default:
      return [{ id: 'fallback', label: 'OpenFoundry developer portal', url: '/developers' }];
  }
}

/**
 * Docs helper — iframe-backed quick reference. The set of links is keyed
 * by the active file's language, falling back to the in-app developer
 * portal. Many external docs sites set X-Frame-Options: DENY (so the
 * iframe will display nothing); the "Open in new tab" affordance is the
 * primary fallback for that case.
 */
export function DocsHelper() {
  const { selectedFile } = useRepoIdentity();
  const entries = useMemo(() => entriesForLanguage(selectedFile?.language), [selectedFile]);
  const [activeEntry, setActiveEntry] = useState<DocsEntry>(entries[0]);

  // Sync active entry when language changes.
  const [lastLanguage, setLastLanguage] = useState(selectedFile?.language);
  if (selectedFile?.language !== lastLanguage) {
    setLastLanguage(selectedFile?.language);
    setActiveEntry(entries[0]);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-of-border bg-of-surface-raised overflow-x-auto">
        {entries.map((entry) => {
          const active = entry.id === activeEntry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setActiveEntry(entry)}
              className={`inline-flex items-center h-7 px-2 rounded-of-sm text-of-12 font-of-medium whitespace-nowrap ${
                active
                  ? 'bg-of-accent-soft text-of-accent'
                  : 'text-of-text-muted hover:bg-of-surface-muted hover:text-of-text'
              }`}
            >
              {entry.label}
            </button>
          );
        })}
        <a
          href={activeEntry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 h-7 px-2 rounded-of-sm text-of-12 text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
        >
          Open in new tab
          <Glyph name="external-link" size={12} tone="currentColor" />
        </a>
      </div>
      <iframe
        key={activeEntry.url}
        title={activeEntry.label}
        src={activeEntry.url}
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        className="flex-1 min-h-0 w-full border-0 bg-white"
      />
    </div>
  );
}

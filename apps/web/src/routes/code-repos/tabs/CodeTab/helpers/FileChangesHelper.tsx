import { MonacoDiffEditor } from '@/lib/components/MonacoDiffEditor';
import { Glyph } from '@/lib/components/ui/Glyph';

import { useRepoIdentity, useRepoState } from '../../../state/RepoContext';
import { useDirtyContent } from '../../../state/useOpenFiles';

/**
 * File Changes helper.
 *
 * For the active file we compute a diff between the committed content
 * (RepositoryFile.content) and the working content — the dirty buffer
 * from useOpenFiles when present, falling back to the same committed
 * content (no-op diff).
 *
 * The previous-versions navigator (older commits → restore button)
 * arrives once the backend ships GET /repositories/{id}/files/{path}/history
 * (master plan §10 B4). For Phase 1 we show a placeholder strip listing
 * the most recent commits that touched any file on the branch.
 */
export function FileChangesHelper() {
  const { selectedFile, currentBranch } = useRepoIdentity();
  const { commits } = useRepoState();
  const dirtyContent = useDirtyContent(selectedFile?.path ?? '');

  if (!selectedFile) {
    return (
      <div className="px-3 py-6 text-of-12 text-of-text-soft text-center">
        Open a file in the editor to see its changes against HEAD.
      </div>
    );
  }

  const original = selectedFile.content;
  const modified = dirtyContent ?? selectedFile.content;
  const hasChanges = modified !== original;
  const recentCommits = commits.slice(0, 6);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-of-border bg-of-surface-raised">
        <Glyph name="history" size={14} tone="muted" />
        <span className="text-of-13 font-of-semibold">File changes</span>
        <span className="text-of-12 text-of-text-soft font-mono truncate">
          {selectedFile.path}
        </span>
        <span aria-hidden className="text-of-text-soft">·</span>
        <span className="text-of-12 text-of-text-soft">
          {hasChanges ? 'pending edits vs HEAD' : 'no pending changes'}
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_220px] flex-1 min-h-0">
        <div className="flex flex-col min-h-0">
          {hasChanges ? (
            <MonacoDiffEditor
              original={original}
              modified={modified}
              language={selectedFile.language || 'text'}
            />
          ) : (
            <div className="flex-1 grid place-items-center text-of-12 text-of-text-soft">
              No diff to display — edit the file to compare against HEAD.
            </div>
          )}
        </div>

        <aside className="border-l border-of-border bg-of-surface">
          <div className="px-3 py-2 border-b border-of-border">
            <p className="text-of-12 font-of-semibold uppercase tracking-wider text-of-text-muted">
              Previous versions
            </p>
            <p className="mt-1 text-of-12 text-of-text-soft">
              Showing recent commits on {currentBranch}. Per-file history needs gap B4 to surface
              line-accurate older revisions.
            </p>
          </div>
          <ul className="overflow-auto divide-y divide-of-border">
            {recentCommits.length === 0 ? (
              <li className="px-3 py-3 text-of-12 text-of-text-soft">No commits yet.</li>
            ) : (
              recentCommits.map((commit) => (
                <li key={commit.id} className="px-3 py-2">
                  <p className="text-of-13 text-of-text truncate" title={commit.title}>
                    {commit.title}
                  </p>
                  <p className="mt-0.5 text-of-12 text-of-text-soft font-mono truncate">
                    {commit.sha.slice(0, 8)} · {commit.author_name || 'unknown'}
                  </p>
                </li>
              ))
            )}
          </ul>
        </aside>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

import { useRepoIdentity, useRepoState } from '../state/RepoContext';
import { dialogs, useIsDialogOpen } from '../state/useDialogs';

function parseCsv(value: string) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Foundry-style "Propose changes" modal. Pre-fills source = current branch
 * and target = repository default; submits through createMergeRequest with
 * reviewers + labels parsed from CSV. State is driven by the shared
 * dialogs store so any caller (CodeTabActionBar, PullRequestsTab,
 * IdeCommandPalette) can invoke it.
 */
export function NewMergeRequestDialog() {
  const open = useIsDialogOpen('new-pull-request');
  const { repository, currentBranch } = useRepoIdentity();
  const {
    branchOptions,
    busy,
    mergeRequestDraft,
    setMergeRequestDraft,
    createMergeRequestAction,
    pendingFileChanges,
  } = useRepoState();

  const sourceBranch = mergeRequestDraft.source_branch || currentBranch;
  const initialTarget =
    branchOptions.find((branch) => branch === repository.default_branch && branch !== sourceBranch) ??
    branchOptions.find((branch) => branch !== sourceBranch) ??
    repository.default_branch;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetBranch, setTargetBranch] = useState(initialTarget);
  const [labels, setLabels] = useState('');
  const [reviewers, setReviewers] = useState('');
  const [approvalsRequired, setApprovalsRequired] = useState('1');
  const [author, setAuthor] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(mergeRequestDraft.title || '');
    setDescription(mergeRequestDraft.description || '');
    setTargetBranch(mergeRequestDraft.target_branch || initialTarget);
    setLabels(mergeRequestDraft.labels_text || '');
    setReviewers(mergeRequestDraft.reviewers_text || '');
    setApprovalsRequired(mergeRequestDraft.approvals_required || '1');
    setAuthor(mergeRequestDraft.author || '');
  }, [open, mergeRequestDraft, initialTarget]);

  if (!open) return null;

  const canSubmit =
    !busy &&
    title.trim().length > 0 &&
    sourceBranch.length > 0 &&
    targetBranch.length > 0 &&
    targetBranch !== sourceBranch;

  async function handleSubmit() {
    if (!canSubmit) return;
    const approvals = Number(approvalsRequired);
    setMergeRequestDraft({
      title: title.trim(),
      description: description.trim(),
      source_branch: sourceBranch,
      target_branch: targetBranch,
      author: author.trim(),
      labels_text: parseCsv(labels).join(', '),
      reviewers_text: parseCsv(reviewers).join(', '),
      approvals_required: String(Number.isFinite(approvals) && approvals > 0 ? approvals : 1),
      changed_files: String(pendingFileChanges.length || 0),
    });
    await createMergeRequestAction();
    dialogs.close('new-pull-request');
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => dialogs.close('new-pull-request')}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Propose changes"
        className="relative w-full max-w-2xl mx-4 rounded-of-md border border-of-border bg-of-surface-raised shadow-of-card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 h-11 border-b border-of-border">
          <h2 className="text-of-14 font-of-semibold">Propose changes</h2>
          <button
            type="button"
            onClick={() => dialogs.close('new-pull-request')}
            className="inline-flex items-center justify-center w-7 h-7 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
            aria-label="Close"
          >
            <Glyph name="x" size={14} tone="currentColor" />
          </button>
        </header>

        <div className="px-4 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-of-12 font-of-semibold text-of-text-muted block">From</label>
              <div className="mt-1 inline-flex items-center gap-1.5 h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-muted text-of-13 font-mono">
                <Glyph name="workflow" size={12} tone="muted" />
                {sourceBranch}
              </div>
            </div>
            <div>
              <label className="text-of-12 font-of-semibold text-of-text-muted block">Into</label>
              <select
                value={targetBranch}
                onChange={(e) => setTargetBranch(e.target.value)}
                className="mt-1 w-full h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
              >
                {branchOptions.map((target) => (
                  <option key={target} value={target} disabled={target === sourceBranch}>
                    {target}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-of-12 font-of-semibold text-of-text-muted block">Title</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Publish package flow improvements"
              className="mt-1 w-full h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
            />
          </div>

          <div>
            <label className="text-of-12 font-of-semibold text-of-text-muted block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Promotes the feature branch after CI and inline review are green."
              className="mt-1 w-full px-3 py-2 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13 resize-y"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-of-12 font-of-semibold text-of-text-muted block">Reviewers</label>
              <input
                value={reviewers}
                onChange={(e) => setReviewers(e.target.value)}
                placeholder="Elena, Marco"
                className="mt-1 w-full h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
              />
              <p className="mt-1 text-of-12 text-of-text-soft">Comma separated.</p>
            </div>
            <div>
              <label className="text-of-12 font-of-semibold text-of-text-muted block">Labels</label>
              <input
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
                placeholder="preview, package"
                className="mt-1 w-full h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-of-12 font-of-semibold text-of-text-muted block">Author</label>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="(use signed-in identity)"
                className="mt-1 w-full h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
              />
            </div>
            <div>
              <label className="text-of-12 font-of-semibold text-of-text-muted block">
                Approvals required
              </label>
              <input
                type="number"
                min={0}
                value={approvalsRequired}
                onChange={(e) => setApprovalsRequired(e.target.value)}
                className="mt-1 w-full h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
              />
            </div>
          </div>

          {targetBranch === sourceBranch && (
            <div className="text-of-12 text-of-warning">
              Source and target branches cannot match. Pick a different target.
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 px-4 h-12 border-t border-of-border">
          <button
            type="button"
            onClick={() => dialogs.close('new-pull-request')}
            className="inline-flex items-center h-8 px-3 rounded-of-sm text-of-12 font-of-medium bg-of-surface-muted text-of-text hover:bg-of-border"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-of-sm text-of-12 font-of-medium ${
              canSubmit
                ? 'bg-of-accent text-white hover:bg-of-accent-hover'
                : 'bg-of-surface-muted text-of-text-soft cursor-not-allowed'
            }`}
          >
            <Glyph name="share" size={14} tone="currentColor" />
            Open pull request
          </button>
        </footer>
      </div>
    </div>
  );
}

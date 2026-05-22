import { useEffect, useState } from 'react';

import { createGlobalBranch } from '@/lib/api/global-branches';
import { Glyph } from '@/lib/components/ui/Glyph';
import { notifications } from '@stores/notifications';

import { useRepoIdentity, useRepoState } from '../state/RepoContext';
import { dialogs, useIsDialogOpen } from '../state/useDialogs';

type BranchKind = 'code-repos' | 'global';

/**
 * Foundry-style "Create new branch" dialog. Replicates the captura nº 4
 * layout: two radio cards (Code Repositories branch vs. Global branch),
 * "Based on existing branch" picker, branch name input, ontology select
 * (only for Global, currently a hard-coded list since the Ontology
 * service is not wired here yet), and a collapsible Branch security
 * section that toggles the `protected` flag.
 *
 * Code-repos branches hit createBranch via createBranchAction in
 * useRepoState; global branches go through the global-branch-service
 * client. Both close the dialog on success.
 */
export function NewBranchDialog() {
  const open = useIsDialogOpen('new-branch');
  const { repository } = useRepoIdentity();
  const { branches, branchDraft, setBranchDraft, createBranchAction, busy } = useRepoState();

  const [kind, setKind] = useState<BranchKind>('code-repos');
  const [name, setName] = useState('');
  const [baseBranch, setBaseBranch] = useState(repository.default_branch);
  const [description, setDescription] = useState('');
  const [protectedBranch, setProtectedBranch] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [ontology, setOntology] = useState('Example Space Ontology');

  useEffect(() => {
    if (!open) return;
    setKind('code-repos');
    setName('');
    setBaseBranch(repository.default_branch);
    setDescription('');
    setProtectedBranch(false);
    setAdvancedOpen(false);
  }, [open, repository.default_branch]);

  if (!open) return null;

  const nameOk = name.trim().length > 0 && !/\s/.test(name);
  const baseValid = kind === 'global' ? baseBranch === repository.default_branch : true;
  const canSubmit = nameOk && baseValid && !busy;

  async function submit() {
    if (!canSubmit) return;
    if (kind === 'code-repos') {
      setBranchDraft({
        name: name.trim(),
        base_branch: baseBranch,
        protected: protectedBranch,
      });
      // The action picks up branchDraft from useRepoState; flushing here
      // is enough because createBranchAction itself re-reads the snapshot.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await createBranchAction();
    } else {
      try {
        await createGlobalBranch({
          name: name.trim(),
          description: description.trim() || undefined,
          parent_global_branch: null,
        });
        notifications.success(`Created global branch ${name.trim()}`);
      } catch (error) {
        notifications.error(error instanceof Error ? error.message : 'Unable to create global branch');
        return;
      }
    }
    dialogs.close('new-branch');
  }

  // Make sure branchDraft stays primed so createBranchAction reads the
  // intended values when the user picks the code-repos path.
  function syncDraftPreview() {
    if (kind !== 'code-repos') return;
    if (branchDraft.name === name && branchDraft.base_branch === baseBranch && branchDraft.protected === protectedBranch) {
      return;
    }
    setBranchDraft({
      name,
      base_branch: baseBranch,
      protected: protectedBranch,
    });
  }
  syncDraftPreview();

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => dialogs.close('new-branch')}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create new branch"
        className="relative w-full max-w-2xl mx-4 rounded-of-md border border-of-border bg-of-surface-raised shadow-of-card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 h-11 border-b border-of-border">
          <h2 className="text-of-14 font-of-semibold inline-flex items-center gap-2">
            <Glyph name="workflow" size={14} tone="muted" />
            Create new branch
          </h2>
          <button
            type="button"
            onClick={() => dialogs.close('new-branch')}
            className="inline-flex items-center justify-center w-7 h-7 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
            aria-label="Close"
          >
            <Glyph name="x" size={14} tone="currentColor" />
          </button>
        </header>

        <div className="px-4 py-4 space-y-4 max-h-[70vh] overflow-auto">
          <div className="grid grid-cols-2 gap-2">
            <KindCard
              active={kind === 'global'}
              title="Global Branch"
              description="Can contain changes from across other Foundry applications."
              onClick={() => {
                setKind('global');
                setBaseBranch(repository.default_branch);
              }}
            />
            <KindCard
              active={kind === 'code-repos'}
              title="Code Repositories branch"
              description="Changes are local to this Code Repository."
              onClick={() => setKind('code-repos')}
            />
          </div>

          <div>
            <label className="text-of-12 font-of-semibold text-of-text-muted block">
              Based on existing branch
            </label>
            <select
              value={baseBranch}
              onChange={(event) => setBaseBranch(event.target.value)}
              className="mt-1 w-full h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13 font-mono"
              disabled={kind === 'global'}
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.name}>
                  {branch.name}
                  {branch.is_default ? ' (default)' : ''}
                  {branch.protected ? ' · protected' : ''}
                </option>
              ))}
            </select>
            {kind === 'global' && !baseValid ? (
              <p className="mt-1 text-of-12 text-of-warning">
                Global branches must be based on the repository's main branch.
              </p>
            ) : null}
          </div>

          <div>
            <label className="text-of-12 font-of-semibold text-of-text-muted block">Branch name</label>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="A short descriptive name for this branch"
              className="mt-1 w-full h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13 font-mono"
            />
            <p className="mt-1 text-of-12 text-of-text-soft">Do not include sensitive information.</p>
          </div>

          {kind === 'global' ? (
            <>
              <div>
                <label className="text-of-12 font-of-semibold text-of-text-muted block">
                  Ontology
                  <span
                    title="Only this ontology will be editable on this branch"
                    className="ml-1 inline-flex items-center justify-center w-3 h-3 rounded-full bg-of-surface-muted text-of-text-soft text-of-12"
                  >
                    i
                  </span>
                </label>
                <select
                  value={ontology}
                  onChange={(event) => setOntology(event.target.value)}
                  className="mt-1 w-full h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
                >
                  <option>Example Space Ontology</option>
                  <option>Platform Ontology</option>
                </select>
                <p className="mt-1 text-of-12 text-of-text-soft">Only this ontology will be editable on this branch.</p>
              </div>
              <div>
                <label className="text-of-12 font-of-semibold text-of-text-muted block">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  placeholder="Why is this Global Branch being created?"
                  className="mt-1 w-full px-3 py-2 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
                />
              </div>
            </>
          ) : null}

          <section>
            <button
              type="button"
              onClick={() => setAdvancedOpen((value) => !value)}
              className="inline-flex items-center gap-1 text-of-12 font-of-semibold text-of-text-muted hover:text-of-text"
            >
              <Glyph
                name={advancedOpen ? 'chevron-down' : 'chevron-right'}
                size={10}
                tone="currentColor"
              />
              Branch security
              <span className="ml-1 text-of-12 text-of-text-soft">Advanced</span>
            </button>
            {advancedOpen ? (
              <div className="mt-2 rounded-of-sm border border-of-border bg-of-surface p-3 space-y-2">
                <label className="flex items-start gap-2 text-of-13">
                  <input
                    type="checkbox"
                    checked={protectedBranch}
                    onChange={(event) => setProtectedBranch(event.target.checked)}
                    className="mt-0.5 accent-of-accent"
                  />
                  <span>
                    Mark as protected — only merge requests can change this branch once it exists.
                  </span>
                </label>
              </div>
            ) : (
              <p className="mt-1 text-of-12 text-of-text-soft">
                You will be the <span className="font-of-semibold text-of-text">Owner</span> of this branch.
              </p>
            )}
          </section>
        </div>

        <footer className="flex justify-end gap-2 px-4 h-12 border-t border-of-border">
          <button
            type="button"
            onClick={() => dialogs.close('new-branch')}
            className="inline-flex items-center h-8 px-3 rounded-of-sm text-of-12 font-of-medium bg-of-surface-muted text-of-text hover:bg-of-border"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            className={`inline-flex items-center h-8 px-3 rounded-of-sm text-of-12 font-of-medium ${
              canSubmit ? 'bg-of-success text-white hover:opacity-90' : 'bg-of-surface-muted text-of-text-soft cursor-not-allowed'
            }`}
          >
            Create
          </button>
        </footer>
      </div>
    </div>
  );
}

interface KindCardProps {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}

function KindCard({ active, title, description, onClick }: KindCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-of-md border-2 ${
        active ? 'border-of-accent bg-of-accent-soft' : 'border-of-border bg-of-surface hover:border-of-text-soft'
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full border-2 ${
            active ? 'border-of-accent bg-of-accent' : 'border-of-border bg-of-surface-raised'
          }`}
        >
          {active ? <span className="w-1.5 h-1.5 rounded-full bg-white" /> : null}
        </span>
        <div>
          <p className="text-of-13 font-of-semibold">{title}</p>
          <p className="mt-1 text-of-12 text-of-text-muted">{description}</p>
        </div>
      </div>
    </button>
  );
}

import { useMemo, useRef, useState } from 'react';

import type { BranchDefinition } from '@/lib/api/code-repos';
import { Glyph } from '@/lib/components/ui/Glyph';
import { Popover } from '@/lib/components/ui/Popover';
import { notifications } from '@stores/notifications';

interface BranchSelectorProps {
  branches: ReadonlyArray<BranchDefinition>;
  currentBranch: string;
  busy: boolean;
  onSwitch: (branchName: string) => void;
  onCreateBranch: () => void;
}

/**
 * Foundry's branch picker: trigger pill + popover with a search field and
 * a scrollable list. Each entry shows a lock icon when the branch is
 * protected and a "(default)" hint on the default branch. Switching fires
 * onSwitch, which is the consumer's chance to re-fetch files / diffs.
 *
 * Rename is not supported by the current API (master plan §10 B10), so
 * the ✏️ button is rendered but disabled with an explanatory tooltip.
 * Create new branch delegates to onCreateBranch — the consumer opens the
 * NewBranchDialog (Phase 3).
 */
export function BranchSelector({
  branches,
  currentBranch,
  busy,
  onSwitch,
  onCreateBranch,
}: BranchSelectorProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const current = useMemo(
    () => branches.find((branch) => branch.name === currentBranch) ?? null,
    [branches, currentBranch],
  );

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return branches;
    return branches.filter((branch) => branch.name.toLowerCase().includes(needle));
  }, [branches, filter]);

  function handleSelect(branchName: string) {
    setOpen(false);
    setFilter('');
    if (branchName !== currentBranch) {
      onSwitch(branchName);
    }
  }

  return (
    <div className="inline-flex items-center gap-1">
      <button
        ref={triggerRef}
        type="button"
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={current?.protected ? 'Protected branch' : 'Switch branch'}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13 font-of-medium text-of-text hover:bg-of-surface-muted disabled:opacity-60"
      >
        <Glyph name="workflow" size={14} tone="currentColor" />
        <span className="font-mono">{currentBranch || '—'}</span>
        {current?.protected ? <Glyph name="lock" size={12} tone="muted" /> : null}
        <Glyph name="chevron-down" size={12} tone="currentColor" />
      </button>

      <button
        type="button"
        disabled
        title="Rename branch — not supported by the API yet (gap B10)"
        className="inline-flex items-center justify-center w-7 h-7 rounded-of-sm text-of-text-soft cursor-not-allowed"
      >
        <Glyph name="pencil" size={13} tone="currentColor" />
      </button>

      <button
        type="button"
        onClick={onCreateBranch}
        disabled={busy}
        title="Create new branch"
        className="inline-flex items-center justify-center w-7 h-7 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text disabled:opacity-60"
      >
        <Glyph name="plus" size={14} tone="currentColor" />
      </button>

      <Popover
        open={open}
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
        placement="bottom"
        align="start"
        width={320}
        showArrow={false}
        ariaLabel="Switch branch"
      >
        <div className="p-2">
          <div className="relative">
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find branch…"
              className="w-full h-8 pl-7 pr-2 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
            />
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-of-text-soft">
              <Glyph name="search" size={12} tone="currentColor" />
            </span>
          </div>
        </div>
        <ul role="listbox" className="max-h-64 overflow-auto pb-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-of-12 text-of-text-soft">No branches match.</li>
          ) : (
            filtered.map((branch) => {
              const active = branch.name === currentBranch;
              return (
                <li key={branch.id} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => handleSelect(branch.name)}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-left text-of-13 ${
                      active
                        ? 'bg-of-accent-soft text-of-accent font-of-semibold'
                        : 'text-of-text hover:bg-of-surface-muted'
                    }`}
                  >
                    {active ? (
                      <Glyph name="check" size={12} tone="currentColor" />
                    ) : (
                      <span className="w-3" aria-hidden />
                    )}
                    <span className="flex-1 min-w-0 truncate font-mono">{branch.name}</span>
                    {branch.protected ? (
                      <span title="Protected" className="text-of-warning">
                        <Glyph name="lock" size={12} tone="currentColor" />
                      </span>
                    ) : null}
                    {branch.is_default ? (
                      <span className="text-of-12 text-of-text-soft">(default)</span>
                    ) : null}
                    {branch.ahead_by > 0 ? (
                      <span className="text-of-12 text-of-text-soft">↑{branch.ahead_by}</span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="border-t border-of-border px-2 py-1.5">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onCreateBranch();
            }}
            className="inline-flex items-center gap-2 w-full px-2 py-1.5 rounded-of-sm text-of-13 text-of-text hover:bg-of-surface-muted"
          >
            <Glyph name="plus" size={14} tone="currentColor" />
            Create new branch…
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              notifications.info('Manage branches in the Branches tab');
            }}
            className="inline-flex items-center gap-2 w-full px-2 py-1.5 rounded-of-sm text-of-13 text-of-text-muted hover:bg-of-surface-muted"
          >
            <Glyph name="list" size={14} tone="currentColor" />
            Manage all branches
          </button>
        </div>
      </Popover>
    </div>
  );
}

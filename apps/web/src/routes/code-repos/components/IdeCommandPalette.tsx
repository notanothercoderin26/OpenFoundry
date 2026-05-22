import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';

import { useRepoIdentity, useRepoState } from '../state/RepoContext';
import { dialogs } from '../state/useDialogs';
import { helperPanels, type HelperPanelId } from '../state/useHelperPanels';
import { openFiles, useOpenFiles } from '../state/useOpenFiles';
import { tour } from '../state/useTour';

interface IdeCommand {
  id: string;
  label: string;
  hint?: string;
  glyph?: GlyphName;
  shortcut?: string;
  run: () => void | Promise<void>;
}

const HELPER_LABELS: Record<HelperPanelId, string> = {
  'foundry-explorer': 'Foundry Explorer',
  problems: 'Problems',
  debugger: 'Debugger',
  preview: 'Preview',
  tests: 'Tests',
  'file-changes': 'File Changes',
  build: 'Build',
  docs: 'Docs',
  sql: 'SQL Scratchpad',
};

/**
 * F1 / Ctrl+Shift+P command palette scoped to the Code Repositories IDE.
 * Listens for the global keyboard shortcuts and the
 * "of:code-repos:command-palette" custom event (so the Help menu can
 * trigger it). Commands cover dialog launchers, branch switching, helper
 * activation, navigation, file opening and dirty-buffer save-all.
 */
export function IdeCommandPalette() {
  const navigate = useNavigate();
  const { repository, currentBranch } = useRepoIdentity();
  const {
    branches,
    files,
    saveFileAction,
    switchBranchAction,
    triggerCiAction,
  } = useRepoState();
  const { dirty, openFiles: tabs } = useOpenFiles();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const cmdKey = event.metaKey || event.ctrlKey;
      if (event.key === 'F1') {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      if (cmdKey && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      if (event.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    function onCustom() {
      setOpen(true);
    }
    window.addEventListener('of:code-repos:command-palette', onCustom);
    return () => window.removeEventListener('of:code-repos:command-palette', onCustom);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const commands = useMemo<IdeCommand[]>(() => {
    const list: IdeCommand[] = [
      {
        id: 'commit',
        label: 'Commit pending changes…',
        glyph: 'autosaved',
        shortcut: '⌘S',
        run: () => dialogs.open('commit'),
      },
      {
        id: 'propose',
        label: 'Propose changes (open pull request)',
        glyph: 'share',
        run: () => dialogs.open('new-pull-request'),
      },
      {
        id: 'new-branch',
        label: 'Create new branch…',
        glyph: 'plus',
        run: () => dialogs.open('new-branch'),
      },
      {
        id: 'new-tag',
        label: 'Create new tag…',
        glyph: 'tag',
        run: () => dialogs.open('new-tag'),
      },
      {
        id: 'merge',
        label: 'Merge another branch…',
        glyph: 'workflow',
        run: () => dialogs.open('merge'),
      },
      {
        id: 'reset',
        label: 'Reset branch (discard local edits)…',
        glyph: 'undo',
        run: () => dialogs.open('reset'),
      },
      {
        id: 'upgrade',
        label: 'Upgrade language versions…',
        glyph: 'shield-plus',
        run: () => dialogs.open('upgrade'),
      },
      {
        id: 'share',
        label: 'Share repository…',
        glyph: 'users',
        run: () => dialogs.open('share'),
      },
      {
        id: 'build',
        label: 'Trigger CI build',
        glyph: 'pipeline',
        hint: currentBranch,
        run: () => void triggerCiAction(),
      },
      {
        id: 'save-all',
        label: `Save all (${Object.keys(dirty).length} pending)`,
        glyph: 'check',
        run: async () => {
          await openFiles.saveAll(async (path, content) => {
            const file = files.find((entry) => entry.path === path);
            if (file) await saveFileAction(file, content);
          });
        },
      },
      {
        id: 'tour',
        label: 'Take the IDE tour',
        glyph: 'tour',
        run: () => tour.start(),
      },
      {
        id: 'go-branches',
        label: 'Go to Branches tab',
        glyph: 'workflow',
        run: () => navigate(`/code-repos/${repository.id}`),
      },
      {
        id: 'go-pulls',
        label: 'Go to Pull requests tab',
        glyph: 'graph',
        run: () => navigate(`/code-repos/${repository.id}`),
      },
      {
        id: 'go-checks',
        label: 'Go to Checks tab',
        glyph: 'shield',
        run: () => navigate(`/code-repos/${repository.id}`),
      },
      {
        id: 'go-settings',
        label: 'Go to Settings tab',
        glyph: 'settings',
        run: () => navigate(`/code-repos/${repository.id}`),
      },
    ];

    for (const branch of branches) {
      if (branch.name === currentBranch) continue;
      list.push({
        id: `switch:${branch.id}`,
        label: `Switch to ${branch.name}`,
        glyph: 'workflow',
        hint: branch.is_default ? 'default' : branch.protected ? 'protected' : undefined,
        run: () => void switchBranchAction(branch.name),
      });
    }

    for (const helperId of Object.keys(HELPER_LABELS) as HelperPanelId[]) {
      list.push({
        id: `helper:${helperId}`,
        label: `Show ${HELPER_LABELS[helperId]} helper`,
        glyph: 'menu',
        run: () => helperPanels.activate(helperId),
      });
    }

    for (const tab of tabs) {
      list.push({
        id: `focus:${tab.path}`,
        label: `Focus ${tab.path.split('/').at(-1)}`,
        hint: tab.path,
        glyph: 'document',
        run: () => openFiles.setActive(tab.path),
      });
    }

    for (const file of files.slice(0, 40)) {
      list.push({
        id: `open:${file.path}`,
        label: `Open ${file.path}`,
        glyph: 'document',
        run: () => openFiles.open(file.path, file.language),
      });
    }

    return list;
  }, [
    branches,
    currentBranch,
    dirty,
    files,
    navigate,
    repository.id,
    saveFileAction,
    switchBranchAction,
    tabs,
    triggerCiAction,
  ]);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return commands;
    return commands.filter((command) => {
      const haystack = `${command.label} ${command.hint ?? ''}`.toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [commands, query]);

  if (!open) return null;

  function runFirst() {
    const first = filtered[0];
    if (!first) return;
    setOpen(false);
    setQuery('');
    void first.run();
  }

  return (
    <div
      role="presentation"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 110,
        background: 'rgba(2,6,23,0.55)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 80,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="IDE command palette"
        onClick={(event) => event.stopPropagation()}
        className="w-[640px] max-w-[calc(100%-32px)] rounded-of-md border border-of-border bg-of-surface-raised shadow-of-card overflow-hidden"
      >
        <div className="relative">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                runFirst();
              }
            }}
            placeholder="Type a command — F1 to dismiss"
            className="w-full h-12 pl-10 pr-3 text-of-14 bg-transparent border-0 border-b border-of-border focus:outline-none"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-of-text-soft">
            <Glyph name="query" size={14} tone="currentColor" />
          </span>
        </div>
        <ul className="max-h-[60vh] overflow-auto">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-of-12 text-of-text-soft text-center">No matches.</li>
          ) : (
            filtered.slice(0, 80).map((command, index) => (
              <li key={command.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setQuery('');
                    void command.run();
                  }}
                  className={`flex items-center gap-2 w-full px-3 py-2 text-left text-of-13 ${
                    index === 0 ? 'bg-of-accent-soft text-of-accent' : 'text-of-text hover:bg-of-surface-muted'
                  }`}
                >
                  {command.glyph ? <Glyph name={command.glyph} size={13} tone="currentColor" /> : null}
                  <span className="flex-1 min-w-0 truncate">{command.label}</span>
                  {command.hint ? (
                    <span className="text-of-12 text-of-text-soft truncate max-w-[40%]">
                      {command.hint}
                    </span>
                  ) : null}
                  {command.shortcut ? (
                    <kbd className="text-of-12 text-of-text-soft font-mono">{command.shortcut}</kbd>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

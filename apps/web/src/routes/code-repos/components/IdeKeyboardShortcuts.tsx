import { useEffect } from 'react';

import { notifications } from '@stores/notifications';

import { useRepoState } from '../state/RepoContext';
import { dialogs } from '../state/useDialogs';
import { openFiles, useOpenFiles } from '../state/useOpenFiles';

/**
 * Side-effect-only component. Mounted once by the IDE shell to bind the
 * keyboard shortcuts that survive across the whole Code tab:
 *
 *   ⌘/Ctrl+S        — save every dirty file in useOpenFiles.
 *   ⌘/Ctrl+Shift+S  — save and immediately open the Commit dialog.
 *
 * F1 / ⌘+Shift+P are handled by IdeCommandPalette; ⌘+K is reserved for
 * the global app palette so we explicitly do not capture it here.
 */
export function IdeKeyboardShortcuts() {
  const { files, saveFileAction, pendingFileChanges } = useRepoState();
  const { dirty } = useOpenFiles();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const cmdKey = event.metaKey || event.ctrlKey;
      if (!cmdKey) return;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        const entries = Object.entries(dirty);
        if (entries.length === 0) {
          if (pendingFileChanges.length > 0 && event.shiftKey) {
            dialogs.open('commit');
            return;
          }
          notifications.info('Nothing to save');
          return;
        }
        void (async () => {
          await openFiles.saveAll(async (path, content) => {
            const file = files.find((entry) => entry.path === path);
            if (file) await saveFileAction(file, content);
          });
          if (event.shiftKey) {
            dialogs.open('commit');
          } else {
            notifications.success(`Saved ${entries.length} file${entries.length === 1 ? '' : 's'}`);
          }
        })();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, files, pendingFileChanges, saveFileAction]);

  return null;
}

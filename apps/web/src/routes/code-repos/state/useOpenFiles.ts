import { useSyncExternalStore } from 'react';

export interface OpenFileTab {
  path: string;
  language?: string;
  pinned: boolean;
}

export interface ExecutionLocation {
  path: string;
  line: number;
}

interface OpenFilesSnapshot {
  openFiles: OpenFileTab[];
  activePath: string;
  dirty: Record<string, string>;
  /** In-memory breakpoint set per file path. Persisted only for the
   *  current session — see master plan §6 (debugger Phase 4). */
  breakpoints: Record<string, ReadonlyArray<number>>;
  /** Line currently highlighted as "executing" (for the future debugger). */
  executionLine: ExecutionLocation | null;
}

let snapshot: OpenFilesSnapshot = {
  openFiles: [],
  activePath: '',
  dirty: {},
  breakpoints: {},
  executionLine: null,
};

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function setSnapshot(next: OpenFilesSnapshot) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function open(path: string, language?: string, pin = false) {
  const existing = snapshot.openFiles.find((tab) => tab.path === path);
  if (existing) {
    setSnapshot({
      ...snapshot,
      activePath: path,
      openFiles: pin
        ? snapshot.openFiles.map((tab) => (tab.path === path ? { ...tab, pinned: true } : tab))
        : snapshot.openFiles,
    });
    return;
  }
  setSnapshot({
    ...snapshot,
    openFiles: [...snapshot.openFiles, { path, language, pinned: pin }],
    activePath: path,
  });
}

function close(path: string) {
  const remaining = snapshot.openFiles.filter((tab) => tab.path !== path);
  const dirty = { ...snapshot.dirty };
  delete dirty[path];
  const activePath =
    snapshot.activePath === path
      ? (remaining[remaining.length - 1]?.path ?? '')
      : snapshot.activePath;
  setSnapshot({ ...snapshot, openFiles: remaining, activePath, dirty });
}

function closeAll() {
  setSnapshot({ ...snapshot, openFiles: [], activePath: '', dirty: {} });
}

function setActive(path: string) {
  if (snapshot.activePath === path) return;
  setSnapshot({ ...snapshot, activePath: path });
}

function pin(path: string) {
  setSnapshot({
    ...snapshot,
    openFiles: snapshot.openFiles.map((tab) =>
      tab.path === path ? { ...tab, pinned: true } : tab,
    ),
  });
}

function markDirty(path: string, content: string) {
  setSnapshot({ ...snapshot, dirty: { ...snapshot.dirty, [path]: content } });
}

function clearDirty(path: string) {
  if (!(path in snapshot.dirty)) return;
  const dirty = { ...snapshot.dirty };
  delete dirty[path];
  setSnapshot({ ...snapshot, dirty });
}

/**
 * Returns the list of pending edits without mutating the store. The caller
 * is expected to persist each entry through the regular saveFileAction
 * pipeline and then call clearDirty once the round-trip succeeds.
 */
function pendingSaves(): ReadonlyArray<{ path: string; content: string }> {
  return Object.entries(snapshot.dirty).map(([path, content]) => ({ path, content }));
}

/**
 * Convenience wrapper: dispatches every dirty file through the provided
 * persister sequentially, clearing the dirty flag on success.
 */
async function saveAll(persist: (path: string, content: string) => Promise<void>) {
  const entries = pendingSaves();
  for (const entry of entries) {
    try {
      await persist(entry.path, entry.content);
      clearDirty(entry.path);
    } catch {
      // Stop on the first failure so the next attempt picks up the rest.
      break;
    }
  }
}

function reorder(fromIndex: number, toIndex: number) {
  const tabs = snapshot.openFiles;
  if (fromIndex < 0 || fromIndex >= tabs.length) return;
  if (toIndex < 0 || toIndex >= tabs.length) return;
  if (fromIndex === toIndex) return;
  const next = [...tabs];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  setSnapshot({ ...snapshot, openFiles: next });
}

function setLanguage(path: string, language: string) {
  setSnapshot({
    ...snapshot,
    openFiles: snapshot.openFiles.map((tab) =>
      tab.path === path ? { ...tab, language } : tab,
    ),
  });
}

function toggleBreakpoint(path: string, line: number) {
  const current = snapshot.breakpoints[path] ?? [];
  const next = current.includes(line)
    ? current.filter((entry) => entry !== line)
    : [...current, line].sort((a, b) => a - b);
  setSnapshot({ ...snapshot, breakpoints: { ...snapshot.breakpoints, [path]: next } });
}

function setExecutionLine(location: ExecutionLocation | null) {
  setSnapshot({ ...snapshot, executionLine: location });
}

function reset() {
  setSnapshot({ openFiles: [], activePath: '', dirty: {}, breakpoints: {}, executionLine: null });
}

export const openFiles = {
  open,
  close,
  closeAll,
  setActive,
  pin,
  markDirty,
  clearDirty,
  pendingSaves,
  saveAll,
  reorder,
  setLanguage,
  toggleBreakpoint,
  setExecutionLine,
  reset,
  subscribe,
  getSnapshot,
};

export function useOpenFiles() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useActivePath() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.activePath,
    () => snapshot.activePath,
  );
}

export function useDirtyFileCount() {
  return useSyncExternalStore(
    subscribe,
    () => Object.keys(snapshot.dirty).length,
    () => Object.keys(snapshot.dirty).length,
  );
}

export function useIsDirty(path: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => path in snapshot.dirty,
    () => path in snapshot.dirty,
  );
}

export function useDirtyContent(path: string): string | undefined {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.dirty[path],
    () => snapshot.dirty[path],
  );
}

export function useBreakpoints(path: string): ReadonlyArray<number> {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.breakpoints[path] ?? EMPTY_BREAKPOINTS,
    () => snapshot.breakpoints[path] ?? EMPTY_BREAKPOINTS,
  );
}

const EMPTY_BREAKPOINTS: ReadonlyArray<number> = Object.freeze([]);

export function useExecutionLine(): ExecutionLocation | null {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.executionLine,
    () => snapshot.executionLine,
  );
}

import { useSyncExternalStore } from 'react';

export interface OpenFileTab {
  path: string;
  language?: string;
  pinned: boolean;
}

interface OpenFilesSnapshot {
  openFiles: OpenFileTab[];
  activePath: string;
  dirty: Record<string, string>;
}

let snapshot: OpenFilesSnapshot = {
  openFiles: [],
  activePath: '',
  dirty: {},
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
    snapshot.activePath === path ? (remaining[remaining.length - 1]?.path ?? '') : snapshot.activePath;
  setSnapshot({ openFiles: remaining, activePath, dirty });
}

function setActive(path: string) {
  setSnapshot({ ...snapshot, activePath: path });
}

function pin(path: string) {
  setSnapshot({
    ...snapshot,
    openFiles: snapshot.openFiles.map((tab) => (tab.path === path ? { ...tab, pinned: true } : tab)),
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

function reset() {
  setSnapshot({ openFiles: [], activePath: '', dirty: {} });
}

export const openFiles = {
  open,
  close,
  setActive,
  pin,
  markDirty,
  clearDirty,
  reset,
  subscribe,
  getSnapshot,
};

export function useOpenFiles() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useDirtyFileCount() {
  return useSyncExternalStore(
    subscribe,
    () => Object.keys(snapshot.dirty).length,
    () => Object.keys(snapshot.dirty).length,
  );
}

import { useSyncExternalStore } from 'react';

export type DialogId =
  | 'new-branch'
  | 'new-tag'
  | 'merge'
  | 'reset'
  | 'upgrade'
  | 'share'
  | 'commit'
  | 'new-pull-request';

let snapshot: ReadonlySet<DialogId> = new Set();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function setSnapshot(next: ReadonlySet<DialogId>) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function open(id: DialogId) {
  if (snapshot.has(id)) return;
  const next = new Set(snapshot);
  next.add(id);
  setSnapshot(next);
}

function close(id: DialogId) {
  if (!snapshot.has(id)) return;
  const next = new Set(snapshot);
  next.delete(id);
  setSnapshot(next);
}

function closeAll() {
  if (snapshot.size === 0) return;
  setSnapshot(new Set());
}

export const dialogs = { subscribe, getSnapshot, open, close, closeAll };

export function useIsDialogOpen(id: DialogId): boolean {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.has(id),
    () => snapshot.has(id),
  );
}

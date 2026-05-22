import { useSyncExternalStore } from 'react';

/**
 * Per-user starred repositories. Persisted in localStorage because the
 * Code Repositories service does not yet expose a /star endpoint — see the
 * master plan §10 (gap B7). When the backend ships, swap this implementation
 * for a TanStack Query-backed hook and keep the same surface so callers do
 * not need to change.
 */

const STORAGE_KEY = 'of:code-repos:favorites:v1';

function loadInitial(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'));
  } catch {
    return new Set();
  }
}

let snapshot: Set<string> = loadInitial();
const listeners = new Set<() => void>();

function persist() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...snapshot]));
  } catch {
    // ignore — favourites are best-effort
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function setSnapshot(next: Set<string>) {
  snapshot = next;
  persist();
  listeners.forEach((l) => l());
}

function toggle(repositoryId: string) {
  if (!repositoryId) return;
  const next = new Set(snapshot);
  if (next.has(repositoryId)) {
    next.delete(repositoryId);
  } else {
    next.add(repositoryId);
  }
  setSnapshot(next);
}

function isFavorite(repositoryId: string) {
  return snapshot.has(repositoryId);
}

export const favorites = {
  subscribe,
  getSnapshot,
  toggle,
  isFavorite,
};

export function useIsFavorite(repositoryId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.has(repositoryId),
    () => snapshot.has(repositoryId),
  );
}

export function useFavoriteCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.size,
    () => snapshot.size,
  );
}

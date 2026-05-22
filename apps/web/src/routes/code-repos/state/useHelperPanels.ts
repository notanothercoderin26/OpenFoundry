import { useSyncExternalStore } from 'react';

export type HelperPanelId =
  | 'foundry-explorer'
  | 'problems'
  | 'debugger'
  | 'preview'
  | 'tests'
  | 'file-changes'
  | 'build'
  | 'docs'
  | 'sql';

interface HelperPanelsSnapshot {
  active: HelperPanelId | null;
  collapsed: boolean;
  height: number;
}

const DEFAULT_HEIGHT = 280;
const STORAGE_KEY = 'of:code-repos:helper-panels:v1';

function loadInitial(): HelperPanelsSnapshot {
  if (typeof window === 'undefined') {
    return { active: null, collapsed: true, height: DEFAULT_HEIGHT };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { active: null, collapsed: true, height: DEFAULT_HEIGHT };
    const parsed = JSON.parse(raw) as Partial<HelperPanelsSnapshot>;
    return {
      active: (parsed.active as HelperPanelId | null) ?? null,
      collapsed: parsed.collapsed ?? true,
      height: typeof parsed.height === 'number' && parsed.height > 80 ? parsed.height : DEFAULT_HEIGHT,
    };
  } catch {
    return { active: null, collapsed: true, height: DEFAULT_HEIGHT };
  }
}

let snapshot: HelperPanelsSnapshot = loadInitial();
const listeners = new Set<() => void>();

function persist() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore — non-essential
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function setSnapshot(next: HelperPanelsSnapshot) {
  snapshot = next;
  persist();
  listeners.forEach((l) => l());
}

function activate(id: HelperPanelId) {
  setSnapshot({ ...snapshot, active: id, collapsed: false });
}

function toggle(id: HelperPanelId) {
  if (snapshot.active === id && !snapshot.collapsed) {
    setSnapshot({ ...snapshot, collapsed: true });
    return;
  }
  setSnapshot({ ...snapshot, active: id, collapsed: false });
}

function collapse() {
  setSnapshot({ ...snapshot, collapsed: true });
}

function setHeight(height: number) {
  setSnapshot({ ...snapshot, height: Math.max(120, Math.min(800, height)) });
}

export const helperPanels = {
  activate,
  toggle,
  collapse,
  setHeight,
  subscribe,
  getSnapshot,
};

export function useHelperPanels() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

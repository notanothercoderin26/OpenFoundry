// Open-tab model for the Object Explorer top chrome.
//
// A tab represents a workspace context inside the explorer: a fresh
// landing page ("overview"), an executed search ("search"), an
// exploration focused on an object type, or a saved object set /
// saved list opened from the top-right dropdowns. Only one tab is
// active at a time; the active tab id is the source of truth for
// which page state is rendered.
//
// URL schema (each workspace kind owns its own search param so the
// page's inner ?tab= remains free for the Overview/Objects/Object
// types/Artifacts switcher):
//   ?q=<term>            → search results tab.
//   ?type=<typeId>       → type-focused exploration tab.
//   ?exploration=<id>    → saved exploration workspace tab.
//   ?list=<id>           → saved list workspace tab.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export type ExplorerTabKind = 'overview' | 'search' | 'type' | 'exploration' | 'list';

export interface ExplorerTab {
  id: string;
  kind: ExplorerTabKind;
  label: string;
  /** Populated for kind === 'search'. */
  query?: string;
  /** Populated for kind === 'type' | 'exploration' | 'list'. */
  resourceId?: string;
}

const OVERVIEW_TAB: ExplorerTab = { id: 'overview', kind: 'overview', label: 'New exploration' };

const STORAGE_KEY = 'of.object-explorer.tabs';
const STORAGE_MAX_TABS = 10;

function readStoredTabs(): ExplorerTab[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const tabs: ExplorerTab[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as Partial<ExplorerTab>;
      if (!candidate.id || !candidate.kind || !candidate.label) continue;
      if (candidate.kind === 'overview') continue;
      tabs.push({
        id: String(candidate.id),
        kind: candidate.kind as ExplorerTabKind,
        label: String(candidate.label),
        query: typeof candidate.query === 'string' ? candidate.query : undefined,
        resourceId: typeof candidate.resourceId === 'string' ? candidate.resourceId : undefined,
      });
    }
    return tabs.slice(-STORAGE_MAX_TABS);
  } catch {
    return [];
  }
}

function writeStoredTabs(tabs: ExplorerTab[]) {
  if (typeof window === 'undefined') return;
  try {
    const persistable = tabs.filter((tab) => tab.kind !== 'overview').slice(-STORAGE_MAX_TABS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  } catch {
    // Swallow quota / SecurityError — persistence is best-effort.
  }
}

export function makeSearchTab(query: string): ExplorerTab {
  const trimmed = query.trim();
  return {
    id: `search:${trimmed.toLowerCase()}`,
    kind: 'search',
    label: `Search for "${trimmed}"`,
    query: trimmed,
  };
}

export function makeTypeTab(resourceId: string, label: string): ExplorerTab {
  return { id: `type:${resourceId}`, kind: 'type', label, resourceId };
}

export function makeExplorationTab(resourceId: string, label: string): ExplorerTab {
  return { id: `exploration:${resourceId}`, kind: 'exploration', label, resourceId };
}

export function makeListTab(resourceId: string, label: string): ExplorerTab {
  return { id: `list:${resourceId}`, kind: 'list', label, resourceId };
}

const WORKSPACE_PARAM_KEYS = ['q', 'type', 'exploration', 'list'] as const;

export interface ExplorerTabsApi {
  tabs: ExplorerTab[];
  activeTabId: string;
  activeTab: ExplorerTab;
  activate: (id: string) => void;
  open: (tab: ExplorerTab) => void;
  openNewOverview: () => void;
  close: (id: string) => void;
}

export function useExplorerTabs(): ExplorerTabsApi {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tabs, setTabs] = useState<ExplorerTab[]>(() => buildInitialTabs(searchParams));
  const [activeTabId, setActiveTabId] = useState<string>(() => readActiveTabId(searchParams, tabs));

  const writeUrl = useCallback(
    (tab: ExplorerTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const key of WORKSPACE_PARAM_KEYS) next.delete(key);
          if (tab.kind === 'search' && tab.query) next.set('q', tab.query);
          else if (tab.kind === 'type' && tab.resourceId) next.set('type', tab.resourceId);
          else if (tab.kind === 'exploration' && tab.resourceId) next.set('exploration', tab.resourceId);
          else if (tab.kind === 'list' && tab.resourceId) next.set('list', tab.resourceId);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const activate = useCallback(
    (id: string) => {
      setTabs((current) => {
        const target = current.find((tab) => tab.id === id);
        if (target) writeUrl(target);
        return current;
      });
      setActiveTabId(id);
    },
    [writeUrl],
  );

  const open = useCallback(
    (tab: ExplorerTab) => {
      setTabs((current) => (current.some((existing) => existing.id === tab.id) ? current : [...current, tab]));
      setActiveTabId(tab.id);
      writeUrl(tab);
    },
    [writeUrl],
  );

  const openNewOverview = useCallback(() => {
    setTabs((current) => (current.some((tab) => tab.kind === 'overview') ? current : [OVERVIEW_TAB, ...current]));
    setActiveTabId(OVERVIEW_TAB.id);
    writeUrl(OVERVIEW_TAB);
  }, [writeUrl]);

  const close = useCallback(
    (id: string) => {
      if (id === OVERVIEW_TAB.id) return;
      setTabs((current) => {
        const index = current.findIndex((tab) => tab.id === id);
        if (index === -1) return current;
        const next = current.filter((tab) => tab.id !== id);
        const fallback = next[index - 1] ?? next[0] ?? OVERVIEW_TAB;
        const ensured = next.length === 0 ? [OVERVIEW_TAB] : next;
        if (activeTabId === id) {
          setActiveTabId(fallback.id);
          writeUrl(fallback);
        }
        return ensured;
      });
    },
    [activeTabId, writeUrl],
  );

  // If URL search params change externally (back/forward, link share),
  // reconcile the active workspace tab.
  useEffect(() => {
    const fromUrl = paramsToTab(searchParams);
    if (!fromUrl) {
      if (activeTabId !== OVERVIEW_TAB.id) setActiveTabId(OVERVIEW_TAB.id);
      return;
    }
    if (fromUrl.id !== activeTabId) {
      setTabs((current) => (current.some((tab) => tab.id === fromUrl.id) ? current : [...current, fromUrl]));
      setActiveTabId(fromUrl.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Persist the open tab list (sans Overview) so a refresh keeps the
  // tabs reachable even when the URL only points at the active one.
  useEffect(() => {
    writeStoredTabs(tabs);
  }, [tabs]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? OVERVIEW_TAB,
    [tabs, activeTabId],
  );

  return { tabs, activeTabId, activeTab, activate, open, openNewOverview, close };
}

function buildInitialTabs(params: URLSearchParams): ExplorerTab[] {
  const stored = readStoredTabs();
  const fromUrl = paramsToTab(params);
  const tabs: ExplorerTab[] = [OVERVIEW_TAB, ...stored];
  if (fromUrl && fromUrl.kind !== 'overview' && !tabs.some((tab) => tab.id === fromUrl.id)) {
    tabs.push(fromUrl);
  }
  return tabs;
}

function readActiveTabId(params: URLSearchParams, tabs: ExplorerTab[]): string {
  const fromUrl = paramsToTab(params);
  if (fromUrl && tabs.some((tab) => tab.id === fromUrl.id)) return fromUrl.id;
  return OVERVIEW_TAB.id;
}

function paramsToTab(params: URLSearchParams): ExplorerTab | null {
  const q = (params.get('q') ?? '').trim();
  if (q) return makeSearchTab(q);
  const type = (params.get('type') ?? '').trim();
  if (type) return makeTypeTab(type, type);
  const exploration = (params.get('exploration') ?? '').trim();
  if (exploration) return makeExplorationTab(exploration, exploration);
  const list = (params.get('list') ?? '').trim();
  if (list) return makeListTab(list, list);
  return null;
}

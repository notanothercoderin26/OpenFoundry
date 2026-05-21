// Open-tab model for the Object Explorer top chrome.
//
// A tab represents a workspace context inside the explorer: a fresh
// landing page ("overview"), an executed search ("search"), or a
// saved object set / saved list opened from the top-right dropdowns.
// Only one tab is active at a time; the active tab id is the source
// of truth for which page state is rendered.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export type ExplorerTabKind = 'overview' | 'search' | 'exploration' | 'list';

export interface ExplorerTab {
  id: string;
  kind: ExplorerTabKind;
  label: string;
  // Populated for kind === 'search'.
  query?: string;
  // Populated for kind === 'exploration' | 'list'.
  resourceId?: string;
}

const OVERVIEW_TAB: ExplorerTab = { id: 'overview', kind: 'overview', label: 'New exploration' };

export function makeSearchTab(query: string): ExplorerTab {
  const trimmed = query.trim();
  return {
    id: `search:${trimmed.toLowerCase()}`,
    kind: 'search',
    label: `Search for "${trimmed}"`,
    query: trimmed,
  };
}

export function makeExplorationTab(resourceId: string, label: string): ExplorerTab {
  return { id: `exploration:${resourceId}`, kind: 'exploration', label, resourceId };
}

export function makeListTab(resourceId: string, label: string): ExplorerTab {
  return { id: `list:${resourceId}`, kind: 'list', label, resourceId };
}

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
          if (tab.kind === 'overview') {
            next.delete('tab');
            next.delete('q');
            next.delete('id');
          } else {
            next.set('tab', tab.kind);
            if (tab.query !== undefined) next.set('q', tab.query);
            else next.delete('q');
            if (tab.resourceId !== undefined) next.set('id', tab.resourceId);
            else next.delete('id');
          }
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

  // If URL search params change externally (back/forward), reconcile.
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

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? OVERVIEW_TAB,
    [tabs, activeTabId],
  );

  return { tabs, activeTabId, activeTab, activate, open, openNewOverview, close };
}

function buildInitialTabs(params: URLSearchParams): ExplorerTab[] {
  const fromUrl = paramsToTab(params);
  if (!fromUrl || fromUrl.kind === 'overview') return [OVERVIEW_TAB];
  return [OVERVIEW_TAB, fromUrl];
}

function readActiveTabId(params: URLSearchParams, tabs: ExplorerTab[]): string {
  const fromUrl = paramsToTab(params);
  if (fromUrl && tabs.some((tab) => tab.id === fromUrl.id)) return fromUrl.id;
  return OVERVIEW_TAB.id;
}

function paramsToTab(params: URLSearchParams): ExplorerTab | null {
  const kind = params.get('tab');
  if (!kind || kind === 'overview') return null;
  if (kind === 'search') {
    const q = (params.get('q') ?? '').trim();
    if (!q) return null;
    return makeSearchTab(q);
  }
  if (kind === 'exploration') {
    const id = (params.get('id') ?? '').trim();
    if (!id) return null;
    return makeExplorationTab(id, id);
  }
  if (kind === 'list') {
    const id = (params.get('id') ?? '').trim();
    if (!id) return null;
    return makeListTab(id, id);
  }
  return null;
}

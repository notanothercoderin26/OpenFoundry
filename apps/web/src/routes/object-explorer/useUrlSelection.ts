// Two-way sync between explorer URL search params and the page's
// inner selections (active tab + sidebar group scope). Owned
// separately from useExplorerTabs because the workspace tab strip
// claims a disjoint set of params (q / type / exploration / list).

import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import type { SideNavSelection } from './components/SideNavBrowse';

export type InnerTab = 'overview' | 'objects' | 'types' | 'artifacts';

const INNER_TAB_VALUES: ReadonlySet<InnerTab> = new Set(['overview', 'objects', 'types', 'artifacts']);
const EXPLORER_PATHNAME = '/object-explorer';

export interface UrlSelectionApi {
  readTab: () => InnerTab | null;
  readGroup: () => string | null;
  writeTab: (next: InnerTab) => void;
  writeGroup: (next: SideNavSelection) => void;
}

export function useExplorerUrlSelection(): UrlSelectionApi {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  // Cache last-written values so duplicate writes don't bounce
  // through React Router unnecessarily.
  const lastTab = useRef<InnerTab | null>(null);
  const lastGroup = useRef<string | null>(null);

  const readTab = useCallback((): InnerTab | null => {
    const value = searchParams.get('tab');
    return value && INNER_TAB_VALUES.has(value as InnerTab) ? (value as InnerTab) : null;
  }, [searchParams]);

  const readGroup = useCallback((): string | null => {
    const value = searchParams.get('group');
    return value && value.trim() ? value : null;
  }, [searchParams]);

  // Guard: during a route transition the previous page can re-render
  // one more time before unmount. If its sync-effect calls
  // `setSearchParams` after the user has navigated away (e.g. to
  // `/pipelines`), React Router applies the update against the NEW
  // location, which can pin the browser back on the previous route
  // or otherwise interfere with the in-flight transition. Bail out
  // if our pathname no longer matches.
  const writeTab = useCallback(
    (next: InnerTab) => {
      if (lastTab.current === next) return;
      if (location.pathname !== EXPLORER_PATHNAME) return;
      lastTab.current = next;
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === 'overview') params.delete('tab');
          else params.set('tab', next);
          return params;
        },
        { replace: true },
      );
    },
    [location.pathname, setSearchParams],
  );

  const writeGroup = useCallback(
    (selection: SideNavSelection) => {
      const value = selection.kind === 'group' ? selection.groupId : null;
      if (lastGroup.current === value) return;
      if (location.pathname !== EXPLORER_PATHNAME) return;
      lastGroup.current = value;
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (value) params.set('group', value);
          else params.delete('group');
          return params;
        },
        { replace: true },
      );
    },
    [location.pathname, setSearchParams],
  );

  // Keep the refs in sync with whatever the URL currently says, so
  // browser back/forward doesn't get blocked by a stale ref.
  useEffect(() => {
    lastTab.current = readTab();
    lastGroup.current = readGroup();
  }, [readTab, readGroup]);

  return { readTab, readGroup, writeTab, writeGroup };
}

// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';

import { makeExplorationTab, makeSearchTab, useExplorerTabs } from './tabs';

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={['/object-explorer']}>{children}</MemoryRouter>;
}

describe('useExplorerTabs', () => {
  it('starts with a single overview tab', () => {
    const { result } = renderHook(() => useExplorerTabs(), { wrapper });
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeTab.kind).toBe('overview');
  });

  it('opens a search tab and activates it', () => {
    const { result } = renderHook(() => useExplorerTabs(), { wrapper });
    act(() => result.current.open(makeSearchTab('pass')));
    expect(result.current.tabs).toHaveLength(2);
    expect(result.current.activeTab.kind).toBe('search');
    expect(result.current.activeTab.query).toBe('pass');
  });

  it('opens three distinct search tabs', () => {
    const { result } = renderHook(() => useExplorerTabs(), { wrapper });
    act(() => result.current.open(makeSearchTab('pass')));
    act(() => result.current.open(makeSearchTab('flight')));
    act(() => result.current.open(makeSearchTab('airport')));
    expect(result.current.tabs.map((t) => t.kind)).toEqual(['overview', 'search', 'search', 'search']);
    expect(result.current.tabs.map((t) => t.label)).toEqual([
      'New exploration',
      'Search for "pass"',
      'Search for "flight"',
      'Search for "airport"',
    ]);
  });

  it('reuses the same tab when the same query is opened twice', () => {
    const { result } = renderHook(() => useExplorerTabs(), { wrapper });
    act(() => result.current.open(makeSearchTab('pass')));
    act(() => result.current.open(makeSearchTab('PASS'))); // case-insensitive id
    expect(result.current.tabs).toHaveLength(2);
  });

  it('closing the last non-overview tab falls back to overview', () => {
    const { result } = renderHook(() => useExplorerTabs(), { wrapper });
    act(() => result.current.open(makeSearchTab('pass')));
    act(() => result.current.close(result.current.activeTabId));
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeTab.kind).toBe('overview');
  });

  it('closing 3 search tabs restores overview', () => {
    const { result } = renderHook(() => useExplorerTabs(), { wrapper });
    act(() => result.current.open(makeSearchTab('pass')));
    act(() => result.current.open(makeSearchTab('flight')));
    act(() => result.current.open(makeSearchTab('airport')));
    act(() => result.current.close('search:pass'));
    act(() => result.current.close('search:flight'));
    act(() => result.current.close('search:airport'));
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeTab.kind).toBe('overview');
  });

  it('refuses to close the overview tab', () => {
    const { result } = renderHook(() => useExplorerTabs(), { wrapper });
    act(() => result.current.close('overview'));
    expect(result.current.tabs).toHaveLength(1);
  });

  it('activates a previously opened tab by id', () => {
    const { result } = renderHook(() => useExplorerTabs(), { wrapper });
    act(() => result.current.open(makeSearchTab('pass')));
    act(() => result.current.open(makeExplorationTab('expl-1', 'My exploration')));
    act(() => result.current.activate('search:pass'));
    expect(result.current.activeTab.id).toBe('search:pass');
  });
});

// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { useExplorerUrlSelection } from './useUrlSelection';

function wrapperWith(initial: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>;
  };
}

describe('useExplorerUrlSelection', () => {
  it('reads the inner tab from ?tab=', () => {
    const { result } = renderHook(() => useExplorerUrlSelection(), {
      wrapper: wrapperWith('/object-explorer?tab=objects'),
    });
    expect(result.current.readTab()).toBe('objects');
  });

  it('ignores invalid tab values', () => {
    const { result } = renderHook(() => useExplorerUrlSelection(), {
      wrapper: wrapperWith('/object-explorer?tab=garbage'),
    });
    expect(result.current.readTab()).toBeNull();
  });

  it('reads the group selection from ?group=', () => {
    const { result } = renderHook(() => useExplorerUrlSelection(), {
      wrapper: wrapperWith('/object-explorer?group=card-fraud-intelligence'),
    });
    expect(result.current.readGroup()).toBe('card-fraud-intelligence');
  });

  it('writeTab updates the inner tab param, dropping it for overview', () => {
    const { result } = renderHook(() => useExplorerUrlSelection(), {
      wrapper: wrapperWith('/object-explorer'),
    });
    act(() => result.current.writeTab('artifacts'));
    expect(result.current.readTab()).toBe('artifacts');
    act(() => result.current.writeTab('overview'));
    expect(result.current.readTab()).toBeNull();
  });

  it('writeGroup writes for group selections and clears for non-group selections', () => {
    const { result } = renderHook(() => useExplorerUrlSelection(), {
      wrapper: wrapperWith('/object-explorer'),
    });
    act(() => result.current.writeGroup({ kind: 'group', groupId: 'aviation' }));
    expect(result.current.readGroup()).toBe('aviation');
    act(() => result.current.writeGroup({ kind: 'all' }));
    expect(result.current.readGroup()).toBeNull();
  });
});

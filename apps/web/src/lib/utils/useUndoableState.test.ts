// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useUndoableState } from './useUndoableState';

describe('useUndoableState', () => {
  it('starts with the initial value and no history', () => {
    const { result } = renderHook(() => useUndoableState('a'));
    expect(result.current.value).toBe('a');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('pushes new values to the undo stack with coalescing disabled', () => {
    const { result } = renderHook(() => useUndoableState('a', { coalesceMs: 0 }));
    act(() => result.current.setValue('b'));
    act(() => result.current.setValue('c'));
    expect(result.current.value).toBe('c');
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.value).toBe('b');
    act(() => result.current.undo());
    expect(result.current.value).toBe('a');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.redo());
    expect(result.current.value).toBe('b');
  });

  it('coalesces rapid edits into a single history entry', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useUndoableState('a', { coalesceMs: 1000 }));
    act(() => result.current.setValue('ab'));
    act(() => result.current.setValue('abc'));
    act(() => result.current.setValue('abcd'));
    act(() => result.current.undo());
    // All three edits collapsed into one — undo returns to the baseline.
    expect(result.current.value).toBe('a');
    vi.useRealTimers();
  });

  it('replace() baselines without pushing to history', () => {
    const { result } = renderHook(() => useUndoableState('a', { coalesceMs: 0 }));
    act(() => result.current.setValue('b'));
    act(() => result.current.replace('server'));
    expect(result.current.value).toBe('server');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('drops redo stack when a new edit is made', () => {
    const { result } = renderHook(() => useUndoableState('a', { coalesceMs: 0 }));
    act(() => result.current.setValue('b'));
    act(() => result.current.undo());
    act(() => result.current.setValue('c'));
    expect(result.current.canRedo).toBe(false);
  });

  it('respects the history limit', () => {
    const { result } = renderHook(() => useUndoableState(0, { coalesceMs: 0, limit: 3 }));
    for (let i = 1; i <= 5; i++) act(() => result.current.setValue(i));
    expect(result.current.value).toBe(5);
    // 3-entry limit means we can undo only 3 times.
    act(() => result.current.undo());
    act(() => result.current.undo());
    act(() => result.current.undo());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.value).toBe(2);
  });
});

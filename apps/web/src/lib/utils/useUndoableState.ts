import { useCallback, useState } from 'react';

export interface UndoableState<T> {
  value: T;
  setValue: (next: T) => void;
  replace: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clear: () => void;
}

interface Internal<T> {
  past: T[];
  present: T;
  future: T[];
  lastPushAt: number;
}

export interface UseUndoableStateOptions {
  limit?: number;
  coalesceMs?: number;
}

export function useUndoableState<T>(initial: T, options: UseUndoableStateOptions = {}): UndoableState<T> {
  const limit = options.limit ?? 50;
  const coalesceMs = options.coalesceMs ?? 600;
  const [state, setState] = useState<Internal<T>>({ past: [], present: initial, future: [], lastPushAt: 0 });

  const setValue = useCallback((next: T) => {
    setState((current) => {
      if (Object.is(next, current.present)) return current;
      const now = Date.now();
      const coalesce = current.past.length > 0 && now - current.lastPushAt < coalesceMs;
      const past = coalesce ? current.past : [...current.past, current.present].slice(-limit);
      return { past, present: next, future: [], lastPushAt: now };
    });
  }, [coalesceMs, limit]);

  const replace = useCallback((next: T) => {
    setState({ past: [], present: next, future: [], lastPushAt: 0 });
  }, []);

  const undo = useCallback(() => {
    setState((current) => {
      if (current.past.length === 0) return current;
      const previous = current.past[current.past.length - 1];
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future].slice(0, limit),
        lastPushAt: 0,
      };
    });
  }, [limit]);

  const redo = useCallback(() => {
    setState((current) => {
      if (current.future.length === 0) return current;
      const [next, ...rest] = current.future;
      return {
        past: [...current.past, current.present].slice(-limit),
        present: next,
        future: rest,
        lastPushAt: 0,
      };
    });
  }, [limit]);

  const clear = useCallback(() => {
    setState((current) => ({ past: [], present: current.present, future: [], lastPushAt: 0 }));
  }, []);

  return {
    value: state.present,
    setValue,
    replace,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    clear,
  };
}

import { useSyncExternalStore } from 'react';

export type ProblemSeverity = 'error' | 'warning' | 'info';

export interface Problem {
  severity: ProblemSeverity;
  file: string;
  line: number;
  message: string;
  code: string;
}

/**
 * Mock problem feed. The IDE consumes it via the `useProblems` /
 * `useProblemCount` hooks so the Problems helper and the status bar
 * read from a single source of truth. When the LSP gateway lands
 * (master plan §10 B9) the snapshot is swapped for a live feed and
 * every consumer keeps working unchanged.
 */
const MOCK: Problem[] = [
  {
    severity: 'warning',
    file: 'src/lib.rs',
    line: 12,
    message: 'unused import: `serde::Deserialize`',
    code: 'unused_imports',
  },
  {
    severity: 'error',
    file: 'src/lib.rs',
    line: 47,
    message: 'expected `;`, found `}`',
    code: 'E0001',
  },
  {
    severity: 'info',
    file: 'README.md',
    line: 3,
    message: 'Consider adding a license badge',
    code: 'docs.licence',
  },
];

let snapshot: ReadonlyArray<Problem> = MOCK;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function setProblems(next: ReadonlyArray<Problem>) {
  snapshot = next;
  listeners.forEach((l) => l());
}

export const problems = { subscribe, getSnapshot, setProblems };

export function useProblems(filterFile?: string): ReadonlyArray<Problem> {
  const all = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!filterFile) return all;
  return all.filter((problem) => problem.file === filterFile);
}

export function useProblemCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.length,
    () => snapshot.length,
  );
}

export function useErrorCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.filter((problem) => problem.severity === 'error').length,
    () => snapshot.filter((problem) => problem.severity === 'error').length,
  );
}

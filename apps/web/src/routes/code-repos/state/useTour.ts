import { useSyncExternalStore } from 'react';

export interface TourStep {
  id: string;
  /** CSS selector — typically `[data-tour="branch-selector"]`. */
  selector: string;
  title: string;
  description: string;
}

interface TourSnapshot {
  active: boolean;
  stepIndex: number;
  /** Persisted: tour has been completed at least once. */
  completed: boolean;
}

const STORAGE_KEY = 'of:code-repos:tour-completed:v1';

const STEPS: ReadonlyArray<TourStep> = [
  {
    id: 'branch',
    selector: '[data-tour="action-bar"]',
    title: 'Branch + actions',
    description:
      'Switch branches from the pill on the left. Preview / Test / Commit / Build / Propose changes live on the right. The ⋯ menu has Merge / Reset / Upgrade.',
  },
  {
    id: 'files',
    selector: '[data-tour="files-panel"]',
    title: 'Files panel',
    description:
      'Browse, open, rename, move and delete files. The + button creates files, folders or sub-projects from a template.',
  },
  {
    id: 'editor',
    selector: '[data-tour="editor"]',
    title: 'Multi-tab editor',
    description:
      'Tabs in italic are previews until you double-click to pin them. Click the gutter to set breakpoints. Edits save on blur.',
  },
  {
    id: 'preview',
    selector: '[data-tour="preview-button"]',
    title: 'Preview your transform',
    description:
      'Run a sample of the transform without committing. Tests, Commit, Build and Propose changes follow the same pattern.',
  },
  {
    id: 'commit',
    selector: '[data-tour="commit-button"]',
    title: 'Atomic commits',
    description:
      'Commits collect every pending edit into a single change. Sign-off and author overrides live in the dialog.',
  },
  {
    id: 'propose',
    selector: '[data-tour="propose-button"]',
    title: 'Propose changes',
    description:
      'Open a pull request from the current branch into the repository default. Reviewers, labels and required approvals are captured upfront.',
  },
  {
    id: 'helpers',
    selector: '[data-tour="helpers"]',
    title: 'Helper panel',
    description:
      'Foundry Explorer, Problems, Debugger, Preview, Tests, File Changes, Build, Docs and SQL all live here. Drag the top border to resize.',
  },
  {
    id: 'status',
    selector: '[data-tour="status-bar"]',
    title: 'Status bar',
    description:
      'Tells you about Code Assist, pending edits, and the latest CI run on the active branch. Click the problem counter to open the Problems helper.',
  },
];

function loadInitial(): TourSnapshot {
  let completed = false;
  if (typeof window !== 'undefined') {
    try {
      completed = window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // ignore
    }
  }
  return { active: false, stepIndex: 0, completed };
}

let snapshot: TourSnapshot = loadInitial();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function setSnapshot(next: TourSnapshot) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function persistCompletion() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // ignore
  }
}

function start() {
  setSnapshot({ active: true, stepIndex: 0, completed: snapshot.completed });
}

function next() {
  if (!snapshot.active) return;
  const nextIndex = snapshot.stepIndex + 1;
  if (nextIndex >= STEPS.length) {
    finish();
    return;
  }
  setSnapshot({ ...snapshot, stepIndex: nextIndex });
}

function previous() {
  if (!snapshot.active) return;
  setSnapshot({ ...snapshot, stepIndex: Math.max(0, snapshot.stepIndex - 1) });
}

function finish() {
  persistCompletion();
  setSnapshot({ active: false, stepIndex: 0, completed: true });
}

function skip() {
  setSnapshot({ ...snapshot, active: false, stepIndex: 0 });
}

export const tour = { start, next, previous, finish, skip, subscribe, getSnapshot, steps: STEPS };

export function useTour() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

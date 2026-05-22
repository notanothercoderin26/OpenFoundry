import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { UserProfile } from '@/lib/api/auth';
import type { RepositoryDefinition, RepositoryFile } from '@/lib/api/code-repos';
import { useCurrentUser } from '@stores/auth';

import type { UseRepoDataResult } from './useRepoData';

/**
 * Two-layer context for the Code Repositories IDE:
 *
 *   • RepoIdentityContext — the four fields every tab and helper cares about
 *     ({ repository, currentBranch, currentUser, selectedFile }). Small
 *     consumers (header, status bar bits, file tabs) read this and stay
 *     decoupled from the orchestration surface.
 *
 *   • RepoStateContext — the full UseRepoDataResult with every action
 *     handler. Tabs that mutate state read this.
 *
 * Both contexts are populated by <RepoProvider>; identity is derived from
 * the state object so the two never drift.
 */

export interface RepoIdentity {
  repository: RepositoryDefinition;
  currentBranch: string;
  currentUser: UserProfile | null;
  selectedFile: RepositoryFile | null;
}

const RepoIdentityContext = createContext<RepoIdentity | null>(null);
const RepoStateContext = createContext<UseRepoDataResult | null>(null);

interface RepoProviderProps {
  state: UseRepoDataResult;
  children: ReactNode;
}

/**
 * Wraps children in both RepoIdentityContext and RepoStateContext. The
 * shell renders this once with the result of useRepoData(repoId); tabs
 * pull whatever they need via useRepoIdentity / useRepoState.
 *
 * Mounting this provider when `state.repository` is null is a programming
 * error — the shell guards against that and renders a fallback instead.
 */
export function RepoProvider({ state, children }: RepoProviderProps) {
  const currentUser = useCurrentUser();

  if (!state.repository) {
    throw new Error('<RepoProvider> requires a loaded repository');
  }

  const repository = state.repository;

  const identity = useMemo<RepoIdentity>(() => {
    const selectedFile =
      state.files.find((file) => file.path === state.selectedFilePath) ?? null;
    return {
      repository,
      currentBranch: state.currentBranch,
      currentUser,
      selectedFile,
    };
  }, [repository, state.currentBranch, state.files, state.selectedFilePath, currentUser]);

  return (
    <RepoStateContext.Provider value={state}>
      <RepoIdentityContext.Provider value={identity}>{children}</RepoIdentityContext.Provider>
    </RepoStateContext.Provider>
  );
}

/**
 * Focused identity hook. Returns the four fields that describe the current
 * IDE session: which repo, which branch, who is editing, what file they
 * are looking at.
 */
export function useRepoIdentity(): RepoIdentity {
  const value = useContext(RepoIdentityContext);
  if (!value) {
    throw new Error('useRepoIdentity must be used inside <RepoProvider>');
  }
  return value;
}

/**
 * Full IDE state including every mutation handler. Use this for tabs and
 * widgets that need to write back to the backend; prefer useRepoIdentity
 * when you only need the four identity fields.
 */
export function useRepoState(): UseRepoDataResult {
  const value = useContext(RepoStateContext);
  if (!value) {
    throw new Error('useRepoState must be used inside <RepoProvider>');
  }
  return value;
}

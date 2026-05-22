import { createContext, useContext } from 'react';

import type { UseRepoDataResult } from './useRepoData';

/**
 * RepoContext gives tab components access to the currently loaded repository
 * along with every piece of state and every mutation handler exposed by
 * useRepoData. The shell (CodeReposPage) wraps its tab children in
 * RepoContext.Provider; consumers call useRepoContext().
 */
export const RepoContext = createContext<UseRepoDataResult | null>(null);

export function useRepoContext(): UseRepoDataResult {
  const value = useContext(RepoContext);
  if (!value) {
    throw new Error('useRepoContext must be used inside <RepoContext.Provider>');
  }
  return value;
}

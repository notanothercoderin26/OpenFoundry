import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Glyph } from '@/lib/components/ui/Glyph';

import { RepoHeader } from './components/RepoHeader';
import { RepoStatusBar } from './components/RepoStatusBar';
import { RepoTabsNav, type RepoTabId } from './components/RepoTabsNav';
import { RepoProvider } from './state/RepoContext';
import { useRepoData } from './state/useRepoData';
import { BranchesTab } from './tabs/BranchesTab/BranchesTab';
import { ChecksTab } from './tabs/ChecksTab/ChecksTab';
import { CodeTab } from './tabs/CodeTab/CodeTab';
import { PullRequestsTab } from './tabs/PullRequestsTab/PullRequestsTab';
import { SettingsTab } from './tabs/SettingsTab/SettingsTab';

/**
 * Phase 0 shell for the Code Repositories IDE.
 *
 * Top-down: RepoHeader (breadcrumb + clone/share) → RepoTabsNav (5 tabs) →
 * active tab content → RepoStatusBar (sticky bottom). All state lives in
 * useRepoData and is exposed to tabs via RepoContext.
 *
 * The list view (RepoExplorer + overview hero) lives in RepoListPage at
 * /code-repos; this page handles /code-repos/:repoId.
 */
export function CodeReposPage() {
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const data = useRepoData(repoId ?? null);
  const [activeTab, setActiveTab] = useState<RepoTabId>('code');

  if (!repoId) {
    // Defensive — the router should never reach this page without a repoId,
    // but if it does, bounce back to the list rather than throwing.
    navigate('/code-repos', { replace: true });
    return null;
  }

  if (data.loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3rem)] gap-2 text-of-text-muted">
        <Glyph name="code" size={24} tone="muted" />
        <p className="text-of-13">Loading repository…</p>
      </div>
    );
  }

  if (!data.repository) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3rem)] gap-3 text-of-text-muted">
        <p className="text-of-14 font-of-semibold text-of-text">Repository not found</p>
        <p className="text-of-13">{data.uiError || `No repository with id ${repoId}.`}</p>
        <button
          type="button"
          onClick={() => navigate('/code-repos')}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-of-sm text-of-12 font-of-medium bg-of-accent text-white hover:bg-of-accent-hover"
        >
          Back to Code Repositories
        </button>
      </div>
    );
  }

  return (
    <RepoProvider state={data}>
      <div className="flex flex-col bg-of-canvas" style={{ minHeight: 'calc(100vh - 3rem)' }}>
        <RepoHeader />
        <RepoTabsNav active={activeTab} onChange={setActiveTab} />

        {data.uiError && (
          <div
            role="alert"
            className="mx-4 mt-3 px-3 py-2 rounded-of-sm border border-of-danger-soft bg-of-danger-soft text-of-13 text-of-danger"
          >
            {data.uiError}
          </div>
        )}

        <main className="flex-1 min-h-0 overflow-auto">
          {activeTab === 'code' && <CodeTab />}
          {activeTab === 'branches' && <BranchesTab />}
          {activeTab === 'pull-requests' && <PullRequestsTab />}
          {activeTab === 'checks' && <ChecksTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </main>

        <RepoStatusBar />
      </div>
    </RepoProvider>
  );
}

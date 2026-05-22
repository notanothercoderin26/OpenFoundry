import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

import { Glyph } from '@/lib/components/ui/Glyph';

import { CommitDialog } from './dialogs/CommitDialog';
import { MergeDialog } from './dialogs/MergeDialog';
import { NewBranchDialog } from './dialogs/NewBranchDialog';
import { NewMergeRequestDialog } from './dialogs/NewMergeRequestDialog';
import { NewTagDialog } from './dialogs/NewTagDialog';
import { ResetDialog } from './dialogs/ResetDialog';
import { ShareDialog } from './dialogs/ShareDialog';
import { UpgradeDialog } from './dialogs/UpgradeDialog';

import { IdeCommandPalette } from './components/IdeCommandPalette';
import { IdeKeyboardShortcuts } from './components/IdeKeyboardShortcuts';
import { RepoHeader } from './components/RepoHeader';
import { RepoStatusBar } from './components/RepoStatusBar';
import { RepoTabsNav, type RepoTabId } from './components/RepoTabsNav';
import { TourOverlay } from './components/TourOverlay';
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
 * F3 additions: every IDE dialog (NewBranch / NewTag / Merge / Reset /
 * Upgrade / Share / Commit / NewPullRequest) is mounted once here driven
 * by the dialogs store; the IdeCommandPalette listens for F1 / ⌘+Shift+P;
 * IdeKeyboardShortcuts binds ⌘+S; TourOverlay drives the walkthrough.
 */
export function CodeReposPage() {
  const { repoId } = useParams<{ repoId: string }>();
  const data = useRepoData(repoId ?? null);
  const [activeTab, setActiveTab] = useState<RepoTabId>('code');

  if (!repoId) {
    return <Navigate to="/code-repos" replace />;
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
        <Link
          to="/code-repos"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-of-sm text-of-12 font-of-medium bg-of-accent text-white hover:bg-of-accent-hover"
        >
          Back to Code Repositories
        </Link>
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

        {/* IDE dialogs mounted once at the shell level. Each reads its open
            state from the dialogs store so any caller can invoke them. */}
        <CommitDialog />
        <MergeDialog />
        <NewBranchDialog />
        <NewMergeRequestDialog />
        <NewTagDialog />
        <ResetDialog />
        <ShareDialog />
        <UpgradeDialog />

        <IdeCommandPalette />
        <IdeKeyboardShortcuts />
        <TourOverlay />
      </div>
    </RepoProvider>
  );
}

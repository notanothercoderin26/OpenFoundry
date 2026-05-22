import { TabBar, type TabBarItem } from '@/lib/components/ui/TabBar';

import { useRepoState } from '../state/RepoContext';

export type RepoTabId = 'code' | 'branches' | 'pull-requests' | 'checks' | 'settings';

interface RepoTabsNavProps {
  active: RepoTabId;
  onChange: (next: RepoTabId) => void;
}

export function RepoTabsNav({ active, onChange }: RepoTabsNavProps) {
  const { mergeRequests, branches, ciRuns } = useRepoState();

  const openMergeRequests = mergeRequests.filter(
    (mr) => mr.status === 'open' || mr.status === 'approved',
  ).length;
  const failingCiRuns = ciRuns.filter((run) => run.status === 'failed').length;

  const tabs: TabBarItem<RepoTabId>[] = [
    { id: 'code', label: 'Code', glyph: 'code' },
    { id: 'branches', label: 'Branches', glyph: 'workflow', count: branches.length || undefined },
    // Pull request badge always shows the count — even when zero — to match
    // Foundry, where the empty state is informative.
    { id: 'pull-requests', label: 'Pull requests', glyph: 'graph', count: openMergeRequests },
    { id: 'checks', label: 'Checks', glyph: 'shield', count: failingCiRuns || undefined },
    { id: 'settings', label: 'Settings', glyph: 'settings' },
  ];

  return (
    <div className="px-3 bg-of-surface-raised">
      <TabBar tabs={tabs} active={active} onChange={onChange} />
    </div>
  );
}

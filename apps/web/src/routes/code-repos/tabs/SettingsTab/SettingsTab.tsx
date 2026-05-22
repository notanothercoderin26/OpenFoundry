import { useNavigate } from 'react-router-dom';

import { RepoExplorer } from '@/lib/components/code-repo/RepoExplorer';

import { useRepoContext } from '../../state/useRepoContext';

/**
 * Settings tab — Phase 0 reuses the existing RepoExplorer form scoped to the
 * currently loaded repository. F5 splits this into the proper Foundry layout
 * (Personal preferences / Repository settings / Permissions / Tag validation).
 */
export function SettingsTab() {
  const navigate = useNavigate();
  const { repository, repositoryDraft, busy, setRepositoryDraft, saveRepository } = useRepoContext();

  if (!repository) return null;

  return (
    <div className="p-4">
      <RepoExplorer
        overview={null}
        repositories={[repository]}
        selectedRepositoryId={repository.id}
        draft={repositoryDraft}
        busy={busy}
        onSelectRepository={(id) => {
          if (id && id !== repository.id) navigate(`/code-repos/${id}`);
        }}
        onDraftChange={setRepositoryDraft}
        onSave={() => void saveRepository()}
        onReset={() => navigate('/code-repos')}
      />
    </div>
  );
}

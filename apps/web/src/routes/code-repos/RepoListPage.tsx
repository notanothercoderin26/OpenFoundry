import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  createRepository,
  getOverview,
  listRepositories,
  updateRepository,
  type RepositoryDefinition,
  type RepositoryOverview,
} from '@/lib/api/code-repos';
import { RepoExplorer, type RepositoryDraft } from '@/lib/components/code-repo/RepoExplorer';
import { notifications } from '@stores/notifications';

function emptyRepoDraft(): RepositoryDraft {
  return {
    name: 'Foundry Widget Kit',
    slug: 'foundry-widget-kit',
    description: 'Shared widget primitives ready for marketplace publication.',
    owner: 'Platform UI',
    default_branch: 'main',
    visibility: 'private',
    object_store_backend: 'gitoxide-pack',
    package_kind: 'widget',
    tags_text: 'widgets, ui, marketplace',
    settings_text: JSON.stringify(
      { default_path: 'src/lib.rs', ci_required: true, allow_direct_commits_on_protected: false },
      null,
      2,
    ),
  };
}

function parseCsv(value: string) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseJson<T>(value: string) {
  return JSON.parse(value) as T;
}

/**
 * Landing page for /code-repos. Shows the lifecycle overview, a list of
 * existing repositories, and a creation form. Selecting a repository
 * navigates to /code-repos/:repoId where the IDE shell takes over.
 */
export function RepoListPage() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<RepositoryOverview | null>(null);
  const [repositories, setRepositories] = useState<RepositoryDefinition[]>([]);
  const [draft, setDraft] = useState<RepositoryDraft>(emptyRepoDraft);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uiError, setUiError] = useState('');

  async function refresh() {
    setLoading(true);
    setUiError('');
    try {
      const [overviewResponse, repositoriesResponse] = await Promise.all([getOverview(), listRepositories()]);
      setOverview(overviewResponse);
      setRepositories(repositoriesResponse.items);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load repositories';
      setUiError(message);
      notifications.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function save() {
    setBusy(true);
    setUiError('');
    try {
      const payload = {
        name: draft.name,
        slug: draft.slug,
        description: draft.description,
        owner: draft.owner,
        default_branch: draft.default_branch,
        visibility: draft.visibility,
        object_store_backend: draft.object_store_backend,
        package_kind: draft.package_kind,
        tags: parseCsv(draft.tags_text),
        settings: parseJson<Record<string, unknown>>(draft.settings_text),
      };
      const repository = draft.id
        ? await updateRepository(draft.id, payload)
        : await createRepository(payload);
      notifications.success(`${draft.id ? 'Updated' : 'Created'} ${repository.name}`);
      navigate(`/code-repos/${repository.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save repository';
      setUiError(message);
      notifications.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <section
        style={{
          overflow: 'hidden',
          borderRadius: 32,
          padding: 24,
          color: '#f8fafc',
          background: 'linear-gradient(135deg, #082f49 0%, #1c1917 50%, #4a044e 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 24,
          }}
        >
          <div style={{ maxWidth: 720 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.28em',
                color: '#7dd3fc',
              }}
            >
              Code Repositories
            </p>
            <h1 className="of-heading-xl" style={{ marginTop: 12, color: '#f8fafc' }}>
              Object-backed repos, branches, commits, CI, and merge reviews
            </h1>
            <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6, color: 'rgba(248, 250, 252, 0.85)' }}>
              Operate the full repository lifecycle from one workspace: define repos, push commits, run search, open
              merge requests, and gate merges with branch protection + CI policy.
            </p>
          </div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <div style={{ borderRadius: 16, background: 'rgba(255,255,255,0.1)', padding: 12 }}>
              <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#7dd3fc' }}>
                Repos
              </p>
              <p style={{ marginTop: 6, fontSize: 22, fontWeight: 600 }}>{overview?.repository_count ?? 0}</p>
            </div>
            <div style={{ borderRadius: 16, background: 'rgba(255,255,255,0.1)', padding: 12 }}>
              <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#7dd3fc' }}>
                Open MRs
              </p>
              <p style={{ marginTop: 6, fontSize: 22, fontWeight: 600 }}>{overview?.open_merge_request_count ?? 0}</p>
            </div>
            <div style={{ borderRadius: 16, background: 'rgba(255,255,255,0.1)', padding: 12 }}>
              <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#7dd3fc' }}>
                Repos (private)
              </p>
              <p style={{ marginTop: 6, fontSize: 22, fontWeight: 600 }}>
                {overview?.private_repository_count ?? 0}
              </p>
            </div>
            <div style={{ borderRadius: 16, background: 'rgba(255,255,255,0.1)', padding: 12 }}>
              <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#7dd3fc' }}>
                Package mix
              </p>
              <p style={{ marginTop: 6, fontSize: 13, fontWeight: 600 }}>
                {overview?.package_kind_mix?.join(', ') || '—'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {uiError && (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {uiError}
        </div>
      )}

      {!loading && repositories.length === 0 && (
        <div className="of-panel-muted" style={{ padding: 24, borderRadius: 16, textAlign: 'center' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>No repositories yet</p>
          <p className="of-text-muted" style={{ marginTop: 6, fontSize: 13 }}>
            Use the form below to create your first repository. Selecting an existing repo will open it in the
            authoring IDE.
          </p>
        </div>
      )}

      <RepoExplorer
        overview={overview}
        repositories={repositories}
        selectedRepositoryId=""
        draft={draft}
        busy={loading || busy}
        onSelectRepository={(id) => {
          // Clicking any existing repo (in the dropdown or the card grid)
          // navigates straight into the IDE. The empty option ('Create a
          // new repository') only resets the draft.
          if (!id) {
            setDraft(emptyRepoDraft());
            return;
          }
          navigate(`/code-repos/${id}`);
        }}
        onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        onSave={() => void save()}
        onReset={() => setDraft(emptyRepoDraft())}
      />
    </section>
  );
}

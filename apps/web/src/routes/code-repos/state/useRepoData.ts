import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createBranch,
  createComment,
  createCommit,
  createMergeRequest,
  createRepository,
  createTag,
  deleteBranch,
  getDiff,
  getMergeRequest,
  listBranches,
  listCiRuns,
  listCommits,
  listFiles,
  listMergeRequests,
  listRepositories,
  listTags,
  mergeBranch,
  mergeMergeRequest,
  mutateFile,
  searchFiles,
  triggerCiRun,
  updateMergeRequest,
  updateRepository,
  type BranchDefinition,
  type CiRun,
  type CommitDefinition,
  type MergeRequestDefinition,
  type MergeRequestDetail as MergeRequestDetailModel,
  type MergeRequestStatus,
  type RepositoryDefinition,
  type RepositoryFile,
  type RepositoryFileAction,
  type RepositoryFileMutation,
  type RepositoryTagDefinition,
  type ReviewerState,
  type SearchResult,
} from '@/lib/api/code-repos';
import type { BranchDraft } from '@/lib/components/code-repo/BranchManager';
import type { CommitDraft } from '@/lib/components/code-repo/CommitHistory';
import type { CommentDraft } from '@/lib/components/code-repo/MergeRequestDetail';
import type { MergeRequestDraft } from '@/lib/components/code-repo/MergeRequestList';
import type { RepositoryDraft } from '@/lib/components/code-repo/RepoExplorer';
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

function emptyBranchDraft(defaultBranch = 'main'): BranchDraft {
  return { name: 'feature/new-package-flow', base_branch: defaultBranch, protected: false };
}

function emptyCommitDraft(defaultBranch = 'main'): CommitDraft {
  return {
    branch_name: defaultBranch,
    title: 'Refine package manifest defaults',
    description: 'Tightens metadata and manifest defaults ahead of publication.',
    author_name: '',
    sign_off: true,
  };
}

function emptyMergeRequestDraft(defaultBranch = 'main'): MergeRequestDraft {
  return {
    title: 'Publish package flow improvements',
    description: 'Promotes the feature branch after CI and inline review are green.',
    source_branch: 'feature/new-package-flow',
    target_branch: defaultBranch,
    author: 'Platform UI',
    labels_text: 'preview, package',
    reviewers_text: 'Elena, Marco',
    approvals_required: '2',
    changed_files: '5',
  };
}

function emptyCommentDraft(filePath = 'src/lib.rs'): CommentDraft {
  return {
    author: 'Reviewer Bot',
    body: 'Please split the publishing helper into a smaller function before merge.',
    file_path: filePath,
    line_number: '12',
    resolved: false,
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

function preferredCommitBranch(defaultBranch: string, branches: BranchDefinition[]) {
  return branches.find((branch) => !branch.protected)?.name ?? defaultBranch;
}

export function repoToDraft(repository: RepositoryDefinition): RepositoryDraft {
  return {
    id: repository.id,
    name: repository.name,
    slug: repository.slug,
    description: repository.description,
    owner: repository.owner,
    default_branch: repository.default_branch,
    visibility: repository.visibility,
    object_store_backend: repository.object_store_backend,
    package_kind: repository.package_kind,
    tags_text: repository.tags.join(', '),
    settings_text: JSON.stringify(repository.settings, null, 2),
  };
}

export interface UseRepoDataResult {
  repository: RepositoryDefinition | null;
  branches: BranchDefinition[];
  tags: RepositoryTagDefinition[];
  commits: CommitDefinition[];
  files: RepositoryFile[];
  ciRuns: CiRun[];
  mergeRequests: MergeRequestDefinition[];
  mergeRequestDetail: MergeRequestDetailModel | null;
  searchResults: SearchResult[];
  selectedMergeRequestId: string;
  selectedFilePath: string;
  searchQuery: string;
  diffBranch: string;
  diffPatch: string;
  loading: boolean;
  busy: boolean;
  uiError: string;
  branchOptions: string[];
  currentBranch: string;
  repositoryDraft: RepositoryDraft;
  branchDraft: BranchDraft;
  commitDraft: CommitDraft;
  mergeRequestDraft: MergeRequestDraft;
  commentDraft: CommentDraft;
  pendingFileChanges: RepositoryFileMutation[];
  mergeBlockers: string[];
  latestSourceCi: CiRun | null;
  targetBranchProtected: boolean;
  setRepositoryDraft: (patch: Partial<RepositoryDraft>) => void;
  setBranchDraft: (patch: Partial<BranchDraft>) => void;
  setCommitDraft: (patch: Partial<CommitDraft>) => void;
  setMergeRequestDraft: (patch: Partial<MergeRequestDraft>) => void;
  setCommentDraft: (patch: Partial<CommentDraft>) => void;
  setPendingFileChanges: (changes: RepositoryFileMutation[]) => void;
  setSearchQuery: (q: string) => void;
  selectFile: (path: string) => void;
  saveRepository: () => Promise<void>;
  createBranchAction: () => Promise<void>;
  switchBranchAction: (branchName: string) => Promise<void>;
  deleteBranchAction: (branchName: string) => Promise<void>;
  mergeBranchAction: (branchName: string, target: string) => Promise<void>;
  createTagAction: (name: string, target: string, message: string, protectedTag: boolean) => Promise<void>;
  refreshDiff: (branchName: string) => Promise<void>;
  createCommitAction: () => Promise<void>;
  saveFileAction: (file: RepositoryFile, content: string) => Promise<void>;
  fileTreeAction: (
    action: RepositoryFileAction,
    path: string,
    nextPath?: string,
    content?: string,
  ) => Promise<void>;
  triggerCiAction: () => Promise<void>;
  runSearchAction: () => Promise<void>;
  selectMergeRequest: (id: string) => Promise<void>;
  createMergeRequestAction: () => Promise<void>;
  changeMergeRequestStatus: (status: MergeRequestStatus) => Promise<void>;
  updateReviewerState: (reviewerName: string, approved: boolean, state: string) => Promise<void>;
  mergeSelectedMergeRequest: () => Promise<void>;
  createCommentAction: () => Promise<void>;
}

/**
 * Single source of truth for the Code Repositories IDE. Loads the repository
 * identified by `repositoryId` and exposes every piece of state and every
 * mutation handler used by the various tabs. The legacy CodeReposPage logic
 * lived inline; it has been moved here so the new shell can be a thin wrapper
 * around the hook and a tab router.
 */
export function useRepoData(
  repositoryId: string | null,
  initialRepository?: RepositoryDefinition | null,
): UseRepoDataResult {
  const [repository, setRepository] = useState<RepositoryDefinition | null>(initialRepository ?? null);
  const [branches, setBranches] = useState<BranchDefinition[]>([]);
  const [tags, setTags] = useState<RepositoryTagDefinition[]>([]);
  const [commits, setCommits] = useState<CommitDefinition[]>([]);
  const [files, setFiles] = useState<RepositoryFile[]>([]);
  const [ciRuns, setCiRuns] = useState<CiRun[]>([]);
  const [mergeRequests, setMergeRequests] = useState<MergeRequestDefinition[]>([]);
  const [mergeRequestDetail, setMergeRequestDetail] = useState<MergeRequestDetailModel | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedMergeRequestId, setSelectedMergeRequestId] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [searchQuery, setSearchQuery] = useState('widget');
  const [diffBranch, setDiffBranch] = useState('main');
  const [diffPatch, setDiffPatch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [uiError, setUiError] = useState('');

  const [repositoryDraft, setRepositoryDraftState] = useState<RepositoryDraft>(emptyRepoDraft);
  const [branchDraft, setBranchDraftState] = useState<BranchDraft>(emptyBranchDraft);
  const [commitDraft, setCommitDraftState] = useState<CommitDraft>(emptyCommitDraft);
  const [pendingFileChanges, setPendingFileChangesState] = useState<RepositoryFileMutation[]>([]);
  const [mergeRequestDraft, setMergeRequestDraftState] = useState<MergeRequestDraft>(emptyMergeRequestDraft);
  const [commentDraft, setCommentDraftState] = useState<CommentDraft>(() => emptyCommentDraft());

  const selectedMergeRequestIdRef = useRef('');
  useEffect(() => {
    selectedMergeRequestIdRef.current = selectedMergeRequestId;
  }, [selectedMergeRequestId]);

  const busy = loading || busyAction.length > 0;
  const branchOptions = useMemo(() => branches.map((branch) => branch.name), [branches]);
  const currentBranch = diffBranch || repository?.default_branch || 'main';

  const targetBranch = useCallback(
    (branchName: string) => branches.find((branch) => branch.name === branchName) ?? null,
    [branches],
  );

  const latestCiRunForBranch = useCallback(
    (branchName: string) => ciRuns.find((run) => run.branch_name === branchName) ?? null,
    [ciRuns],
  );

  const repositoryCiRequired = useCallback(
    (repo: RepositoryDefinition | null) => repo?.settings?.['ci_required'] !== false,
    [],
  );

  const mergeBlockers = useMemo(() => {
    const detail = mergeRequestDetail;
    if (!detail) return [];
    const blockers: string[] = [];
    const target = targetBranch(detail.merge_request.target_branch);
    const latestSourceCi = latestCiRunForBranch(detail.merge_request.source_branch);
    const requiredApprovals = detail.merge_request.approvals_required;
    if (target?.protected && detail.approval_count < requiredApprovals) {
      blockers.push(
        `Protected branch requires ${requiredApprovals} approval(s); only ${detail.approval_count} recorded.`,
      );
    }
    if (repositoryCiRequired(repository)) {
      if (!latestSourceCi) {
        blockers.push(`Branch ${detail.merge_request.source_branch} has no CI run on record.`);
      } else if (latestSourceCi.commit_sha !== targetBranch(detail.merge_request.source_branch)?.head_sha) {
        blockers.push(`Latest CI does not cover the current head of ${detail.merge_request.source_branch}.`);
      } else if (latestSourceCi.status !== 'passed') {
        blockers.push(`Latest CI on ${detail.merge_request.source_branch} is ${latestSourceCi.status}.`);
      }
    }
    if (detail.merge_request.status === 'closed') {
      blockers.push('Closed merge requests cannot be merged until reopened.');
    }
    if (detail.merge_request.status === 'merged') {
      blockers.push('This merge request is already merged.');
    }
    return blockers;
  }, [mergeRequestDetail, repository, repositoryCiRequired, targetBranch, latestCiRunForBranch]);

  const latestSourceCi = useMemo(
    () => (mergeRequestDetail ? latestCiRunForBranch(mergeRequestDetail.merge_request.source_branch) : null),
    [mergeRequestDetail, latestCiRunForBranch],
  );

  const targetBranchProtected = useMemo(() => {
    if (!mergeRequestDetail) return false;
    const target = targetBranch(mergeRequestDetail.merge_request.target_branch);
    if (target) return Boolean(target.protected);
    return mergeRequestDetail.merge_request.target_branch === repository?.default_branch;
  }, [mergeRequestDetail, targetBranch, repository]);

  const loadContext = useCallback(
    async (repo: RepositoryDefinition, preferredMergeRequestId?: string) => {
      setRepository(repo);
      setRepositoryDraftState(repoToDraft(repo));
      const defaultBranch = repo.default_branch ?? 'main';
      setBranchDraftState(emptyBranchDraft(defaultBranch));
      setMergeRequestDraftState(emptyMergeRequestDraft(defaultBranch));
      setDiffBranch(defaultBranch);

      const [
        branchesResponse,
        commitsResponse,
        filesResponse,
        ciRunsResponse,
        diffResponse,
        mergeRequestsResponse,
        tagsResponse,
      ] = await Promise.all([
        listBranches(repo.id),
        listCommits(repo.id),
        listFiles(repo.id),
        listCiRuns(repo.id),
        getDiff(repo.id, defaultBranch),
        listMergeRequests(repo.id),
        listTags(repo.id),
      ]);

      setBranches(branchesResponse.items);
      setCommits(commitsResponse.items);
      setFiles(filesResponse.items);
      setCiRuns(ciRunsResponse.items);
      setDiffPatch(diffResponse.patch);
      setMergeRequests(mergeRequestsResponse.items);
      setTags(tagsResponse.items);
      setCommitDraftState(emptyCommitDraft(preferredCommitBranch(defaultBranch, branchesResponse.items)));
      const initialFilePath = filesResponse.items[0]?.path ?? '';
      setSelectedFilePath(initialFilePath);
      setCommentDraftState(emptyCommentDraft(initialFilePath || 'src/lib.rs'));
      setSearchResults([]);

      const nextMergeRequestId =
        preferredMergeRequestId ?? selectedMergeRequestIdRef.current ?? mergeRequestsResponse.items[0]?.id ?? '';
      if (nextMergeRequestId) {
        try {
          const detail = await getMergeRequest(nextMergeRequestId);
          setSelectedMergeRequestId(nextMergeRequestId);
          setMergeRequestDetail(detail);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to load merge request';
          setUiError(message);
        }
      } else {
        setSelectedMergeRequestId('');
        setMergeRequestDetail(null);
      }
    },
    [],
  );

  // Initial fetch when the repositoryId changes.
  useEffect(() => {
    if (!repositoryId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setUiError('');
    void (async () => {
      try {
        const repo = initialRepository && initialRepository.id === repositoryId
          ? initialRepository
          : await api_get_repository(repositoryId);
        if (cancelled) return;
        await loadContext(repo);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Unable to load repository surfaces';
        setUiError(message);
        notifications.error(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositoryId]);

  const setRepositoryDraft = useCallback(
    (patch: Partial<RepositoryDraft>) => setRepositoryDraftState((current) => ({ ...current, ...patch })),
    [],
  );
  const setBranchDraft = useCallback(
    (patch: Partial<BranchDraft>) => setBranchDraftState((current) => ({ ...current, ...patch })),
    [],
  );
  const setCommitDraft = useCallback(
    (patch: Partial<CommitDraft>) => setCommitDraftState((current) => ({ ...current, ...patch })),
    [],
  );
  const setMergeRequestDraft = useCallback(
    (patch: Partial<MergeRequestDraft>) => setMergeRequestDraftState((current) => ({ ...current, ...patch })),
    [],
  );
  const setCommentDraft = useCallback(
    (patch: Partial<CommentDraft>) => setCommentDraftState((current) => ({ ...current, ...patch })),
    [],
  );
  const setPendingFileChanges = useCallback((changes: RepositoryFileMutation[]) => {
    setPendingFileChangesState(changes);
  }, []);

  const selectFile = useCallback((path: string) => {
    setSelectedFilePath(path);
    setCommentDraftState((current) => ({ ...current, file_path: path }));
  }, []);

  async function saveRepository() {
    setBusyAction('save-repository');
    setUiError('');
    try {
      const payload = {
        name: repositoryDraft.name,
        slug: repositoryDraft.slug,
        description: repositoryDraft.description,
        owner: repositoryDraft.owner,
        default_branch: repositoryDraft.default_branch,
        visibility: repositoryDraft.visibility,
        object_store_backend: repositoryDraft.object_store_backend,
        package_kind: repositoryDraft.package_kind,
        tags: parseCsv(repositoryDraft.tags_text),
        settings: parseJson<Record<string, unknown>>(repositoryDraft.settings_text),
      };
      const saved = repositoryDraft.id
        ? await updateRepository(repositoryDraft.id, payload)
        : await createRepository(payload);
      await loadContext(saved, selectedMergeRequestId || undefined);
      notifications.success(`${repositoryDraft.id ? 'Updated' : 'Created'} ${saved.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save repository';
      setUiError(message);
      notifications.error(message);
    } finally {
      setBusyAction('');
    }
  }

  async function createBranchAction() {
    if (!repository) return;
    setBusyAction('branch');
    try {
      await createBranch(repository.id, {
        name: branchDraft.name,
        base_branch: branchDraft.base_branch,
        protected: branchDraft.protected,
      });
      await loadContext(repository, selectedMergeRequestId || undefined);
      notifications.success(`Created branch ${branchDraft.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create branch';
      setUiError(message);
      notifications.error(message);
    } finally {
      setBusyAction('');
    }
  }

  async function switchBranchAction(branchName: string) {
    if (!repository) return;
    setCommitDraftState(emptyCommitDraft(branchName));
    setDiffBranch(branchName);
    const [filesResponse, diffResponse, commitsResponse] = await Promise.all([
      listFiles(repository.id, branchName),
      getDiff(repository.id, branchName),
      listCommits(repository.id, branchName),
    ]);
    setFiles(filesResponse.items);
    setCommits(commitsResponse.items);
    setDiffPatch(diffResponse.patch);
    setSelectedFilePath(filesResponse.items[0]?.path ?? '');
    notifications.success(`Switched to ${branchName}`);
  }

  async function deleteBranchAction(branchName: string) {
    if (!repository || !window.confirm(`Delete branch ${branchName}?`)) return;
    try {
      await deleteBranch(repository.id, branchName, { force: false });
      await loadContext(repository, selectedMergeRequestId || undefined);
      notifications.success(`Deleted branch ${branchName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete branch';
      setUiError(message);
      notifications.error(message);
    }
  }

  async function mergeBranchAction(branchName: string, target: string) {
    if (!repository) return;
    try {
      await mergeBranch(repository.id, branchName, { target_branch: target, author_name: 'Platform UI' });
      await loadContext(repository, selectedMergeRequestId || undefined);
      notifications.success(`Merged ${branchName} into ${target}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to merge branch';
      setUiError(message);
      notifications.error(message);
    }
  }

  async function createTagAction(name: string, target: string, message: string, protectedTag: boolean) {
    if (!repository) return;
    try {
      const tag = await createTag(repository.id, {
        name,
        target,
        message,
        protected: protectedTag,
        tagger_name: 'Platform UI',
      });
      setTags((current) => [tag, ...current.filter((entry) => entry.name !== tag.name)]);
      notifications.success(`Created tag ${name}`);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unable to create tag';
      setUiError(text);
      notifications.error(text);
    }
  }

  async function refreshDiff(branchName: string) {
    if (!repository) return;
    setBusyAction('diff');
    try {
      const response = await getDiff(repository.id, branchName);
      setDiffBranch(response.branch_name);
      setDiffPatch(response.patch);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to refresh diff';
      setUiError(message);
      notifications.error(message);
    } finally {
      setBusyAction('');
    }
  }

  async function createCommitAction() {
    if (!repository) return;
    setBusyAction('commit');
    try {
      if (pendingFileChanges.length === 0) {
        notifications.warning('Edit one or more files before creating an atomic commit');
        return;
      }
      await createCommit(repository.id, {
        branch_name: commitDraft.branch_name,
        title: commitDraft.title,
        description: commitDraft.description,
        sign_off: commitDraft.sign_off,
        author_name: commitDraft.author_name || undefined,
        files: pendingFileChanges.map((change) => ({ ...change, branch_name: commitDraft.branch_name })),
      });
      setPendingFileChangesState([]);
      await loadContext(repository, selectedMergeRequestId || undefined);
      notifications.success(`Created atomic commit ${commitDraft.title}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create commit';
      setUiError(message);
      notifications.error(message);
    } finally {
      setBusyAction('');
    }
  }

  async function saveFileAction(file: RepositoryFile, content: string) {
    if (!repository) return;
    setBusyAction('file-save');
    try {
      const response = await mutateFile(repository.id, {
        action: 'save',
        path: file.path,
        content,
        branch_name: file.branch_name || repository.default_branch || 'main',
        message: `Update ${file.path}`,
        author_name: undefined,
      });
      setFiles(response.items);
      notifications.success(`Saved ${file.path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save file';
      setUiError(message);
      notifications.error(message);
    } finally {
      setBusyAction('');
    }
  }

  async function fileTreeAction(
    action: RepositoryFileAction,
    path: string,
    nextPath?: string,
    content?: string,
  ) {
    if (!repository) return;
    setBusyAction(`file-${action}`);
    try {
      const response = await mutateFile(repository.id, {
        action,
        path,
        new_path: nextPath,
        content,
        branch_name: repository.default_branch || 'main',
        message: action === 'new' ? `Create ${nextPath ?? path}` : `${action} ${path}`,
        author_name: undefined,
      });
      setFiles(response.items);
      notifications.success(`${action} ${nextPath ?? path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Unable to ${action} file`;
      setUiError(message);
      notifications.error(message);
    } finally {
      setBusyAction('');
    }
  }

  async function triggerCiAction() {
    if (!repository) return;
    setBusyAction('ci');
    try {
      const run = await triggerCiRun(repository.id, { branch_name: commitDraft.branch_name });
      setCiRuns((current) => [run, ...current]);
      notifications.success(`Triggered ${run.pipeline_name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to trigger CI';
      setUiError(message);
      notifications.error(message);
    } finally {
      setBusyAction('');
    }
  }

  async function runSearchAction() {
    if (!repository) return;
    setBusyAction('search');
    try {
      const response = await searchFiles(repository.id, searchQuery);
      setSearchResults(response.results);
      notifications.success(`Found ${response.results.length} matches`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to search repository files';
      setUiError(message);
      notifications.error(message);
    } finally {
      setBusyAction('');
    }
  }

  async function selectMergeRequest(id: string) {
    setBusyAction('merge-request');
    try {
      setSelectedMergeRequestId(id);
      const detail = await getMergeRequest(id);
      setMergeRequestDetail(detail);
      setCommentDraftState((current) => ({
        ...current,
        file_path: detail.comments[0]?.file_path || selectedFilePath || 'src/lib.rs',
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load merge request';
      setUiError(message);
      notifications.error(message);
    } finally {
      setBusyAction('');
    }
  }

  async function createMergeRequestAction() {
    if (!repository) return;
    setBusyAction('create-mr');
    try {
      const reviewers: ReviewerState[] = parseCsv(mergeRequestDraft.reviewers_text).map((reviewer) => ({
        reviewer,
        approved: false,
        state: 'pending',
      }));
      const mr = await createMergeRequest({
        repository_id: repository.id,
        title: mergeRequestDraft.title,
        description: mergeRequestDraft.description,
        source_branch: mergeRequestDraft.source_branch,
        target_branch: mergeRequestDraft.target_branch,
        author: mergeRequestDraft.author,
        labels: parseCsv(mergeRequestDraft.labels_text),
        reviewers,
        approvals_required: Number(mergeRequestDraft.approvals_required),
        changed_files: Number(mergeRequestDraft.changed_files),
      });
      await loadContext(repository, mr.id);
      notifications.success(`Opened ${mr.title}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create merge request';
      setUiError(message);
      notifications.error(message);
    } finally {
      setBusyAction('');
    }
  }

  async function changeMergeRequestStatus(status: MergeRequestStatus) {
    if (!selectedMergeRequestId || !repository) return;
    setBusyAction('mr-status');
    try {
      await updateMergeRequest(selectedMergeRequestId, { status });
      await loadContext(repository, selectedMergeRequestId);
      notifications.success(`Marked merge request as ${status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update merge request';
      setUiError(message);
      notifications.error(message);
    } finally {
      setBusyAction('');
    }
  }

  async function updateReviewerState(reviewerName: string, approved: boolean, state: string) {
    if (!mergeRequestDetail || !repository) return;
    setBusyAction('mr-review');
    try {
      const reviewers = mergeRequestDetail.merge_request.reviewers.map((reviewer) =>
        reviewer.reviewer === reviewerName ? { ...reviewer, approved, state } : reviewer,
      );
      await updateMergeRequest(mergeRequestDetail.merge_request.id, { reviewers });
      await loadContext(repository, selectedMergeRequestId);
      notifications.success(`Updated review state for ${reviewerName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update reviewer state';
      setUiError(message);
      notifications.error(message);
    } finally {
      setBusyAction('');
    }
  }

  async function mergeSelectedMergeRequest() {
    if (!selectedMergeRequestId || !mergeRequestDetail || !repository) return;
    setBusyAction('merge-mr');
    try {
      const result = await mergeMergeRequest(selectedMergeRequestId, {
        merged_by: commentDraft.author || mergeRequestDetail.merge_request.author,
      });
      await loadContext(repository, selectedMergeRequestId);
      notifications.success(`Merged into ${result.target_branch} at ${result.merge_commit_sha.slice(0, 8)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to merge merge request';
      setUiError(message);
      notifications.error(message);
    } finally {
      setBusyAction('');
    }
  }

  async function createCommentAction() {
    if (!selectedMergeRequestId) return;
    setBusyAction('comment');
    try {
      await createComment(selectedMergeRequestId, {
        author: commentDraft.author,
        body: commentDraft.body,
        file_path: commentDraft.file_path,
        line_number: commentDraft.line_number ? Number(commentDraft.line_number) : undefined,
        resolved: commentDraft.resolved,
      });
      await selectMergeRequest(selectedMergeRequestId);
      notifications.success('Added review comment');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create review comment';
      setUiError(message);
      notifications.error(message);
    } finally {
      setBusyAction('');
    }
  }

  return {
    repository,
    branches,
    tags,
    commits,
    files,
    ciRuns,
    mergeRequests,
    mergeRequestDetail,
    searchResults,
    selectedMergeRequestId,
    selectedFilePath,
    searchQuery,
    diffBranch,
    diffPatch,
    loading,
    busy,
    uiError,
    branchOptions,
    currentBranch,
    repositoryDraft,
    branchDraft,
    commitDraft,
    mergeRequestDraft,
    commentDraft,
    pendingFileChanges,
    mergeBlockers,
    latestSourceCi,
    targetBranchProtected,
    setRepositoryDraft,
    setBranchDraft,
    setCommitDraft,
    setMergeRequestDraft,
    setCommentDraft,
    setPendingFileChanges,
    setSearchQuery,
    selectFile,
    saveRepository,
    createBranchAction,
    switchBranchAction,
    deleteBranchAction,
    mergeBranchAction,
    createTagAction,
    refreshDiff,
    createCommitAction,
    saveFileAction,
    fileTreeAction,
    triggerCiAction,
    runSearchAction,
    selectMergeRequest,
    createMergeRequestAction,
    changeMergeRequestStatus,
    updateReviewerState,
    mergeSelectedMergeRequest,
    createCommentAction,
  };
}

async function api_get_repository(id: string): Promise<RepositoryDefinition> {
  const response = await listRepositories();
  const match = response.items.find((repo) => repo.id === id);
  if (!match) throw new Error(`Repository ${id} not found`);
  return match;
}

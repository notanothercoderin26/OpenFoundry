import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import {
  bindProjectResource,
  createProject,
  createProjectBranch,
  createProjectMigration,
  createProjectProposal,
  deleteProjectMembership,
  getProjectWorkingState,
  listActionTypes,
  listFunctionPackages,
  listInterfaces,
  listLinkTypes,
  listObjectSets,
  listObjectTypes,
  listProjectBranches,
  listProjectMemberships,
  listProjectMigrations,
  listProjectProposals,
  listProjectResources,
  listProjects,
  listRules,
  listSharedPropertyTypes,
  replaceProjectWorkingState,
  unbindProjectResource,
  updateProjectBranch,
  updateProjectProposal,
  upsertProjectMembership,
  type ActionType,
  type FunctionPackage,
  type LinkType,
  type ObjectSetDefinition,
  type ObjectType,
  type OntologyBranch,
  type OntologyInterface,
  type OntologyProject,
  type OntologyProjectMembership,
  type OntologyProjectMigration,
  type OntologyProjectResourceBinding,
  type OntologyProjectRole,
  type OntologyProjectWorkingState,
  type OntologyProposal,
  type OntologyRule,
  type SharedPropertyType,
} from '@/lib/api/ontology';

type Tab = 'overview' | 'resources' | 'members' | 'branches' | 'proposals' | 'migrations' | 'changes';

type ResourceKind =
  | 'object_type'
  | 'link_type'
  | 'interface'
  | 'shared_property_type'
  | 'action_type'
  | 'function_package'
  | 'rule'
  | 'object_set';

interface ProjectContext {
  workingState: OntologyProjectWorkingState | null;
  memberships: OntologyProjectMembership[];
  resources: OntologyProjectResourceBinding[];
  branches: OntologyBranch[];
  proposals: OntologyProposal[];
  migrations: OntologyProjectMigration[];
}

interface ResourceOption {
  id: string;
  kind: ResourceKind;
  label: string;
  detail: string;
}

const EMPTY_CONTEXT: ProjectContext = {
  workingState: null,
  memberships: [],
  resources: [],
  branches: [],
  proposals: [],
  migrations: [],
};

const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  object_type: 'Object type',
  link_type: 'Link type',
  interface: 'Interface',
  shared_property_type: 'Shared property',
  action_type: 'Action type',
  function_package: 'Function',
  rule: 'Rule',
  object_set: 'Object set',
};

const ROLE_OPTIONS: OntologyProjectRole[] = ['viewer', 'editor', 'owner'];

const BRANCH_STATUSES: OntologyBranch['status'][] = ['main', 'draft', 'in_review', 'rebasing', 'merged', 'closed'];
const PROPOSAL_STATUSES: OntologyProposal['status'][] = ['draft', 'in_review', 'approved', 'merged', 'closed'];

function shortId(value: string | null | undefined) {
  return value ? value.slice(0, 8) : 'none';
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function projectName(project: OntologyProject | undefined) {
  if (!project) return 'Select an ontology';
  return project.display_name || project.slug || project.id;
}

function projectById(projects: OntologyProject[], id: string) {
  return projects.find((project) => project.id === id);
}

function statusClass(status: string) {
  if (['merged', 'approved', 'main'].includes(status)) return 'of-status-success';
  if (['in_review', 'rebasing', 'planned'].includes(status)) return 'of-status-warning';
  if (['closed', 'rejected'].includes(status)) return 'of-status-danger';
  return 'of-status-info';
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      className="of-panel-muted"
      style={{ padding: 18, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}
    >
      <p style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{title}</p>
      <p style={{ marginTop: 4 }}>{detail}</p>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="of-panel-muted" style={{ padding: 12, minWidth: 0 }}>
      <p className="of-eyebrow">{label}</p>
      <p style={{ marginTop: 6, color: 'var(--text-strong)', fontSize: 22, fontWeight: 650 }}>{value}</p>
      {detail && (
        <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
          {detail}
        </p>
      )}
    </div>
  );
}

function ResourceLabel({ binding, resources }: { binding: OntologyProjectResourceBinding; resources: ResourceOption[] }) {
  const option = resources.find((resource) => resource.kind === binding.resource_kind && resource.id === binding.resource_id);
  return (
    <div>
      <p style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{option?.label ?? shortId(binding.resource_id)}</p>
      <p className="of-text-muted" style={{ marginTop: 2, fontSize: 12 }}>
        {option?.detail ?? binding.resource_id}
      </p>
    </div>
  );
}

export function OntologiesPage() {
  const [projects, setProjects] = useState<OntologyProject[]>([]);
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [linkTypes, setLinkTypes] = useState<LinkType[]>([]);
  const [interfaces, setInterfaces] = useState<OntologyInterface[]>([]);
  const [actions, setActions] = useState<ActionType[]>([]);
  const [sharedProperties, setSharedProperties] = useState<SharedPropertyType[]>([]);
  const [objectSets, setObjectSets] = useState<ObjectSetDefinition[]>([]);
  const [functions, setFunctions] = useState<FunctionPackage[]>([]);
  const [rules, setRules] = useState<OntologyRule[]>([]);

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [context, setContext] = useState<ProjectContext>(EMPTY_CONTEXT);
  const [tab, setTab] = useState<Tab>('overview');

  const [projectSearch, setProjectSearch] = useState('');
  const [newProjectSlug, setNewProjectSlug] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectWorkspace, setNewProjectWorkspace] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');

  const [resourceKind, setResourceKind] = useState<ResourceKind>('object_type');
  const [resourceId, setResourceId] = useState('');

  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState<OntologyProjectRole>('viewer');

  const [branchName, setBranchName] = useState('feature/new-branch');
  const [branchDescription, setBranchDescription] = useState('');
  const [branchIndexing, setBranchIndexing] = useState(false);

  const [proposalTitle, setProposalTitle] = useState('Review pending changes');
  const [proposalDescription, setProposalDescription] = useState('');
  const [proposalBranchId, setProposalBranchId] = useState('');

  const [migrationTarget, setMigrationTarget] = useState('');
  const [migrationNote, setMigrationNote] = useState('Cross-project migration');
  const [includeCurrentResources, setIncludeCurrentResources] = useState(true);

  const [catalogLoading, setCatalogLoading] = useState(true);
  const [contextLoading, setContextLoading] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId],
  );

  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) =>
      [project.display_name, project.slug, project.description, project.workspace_slug ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [projects, projectSearch]);

  const resourceOptions = useMemo<ResourceOption[]>(() => {
    const toOption = (kind: ResourceKind, item: { id: string; name: string; display_name?: string; description?: string }) => ({
      id: item.id,
      kind,
      label: item.display_name || item.name,
      detail: item.description || item.name || item.id,
    });
    return [
      ...objectTypes.map((item) => toOption('object_type', item)),
      ...linkTypes.map((item) => toOption('link_type', item)),
      ...interfaces.map((item) => toOption('interface', item)),
      ...sharedProperties.map((item) => toOption('shared_property_type', item)),
      ...actions.map((item) => toOption('action_type', item)),
      ...functions.map((item) => toOption('function_package', item)),
      ...rules.map((item) => toOption('rule', item)),
      ...objectSets.map((item) => toOption('object_set', item)),
    ];
  }, [actions, functions, interfaces, linkTypes, objectSets, objectTypes, rules, sharedProperties]);

  const selectedKindOptions = useMemo(
    () => resourceOptions.filter((option) => option.kind === resourceKind),
    [resourceKind, resourceOptions],
  );

  const workingChanges = context.workingState?.changes ?? [];
  const activeBranches = context.branches.filter((branch) => !['merged', 'closed'].includes(branch.status));
  const openProposals = context.proposals.filter((proposal) => !['merged', 'closed'].includes(proposal.status));

  async function loadCatalog(nextSelectedId = selectedProjectId) {
    setCatalogLoading(true);
    setError('');
    try {
      const [pRes, otRes, ltRes, ifRes, atRes, sptRes, osRes, fnRes, ruleRes] = await Promise.all([
        listProjects({ per_page: 100 }),
        listObjectTypes({ per_page: 200 }),
        listLinkTypes({ per_page: 200 }).catch(() => ({ data: [], total: 0 })),
        listInterfaces({ per_page: 200 }).catch(() => ({ data: [], total: 0, page: 1, per_page: 200 })),
        listActionTypes({ per_page: 200 }).catch(() => ({ data: [], total: 0, page: 1, per_page: 200 })),
        listSharedPropertyTypes({ per_page: 200 }).catch(() => ({ data: [], total: 0, page: 1, per_page: 200 })),
        listObjectSets().catch(() => ({ data: [] })),
        listFunctionPackages({ per_page: 200 }).catch(() => ({ data: [], total: 0, page: 1, per_page: 200 })),
        listRules({ per_page: 200 }).catch(() => ({ data: [], total: 0, page: 1, per_page: 200 })),
      ]);
      setProjects(pRes.data);
      setObjectTypes(otRes.data);
      setLinkTypes(ltRes.data);
      setInterfaces(ifRes.data);
      setActions(atRes.data);
      setSharedProperties(sptRes.data);
      setObjectSets(osRes.data);
      setFunctions(fnRes.data);
      setRules(ruleRes.data);

      if (nextSelectedId && pRes.data.some((project) => project.id === nextSelectedId)) {
        setSelectedProjectId(nextSelectedId);
      } else {
        setSelectedProjectId(pRes.data[0]?.id ?? '');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load ontology registry');
    } finally {
      setCatalogLoading(false);
    }
  }

  async function loadProjectContext(projectId: string) {
    if (!projectId) {
      setContext(EMPTY_CONTEXT);
      setProposalBranchId('');
      return;
    }
    setContextLoading(true);
    setContext(EMPTY_CONTEXT);
    setError('');
    try {
      const [ws, memberships, resources, branches, proposals, migrations] = await Promise.all([
        getProjectWorkingState(projectId).catch(() => null),
        listProjectMemberships(projectId).catch(() => []),
        listProjectResources(projectId).catch(() => []),
        listProjectBranches(projectId).catch(() => []),
        listProjectProposals(projectId).catch(() => []),
        listProjectMigrations(projectId).catch(() => []),
      ]);
      setContext({ workingState: ws, memberships, resources, branches, proposals, migrations });
      setProposalBranchId((current) => (current && branches.some((branch) => branch.id === current) ? current : branches[0]?.id ?? ''));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load ontology project context');
    } finally {
      setContextLoading(false);
    }
  }

  useEffect(() => {
    void loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadProjectContext(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    setResourceId(selectedKindOptions[0]?.id ?? '');
  }, [selectedKindOptions]);

  function startAction(name: string) {
    setBusyAction(name);
    setError('');
    setSuccess('');
  }

  function finishAction(message: string) {
    setSuccess(message);
    setBusyAction('');
  }

  function failAction(cause: unknown, fallback: string) {
    setError(cause instanceof Error ? cause.message : fallback);
    setBusyAction('');
  }

  async function submitCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slug = normalizeSlug(newProjectSlug || newProjectName);
    if (!slug) {
      setError('Project slug is required');
      return;
    }
    startAction('create-project');
    try {
      const project = await createProject({
        slug,
        display_name: newProjectName.trim() || slug,
        description: newProjectDescription.trim() || undefined,
        workspace_slug: normalizeSlug(newProjectWorkspace) || undefined,
      });
      setNewProjectSlug('');
      setNewProjectName('');
      setNewProjectWorkspace('');
      setNewProjectDescription('');
      await loadCatalog(project.id);
      finishAction('Ontology project created');
    } catch (cause) {
      failAction(cause, 'Failed to create ontology project');
    }
  }

  async function submitBindResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId || !resourceId) return;
    startAction('bind-resource');
    try {
      await bindProjectResource(selectedProjectId, { resource_kind: resourceKind, resource_id: resourceId });
      await loadProjectContext(selectedProjectId);
      finishAction('Resource bound to ontology project');
    } catch (cause) {
      failAction(cause, 'Failed to bind resource');
    }
  }

  async function removeResource(binding: OntologyProjectResourceBinding) {
    if (!selectedProjectId) return;
    startAction(`unbind-${binding.resource_kind}-${binding.resource_id}`);
    try {
      await unbindProjectResource(selectedProjectId, binding.resource_kind, binding.resource_id);
      await loadProjectContext(selectedProjectId);
      finishAction('Resource binding removed');
    } catch (cause) {
      failAction(cause, 'Failed to remove resource binding');
    }
  }

  async function submitMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId || !memberUserId.trim()) return;
    startAction('member');
    try {
      await upsertProjectMembership(selectedProjectId, { user_id: memberUserId.trim(), role: memberRole });
      setMemberUserId('');
      await loadProjectContext(selectedProjectId);
      finishAction('Membership saved');
    } catch (cause) {
      failAction(cause, 'Failed to save membership');
    }
  }

  async function removeMember(userId: string) {
    if (!selectedProjectId) return;
    startAction(`member-${userId}`);
    try {
      await deleteProjectMembership(selectedProjectId, userId);
      await loadProjectContext(selectedProjectId);
      finishAction('Membership removed');
    } catch (cause) {
      failAction(cause, 'Failed to remove membership');
    }
  }

  async function submitCreateBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId || !branchName.trim()) return;
    startAction('branch');
    try {
      await createProjectBranch(selectedProjectId, {
        name: branchName.trim(),
        description: branchDescription.trim() || undefined,
        changes: workingChanges,
        enable_indexing: branchIndexing,
      });
      setBranchName('feature/new-branch');
      setBranchDescription('');
      setBranchIndexing(false);
      await loadProjectContext(selectedProjectId);
      finishAction('Branch created from working state');
    } catch (cause) {
      failAction(cause, 'Failed to create branch');
    }
  }

  async function setBranchStatus(branchId: string, status: OntologyBranch['status']) {
    if (!selectedProjectId) return;
    startAction(`branch-${branchId}-${status}`);
    try {
      await updateProjectBranch(selectedProjectId, branchId, { status });
      await loadProjectContext(selectedProjectId);
      finishAction('Branch status updated');
    } catch (cause) {
      failAction(cause, 'Failed to update branch');
    }
  }

  async function submitCreateProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId || !proposalBranchId || !proposalTitle.trim()) return;
    startAction('proposal');
    try {
      await createProjectProposal(selectedProjectId, {
        branch_id: proposalBranchId,
        title: proposalTitle.trim(),
        description: proposalDescription.trim() || undefined,
        tasks: [],
      });
      setProposalTitle('Review pending changes');
      setProposalDescription('');
      await loadProjectContext(selectedProjectId);
      finishAction('Proposal opened for review');
    } catch (cause) {
      failAction(cause, 'Failed to create proposal');
    }
  }

  async function setProposalStatus(proposalId: string, status: OntologyProposal['status']) {
    if (!selectedProjectId) return;
    startAction(`proposal-${proposalId}-${status}`);
    try {
      await updateProjectProposal(selectedProjectId, proposalId, { status });
      await loadProjectContext(selectedProjectId);
      finishAction('Proposal status updated');
    } catch (cause) {
      failAction(cause, 'Failed to update proposal');
    }
  }

  async function submitCreateMigration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId || !migrationTarget || migrationTarget === selectedProjectId) return;
    startAction('migration');
    try {
      await createProjectMigration(selectedProjectId, {
        source_project_id: selectedProjectId,
        target_project_id: migrationTarget,
        resources: includeCurrentResources
          ? context.resources.map((resource) => ({
              resource_kind: resource.resource_kind,
              resource_id: resource.resource_id,
            }))
          : [],
        note: migrationNote.trim() || undefined,
      });
      setMigrationNote('Cross-project migration');
      await loadProjectContext(selectedProjectId);
      finishAction('Migration submitted');
    } catch (cause) {
      failAction(cause, 'Failed to submit migration');
    }
  }

  async function clearWorkingState() {
    if (!selectedProjectId) return;
    startAction('clear-working-state');
    try {
      await replaceProjectWorkingState(selectedProjectId, []);
      await loadProjectContext(selectedProjectId);
      finishAction('Working state cleared');
    } catch (cause) {
      failAction(cause, 'Failed to clear working state');
    }
  }

  return (
    <section className="of-page" style={{ display: 'grid', gap: 12, padding: 16 }}>
      <header className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p className="of-eyebrow">ONT-009</p>
            <h1 className="of-heading-xl" style={{ marginTop: 4 }}>
              Ontologies Registry
            </h1>
            <p className="of-text-muted" style={{ marginTop: 4, maxWidth: 760 }}>
              Project-scoped ontology spaces for branches, proposals, migrations, memberships, and resource bindings.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to="/ontology-design" className="of-button">
              Design
            </Link>
            <Link to="/ontology-manager" className="of-button">
              Manager
            </Link>
            <button type="button" onClick={() => void loadCatalog()} disabled={catalogLoading} className="of-button">
              Refresh
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
          <Metric label="Projects" value={projects.length} detail={`${context.memberships.length} selected members`} />
          <Metric label="Resource types" value={resourceOptions.length} detail={`${context.resources.length} selected bindings`} />
          <Metric label="Branches" value={context.branches.length} detail={`${activeBranches.length} active`} />
          <Metric label="Proposals" value={context.proposals.length} detail={`${openProposals.length} open`} />
          <Metric label="Migrations" value={context.migrations.length} detail={`${workingChanges.length} staged changes`} />
        </div>
      </header>

      {error && (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      )}
      {success && (
        <div className="of-status-success" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {success}
        </div>
      )}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
          gap: 12,
          alignItems: 'start',
        }}
      >
        <aside style={{ display: 'grid', gap: 12 }}>
          <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 10 }}>
            <div>
              <p className="of-eyebrow">Ontology projects</p>
              <input
                value={projectSearch}
                onChange={(event) => setProjectSearch(event.target.value)}
                placeholder="Search projects"
                className="of-input"
                style={{ marginTop: 8 }}
              />
            </div>
            <div style={{ display: 'grid', gap: 6, maxHeight: 360, overflow: 'auto' }}>
              {catalogLoading && <p className="of-text-muted">Loading projects...</p>}
              {!catalogLoading && filteredProjects.length === 0 && (
                <EmptyState title="No ontology projects" detail="Create one below to start grouping ontology resources." />
              )}
              {filteredProjects.map((project) => {
                const selected = project.id === selectedProjectId;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => setSelectedProjectId(project.id)}
                    className={selected ? 'of-button of-button--primary' : 'of-button'}
                    style={{
                      justifyContent: 'flex-start',
                      minHeight: 52,
                      padding: 10,
                      textAlign: 'left',
                      whiteSpace: 'normal',
                    }}
                  >
                    <span style={{ display: 'grid', gap: 2 }}>
                      <span>{project.display_name || project.slug}</span>
                      <span style={{ fontSize: 11, fontWeight: 500, opacity: selected ? 0.86 : 0.72 }}>
                        {project.slug}
                        {project.workspace_slug ? ` / ${project.workspace_slug}` : ''}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <form onSubmit={submitCreateProject} className="of-panel" style={{ padding: 12, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">Create ontology project</p>
            <input
              value={newProjectName}
              onChange={(event) => {
                setNewProjectName(event.target.value);
                if (!newProjectSlug) setNewProjectSlug(normalizeSlug(event.target.value));
              }}
              placeholder="Display name"
              className="of-input"
            />
            <input
              value={newProjectSlug}
              onChange={(event) => setNewProjectSlug(normalizeSlug(event.target.value))}
              placeholder="slug"
              className="of-input"
            />
            <input
              value={newProjectWorkspace}
              onChange={(event) => setNewProjectWorkspace(normalizeSlug(event.target.value))}
              placeholder="workspace slug"
              className="of-input"
            />
            <textarea
              value={newProjectDescription}
              onChange={(event) => setNewProjectDescription(event.target.value)}
              placeholder="Description"
              className="of-textarea"
              style={{ minHeight: 72 }}
            />
            <button type="submit" disabled={busyAction === 'create-project'} className="of-button of-button--primary">
              Create project
            </button>
          </form>
        </aside>

        <main style={{ display: 'grid', gap: 12, minWidth: 0 }}>
          <section className="of-panel" style={{ padding: 14, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <p className="of-eyebrow">Selected ontology</p>
                <h2 className="of-heading-lg" style={{ marginTop: 4 }}>
                  {projectName(selectedProject)}
                </h2>
                {selectedProject && (
                  <p className="of-text-muted" style={{ marginTop: 4 }}>
                    {selectedProject.slug} / owner {shortId(selectedProject.owner_id)} / updated {formatDate(selectedProject.updated_at)}
                  </p>
                )}
              </div>
              {contextLoading && <span className="of-chip">Loading context</span>}
            </div>
            {selectedProject?.description && <p className="of-text-muted">{selectedProject.description}</p>}
            <div className="of-tabbar" style={{ overflowX: 'auto' }}>
              {(['overview', 'resources', 'members', 'branches', 'proposals', 'migrations', 'changes'] as Tab[]).map((nextTab) => (
                <button
                  key={nextTab}
                  type="button"
                  onClick={() => setTab(nextTab)}
                  className={tab === nextTab ? 'of-tab of-tab-active' : 'of-tab'}
                >
                  {nextTab}
                </button>
              ))}
            </div>
          </section>

          {!selectedProjectId && !catalogLoading && (
            <EmptyState title="Select or create an ontology project" detail="The registry opens project context once a project is selected." />
          )}

          {selectedProjectId && tab === 'overview' && (
            <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                <Metric label="Resources" value={context.resources.length} />
                <Metric label="Members" value={context.memberships.length} />
                <Metric label="Branches" value={context.branches.length} />
                <Metric label="Open proposals" value={openProposals.length} />
                <Metric label="Staged changes" value={workingChanges.length} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                <section>
                  <p className="of-eyebrow">Recent resources</p>
                  <div style={{ marginTop: 8, overflow: 'auto' }}>
                    {context.resources.length === 0 ? (
                      <EmptyState title="No resources bound" detail="Bind object types, actions, interfaces, or rules from the Resources tab." />
                    ) : (
                      <table className="of-table">
                        <tbody>
                          {context.resources.slice(0, 5).map((binding) => (
                            <tr key={`${binding.resource_kind}-${binding.resource_id}`}>
                              <td>{RESOURCE_KIND_LABELS[binding.resource_kind as ResourceKind] ?? binding.resource_kind}</td>
                              <td>
                                <ResourceLabel binding={binding} resources={resourceOptions} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </section>
                <section>
                  <p className="of-eyebrow">Members</p>
                  <div style={{ marginTop: 8, overflow: 'auto' }}>
                    {context.memberships.length === 0 ? (
                      <EmptyState title="No members listed" detail="Owners can add project members from the Members tab." />
                    ) : (
                      <table className="of-table">
                        <tbody>
                          {context.memberships.slice(0, 5).map((membership) => (
                            <tr key={membership.user_id}>
                              <td>{shortId(membership.user_id)}</td>
                              <td>
                                <span className="of-chip">{membership.role}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </section>
              </div>
            </section>
          )}

          {selectedProjectId && tab === 'resources' && (
            <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
              <form onSubmit={submitBindResource} className="of-toolbar" style={{ flexWrap: 'wrap' }}>
                <select
                  value={resourceKind}
                  onChange={(event) => setResourceKind(event.target.value as ResourceKind)}
                  className="of-select"
                  style={{ width: 200 }}
                >
                  {(Object.keys(RESOURCE_KIND_LABELS) as ResourceKind[]).map((kind) => (
                    <option key={kind} value={kind}>
                      {RESOURCE_KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
                <select
                  value={resourceId}
                  onChange={(event) => setResourceId(event.target.value)}
                  className="of-select"
                  style={{ minWidth: 280, flex: '1 1 280px' }}
                >
                  {selectedKindOptions.length === 0 && <option value="">No resources available</option>}
                  {selectedKindOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={!resourceId || busyAction === 'bind-resource'}
                  className="of-button of-button--primary"
                >
                  Bind resource
                </button>
              </form>
              {context.resources.length === 0 ? (
                <EmptyState title="No resources bound" detail="Resource bindings make an ontology project the owner context for shared definitions." />
              ) : (
                <div style={{ overflow: 'auto' }}>
                  <table className="of-table" style={{ minWidth: 720 }}>
                    <thead>
                      <tr>
                        <th>Kind</th>
                        <th>Resource</th>
                        <th>Bound by</th>
                        <th>Bound at</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {context.resources.map((binding) => (
                        <tr key={`${binding.resource_kind}-${binding.resource_id}`}>
                          <td>{RESOURCE_KIND_LABELS[binding.resource_kind as ResourceKind] ?? binding.resource_kind}</td>
                          <td>
                            <ResourceLabel binding={binding} resources={resourceOptions} />
                          </td>
                          <td>{shortId(binding.bound_by)}</td>
                          <td>{formatDate(binding.created_at)}</td>
                          <td>
                            <button
                              type="button"
                              onClick={() => void removeResource(binding)}
                              disabled={busyAction === `unbind-${binding.resource_kind}-${binding.resource_id}`}
                              className="of-button"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {selectedProjectId && tab === 'members' && (
            <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
              <form onSubmit={submitMember} className="of-toolbar" style={{ flexWrap: 'wrap' }}>
                <input
                  value={memberUserId}
                  onChange={(event) => setMemberUserId(event.target.value)}
                  placeholder="User UUID"
                  className="of-input"
                  style={{ minWidth: 280, flex: '1 1 280px' }}
                />
                <select
                  value={memberRole}
                  onChange={(event) => setMemberRole(event.target.value as OntologyProjectRole)}
                  className="of-select"
                  style={{ width: 140 }}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={!memberUserId.trim() || busyAction === 'member'} className="of-button of-button--primary">
                  Save member
                </button>
              </form>
              {context.memberships.length === 0 ? (
                <EmptyState title="No members" detail="Project owners can add viewers, editors, and owners." />
              ) : (
                <div style={{ overflow: 'auto' }}>
                  <table className="of-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Added</th>
                        <th>Updated</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {context.memberships.map((membership) => (
                        <tr key={membership.user_id}>
                          <td>{membership.user_id}</td>
                          <td>
                            <span className="of-chip">{membership.role}</span>
                          </td>
                          <td>{formatDate(membership.created_at)}</td>
                          <td>{formatDate(membership.updated_at)}</td>
                          <td>
                            <button
                              type="button"
                              onClick={() => void removeMember(membership.user_id)}
                              disabled={busyAction === `member-${membership.user_id}`}
                              className="of-button"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {selectedProjectId && tab === 'branches' && (
            <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
              <form onSubmit={submitCreateBranch} className="of-toolbar" style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
                <input
                  value={branchName}
                  onChange={(event) => setBranchName(event.target.value)}
                  placeholder="feature/new-branch"
                  className="of-input"
                  style={{ minWidth: 220, flex: '1 1 220px' }}
                />
                <input
                  value={branchDescription}
                  onChange={(event) => setBranchDescription(event.target.value)}
                  placeholder="Description"
                  className="of-input"
                  style={{ minWidth: 260, flex: '1 1 260px' }}
                />
                <label className="of-chip" style={{ background: 'var(--bg-panel)' }}>
                  <input
                    type="checkbox"
                    checked={branchIndexing}
                    onChange={(event) => setBranchIndexing(event.target.checked)}
                  />
                  Enable indexing
                </label>
                <button type="submit" disabled={!branchName.trim() || busyAction === 'branch'} className="of-button of-button--primary">
                  Create branch
                </button>
              </form>
              {context.branches.length === 0 ? (
                <EmptyState title="No branches" detail="Create a branch from the current working state before opening a proposal." />
              ) : (
                <div style={{ overflow: 'auto' }}>
                  <table className="of-table" style={{ minWidth: 840 }}>
                    <thead>
                      <tr>
                        <th>Branch</th>
                        <th>Status</th>
                        <th>Changes</th>
                        <th>Indexing</th>
                        <th>Updated</th>
                        <th>Status action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {context.branches.map((branch) => (
                        <tr key={branch.id}>
                          <td>
                            <p style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{branch.name}</p>
                            <p className="of-text-muted" style={{ marginTop: 2, fontSize: 12 }}>
                              {branch.description || branch.id}
                            </p>
                          </td>
                          <td>
                            <span className={`of-chip ${statusClass(branch.status)}`}>{branch.status}</span>
                          </td>
                          <td>{branch.changes.length}</td>
                          <td>{branch.enable_indexing ? 'Enabled' : 'Off'}</td>
                          <td>{formatDate(branch.updated_at)}</td>
                          <td>
                            <select
                              value={branch.status}
                              onChange={(event) => void setBranchStatus(branch.id, event.target.value as OntologyBranch['status'])}
                              disabled={busyAction.startsWith(`branch-${branch.id}-`)}
                              className="of-select"
                              style={{ width: 140 }}
                            >
                              {BRANCH_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {selectedProjectId && tab === 'proposals' && (
            <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
              <form onSubmit={submitCreateProposal} className="of-toolbar" style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
                <select
                  value={proposalBranchId}
                  onChange={(event) => setProposalBranchId(event.target.value)}
                  className="of-select"
                  style={{ minWidth: 220, flex: '1 1 220px' }}
                >
                  <option value="">Select branch</option>
                  {context.branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
                <input
                  value={proposalTitle}
                  onChange={(event) => setProposalTitle(event.target.value)}
                  placeholder="Proposal title"
                  className="of-input"
                  style={{ minWidth: 240, flex: '1 1 240px' }}
                />
                <input
                  value={proposalDescription}
                  onChange={(event) => setProposalDescription(event.target.value)}
                  placeholder="Description"
                  className="of-input"
                  style={{ minWidth: 260, flex: '1 1 260px' }}
                />
                <button
                  type="submit"
                  disabled={!proposalBranchId || !proposalTitle.trim() || busyAction === 'proposal'}
                  className="of-button of-button--primary"
                >
                  Open proposal
                </button>
              </form>
              {context.proposals.length === 0 ? (
                <EmptyState title="No proposals" detail="Open a proposal from a branch to route ontology changes through review." />
              ) : (
                <div style={{ overflow: 'auto' }}>
                  <table className="of-table" style={{ minWidth: 860 }}>
                    <thead>
                      <tr>
                        <th>Proposal</th>
                        <th>Status</th>
                        <th>Branch</th>
                        <th>Tasks</th>
                        <th>Reviewers</th>
                        <th>Updated</th>
                        <th>Status action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {context.proposals.map((proposal) => (
                        <tr key={proposal.id}>
                          <td>
                            <p style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{proposal.title}</p>
                            <p className="of-text-muted" style={{ marginTop: 2, fontSize: 12 }}>
                              {proposal.description || proposal.id}
                            </p>
                          </td>
                          <td>
                            <span className={`of-chip ${statusClass(proposal.status)}`}>{proposal.status}</span>
                          </td>
                          <td>{context.branches.find((branch) => branch.id === proposal.branch_id)?.name ?? shortId(proposal.branch_id)}</td>
                          <td>{proposal.tasks.length}</td>
                          <td>{proposal.reviewer_ids.length}</td>
                          <td>{formatDate(proposal.updated_at)}</td>
                          <td>
                            <select
                              value={proposal.status}
                              onChange={(event) => void setProposalStatus(proposal.id, event.target.value as OntologyProposal['status'])}
                              disabled={busyAction.startsWith(`proposal-${proposal.id}-`)}
                              className="of-select"
                              style={{ width: 140 }}
                            >
                              {PROPOSAL_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {selectedProjectId && tab === 'migrations' && (
            <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
              <form onSubmit={submitCreateMigration} className="of-toolbar" style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
                <select
                  value={migrationTarget}
                  onChange={(event) => setMigrationTarget(event.target.value)}
                  className="of-select"
                  style={{ minWidth: 240, flex: '1 1 240px' }}
                >
                  <option value="">Target ontology project</option>
                  {projects
                    .filter((project) => project.id !== selectedProjectId)
                    .map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.display_name || project.slug}
                      </option>
                    ))}
                </select>
                <input
                  value={migrationNote}
                  onChange={(event) => setMigrationNote(event.target.value)}
                  placeholder="Migration note"
                  className="of-input"
                  style={{ minWidth: 260, flex: '1 1 260px' }}
                />
                <label className="of-chip" style={{ background: 'var(--bg-panel)' }}>
                  <input
                    type="checkbox"
                    checked={includeCurrentResources}
                    onChange={(event) => setIncludeCurrentResources(event.target.checked)}
                  />
                  Include resources
                </label>
                <button
                  type="submit"
                  disabled={!migrationTarget || migrationTarget === selectedProjectId || busyAction === 'migration'}
                  className="of-button of-button--primary"
                >
                  Submit migration
                </button>
              </form>
              {context.migrations.length === 0 ? (
                <EmptyState title="No migrations" detail="Submit a migration when definitions need to move between ontology projects." />
              ) : (
                <div style={{ overflow: 'auto' }}>
                  <table className="of-table" style={{ minWidth: 780 }}>
                    <thead>
                      <tr>
                        <th>Route</th>
                        <th>Status</th>
                        <th>Resources</th>
                        <th>Note</th>
                        <th>Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {context.migrations.map((migration) => {
                        const source = projectById(projects, migration.source_project_id);
                        const target = projectById(projects, migration.target_project_id);
                        return (
                          <tr key={migration.id}>
                            <td>
                              {(source?.display_name || source?.slug || shortId(migration.source_project_id)) +
                                ' -> ' +
                                (target?.display_name || target?.slug || shortId(migration.target_project_id))}
                            </td>
                            <td>
                              <span className={`of-chip ${statusClass(migration.status)}`}>{migration.status}</span>
                            </td>
                            <td>{migration.resources.length}</td>
                            <td>{migration.note || 'No note'}</td>
                            <td>{formatDate(migration.submitted_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {selectedProjectId && tab === 'changes' && (
            <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <p className="of-eyebrow">Working state</p>
                  <p className="of-text-muted" style={{ marginTop: 4 }}>
                    Updated by {shortId(context.workingState?.updated_by)} at {formatDate(context.workingState?.updated_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void clearWorkingState()}
                  disabled={workingChanges.length === 0 || busyAction === 'clear-working-state'}
                  className="of-button"
                >
                  Clear changes
                </button>
              </div>
              {workingChanges.length === 0 ? (
                <EmptyState title="No staged changes" detail="Working-state changes created by ontology design flows will appear here." />
              ) : (
                <div style={{ overflow: 'auto' }}>
                  <table className="of-table" style={{ minWidth: 760 }}>
                    <thead>
                      <tr>
                        <th>Change</th>
                        <th>Kind</th>
                        <th>Action</th>
                        <th>Warnings</th>
                        <th>Errors</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workingChanges.map((change) => (
                        <tr key={change.id}>
                          <td>
                            <p style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{change.label}</p>
                            <p className="of-text-muted" style={{ marginTop: 2, fontSize: 12 }}>
                              {change.description || change.id}
                            </p>
                          </td>
                          <td>{change.kind}</td>
                          <td>{change.action}</td>
                          <td>{change.warnings.length}</td>
                          <td>{change.errors.length}</td>
                          <td>{formatDate(change.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </main>
      </section>
    </section>
  );
}

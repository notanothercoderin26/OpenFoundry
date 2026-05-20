import { useEffect, useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import {
  createPipelineComment,
  deletePipelineComment,
  deletePipelineGrant,
  followPipeline,
  getPipelineFollowerSummary,
  getPipelineLinkShare,
  getPipelineViewSummary,
  listPipelineComments,
  listPipelineGrants,
  putPipelineGrant,
  putPipelineLinkShare,
  unfollowPipeline,
  type Pipeline,
  type PipelineComment,
  type PipelineFollowerSummary,
  type PipelineGrant,
  type PipelineLinkShare,
  type PipelineRole,
  type PipelineViewSummary,
} from '@/lib/api/pipelines';
import {
  applyResourceMarking,
  checkResourceAccess,
  listMarkingCategories,
  listMarkingsForCategory,
  listResourceMarkings,
  removeResourceMarking,
  type Marking,
  type ResourceAccessCheckResponse,
  type ResourceMarking,
} from '@/lib/api/marking-categories';
import { listOrganizations, type Organization } from '@/lib/api/tenancy';

const PIPELINE_RESOURCE_KIND = 'pipeline';

type DrawerView = 'details' | 'access' | 'check' | 'roles' | 'comments';

interface MarkingCatalog {
  categories: { id: string; display_name: string; markings: Marking[] }[];
  byId: Map<string, { marking: Marking; categoryName: string }>;
}

async function loadMarkingCatalog(): Promise<MarkingCatalog> {
  const response = await listMarkingCategories(false);
  const categories: MarkingCatalog['categories'] = [];
  const byId = new Map<string, { marking: Marking; categoryName: string }>();
  await Promise.all(
    response.items.map(async (cat) => {
      try {
        const r = await listMarkingsForCategory(cat.id, false);
        categories.push({ id: cat.id, display_name: cat.display_name, markings: r.items });
        r.items.forEach((m) => byId.set(m.id, { marking: m, categoryName: cat.display_name }));
      } catch {
        categories.push({ id: cat.id, display_name: cat.display_name, markings: [] });
      }
    }),
  );
  categories.sort((a, b) => a.display_name.localeCompare(b.display_name));
  return { categories, byId };
}

interface PipelineDetailsDrawerProps {
  open: boolean;
  pipeline: Pipeline;
  branchName: string;
  description: string;
  onDescriptionChange: (next: string) => void;
  onClose: () => void;
}

export function PipelineDetailsDrawer({
  open,
  pipeline,
  branchName,
  description,
  onDescriptionChange,
  onClose,
}: PipelineDetailsDrawerProps) {
  const [view, setView] = useState<DrawerView>('details');
  const [markings, setMarkings] = useState<ResourceMarking[]>([]);
  const [markingsLoading, setMarkingsLoading] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [error, setError] = useState('');
  const [markingPickerOpen, setMarkingPickerOpen] = useState(false);
  const [markingCatalog, setMarkingCatalog] = useState<MarkingCatalog>({ categories: [], byId: new Map() });
  const [linkShare, setLinkShare] = useState<PipelineLinkShare | null>(null);
  const [linkShareBusy, setLinkShareBusy] = useState(false);
  const [grants, setGrants] = useState<PipelineGrant[]>([]);
  const [grantsBusy, setGrantsBusy] = useState(false);
  const [followerSummary, setFollowerSummary] = useState<PipelineFollowerSummary>({ following: false, follower_count: 0 });
  const [followerBusy, setFollowerBusy] = useState(false);
  const [viewSummary, setViewSummary] = useState<PipelineViewSummary>({ view_count_30d: 0 });
  const [comments, setComments] = useState<PipelineComment[]>([]);
  const [commentsBusy, setCommentsBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setView('details');
    setError('');
  }, [open, pipeline.id]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMarkingsLoading(true);
    setOrgsLoading(true);
    void listResourceMarkings(PIPELINE_RESOURCE_KIND, pipeline.id)
      .then((response) => {
        if (cancelled) return;
        setMarkings(response.items);
      })
      .catch(() => {
        if (cancelled) return;
        setMarkings([]);
      })
      .finally(() => !cancelled && setMarkingsLoading(false));
    void listOrganizations()
      .then((items) => {
        if (cancelled) return;
        setOrganizations(items);
      })
      .catch(() => {
        if (cancelled) return;
        setOrganizations([]);
      })
      .finally(() => !cancelled && setOrgsLoading(false));
    void loadMarkingCatalog()
      .then((catalog) => {
        if (!cancelled) setMarkingCatalog(catalog);
      })
      .catch(() => {
        if (!cancelled) setMarkingCatalog({ categories: [], byId: new Map() });
      });
    void getPipelineLinkShare(pipeline.id)
      .then((share) => {
        if (!cancelled) setLinkShare(share);
      })
      .catch(() => {
        // Non-owner principals get 403; surface as null so the UI hides the editor.
        if (!cancelled) setLinkShare(null);
      });
    void listPipelineGrants(pipeline.id)
      .then((response) => {
        if (!cancelled) setGrants(response.items);
      })
      .catch(() => {
        if (!cancelled) setGrants([]);
      });
    void getPipelineFollowerSummary(pipeline.id)
      .then((summary) => {
        if (!cancelled) setFollowerSummary(summary);
      })
      .catch(() => {
        if (!cancelled) setFollowerSummary({ following: false, follower_count: 0 });
      });
    void getPipelineViewSummary(pipeline.id)
      .then((summary) => {
        if (!cancelled) setViewSummary(summary);
      })
      .catch(() => {
        if (!cancelled) setViewSummary({ view_count_30d: 0 });
      });
    void listPipelineComments(pipeline.id)
      .then((response) => {
        if (!cancelled) setComments(response.items);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, pipeline.id]);

  async function postComment(body: string) {
    setCommentsBusy(true);
    setError('');
    try {
      const created = await createPipelineComment(pipeline.id, body);
      setComments((current) => [created, ...current]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Comment failed');
    } finally {
      setCommentsBusy(false);
    }
  }

  async function removeComment(commentId: string) {
    setCommentsBusy(true);
    setError('');
    try {
      await deletePipelineComment(pipeline.id, commentId);
      setComments((current) => current.filter((entry) => entry.id !== commentId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Comment removal failed');
    } finally {
      setCommentsBusy(false);
    }
  }

  async function toggleFollow() {
    setFollowerBusy(true);
    setError('');
    try {
      const next = followerSummary.following
        ? await unfollowPipeline(pipeline.id)
        : await followPipeline(pipeline.id);
      setFollowerSummary(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Follow toggle failed');
    } finally {
      setFollowerBusy(false);
    }
  }

  async function toggleLinkShare(enabled: boolean, role: PipelineRole = 'viewer') {
    setLinkShareBusy(true);
    setError('');
    try {
      const next = await putPipelineLinkShare(pipeline.id, { enabled, role });
      setLinkShare(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Link share update failed');
    } finally {
      setLinkShareBusy(false);
    }
  }

  async function rotateLinkShareToken() {
    if (!linkShare?.enabled) return;
    setLinkShareBusy(true);
    setError('');
    try {
      const next = await putPipelineLinkShare(pipeline.id, {
        enabled: true,
        role: linkShare.role ?? 'viewer',
        rotate_token: true,
      });
      setLinkShare(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Token rotation failed');
    } finally {
      setLinkShareBusy(false);
    }
  }

  async function addGrant(principalId: string, role: PipelineRole) {
    setGrantsBusy(true);
    setError('');
    try {
      await putPipelineGrant(pipeline.id, { principal_kind: 'user', principal_id: principalId, role });
      const refreshed = await listPipelineGrants(pipeline.id);
      setGrants(refreshed.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Grant failed');
    } finally {
      setGrantsBusy(false);
    }
  }

  async function removeGrant(grantId: string) {
    setGrantsBusy(true);
    setError('');
    try {
      await deletePipelineGrant(pipeline.id, grantId);
      setGrants((current) => current.filter((entry) => entry.id !== grantId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Grant removal failed');
    } finally {
      setGrantsBusy(false);
    }
  }

  const pipelineRid = useMemo(() => `pipelines/${pipeline.id}`, [pipeline.id]);
  const ownerLabel = pipeline.owner_id ? pipeline.owner_id.slice(0, 8) : 'unknown';

  async function handleAddMarking(marking: Marking) {
    setError('');
    try {
      await applyResourceMarking({
        resource_kind: PIPELINE_RESOURCE_KIND,
        resource_id: pipeline.id,
        marking_id: marking.id,
        resource_update_markings_allowed: true,
      });
      const response = await listResourceMarkings(PIPELINE_RESOURCE_KIND, pipeline.id);
      setMarkings(response.items);
      setMarkingPickerOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to apply marking');
    }
  }

  async function handleRemoveMarking(marking: ResourceMarking) {
    setError('');
    try {
      await removeResourceMarking({
        resource_kind: PIPELINE_RESOURCE_KIND,
        resource_id: pipeline.id,
        marking_id: marking.marking_id,
        resource_update_markings_allowed: true,
      });
      const response = await listResourceMarkings(PIPELINE_RESOURCE_KIND, pipeline.id);
      setMarkings(response.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to remove marking');
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.18)', zIndex: 50 }}
      />
      <aside
        role="dialog"
        aria-label="Pipeline details"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 400,
          maxWidth: '90vw',
          height: '100vh',
          background: '#fff',
          boxShadow: '-12px 0 24px rgba(15, 23, 42, 0.08)',
          zIndex: 51,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {view !== 'details' && (
            <button
              type="button"
              className="of-button"
              onClick={() => setView('details')}
              aria-label="Back to details"
              style={{ padding: '2px 6px', fontSize: 12 }}
            >
              <Glyph name="chevron-left" size={12} />
            </button>
          )}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Glyph name="project" size={14} tone="#2d72d2" />
            <div style={{ display: 'grid' }}>
              <strong style={{ fontSize: 14 }}>{pipeline.name || 'Untitled pipeline'}</strong>
              <span className="of-text-muted" style={{ fontSize: 11 }}>
                {view === 'details'
                  ? 'Details'
                  : view === 'access'
                    ? 'Details › Access'
                    : view === 'check'
                      ? 'Details › Access › Check'
                      : view === 'comments'
                        ? 'Details › Comments'
                        : 'Details › Roles'}
              </span>
            </div>
          </div>
          <button type="button" className="of-button" onClick={onClose} aria-label="Close" style={{ padding: '2px 6px' }}>
            <Glyph name="x" size={12} />
          </button>
        </header>

        {error && (
          <div className="of-status-danger" style={{ margin: 12, padding: '6px 8px', fontSize: 12, borderRadius: 4 }}>{error}</div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {view === 'details' && (
            <DetailsBody
              pipeline={pipeline}
              branchName={branchName}
              description={description}
              onDescriptionChange={onDescriptionChange}
              markingsCount={markings.length}
              pipelineRid={pipelineRid}
              ownerLabel={ownerLabel}
              followerSummary={followerSummary}
              followerBusy={followerBusy}
              onToggleFollow={() => void toggleFollow()}
              viewSummary={viewSummary}
              commentCount={comments.length}
              onOpenAccess={() => setView('access')}
              onOpenComments={() => setView('comments')}
            />
          )}
          {view === 'comments' && (
            <CommentsBody
              pipeline={pipeline}
              comments={comments}
              busy={commentsBusy}
              onPost={(body) => void postComment(body)}
              onRemove={(commentId) => void removeComment(commentId)}
            />
          )}
          {view === 'access' && (
            <AccessBody
              pipeline={pipeline}
              organizations={organizations}
              orgsLoading={orgsLoading}
              markings={markings}
              markingsLoading={markingsLoading}
              markingCatalog={markingCatalog}
              linkShare={linkShare}
              linkShareBusy={linkShareBusy}
              onToggleLinkShare={(enabled, role) => void toggleLinkShare(enabled, role)}
              onRotateLinkShareToken={() => void rotateLinkShareToken()}
              onAddMarking={() => setMarkingPickerOpen(true)}
              onRemoveMarking={handleRemoveMarking}
              onOpenCheck={() => setView('check')}
              onOpenRoles={() => setView('roles')}
            />
          )}
          {view === 'check' && (
            <CheckAccessBody pipelineId={pipeline.id} organizations={organizations} />
          )}
          {view === 'roles' && (
            <RolesBody
              pipeline={pipeline}
              grants={grants}
              grantsBusy={grantsBusy}
              onAddGrant={(principalId, role) => void addGrant(principalId, role)}
              onRemoveGrant={(grantId) => void removeGrant(grantId)}
            />
          )}
        </div>
      </aside>

      <MarkingPickerDialog
        open={markingPickerOpen}
        catalog={markingCatalog}
        appliedIds={new Set(markings.map((entry) => entry.marking_id))}
        onPick={(marking) => void handleAddMarking(marking)}
        onClose={() => setMarkingPickerOpen(false)}
      />
    </>
  );
}

interface DetailsBodyProps {
  pipeline: Pipeline;
  branchName: string;
  description: string;
  onDescriptionChange: (next: string) => void;
  markingsCount: number;
  pipelineRid: string;
  ownerLabel: string;
  followerSummary: PipelineFollowerSummary;
  followerBusy: boolean;
  onToggleFollow: () => void;
  viewSummary: PipelineViewSummary;
  commentCount: number;
  onOpenAccess: () => void;
  onOpenComments: () => void;
}

function DetailsBody({
  pipeline,
  branchName,
  description,
  onDescriptionChange,
  markingsCount,
  pipelineRid,
  ownerLabel,
  followerSummary,
  followerBusy,
  onToggleFollow,
  viewSummary,
  commentCount,
  onOpenAccess,
  onOpenComments,
}: DetailsBodyProps) {
  return (
    <div style={{ padding: 16, display: 'grid', gap: 16 }}>
      <section style={{ display: 'grid', gap: 6 }}>
        <textarea
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="Enter description…"
          rows={3}
          style={{
            width: '100%',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            padding: 8,
            fontSize: 13,
            resize: 'vertical',
          }}
        />
        <StatRow
          followerSummary={followerSummary}
          followerBusy={followerBusy}
          onToggleFollow={onToggleFollow}
          viewSummary={viewSummary}
          commentCount={commentCount}
          onOpenComments={onOpenComments}
        />
      </section>

      <CollaboratorsPlaceholder ownerLabel={ownerLabel} />

      <section style={{ display: 'grid', gap: 4 }}>
        <SidebarSectionTitle label="Access" actionLabel="View" onAction={onOpenAccess} />
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>MARKINGS</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Glyph name="shield" size={12} tone="#5f6b7a" />
          <strong style={{ fontSize: 13 }}>{markingsCount}</strong>
          <span className="of-text-muted" style={{ fontSize: 12 }}>{markingsCount === 1 ? 'Marking' : 'Markings'}</span>
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 12 }}>
          You have the <u>Owner</u> role on this file.
        </p>
      </section>

      <section style={{ display: 'grid', gap: 6 }}>
        <SidebarSectionTitle label="Misc" />
        <MiscRow label="RID" value={pipelineRid} copyable />
        <MiscRow label="Branch" value={branchName || 'main'} />
        <MiscRow label="Status" value={pipeline.status} />
        <MiscRow
          label="Modified"
          value={new Date(pipeline.updated_at).toLocaleString()}
          secondary={`by ${ownerLabel}`}
        />
        <MiscRow label="Created" value={new Date(pipeline.created_at).toLocaleString()} />
      </section>
    </div>
  );
}

function StatRow({
  followerSummary,
  followerBusy,
  onToggleFollow,
  viewSummary,
  commentCount,
  onOpenComments,
}: {
  followerSummary: PipelineFollowerSummary;
  followerBusy: boolean;
  onToggleFollow: () => void;
  viewSummary: PipelineViewSummary;
  commentCount: number;
  onOpenComments: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '4px 0', alignItems: 'center' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        title="Views in the last 30 days"
      >
        <Glyph name="eye" size={12} />
        <strong style={{ fontSize: 12 }}>{viewSummary.view_count_30d}</strong>
        <span className="of-text-muted" style={{ fontSize: 11 }}>Views</span>
      </div>
      <button
        type="button"
        onClick={onToggleFollow}
        disabled={followerBusy}
        className="of-button"
        style={{
          padding: '2px 6px',
          fontSize: 11,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: followerSummary.following ? '#dbeafe' : undefined,
          color: followerSummary.following ? '#1e40af' : undefined,
        }}
        title={followerSummary.following ? 'Unfollow this pipeline' : 'Follow this pipeline'}
      >
        <Glyph name="users" size={12} />
        <strong>{followerSummary.follower_count}</strong>
        <span className="of-text-muted" style={{ fontSize: 11 }}>
          {followerSummary.following ? 'Following' : 'Followers'}
        </span>
      </button>
      <button
        type="button"
        onClick={onOpenComments}
        className="of-button"
        style={{ padding: '2px 6px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        title="Open comments"
      >
        <Glyph name="document" size={12} />
        <strong>{commentCount}</strong>
        <span className="of-text-muted" style={{ fontSize: 11 }}>Comments</span>
      </button>
    </div>
  );
}

function CollaboratorsPlaceholder({ ownerLabel }: { ownerLabel: string }) {
  return (
    <section style={{ display: 'grid', gap: 6 }}>
      <SidebarSectionTitle label="Collaborators" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          aria-hidden
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: '#dbeafe',
            color: '#1e40af',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {ownerLabel.slice(0, 2).toUpperCase()}
        </div>
        <span style={{ fontSize: 12 }}>{ownerLabel}</span>
        <span className="of-chip" style={{ fontSize: 10 }}>Owner</span>
      </div>
      <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>
        Multi-user collaborator management lands in Phase 2.
      </p>
    </section>
  );
}

interface AccessBodyProps {
  pipeline: Pipeline;
  organizations: Organization[];
  orgsLoading: boolean;
  markings: ResourceMarking[];
  markingsLoading: boolean;
  markingCatalog: MarkingCatalog;
  linkShare: PipelineLinkShare | null;
  linkShareBusy: boolean;
  onToggleLinkShare: (enabled: boolean, role: PipelineRole) => void;
  onRotateLinkShareToken: () => void;
  onAddMarking: () => void;
  onRemoveMarking: (marking: ResourceMarking) => void;
  onOpenCheck: () => void;
  onOpenRoles: () => void;
}

function AccessBody({
  pipeline,
  organizations,
  orgsLoading,
  markings,
  markingsLoading,
  markingCatalog,
  linkShare,
  linkShareBusy,
  onToggleLinkShare,
  onRotateLinkShareToken,
  onAddMarking,
  onRemoveMarking,
  onOpenCheck,
  onOpenRoles,
}: AccessBodyProps) {
  return (
    <div style={{ padding: 16, display: 'grid', gap: 16 }}>
      <section style={{ display: 'grid', gap: 6 }}>
        <SidebarSectionTitle label="Access requirements" />
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
          People must have a role and meet these access requirements in order to access this file.
        </p>
        <div style={{ display: 'grid', gap: 4 }}>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
            ORGANIZATIONS <span style={{ marginLeft: 6, color: 'var(--text-muted)' }}>· Any of</span>
          </p>
          {orgsLoading ? (
            <p className="of-text-muted" style={{ fontSize: 12 }}>Loading…</p>
          ) : organizations.length === 0 ? (
            <p className="of-text-muted" style={{ fontSize: 12 }}>No organization requirements.</p>
          ) : (
            organizations.slice(0, 4).map((org) => (
              <div key={org.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Glyph name="folder" size={12} tone="#5f6b7a" />
                <span style={{ fontSize: 13 }}>{org.display_name || org.slug}</span>
              </div>
            ))
          )}
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
              MARKINGS <span style={{ marginLeft: 6, color: 'var(--text-muted)' }}>· All of</span>
            </p>
            <button type="button" className="of-button" onClick={onAddMarking} style={{ fontSize: 11 }}>
              Add
            </button>
          </div>
          {markingsLoading ? (
            <p className="of-text-muted" style={{ fontSize: 12 }}>Loading…</p>
          ) : markings.length === 0 ? (
            <p className="of-text-muted" style={{ fontSize: 12 }}>No markings required.</p>
          ) : (
            markings.map((entry) => {
              const known = markingCatalog.byId.get(entry.marking_id);
              const label = known?.marking.display_name ?? `${entry.marking_id.slice(0, 8)}…`;
              return (
                <div
                  key={entry.marking_id}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}
                >
                  <span style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Glyph name="shield" size={12} tone="#5f6b7a" />
                    {label}
                    {known?.categoryName && (
                      <span className="of-text-muted" style={{ fontSize: 11 }}>· {known.categoryName}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="of-button"
                    onClick={() => onRemoveMarking(entry)}
                    style={{ fontSize: 11, color: '#b91c1c' }}
                    aria-label={`Remove ${label}`}
                  >
                    Remove
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 6 }}>
        <SidebarSectionTitle label="Roles" actionLabel="Manage" onAction={onOpenRoles} />
        <p style={{ margin: 0, fontSize: 12 }}>
          You have the <u>Owner</u> role on this file.
        </p>
      </section>

      <LinkShareSection
        share={linkShare}
        busy={linkShareBusy}
        onToggle={onToggleLinkShare}
        onRotate={onRotateLinkShareToken}
      />


      <section style={{ display: 'grid', gap: 6 }}>
        <SidebarSectionTitle label="Check access" actionLabel="Check" onAction={onOpenCheck} />
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
          Check access requirements for a particular user or group.
        </p>
      </section>

      <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>
        Pipeline ID: {pipeline.id}
      </p>
    </div>
  );
}

interface CheckAccessBodyProps {
  pipelineId: string;
  organizations: Organization[];
}

function CheckAccessBody({ pipelineId, organizations }: CheckAccessBodyProps) {
  const [principalId, setPrincipalId] = useState('');
  const [requiredOrgId, setRequiredOrgId] = useState('');
  const [result, setResult] = useState<ResourceAccessCheckResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  async function runCheck() {
    if (!principalId.trim()) {
      setLocalError('Enter a principal user ID first.');
      return;
    }
    setBusy(true);
    setLocalError('');
    setResult(null);
    try {
      const response = await checkResourceAccess({
        principal_id: principalId.trim(),
        resource_kind: PIPELINE_RESOURCE_KIND,
        resource_id: pipelineId,
        required_organization_id: requiredOrgId || undefined,
      });
      setResult(response);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'Check failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <SidebarSectionTitle label="Check access" />
      <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
        Use the principal ID of a user or group to evaluate their access against the marking and organization requirements above.
      </p>
      <label style={{ fontSize: 12, display: 'grid', gap: 4 }}>
        Principal user ID
        <input
          value={principalId}
          onChange={(event) => setPrincipalId(event.target.value)}
          placeholder="UUID"
          className="of-input"
          style={{ fontSize: 12 }}
        />
      </label>
      <label style={{ fontSize: 12, display: 'grid', gap: 4 }}>
        Required organization (optional)
        <select
          value={requiredOrgId}
          onChange={(event) => setRequiredOrgId(event.target.value)}
          className="of-select"
          style={{ fontSize: 12 }}
        >
          <option value="">— any —</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.display_name || org.slug}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="of-button of-button--primary" onClick={() => void runCheck()} disabled={busy} style={{ alignSelf: 'flex-start' }}>
        {busy ? 'Checking…' : 'Check access'}
      </button>
      {localError && <p className="of-status-danger" style={{ fontSize: 12 }}>{localError}</p>}
      {result && (
        <section style={{ display: 'grid', gap: 6, padding: 10, border: '1px solid var(--border-subtle)', borderRadius: 4 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: result.resource_access_allowed ? '#15803d' : '#b91c1c' }}>
            {result.resource_access_allowed ? '✓ Resource access allowed' : '✗ Resource access denied'}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: result.data_access_allowed ? '#15803d' : '#b91c1c' }}>
            {result.data_access_allowed ? '✓ Data access allowed' : '✗ Data access denied'}
          </p>
          {result.access_requirements?.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
              {result.access_requirements.map((req, idx) => (
                <li key={idx} style={{ color: req.satisfied ? '#15803d' : '#b91c1c' }}>
                  {req.label}: {req.detail || (req.satisfied ? 'passed' : 'failed')}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

interface RolesBodyProps {
  pipeline: Pipeline;
  grants: PipelineGrant[];
  grantsBusy: boolean;
  onAddGrant: (principalId: string, role: PipelineRole) => void;
  onRemoveGrant: (grantId: string) => void;
}

function RolesBody({ pipeline, grants, grantsBusy, onAddGrant, onRemoveGrant }: RolesBodyProps) {
  const [newPrincipal, setNewPrincipal] = useState('');
  const [newRole, setNewRole] = useState<PipelineRole>('viewer');

  function handleAdd() {
    const trimmed = newPrincipal.trim();
    if (!trimmed) return;
    onAddGrant(trimmed, newRole);
    setNewPrincipal('');
  }

  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <SidebarSectionTitle label="Roles" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{pipeline.owner_id?.slice(0, 8) ?? 'unknown'}</p>
          <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>Owner — created the pipeline</p>
        </div>
        <span className="of-chip">owner</span>
      </div>

      <section style={{ display: 'grid', gap: 6 }}>
        <SidebarSectionTitle label="Grants" />
        {grants.length === 0 ? (
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
            No grants yet. Add a user UUID below to share editor/viewer access without making them owner.
          </p>
        ) : (
          grants.map((grant) => (
            <div
              key={grant.id}
              style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}
            >
              <div style={{ display: 'grid' }}>
                <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>{grant.principal_id.slice(0, 12)}…</span>
                <span className="of-text-muted" style={{ fontSize: 11 }}>
                  {grant.principal_kind} · since {new Date(grant.created_at).toLocaleDateString()}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className="of-chip" style={{ fontSize: 11 }}>{grant.role}</span>
                <button
                  type="button"
                  className="of-button"
                  onClick={() => onRemoveGrant(grant.id)}
                  disabled={grantsBusy}
                  style={{ fontSize: 11, color: '#b91c1c' }}
                  aria-label="Remove grant"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <section style={{ display: 'grid', gap: 6 }}>
        <SidebarSectionTitle label="Add user or group" />
        <input
          value={newPrincipal}
          onChange={(event) => setNewPrincipal(event.target.value)}
          placeholder="Principal UUID (user or group)"
          className="of-input"
          style={{ fontSize: 12 }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <select
            value={newRole}
            onChange={(event) => setNewRole(event.target.value as PipelineRole)}
            className="of-select"
            style={{ flex: 1, fontSize: 12 }}
          >
            <option value="discoverer">Discoverer</option>
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
          <button
            type="button"
            className="of-button of-button--primary"
            onClick={handleAdd}
            disabled={grantsBusy || !newPrincipal.trim()}
            style={{ fontSize: 12 }}
          >
            Grant
          </button>
        </div>
        <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>
          Group lookup UI lands in Phase 2. For now paste a known principal UUID.
        </p>
      </section>
    </div>
  );
}

interface LinkShareSectionProps {
  share: PipelineLinkShare | null;
  busy: boolean;
  onToggle: (enabled: boolean, role: PipelineRole) => void;
  onRotate: () => void;
}

function LinkShareSection({ share, busy, onToggle, onRotate }: LinkShareSectionProps) {
  const [copied, setCopied] = useState(false);
  const enabled = share?.enabled ?? false;
  const role = share?.role ?? 'viewer';
  const shareUrl = share?.token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/shared/pipelines/${share.token}`
    : '';

  async function copyUrl() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — silent
    }
  }

  if (share === null) {
    return (
      <section style={{ display: 'grid', gap: 6 }}>
        <SidebarSectionTitle label="Link sharing" />
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
          Only the pipeline owner can configure link sharing.
        </p>
      </section>
    );
  }

  return (
    <section style={{ display: 'grid', gap: 6 }}>
      <SidebarSectionTitle label="Link sharing" />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(event) => onToggle(event.target.checked, role)}
        />
        <span style={{ fontSize: 12 }}>Anyone with the link can access this pipeline</span>
      </label>
      {enabled && (
        <>
          <label style={{ fontSize: 12, display: 'grid', gap: 4 }}>
            Role granted by link
            <select
              value={role}
              onChange={(event) => onToggle(true, event.target.value as PipelineRole)}
              disabled={busy}
              className="of-select"
              style={{ fontSize: 12 }}
            >
              <option value="discoverer">Discoverer</option>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
          </label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input readOnly value={shareUrl} className="of-input" style={{ flex: 1, fontSize: 11 }} />
            <button
              type="button"
              className="of-button"
              onClick={() => void copyUrl()}
              disabled={busy || !shareUrl}
              style={{ fontSize: 11 }}
              title="Copy link"
            >
              {copied ? '✓' : <Glyph name="duplicate" size={11} />}
            </button>
            <button
              type="button"
              className="of-button"
              onClick={onRotate}
              disabled={busy}
              style={{ fontSize: 11 }}
              title="Rotate token (invalidates previous link)"
            >
              Rotate
            </button>
          </div>
        </>
      )}
    </section>
  );
}

interface CommentsBodyProps {
  pipeline: Pipeline;
  comments: PipelineComment[];
  busy: boolean;
  onPost: (body: string) => void;
  onRemove: (commentId: string) => void;
}

function CommentsBody({ pipeline, comments, busy, onPost, onRemove }: CommentsBodyProps) {
  const [draft, setDraft] = useState('');
  function submit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onPost(trimmed);
    setDraft('');
  }
  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <SidebarSectionTitle label="Comments" />
      <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
        Discuss this pipeline. Authors and the pipeline owner can delete a comment.
      </p>
      <section style={{ display: 'grid', gap: 6 }}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          placeholder="Add a comment…"
          style={{
            width: '100%',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            padding: 8,
            fontSize: 13,
            resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="of-button of-button--primary"
            onClick={submit}
            disabled={busy || draft.trim().length === 0}
            style={{ fontSize: 12 }}
          >
            {busy ? 'Posting…' : 'Post comment'}
          </button>
        </div>
      </section>
      <section style={{ display: 'grid', gap: 10 }}>
        {comments.length === 0 ? (
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>No comments yet.</p>
        ) : (
          comments.map((entry) => (
            <article
              key={entry.id}
              style={{ display: 'grid', gap: 4, padding: 10, border: '1px solid var(--border-subtle)', borderRadius: 4 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                    {entry.author_id.slice(0, 8)}…
                  </span>
                  {entry.author_id === pipeline.owner_id && <span className="of-chip" style={{ fontSize: 10 }}>owner</span>}
                  <span className="of-text-muted" style={{ fontSize: 11 }}>
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </div>
                <button
                  type="button"
                  className="of-button"
                  onClick={() => onRemove(entry.id)}
                  disabled={busy}
                  style={{ fontSize: 11, color: '#b91c1c' }}
                  aria-label="Delete comment"
                  title="Author or pipeline owner can delete"
                >
                  Delete
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}>{entry.body}</p>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

interface MiscRowProps {
  label: string;
  value: string;
  secondary?: string;
  copyable?: boolean;
}

function MiscRow({ label, value, secondary, copyable }: MiscRowProps) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked; surface nothing
    }
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span className="of-text-muted">{label}</span>
      <span style={{ fontFamily: copyable ? 'var(--font-mono)' : undefined, wordBreak: 'break-all' }}>
        {value}
        {secondary && <span className="of-text-muted" style={{ marginLeft: 6 }}>{secondary}</span>}
      </span>
      {copyable && (
        <button
          type="button"
          className="of-button"
          onClick={() => void copy()}
          aria-label={`Copy ${label}`}
          style={{ padding: '2px 6px', fontSize: 11 }}
        >
          {copied ? '✓' : <Glyph name="duplicate" size={11} />}
        </button>
      )}
    </div>
  );
}

interface SidebarSectionTitleProps {
  label: string;
  actionLabel?: string;
  onAction?: () => void;
}

function SidebarSectionTitle({ label, actionLabel, onAction }: SidebarSectionTitleProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <strong style={{ fontSize: 13 }}>{label}</strong>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="of-button" style={{ fontSize: 11, padding: '2px 6px' }}>
          {actionLabel} <Glyph name="chevron-right" size={10} />
        </button>
      )}
    </div>
  );
}

interface MarkingPickerDialogProps {
  open: boolean;
  catalog: MarkingCatalog;
  appliedIds: Set<string>;
  onPick: (marking: Marking) => void;
  onClose: () => void;
}

function MarkingPickerDialog({ open, catalog, appliedIds, onPick, onClose }: MarkingPickerDialogProps) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  if (!open) return null;
  const normalized = query.trim().toLowerCase();
  const loading = catalog.categories.length === 0;

  return (
    <>
      <div onClick={onClose} aria-hidden style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.3)', zIndex: 60 }} />
      <div
        role="dialog"
        aria-label="Add marking"
        style={{
          position: 'fixed',
          top: '15vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 480,
          maxWidth: '92vw',
          maxHeight: '70vh',
          background: '#fff',
          borderRadius: 6,
          boxShadow: '0 16px 48px rgba(15, 23, 42, 0.18)',
          zIndex: 61,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 14 }}>Add Marking requirement</strong>
          <button type="button" className="of-button" onClick={onClose} aria-label="Close" style={{ padding: '2px 6px' }}>
            <Glyph name="x" size={12} />
          </button>
        </header>
        <div style={{ padding: '10px 14px' }}>
          <input
            type="search"
            placeholder="Filter markings"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="of-input"
            style={{ width: '100%', fontSize: 12 }}
            autoFocus
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
          {loading && <p className="of-text-muted" style={{ fontSize: 12 }}>Loading…</p>}
          {!loading && catalog.categories.length === 0 && (
            <p className="of-text-muted" style={{ fontSize: 12 }}>No marking categories available.</p>
          )}
          {!loading && catalog.categories.map((cat) => {
            const items = cat.markings.filter((entry) =>
              !normalized ||
              entry.display_name.toLowerCase().includes(normalized) ||
              cat.display_name.toLowerCase().includes(normalized),
            );
            if (items.length === 0) return null;
            return (
              <section key={cat.id} style={{ display: 'grid', gap: 4, marginBottom: 12 }}>
                <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>
                  {cat.display_name.toUpperCase()}
                </p>
                {items.map((marking) => {
                  const already = appliedIds.has(marking.id);
                  return (
                    <button
                      key={marking.id}
                      type="button"
                      disabled={already}
                      onClick={() => onPick(marking)}
                      className="of-button"
                      style={{
                        justifyContent: 'flex-start',
                        textAlign: 'left',
                        fontSize: 12,
                        opacity: already ? 0.55 : 1,
                      }}
                    >
                      <Glyph name="shield" size={12} />
                      <span style={{ marginLeft: 6 }}>{marking.display_name}</span>
                      {already && <span style={{ marginLeft: 'auto', fontSize: 10 }}>applied</span>}
                    </button>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}

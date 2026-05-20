import { useEffect, useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import type { Pipeline } from '@/lib/api/pipelines';
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

type DrawerView = 'details' | 'access' | 'check' | 'roles';

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
    return () => {
      cancelled = true;
    };
  }, [open, pipeline.id]);

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
                {view === 'details' ? 'Details' : view === 'access' ? 'Details › Access' : view === 'check' ? 'Details › Access › Check' : 'Details › Roles'}
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
              onOpenAccess={() => setView('access')}
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
              onAddMarking={() => setMarkingPickerOpen(true)}
              onRemoveMarking={handleRemoveMarking}
              onOpenCheck={() => setView('check')}
              onOpenRoles={() => setView('roles')}
            />
          )}
          {view === 'check' && (
            <CheckAccessBody pipelineId={pipeline.id} organizations={organizations} />
          )}
          {view === 'roles' && <RolesBody pipeline={pipeline} />}
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
  onOpenAccess: () => void;
}

function DetailsBody({
  pipeline,
  branchName,
  description,
  onDescriptionChange,
  markingsCount,
  pipelineRid,
  ownerLabel,
  onOpenAccess,
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
        <ComingSoonStatRow />
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

function ComingSoonStatRow() {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '4px 0' }}>
      <ComingSoonStat icon="eye" label="Views" />
      <ComingSoonStat icon="users" label="Followers" />
      <ComingSoonStat icon="document" label="Comments" />
    </div>
  );
}

function ComingSoonStat({ icon, label }: { icon: 'eye' | 'users' | 'document'; label: string }) {
  return (
    <div title="Coming in Phase 2" style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: 0.5 }}>
      <Glyph name={icon} size={12} />
      <span style={{ fontSize: 12 }}>—</span>
      <span className="of-text-muted" style={{ fontSize: 11 }}>{label}</span>
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

      <section style={{ display: 'grid', gap: 6 }}>
        <SidebarSectionTitle label="Link sharing" />
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
          Share via tokenized link · <strong>Coming in Phase 2</strong>
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.5 }}>
          <input type="checkbox" disabled />
          <span style={{ fontSize: 12 }}>Anyone with the link can view</span>
        </label>
      </section>

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

function RolesBody({ pipeline }: { pipeline: Pipeline }) {
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
      <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
        Resource-level role grants (add user/group + assign role) land in Phase 2. Use Markings + Organizations for access control today.
      </p>
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

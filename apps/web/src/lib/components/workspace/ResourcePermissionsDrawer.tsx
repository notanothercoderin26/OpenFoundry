import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';
import {
  createShare,
  listResourceShares,
  revokeShare,
  type AccessLevel,
  type ResourceKind,
  type ResourceShare,
} from '@/lib/api/workspace';
import type { GroupRecord, UserProfile } from '@/lib/api/auth';
import { Drawer } from '@/lib/components/ui/Drawer';
import { Glyph } from '@/lib/components/ui/Glyph';
import { AccessGraph, type AccessGraphMembership } from './AccessGraph';
import { PrincipalPicker, type PrincipalPick } from './PrincipalPicker';

export type { AccessGraphMembership };

interface ResourcePermissionsDrawerProps {
  open: boolean;
  resourceKind: ResourceKind | null;
  resourceId: string | null;
  resourceLabel?: string;
  ownerId?: string | null;
  projectLabel?: string | null;
  projectMemberships?: AccessGraphMembership[];
  /** Optional inherited markings used by the "Additional data requirements" card. */
  inheritedMarkings?: string[];
  /** When set, allows the "Explore data lineage" link to deep-link out. */
  lineageHref?: string;
  onClose?: () => void;
  onChanged?: () => void;
}

type RailKey = 'overview' | 'access' | 'activity';
type AccessTab = 'requirements' | 'check';

function formatDate(value: string | null) {
  if (!value) return 'Never';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function errorMessage(cause: unknown, fallback: string) {
  if (cause instanceof Error && cause.message) return cause.message;
  return fallback;
}

function isPermissionDenied(cause: unknown) {
  return cause instanceof ApiError && cause.status === 403;
}

function isExpired(value: string | null) {
  return Boolean(value && new Date(value).getTime() <= Date.now());
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ACCESS_TONE: Record<AccessLevel, { bg: string; border: string; text: string }> = {
  viewer: { bg: '#1e3a8a', border: '#1d4ed8', text: '#bfdbfe' },
  editor: { bg: '#14532d', border: '#15803d', text: '#bbf7d0' },
  owner: { bg: '#78350f', border: '#b45309', text: '#fde68a' },
};

const ACCESS_RANK: Record<AccessLevel, number> = { viewer: 1, editor: 2, owner: 3 };

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        aria-hidden
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          background: ok ? '#14532d' : '#7f1d1d',
          color: ok ? '#bbf7d0' : '#fecaca',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 auto',
        }}
      >
        <Glyph name={ok ? 'check' : 'x'} size={14} strokeWidth={2.4} />
      </span>
      <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

function Section({
  title,
  children,
  open: controlledOpen,
  onToggle,
}: {
  title: ReactNode;
  children: ReactNode;
  open?: boolean;
  onToggle?: () => void;
}) {
  const [internalOpen, setInternalOpen] = useState(true);
  const isOpen = controlledOpen ?? internalOpen;
  const toggle = () => {
    if (onToggle) onToggle();
    else setInternalOpen((v) => !v);
  };
  return (
    <section
      style={{
        border: '1px solid #1e293b',
        background: '#0b1220',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={toggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          padding: '10px 12px',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <div>{title}</div>
        <Glyph name={isOpen ? 'chevron-down' : 'chevron-right'} size={16} />
      </button>
      {isOpen ? (
        <div style={{ padding: '0 12px 12px', display: 'grid', gap: 8 }}>{children}</div>
      ) : null}
    </section>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        color: '#94a3b8',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontWeight: 700,
      }}
    >
      {children}
    </p>
  );
}

function TinyCheck({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        borderRadius: 4,
        background: ok ? '#14532d' : '#7f1d1d',
        color: ok ? '#bbf7d0' : '#fecaca',
        flex: '0 0 auto',
      }}
    >
      <Glyph name={ok ? 'check' : 'x'} size={12} strokeWidth={2.6} />
    </span>
  );
}

function MarkingChip({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: '#1e293b',
        border: '1px solid #334155',
        color: '#e2e8f0',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      <Glyph name="shield" size={12} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Rail (Overview / Access / Activity)
// ---------------------------------------------------------------------------

function Rail({
  active,
  onChange,
}: {
  active: RailKey;
  onChange: (next: RailKey) => void;
}) {
  const items: Array<{ key: RailKey; icon: 'info' | 'lock' | 'history'; label: string }> = [
    { key: 'overview', icon: 'info', label: 'Overview' },
    { key: 'access', icon: 'lock', label: 'Access' },
    { key: 'activity', icon: 'history', label: 'Activity' },
  ];
  return (
    <nav
      aria-label="Resource sections"
      style={{
        background: '#0b1220',
        borderRight: '1px solid #1e293b',
        padding: '10px 6px',
        display: 'grid',
        gap: 4,
        alignContent: 'start',
        minWidth: 132,
      }}
    >
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 6,
              border: 'none',
              background: isActive ? '#1d4ed8' : 'transparent',
              color: isActive ? '#fff' : '#cbd5e1',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 12,
              fontWeight: isActive ? 700 : 500,
            }}
          >
            <Glyph name={item.icon} size={16} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Sub-tabs (Requirements / Check access) for the Access pane
// ---------------------------------------------------------------------------

function AccessTabs({
  active,
  onChange,
}: {
  active: AccessTab;
  onChange: (next: AccessTab) => void;
}) {
  const tabs: Array<{ key: AccessTab; label: string }> = [
    { key: 'requirements', label: 'Requirements' },
    { key: 'check', label: 'Check access' },
  ];
  return (
    <div
      style={{
        display: 'flex',
        gap: 18,
        borderBottom: '1px solid #1e293b',
        padding: '0 4px',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            style={{
              border: 'none',
              background: 'transparent',
              color: isActive ? '#60a5fa' : '#94a3b8',
              fontSize: 12,
              fontWeight: 700,
              padding: '8px 0',
              cursor: 'pointer',
              borderBottom: `2px solid ${isActive ? '#3b82f6' : 'transparent'}`,
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Principal access analysis (computed locally from existing data)
// ---------------------------------------------------------------------------

interface RoleSource {
  level: AccessLevel;
  via: string;
}

interface AccessAnalysis {
  requirementsMet: boolean;
  highest: AccessLevel | null;
  organizations: string[];
  organizationsMet: boolean;
  roles: RoleSource[];
  rolesMet: boolean;
  expiredShares: number;
}

function analyzeAccess(opts: {
  principalKind: 'user' | 'group';
  principalId: string;
  profile?: UserProfile;
  group?: GroupRecord;
  ownerId?: string | null;
  projectMemberships: AccessGraphMembership[];
  shares: ResourceShare[];
  projectLabel?: string | null;
}): AccessAnalysis {
  const {
    principalKind,
    principalId,
    profile,
    group,
    ownerId,
    projectMemberships,
    shares,
    projectLabel,
  } = opts;

  const roles: RoleSource[] = [];
  let expiredShares = 0;

  if (principalKind === 'user' && ownerId && ownerId === principalId) {
    roles.push({ level: 'owner', via: 'Resource owner' });
  }

  if (principalKind === 'user') {
    for (const mem of projectMemberships) {
      if (mem.user_id === principalId) {
        roles.push({
          level: mem.role,
          via: projectLabel ? `Project membership · ${projectLabel}` : 'Project membership',
        });
      }
    }
  }

  for (const share of shares) {
    const matchUser =
      principalKind === 'user' && share.shared_with_user_id === principalId;
    const matchGroup =
      principalKind === 'group' && share.shared_with_group_id === principalId;
    if (!matchUser && !matchGroup) continue;
    if (isExpired(share.expires_at)) {
      expiredShares += 1;
      continue;
    }
    roles.push({
      level: share.access_level,
      via: share.note ? `Direct share · ${share.note}` : 'Direct share',
    });
  }

  // For users we also surface group shares that the user is a member of via profile.groups.
  if (principalKind === 'user' && profile?.groups?.length) {
    const memberOf = new Set(profile.groups);
    for (const share of shares) {
      if (!share.shared_with_group_id) continue;
      if (!memberOf.has(share.shared_with_group_id)) continue;
      if (isExpired(share.expires_at)) continue;
      roles.push({
        level: share.access_level,
        via: `Group share · ${share.shared_with_group_id}`,
      });
    }
  }

  const highest = roles.reduce<AccessLevel | null>((acc, role) => {
    if (!acc) return role.level;
    return ACCESS_RANK[role.level] > ACCESS_RANK[acc] ? role.level : acc;
  }, null);

  // Organizations: derive from profile when available.
  const organizations: string[] = [];
  if (principalKind === 'user') {
    if (profile?.organization_id) organizations.push(profile.organization_id);
  } else if (group) {
    // Groups don't have an org field today; surface their roles instead.
  }

  const organizationsMet = organizations.length > 0 || principalKind === 'group';
  const rolesMet = roles.length > 0;
  const requirementsMet = rolesMet && organizationsMet;

  return {
    requirementsMet,
    highest,
    organizations,
    organizationsMet,
    roles,
    rolesMet,
    expiredShares,
  };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ResourcePermissionsDrawer({
  open,
  resourceKind,
  resourceId,
  resourceLabel,
  ownerId,
  projectLabel,
  projectMemberships = [],
  inheritedMarkings = [],
  lineageHref,
  onClose,
  onChanged,
}: ResourcePermissionsDrawerProps) {
  // Shared data
  const [shares, setShares] = useState<ResourceShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [status, setStatus] = useState('');

  // Rail / sub-tab state
  const [rail, setRail] = useState<RailKey>('access');
  const [accessTab, setAccessTab] = useState<AccessTab>('check');

  // Grant-access form state (Overview pane)
  const [principalKind, setPrincipalKind] = useState<'user' | 'group'>('user');
  const [principalId, setPrincipalId] = useState('');
  const [principalLabel, setPrincipalLabel] = useState('');
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('viewer');
  const [note, setNote] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Check access state (Access > Check access pane)
  const [checkKind, setCheckKind] = useState<'user' | 'group'>('user');
  const [checkPrincipal, setCheckPrincipal] = useState<PrincipalPick | null>(null);

  async function refreshShares() {
    if (!resourceKind || !resourceId) return;
    setLoading(true);
    setError('');
    setPermissionDenied(false);
    try {
      setShares(await listResourceShares(resourceKind, resourceId));
    } catch (cause) {
      if (isPermissionDenied(cause)) {
        setPermissionDenied(true);
        setError('');
      } else {
        setError(errorMessage(cause, 'Unable to load resource access.'));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open || !resourceKind || !resourceId) {
      setShares([]);
      return;
    }
    setRail('access');
    setAccessTab('check');
    setPrincipalKind('user');
    setPrincipalId('');
    setPrincipalLabel('');
    setAccessLevel('viewer');
    setNote('');
    setExpiresAt('');
    setStatus('');
    setCheckKind('user');
    setCheckPrincipal(null);
    void refreshShares();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resourceKind, resourceId]);

  async function submitShare() {
    if (!resourceKind || !resourceId) return;
    const trimmedId = principalId.trim();
    if (!trimmedId) {
      setError('Pick a user or group first.');
      return;
    }
    setSubmitting(true);
    setError('');
    setStatus('');
    setPermissionDenied(false);
    try {
      await createShare(resourceKind, resourceId, {
        shared_with_user_id: principalKind === 'user' ? trimmedId : undefined,
        shared_with_group_id: principalKind === 'group' ? trimmedId : undefined,
        access_level: accessLevel,
        note: note.trim() || undefined,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setPrincipalId('');
      setPrincipalLabel('');
      setNote('');
      setExpiresAt('');
      setStatus('Access grant saved.');
      await refreshShares();
      onChanged?.();
    } catch (cause) {
      if (isPermissionDenied(cause)) {
        setPermissionDenied(true);
        setError('');
      } else {
        setError(errorMessage(cause, 'Unable to grant access.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke(id: string) {
    setRevokingId(id);
    setError('');
    setStatus('');
    setPermissionDenied(false);
    try {
      await revokeShare(id);
      setStatus('Access grant revoked.');
      await refreshShares();
      onChanged?.();
    } catch (cause) {
      if (isPermissionDenied(cause)) {
        setPermissionDenied(true);
        setError('');
      } else {
        setError(errorMessage(cause, 'Unable to revoke access.'));
      }
    } finally {
      setRevokingId(null);
    }
  }

  const label = resourceLabel || resourceId || 'resource';
  const hasResource = Boolean(resourceKind && resourceId);

  const breadcrumb = useMemo(() => {
    const root = 'Details';
    if (rail === 'overview') return [root, 'Overview'];
    if (rail === 'activity') return [root, 'Activity'];
    return [root, 'Access', accessTab === 'check' ? 'Check access' : 'Requirements'];
  }, [rail, accessTab]);

  return (
    <Drawer open={open} title="Resource access" width="720px" onClose={onClose}>
      <div
        style={{
          margin: '-1rem',
          height: 'calc(100% + 2rem)',
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
          background: '#0f172a',
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'grid',
            gap: 4,
            padding: '12px 16px',
            borderBottom: '1px solid #1e293b',
            background: '#0b1220',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Glyph name={resourceKind === 'dataset' ? 'database' : 'cube'} size={18} tone="#60a5fa" />
            <h2
              style={{
                margin: 0,
                color: '#f8fafc',
                fontSize: 15,
                fontWeight: 700,
                overflowWrap: 'anywhere',
                minWidth: 0,
              }}
            >
              {label}
            </h2>
          </div>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 11 }}>
            {breadcrumb.map((segment, idx) => (
              <span key={`${segment}-${idx}`}>
                {idx > 0 ? <span style={{ margin: '0 6px', color: '#475569' }}>›</span> : null}
                <span style={{ color: idx === breadcrumb.length - 1 ? '#cbd5e1' : '#94a3b8' }}>
                  {segment}
                </span>
              </span>
            ))}
          </p>
        </header>

        {/* Body: rail + content */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', minHeight: 0 }}>
          <Rail active={rail} onChange={setRail} />

          <div style={{ overflow: 'auto', padding: '14px 16px', minWidth: 0 }}>
            {!hasResource ? (
              <div
                style={{
                  border: '1px solid #334155',
                  borderRadius: 6,
                  padding: 12,
                  color: '#fca5a5',
                  fontSize: 12,
                }}
              >
                This resource cannot be checked because its workspace identifier is missing.
              </div>
            ) : null}

            {permissionDenied ? (
              <div
                style={{
                  border: '1px solid #7f1d1d',
                  background: '#450a0a',
                  borderRadius: 6,
                  padding: 12,
                  color: '#fecaca',
                  fontSize: 12,
                  marginBottom: 10,
                }}
              >
                You do not have permission to manage access for this resource.
              </div>
            ) : null}

            {error ? (
              <div
                style={{
                  border: '1px solid #7f1d1d',
                  background: '#450a0a',
                  borderRadius: 6,
                  padding: 10,
                  color: '#fecaca',
                  fontSize: 12,
                  marginBottom: 10,
                }}
              >
                {error}
              </div>
            ) : null}

            {status ? (
              <div
                style={{
                  border: '1px solid #166534',
                  background: '#052e16',
                  borderRadius: 6,
                  padding: 10,
                  color: '#bbf7d0',
                  fontSize: 12,
                  marginBottom: 10,
                }}
              >
                {status}
              </div>
            ) : null}

            {rail === 'overview' ? (
              <OverviewPane
                resourceLabel={label}
                resourceKind={resourceKind}
                resourceId={resourceId}
                ownerId={ownerId}
                projectLabel={projectLabel}
                projectMemberships={projectMemberships}
                shares={shares}
                loading={loading}
                hasResource={hasResource}
                principalKind={principalKind}
                setPrincipalKind={setPrincipalKind}
                principalId={principalId}
                principalLabel={principalLabel}
                setPrincipalId={setPrincipalId}
                setPrincipalLabel={setPrincipalLabel}
                accessLevel={accessLevel}
                setAccessLevel={setAccessLevel}
                note={note}
                setNote={setNote}
                expiresAt={expiresAt}
                setExpiresAt={setExpiresAt}
                submitting={submitting}
                onSubmit={() => void submitShare()}
                onRevoke={(id) => void revoke(id)}
                revokingId={revokingId}
                onRefresh={() => void refreshShares()}
              />
            ) : null}

            {rail === 'access' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <AccessTabs active={accessTab} onChange={setAccessTab} />
                {accessTab === 'requirements' ? (
                  <RequirementsPane
                    ownerId={ownerId}
                    projectLabel={projectLabel}
                    projectMemberships={projectMemberships}
                    shares={shares}
                    inheritedMarkings={inheritedMarkings}
                  />
                ) : (
                  <CheckAccessPane
                    checkKind={checkKind}
                    setCheckKind={setCheckKind}
                    pick={checkPrincipal}
                    setPick={setCheckPrincipal}
                    ownerId={ownerId}
                    projectLabel={projectLabel}
                    projectMemberships={projectMemberships}
                    shares={shares}
                    inheritedMarkings={inheritedMarkings}
                    lineageHref={lineageHref}
                  />
                )}
              </div>
            ) : null}

            {rail === 'activity' ? <ActivityPane shares={shares} loading={loading} /> : null}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Overview pane: existing manage-access UX (grant + access graph + shares)
// ---------------------------------------------------------------------------

interface OverviewPaneProps {
  resourceLabel: string;
  resourceKind: ResourceKind | null;
  resourceId: string | null;
  ownerId?: string | null;
  projectLabel?: string | null;
  projectMemberships: AccessGraphMembership[];
  shares: ResourceShare[];
  loading: boolean;
  hasResource: boolean;
  principalKind: 'user' | 'group';
  setPrincipalKind: (k: 'user' | 'group') => void;
  principalId: string;
  principalLabel: string;
  setPrincipalId: (v: string) => void;
  setPrincipalLabel: (v: string) => void;
  accessLevel: AccessLevel;
  setAccessLevel: (v: AccessLevel) => void;
  note: string;
  setNote: (v: string) => void;
  expiresAt: string;
  setExpiresAt: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  onRevoke: (id: string) => void;
  revokingId: string | null;
  onRefresh: () => void;
}

function OverviewPane(p: OverviewPaneProps) {
  const segmentBtn = (active: boolean): CSSProperties => ({
    border: 'none',
    background: active ? '#1d4ed8' : '#0f172a',
    color: active ? '#fff' : '#cbd5e1',
    padding: '5px 10px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  });

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Section
        title={
          <div>
            <p style={{ margin: 0, color: '#f8fafc', fontWeight: 700, fontSize: 13 }}>
              Grant access
            </p>
            <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: 11 }}>
              Direct shares are stored on the workspace resource.
            </p>
          </div>
        }
      >
        <div
          style={{
            display: 'inline-flex',
            border: '1px solid #334155',
            borderRadius: 6,
            overflow: 'hidden',
            justifySelf: 'start',
          }}
        >
          {(['user', 'group'] as const).map((kind, idx) => (
            <button
              key={kind}
              type="button"
              onClick={() => {
                p.setPrincipalKind(kind);
                p.setPrincipalId('');
                p.setPrincipalLabel('');
              }}
              style={{
                ...segmentBtn(p.principalKind === kind),
                borderRight: idx === 0 ? '1px solid #334155' : 'none',
              }}
            >
              {kind === 'user' ? 'User' : 'Group'}
            </button>
          ))}
        </div>

        <PrincipalPicker
          kind={p.principalKind}
          value={p.principalId}
          onChange={(principal) => {
            p.setPrincipalId(principal.id);
            p.setPrincipalLabel(principal.label);
          }}
        />
        {p.principalId ? (
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 11 }}>
            Selected {p.principalKind}: {p.principalLabel || p.principalId}
          </p>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
          <label style={{ display: 'grid', gap: 4, color: '#cbd5e1', fontSize: 12 }}>
            Access level
            <select
              value={p.accessLevel}
              onChange={(event) => p.setAccessLevel(event.target.value as AccessLevel)}
              className="of-input"
            >
              <option value="viewer">viewer</option>
              <option value="editor">editor</option>
              <option value="owner">owner</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, color: '#cbd5e1', fontSize: 12 }}>
            Expires
            <input
              type="datetime-local"
              value={p.expiresAt}
              onChange={(event) => p.setExpiresAt(event.target.value)}
              className="of-input"
            />
          </label>
        </div>

        <label style={{ display: 'grid', gap: 4, color: '#cbd5e1', fontSize: 12 }}>
          Note
          <input
            value={p.note}
            onChange={(event) => p.setNote(event.target.value)}
            placeholder="Reason or ticket"
            className="of-input"
          />
        </label>

        <button
          type="button"
          onClick={p.onSubmit}
          disabled={!p.hasResource || p.submitting || !p.principalId.trim()}
          className="of-button of-button--primary"
          style={{ justifySelf: 'start' }}
        >
          {p.submitting ? 'Granting...' : 'Grant access'}
        </button>
      </Section>

      <Section
        title={
          <div>
            <p style={{ margin: 0, color: '#f8fafc', fontWeight: 700, fontSize: 13 }}>Access graph</p>
            <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: 11 }}>
              Owner, inherited project roles, and direct shares.
            </p>
          </div>
        }
      >
        <AccessGraph
          resourceLabel={p.resourceLabel}
          resourceKind={p.resourceKind ?? 'resource'}
          ownerId={p.ownerId}
          projectLabel={p.projectLabel}
          projectMemberships={p.projectMemberships}
          shares={p.shares}
          loading={p.loading}
        />
      </Section>

      <Section
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ margin: 0, color: '#f8fafc', fontWeight: 700, fontSize: 13 }}>
              Direct shares ({p.shares.length})
            </p>
          </div>
        }
      >
        <button
          type="button"
          onClick={p.onRefresh}
          disabled={!p.hasResource || p.loading}
          className="of-button"
          style={{ fontSize: 11, justifySelf: 'start' }}
        >
          {p.loading ? 'Refreshing...' : 'Refresh'}
        </button>
        <div style={{ display: 'grid', gap: 6 }}>
          {p.shares.map((share) => {
            const principal =
              share.shared_with_user_id || share.shared_with_group_id || 'unknown principal';
            const principalKindLabel = share.shared_with_user_id ? 'user' : 'group';
            return (
              <div
                key={share.id}
                style={{
                  display: 'grid',
                  gap: 4,
                  border: '1px solid #334155',
                  borderRadius: 6,
                  padding: 8,
                  background: '#1e293b',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span style={{ color: '#f8fafc', fontWeight: 650, overflowWrap: 'anywhere' }}>
                    {principalKindLabel}: {principal}
                  </span>
                  <button
                    type="button"
                    onClick={() => p.onRevoke(share.id)}
                    disabled={p.revokingId === share.id}
                    className="of-button"
                    style={{ flex: '0 0 auto', fontSize: 10, color: '#fca5a5', borderColor: '#7f1d1d' }}
                  >
                    {p.revokingId === share.id ? 'Revoking...' : 'Revoke'}
                  </button>
                </div>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: 11 }}>
                  {share.access_level} access, shared by {share.sharer_id}, expires{' '}
                  {formatDate(share.expires_at)}
                </p>
                {share.note ? (
                  <p style={{ margin: 0, color: '#cbd5e1', fontSize: 11 }}>{share.note}</p>
                ) : null}
              </div>
            );
          })}
          {!p.loading && p.shares.length === 0 ? (
            <div
              style={{
                border: '1px dashed #334155',
                borderRadius: 6,
                padding: 10,
                color: '#94a3b8',
                fontSize: 12,
              }}
            >
              No direct shares yet.
            </div>
          ) : null}
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Requirements pane (static description of access requirements)
// ---------------------------------------------------------------------------

interface RequirementsPaneProps {
  ownerId?: string | null;
  projectLabel?: string | null;
  projectMemberships: AccessGraphMembership[];
  shares: ResourceShare[];
  inheritedMarkings: string[];
}

function RequirementsPane({
  ownerId,
  projectLabel,
  projectMemberships,
  shares,
  inheritedMarkings,
}: RequirementsPaneProps) {
  const userShares = shares.filter((s) => s.shared_with_user_id && !isExpired(s.expires_at)).length;
  const groupShares = shares.filter((s) => s.shared_with_group_id && !isExpired(s.expires_at)).length;
  const expiredCount = shares.filter((s) => isExpired(s.expires_at)).length;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div
        style={{
          border: '1px solid #1e293b',
          background: '#0b1220',
          borderRadius: 8,
          padding: 12,
          display: 'grid',
          gap: 8,
        }}
      >
        <Eyebrow>Access requirements</Eyebrow>
        <p style={{ margin: 0, color: '#cbd5e1', fontSize: 12 }}>
          A user meets access requirements for this resource when they satisfy <strong>any</strong>{' '}
          of the conditions below.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, color: '#e2e8f0', fontSize: 12, display: 'grid', gap: 4 }}>
          <li>
            They are the resource owner.
            {ownerId ? (
              <span style={{ color: '#94a3b8', marginLeft: 6 }}>(currently {ownerId})</span>
            ) : null}
          </li>
          <li>
            They hold a role on the parent project.
            {projectLabel ? (
              <span style={{ color: '#94a3b8', marginLeft: 6 }}>
                (project: {projectLabel}, {projectMemberships.length} member
                {projectMemberships.length === 1 ? '' : 's'})
              </span>
            ) : null}
          </li>
          <li>
            A direct share is attached to them — or to a group they belong to.
            <span style={{ color: '#94a3b8', marginLeft: 6 }}>
              ({userShares} user share{userShares === 1 ? '' : 's'}, {groupShares} group share
              {groupShares === 1 ? '' : 's'}
              {expiredCount > 0 ? `, ${expiredCount} expired` : ''})
            </span>
          </li>
        </ul>
      </div>

      <div
        style={{
          border: '1px solid #1e293b',
          background: '#0b1220',
          borderRadius: 8,
          padding: 12,
          display: 'grid',
          gap: 8,
        }}
      >
        <Eyebrow>Additional data requirements</Eyebrow>
        {inheritedMarkings.length > 0 ? (
          <>
            <p style={{ margin: 0, color: '#cbd5e1', fontSize: 12 }}>
              Inherited markings · <strong>All of</strong>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {inheritedMarkings.map((m) => (
                <MarkingChip key={m} label={m} />
              ))}
            </div>
          </>
        ) : (
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>
            No inherited markings are attached. Data classification policies will appear here when
            configured at the project or organization level.
          </p>
        )}
      </div>

      <p style={{ margin: 0, color: '#94a3b8', fontSize: 11, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <Glyph name="info" size={14} />
        <span>
          Information displayed is dependent on your access level. Switch to <strong>Check access</strong>{' '}
          to verify a specific user or group.
        </span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Check access pane (Foundry's headline view)
// ---------------------------------------------------------------------------

interface CheckAccessPaneProps {
  checkKind: 'user' | 'group';
  setCheckKind: (k: 'user' | 'group') => void;
  pick: PrincipalPick | null;
  setPick: (p: PrincipalPick | null) => void;
  ownerId?: string | null;
  projectLabel?: string | null;
  projectMemberships: AccessGraphMembership[];
  shares: ResourceShare[];
  inheritedMarkings: string[];
  lineageHref?: string;
}

function CheckAccessPane({
  checkKind,
  setCheckKind,
  pick,
  setPick,
  ownerId,
  projectLabel,
  projectMemberships,
  shares,
  inheritedMarkings,
  lineageHref,
}: CheckAccessPaneProps) {
  const analysis = useMemo(() => {
    if (!pick) return null;
    return analyzeAccess({
      principalKind: checkKind,
      principalId: pick.id,
      profile: pick.profile,
      group: pick.group,
      ownerId,
      projectMemberships,
      shares,
      projectLabel,
    });
  }, [pick, checkKind, ownerId, projectMemberships, shares, projectLabel]);

  const dataReqsMet = inheritedMarkings.length === 0 ? true : false;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Principal selector */}
      <div style={{ display: 'grid', gap: 8 }}>
        <div
          style={{
            display: 'inline-flex',
            border: '1px solid #334155',
            borderRadius: 6,
            overflow: 'hidden',
            justifySelf: 'start',
          }}
        >
          {(['user', 'group'] as const).map((kind, idx) => (
            <button
              key={kind}
              type="button"
              onClick={() => {
                setCheckKind(kind);
                setPick(null);
              }}
              style={{
                border: 'none',
                background: checkKind === kind ? '#1d4ed8' : '#0f172a',
                color: checkKind === kind ? '#fff' : '#cbd5e1',
                padding: '5px 10px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                borderRight: idx === 0 ? '1px solid #334155' : 'none',
              }}
            >
              {kind === 'user' ? 'User' : 'Group'}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative' }}>
          <PrincipalPicker
            kind={checkKind}
            value={pick?.id ?? ''}
            onChange={(principal) => setPick(principal)}
            placeholder={checkKind === 'user' ? 'Select a user…' : 'Select a group…'}
          />
          <span
            style={{
              position: 'absolute',
              top: -10,
              right: 6,
              background: '#0e7490',
              color: '#cffafe',
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              borderRadius: 999,
              padding: '2px 8px',
              border: '1px solid #155e75',
            }}
          >
            New
          </span>
        </div>
      </div>

      {!pick ? (
        <div
          style={{
            border: '1px dashed #334155',
            borderRadius: 8,
            padding: 28,
            color: '#94a3b8',
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          Select a {checkKind} to check if they meet access requirements for this file.
        </div>
      ) : null}

      {pick && analysis ? (
        <>
          {/* Principal card */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              border: '1px solid #1e293b',
              background: '#0b1220',
              borderRadius: 8,
              padding: 10,
            }}
          >
            <div
              aria-hidden
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                background: '#1d4ed8',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 13,
                flex: '0 0 auto',
              }}
            >
              {initialsOf(pick.label)}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, color: '#60a5fa', fontWeight: 700, fontSize: 13, overflowWrap: 'anywhere' }}>
                {pick.label}
              </p>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: 11, overflowWrap: 'anywhere' }}>
                ({pick.sublabel || pick.id})
              </p>
            </div>
            {analysis.highest ? (
              <span
                style={{
                  marginLeft: 'auto',
                  border: `1px solid ${ACCESS_TONE[analysis.highest].border}`,
                  background: ACCESS_TONE[analysis.highest].bg,
                  color: ACCESS_TONE[analysis.highest].text,
                  borderRadius: 999,
                  padding: '2px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {analysis.highest}
              </span>
            ) : null}
          </div>

          {/* Access requirements */}
          <div
            style={{
              border: '1px solid #1e293b',
              background: '#0b1220',
              borderRadius: 8,
              padding: 12,
              display: 'grid',
              gap: 10,
            }}
          >
            <Eyebrow>Access requirements</Eyebrow>
            <StatusBadge
              ok={analysis.requirementsMet}
              label={
                analysis.requirementsMet
                  ? `This ${checkKind} meets access requirements for this file.`
                  : `This ${checkKind} does not meet access requirements for this file.`
              }
            />

            <div style={{ display: 'grid', gap: 6 }}>
              <Eyebrow>
                Organizations <span style={{ color: '#64748b' }}>· Any of</span>
              </Eyebrow>
              {analysis.organizations.length === 0 ? (
                <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>
                  {checkKind === 'group'
                    ? 'Group memberships are not bound to a single organization.'
                    : 'No organization is associated with this user.'}
                </p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
                  {analysis.organizations.map((org) => (
                    <li key={org} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <TinyCheck ok />
                      <Glyph name="folder" size={14} tone="#60a5fa" />
                      <span style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>{org}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <Eyebrow>Roles</Eyebrow>
              {analysis.roles.length === 0 ? (
                <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>
                  No matching role found via owner, project, or shares.
                </p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                  {analysis.roles.map((role, idx) => (
                    <li key={`${role.level}-${role.via}-${idx}`} style={{ display: 'grid', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TinyCheck ok />
                        <span style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 700 }}>
                          {role.level}
                        </span>
                        <span style={{ color: '#94a3b8', fontSize: 11 }}>(via {role.via.split('·')[0].trim()})</span>
                      </div>
                      <p style={{ margin: '0 0 0 24px', color: '#94a3b8', fontSize: 11 }}>{role.via}</p>
                    </li>
                  ))}
                </ul>
              )}
              {analysis.expiredShares > 0 ? (
                <p style={{ margin: 0, color: '#fca5a5', fontSize: 11 }}>
                  {analysis.expiredShares} expired share{analysis.expiredShares === 1 ? '' : 's'} ignored.
                </p>
              ) : null}
            </div>
          </div>

          {/* Additional data requirements */}
          <div
            style={{
              border: '1px solid #1e293b',
              background: '#0b1220',
              borderRadius: 8,
              padding: 12,
              display: 'grid',
              gap: 10,
            }}
          >
            <Eyebrow>Additional data requirements</Eyebrow>
            <StatusBadge
              ok={dataReqsMet}
              label={
                dataReqsMet
                  ? `This ${checkKind} meets additional data requirements for this file.`
                  : `This ${checkKind} does not meet additional data requirements for this file.`
              }
            />
            {inheritedMarkings.length > 0 ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <Eyebrow>
                  Inherited markings <span style={{ color: '#64748b' }}>· All of</span>
                </Eyebrow>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <TinyCheck ok={false} />
                  {inheritedMarkings.map((m) => (
                    <MarkingChip key={m} label={m} />
                  ))}
                </div>
              </div>
            ) : (
              <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>
                No inherited markings are attached.
              </p>
            )}
          </div>

          <p
            style={{
              margin: 0,
              color: '#94a3b8',
              fontSize: 11,
              display: 'flex',
              gap: 6,
              alignItems: 'flex-start',
            }}
          >
            <Glyph name="info" size={14} />
            <span>Information displayed is dependent on your access level.</span>
          </p>

          {lineageHref ? (
            <a
              href={lineageHref}
              style={{
                color: '#60a5fa',
                fontSize: 12,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                textDecoration: 'none',
                justifySelf: 'start',
              }}
            >
              Explore data lineage
              <Glyph name="external-link" size={14} />
            </a>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity pane (chronological list of share grants/revokes)
// ---------------------------------------------------------------------------

function ActivityPane({ shares, loading }: { shares: ResourceShare[]; loading: boolean }) {
  const events = useMemo(() => {
    return [...shares].sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return tb - ta;
    });
  }, [shares]);

  if (loading) {
    return (
      <div
        style={{
          border: '1px dashed #334155',
          borderRadius: 8,
          padding: 18,
          color: '#94a3b8',
          fontSize: 12,
        }}
      >
        Loading activity…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div
        style={{
          border: '1px dashed #334155',
          borderRadius: 8,
          padding: 18,
          color: '#94a3b8',
          fontSize: 12,
        }}
      >
        No activity yet. Sharing this resource will produce a record here.
      </div>
    );
  }

  return (
    <ol
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'grid',
        gap: 8,
      }}
    >
      {events.map((event) => {
        const principal =
          event.shared_with_user_id || event.shared_with_group_id || 'unknown principal';
        const principalKind = event.shared_with_user_id ? 'user' : 'group';
        const expired = isExpired(event.expires_at);
        return (
          <li
            key={event.id}
            style={{
              border: '1px solid #1e293b',
              background: '#0b1220',
              borderRadius: 8,
              padding: 10,
              display: 'grid',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Glyph name="add-user" size={14} tone="#60a5fa" />
              <span style={{ color: '#f8fafc', fontSize: 12, fontWeight: 700 }}>
                Granted {event.access_level} to {principalKind}
              </span>
              <span
                style={{
                  border: `1px solid ${ACCESS_TONE[event.access_level].border}`,
                  background: ACCESS_TONE[event.access_level].bg,
                  color: ACCESS_TONE[event.access_level].text,
                  borderRadius: 999,
                  padding: '1px 7px',
                  fontSize: 10,
                  fontWeight: 700,
                  marginLeft: 'auto',
                }}
              >
                {event.access_level}
              </span>
            </div>
            <p style={{ margin: 0, color: '#cbd5e1', fontSize: 11, overflowWrap: 'anywhere' }}>
              {principal}
            </p>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 11 }}>
              by {event.sharer_id} · {formatDate(event.created_at)}
              {event.expires_at
                ? ` · ${expired ? 'expired' : 'expires'} ${formatDate(event.expires_at)}`
                : ''}
            </p>
            {event.note ? (
              <p style={{ margin: 0, color: '#cbd5e1', fontSize: 11 }}>{event.note}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

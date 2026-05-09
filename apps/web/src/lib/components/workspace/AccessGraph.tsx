import type { AccessLevel, ResourceShare } from '@/lib/api/workspace';

export interface AccessGraphMembership {
  user_id: string;
  role: AccessLevel;
}

interface AccessGraphProps {
  resourceLabel: string;
  resourceKind: string;
  ownerId?: string | null;
  projectLabel?: string | null;
  projectMemberships?: AccessGraphMembership[];
  shares: ResourceShare[];
  loading?: boolean;
}

interface AccessEntry {
  id: string;
  principal: string;
  principalKind: 'user' | 'group' | 'owner';
  accessLevel: AccessLevel;
  source: string;
  expired?: boolean;
}

const ACCESS_TONE: Record<AccessLevel, { bg: string; border: string; text: string }> = {
  viewer: { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
  editor: { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
  owner: { bg: '#fef3c7', border: '#fde68a', text: '#92400e' },
};

function isExpired(value: string | null) {
  return Boolean(value && new Date(value).getTime() <= Date.now());
}

function principalFromShare(share: ResourceShare) {
  if (share.shared_with_user_id) {
    return { principal: share.shared_with_user_id, principalKind: 'user' as const };
  }
  return { principal: share.shared_with_group_id ?? 'unknown group', principalKind: 'group' as const };
}

export function AccessGraph({
  resourceLabel,
  resourceKind,
  ownerId,
  projectLabel,
  projectMemberships = [],
  shares,
  loading = false,
}: AccessGraphProps) {
  const entries: AccessEntry[] = [
    ...(ownerId
      ? [{
          id: `owner-${ownerId}`,
          principal: ownerId,
          principalKind: 'owner' as const,
          accessLevel: 'owner' as const,
          source: 'Resource owner',
        }]
      : []),
    ...projectMemberships.map((member) => ({
      id: `project-${member.user_id}`,
      principal: member.user_id,
      principalKind: 'user' as const,
      accessLevel: member.role,
      source: projectLabel ? `Project membership: ${projectLabel}` : 'Project membership',
    })),
    ...shares.map((share) => {
      const principal = principalFromShare(share);
      return {
        id: `share-${share.id}`,
        principal: principal.principal,
        principalKind: principal.principalKind,
        accessLevel: share.access_level,
        source: share.note ? `Direct share: ${share.note}` : 'Direct share',
        expired: isExpired(share.expires_at),
      };
    }),
  ];

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.9fr) 32px minmax(0, 1.1fr)', gap: 8, alignItems: 'center' }}>
        <div
          style={{
            border: '1px solid #334155',
            background: '#111827',
            borderRadius: 6,
            padding: 10,
            minWidth: 0,
          }}
        >
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 11 }}>{resourceKind}</p>
          <p style={{ margin: '4px 0 0', color: '#f8fafc', fontWeight: 700, overflowWrap: 'anywhere' }}>
            {resourceLabel}
          </p>
        </div>
        <div aria-hidden="true" style={{ height: 1, background: '#475569' }} />
        <div style={{ display: 'grid', gap: 6 }}>
          {loading ? (
            <div style={{ border: '1px dashed #334155', borderRadius: 6, padding: 10, color: '#94a3b8', fontSize: 12 }}>
              Checking access...
            </div>
          ) : null}
          {!loading && entries.length === 0 ? (
            <div style={{ border: '1px dashed #334155', borderRadius: 6, padding: 10, color: '#94a3b8', fontSize: 12 }}>
              No explicit access grants are attached to this resource.
            </div>
          ) : null}
          {entries.map((entry) => {
            const tone = ACCESS_TONE[entry.accessLevel];
            return (
              <div
                key={entry.id}
                style={{
                  display: 'grid',
                  gap: 4,
                  border: '1px solid #334155',
                  background: entry.expired ? '#111827' : '#1e293b',
                  borderRadius: 6,
                  padding: 8,
                  opacity: entry.expired ? 0.62 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ color: '#f8fafc', fontWeight: 650, overflowWrap: 'anywhere', minWidth: 0 }}>
                    {entry.principal}
                  </span>
                  <span
                    style={{
                      flex: '0 0 auto',
                      border: `1px solid ${tone.border}`,
                      background: tone.bg,
                      color: tone.text,
                      borderRadius: 999,
                      padding: '1px 7px',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {entry.accessLevel}
                  </span>
                </div>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: 11 }}>
                  {entry.principalKind}
                  {' via '}
                  {entry.source}
                  {entry.expired ? ' (expired)' : ''}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

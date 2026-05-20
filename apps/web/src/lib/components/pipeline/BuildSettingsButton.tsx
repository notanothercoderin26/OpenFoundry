import { useEffect, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import { listComputeProfiles, type ComputeProfile } from '@/lib/api/pipelines';

interface BuildSettingsButtonProps {
  selectedSlug: string | null;
  busy?: boolean;
  onSelect: (slug: string | null) => void;
}

export function BuildSettingsButton({ selectedSlug, busy, onSelect }: BuildSettingsButtonProps) {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<ComputeProfile[] | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!open || profiles !== null) return;
    let cancelled = false;
    void listComputeProfiles()
      .then((response) => {
        if (!cancelled) setProfiles(response.items);
      })
      .catch((cause) => {
        if (!cancelled) {
          setLoadError(cause instanceof Error ? cause.message : 'Failed to load compute profiles');
          setProfiles([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, profiles]);

  const activeLabel = profiles?.find((entry) => entry.slug === selectedSlug)?.display_name
    ?? profiles?.find((entry) => entry.is_default)?.display_name
    ?? 'Default';

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={busy}
        className="of-button"
        title="Build settings"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Glyph name="settings" size={12} /> Build settings
        <span className="of-text-muted" style={{ marginLeft: 4, fontSize: 11 }}>· {activeLabel}</span>
      </button>
      {open && (
        <>
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
          />
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              minWidth: 320,
              background: '#fff',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.16)',
              padding: 8,
              zIndex: 41,
              display: 'grid',
              gap: 4,
            }}
          >
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', padding: '0 4px' }}>
              COMPUTE PROFILE
            </p>
            {profiles === null && (
              <p className="of-text-muted" style={{ fontSize: 12, padding: 6 }}>Loading…</p>
            )}
            {loadError && (
              <p className="of-status-danger" style={{ fontSize: 12, padding: 6 }}>{loadError}</p>
            )}
            {profiles?.map((profile) => {
              const active = profile.slug === selectedSlug
                || (!selectedSlug && profile.is_default);
              return (
                <button
                  key={profile.slug}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  disabled={busy}
                  onClick={() => {
                    onSelect(profile.is_default && !selectedSlug ? null : profile.slug);
                    setOpen(false);
                  }}
                  className="of-button"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: 8,
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    padding: 8,
                    background: active ? '#eff6ff' : 'transparent',
                    border: `1px solid ${active ? '#2d72d2' : 'transparent'}`,
                  }}
                >
                  <span aria-hidden style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    border: `2px solid ${active ? '#2d72d2' : '#cbd5e1'}`,
                    display: 'inline-block',
                    background: active ? 'radial-gradient(circle, #2d72d2 0 4px, #fff 4px 100%)' : 'transparent',
                  }} />
                  <div style={{ display: 'grid', gap: 2 }}>
                    <strong style={{ fontSize: 13 }}>{profile.display_name}</strong>
                    <span className="of-text-muted" style={{ fontSize: 11 }}>{profile.description}</span>
                  </div>
                  <span className="of-chip" style={{ fontSize: 10 }}>
                    {profile.executor_cores} core{profile.executor_cores === 1 ? '' : 's'} · {profile.executor_memory_gb} GiB
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

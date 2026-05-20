import { useEffect, useMemo, useState } from 'react';

import { getScopedSessionOptions, type ScopedSessionOptionsResponse } from '@/lib/api/auth';
import { auth, useAuth } from '@stores/auth';

const NO_SCOPED_SESSION = '__no_scoped_session__';

export function ScopedSessionBanner() {
  const { user } = useAuth();
  const [options, setOptions] = useState<ScopedSessionOptionsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      setOptions(null);
      return;
    }
    let cancelled = false;
    getScopedSessionOptions()
      .then((resp) => {
        if (!cancelled) {
          setOptions(resp);
          setError('');
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Failed to load scoped sessions');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.session_scope]);

  const selectablePresets = useMemo(
    () => options?.presets?.filter((preset) => preset.selectable) ?? [],
    [options],
  );
  if (!options?.enabled) return null;

  const active = options.active_scoped_session ?? null;
  const mustChoose = !active && !options.no_scoped_session_available && selectablePresets.length > 0;
  const shouldShow =
    options.always_show_selector ||
    Boolean(active) ||
    mustChoose ||
    options.no_scoped_session_available ||
    selectablePresets.length > 1;
  if (!shouldShow) return null;

  const value = active?.id ?? NO_SCOPED_SESSION;

  async function onChange(nextValue: string) {
    if (!options || nextValue === value) return;
    setBusy(true);
    setError('');
    try {
      await auth.switchScopedSession(nextValue === NO_SCOPED_SESSION ? null : nextValue);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to switch scoped session');
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '8px 18px',
        borderBottom: '1px solid var(--border-subtle)',
        background: '#f8fafc',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
        <strong style={{ color: 'var(--text-default)' }}>
          {active ? active.name : mustChoose ? 'Choose scoped session' : 'No scoped session'}
        </strong>
        {(active?.allowed_markings ?? options.full_allowed_markings).slice(0, 4).map((marking) => (
          <span key={marking} className="of-chip" style={{ fontSize: 11 }}>
            {marking}
          </span>
        ))}
        {error ? <span style={{ color: '#b91c1c' }}>{error}</span> : null}
      </div>
      <select
        className="of-input"
        value={value}
        disabled={busy}
        onChange={(event) => void onChange(event.target.value)}
        style={{ width: 260, minHeight: 30, fontSize: 12 }}
        aria-label="Scoped session"
      >
        {options.no_scoped_session_available ? (
          <option value={NO_SCOPED_SESSION}>No scoped session</option>
        ) : null}
        {selectablePresets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name}
          </option>
        ))}
      </select>
    </div>
  );
}

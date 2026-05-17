import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { listGroups, type GroupRecord } from '@/lib/api/auth';
import { getControlPanel, updateControlPanel, type ScopedSessionConfig, type ScopedSessionPreset } from '@/lib/api/control-panel';
import { listMarkingCategories, listMarkingsForCategory, type MarkingResponse } from '@/lib/api/marking-categories';

const EMPTY_CONFIG: ScopedSessionConfig = {
  enabled: false,
  allow_no_scoped_session: true,
  always_show_selector: false,
  allowed_bypass_groups: [],
  presets: [],
};

function splitList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function joinList(values: string[] | undefined) {
  return (values ?? []).join(', ');
}

function newPreset(index: number): ScopedSessionPreset {
  return {
    id: `session-${index}`,
    name: `Session ${index}`,
    description: '',
    required_markings: ['public'],
    allowed_markings: ['public'],
    enabled: true,
  };
}

export function ScopedSessionsPage() {
  const [config, setConfig] = useState<ScopedSessionConfig>(EMPTY_CONFIG);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [markings, setMarkings] = useState<MarkingResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [settings, groupRows, categoryResp] = await Promise.all([
          getControlPanel(),
          listGroups({ limit: 500 }).catch(() => [] as GroupRecord[]),
          listMarkingCategories(true).catch(() => ({ items: [] })),
        ]);
        if (cancelled) return;
        setConfig(settings.scoped_sessions ?? EMPTY_CONFIG);
        setGroups(groupRows);
        const markingRows = await Promise.all(
          categoryResp.items.map((category) => listMarkingsForCategory(category.id, true).catch(() => ({ items: [] }))),
        );
        if (!cancelled) {
          setMarkings(markingRows.flatMap((row) => row.items));
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Failed to load scoped sessions');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const bypassGroups = useMemo(() => joinList(config.allowed_bypass_groups), [config.allowed_bypass_groups]);

  function patchConfig(patch: Partial<ScopedSessionConfig>) {
    setConfig((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  }

  function patchPreset(index: number, patch: Partial<ScopedSessionPreset>) {
    setConfig((prev) => ({
      ...prev,
      presets: prev.presets.map((preset, current) => (current === index ? { ...preset, ...patch } : preset)),
    }));
    setSaved(false);
  }

  function removePreset(index: number) {
    setConfig((prev) => ({ ...prev, presets: prev.presets.filter((_, current) => current !== index) }));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const savedSettings = await updateControlPanel({ scoped_sessions: config });
      setConfig(savedSettings.scoped_sessions ?? EMPTY_CONFIG);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="of-page" style={{ padding: 24, display: 'grid', gap: 16 }}>
      <Link to="/control-panel" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        Back to Control Panel
      </Link>

      <header>
        <h1 className="of-heading-xl">Scoped sessions</h1>
        <p className="of-text-muted" style={{ marginTop: 4 }}>
          Organization session presets backed by marking membership.
        </p>
      </header>

      {error ? (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      ) : null}
      {saved ? (
        <div className="of-status-success" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          Saved
        </div>
      ) : null}
      {loading ? <p className="of-text-muted">Loading...</p> : null}

      {!loading ? (
        <>
          <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
            <p className="of-eyebrow">Configuration</p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={config.enabled} onChange={(event) => patchConfig({ enabled: event.target.checked })} />
                Enabled
              </label>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={config.allow_no_scoped_session}
                  onChange={(event) => patchConfig({ allow_no_scoped_session: event.target.checked })}
                />
                No scoped session bypass
              </label>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={config.always_show_selector}
                  onChange={(event) => patchConfig({ always_show_selector: event.target.checked })}
                />
                Always show selector
              </label>
            </div>
            <label style={{ fontSize: 13 }}>
              Allowed bypass groups
              <input
                className="of-input"
                value={bypassGroups}
                onChange={(event) => patchConfig({ allowed_bypass_groups: splitList(event.target.value) })}
                placeholder="security-admins, data-governance"
                style={{ marginTop: 4 }}
              />
            </label>
            {groups.length > 0 ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {groups.slice(0, 16).map((group) => (
                  <span key={group.id} className="of-chip" style={{ fontSize: 11 }}>
                    {group.name}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Presets</p>
              <button
                type="button"
                className="of-button"
                onClick={() => patchConfig({ presets: [...config.presets, newPreset(config.presets.length + 1)] })}
              >
                Add preset
              </button>
            </div>
            {config.presets.length === 0 ? <p className="of-text-muted">No presets configured.</p> : null}
            <div style={{ display: 'grid', gap: 10 }}>
              {config.presets.map((preset, index) => (
                <article key={`${preset.id}:${index}`} className="of-panel" style={{ padding: 12, display: 'grid', gap: 10 }}>
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    <label style={{ fontSize: 13 }}>
                      Stable ID
                      <input className="of-input" value={preset.id} onChange={(event) => patchPreset(index, { id: event.target.value })} style={{ marginTop: 4 }} />
                    </label>
                    <label style={{ fontSize: 13 }}>
                      Name
                      <input className="of-input" value={preset.name} onChange={(event) => patchPreset(index, { name: event.target.value })} style={{ marginTop: 4 }} />
                    </label>
                    <label style={{ fontSize: 13 }}>
                      Description
                      <input className="of-input" value={preset.description ?? ''} onChange={(event) => patchPreset(index, { description: event.target.value })} style={{ marginTop: 4 }} />
                    </label>
                  </div>
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                    <label style={{ fontSize: 13 }}>
                      Required markings
                      <input
                        className="of-input"
                        value={joinList(preset.required_markings)}
                        onChange={(event) => patchPreset(index, { required_markings: splitList(event.target.value) })}
                        style={{ marginTop: 4 }}
                      />
                    </label>
                    <label style={{ fontSize: 13 }}>
                      Active markings
                      <input
                        className="of-input"
                        value={joinList(preset.allowed_markings)}
                        onChange={(event) => patchPreset(index, { allowed_markings: splitList(event.target.value) })}
                        style={{ marginTop: 4 }}
                      />
                    </label>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" checked={preset.enabled} onChange={(event) => patchPreset(index, { enabled: event.target.checked })} />
                      Enabled
                    </label>
                    <button type="button" className="of-button of-button--ghost" onClick={() => removePreset(index)}>
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">Known markings</p>
            {markings.length === 0 ? <p className="of-text-muted">No markings visible to this admin session.</p> : null}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {markings.map((marking) => (
                <span key={marking.id} className="of-chip" style={{ fontSize: 11 }}>
                  {marking.display_name} - {marking.id}
                </span>
              ))}
            </div>
          </section>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="of-button of-button--primary" onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving...' : 'Save scoped sessions'}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

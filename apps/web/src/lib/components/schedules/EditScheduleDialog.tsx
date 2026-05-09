import { useEffect, useMemo, useState } from 'react';

import {
  patchSchedule,
  type CronFlavor,
  type Schedule,
  type ScheduleTarget,
  type TimeTrigger,
  type Trigger,
} from '@/lib/api/schedules';
import { ScheduleConfig } from '@/lib/components/pipeline/ScheduleConfig';
import type { PipelineScheduleConfig } from '@/lib/api/pipelines';

interface EditScheduleDialogProps {
  schedule: Schedule | null;
  open: boolean;
  onClose: () => void;
  onSaved: (schedule: Schedule) => void;
}

interface RetryPolicy {
  max_attempts: number;
  retry_on_failure: boolean;
  allow_partial_reexecution: boolean;
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  max_attempts: 3,
  retry_on_failure: true,
  allow_partial_reexecution: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getTimeTrigger(trigger: Trigger): TimeTrigger | null {
  if ('time' in trigger.kind) return trigger.kind.time;
  return null;
}

function scheduleToConfig(schedule: Schedule): PipelineScheduleConfig {
  const time = getTimeTrigger(schedule.trigger);
  return {
    enabled: !schedule.paused,
    cron: time?.cron ?? '0 * * * *',
  };
}

function findRetryPolicy(target: ScheduleTarget): RetryPolicy {
  for (const value of Object.values(target.kind)) {
    if (!isRecord(value) || !isRecord(value.retry_policy)) continue;
    const retry = value.retry_policy;
    return {
      max_attempts: Number(retry.max_attempts ?? DEFAULT_RETRY_POLICY.max_attempts),
      retry_on_failure: Boolean(retry.retry_on_failure ?? DEFAULT_RETRY_POLICY.retry_on_failure),
      allow_partial_reexecution: Boolean(
        retry.allow_partial_reexecution ?? DEFAULT_RETRY_POLICY.allow_partial_reexecution,
      ),
    };
  }
  return DEFAULT_RETRY_POLICY;
}

function withRetryPolicy(target: ScheduleTarget, retryPolicy: RetryPolicy): ScheduleTarget {
  const entries = Object.entries(target.kind);
  if (entries.length === 0) return target;

  const [kind, value] = entries[0];
  if (!isRecord(value)) return target;

  return {
    ...target,
    kind: {
      ...target.kind,
      [kind]: {
        ...value,
        retry_policy: retryPolicy,
      },
    },
  };
}

function buildTimeTrigger(
  previous: Trigger,
  config: PipelineScheduleConfig,
  timeZone: string,
  flavor: CronFlavor,
): Trigger {
  const existing = getTimeTrigger(previous);
  return {
    kind: {
      time: {
        cron: config.cron?.trim() || existing?.cron || '0 * * * *',
        time_zone: timeZone.trim() || existing?.time_zone || 'UTC',
        flavor,
      },
    },
  };
}

export function EditScheduleDialog({ schedule, open, onClose, onSaved }: EditScheduleDialogProps) {
  const initialConfig = useMemo(
    () => (schedule ? scheduleToConfig(schedule) : { enabled: false, cron: '0 * * * *' }),
    [schedule],
  );
  const initialTime = schedule ? getTimeTrigger(schedule.trigger) : null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState<PipelineScheduleConfig>(initialConfig);
  const [timeZone, setTimeZone] = useState('UTC');
  const [flavor, setFlavor] = useState<CronFlavor>('UNIX_5');
  const [retryPolicy, setRetryPolicy] = useState<RetryPolicy>(DEFAULT_RETRY_POLICY);
  const [changeComment, setChangeComment] = useState('Updated schedule configuration');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!schedule || !open) return;
    const time = getTimeTrigger(schedule.trigger);
    setName(schedule.name);
    setDescription(schedule.description);
    setConfig(scheduleToConfig(schedule));
    setTimeZone(time?.time_zone ?? 'UTC');
    setFlavor(time?.flavor ?? 'UNIX_5');
    setRetryPolicy(findRetryPolicy(schedule.target));
    setChangeComment('Updated schedule configuration');
    setError(null);
    setBusy(false);
  }, [open, schedule]);

  useEffect(() => {
    if (!open) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [busy, onClose, open]);

  if (!open || !schedule) return null;

  async function save() {
    if (!schedule) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await patchSchedule(schedule.rid, {
        name: name.trim() || schedule.name,
        description,
        trigger: buildTimeTrigger(schedule.trigger, config, timeZone, flavor),
        target: withRetryPolicy(schedule.target, retryPolicy),
        paused: !config.enabled,
        change_comment: changeComment.trim() || undefined,
      });
      onSaved(updated);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to update schedule');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-schedule-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(17, 24, 39, 0.48)',
        padding: 16,
      }}
    >
      <section className="of-panel" style={{ width: 'min(760px, 100%)', maxHeight: 'calc(100vh - 32px)', overflow: 'auto' }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            borderBottom: '1px solid var(--border-default)',
            padding: '14px 16px',
          }}
        >
          <div>
            <h2 id="edit-schedule-title" className="of-heading-md" style={{ margin: 0 }}>
              Edit schedule
            </h2>
            <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              <code>{schedule.rid}</code>
            </p>
          </div>
          <button type="button" className="of-button of-button--ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
        </header>

        <div style={{ display: 'grid', gap: 14, padding: 16 }}>
          {error && (
            <div role="alert" className="of-status-danger" style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)' }}>
              {error}
            </div>
          )}

          {!initialTime && (
            <div className="of-status-info" style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
              This schedule currently uses an event or compound trigger. Saving from this dialog will convert it to a time trigger.
            </div>
          )}

          <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              <span className="of-eyebrow">Name</span>
              <input className="of-input" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              <span className="of-eyebrow">Time zone</span>
              <input className="of-input" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} disabled={busy} />
            </label>
          </section>

          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            <span className="of-eyebrow">Description</span>
            <textarea
              className="of-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              style={{ minHeight: 72 }}
            />
          </label>

          <section style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <h3 className="of-heading-sm" style={{ margin: 0 }}>
                Schedule config
              </h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                Cron flavor
                <select
                  className="of-select"
                  value={flavor}
                  onChange={(e) => setFlavor(e.target.value as CronFlavor)}
                  disabled={busy}
                  style={{ width: 120 }}
                >
                  <option value="UNIX_5">UNIX_5</option>
                  <option value="QUARTZ_6">QUARTZ_6</option>
                </select>
              </label>
            </div>
            <ScheduleConfig config={config} onChange={setConfig} />
          </section>

          <section className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 10 }}>
            <h3 className="of-heading-sm" style={{ margin: 0 }}>
              Retry policy
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: 12, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                <span className="of-eyebrow">Max attempts</span>
                <input
                  className="of-input"
                  type="number"
                  min={1}
                  max={10}
                  value={retryPolicy.max_attempts}
                  onChange={(e) => setRetryPolicy((current) => ({ ...current, max_attempts: Number(e.target.value) || 1 }))}
                  disabled={busy}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={retryPolicy.retry_on_failure}
                  onChange={(e) => setRetryPolicy((current) => ({ ...current, retry_on_failure: e.target.checked }))}
                  disabled={busy}
                />
                Retry on failure
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={retryPolicy.allow_partial_reexecution}
                  onChange={(e) => setRetryPolicy((current) => ({ ...current, allow_partial_reexecution: e.target.checked }))}
                  disabled={busy}
                />
                Partial re-execution
              </label>
            </div>
          </section>

          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            <span className="of-eyebrow">Change comment</span>
            <input className="of-input" value={changeComment} onChange={(e) => setChangeComment(e.target.value)} disabled={busy} />
          </label>
        </div>

        <footer
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            borderTop: '1px solid var(--border-default)',
            padding: '12px 16px',
          }}
        >
          <button type="button" className="of-button of-button--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="of-button of-button--primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving...' : 'Save schedule'}
          </button>
        </footer>
      </section>
    </div>
  );
}

// B06 §AC#5 — Data Health check-event timeline.
//
// Sibling component to ResourceHealthChecksPanel (which renders the
// snapshot view from dataset-versioning-service). This panel reads the
// per-check evaluation history from pipeline-build-service:
//   - "Latest per check" rolls up the most recent event per check_name
//     into a status grid (the dataset's current state).
//   - "Recent events" is a chronological feed showing each evaluation,
//     including PASS rows so the operator can confirm a flapping
//     check stabilised.
//
// Renders nothing when the fetch fails or returns no rows — the
// existing HealthTab content already provides a fallback message.

import { useQuery } from '@tanstack/react-query';

import {
  getDatasetHealthEvents,
  type DatasetHealthEvent,
  type HealthSeverity,
  type HealthStatus,
} from '@/lib/api/datasetHealthEvents';

const STATUS_TONE: Record<HealthStatus, string> = {
  passing: 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40',
  degraded: 'bg-rose-500/20 text-rose-200 ring-rose-400/40',
};

const SEVERITY_TONE: Record<HealthSeverity, string> = {
  info: 'text-slate-400',
  warning: 'text-amber-300',
  error: 'text-rose-300',
  critical: 'text-rose-200 font-semibold',
};

export interface CheckEventsPanelProps {
  datasetRid: string;
}

export function CheckEventsPanel({ datasetRid }: CheckEventsPanelProps) {
  const result = useQuery({
    queryKey: ['dataset-health-events', datasetRid],
    queryFn: () => getDatasetHealthEvents(datasetRid, 50),
    refetchInterval: 30_000,
  });

  if (result.isLoading) {
    return <p className="text-sm text-slate-400">Loading check evaluations…</p>;
  }
  if (result.isError || !result.data) {
    return null;
  }
  const { overall, latest_per_check, recent_events } = result.data;
  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h3 className="text-base font-medium text-slate-100">Check evaluations</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS_TONE[overall]}`}>
          {overall === 'passing' ? 'All checks passing' : 'Degraded'}
        </span>
      </header>

      {latest_per_check.length > 0 ? (
        <div>
          <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Latest per check</div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {latest_per_check.map((e) => (
              <li key={e.check_name} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-200">{e.check_name}</span>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[e.status]}`}>
                    {e.status}
                  </span>
                </div>
                <MetricLine event={e} />
                {e.message ? (
                  <p className={`mt-1 text-xs ${SEVERITY_TONE[e.severity]}`}>{e.message}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {recent_events.length > 0 ? (
        <div>
          <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Recent events</div>
          <ul className="space-y-1">
            {recent_events.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">{new Date(e.evaluated_at).toLocaleString()}</span>
                <span className="font-mono text-slate-300">{e.check_name}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_TONE[e.status]}`}>
                  {e.status}
                </span>
                {e.message ? <span className={`truncate ${SEVERITY_TONE[e.severity]}`}>{e.message}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function MetricLine({ event }: { event: DatasetHealthEvent }) {
  if (event.metric_name == null && event.metric_value == null) return null;
  return (
    <div className="mt-1 text-[11px] text-slate-400">
      {event.metric_name ?? 'metric'}: <span className="font-mono text-slate-200">{event.metric_value ?? '—'}</span>
      {event.threshold != null ? (
        <>
          {' '}
          (threshold <span className="font-mono">{event.threshold}</span>)
        </>
      ) : null}
    </div>
  );
}

// B05 §AC#4: the Approvals UI consumes real notifications and their
// delivery audit, not a mock dataset. Two-pane layout:
//   - Left: pending/unread in-app notifications (the "inbox"). Click a
//     row to open it; clicking ✓ Acknowledge marks it read.
//   - Right: when a row is selected and it carries an `event_id` in
//     its metadata, render the per-event Delivery audit (webhook /
//     in-app / email status, retry count, last_error, escalation
//     state). Failed rows surface the DLQ.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listEventDeliveries,
  listNotifications,
  markNotificationRead,
  type DeliveryRecord,
  type DeliveryStatus,
  type UserNotification,
} from '@/lib/api/notifications';

const STATUS_TONE: Record<DeliveryStatus, string> = {
  pending: 'bg-slate-500/20 text-slate-200',
  retrying: 'bg-amber-500/20 text-amber-100',
  sent: 'bg-emerald-500/20 text-emerald-200',
  failed: 'bg-rose-500/20 text-rose-200',
  escalated: 'bg-fuchsia-500/20 text-fuchsia-200',
};

export const approvalsInboxQueryKey = ['notifications', 'inbox'] as const;
export const approvalsDeliveriesQueryKey = ['notifications', 'event-deliveries'] as const;

export function ApprovalsPage() {
  const inbox = useQuery({
    queryKey: approvalsInboxQueryKey,
    queryFn: () => listNotifications({ limit: 50 }),
    refetchInterval: 10_000,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => inbox.data?.data.find((n) => n.id === selectedId) ?? null,
    [inbox.data, selectedId],
  );

  return (
    <div className="grid gap-4 p-6 text-slate-100 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <header className="lg:col-span-2">
        <h1 className="text-2xl font-semibold">Approvals</h1>
        <p className="mt-1 text-sm text-slate-400">
          Real-time inbox backed by <code>notification-alerting-service</code>. Each row is one in-app
          delivery; the right pane shows the per-event audit (webhook / SLA / DLQ).
        </p>
      </header>

      <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Inbox</h2>
          <span className="text-xs text-slate-400">
            {inbox.data?.data.length ?? 0} item{inbox.data?.data.length === 1 ? '' : 's'} ·{' '}
            {inbox.data?.unread_count ?? 0} unread
          </span>
        </div>
        {inbox.isLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : inbox.data?.data.length === 0 ? (
          <p className="text-sm text-slate-400">No notifications yet.</p>
        ) : (
          <ul className="space-y-2">
            {inbox.data?.data.map((n) => (
              <InboxItem
                key={n.id}
                notification={n}
                active={n.id === selectedId}
                onSelect={() => setSelectedId(n.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
        <h2 className="mb-3 text-lg font-medium">Delivery audit</h2>
        {selected ? (
          <DeliveryPane notification={selected} />
        ) : (
          <p className="text-sm text-slate-400">Select an inbox item to inspect its delivery trail.</p>
        )}
      </section>
    </div>
  );
}

function InboxItem({
  notification,
  active,
  onSelect,
}: {
  notification: UserNotification;
  active: boolean;
  onSelect: () => void;
}) {
  const qc = useQueryClient();
  const ack = useMutation({
    mutationFn: () => markNotificationRead(notification.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: approvalsInboxQueryKey });
    },
  });
  const unread = notification.status === 'unread';
  return (
    <li
      className={`rounded-lg border p-3 transition ${
        active ? 'border-sky-400/60 bg-sky-500/10' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
      }`}
    >
      <button type="button" onClick={onSelect} className="block w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{notification.title}</span>
          {unread ? (
            <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] text-sky-200">unread</span>
          ) : (
            <span className="text-[10px] text-slate-500">read</span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-slate-400">{notification.body}</p>
        <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
          <span>{new Date(notification.created_at).toLocaleString()}</span>
          <span>·</span>
          <span className="rounded bg-slate-700/40 px-1.5 py-0.5">{notification.category}</span>
          <span className="rounded bg-slate-700/40 px-1.5 py-0.5">{notification.severity}</span>
        </div>
      </button>
      {unread ? (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => ack.mutate()}
            disabled={ack.isPending}
            className="rounded bg-emerald-500/20 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
          >
            ✓ Acknowledge
          </button>
        </div>
      ) : null}
    </li>
  );
}

function eventIDFromMetadata(notification: UserNotification): string | null {
  const m = notification.metadata as Record<string, unknown> | undefined;
  if (!m) return null;
  const id = m['event_id'];
  return typeof id === 'string' ? id : null;
}

function DeliveryPane({ notification }: { notification: UserNotification }) {
  const eventID = eventIDFromMetadata(notification);
  const deliveries = useQuery({
    queryKey: [...approvalsDeliveriesQueryKey, eventID],
    queryFn: () => (eventID ? listEventDeliveries(eventID) : Promise.resolve({ data: [] })),
    enabled: !!eventID,
    refetchInterval: 5_000,
  });

  if (!eventID) {
    return (
      <p className="text-sm text-slate-400">
        This notification was not produced by an event (legacy inbox row). Nothing to audit.
      </p>
    );
  }
  return (
    <div>
      <div className="mb-3 text-xs text-slate-400">
        Event <code className="font-mono">{eventID}</code>
      </div>
      {deliveries.isLoading ? (
        <p className="text-sm text-slate-400">Loading deliveries…</p>
      ) : deliveries.data?.data.length === 0 ? (
        <p className="text-sm text-slate-400">No deliveries recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {deliveries.data?.data.map((d) => <DeliveryRow key={d.id} delivery={d} />)}
        </ul>
      )}
    </div>
  );
}

function DeliveryRow({ delivery }: { delivery: DeliveryRecord }) {
  return (
    <li className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium">
          {delivery.channel} → <code className="font-mono text-xs">{delivery.target}</code>
        </div>
        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[delivery.status]}`}>
          {delivery.status}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-slate-400">
        attempt {delivery.attempt}/{delivery.max_attempts}
        {delivery.last_attempt_at ? ` · last ${new Date(delivery.last_attempt_at).toLocaleString()}` : ''}
        {delivery.escalated_at ? ` · escalated ${new Date(delivery.escalated_at).toLocaleString()}` : ''}
      </div>
      {delivery.last_error ? (
        <div className="mt-2 truncate text-xs text-rose-300" title={delivery.last_error}>
          {delivery.last_error}
        </div>
      ) : null}
    </li>
  );
}

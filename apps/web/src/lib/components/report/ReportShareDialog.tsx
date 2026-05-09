import { useState } from 'react';

import { Drawer } from '@/lib/components/ui/Drawer';
import { Glyph } from '@/lib/components/ui/Glyph';

import type { DistributionRecipient, ReportDefinition } from '@/lib/api/reports';

interface ReportShareDialogProps {
  open: boolean;
  report: ReportDefinition | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (recipients: DistributionRecipient[]) => Promise<void> | void;
}

export function ReportShareDialog({ open, report, busy, onClose, onSubmit }: ReportShareDialogProps) {
  const [recipients, setRecipients] = useState<DistributionRecipient[]>(() => report?.recipients.map(clone) ?? []);

  function addQuickEmail(target: string) {
    if (!target.trim()) return;
    setRecipients((current) => [
      ...current,
      {
        id: `recipient-${current.length + 1}`,
        channel: 'email',
        target: target.trim(),
        label: target.trim(),
        config: {},
      },
    ]);
  }

  return (
    <Drawer open={open} title="Share report" side="right" width="420px" onClose={onClose}>
      <div style={{ background: '#ffffff', color: 'var(--text-default)', borderRadius: 'var(--radius-md)', padding: 16, margin: '-16px' }}>
      <div style={{ display: 'grid', gap: 12, padding: '0 4px' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          Pick people, distribution lists, or channel webhooks to receive every execution of <strong>{report?.name ?? 'this report'}</strong>.
        </p>

        <QuickAdd onSubmit={addQuickEmail} />

        <div style={{ display: 'grid', gap: 8 }}>
          {recipients.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No recipients configured yet.</p>
          ) : (
            recipients.map((entry, index) => (
              <div
                key={`${entry.id}-${index}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '8px 12px',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  background: '#ffffff',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.label || entry.target}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                    {entry.channel} · {entry.target}
                  </p>
                </div>
                <button
                  type="button"
                  className="of-btn of-btn-ghost"
                  aria-label="Remove recipient"
                  onClick={() => setRecipients((current) => current.filter((_, idx) => idx !== index))}
                >
                  <Glyph name="x" size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 4px', marginTop: 16, borderTop: '1px solid var(--border-default)' }}>
        <button type="button" className="of-btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="of-btn of-btn-primary"
          onClick={() => {
            void onSubmit(recipients);
          }}
          disabled={busy || !report}
        >
          Save recipients
        </button>
      </footer>
      </div>
    </Drawer>
  );
}

function clone(entry: DistributionRecipient): DistributionRecipient {
  return { ...entry, config: { ...entry.config } };
}

function QuickAdd({ onSubmit }: { onSubmit: (target: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input
        type="email"
        className="of-input"
        placeholder="name@company.com"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSubmit(value);
            setValue('');
          }
        }}
        style={{ flex: 1 }}
      />
      <button
        type="button"
        className="of-btn"
        onClick={() => {
          onSubmit(value);
          setValue('');
        }}
      >
        Add
      </button>
    </div>
  );
}

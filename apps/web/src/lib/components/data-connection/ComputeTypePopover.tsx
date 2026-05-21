import { useState, type RefObject } from 'react';

import { dataConnection, type Source, type SourceWorker } from '@/lib/api/data-connection';
import { ChipBadge } from '@/lib/components/ui/ChipBadge';
import { Glyph } from '@/lib/components/ui/Glyph';
import { Popover } from '@/lib/components/ui/Popover';

export interface ComputeTypePopoverProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  source: Source;
  onClose: () => void;
  onSourceUpdated: (next: Source) => void;
  onMigrateClick: () => void;
  learnMoreFoundryHref?: string;
  learnMoreAgentHref?: string;
}

export function ComputeTypePopover({
  open,
  anchorRef,
  source,
  onClose,
  onSourceUpdated,
  onMigrateClick,
  learnMoreFoundryHref = '/docs/data-connection/foundry-worker',
  learnMoreAgentHref = '/docs/data-connection/agent-worker',
}: ComputeTypePopoverProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function setWorker(next: SourceWorker) {
    if (busy || next === source.worker) return;
    if (next === 'foundry' && source.worker === 'agent') {
      // Switching from agent worker to Foundry worker requires the migration
      // wizard so we don't lose the network egress policies, certs and
      // credentials configured for the agent. The radio acts as a shortcut to
      // open the wizard rather than a direct write.
      onMigrateClick();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const updated = await dataConnection.updateSource(source.id, { worker: next });
      onSourceUpdated(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to switch compute type');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover
      open={open}
      anchorRef={anchorRef}
      onClose={onClose}
      placement="bottom"
      align="end"
      offset={10}
      width={360}
    >
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-strong)',
          }}
        >
          Compute type
        </h3>

        <ComputeOption
          id="foundry-worker"
          name="compute-type"
          checked={source.worker === 'foundry'}
          disabled={busy}
          onSelect={() => void setWorker('foundry')}
          title="Foundry worker"
          recommendedChip
          description="Jobs run in Foundry. Network connections are managed by network egress policies, which can route to an address directly over the open internet or within a private network."
          learnMoreHref={learnMoreFoundryHref}
        />

        <ComputeOption
          id="agent-worker"
          name="compute-type"
          checked={source.worker === 'agent'}
          disabled={busy}
          onSelect={() => void setWorker('agent')}
          title="Agent worker"
          description="Jobs run on the agent. Network connections are not managed by Foundry. May experience downtime due to maintenance."
          learnMoreHref={learnMoreAgentHref}
        />

        {error ? (
          <div
            className="of-status-danger"
            style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', fontSize: 12 }}
          >
            {error}
          </div>
        ) : null}

        {source.worker === 'agent' ? (
          <button
            type="button"
            onClick={onMigrateClick}
            disabled={busy}
            className="of-button of-button--primary"
            style={{
              width: '100%',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Migrate to Foundry worker
          </button>
        ) : null}
      </div>
    </Popover>
  );
}

interface ComputeOptionProps {
  id: string;
  name: string;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  learnMoreHref: string;
  recommendedChip?: boolean;
}

function ComputeOption({
  id,
  name,
  checked,
  disabled,
  onSelect,
  title,
  description,
  learnMoreHref,
  recommendedChip,
}: ComputeOptionProps) {
  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex',
        gap: 10,
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        style={{
          marginTop: 3,
          accentColor: 'var(--status-info)',
          flexShrink: 0,
        }}
      />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
            {title}
          </span>
          {recommendedChip ? <ChipBadge variant="recommended">Recommended</ChipBadge> : null}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
          {description}{' '}
          <a
            href={learnMoreHref}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              color: 'var(--text-link)',
              textDecoration: 'none',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            Learn more
            <Glyph name="external-link" size={11} tone="currentColor" />
          </a>
        </span>
      </span>
    </label>
  );
}

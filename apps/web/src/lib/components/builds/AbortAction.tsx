import { useState } from 'react';

import { abortBuildV1, type BuildState } from '@/lib/api/buildsV1';
import { ConfirmDialog } from '@/lib/components/ConfirmDialog';

const ABORTABLE_STATES = new Set<BuildState>([
  'BUILD_RESOLUTION',
  'BUILD_QUEUED',
  'BUILD_RUNNING',
]);

export function isBuildAbortable(state: BuildState | string): boolean {
  return ABORTABLE_STATES.has(state as BuildState);
}

interface AbortActionProps {
  rid: string;
  state: BuildState | string;
  disabled?: boolean;
  onAborted?: (nextState: BuildState) => void | Promise<void>;
  onError?: (message: string) => void;
}

export function AbortAction({ rid, state, disabled = false, onAborted, onError }: AbortActionProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const abortable = isBuildAbortable(state);
  const isAborting = state === 'BUILD_ABORTING';

  async function confirmAbort() {
    if (!abortable) return;
    setBusy(true);
    try {
      const result = await abortBuildV1(rid);
      setConfirming(false);
      await onAborted?.(result.state);
    } catch (cause) {
      onError?.(cause instanceof Error ? cause.message : 'Abort failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={disabled || busy || !abortable}
        className="of-button of-btn-danger"
        style={{ fontSize: 11 }}
        title={abortable ? 'Abort build' : isAborting ? 'Abort already requested' : 'Build cannot be aborted'}
      >
        {busy ? 'Aborting...' : isAborting ? 'Aborting' : 'Abort'}
      </button>
      <ConfirmDialog
        open={confirming}
        title="Abort build"
        message={`Abort ${rid}? Running jobs will be asked to stop and output transactions may be marked aborted.`}
        confirmLabel="Abort"
        danger
        busy={busy}
        onConfirm={() => void confirmAbort()}
        onCancel={() => {
          if (!busy) setConfirming(false);
        }}
      />
    </>
  );
}

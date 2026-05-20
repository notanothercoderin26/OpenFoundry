import { Glyph } from '@/lib/components/ui/Glyph';
import type { PipelineRun, PipelineValidationResponse } from '@/lib/api/pipelines';

interface BuildChecksStatusProps {
  validation: PipelineValidationResponse | null;
  latestRun: PipelineRun | null;
  validating?: boolean;
  /** Total transform nodes on the graph — denominator for the "checks passed" chip. */
  nodeCount: number;
}

/**
 * BuildChecksStatus renders the inline build / validation summary that
 * appears in Foundry's editor header: a running-run chip, a "checks passed"
 * counter, and a failed/warning counter. The data comes from the canvas's
 * debounced validate() callback plus the most recent PipelineRun row.
 */
export function BuildChecksStatus({
  validation,
  latestRun,
  validating,
  nodeCount,
}: BuildChecksStatusProps) {
  const failedCount = validation?.errors.length ?? 0;
  const warningCount = validation?.warnings.length ?? 0;
  const passedCount = validation ? Math.max(0, nodeCount - failedCount - warningCount) : nodeCount;

  const runState = runStateChip(latestRun);

  return (
    <div role="group" aria-label="Build & checks" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {runState && (
        <span
          className="of-chip"
          title={runState.title}
          style={{ background: runState.background, color: runState.color, fontWeight: 600 }}
        >
          <span aria-hidden style={{ marginRight: 4 }}>{runState.icon}</span>
          {runState.label}
        </span>
      )}
      {validating && (
        <span className="of-chip" title="Validating in the background" style={{ background: '#f1f5f9', color: '#475569' }}>
          <Glyph name="run" size={11} /> validating…
        </span>
      )}
      <span
        className="of-chip"
        title="Checks passed"
        style={{ background: '#dcfce7', color: '#15803d', fontWeight: 600 }}
      >
        <span aria-hidden style={{ marginRight: 4 }}>✓</span>
        {passedCount}
      </span>
      {warningCount > 0 && (
        <span
          className="of-chip"
          title="Warnings"
          style={{ background: '#fef3c7', color: '#92400e', fontWeight: 600 }}
        >
          <span aria-hidden style={{ marginRight: 4 }}>⚠</span>
          {warningCount}
        </span>
      )}
      <span
        className="of-chip"
        title={failedCount > 0 ? `${failedCount} check${failedCount === 1 ? '' : 's'} failed` : 'No failed checks'}
        style={{
          background: failedCount > 0 ? '#fee2e2' : '#f1f5f9',
          color: failedCount > 0 ? '#b91c1c' : '#64748b',
          fontWeight: 600,
        }}
      >
        <span aria-hidden style={{ marginRight: 4 }}>✗</span>
        {failedCount}
      </span>
    </div>
  );
}

interface RunChip {
  label: string;
  icon: string;
  color: string;
  background: string;
  title: string;
}

function runStateChip(run: PipelineRun | null): RunChip | null {
  if (!run) return null;
  const started = new Date(run.started_at).toLocaleString();
  switch (run.status) {
    case 'queued':
    case 'pending':
      return { label: 'Queued', icon: '⋯', color: '#475569', background: '#f1f5f9', title: `Run ${run.id} queued at ${started}` };
    case 'running':
      return { label: 'Running', icon: '⟳', color: '#1e40af', background: '#dbeafe', title: `Run ${run.id} running since ${started}` };
    case 'succeeded':
    case 'success':
      return { label: 'Succeeded', icon: '✓', color: '#15803d', background: '#dcfce7', title: `Run ${run.id} succeeded at ${started}` };
    case 'failed':
    case 'error':
      return { label: 'Failed', icon: '✗', color: '#b91c1c', background: '#fee2e2', title: `Run ${run.id} failed at ${started}` };
    case 'cancelled':
    case 'canceled':
      return { label: 'Cancelled', icon: '⊘', color: '#64748b', background: '#f1f5f9', title: `Run ${run.id} cancelled at ${started}` };
    default:
      return { label: run.status, icon: '·', color: '#475569', background: '#f1f5f9', title: `Run ${run.id} · ${run.status}` };
  }
}

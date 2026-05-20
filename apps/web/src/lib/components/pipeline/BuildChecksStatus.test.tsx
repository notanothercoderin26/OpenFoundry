// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { PipelineRun, PipelineValidationResponse } from '@/lib/api/pipelines';
import { BuildChecksStatus } from './BuildChecksStatus';

afterEach(() => cleanup());

function validation(overrides: Partial<PipelineValidationResponse> = {}): PipelineValidationResponse {
  return {
    valid: true,
    errors: [],
    warnings: [],
    next_run_at: null,
    summary: { node_count: 0, edge_count: 0, root_node_ids: [], leaf_node_ids: [] },
    ...overrides,
  };
}

function run(overrides: Partial<PipelineRun> & { status: string }): PipelineRun {
  return {
    id: 'run-1',
    pipeline_id: 'p-1',
    attempt_number: 1,
    trigger_type: 'manual',
    status: overrides.status,
    started_at: '2026-05-20T10:00:00Z',
    finished_at: null,
    ...overrides,
  } as PipelineRun;
}

describe('BuildChecksStatus', () => {
  it('shows passed-node count derived from total minus errors and warnings', () => {
    render(<BuildChecksStatus validation={validation()} latestRun={null} nodeCount={11} />);
    expect(screen.getByTitle('Checks passed').textContent).toContain('11');
  });

  it('renders the failed-checks chip with the error count', () => {
    const v = validation({ errors: ['node a is invalid', 'node b is invalid'] });
    render(<BuildChecksStatus validation={v} latestRun={null} nodeCount={5} />);
    expect(screen.getByTitle(/2 checks failed/).textContent).toContain('2');
    // Passed should now be 5 - 2 = 3 (no warnings).
    expect(screen.getByTitle('Checks passed').textContent).toContain('3');
  });

  it('only renders a warnings chip when there are warnings', () => {
    const without = render(<BuildChecksStatus validation={validation()} latestRun={null} nodeCount={1} />);
    expect(without.queryByTitle('Warnings')).toBeNull();
    cleanup();

    const v = validation({ warnings: ['node a missing schema'] });
    render(<BuildChecksStatus validation={v} latestRun={null} nodeCount={3} />);
    expect(screen.getByTitle('Warnings').textContent).toContain('1');
  });

  it('renders a Running chip for an in-flight run', () => {
    render(<BuildChecksStatus validation={validation()} latestRun={run({ status: 'running' })} nodeCount={4} />);
    expect(screen.getByText('Running')).toBeTruthy();
  });

  it('renders a Failed chip for a failed run with red tone in the title', () => {
    render(<BuildChecksStatus validation={validation()} latestRun={run({ status: 'failed' })} nodeCount={4} />);
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('clamps passed count at zero when errors exceed nodes', () => {
    const v = validation({ errors: ['a', 'b', 'c'] });
    render(<BuildChecksStatus validation={v} latestRun={null} nodeCount={2} />);
    expect(screen.getByTitle('Checks passed').textContent).toContain('0');
  });
});

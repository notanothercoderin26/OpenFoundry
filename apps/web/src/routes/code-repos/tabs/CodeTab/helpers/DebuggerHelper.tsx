import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';

import { useBreakpoints, useExecutionLine } from '../../../state/useOpenFiles';
import { useRepoIdentity } from '../../../state/RepoContext';

import { HelperTodoBanner } from './HelperTodoBanner';

interface MockVar {
  name: string;
  type: string;
  value: string;
}

interface MockFrame {
  name: string;
  file: string;
  line: number;
}

const MOCK_VARIABLES: MockVar[] = [
  { name: 'df', type: 'DataFrame', value: 'pyspark.sql.DataFrame[42 cols × 1 048 576 rows]' },
  { name: 'tail_num', type: 'str', value: '"N12345"' },
  { name: 'origin', type: 'str', value: '"SFO"' },
];

const MOCK_FRAMES: MockFrame[] = [
  { name: 'compute_function', file: 'src/myproject/datasets/clean/flights.py', line: 37 },
  { name: 'apply_filters', file: 'src/myproject/utils.py', line: 88 },
  { name: '<module>', file: 'pipeline.py', line: 12 },
];

interface ControlButtonProps {
  glyph: GlyphName;
  label: string;
  onClick?: () => void;
}

function ControlButton({ glyph, label }: ControlButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled
      className="inline-flex items-center justify-center w-7 h-7 rounded-of-sm text-of-text-soft cursor-not-allowed"
    >
      <Glyph name={glyph} size={14} tone="currentColor" />
    </button>
  );
}

export function DebuggerHelper() {
  const { selectedFile } = useRepoIdentity();
  const breakpoints = useBreakpoints(selectedFile?.path ?? '');
  const executionLine = useExecutionLine();

  return (
    <div className="flex flex-col h-full">
      <HelperTodoBanner
        backendGap="B-DBG"
        description="Step over / in / out, call stack and watch require the debugger backend planned in §10."
      />
      <div className="flex items-center gap-1 px-2 py-1 border-b border-of-border bg-of-surface-raised">
        <ControlButton glyph="run" label="Continue" />
        <ControlButton glyph="chevron-down" label="Step into" />
        <ControlButton glyph="chevron-right" label="Step over" />
        <ControlButton glyph="chevron-up" label="Step out" />
        <ControlButton glyph="x" label="Stop" />
        <span className="ml-3 text-of-12 text-of-text-soft">No active session</span>
      </div>

      <div className="grid grid-cols-2 gap-4 p-3 flex-1 min-h-0 overflow-auto">
        <section>
          <h3 className="text-of-12 font-of-semibold uppercase tracking-wider text-of-text-muted">
            Call stack
          </h3>
          <ul className="mt-2 divide-y divide-of-border border border-of-border rounded-of-sm">
            {MOCK_FRAMES.map((frame, index) => (
              <li key={index} className="px-2 py-1.5">
                <p className="text-of-13 text-of-text truncate">{frame.name}</p>
                <p className="text-of-12 text-of-text-soft font-mono truncate">
                  {frame.file}:{frame.line}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="text-of-12 font-of-semibold uppercase tracking-wider text-of-text-muted">
            Variables
          </h3>
          <ul className="mt-2 divide-y divide-of-border border border-of-border rounded-of-sm">
            {MOCK_VARIABLES.map((variable) => (
              <li key={variable.name} className="px-2 py-1.5">
                <p className="text-of-13 text-of-text">
                  <span className="font-mono">{variable.name}</span>
                  <span className="ml-1 text-of-text-soft">: {variable.type}</span>
                </p>
                <p className="text-of-12 text-of-text-soft font-mono truncate" title={variable.value}>
                  {variable.value}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="col-span-2">
          <h3 className="text-of-12 font-of-semibold uppercase tracking-wider text-of-text-muted">
            Breakpoints
          </h3>
          {breakpoints.length === 0 ? (
            <p className="mt-2 text-of-12 text-of-text-soft">
              Click the gutter in the editor to set a breakpoint. Stored in memory until §6 ships.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-of-border border border-of-border rounded-of-sm">
              {breakpoints.map((line) => (
                <li key={line} className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-of-13 text-of-text font-mono">
                    {selectedFile?.path}:{line}
                  </span>
                  {executionLine && executionLine.line === line ? (
                    <span className="text-of-12 text-of-accent">Executing</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

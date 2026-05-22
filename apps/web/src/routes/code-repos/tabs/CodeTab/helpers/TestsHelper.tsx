import { useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import { notifications } from '@stores/notifications';

import { HelperTodoBanner } from './HelperTodoBanner';

interface MockTest {
  id: string;
  name: string;
  status: 'pending' | 'passed' | 'failed';
  duration_ms?: number;
  output?: string;
}

const INITIAL_TESTS: MockTest[] = [
  { id: 'test_filters', name: 'test_filters::test_blank_arr_time', status: 'passed', duration_ms: 18 },
  { id: 'test_filters_bad', name: 'test_filters::test_unknown_carrier', status: 'failed', duration_ms: 22, output: 'AssertionError: expected "UA" but got None' },
  { id: 'test_uniq_airports', name: 'test_unique_airports', status: 'passed', duration_ms: 8 },
];

function statusTone(status: MockTest['status']) {
  if (status === 'passed') return { glyph: 'check', cls: 'text-of-success' } as const;
  if (status === 'failed') return { glyph: 'circle-x', cls: 'text-of-danger' } as const;
  return { glyph: 'history', cls: 'text-of-text-muted' } as const;
}

export function TestsHelper() {
  const [tests, setTests] = useState<MockTest[]>(INITIAL_TESTS);
  const [running, setRunning] = useState(false);

  function runTest(id: string) {
    notifications.info(`Pretend-running ${id} — wire backend gap B2 to make this real`);
    setTests((current) =>
      current.map((test) =>
        test.id === id ? { ...test, status: 'pending', duration_ms: undefined } : test,
      ),
    );
    window.setTimeout(() => {
      setTests((current) =>
        current.map((test) =>
          test.id === id ? { ...test, status: 'passed', duration_ms: 12 } : test,
        ),
      );
    }, 600);
  }

  function runAll() {
    setRunning(true);
    setTests((current) => current.map((test) => ({ ...test, status: 'pending', duration_ms: undefined })));
    window.setTimeout(() => {
      setTests(INITIAL_TESTS);
      setRunning(false);
    }, 900);
  }

  return (
    <div className="flex flex-col h-full">
      <HelperTodoBanner
        backendGap="B2"
        description="POST /repositories/{id}/tests/run is not wired — the runner here is mocked with a timeout."
      />
      <div className="flex items-center gap-2 px-3 py-2 border-b border-of-border bg-of-surface-raised">
        <span className="text-of-13 font-of-semibold">Unit tests</span>
        <button
          type="button"
          onClick={runAll}
          disabled={running}
          className={`ml-auto inline-flex items-center gap-1.5 h-7 px-2 rounded-of-sm text-of-12 font-of-medium ${
            running
              ? 'bg-of-surface-muted text-of-text-soft cursor-not-allowed'
              : 'bg-of-accent text-white hover:bg-of-accent-hover'
          }`}
        >
          <Glyph name="run" size={12} tone="currentColor" />
          Run all
        </button>
      </div>

      <ul className="flex-1 min-h-0 overflow-auto divide-y divide-of-border">
        {tests.map((test) => {
          const meta = statusTone(test.status);
          return (
            <li key={test.id} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <Glyph name={meta.glyph} size={13} tone={meta.cls === 'text-of-danger' ? 'danger' : 'currentColor'} />
                <span className="flex-1 min-w-0 truncate text-of-13 font-mono">{test.name}</span>
                {typeof test.duration_ms === 'number' ? (
                  <span className="text-of-12 text-of-text-soft">{test.duration_ms}ms</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => runTest(test.id)}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
                  title="Run this test"
                >
                  <Glyph name="run" size={12} tone="currentColor" />
                </button>
              </div>
              {test.status === 'failed' && test.output ? (
                <pre className="mt-1 px-2 py-1 text-of-12 text-of-danger bg-of-danger-soft rounded-of-sm font-mono whitespace-pre-wrap">
                  {test.output}
                </pre>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

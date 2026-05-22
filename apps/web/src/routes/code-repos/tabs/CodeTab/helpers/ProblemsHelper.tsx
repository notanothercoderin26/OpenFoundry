import { Glyph } from '@/lib/components/ui/Glyph';

import { useRepoIdentity } from '../../../state/RepoContext';
import { openFiles, useOpenFiles } from '../../../state/useOpenFiles';

import { HelperTodoBanner } from './HelperTodoBanner';

interface MockProblem {
  severity: 'error' | 'warning' | 'info';
  file: string;
  line: number;
  message: string;
  code: string;
}

const MOCK_PROBLEMS: MockProblem[] = [
  {
    severity: 'warning',
    file: 'src/lib.rs',
    line: 12,
    message: 'unused import: `serde::Deserialize`',
    code: 'unused_imports',
  },
  {
    severity: 'error',
    file: 'src/lib.rs',
    line: 47,
    message: 'expected `;`, found `}`',
    code: 'E0001',
  },
  {
    severity: 'info',
    file: 'README.md',
    line: 3,
    message: 'Consider adding a license badge',
    code: 'docs.licence',
  },
];

function severityGlyph(severity: MockProblem['severity']) {
  if (severity === 'error') return { glyph: 'circle-x', tone: 'text-of-danger' } as const;
  if (severity === 'warning') return { glyph: 'info', tone: 'text-of-warning' } as const;
  return { glyph: 'info', tone: 'text-of-text-muted' } as const;
}

export function ProblemsHelper() {
  const { selectedFile } = useRepoIdentity();
  const { openFiles: tabs } = useOpenFiles();

  const problems = MOCK_PROBLEMS.filter((problem) =>
    selectedFile ? problem.file === selectedFile.path : true,
  );

  return (
    <div className="flex flex-col h-full">
      <HelperTodoBanner
        backendGap="B9"
        description="Wire the Code Assist LSP gateway to feed real diagnostics here."
      />
      <ul className="flex-1 min-h-0 overflow-auto mt-2 divide-y divide-of-border">
        {problems.length === 0 ? (
          <li className="px-3 py-6 text-of-12 text-of-text-soft text-center">
            No problems detected in the current file.
          </li>
        ) : (
          problems.map((problem, index) => {
            const meta = severityGlyph(problem.severity);
            return (
              <li key={index} className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => {
                    const inTab = tabs.find((tab) => tab.path === problem.file);
                    openFiles.open(problem.file, inTab?.language);
                  }}
                  className="flex items-start gap-2 w-full text-left"
                >
                  <Glyph
                    name={meta.glyph}
                    size={13}
                    tone={meta.tone === 'text-of-danger' ? 'danger' : 'currentColor'}
                  />
                  <div className="min-w-0">
                    <p className="text-of-13 text-of-text">{problem.message}</p>
                    <p className="mt-0.5 text-of-12 text-of-text-soft font-mono truncate">
                      {problem.file}:{problem.line} · {problem.code}
                    </p>
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

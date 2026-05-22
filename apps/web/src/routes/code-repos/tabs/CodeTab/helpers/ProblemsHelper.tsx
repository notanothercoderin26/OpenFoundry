import { Glyph } from '@/lib/components/ui/Glyph';

import { useProblems, type ProblemSeverity } from '../../../state/problems';
import { useRepoIdentity } from '../../../state/RepoContext';
import { openFiles, useOpenFiles } from '../../../state/useOpenFiles';

import { HelperTodoBanner } from './HelperTodoBanner';

function severityGlyph(severity: ProblemSeverity) {
  if (severity === 'error') return { glyph: 'circle-x', tone: 'text-of-danger' } as const;
  if (severity === 'warning') return { glyph: 'info', tone: 'text-of-warning' } as const;
  return { glyph: 'info', tone: 'text-of-text-muted' } as const;
}

export function ProblemsHelper() {
  const { selectedFile } = useRepoIdentity();
  const { openFiles: tabs } = useOpenFiles();
  const problems = useProblems(selectedFile?.path);

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

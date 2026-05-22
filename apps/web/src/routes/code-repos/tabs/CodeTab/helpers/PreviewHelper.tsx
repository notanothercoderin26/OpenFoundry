import { Glyph } from '@/lib/components/ui/Glyph';

import { useRepoIdentity } from '../../../state/RepoContext';

import { HelperTodoBanner } from './HelperTodoBanner';

interface MockColumn {
  name: string;
  type: string;
}

interface MockRow {
  cells: ReadonlyArray<string>;
}

const MOCK_COLUMNS: MockColumn[] = [
  { name: 'op_carrier_fl_num', type: 'string' },
  { name: 'date', type: 'date' },
  { name: 'origin', type: 'string' },
  { name: 'dest', type: 'string' },
  { name: 'arrival_delay', type: 'double' },
];

const MOCK_ROWS: MockRow[] = [
  { cells: ['UA204', '2024-01-12', 'SFO', 'JFK', '12.4'] },
  { cells: ['DL301', '2024-01-12', 'ATL', 'LAX', '-3.0'] },
  { cells: ['AA112', '2024-01-13', 'ORD', 'BOS', '7.8'] },
  { cells: ['SW820', '2024-01-13', 'DAL', 'PHX', '0.0'] },
];

export function PreviewHelper() {
  const { selectedFile, repository } = useRepoIdentity();

  return (
    <div className="flex flex-col h-full">
      <HelperTodoBanner
        backendGap="B1"
        description="POST /repositories/{id}/preview is not implemented yet; this table is illustrative."
      />
      <div className="flex items-center gap-2 px-3 py-2 border-b border-of-border bg-of-surface-raised">
        <Glyph name="run" size={14} tone="muted" />
        <span className="text-of-13 text-of-text">
          Preview for{' '}
          <span className="font-mono">{selectedFile?.path ?? `(${repository.default_branch})`}</span>
        </span>
        <button
          type="button"
          disabled
          className="ml-auto inline-flex items-center gap-1.5 h-7 px-2 rounded-of-sm text-of-12 font-of-medium bg-of-surface-muted text-of-text-soft cursor-not-allowed"
          title="Run preview (backend pending)"
        >
          <Glyph name="run" size={12} tone="currentColor" />
          Run preview
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-of-12 text-of-text">
          <thead className="sticky top-0 bg-of-surface-raised border-b border-of-border">
            <tr>
              {MOCK_COLUMNS.map((column) => (
                <th
                  key={column.name}
                  className="text-left px-2 py-1 font-of-semibold text-of-text"
                >
                  <span className="font-mono">{column.name}</span>
                  <span className="ml-1 text-of-text-soft">{column.type}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_ROWS.map((row, index) => (
              <tr key={index} className="border-b border-of-border">
                {row.cells.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-2 py-1 font-mono">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

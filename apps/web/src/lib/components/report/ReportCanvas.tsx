import { useMemo } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

import type {
  ReportDefinition,
  ReportExecution,
  ReportExecutionPreview,
  ReportPreviewSection,
  SectionKind,
} from '@/lib/api/reports';

interface ReportCanvasProps {
  report: ReportDefinition | null;
  execution: ReportExecution | null;
  mode: 'editing' | 'preview';
  busy?: boolean;
  onGenerate: () => void;
  onSelectSection: (sectionId: string) => void;
  activeSectionId?: string;
  registerSection: (sectionId: string, element: HTMLElement | null) => void;
}

export function ReportCanvas({
  report,
  execution,
  mode,
  busy,
  onGenerate,
  onSelectSection,
  activeSectionId,
  registerSection,
}: ReportCanvasProps) {
  const preview = execution?.preview ?? null;
  const sections = useMemo(() => buildSections(report, preview), [report, preview]);
  const datasets = useMemo(() => extractDatasetReferences(report, preview), [report, preview]);

  if (!report) {
    return (
      <div style={emptyShellStyle}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <h2 className="of-heading-md" style={{ marginBottom: 8 }}>
            No report selected
          </h2>
          <p className="of-text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
            Pick a report from the left rail or create a new definition to start composing widgets, narratives, and KPIs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <article
      style={{
        background: '#ffffff',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: '32px 40px 56px',
        minHeight: 600,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Created by {report.owner}</p>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: 'var(--text-strong)' }}>{report.name}</h1>
        {report.description ? (
          <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-default)', maxWidth: 760, margin: 0 }}>
            {renderInlineNarrative(report.description)}
          </p>
        ) : null}
      </header>

      {datasets.length > 0 ? (
        <div style={{ display: 'grid', gap: 8, maxWidth: 760 }}>
          {datasets.map((dataset) => (
            <div
              key={dataset.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                background: '#ffffff',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'var(--text-link)', fontWeight: 600, fontSize: 13 }}>
                <Glyph name="spreadsheet" size={14} />
                {dataset.name}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {dataset.rows.toLocaleString()} rows · {dataset.columns} columns
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {sections.length === 0 ? (
        <div style={emptyShellStyle}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <h3 className="of-heading-sm" style={{ marginBottom: 8 }}>
              No sections yet
            </h3>
            <p className="of-text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
              Open <strong>Settings → Definition settings</strong> to add KPIs, charts, tables, or narrative blocks. Then click <strong>Generate report</strong> to fill them with data.
            </p>
            <button type="button" className="of-btn of-btn-primary" onClick={onGenerate} disabled={busy}>
              <Glyph name="run" size={14} />
              Generate report
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {sections.map((row, rowIndex) => (
            <div
              key={`row-${rowIndex}`}
              style={{
                display: 'grid',
                gap: 16,
                gridTemplateColumns: row.length > 1 ? '1fr 1fr' : '1fr',
              }}
            >
              {row.map((section) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  mode={mode}
                  active={activeSectionId === section.id}
                  onSelect={() => onSelectSection(section.id)}
                  registerSection={registerSection}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

interface CanvasSection {
  id: string;
  title: string;
  kind: SectionKind;
  description: string;
  preview: ReportPreviewSection | null;
  query: string;
}

function buildSections(report: ReportDefinition | null, preview: ReportExecutionPreview | null): CanvasSection[][] {
  if (!report) return [];
  const previewMap = new Map(preview?.sections.map((entry) => [entry.section_id, entry]) ?? []);
  const flat: CanvasSection[] = report.template.sections.map((section) => ({
    id: section.id,
    title: section.title,
    kind: section.kind,
    description: section.description,
    query: section.query,
    preview: previewMap.get(section.id) ?? null,
  }));
  // Group consecutive small sections (kpi/chart) into rows of two.
  const rows: CanvasSection[][] = [];
  let buffer: CanvasSection[] = [];
  function flush() {
    if (buffer.length > 0) {
      rows.push(buffer);
      buffer = [];
    }
  }
  for (const entry of flat) {
    const isWide = entry.kind === 'narrative' || entry.kind === 'table' || entry.kind === 'map';
    if (isWide) {
      flush();
      rows.push([entry]);
    } else {
      buffer.push(entry);
      if (buffer.length === 2) flush();
    }
  }
  flush();
  return rows;
}

interface DatasetReference {
  name: string;
  rows: number;
  columns: number;
}

function extractDatasetReferences(
  report: ReportDefinition | null,
  preview: ReportExecutionPreview | null,
): DatasetReference[] {
  if (!report) return [];
  const datasets = new Map<string, DatasetReference>();
  if (report.dataset_name) {
    datasets.set(report.dataset_name, { name: report.dataset_name, rows: 0, columns: 0 });
  }
  for (const section of preview?.sections ?? []) {
    if (section.rows.length > 0) {
      const sample = section.rows[0];
      const name = report.dataset_name || section.section_id;
      const existing = datasets.get(name) ?? { name, rows: 0, columns: 0 };
      existing.rows = Math.max(existing.rows, section.rows.length * 100);
      existing.columns = Math.max(existing.columns, Object.keys(sample).length);
      datasets.set(name, existing);
    }
  }
  return Array.from(datasets.values());
}

function renderInlineNarrative(text: string) {
  const tokens = text.split(/(\b[a-z][a-z0-9_]+\b)/g);
  return tokens.map((token, index) => {
    if (/_/.test(token) && /^[a-z]/.test(token)) {
      return (
        <code
          key={index}
          style={{
            background: '#eef2f6',
            color: 'var(--text-strong)',
            padding: '1px 6px',
            borderRadius: 3,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
          }}
        >
          {token}
        </code>
      );
    }
    return <span key={index}>{token}</span>;
  });
}

const emptyShellStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px dashed var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: '64px 24px',
  background: '#fafbfc',
};

interface SectionCardProps {
  section: CanvasSection;
  mode: 'editing' | 'preview';
  active: boolean;
  onSelect: () => void;
  registerSection: (id: string, element: HTMLElement | null) => void;
}

function SectionCard({ section, mode, active, onSelect, registerSection }: SectionCardProps) {
  const rowCount = section.preview?.rows.length ?? 0;
  const isNarrative = section.kind === 'narrative';
  return (
    <section
      ref={(el) => registerSection(section.id, el)}
      onClick={onSelect}
      data-section-id={section.id}
      style={{
        border: active ? '1px solid var(--status-info)' : '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        background: '#ffffff',
        boxShadow: active ? '0 0 0 1px var(--status-info)' : 'none',
        overflow: 'hidden',
        cursor: mode === 'editing' ? 'pointer' : 'default',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-default)',
          background: '#fafbfc',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {mode === 'editing' ? <DragHandle /> : null}
          <strong style={{ fontSize: 13, color: 'var(--text-strong)' }}>{section.title}</strong>
        </div>
        <span className="of-chip" style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.08em', fontWeight: 700 }}>
          {section.kind}
        </span>
      </header>

      <div style={{ padding: 16, minHeight: isNarrative ? 80 : 220, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {section.kind === 'kpi' ? renderKpi(section) : null}
        {section.kind === 'chart' ? renderChart(section) : null}
        {section.kind === 'table' ? renderTable(section) : null}
        {section.kind === 'narrative' ? renderNarrative(section) : null}
        {section.kind === 'map' ? renderMap(section) : null}
      </div>

      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '8px 14px',
          borderTop: '1px solid var(--border-default)',
          background: '#fafbfc',
          color: 'var(--text-muted)',
          fontSize: 12,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-link)' }}>
          Show data <Glyph name="chevron-right" size={12} tone="var(--text-link)" />
        </span>
        <span>{rowCount > 0 ? `${(rowCount * 100).toLocaleString()} rows` : 'No data yet'}</span>
        <a href="#about" style={{ color: 'var(--text-muted)' }}>
          About
        </a>
      </footer>
    </section>
  );
}

function renderKpi(section: CanvasSection) {
  const row = section.preview?.rows[0] ?? null;
  const value = row ? Object.values(row).find((v) => typeof v === 'number') : null;
  const label = section.description || 'Headline metric';
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
      <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--text-strong)' }}>
        {typeof value === 'number' ? value.toLocaleString() : '—'}
      </span>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}

function renderChart(section: CanvasSection) {
  const rows = section.preview?.rows ?? [];
  if (rows.length === 0) return <ChartPlaceholder query={section.query} />;
  const numericValues = rows
    .map((row) => Object.values(row).find((v) => typeof v === 'number') as number | undefined)
    .filter((v): v is number => typeof v === 'number');
  const max = numericValues.length > 0 ? Math.max(...numericValues, 1) : 1;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 6,
        height: 200,
        padding: '8px 0',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {numericValues.length > 0 ? (
        numericValues.map((value, index) => (
          <div
            key={index}
            title={String(value)}
            style={{
              flex: 1,
              height: `${Math.max(4, (value / max) * 100)}%`,
              background: `linear-gradient(180deg, #2d72d2 0%, #93c5fd 100%)`,
              borderRadius: 2,
            }}
          />
        ))
      ) : (
        <ChartPlaceholder query={section.query} />
      )}
    </div>
  );
}

function ChartPlaceholder({ query }: { query: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        border: '1px dashed var(--border-default)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--text-muted)',
        fontSize: 12,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <Glyph name="graph" size={20} />
      <span>Awaiting execution</span>
      <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{query}</code>
    </div>
  );
}

function renderTable(section: CanvasSection) {
  const rows = section.preview?.rows ?? [];
  if (rows.length === 0) return <ChartPlaceholder query={section.query} />;
  const columns = Object.keys(rows[0] ?? {});
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="of-table" style={{ minWidth: '100%' }}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 6).map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column}>{String(row[column] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderNarrative(section: CanvasSection) {
  return (
    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text-default)' }}>
      {renderInlineNarrative(section.description || section.preview?.summary || section.query)}
    </p>
  );
}

function renderMap(section: CanvasSection) {
  return (
    <div
      style={{
        height: 220,
        background:
          'radial-gradient(circle at 30% 30%, rgba(34,197,94,0.25), transparent 55%), radial-gradient(circle at 70% 60%, rgba(45,114,210,0.3), transparent 60%), #f1f5f9',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)',
        fontSize: 12,
        gap: 8,
      }}
    >
      <Glyph name="graph" size={18} />
      Map preview · {section.query}
    </div>
  );
}

function DragHandle() {
  return (
    <span
      aria-hidden
      title="Drag to reorder"
      style={{
        display: 'inline-grid',
        gridTemplateColumns: '2px 2px',
        gridTemplateRows: '2px 2px 2px',
        gap: 2,
        color: 'var(--text-muted)',
        cursor: 'grab',
      }}
    >
      {Array.from({ length: 6 }).map((_, idx) => (
        <span key={idx} style={{ width: 2, height: 2, background: 'currentColor', borderRadius: 1 }} />
      ))}
    </span>
  );
}

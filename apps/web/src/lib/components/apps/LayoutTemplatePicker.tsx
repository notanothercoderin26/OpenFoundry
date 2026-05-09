import { useState, type CSSProperties } from 'react';

import type { AppPage, AppWidget } from '@/lib/api/apps';

export interface LayoutTemplate {
  id: string;
  label: string;
  description: string;
  // 12-column grid blocks describing widget placements.
  blocks: Array<{
    widget_type: string;
    title: string;
    width: number;
    height: number;
    x: number;
    y: number;
  }>;
}

const DEFAULT_TEMPLATES: LayoutTemplate[] = [
  {
    id: 'details',
    label: 'Details',
    description: 'Header banner, KPI strip, two-column body.',
    blocks: [
      { widget_type: 'text', title: 'Heading', width: 12, height: 1, x: 0, y: 0 },
      { widget_type: 'metric', title: 'KPI 1', width: 4, height: 2, x: 0, y: 1 },
      { widget_type: 'metric', title: 'KPI 2', width: 4, height: 2, x: 4, y: 1 },
      { widget_type: 'metric', title: 'KPI 3', width: 4, height: 2, x: 8, y: 1 },
      { widget_type: 'table', title: 'Records', width: 7, height: 4, x: 0, y: 3 },
      { widget_type: 'chart', title: 'Trend', width: 5, height: 4, x: 7, y: 3 },
    ],
  },
  {
    id: 'grid',
    label: 'Grid',
    description: 'Four equal cards.',
    blocks: [
      { widget_type: 'metric', title: 'Card 1', width: 6, height: 3, x: 0, y: 0 },
      { widget_type: 'metric', title: 'Card 2', width: 6, height: 3, x: 6, y: 0 },
      { widget_type: 'chart', title: 'Card 3', width: 6, height: 3, x: 0, y: 3 },
      { widget_type: 'chart', title: 'Card 4', width: 6, height: 3, x: 6, y: 3 },
    ],
  },
  {
    id: 'inbox',
    label: 'Inbox',
    description: 'Filters, table, inspector.',
    blocks: [
      { widget_type: 'text', title: 'Filters', width: 3, height: 5, x: 0, y: 0 },
      { widget_type: 'table', title: 'Records', width: 6, height: 5, x: 3, y: 0 },
      { widget_type: 'metric', title: 'Detail', width: 3, height: 5, x: 9, y: 0 },
    ],
  },
  {
    id: 'overview',
    label: 'Overview',
    description: 'Header, metrics row, charts row.',
    blocks: [
      { widget_type: 'text', title: 'Overview', width: 12, height: 1, x: 0, y: 0 },
      { widget_type: 'metric', title: 'Metric A', width: 3, height: 2, x: 0, y: 1 },
      { widget_type: 'metric', title: 'Metric B', width: 3, height: 2, x: 3, y: 1 },
      { widget_type: 'metric', title: 'Metric C', width: 3, height: 2, x: 6, y: 1 },
      { widget_type: 'metric', title: 'Metric D', width: 3, height: 2, x: 9, y: 1 },
      { widget_type: 'chart', title: 'Time series', width: 8, height: 4, x: 0, y: 3 },
      { widget_type: 'table', title: 'Top records', width: 4, height: 4, x: 8, y: 3 },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Form-style stack of fields.',
    blocks: [
      { widget_type: 'text', title: 'Section title', width: 12, height: 1, x: 0, y: 0 },
      { widget_type: 'text', title: 'Form section', width: 8, height: 4, x: 0, y: 1 },
      { widget_type: 'text', title: 'Helper info', width: 4, height: 4, x: 8, y: 1 },
      { widget_type: 'button', title: 'Save', width: 3, height: 1, x: 0, y: 5 },
    ],
  },
];

interface LayoutTemplatePickerProps {
  // When provided, applying a template adds widgets to this page; clears existing widgets first.
  onApply: (widgets: AppWidget[]) => void;
  page?: AppPage;
}

function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10_000)}`;
}

function templateToWidgets(template: LayoutTemplate): AppWidget[] {
  return template.blocks.map((block) => ({
    id: makeId('widget'),
    widget_type: block.widget_type,
    title: block.title,
    description: '',
    position: { x: block.x, y: block.y, width: block.width, height: block.height },
    props: {},
    binding: null,
    events: [],
    children: [],
  }));
}

export function LayoutTemplatePicker({ onApply, page }: LayoutTemplatePickerProps) {
  const [hovered, setHovered] = useState<LayoutTemplate | null>(null);
  const hasWidgets = (page?.widgets.length ?? 0) > 0;

  return (
    <section
      className="of-panel-muted"
      style={{ display: 'grid', gap: 8, padding: '10px 12px' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <p className="of-eyebrow" style={{ margin: 0 }}>Try a layout template!</p>
          <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 12 }}>
            {hovered ? hovered.description : 'Hover to preview, click to apply a starter layout.'}
          </p>
        </div>
        {hasWidgets ? (
          <span className="of-text-muted" style={{ fontSize: 11 }}>Applying replaces current widgets.</span>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {DEFAULT_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onMouseEnter={() => setHovered(template)}
            onMouseLeave={() => setHovered((current) => (current?.id === template.id ? null : current))}
            onClick={() => onApply(templateToWidgets(template))}
            style={{
              display: 'grid',
              gap: 6,
              minWidth: 96,
              padding: 8,
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-panel)',
              color: 'var(--text-default)',
              cursor: 'pointer',
              textAlign: 'center',
            }}
            title={template.description}
          >
            <TemplatePreview template={template} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>{template.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function TemplatePreview({ template }: { template: LayoutTemplate }) {
  const cellSize = 6;
  const columns = 12;
  const maxRow = template.blocks.reduce((max, block) => Math.max(max, block.y + block.height), 1);
  const rows = Math.max(maxRow, 4);
  const width = columns * cellSize + (columns - 1) * 1;
  const height = rows * cellSize + (rows - 1) * 1;
  const containerStyle: CSSProperties = {
    position: 'relative',
    width,
    height,
    border: '1px solid var(--border-subtle)',
    borderRadius: 4,
    background: 'var(--bg-panel-muted)',
    margin: '0 auto',
  };
  return (
    <div style={containerStyle} aria-hidden>
      {template.blocks.map((block, index) => {
        const left = block.x * (cellSize + 1);
        const top = block.y * (cellSize + 1);
        const w = block.width * cellSize + (block.width - 1) * 1;
        const h = block.height * cellSize + (block.height - 1) * 1;
        return (
          <span
            key={index}
            style={{
              position: 'absolute',
              left,
              top,
              width: w,
              height: h,
              background: 'var(--status-info)',
              opacity: 0.32,
              borderRadius: 2,
            }}
          />
        );
      })}
    </div>
  );
}

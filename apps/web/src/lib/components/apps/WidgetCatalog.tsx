import { useMemo, useState } from 'react';

import type { WidgetCatalogItem } from '@/lib/api/apps';
import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';

interface WidgetCatalogProps {
  items: WidgetCatalogItem[];
  onSelect: (item: WidgetCatalogItem) => void;
}

const FALLBACK_CATALOG: WidgetCatalogItem[] = [
  {
    widget_type: 'text',
    label: 'Text block',
    description: 'Markdown copy, briefing notes, and section headers.',
    category: 'content',
    default_props: { content: '### New section\nAdd context for this workspace.' },
    default_size: { width: 12, height: 2 },
    supported_bindings: [],
    supports_children: false,
  },
  {
    widget_type: 'metric',
    label: 'Metric',
    description: 'Single value with optional delta.',
    category: 'analytics',
    default_props: { value: '128', delta: '+4.2%' },
    default_size: { width: 3, height: 2 },
    supported_bindings: ['query', 'dataset', 'object_set'],
    supports_children: false,
  },
  {
    widget_type: 'table',
    label: 'Table',
    description: 'Paginated records from query, dataset, or object set bindings.',
    category: 'analytics',
    default_props: { page_size: 8, striped: true },
    default_size: { width: 6, height: 4 },
    supported_bindings: ['query', 'dataset', 'ontology', 'object_set'],
    supports_children: false,
  },
  {
    widget_type: 'chart',
    label: 'Chart',
    description: 'Line, bar, area, pie, or scatter visualizations.',
    category: 'analytics',
    default_props: { chart_type: 'line', x_field: 'label', y_field: 'value' },
    default_size: { width: 6, height: 4 },
    supported_bindings: ['query', 'dataset', 'object_set'],
    supports_children: false,
  },
  {
    widget_type: 'scenario',
    label: 'Scenario controls',
    description: 'What-if parameters that feed runtime bindings and agents.',
    category: 'workshop',
    default_props: {
      headline: 'Scenario controls',
      parameters: [{ name: 'demand_multiplier', label: 'Demand multiplier', type: 'number', default_value: '1.0' }],
      apply_label: 'Apply scenario',
      reset_label: 'Reset',
    },
    default_size: { width: 5, height: 4 },
    supported_bindings: [],
    supports_children: false,
  },
  {
    widget_type: 'agent',
    label: 'Embedded agent',
    description: 'Prompt box backed by an OpenFoundry agent.',
    category: 'ai',
    default_props: { agent_id: '', welcome_message: 'Ask the embedded agent for help.', submit_label: 'Run agent' },
    default_size: { width: 7, height: 4 },
    supported_bindings: [],
    supports_children: false,
  },
  {
    widget_type: 'button',
    label: 'Action button',
    description: 'Trigger navigation, links, filters, or workflow actions.',
    category: 'actions',
    default_props: { label: 'Run action', variant: 'primary' },
    default_size: { width: 3, height: 1 },
    supported_bindings: [],
    supports_children: false,
  },
  {
    widget_type: 'map',
    label: 'Map',
    description: 'Lightweight geographic point visualization.',
    category: 'spatial',
    default_props: { latitude_field: 'lat', longitude_field: 'lon', label_field: 'label' },
    default_size: { width: 8, height: 4 },
    supported_bindings: ['query', 'dataset', 'object_set'],
    supports_children: false,
  },
  {
    widget_type: 'container',
    label: 'Container',
    description: 'Grouped nested widget section for composite layouts.',
    category: 'layout',
    default_props: { title: 'Section', variant: 'card' },
    default_size: { width: 12, height: 4 },
    supported_bindings: [],
    supports_children: true,
  },
];

const GLYPH_BY_TYPE: Record<string, GlyphName> = {
  agent: 'sparkles',
  button: 'run',
  chart: 'graph',
  container: 'cube',
  form: 'document',
  image: 'image',
  map: 'object',
  media_preview: 'image',
  media_uploader: 'artifact',
  metric: 'sparkles',
  scenario: 'settings',
  table: 'list',
  text: 'document',
};

export function getDefaultWidgetCatalog(items: WidgetCatalogItem[]) {
  return items.length > 0 ? items : FALLBACK_CATALOG;
}

export function WidgetCatalog({ items, onSelect }: WidgetCatalogProps) {
  const catalog = useMemo(() => getDefaultWidgetCatalog(items), [items]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(catalog.map((item) => item.category))).sort()],
    [catalog],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.filter((item) => {
      const inCategory = category === 'all' || item.category === category;
      const haystack = `${item.label} ${item.widget_type} ${item.description} ${item.category}`.toLowerCase();
      return inCategory && (!needle || haystack.includes(needle));
    });
  }, [catalog, category, query]);

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <p className="of-eyebrow" style={{ margin: 0 }}>Widget catalog</p>
          <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 12 }}>
            {catalog.length} available widgets
          </p>
        </div>
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search widgets"
        className="of-input"
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {categories.map((entry) => (
          <button
            key={entry}
            type="button"
            className={`of-button ${category === entry ? 'of-button--primary' : ''}`}
            onClick={() => setCategory(entry)}
            style={{ minHeight: 26, padding: '0 8px', textTransform: 'capitalize' }}
          >
            {entry}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {filtered.map((item) => (
          <button
            key={item.widget_type}
            type="button"
            onClick={() => onSelect(item)}
            style={{
              display: 'grid',
              gridTemplateColumns: '28px minmax(0, 1fr)',
              gap: 9,
              width: '100%',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-panel)',
              color: 'var(--text-default)',
              padding: 10,
              textAlign: 'left',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-panel-muted)',
                color: 'var(--status-info)',
              }}
            >
              <Glyph name={GLYPH_BY_TYPE[item.widget_type] ?? 'cube'} size={16} />
            </span>
            <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ color: 'var(--text-strong)' }}>{item.label || item.widget_type}</strong>
                <code style={{ color: 'var(--text-soft)', fontSize: 11 }}>{item.widget_type}</code>
              </span>
              <span className="of-text-muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
                {item.description || 'Widget building block'}
              </span>
              {item.supported_bindings.length > 0 ? (
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {item.supported_bindings.slice(0, 3).map((binding) => (
                    <span key={binding} className="of-chip" style={{ minHeight: 20, fontSize: 11 }}>
                      {binding}
                    </span>
                  ))}
                </span>
              ) : null}
            </span>
          </button>
        ))}
        {filtered.length === 0 ? (
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
            No widgets match the current filters.
          </p>
        ) : null}
      </div>
    </section>
  );
}

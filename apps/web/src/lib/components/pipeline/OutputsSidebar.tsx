import { useMemo, useState } from 'react';

import type { PipelineNode } from '@/lib/api/pipelines';
import { Glyph } from '@/lib/components/ui/Glyph';

type OutputKind = 'dataset' | 'object_type' | 'link_type' | 'virtual_table';

type AddableKind = 'dataset' | 'object_type' | 'link_type' | 'time_series' | 'virtual_table';

interface OutputsSidebarProps {
  nodes: PipelineNode[];
  collapsed: boolean;
  onToggle: () => void;
  /** Open the existing OutputDrawer for an existing output node. */
  onOpenOutput?: (node: PipelineNode) => void;
  /** Add a new output of a given kind. Source defaults to the last non-output node. */
  onAddOutput?: (source: PipelineNode, kind: AddableKind) => void;
  /** Select the output node on the canvas. */
  onSelect?: (node: PipelineNode) => void;
}

interface ClassifiedOutput {
  node: PipelineNode;
  kind: OutputKind;
}

function classifyOutput(node: PipelineNode): ClassifiedOutput | null {
  const config = node.config as Record<string, unknown> | undefined;
  const outputConfig = config && typeof config._output === 'object' && config._output !== null
    ? (config._output as Record<string, unknown>)
    : config;
  const kindFromConfig = outputConfig && typeof outputConfig.kind === 'string' ? outputConfig.kind : null;
  if (kindFromConfig === 'dataset' || kindFromConfig === 'object_type' || kindFromConfig === 'link_type' || kindFromConfig === 'virtual_table') {
    return { node, kind: kindFromConfig };
  }
  const transformType = node.transform_type.toLowerCase();
  if (transformType.startsWith('output_')) {
    const suffix = transformType.replace(/^output_/, '');
    if (suffix === 'dataset' || suffix === 'object_type' || suffix === 'link_type' || suffix === 'virtual_table') {
      return { node, kind: suffix };
    }
    return { node, kind: 'dataset' };
  }
  return null;
}

const TAB_DEFS: { id: 'datasets' | 'object_types' | 'link_types'; label: string; kinds: OutputKind[] }[] = [
  { id: 'datasets', label: 'Datasets', kinds: ['dataset', 'virtual_table'] },
  { id: 'object_types', label: 'Object types', kinds: ['object_type'] },
  { id: 'link_types', label: 'Link types', kinds: ['link_type'] },
];

function iconForKind(kind: OutputKind): { name: 'database' | 'object' | 'link' | 'cube'; tone: string } {
  switch (kind) {
    case 'dataset':
      return { name: 'database', tone: '#2d72d2' };
    case 'virtual_table':
      return { name: 'database', tone: '#6f7d8c' };
    case 'object_type':
      return { name: 'object', tone: '#cf923f' };
    case 'link_type':
      return { name: 'link', tone: '#7c5dd6' };
  }
}

export function OutputsSidebar({
  nodes,
  collapsed,
  onToggle,
  onOpenOutput,
  onAddOutput,
  onSelect,
}: OutputsSidebarProps) {
  const [tab, setTab] = useState<typeof TAB_DEFS[number]['id']>('datasets');
  const outputs = useMemo(() => {
    return nodes
      .map(classifyOutput)
      .filter((entry): entry is ClassifiedOutput => entry !== null);
  }, [nodes]);
  const fallbackSource = useMemo(() => {
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      if (!classifyOutput(nodes[index])) return nodes[index];
    }
    return nodes[nodes.length - 1] ?? null;
  }, [nodes]);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="of-button"
        aria-label="Show outputs sidebar"
        title="Show outputs"
        style={{
          position: 'absolute',
          right: 0,
          top: 12,
          zIndex: 4,
          padding: '6px 4px',
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          fontSize: 11,
          background: '#fff',
        }}
      >
        Pipeline outputs <Glyph name="chevron-left" size={10} />
      </button>
    );
  }

  const activeTabDef = TAB_DEFS.find((entry) => entry.id === tab) ?? TAB_DEFS[0];
  const visible = outputs.filter((entry) => activeTabDef.kinds.includes(entry.kind));
  const addableKind: AddableKind = activeTabDef.id === 'object_types'
    ? 'object_type'
    : activeTabDef.id === 'link_types'
      ? 'link_type'
      : 'dataset';

  return (
    <aside
      aria-label="Pipeline outputs"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 280,
        zIndex: 5,
        background: '#fff',
        borderLeft: '1px solid var(--border-default)',
        display: 'grid',
        gridTemplateRows: 'auto auto 1fr',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <strong style={{ fontSize: 13 }}>Pipeline outputs</strong>
        <button
          type="button"
          onClick={onToggle}
          className="of-button"
          aria-label="Hide outputs sidebar"
          title="Hide outputs"
          style={{ padding: '2px 6px', fontSize: 11 }}
        >
          <Glyph name="chevron-right" size={11} />
        </button>
      </header>
      <div role="tablist" style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)' }}>
        {TAB_DEFS.map((entry) => {
          const count = outputs.filter((output) => entry.kinds.includes(output.kind)).length;
          const active = entry.id === tab;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(entry.id)}
              className="of-button"
              style={{
                flex: 1,
                fontSize: 11,
                background: active ? '#eff6ff' : 'transparent',
                border: 0,
                borderBottom: `2px solid ${active ? '#2d72d2' : 'transparent'}`,
                borderRadius: 0,
                padding: '6px 4px',
              }}
            >
              {entry.label}{' '}
              <span className="of-text-muted" style={{ fontSize: 10 }}>({count})</span>
            </button>
          );
        })}
      </div>
      <div style={{ overflowY: 'auto', padding: 10, display: 'grid', gap: 6 }}>
        {visible.length === 0 ? (
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
            No {activeTabDef.label.toLowerCase()} yet. Use "Add output" to create one.
          </p>
        ) : (
          visible.map((entry) => {
            const icon = iconForKind(entry.kind);
            return (
              <div
                key={entry.node.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 4,
                  background: '#fff',
                }}
              >
                <Glyph name={icon.name} size={14} tone={icon.tone} />
                <button
                  type="button"
                  onClick={() => onSelect?.(entry.node)}
                  className="of-button"
                  style={{ flex: 1, justifyContent: 'flex-start', background: 'transparent', border: 0, fontSize: 12, padding: 0 }}
                  title="Select on canvas"
                >
                  {entry.node.label || entry.node.id}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenOutput?.(entry.node)}
                  className="of-button"
                  aria-label={`Edit ${entry.node.label || entry.node.id}`}
                  style={{ fontSize: 11, padding: '2px 6px' }}
                >
                  Edit
                </button>
              </div>
            );
          })
        )}
        {fallbackSource && (
          <button
            type="button"
            onClick={() => onAddOutput?.(fallbackSource, addableKind)}
            className="of-button"
            style={{ fontSize: 12, justifyContent: 'flex-start' }}
          >
            <Glyph name="plus" size={11} /> Add {activeTabDef.label.toLowerCase().replace(/s$/, '')}
          </button>
        )}
      </div>
    </aside>
  );
}

import type { PipelineNode } from '@/lib/api/pipelines';

const CLIPBOARD_KEY = 'pipelineBuilderClipboard.v1';

interface ClipboardPayload {
  version: 1;
  nodes: PipelineNode[];
}

export function writeNodesToClipboard(nodes: PipelineNode[]): boolean {
  if (nodes.length === 0) return false;
  const payload: ClipboardPayload = { version: 1, nodes: nodes.map(stripVolatile) };
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(payload));
    }
    return true;
  } catch {
    return false;
  }
}

export function readNodesFromClipboard(): PipelineNode[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CLIPBOARD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<ClipboardPayload>;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.nodes)) return [];
    return parsed.nodes.filter(Boolean) as PipelineNode[];
  } catch {
    return [];
  }
}

function stripVolatile(node: PipelineNode): PipelineNode {
  // Drop output_dataset_id so the paste doesn't accidentally collide with an
  // existing dataset; the user can wire a fresh output later.
  return {
    ...node,
    depends_on: [...node.depends_on],
    input_dataset_ids: [...node.input_dataset_ids],
    output_dataset_id: null,
  };
}

interface PasteResult {
  nodes: PipelineNode[];
  inserted: PipelineNode[];
}

/**
 * mergePastedNodes appends a copy of `pasted` to `existing`, remapping every
 * pasted node id so it's unique within the merged graph. Internal edges
 * between pasted nodes are preserved (remapped to the new ids); edges that
 * point to nodes outside the clipboard are dropped so paste cannot
 * silently rewire an unrelated existing graph.
 *
 * Labels are suffixed with `(copy)` for the user to disambiguate.
 */
export function mergePastedNodes(existing: PipelineNode[], pasted: PipelineNode[]): PasteResult {
  if (pasted.length === 0) return { nodes: existing, inserted: [] };
  const usedIds = new Set(existing.map((n) => n.id));
  const idRemap = new Map<string, string>();
  const inserted: PipelineNode[] = [];
  for (const node of pasted) {
    const nextId = pickUniqueId(`${node.id}_copy`, usedIds);
    idRemap.set(node.id, nextId);
    usedIds.add(nextId);
  }
  for (const node of pasted) {
    const remappedDeps = node.depends_on
      .map((dep) => idRemap.get(dep))
      .filter((dep): dep is string => Boolean(dep));
    inserted.push({
      ...node,
      id: idRemap.get(node.id)!,
      label: appendCopySuffix(node.label),
      depends_on: remappedDeps,
      input_dataset_ids: [...node.input_dataset_ids],
      output_dataset_id: null,
    });
  }
  return { nodes: [...existing, ...inserted], inserted };
}

function pickUniqueId(base: string, used: Set<string>): string {
  const sanitized = base.replace(/[^a-zA-Z0-9_]+/g, '_').toLowerCase() || 'node';
  if (!used.has(sanitized)) return sanitized;
  let counter = 2;
  while (used.has(`${sanitized}_${counter}`)) counter += 1;
  return `${sanitized}_${counter}`;
}

function appendCopySuffix(label: string): string {
  if (/\(copy(?: \d+)?\)$/.test(label)) return label;
  return `${label} (copy)`;
}

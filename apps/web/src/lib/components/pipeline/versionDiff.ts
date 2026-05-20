import { pipelineNodesFromDAG, type PipelineDAG, type PipelineNode } from '@/lib/api/pipelines';

export interface FieldDiff {
  field: 'label' | 'transform_type' | 'depends_on' | 'config';
  before: unknown;
  after: unknown;
}

export interface ModifiedNodeDiff {
  before: PipelineNode;
  after: PipelineNode;
  changes: FieldDiff[];
}

export interface PipelineVersionDiff {
  added: PipelineNode[];
  removed: PipelineNode[];
  modified: ModifiedNodeDiff[];
  unchanged: PipelineNode[];
}

function configCanonical(config: Record<string, unknown>): string {
  // JSON.stringify with sorted keys gives us a deterministic comparison string
  // without pulling in a deep-equal dependency.
  return JSON.stringify(config, Object.keys(config ?? {}).sort());
}

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function nodeChanges(before: PipelineNode, after: PipelineNode): FieldDiff[] {
  const changes: FieldDiff[] = [];
  if (before.label !== after.label) {
    changes.push({ field: 'label', before: before.label, after: after.label });
  }
  if (before.transform_type !== after.transform_type) {
    changes.push({ field: 'transform_type', before: before.transform_type, after: after.transform_type });
  }
  if (!sameStringArray(before.depends_on, after.depends_on)) {
    changes.push({ field: 'depends_on', before: before.depends_on, after: after.depends_on });
  }
  if (configCanonical(before.config) !== configCanonical(after.config)) {
    changes.push({ field: 'config', before: before.config, after: after.config });
  }
  return changes;
}

/**
 * diffPipelineVersions compares the node graphs of two pipeline versions.
 * Nodes are matched by id; the result classifies each node as added,
 * removed, modified (with per-field changes), or unchanged.
 */
export function diffPipelineVersions(before: PipelineDAG | null | undefined, after: PipelineDAG | null | undefined): PipelineVersionDiff {
  const beforeNodes = pipelineNodesFromDAG(before);
  const afterNodes = pipelineNodesFromDAG(after);
  const beforeById = new Map(beforeNodes.map((node) => [node.id, node]));
  const afterById = new Map(afterNodes.map((node) => [node.id, node]));

  const diff: PipelineVersionDiff = { added: [], removed: [], modified: [], unchanged: [] };

  for (const node of afterNodes) {
    const prior = beforeById.get(node.id);
    if (!prior) {
      diff.added.push(node);
      continue;
    }
    const changes = nodeChanges(prior, node);
    if (changes.length === 0) diff.unchanged.push(node);
    else diff.modified.push({ before: prior, after: node, changes });
  }
  for (const node of beforeNodes) {
    if (!afterById.has(node.id)) diff.removed.push(node);
  }
  return diff;
}

export function diffSummary(diff: PipelineVersionDiff): { label: string; tone: string } {
  if (diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0) {
    return { label: 'No changes', tone: 'var(--text-muted)' };
  }
  const parts: string[] = [];
  if (diff.added.length > 0) parts.push(`+${diff.added.length} added`);
  if (diff.removed.length > 0) parts.push(`−${diff.removed.length} removed`);
  if (diff.modified.length > 0) parts.push(`~${diff.modified.length} modified`);
  return { label: parts.join(' · '), tone: 'var(--text-strong)' };
}

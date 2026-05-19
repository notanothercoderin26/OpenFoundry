import { useCallback, useEffect, useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import { notifications } from '@/lib/stores/notifications';
import { traverse, type ObjectRef, type TraverseResultGroup } from '@/lib/api/vertexTraversal';
import {
  createSearchAround,
  getSearchAround,
  type SearchAroundParameter,
  type SearchAroundStep,
} from '@/lib/api/vertexSearchArounds';

import { StepEditor } from './StepEditor';
import { ParameterEditor } from './ParameterEditor';
import { SaveSearchAroundModal } from './SaveSearchAroundModal';
import { LoadSearchAroundModal } from './LoadSearchAroundModal';

interface SearchAroundPanelProps {
  open: boolean;
  onClose: () => void;
  tenant: string;
  startingSet: ObjectRef[];
  branchContext?: string;
  // Notifies the parent (VertexPage) that the user pressed "Add to
  // graph"; the parent merges the results into the Cytoscape canvas.
  onAddToGraph: (groups: TraverseResultGroup[]) => void;
  // Notifies the parent that "Set starting objects" was clicked — the
  // parent should open a canvas selection picker and call back into
  // the panel via `setStartingSet`.
  onRequestSetStartingObjects?: () => void;
}

// Multi-step Search Around builder. Tabs let the user keep multiple
// in-progress searches side-by-side (matching the Palantir UI's
// "Search Around 1 / Flight Search Around" tab strip). Each tab
// holds its own draft of `steps[]` + `parameters[]`. Save dumps the
// active tab to vertex-service; Load picks a saved one and prompts
// the parent to set the starting object set from the canvas.
export function SearchAroundPanel({
  open,
  onClose,
  tenant,
  startingSet,
  branchContext,
  onAddToGraph,
  onRequestSetStartingObjects,
}: SearchAroundPanelProps) {
  const [tabs, setTabs] = useState<TabState[]>([emptyTab(1)]);
  const [activeId, setActiveId] = useState<string>(tabs[0].id);
  const [showSave, setShowSave] = useState(false);
  const [showLoad, setShowLoad] = useState(false);

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const startingObjectTypeId = useMemo(() => {
    return startingSet[0]?.object_type_id ?? active.startingObjectTypeId;
  }, [startingSet, active.startingObjectTypeId]);

  function patchActive(patch: Partial<TabState>) {
    setTabs((prev) => prev.map((t) => (t.id === active.id ? { ...t, ...patch } : t)));
  }

  function addTab() {
    const next = emptyTab(tabs.length + 1);
    setTabs([...tabs, next]);
    setActiveId(next.id);
  }

  function closeTab(id: string) {
    const remaining = tabs.filter((t) => t.id !== id);
    if (remaining.length === 0) remaining.push(emptyTab(1));
    setTabs(remaining);
    if (activeId === id) setActiveId(remaining[0].id);
  }

  const runPreview = useCallback(async () => {
    if (!active.steps.length || !tenant) return;
    if (!startingSet.length && !startingObjectTypeId) return;
    patchActive({ previewing: true, previewError: '' });
    try {
      const res = await traverse({
        tenant,
        starting_set: startingSet,
        steps: active.steps,
        parameter_values_json: parametersToValuesMap(active.parameters),
        branch_context: branchContext,
      });
      patchActive({
        resultsByOrdinal: indexByOrdinal(active.steps, res.groups),
        previewing: false,
      });
    } catch (cause: unknown) {
      patchActive({
        previewing: false,
        previewError: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }, [active.steps, active.parameters, tenant, startingSet, branchContext, startingObjectTypeId]);

  // Auto-preview when the steps / params / starting set changes.
  // Debounced lightly through a microtask so consecutive edits don't
  // hammer the backend.
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(runPreview, 300);
    return () => clearTimeout(handle);
  }, [open, runPreview]);

  async function handleAddToGraph() {
    if (!active.steps.length) {
      notifications.error('Add at least one link before adding to the graph');
      return;
    }
    try {
      const res = await traverse({
        tenant,
        starting_set: startingSet,
        steps: active.steps,
        parameter_values_json: parametersToValuesMap(active.parameters),
        branch_context: branchContext,
      });
      onAddToGraph(res.groups);
      notifications.success(
        `Added ${res.groups.reduce((acc, g) => acc + g.items.length, 0)} objects to the graph`,
      );
    } catch (cause: unknown) {
      notifications.error(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function handleSave(params: { title: string; description: string; projectId: string }) {
    if (!startingObjectTypeId) {
      notifications.error('Set the starting object type before saving');
      return;
    }
    try {
      const saved = await createSearchAround({
        title: params.title,
        description: params.description,
        starting_object_type_id: startingObjectTypeId,
        steps: active.steps,
        parameters: active.parameters,
        project_id: params.projectId || null,
      });
      patchActive({ savedRid: saved.rid, title: saved.title });
      notifications.success(`Saved as “${saved.title}”`);
      setShowSave(false);
    } catch (cause: unknown) {
      notifications.error(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function handleLoad(id: string) {
    try {
      const sa = await getSearchAround(id);
      const next: TabState = {
        id: randomId(),
        title: sa.title,
        startingObjectTypeId: sa.starting_object_type_id,
        steps: sa.steps,
        parameters: sa.parameters,
        savedRid: sa.rid,
        resultsByOrdinal: {},
      };
      setTabs([...tabs, next]);
      setActiveId(next.id);
      setShowLoad(false);
      notifications.info(`Loaded “${sa.title}”. Select starting objects on the canvas.`);
      if (onRequestSetStartingObjects) onRequestSetStartingObjects();
    } catch (cause: unknown) {
      notifications.error(cause instanceof Error ? cause.message : String(cause));
    }
  }

  if (!open) return null;

  return (
    <aside
      aria-label="Search Around"
      style={{
        position: 'fixed',
        top: 60,
        right: 0,
        bottom: 0,
        width: 380,
        zIndex: 30,
        background: 'var(--surface-default, #fff)',
        borderLeft: '1px solid var(--border-default)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-2px 0 8px rgba(0,0,0,0.08)',
      }}
    >
      <header
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-default)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Glyph name="graph" size={14} />
        <strong style={{ fontSize: 13 }}>Search Around</strong>
        <button
          type="button"
          className="of-btn of-btn-ghost"
          style={{ marginLeft: 'auto', minHeight: 24, padding: '0 6px' }}
          onClick={onClose}
          aria-label="Close panel"
        >
          <Glyph name="x" size={12} />
        </button>
      </header>

      {/* Tab strip */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: '6px 10px',
          borderBottom: '1px solid var(--border-default)',
          overflowX: 'auto',
        }}
      >
        {tabs.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`of-btn ${t.id === activeId ? 'of-btn-primary' : 'of-btn-ghost'}`}
            style={{ minHeight: 24, fontSize: 11, padding: '0 8px' }}
            onClick={() => setActiveId(t.id)}
          >
            {t.title}
            {t.savedRid ? '' : '*'}
            {tabs.length > 1 && (
              <span
                aria-label={`Close ${t.title}`}
                role="button"
                style={{ marginLeft: 6, opacity: 0.6 }}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
              >
                ×
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          className="of-btn of-btn-ghost"
          onClick={addTab}
          title="New search-around"
          style={{ minHeight: 24, padding: '0 6px' }}
        >
          <Glyph name="plus" size={12} />
        </button>
        <button
          type="button"
          className="of-btn of-btn-ghost"
          onClick={() => setShowLoad(true)}
          title="Load saved Search Around"
          style={{ minHeight: 24, padding: '0 6px', marginLeft: 4 }}
        >
          <Glyph name="folder" size={12} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
        <ParameterEditor
          parameters={active.parameters}
          onChange={(parameters) => patchActive({ parameters })}
        />

        <section
          className="of-panel"
          style={{ padding: 10, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Glyph name="object" size={12} />
          <strong style={{ fontSize: 12 }}>Starting objects</strong>
          <span className="of-chip of-status-info" style={{ marginLeft: 'auto' }}>
            {startingSet.length}
          </span>
          {onRequestSetStartingObjects && (
            <button
              type="button"
              className="of-btn of-btn-ghost"
              onClick={onRequestSetStartingObjects}
              style={{ fontSize: 11, padding: '0 6px', minHeight: 24 }}
            >
              Set starting objects
            </button>
          )}
        </section>

        {active.steps.map((step, idx) => (
          <StepEditor
            key={idx}
            step={step}
            startingObjectTypeId={
              idx === 0 ? startingObjectTypeId : active.steps[idx - 1].relation_id || ''
            }
            parameters={active.parameters}
            resultingCount={active.resultsByOrdinal[step.ordinal]?.total}
            resultingTypeName={active.resultsByOrdinal[step.ordinal]?.label}
            onChange={(next) =>
              patchActive({
                steps: active.steps.map((s, i) => (i === idx ? next : s)),
              })
            }
            onDelete={() =>
              patchActive({ steps: active.steps.filter((_, i) => i !== idx) })
            }
          />
        ))}

        <button
          type="button"
          className="of-btn"
          onClick={() =>
            patchActive({
              steps: [
                ...active.steps,
                { ordinal: active.steps.length, relation_id: '', direction: 'outgoing', filters: [] },
              ],
            })
          }
          style={{ marginTop: 4, width: '100%' }}
          disabled={!startingObjectTypeId}
        >
          <Glyph name="plus" size={12} /> Add link
        </button>

        {active.previewError && (
          <div className="of-status-warning" style={{ marginTop: 8, fontSize: 11 }}>
            {active.previewError}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer
        style={{
          padding: '8px 10px',
          borderTop: '1px solid var(--border-default)',
          display: 'flex',
          gap: 6,
        }}
      >
        <button
          type="button"
          className="of-btn of-btn-ghost"
          onClick={() => setShowSave(true)}
          disabled={!active.steps.length || !startingObjectTypeId}
        >
          Save…
        </button>
        <button
          type="button"
          className="of-btn of-btn-primary"
          onClick={() => void handleAddToGraph()}
          style={{ marginLeft: 'auto' }}
          disabled={!active.steps.length || active.previewing}
        >
          Add to graph
        </button>
      </footer>

      <SaveSearchAroundModal
        open={showSave}
        defaultTitle={active.title}
        onCancel={() => setShowSave(false)}
        onSave={(p) => void handleSave(p)}
      />
      <LoadSearchAroundModal
        open={showLoad}
        startingObjectTypeId={startingObjectTypeId}
        onCancel={() => setShowLoad(false)}
        onLoad={(id) => void handleLoad(id)}
      />
    </aside>
  );
}

interface TabState {
  id: string;
  title: string;
  startingObjectTypeId: string;
  steps: SearchAroundStep[];
  parameters: SearchAroundParameter[];
  savedRid?: string;
  resultsByOrdinal: Record<number, { total: number; label?: string }>;
  previewing?: boolean;
  previewError?: string;
}

function emptyTab(n: number): TabState {
  return {
    id: randomId(),
    title: `Search Around ${n}`,
    startingObjectTypeId: '',
    steps: [],
    parameters: [],
    resultsByOrdinal: {},
  };
}

function randomId(): string {
  return 'sa-' + Math.random().toString(36).slice(2, 10);
}

function parametersToValuesMap(params: SearchAroundParameter[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of params) {
    if (p.default_value_json !== undefined) out[p.name] = p.default_value_json;
  }
  return out;
}

function indexByOrdinal(steps: SearchAroundStep[], groups: TraverseResultGroup[]) {
  // The traverse endpoint only returns the FINAL groups today; we
  // surface the same total on the last step, leaving earlier steps
  // blank ("—"). When the backend grows per-step cost reporting we
  // populate every ordinal.
  const out: Record<number, { total: number; label?: string }> = {};
  const lastStep = steps[steps.length - 1];
  if (!lastStep) return out;
  out[lastStep.ordinal] = {
    total: groups.reduce((acc, g) => acc + g.total, 0),
  };
  return out;
}

export type { ObjectRef } from '@/lib/api/vertexTraversal';

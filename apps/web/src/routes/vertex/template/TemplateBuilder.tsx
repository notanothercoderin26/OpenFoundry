import { useCallback, useEffect, useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import {
  createGraphTemplate,
  emptyGraphTemplateBuilderState,
  localId,
  type CreateGraphTemplateRequest,
  type GraphTemplate,
  type GraphTemplateLayerConfig,
  type GraphTemplateNonObjectParameter,
  type GraphTemplateObjectParameter,
  type GraphTemplateSearchAround,
  type NonObjectValueType,
  type SearchAroundKind,
} from '@/lib/api/vertexTemplates';

// Layer presented to the builder by the parent page (the source graph
// it was opened against). The builder only needs the id + a label;
// every other attribute lives on the graph itself.
export interface BuilderLayerOption {
  id: string;
  label: string;
}

export interface ObjectTypeOption {
  id: string;
  display_name: string;
}

export interface TemplateBuilderProps {
  open: boolean;
  onClose: () => void;
  sourceGraphId: string | null;
  availableLayers: BuilderLayerOption[];
  availableObjectTypes: ObjectTypeOption[];
  availableLayouts?: string[];
  onSaved?: (template: GraphTemplate) => void;
}

type SectionKey = 'parameters' | 'search-arounds' | 'layers' | 'graph' | 'defaults';

const SECTIONS: Array<{ key: SectionKey; index: number; title: string; subtitle: string }> = [
  {
    key: 'parameters',
    index: 1,
    title: 'Configure parameters',
    subtitle: 'Declare which objects and scalars the template asks for.',
  },
  {
    key: 'search-arounds',
    index: 2,
    title: 'Configure Search Arounds',
    subtitle: 'Bind each object parameter to a relation, function, or saved Search Around.',
  },
  {
    key: 'layers',
    index: 3,
    title: 'Configure layers',
    subtitle: 'Keep or drop each layer; toggle whether the styling carries over.',
  },
  {
    key: 'graph',
    index: 4,
    title: 'Configure graph',
    subtitle: 'Name, description, and layout for the generated graph.',
  },
  {
    key: 'defaults',
    index: 5,
    title: 'Configure defaults',
    subtitle: 'Pinned items and any other defaults that ship with the template.',
  },
];

const DEFAULT_LAYOUTS = ['auto', 'hierarchical', 'force-directed', 'radial', 'grid'];

export function TemplateBuilder(props: TemplateBuilderProps) {
  const { open, onClose, sourceGraphId, availableLayers, availableObjectTypes, availableLayouts, onSaved } = props;
  const layouts = availableLayouts && availableLayouts.length > 0 ? availableLayouts : DEFAULT_LAYOUTS;

  const [state, setState] = useState<CreateGraphTemplateRequest>(() =>
    emptyGraphTemplateBuilderState(sourceGraphId),
  );
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    parameters: true,
    'search-arounds': false,
    layers: false,
    graph: false,
    defaults: false,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Re-seed the layer config block when the source graph (and its
  // layer list) change — we keep every layer included by default so
  // first-time users do not lose work silently.
  useEffect(() => {
    if (!open) return;
    setState((prev) => ({
      ...prev,
      source_graph_id: sourceGraphId,
      layer_config: reconcileLayerConfig(prev.layer_config, availableLayers),
    }));
  }, [open, sourceGraphId, availableLayers]);

  const titleHasIssue = state.title.trim().length === 0;
  const paramsHaveIssues = useMemo(
    () => validateParameters(state.object_parameters, state.non_object_parameters),
    [state.object_parameters, state.non_object_parameters],
  );
  const canSave = !titleHasIssue && paramsHaveIssues.length === 0 && !saving;

  const toggleSection = (key: SectionKey) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const setField = <K extends keyof CreateGraphTemplateRequest>(key: K, value: CreateGraphTemplateRequest[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const addObjectParameter = () =>
    setField('object_parameters', [
      ...state.object_parameters,
      {
        id: localId('op'),
        name: '',
        description: '',
        object_type_id: availableObjectTypes[0]?.id ?? '',
        required: true,
        single_object: false,
      },
    ]);

  const updateObjectParameter = (id: string, patch: Partial<GraphTemplateObjectParameter>) =>
    setField(
      'object_parameters',
      state.object_parameters.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );

  const removeObjectParameter = (id: string) => {
    setField(
      'object_parameters',
      state.object_parameters.filter((p) => p.id !== id),
    );
    setField(
      'search_arounds',
      state.search_arounds.filter((sa) => sa.object_parameter_id !== id),
    );
  };

  const addNonObjectParameter = () =>
    setField('non_object_parameters', [
      ...state.non_object_parameters,
      {
        id: localId('np'),
        name: '',
        description: '',
        value_type: 'integer',
        required: false,
      },
    ]);

  const updateNonObjectParameter = (id: string, patch: Partial<GraphTemplateNonObjectParameter>) =>
    setField(
      'non_object_parameters',
      state.non_object_parameters.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );

  const removeNonObjectParameter = (id: string) =>
    setField(
      'non_object_parameters',
      state.non_object_parameters.filter((p) => p.id !== id),
    );

  const addSearchAround = (objectParameterId: string) =>
    setField('search_arounds', [
      ...state.search_arounds,
      {
        id: localId('sa'),
        object_parameter_id: objectParameterId,
        kind: 'relation',
        config: {},
      },
    ]);

  const updateSearchAround = (id: string, patch: Partial<GraphTemplateSearchAround>) =>
    setField(
      'search_arounds',
      state.search_arounds.map((sa) => (sa.id === id ? { ...sa, ...patch } : sa)),
    );

  const removeSearchAround = (id: string) =>
    setField(
      'search_arounds',
      state.search_arounds.filter((sa) => sa.id !== id),
    );

  const updateLayerConfig = (layerId: string, patch: Partial<GraphTemplateLayerConfig>) =>
    setField(
      'layer_config',
      state.layer_config.map((l) => (l.layer_id === layerId ? { ...l, ...patch } : l)),
    );

  const togglePinned = (item: string) => {
    const pinned = state.defaults.pinned_items;
    const next = pinned.includes(item) ? pinned.filter((x) => x !== item) : [...pinned, item];
    setField('defaults', { ...state.defaults, pinned_items: next });
  };

  const onSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await createGraphTemplate(state);
      onSaved?.(saved);
      onClose();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }, [canSave, state, onSaved, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Save graph as template"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(560px, 100%)',
        background: 'rgba(15, 23, 42, 0.96)',
        borderLeft: '1px solid rgba(148, 163, 184, 0.25)',
        boxShadow: '-12px 0 32px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 90,
      }}
    >
      <header
        style={{
          padding: 16,
          borderBottom: '1px solid rgba(148, 163, 184, 0.15)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div>
          <p className="of-eyebrow" style={{ margin: 0 }}>Graph templates</p>
          <h2 className="of-heading-md" style={{ margin: '4px 0 0' }}>Save as template</h2>
        </div>
        <button type="button" className="of-btn of-btn-ghost" onClick={onClose} aria-label="Close">
          <Glyph name="x" size={14} />
        </button>
      </header>

      <div style={{ padding: 16, overflowY: 'auto', flex: 1, display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="of-eyebrow">Template name *</span>
          <input
            className="of-input"
            value={state.title}
            onChange={(e) => setField('title', e.target.value)}
            placeholder="e.g. Late shipments by customer"
          />
          {titleHasIssue && (
            <span style={{ color: '#f87171', fontSize: 12 }}>A template name is required.</span>
          )}
        </label>

        <label style={{ display: 'grid', gap: 4 }}>
          <span className="of-eyebrow">Description</span>
          <textarea
            className="of-input"
            value={state.description}
            onChange={(e) => setField('description', e.target.value)}
            rows={2}
            placeholder="What does this template generate? When should it be used?"
            style={{ resize: 'vertical' }}
          />
        </label>

        {SECTIONS.map((section) => {
          const isOpen = expanded[section.key];
          return (
            <section
              key={section.key}
              className="of-panel"
              style={{ padding: 0, border: '1px solid rgba(148, 163, 184, 0.2)' }}
            >
              <button
                type="button"
                onClick={() => toggleSection(section.key)}
                aria-expanded={isOpen}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: 'rgba(167, 139, 250, 0.18)',
                    color: '#a78bfa',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  {section.index}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{section.title}</p>
                  <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 12, lineHeight: 1.4 }}>
                    {section.subtitle}
                  </p>
                </div>
                <Glyph name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} />
              </button>
              {isOpen && (
                <div style={{ padding: '0 14px 14px', display: 'grid', gap: 12 }}>
                  {section.key === 'parameters' && (
                    <ParametersSection
                      objectParameters={state.object_parameters}
                      nonObjectParameters={state.non_object_parameters}
                      availableObjectTypes={availableObjectTypes}
                      issues={paramsHaveIssues}
                      onAddObject={addObjectParameter}
                      onUpdateObject={updateObjectParameter}
                      onRemoveObject={removeObjectParameter}
                      onAddNonObject={addNonObjectParameter}
                      onUpdateNonObject={updateNonObjectParameter}
                      onRemoveNonObject={removeNonObjectParameter}
                    />
                  )}
                  {section.key === 'search-arounds' && (
                    <SearchAroundsSection
                      objectParameters={state.object_parameters}
                      searchArounds={state.search_arounds}
                      onAdd={addSearchAround}
                      onUpdate={updateSearchAround}
                      onRemove={removeSearchAround}
                    />
                  )}
                  {section.key === 'layers' && (
                    <LayersSection
                      layers={availableLayers}
                      layerConfig={state.layer_config}
                      onUpdate={updateLayerConfig}
                    />
                  )}
                  {section.key === 'graph' && (
                    <GraphSection
                      graphConfig={state.graph_config}
                      layouts={layouts}
                      onChange={(patch) =>
                        setField('graph_config', { ...state.graph_config, ...patch })
                      }
                    />
                  )}
                  {section.key === 'defaults' && (
                    <DefaultsSection
                      objectParameters={state.object_parameters}
                      pinnedItems={state.defaults.pinned_items}
                      onToggle={togglePinned}
                    />
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <footer
        style={{
          padding: 14,
          borderTop: '1px solid rgba(148, 163, 184, 0.15)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span className="of-text-muted" style={{ fontSize: 12 }}>
          {state.object_parameters.length} object · {state.non_object_parameters.length} value ·{' '}
          {state.search_arounds.length} search-around · {state.layer_config.filter((l) => l.include).length} layer(s)
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="of-btn of-btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="of-btn of-btn-primary" disabled={!canSave} onClick={onSave}>
            {saving ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </footer>

      {saveError && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            bottom: 64,
            left: 14,
            right: 14,
            padding: 10,
            borderRadius: 8,
            background: 'rgba(248, 113, 113, 0.18)',
            color: '#fecaca',
            fontSize: 12,
          }}
        >
          {saveError}
        </div>
      )}
    </div>
  );
}

// ─── Section components ────────────────────────────────────────────

interface ParametersSectionProps {
  objectParameters: GraphTemplateObjectParameter[];
  nonObjectParameters: GraphTemplateNonObjectParameter[];
  availableObjectTypes: ObjectTypeOption[];
  issues: string[];
  onAddObject: () => void;
  onUpdateObject: (id: string, patch: Partial<GraphTemplateObjectParameter>) => void;
  onRemoveObject: (id: string) => void;
  onAddNonObject: () => void;
  onUpdateNonObject: (id: string, patch: Partial<GraphTemplateNonObjectParameter>) => void;
  onRemoveNonObject: (id: string) => void;
}

function ParametersSection(p: ParametersSectionProps) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Object parameters</p>
          <button type="button" className="of-btn of-btn-ghost" onClick={p.onAddObject}>
            <Glyph name="plus" size={12} /> Add
          </button>
        </header>
        {p.objectParameters.length === 0 && (
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
            No object parameters yet. Add at least one to ground the template.
          </p>
        )}
        {p.objectParameters.map((op) => (
          <article key={op.id} className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="of-input"
                value={op.name}
                placeholder="Parameter name"
                onChange={(e) => p.onUpdateObject(op.id, { name: e.target.value })}
                style={{ flex: 1 }}
              />
              <select
                className="of-select"
                value={op.object_type_id}
                onChange={(e) => p.onUpdateObject(op.id, { object_type_id: e.target.value })}
              >
                <option value="">(Pick a type)</option>
                {p.availableObjectTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.display_name}</option>
                ))}
              </select>
              <button type="button" className="of-btn of-btn-ghost" onClick={() => p.onRemoveObject(op.id)} aria-label="Remove parameter">
                <Glyph name="trash" size={12} />
              </button>
            </div>
            <input
              className="of-input"
              value={op.description}
              placeholder="Short description (optional)"
              onChange={(e) => p.onUpdateObject(op.id, { description: e.target.value })}
            />
            <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={op.required}
                  onChange={(e) => p.onUpdateObject(op.id, { required: e.target.checked })}
                />
                Required
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={op.single_object}
                  onChange={(e) => p.onUpdateObject(op.id, { single_object: e.target.checked })}
                />
                Single object
              </label>
            </div>
          </article>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Non-object parameters</p>
          <button type="button" className="of-btn of-btn-ghost" onClick={p.onAddNonObject}>
            <Glyph name="plus" size={12} /> Add
          </button>
        </header>
        {p.nonObjectParameters.length === 0 && (
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
            No scalar inputs. Useful for thresholds, hop counts, label filters, etc.
          </p>
        )}
        {p.nonObjectParameters.map((np) => (
          <article key={np.id} className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="of-input"
                value={np.name}
                placeholder="Parameter name"
                onChange={(e) => p.onUpdateNonObject(np.id, { name: e.target.value })}
                style={{ flex: 1 }}
              />
              <select
                className="of-select"
                value={np.value_type}
                onChange={(e) =>
                  p.onUpdateNonObject(np.id, { value_type: e.target.value as NonObjectValueType })
                }
              >
                <option value="integer">integer</option>
                <option value="double">double</option>
                <option value="string">string</option>
                <option value="boolean">boolean</option>
              </select>
              <button type="button" className="of-btn of-btn-ghost" onClick={() => p.onRemoveNonObject(np.id)} aria-label="Remove parameter">
                <Glyph name="trash" size={12} />
              </button>
            </div>
            <input
              className="of-input"
              value={np.description}
              placeholder="Short description (optional)"
              onChange={(e) => p.onUpdateNonObject(np.id, { description: e.target.value })}
            />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={np.required}
                onChange={(e) => p.onUpdateNonObject(np.id, { required: e.target.checked })}
              />
              Required
            </label>
          </article>
        ))}
      </div>

      {p.issues.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#facc15' }}>
          {p.issues.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface SearchAroundsSectionProps {
  objectParameters: GraphTemplateObjectParameter[];
  searchArounds: GraphTemplateSearchAround[];
  onAdd: (objectParameterId: string) => void;
  onUpdate: (id: string, patch: Partial<GraphTemplateSearchAround>) => void;
  onRemove: (id: string) => void;
}

function SearchAroundsSection(p: SearchAroundsSectionProps) {
  if (p.objectParameters.length === 0) {
    return (
      <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
        Add at least one object parameter first.
      </p>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {p.objectParameters.map((op) => {
        const owned = p.searchArounds.filter((sa) => sa.object_parameter_id === op.id);
        return (
          <article key={op.id} className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                <strong>{op.name || '(unnamed)'}</strong>{' '}
                <span className="of-text-muted">→ {op.object_type_id || 'no type'}</span>
              </p>
              <button type="button" className="of-btn of-btn-ghost" onClick={() => p.onAdd(op.id)}>
                <Glyph name="plus" size={12} /> Search Around
              </button>
            </header>
            {owned.length === 0 && (
              <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
                No bindings. The parameter will be added to the graph without follow-up traversal.
              </p>
            )}
            {owned.map((sa) => (
              <div key={sa.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  className="of-select"
                  value={sa.kind}
                  onChange={(e) => p.onUpdate(sa.id, { kind: e.target.value as SearchAroundKind })}
                >
                  <option value="relation">Relation</option>
                  <option value="function">Function</option>
                  <option value="saved">Saved Search Around</option>
                </select>
                <input
                  className="of-input"
                  value={typeof sa.config === 'object' ? JSON.stringify(sa.config) : String(sa.config ?? '')}
                  placeholder='Config JSON, e.g. {"link":"shipment.customer_id"}'
                  onChange={(e) => {
                    let parsed: unknown = e.target.value;
                    try {
                      parsed = JSON.parse(e.target.value);
                    } catch {
                      parsed = e.target.value;
                    }
                    p.onUpdate(sa.id, { config: parsed });
                  }}
                  style={{ flex: 1, fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12 }}
                />
                <button type="button" className="of-btn of-btn-ghost" onClick={() => p.onRemove(sa.id)} aria-label="Remove Search Around">
                  <Glyph name="trash" size={12} />
                </button>
              </div>
            ))}
          </article>
        );
      })}
    </div>
  );
}

interface LayersSectionProps {
  layers: BuilderLayerOption[];
  layerConfig: GraphTemplateLayerConfig[];
  onUpdate: (layerId: string, patch: Partial<GraphTemplateLayerConfig>) => void;
}

function LayersSection(p: LayersSectionProps) {
  if (p.layers.length === 0) {
    return (
      <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
        The source graph has no styled layers yet.
      </p>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {p.layers.map((layer) => {
        const cfg = p.layerConfig.find((l) => l.layer_id === layer.id) ?? {
          layer_id: layer.id,
          include: true,
          keep_styling: true,
        };
        return (
          <div
            key={layer.id}
            className="of-panel-muted"
            style={{ padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
          >
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{layer.label}</p>
            <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={cfg.include}
                  onChange={(e) => p.onUpdate(layer.id, { include: e.target.checked })}
                />
                Include
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={cfg.keep_styling}
                  disabled={!cfg.include}
                  onChange={(e) => p.onUpdate(layer.id, { keep_styling: e.target.checked })}
                />
                Keep styling
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface GraphSectionProps {
  graphConfig: { display_name: string; description: string; layout: string };
  layouts: string[];
  onChange: (patch: Partial<GraphSectionProps['graphConfig']>) => void;
}

function GraphSection(p: GraphSectionProps) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <label style={{ display: 'grid', gap: 4 }}>
        <span className="of-eyebrow">Display name</span>
        <input
          className="of-input"
          value={p.graphConfig.display_name}
          placeholder="(falls back to the template name)"
          onChange={(e) => p.onChange({ display_name: e.target.value })}
        />
      </label>
      <label style={{ display: 'grid', gap: 4 }}>
        <span className="of-eyebrow">Description</span>
        <textarea
          className="of-input"
          value={p.graphConfig.description}
          rows={2}
          onChange={(e) => p.onChange({ description: e.target.value })}
          style={{ resize: 'vertical' }}
        />
      </label>
      <label style={{ display: 'grid', gap: 4 }}>
        <span className="of-eyebrow">Layout</span>
        <select
          className="of-select"
          value={p.graphConfig.layout}
          onChange={(e) => p.onChange({ layout: e.target.value })}
        >
          {p.layouts.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

interface DefaultsSectionProps {
  objectParameters: GraphTemplateObjectParameter[];
  pinnedItems: string[];
  onToggle: (item: string) => void;
}

function DefaultsSection(p: DefaultsSectionProps) {
  if (p.objectParameters.length === 0) {
    return (
      <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
        Add an object parameter to enable pinned items.
      </p>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
        Pin objects supplied to these parameters when the template renders.
      </p>
      {p.objectParameters.map((op) => {
        const pinned = p.pinnedItems.includes(op.id);
        return (
          <label
            key={op.id}
            className="of-panel-muted"
            style={{
              padding: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
            }}
          >
            <input type="checkbox" checked={pinned} onChange={() => p.onToggle(op.id)} />
            <span style={{ flex: 1, fontSize: 13 }}>{op.name || '(unnamed)'}</span>
            <span className="of-chip" style={{ fontSize: 11 }}>
              {pinned ? 'Pinned' : 'Not pinned'}
            </span>
          </label>
        );
      })}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────

function reconcileLayerConfig(
  current: GraphTemplateLayerConfig[],
  layers: BuilderLayerOption[],
): GraphTemplateLayerConfig[] {
  return layers.map((layer) => {
    const existing = current.find((l) => l.layer_id === layer.id);
    return existing ?? { layer_id: layer.id, include: true, keep_styling: true };
  });
}

function validateParameters(
  objectParams: GraphTemplateObjectParameter[],
  nonObjectParams: GraphTemplateNonObjectParameter[],
): string[] {
  const issues: string[] = [];
  for (const p of objectParams) {
    if (!p.name.trim()) issues.push('An object parameter is missing a name.');
    if (!p.object_type_id) issues.push(`Parameter "${p.name || p.id}" has no object type.`);
  }
  const ids = new Set<string>();
  for (const p of [...objectParams, ...nonObjectParams]) {
    if (ids.has(p.id)) issues.push(`Duplicate parameter id: ${p.id}`);
    ids.add(p.id);
  }
  return issues;
}

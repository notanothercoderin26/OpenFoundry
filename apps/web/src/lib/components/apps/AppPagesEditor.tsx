import { useEffect, useMemo, useState } from 'react';

import type { AppOverlay, AppPage, AppWidget, WidgetBinding, WidgetCatalogItem, WidgetEvent } from '@/lib/api/apps';
import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';
import { JsonEditor } from '@/lib/components/JsonEditor';
import { Tabs } from '@/lib/components/Tabs';
import { WidgetCatalog, getWidgetCatalogItems } from '@/lib/components/apps/WidgetCatalog';
import { LayoutTemplatePicker } from '@/lib/components/apps/LayoutTemplatePicker';

interface AppPagesEditorProps {
  pagesJson: string;
  widgetCatalog: WidgetCatalogItem[];
  onChange: (next: string) => void;
}

type BindingSource = 'none' | 'query' | 'dataset' | 'ontology' | 'object_set';

export const EMPTY_BINDING: WidgetBinding = {
  source_type: 'query',
  source_id: '',
  query_text: "select 'Example' as label, 128 as value",
  path: '',
  fields: [],
  parameters: {},
  limit: 50,
};

const WIDGET_GLYPH_BY_TYPE: Record<string, GlyphName> = {
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

export function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10_000)}`;
}

export function parsePages(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return { pages: [] as AppPage[], error: 'Pages JSON must be an array.' };
    return { pages: parsed as AppPage[], error: '' };
  } catch (cause) {
    return { pages: [] as AppPage[], error: cause instanceof Error ? cause.message : 'Invalid pages JSON.' };
  }
}

export function defaultWidget(item: WidgetCatalogItem): AppWidget {
  return {
    id: makeId('widget'),
    widget_type: item.widget_type,
    title: item.label || item.widget_type,
    description: item.description || '',
    position: {
      x: 0,
      y: 0,
      width: item.default_size?.width ?? 6,
      height: item.default_size?.height ?? 4,
    },
    props: item.default_props ?? {},
    binding: item.supported_bindings.length > 0 ? { ...EMPTY_BINDING, source_type: item.supported_bindings[0] } : null,
    events: item.widget_type === 'button'
      ? [{ id: makeId('event'), trigger: 'click', action: 'open_link', label: 'Open', config: { url: '/foundry-rules' } }]
      : [],
    children: [],
  };
}

export function defaultPage(): AppPage {
  return {
    id: makeId('page'),
    name: 'New page',
    path: '/new',
    description: '',
    layout: { kind: 'grid', columns: 12, gap: '1rem', max_width: '1280px' },
    widgets: [],
    visible: true,
  };
}

export function defaultOverlay(): AppOverlay {
  return {
    id: makeId('overlay'),
    name: 'New overlay',
    overlay_type: 'drawer',
    visible_variable_id: '',
    layout: { kind: 'grid', columns: 12, gap: '1rem', max_width: '' },
    widgets: [
      {
        id: makeId('widget'),
        widget_type: 'text',
        title: '',
        description: '',
        position: { x: 0, y: 0, width: 12, height: 1 },
        props: { content: '### Overlay body\nUse the JSON tab or future canvas to add more widgets.' },
        binding: null,
        events: [],
        children: [],
      },
    ],
    sections: [],
    props: {
      position: 'right',
      size: 360,
      header_enabled: true,
      header_title: '',
      header_icon: '',
      close_on_backdrop_click: true,
      show_backdrop: true,
      backdrop_opacity: 0.5,
    },
    events: [],
  };
}

// Pure mutators — keep these reducer-shaped so they're trivially unit-testable
// and reusable from other call sites that operate on the pages array.

export function addOverlayToPage(pages: AppPage[], pageId: string, overlay: AppOverlay): AppPage[] {
  return pages.map((page) => (
    page.id === pageId ? { ...page, overlays: [...(page.overlays ?? []), overlay] } : page
  ));
}

export function removeOverlayFromPage(pages: AppPage[], pageId: string, overlayId: string): AppPage[] {
  return pages.map((page) => (
    page.id === pageId
      ? { ...page, overlays: (page.overlays ?? []).filter((overlay) => overlay.id !== overlayId) }
      : page
  ));
}

export function patchOverlayInPage(
  pages: AppPage[],
  pageId: string,
  overlayId: string,
  patch: Partial<AppOverlay>,
): AppPage[] {
  return pages.map((page) => (
    page.id === pageId
      ? {
          ...page,
          overlays: (page.overlays ?? []).map((overlay) =>
            overlay.id === overlayId ? { ...overlay, ...patch } : overlay,
          ),
        }
      : page
  ));
}

// --- Editor clipboard / paste helpers --------------------------------------

export type ClipboardEntry =
  | { kind: 'widget'; payload: AppWidget }
  | { kind: 'overlay'; payload: AppOverlay };

export interface VariableLike {
  id: string;
  kind: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * Scans a widget's `props` for variable references and returns the set of
 * referenced variable IDs. Heuristic: any prop key ending in `_variable_id`
 * (single ref) or `_variable_ids` (array of refs). Only string values that
 * appear in the supplied variable catalog are treated as real refs to avoid
 * accidental matches on UUID-shaped strings used for other purposes.
 */
export function findVariableRefsInWidget(
  widget: AppWidget,
  variables: VariableLike[],
): Set<string> {
  const known = new Set(variables.map((variable) => variable.id));
  const refs = new Set<string>();
  for (const [key, value] of Object.entries(widget.props ?? {})) {
    if (key.endsWith('_variable_id') && typeof value === 'string' && known.has(value)) {
      refs.add(value);
    }
    if (key.endsWith('_variable_ids') && Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string' && known.has(entry)) refs.add(entry);
      }
    }
  }
  for (const child of widget.children ?? []) {
    for (const ref of findVariableRefsInWidget(child, variables)) refs.add(ref);
  }
  return refs;
}

export function findVariableRefsInOverlay(
  overlay: AppOverlay,
  variables: VariableLike[],
): Set<string> {
  const refs = new Set<string>();
  if (overlay.visible_variable_id && variables.some((variable) => variable.id === overlay.visible_variable_id)) {
    refs.add(overlay.visible_variable_id);
  }
  for (const widget of overlay.widgets ?? []) {
    for (const ref of findVariableRefsInWidget(widget, variables)) refs.add(ref);
  }
  for (const section of overlay.sections ?? []) {
    for (const widget of section.widgets ?? []) {
      for (const ref of findVariableRefsInWidget(widget, variables)) refs.add(ref);
    }
  }
  return refs;
}

/**
 * Builds duplicate variable entries for the given refs and a mapping
 * old-id → new-id. New entries inherit everything from the source variable
 * except id and (optional) name suffix " copy". Refs not found in `variables`
 * are dropped silently.
 */
export function duplicateVariablesForPaste(
  refs: Iterable<string>,
  variables: VariableLike[],
): { newVariables: VariableLike[]; mapping: Record<string, string> } {
  const mapping: Record<string, string> = {};
  const newVariables: VariableLike[] = [];
  for (const oldId of refs) {
    const source = variables.find((variable) => variable.id === oldId);
    if (!source) continue;
    const newId = makeId('variable');
    mapping[oldId] = newId;
    newVariables.push({
      ...source,
      id: newId,
      name: source.name ? `${source.name} copy` : `${oldId} copy`,
    });
  }
  return { newVariables, mapping };
}

function remapValue(value: unknown, mapping: Record<string, string>): unknown {
  if (typeof value === 'string' && mapping[value]) return mapping[value];
  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === 'string' && mapping[entry] ? mapping[entry] : entry));
  }
  return value;
}

export function remapVariableRefsInWidget(
  widget: AppWidget,
  mapping: Record<string, string>,
): AppWidget {
  if (Object.keys(mapping).length === 0) return widget;
  const props: Record<string, unknown> = { ...(widget.props ?? {}) };
  for (const [key, value] of Object.entries(props)) {
    if (key.endsWith('_variable_id') || key.endsWith('_variable_ids')) {
      props[key] = remapValue(value, mapping);
    }
  }
  return {
    ...widget,
    props,
    children: (widget.children ?? []).map((child) => remapVariableRefsInWidget(child, mapping)),
  };
}

export function remapVariableRefsInOverlay(
  overlay: AppOverlay,
  mapping: Record<string, string>,
): AppOverlay {
  if (Object.keys(mapping).length === 0) return overlay;
  return {
    ...overlay,
    visible_variable_id: overlay.visible_variable_id && mapping[overlay.visible_variable_id]
      ? mapping[overlay.visible_variable_id]
      : overlay.visible_variable_id,
    widgets: (overlay.widgets ?? []).map((widget) => remapVariableRefsInWidget(widget, mapping)),
    sections: (overlay.sections ?? []).map((section) => ({
      ...section,
      widgets: (section.widgets ?? []).map((widget) => remapVariableRefsInWidget(widget, mapping)),
    })),
  };
}

/**
 * Prepares a freshly-pasted widget by regenerating its id, suffixing the
 * title with " copy", and (when mode === 'duplicate' and variables are
 * provided) duplicating variable refs into new variable entries.
 *
 * Returns the new widget plus any new workshop_variables entries the caller
 * must add to `settings.workshop_variables`.
 */
export function preparePastedWidget(
  source: AppWidget,
  mode: 'same' | 'duplicate',
  variables: VariableLike[] = [],
): { widget: AppWidget; newVariables: VariableLike[] } {
  const base: AppWidget = {
    ...source,
    id: makeId('widget'),
    title: source.title ? `${source.title} copy` : source.title,
    children: (source.children ?? []).map((child) => ({ ...child, id: makeId('widget') })),
  };
  if (mode === 'same') return { widget: base, newVariables: [] };
  const refs = findVariableRefsInWidget(source, variables);
  const { newVariables, mapping } = duplicateVariablesForPaste(refs, variables);
  return { widget: remapVariableRefsInWidget(base, mapping), newVariables };
}

export function preparePastedOverlay(
  source: AppOverlay,
  mode: 'same' | 'duplicate',
  variables: VariableLike[] = [],
): { overlay: AppOverlay; newVariables: VariableLike[] } {
  const base: AppOverlay = {
    ...source,
    id: makeId('overlay'),
    name: source.name ? `${source.name} copy` : source.name,
    widgets: (source.widgets ?? []).map((widget) => ({
      ...widget,
      id: makeId('widget'),
      children: (widget.children ?? []).map((child) => ({ ...child, id: makeId('widget') })),
    })),
    sections: (source.sections ?? []).map((section) => ({
      ...section,
      id: makeId('section'),
      widgets: (section.widgets ?? []).map((widget) => ({ ...widget, id: makeId('widget') })),
    })),
  };
  if (mode === 'same') return { overlay: base, newVariables: [] };
  const refs = findVariableRefsInOverlay(source, variables);
  const { newVariables, mapping } = duplicateVariablesForPaste(refs, variables);
  return { overlay: remapVariableRefsInOverlay(base, mapping), newVariables };
}

// --- back to overlay reducers ----------------------------------------------

export function duplicateOverlayInPage(
  pages: AppPage[],
  pageId: string,
  overlayId: string,
): { pages: AppPage[]; newId: string } {
  const page = pages.find((entry) => entry.id === pageId);
  const source = page?.overlays?.find((overlay) => overlay.id === overlayId);
  if (!source) return { pages, newId: '' };
  const copy: AppOverlay = {
    ...source,
    id: makeId('overlay'),
    name: `${source.name} copy`,
    widgets: (source.widgets ?? []).map((widget) => ({ ...widget, id: makeId('widget') })),
    sections: (source.sections ?? []).map((section) => ({ ...section, id: makeId('section') })),
  };
  return { pages: addOverlayToPage(pages, pageId, copy), newId: copy.id };
}

export function commitPages(onChange: (next: string) => void, pages: AppPage[]) {
  onChange(JSON.stringify(pages, null, 2));
}

function fieldsToString(binding: WidgetBinding | null | undefined) {
  return (binding?.fields ?? []).join(', ');
}

function stringToFields(value: string) {
  return value.split(',').map((field) => field.trim()).filter(Boolean);
}

function toPositionValue(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
}

function patchWidgetInPages(pages: AppPage[], pageId: string, widgetId: string, patch: Partial<AppWidget>) {
  return pages.map((page) => (
    page.id === pageId
      ? { ...page, widgets: page.widgets.map((widget) => (widget.id === widgetId ? { ...widget, ...patch } : widget)) }
      : page
  ));
}

export function groupWidgetsBySection(widgets: AppWidget[]) {
  const sorted = [...widgets].sort((a, b) => {
    const ay = a.position?.y ?? 0;
    const by = b.position?.y ?? 0;
    if (ay !== by) return ay - by;
    return (a.position?.x ?? 0) - (b.position?.x ?? 0);
  });
  const sections: Array<{ y: number; widgets: AppWidget[] }> = [];
  for (const widget of sorted) {
    const y = widget.position?.y ?? 0;
    const last = sections[sections.length - 1];
    if (last && last.y === y) {
      last.widgets.push(widget);
    } else {
      sections.push({ y, widgets: [widget] });
    }
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Sub-component: PagesOutline
// Foundry-style layout tree: pages → sections → widgets
// ---------------------------------------------------------------------------

interface PagesOutlineProps {
  pages: AppPage[];
  selectedPageId: string;
  selectedWidgetId: string;
  selectedOverlayId?: string;
  onSelectPage: (id: string) => void;
  onSelectWidget: (pageId: string, widgetId: string) => void;
  onAddPage: () => void;
  onDuplicatePage: (page: AppPage) => void;
  onDeletePage: (id: string) => void;
  onAddOverlay?: (pageId: string) => void;
  onSelectOverlay?: (pageId: string, overlayId: string) => void;
  onDuplicateOverlay?: (pageId: string, overlayId: string) => void;
  onDeleteOverlay?: (pageId: string, overlayId: string) => void;
  // Header widgets — opt-in via callbacks; when omitted the Header group
  // is not rendered (backward compatible with existing call sites).
  headerWidgets?: AppWidget[];
  selectedHeaderWidgetId?: string;
  onAddHeaderWidget?: () => void;
  onSelectHeaderWidget?: (widgetId: string) => void;
  onDeleteHeaderWidget?: (widgetId: string) => void;
}

export function PagesOutline({
  pages,
  selectedPageId,
  selectedWidgetId,
  selectedOverlayId = '',
  onSelectPage,
  onSelectWidget,
  onAddPage,
  onDuplicatePage,
  onDeletePage,
  onAddOverlay,
  onSelectOverlay,
  onDuplicateOverlay,
  onDeleteOverlay,
  headerWidgets,
  selectedHeaderWidgetId = '',
  onAddHeaderWidget,
  onSelectHeaderWidget,
  onDeleteHeaderWidget,
}: PagesOutlineProps) {
  return (
    <section style={{ display: 'grid', alignContent: 'start', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Glyph name="view-grid" size={12} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-strong)' }}>Layout</span>
        </div>
        <button
          type="button"
          onClick={onAddPage}
          aria-label="Add page"
          title="Add page"
          className="of-button of-button--ghost"
          style={{ minHeight: 22, padding: '0 4px' }}
        >
          <Glyph name="plus" size={12} />
        </button>
      </div>

      {onAddHeaderWidget ? (
        <div style={{ display: 'grid', gap: 2, padding: '0 0 6px', borderBottom: '1px solid var(--border-subtle)' }} data-testid="header-widgets-outline">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 8px' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Header
            </span>
            <button
              type="button"
              onClick={onAddHeaderWidget}
              aria-label="Add header widget"
              title="Add header widget"
              className="of-button of-button--ghost"
              style={{ minHeight: 20, padding: '0 4px' }}
              data-testid="header-widget-add"
            >
              <Glyph name="plus" size={11} />
            </button>
          </div>
          {(headerWidgets ?? []).length === 0 ? (
            <div className="of-text-muted" style={{ fontSize: 11, padding: '2px 8px 2px 20px' }}>
              No header widgets
            </div>
          ) : (
            (headerWidgets ?? []).map((widget) => {
              const isSelected = widget.id === selectedHeaderWidgetId;
              const glyph = WIDGET_GLYPH_BY_TYPE[widget.widget_type] ?? 'cube';
              return (
                <button
                  key={widget.id}
                  type="button"
                  onClick={() => onSelectHeaderWidget?.(widget.id)}
                  style={outlineRowStyle(isSelected, 20)}
                  data-testid={`header-widget-row-${widget.id}`}
                  data-widget-id={widget.id}
                >
                  <Glyph name={glyph} size={11} />
                  <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {widget.title || widget.widget_type}
                  </span>
                </button>
              );
            })
          )}
          {selectedHeaderWidgetId && onDeleteHeaderWidget ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 6px' }}>
              <button
                type="button"
                className="of-button of-btn-danger"
                style={{ minHeight: 22, fontSize: 11, padding: '0 6px' }}
                onClick={() => onDeleteHeaderWidget(selectedHeaderWidgetId)}
                data-testid="header-widget-delete"
              >
                <Glyph name="trash" size={11} />
                <span style={{ marginLeft: 4 }}>Delete</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
        {pages.map((page) => {
          const sections = groupWidgetsBySection(page.widgets);
          const isPageSelected = page.id === selectedPageId;
          return (
            <li key={page.id}>
              <button
                type="button"
                onClick={() => onSelectPage(page.id)}
                style={{
                  ...outlineRowStyle(isPageSelected && !selectedWidgetId, 8),
                  fontWeight: 600,
                }}
              >
                <Glyph name="cover-page" size={12} />
                <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {page.name || 'Untitled page'}
                </span>
                {page.visible === false ? <span className="of-text-muted" style={{ fontSize: 10 }}>hidden</span> : null}
              </button>

              {isPageSelected ? (
                <ul style={{ listStyle: 'none', margin: '2px 0', padding: 0, display: 'grid', gap: 2 }}>
                  {sections.length === 0 ? (
                    <li className="of-text-muted" style={{ fontSize: 11, padding: '2px 8px 2px 24px' }}>
                      No sections
                    </li>
                  ) : null}
                  {sections.map((section, index) => (
                    <li key={`outline-section-${index}`} style={{ display: 'grid', gap: 2 }}>
                      <div style={outlineSectionHeaderStyle()}>
                        <Glyph name="view-grid" size={10} />
                        <span>Section</span>
                      </div>
                      {section.widgets.map((widget) => {
                        const isWidgetSelected = widget.id === selectedWidgetId;
                        const glyph = WIDGET_GLYPH_BY_TYPE[widget.widget_type] ?? 'cube';
                        return (
                          <button
                            key={widget.id}
                            type="button"
                            onClick={() => onSelectWidget(page.id, widget.id)}
                            style={outlineRowStyle(isWidgetSelected, 32)}
                          >
                            <Glyph name={glyph} size={11} />
                            <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {widget.title || widget.widget_type}
                            </span>
                          </button>
                        );
                      })}
                    </li>
                  ))}
                </ul>
              ) : null}

              {isPageSelected && onAddOverlay ? (
                <div style={{ display: 'grid', gap: 2, marginTop: 4 }} data-testid={`overlays-outline-${page.id}`}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 8px 2px 20px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Overlays
                    </span>
                    <button
                      type="button"
                      onClick={() => onAddOverlay(page.id)}
                      aria-label="Add overlay"
                      title="Add overlay"
                      className="of-button of-button--ghost"
                      style={{ minHeight: 20, padding: '0 4px' }}
                      data-testid={`overlay-add-${page.id}`}
                    >
                      <Glyph name="plus" size={11} />
                    </button>
                  </div>
                  {(page.overlays ?? []).length === 0 ? (
                    <div className="of-text-muted" style={{ fontSize: 11, padding: '2px 8px 2px 24px' }}>
                      No overlays
                    </div>
                  ) : (
                    (page.overlays ?? []).map((overlay) => {
                      const isOverlaySelected = overlay.id === selectedOverlayId;
                      return (
                        <button
                          key={overlay.id}
                          type="button"
                          onClick={() => onSelectOverlay?.(page.id, overlay.id)}
                          style={outlineRowStyle(isOverlaySelected, 24)}
                          data-testid={`overlay-row-${overlay.id}`}
                          data-overlay-id={overlay.id}
                        >
                          <Glyph name={overlay.overlay_type === 'modal' ? 'document' : 'cube'} size={11} />
                          <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {overlay.name || 'Untitled overlay'}
                          </span>
                          <span className="of-text-muted" style={{ fontSize: 10 }}>
                            {overlay.overlay_type === 'modal' ? 'modal' : 'drawer'}
                          </span>
                        </button>
                      );
                    })
                  )}
                  {selectedOverlayId ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, padding: '2px 6px' }}>
                      {onDuplicateOverlay ? (
                        <button
                          type="button"
                          className="of-button of-button--ghost"
                          style={{ minHeight: 22, fontSize: 11, padding: '0 6px' }}
                          onClick={() => onDuplicateOverlay(page.id, selectedOverlayId)}
                          data-testid="overlay-duplicate"
                        >
                          <Glyph name="duplicate" size={11} />
                          <span style={{ marginLeft: 4 }}>Duplicate</span>
                        </button>
                      ) : null}
                      {onDeleteOverlay ? (
                        <button
                          type="button"
                          className="of-button of-btn-danger"
                          style={{ minHeight: 22, fontSize: 11, padding: '0 6px' }}
                          onClick={() => onDeleteOverlay(page.id, selectedOverlayId)}
                          data-testid="overlay-delete"
                        >
                          <Glyph name="trash" size={11} />
                          <span style={{ marginLeft: 4 }}>Delete</span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
        {pages.length === 0 ? (
          <li className="of-text-muted" style={{ fontSize: 12, padding: '4px 8px' }}>No pages yet.</li>
        ) : null}
      </ul>

      {selectedPageId ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, padding: '4px 6px' }}>
          <button
            type="button"
            className="of-button of-button--ghost"
            style={{ minHeight: 22, fontSize: 11, padding: '0 6px' }}
            onClick={() => {
              const page = pages.find((entry) => entry.id === selectedPageId);
              if (page) onDuplicatePage(page);
            }}
          >
            <Glyph name="duplicate" size={11} />
            <span style={{ marginLeft: 4 }}>Duplicate</span>
          </button>
          <button
            type="button"
            className="of-button of-btn-danger"
            style={{ minHeight: 22, fontSize: 11, padding: '0 6px' }}
            disabled={pages.length <= 1}
            onClick={() => onDeletePage(selectedPageId)}
          >
            <Glyph name="trash" size={11} />
            <span style={{ marginLeft: 4 }}>Delete</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}

function outlineRowStyle(active: boolean, paddingLeft: number): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    border: 0,
    padding: `4px 8px 4px ${paddingLeft}px`,
    background: active ? 'var(--status-info-bg)' : 'transparent',
    color: active ? 'var(--status-info)' : 'var(--text-default)',
    fontSize: 12,
    cursor: 'pointer',
    borderRadius: 'var(--radius-sm)',
    textAlign: 'left',
  };
}

function outlineSectionHeaderStyle(): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 8px 2px 20px',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };
}

// ---------------------------------------------------------------------------
// Sub-component: PageCanvas
// Foundry-like canvas: stacked Section cards with widgets in grid columns.
// ---------------------------------------------------------------------------

interface PageCanvasProps {
  page: AppPage | null;
  catalog: WidgetCatalogItem[];
  selectedWidgetId: string;
  onSelectWidget: (id: string) => void;
  onAddSection: () => void;
  onAddWidgetToSection: (sectionY: number) => void;
  onApplyTemplate: (widgets: AppWidget[]) => void;
}

export function PageCanvas({
  page,
  catalog,
  selectedWidgetId,
  onSelectWidget,
  onAddSection,
  onAddWidgetToSection,
  onApplyTemplate,
}: PageCanvasProps) {
  const sections = useMemo(() => (page ? groupWidgetsBySection(page.widgets) : []), [page]);
  const columns = page?.layout?.columns ?? 12;

  if (!page) {
    return (
      <div style={emptyCanvasStyle()}>
        <p className="of-text-muted" style={{ margin: 0 }}>Select a page from the layout panel.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14, padding: 24, alignContent: 'start' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <button type="button" className="of-button of-button--ghost" style={{ minHeight: 26 }}>
          <Glyph name="cover-page" size={14} />
          <span style={{ marginLeft: 4 }}>{page.name || 'Page'}</span>
        </button>
      </header>

      <div style={{ display: 'grid', gap: 12 }}>
        {sections.length === 0 ? (
          <EmptyCanvas onAddSection={onAddSection} onAddWidget={() => onAddWidgetToSection(0)} disabled={catalog.length === 0} />
        ) : (
          sections.map((section, index) => (
            <SectionCard
              key={`section-${index}`}
              index={index}
              sectionY={section.y}
              widgets={section.widgets}
              columns={columns}
              selectedWidgetId={selectedWidgetId}
              onSelectWidget={onSelectWidget}
              onAddWidget={() => onAddWidgetToSection(section.y)}
            />
          ))
        )}
      </div>

      <LayoutTemplatePicker page={page} onApply={onApplyTemplate} />
    </div>
  );
}

function emptyCanvasStyle(): React.CSSProperties {
  return {
    display: 'grid',
    placeItems: 'center',
    minHeight: 280,
    padding: 24,
    background: 'var(--bg-canvas, #f1f4f9)',
  };
}

function SectionCard({
  index,
  sectionY,
  widgets,
  columns,
  selectedWidgetId,
  onSelectWidget,
  onAddWidget,
}: {
  index: number;
  sectionY: number;
  widgets: AppWidget[];
  columns: number;
  selectedWidgetId: string;
  onSelectWidget: (id: string) => void;
  onAddWidget: () => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 8,
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-panel)',
        padding: 12,
        boxShadow: '0 1px 1px rgba(15,23,42,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Section {index + 1}
        </span>
        <span className="of-text-muted" style={{ fontSize: 11 }}>{widgets.length} widgets · row {sectionY}</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: 8,
        }}
      >
        {widgets.map((widget) => (
          <WidgetCard
            key={widget.id}
            widget={widget}
            columns={columns}
            selected={selectedWidgetId === widget.id}
            onClick={() => onSelectWidget(widget.id)}
          />
        ))}
        {widgets.length === 0 ? (
          <div style={{ gridColumn: `span ${columns}`, display: 'grid', placeItems: 'center', padding: 18, border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-panel-muted)' }}>
            <button type="button" className="of-button" onClick={onAddWidget}>
              <Glyph name="plus" size={12} />
              <span style={{ marginLeft: 4 }}>Add widget</span>
            </button>
          </div>
        ) : (
          <div style={{ gridColumn: `span ${columns}`, display: 'flex', justifyContent: 'flex-start', gap: 6, paddingTop: 4 }}>
            <button type="button" className="of-button of-button--ghost" style={{ minHeight: 24, fontSize: 11 }} onClick={onAddWidget}>
              <Glyph name="plus" size={11} />
              <span style={{ marginLeft: 4 }}>Add widget</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function WidgetCard({
  widget,
  columns,
  selected,
  onClick,
}: {
  widget: AppWidget;
  columns: number;
  selected: boolean;
  onClick: () => void;
}) {
  const span = Math.min(Math.max(widget.position?.width ?? 4, 1), columns);
  const minHeight = Math.max((widget.position?.height ?? 2) * 36, 76);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'grid',
        gap: 6,
        alignContent: 'start',
        gridColumn: `span ${span}`,
        minHeight,
        padding: 10,
        textAlign: 'left',
        border: `${selected ? 2 : 1}px solid ${selected ? 'var(--status-info)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-md)',
        background: selected ? 'var(--status-info-bg)' : 'var(--bg-panel-muted)',
        color: 'var(--text-default)',
        cursor: 'pointer',
        boxShadow: selected ? '0 0 0 1px var(--status-info)' : 'none',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Glyph name={WIDGET_GLYPH_BY_TYPE[widget.widget_type] ?? 'cube'} size={12} />
          <strong style={{ color: 'var(--text-strong)' }}>{widget.title || widget.widget_type}</strong>
        </span>
        <code style={{ color: 'var(--text-soft)', fontSize: 11 }}>{widget.widget_type}</code>
      </span>
      {widget.description ? (
        <span className="of-text-muted" style={{ fontSize: 11, lineHeight: 1.4 }}>{widget.description}</span>
      ) : null}
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 'auto' }}>
        <span className="of-chip" style={{ minHeight: 20, fontSize: 11 }}>{widget.position?.width ?? 0}×{widget.position?.height ?? 0}</span>
        {widget.binding ? <span className="of-chip of-chip-active" style={{ minHeight: 20, fontSize: 11 }}>{widget.binding.source_type}</span> : null}
      </span>
    </button>
  );
}

function EmptyCanvas({ onAddSection, onAddWidget, disabled }: { onAddSection: () => void; onAddWidget: () => void; disabled: boolean }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 12,
        gridTemplateColumns: '1fr 1fr',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-panel)',
        padding: 18,
      }}
    >
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          minHeight: 200,
          border: '1px dashed var(--border-default)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel-muted)',
          gap: 8,
          padding: 20,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Section</span>
        <button type="button" className="of-button" onClick={onAddWidget} disabled={disabled}>
          <Glyph name="plus" size={12} />
          <span style={{ marginLeft: 4 }}>Add widget</span>
        </button>
        <button type="button" className="of-button of-button--ghost" onClick={onAddSection}>
          <Glyph name="view-grid" size={12} />
          <span style={{ marginLeft: 4 }}>Set layout</span>
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          minHeight: 200,
          border: '1px dashed var(--border-default)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel-muted)',
          gap: 8,
          padding: 20,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Section</span>
        <button type="button" className="of-button" onClick={onAddWidget} disabled={disabled}>
          <Glyph name="plus" size={12} />
          <span style={{ marginLeft: 4 }}>Add widget</span>
        </button>
        <button type="button" className="of-button of-button--ghost" onClick={onAddSection}>
          <Glyph name="view-grid" size={12} />
          <span style={{ marginLeft: 4 }}>Set layout</span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: PageInspector  (fixed right pane when no widget selected)
// ---------------------------------------------------------------------------

interface PageInspectorProps {
  page: AppPage;
  onPatch: (patch: Partial<AppPage>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  disableDelete: boolean;
}

export function PageInspector({ page, onPatch, onDuplicate, onDelete, disableDelete }: PageInspectorProps) {
  const layout = page.layout ?? { kind: 'grid', columns: 12, gap: '1rem', max_width: '1280px' };
  return (
    <div style={{ display: 'grid', gap: 14, padding: 12, alignContent: 'start' }}>
      <div>
        <p className="of-eyebrow" style={{ margin: 0 }}>Page</p>
        <h3 className="of-heading-sm" style={{ margin: '4px 0 0' }}>{page.name || 'Untitled page'}</h3>
      </div>

      <FieldGroup label="Page name">
        <input value={page.name} onChange={(event) => onPatch({ name: event.target.value })} className="of-input" />
      </FieldGroup>

      <FieldGroup label="Page id (optional)">
        <input value={page.id} onChange={(event) => onPatch({ id: event.target.value })} className="of-input" />
      </FieldGroup>

      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600 }}>
        <input type="checkbox" checked={page.visible !== false} onChange={(event) => onPatch({ visible: event.target.checked })} />
        Visible in runtime
      </label>

      <SectionHeader>Layout</SectionHeader>
      <FieldGroup label="Padding controls">
        <select
          className="of-input"
          value={typeof layout.gap === 'string' ? layout.gap : '1rem'}
          onChange={(event) => onPatch({ layout: { ...layout, gap: event.target.value } })}
        >
          <option value="0">No padding</option>
          <option value="0.5rem">Compact (8px)</option>
          <option value="1rem">Default (16px)</option>
          <option value="1.5rem">Comfortable (24px)</option>
          <option value="2rem">Spacious (32px)</option>
        </select>
      </FieldGroup>

      <FieldGroup label="Max width">
        <input
          className="of-input"
          value={typeof layout.max_width === 'string' ? layout.max_width : '1280px'}
          onChange={(event) => onPatch({ layout: { ...layout, max_width: event.target.value } })}
        />
      </FieldGroup>

      <FieldGroup label="Path">
        <input value={page.path} onChange={(event) => onPatch({ path: event.target.value })} className="of-input" />
      </FieldGroup>

      <FieldGroup label="Description">
        <textarea
          value={page.description}
          onChange={(event) => onPatch({ description: event.target.value })}
          rows={2}
          className="of-input"
          style={{ resize: 'vertical' }}
        />
      </FieldGroup>

      <SectionHeader>Layout direction</SectionHeader>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <button
          type="button"
          className={`of-button ${layout.columns >= 12 ? 'of-button--primary' : ''}`}
          onClick={() => onPatch({ layout: { ...layout, columns: 12 } })}
        >
          Columns
        </button>
        <button
          type="button"
          className={`of-button ${layout.columns < 12 ? 'of-button--primary' : ''}`}
          onClick={() => onPatch({ layout: { ...layout, columns: 1 } })}
        >
          Rows
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button type="button" className="of-button" onClick={onDuplicate} style={{ flex: 1 }}>Duplicate page</button>
        <button type="button" className="of-button of-btn-danger" disabled={disableDelete} onClick={onDelete} style={{ flex: 1 }}>
          Delete page
        </button>
      </div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      {children}
    </label>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10, fontSize: 11, fontWeight: 700, color: 'var(--text-strong)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: WidgetInspector (fixed right pane when widget selected)
// ---------------------------------------------------------------------------

type WidgetInspectorTab = 'setup' | 'metadata' | 'display';

interface WidgetInspectorProps {
  widget: AppWidget;
  catalog: WidgetCatalogItem[];
  onPatch: (patch: Partial<AppWidget>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  // Optional clipboard hooks — when provided, the inspector exposes
  // Copy / Cut / Paste (same vars) / Paste (new vars) buttons.
  clipboard?: ClipboardEntry | null;
  onCopy?: () => void;
  onCut?: () => void;
  onPasteSame?: () => void;
  onPasteDuplicate?: () => void;
}

export function WidgetInspector({
  widget,
  catalog,
  onPatch,
  onDuplicate,
  onDelete,
  clipboard,
  onCopy,
  onCut,
  onPasteSame,
  onPasteDuplicate,
}: WidgetInspectorProps) {
  const [tab, setTab] = useState<WidgetInspectorTab>('setup');
  const catalogItem = catalog.find((item) => item.widget_type === widget.widget_type) ?? null;
  const bindingSource = (widget.binding?.source_type ?? 'none') as BindingSource;

  function patchBinding(patch: Partial<WidgetBinding>) {
    const current = widget.binding ?? EMPTY_BINDING;
    onPatch({ binding: { ...current, ...patch } });
  }

  function changeBindingSource(next: BindingSource) {
    if (next === 'none') {
      onPatch({ binding: null });
      return;
    }
    onPatch({ binding: { ...(widget.binding ?? EMPTY_BINDING), source_type: next } });
  }

  return (
    <div style={{ display: 'grid', gap: 12, padding: 12, alignContent: 'start' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div>
          <p className="of-eyebrow" style={{ margin: 0 }}>{widget.widget_type}</p>
          <h3 className="of-heading-sm" style={{ margin: '4px 0 0' }}>{widget.title || widget.widget_type}</h3>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {onCopy ? (
            <button
              type="button"
              className="of-button of-button--ghost"
              title="Copy widget"
              onClick={onCopy}
              style={{ minHeight: 24, padding: '0 6px', fontSize: 11 }}
              data-testid="widget-copy"
            >
              Copy
            </button>
          ) : null}
          {onCut ? (
            <button
              type="button"
              className="of-button of-button--ghost"
              title="Cut widget"
              onClick={onCut}
              style={{ minHeight: 24, padding: '0 6px', fontSize: 11 }}
              data-testid="widget-cut"
            >
              Cut
            </button>
          ) : null}
          {onPasteSame && clipboard?.kind === 'widget' ? (
            <button
              type="button"
              className="of-button of-button--ghost"
              title="Paste — keeps the same input variable references"
              onClick={onPasteSame}
              style={{ minHeight: 24, padding: '0 6px', fontSize: 11 }}
              data-testid="widget-paste-same"
            >
              Paste
            </button>
          ) : null}
          {onPasteDuplicate && clipboard?.kind === 'widget' ? (
            <button
              type="button"
              className="of-button of-button--ghost"
              title="Paste with duplicated variable references"
              onClick={onPasteDuplicate}
              style={{ minHeight: 24, padding: '0 6px', fontSize: 11 }}
              data-testid="widget-paste-duplicate"
            >
              Paste+vars
            </button>
          ) : null}
          <button type="button" className="of-button of-button--ghost" title="Duplicate widget" onClick={onDuplicate} style={{ minHeight: 24, padding: '0 6px' }}>
            <Glyph name="duplicate" size={12} />
          </button>
          <button type="button" className="of-button of-btn-danger" title="Delete widget" onClick={onDelete} style={{ minHeight: 24, padding: '0 6px' }}>
            <Glyph name="trash" size={12} />
          </button>
        </div>
      </div>

      <Tabs
        tabs={[
          { id: 'setup', label: 'Widget setup' },
          { id: 'metadata', label: 'Metadata' },
          { id: 'display', label: 'Display' },
        ] as const}
        active={tab}
        onChange={setTab}
      />

      {tab === 'setup' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <FieldGroup label="Title">
            <input value={widget.title} onChange={(event) => onPatch({ title: event.target.value })} className="of-input" />
          </FieldGroup>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
            <FieldGroup label="Widget type">
              <select value={widget.widget_type} onChange={(event) => onPatch({ widget_type: event.target.value })} className="of-input">
                {catalog.map((item) => (
                  <option key={item.widget_type} value={item.widget_type}>{item.label || item.widget_type}</option>
                ))}
              </select>
            </FieldGroup>
            <FieldGroup label="Widget id">
              <input value={widget.id} onChange={(event) => onPatch({ id: event.target.value })} className="of-input" />
            </FieldGroup>
          </div>

          <SectionHeader>Input data</SectionHeader>
          <FieldGroup label="Source type">
            <select value={bindingSource} onChange={(event) => changeBindingSource(event.target.value as BindingSource)} className="of-input">
              <option value="none">none</option>
              <option value="query">query</option>
              <option value="dataset">dataset</option>
              <option value="ontology">ontology</option>
              <option value="object_set">object_set</option>
            </select>
          </FieldGroup>
          {catalogItem?.supported_bindings.length ? (
            <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>
              Supported: {catalogItem.supported_bindings.join(', ')}
            </p>
          ) : null}

          {widget.binding ? (
            <>
              <FieldGroup label="Source id">
                <input value={widget.binding.source_id ?? ''} onChange={(event) => patchBinding({ source_id: event.target.value || null })} className="of-input" />
              </FieldGroup>
              <FieldGroup label="Query text">
                <textarea
                  value={widget.binding.query_text ?? ''}
                  onChange={(event) => patchBinding({ query_text: event.target.value || null })}
                  rows={4}
                  className="of-input"
                  style={{ resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 11 }}
                />
              </FieldGroup>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 90px', gap: 8 }}>
                <FieldGroup label="Column configuration">
                  <input
                    value={fieldsToString(widget.binding)}
                    onChange={(event) => patchBinding({ fields: stringToFields(event.target.value) })}
                    className="of-input"
                    placeholder="label, value"
                  />
                </FieldGroup>
                <FieldGroup label="Limit">
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={widget.binding.limit ?? 50}
                    onChange={(event) => patchBinding({ limit: toPositionValue(Number(event.target.value), 1, 1000) })}
                    className="of-input"
                  />
                </FieldGroup>
              </div>
              <JsonEditor
                label="Parameters"
                value={JSON.stringify(widget.binding.parameters ?? {}, null, 2)}
                onChange={(text) => {
                  try {
                    patchBinding({ parameters: JSON.parse(text) as Record<string, unknown> });
                  } catch {
                    /* JsonEditor surfaces invalid state */
                  }
                }}
                minHeight={90}
              />
            </>
          ) : (
            <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>This widget has no data binding.</p>
          )}

          <JsonEditor
            label="Props"
            value={JSON.stringify(widget.props ?? {}, null, 2)}
            onChange={(text) => {
              try {
                onPatch({ props: JSON.parse(text) as Record<string, unknown> });
              } catch {
                /* JsonEditor surfaces invalid state */
              }
            }}
            minHeight={150}
          />
        </div>
      ) : null}

      {tab === 'metadata' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <FieldGroup label="Description">
            <textarea
              value={widget.description}
              onChange={(event) => onPatch({ description: event.target.value })}
              rows={3}
              className="of-input"
              style={{ resize: 'vertical' }}
            />
          </FieldGroup>

          <JsonEditor
            label="Events"
            value={JSON.stringify(widget.events ?? [], null, 2)}
            onChange={(text) => {
              try {
                const parsed = JSON.parse(text) as WidgetEvent[];
                onPatch({ events: Array.isArray(parsed) ? parsed : [] });
              } catch {
                /* JsonEditor surfaces invalid state */
              }
            }}
            minHeight={120}
          />

          <JsonEditor
            label="Children"
            value={JSON.stringify(widget.children ?? [], null, 2)}
            onChange={(text) => {
              try {
                const parsed = JSON.parse(text) as AppWidget[];
                onPatch({ children: Array.isArray(parsed) ? parsed : [] });
              } catch {
                /* JsonEditor surfaces invalid state */
              }
            }}
            minHeight={100}
          />
        </div>
      ) : null}

      {tab === 'display' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <SectionHeader>Display & formatting</SectionHeader>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 7 }}>
            {(['x', 'y', 'width', 'height'] as const).map((field) => (
              <FieldGroup key={field} label={field}>
                <input
                  type="number"
                  min={field === 'width' || field === 'height' ? 1 : 0}
                  max={field === 'width' ? 12 : undefined}
                  value={widget.position[field]}
                  onChange={(event) => onPatch({
                    position: {
                      ...widget.position,
                      [field]: field === 'width'
                        ? toPositionValue(Number(event.target.value), 1, 12)
                        : toPositionValue(Number(event.target.value), field === 'height' ? 1 : 0, 99),
                    },
                  })}
                  className="of-input"
                />
              </FieldGroup>
            ))}
          </div>
          <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>
            Width is in 12-column grid units. Height is row units (~36px).
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: OverlayInspector (right pane when an overlay is selected)
// ---------------------------------------------------------------------------

interface OverlayInspectorProps {
  overlay: AppOverlay;
  onPatch: (patch: Partial<AppOverlay>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  clipboard?: ClipboardEntry | null;
  onCopy?: () => void;
  onCut?: () => void;
  onPasteSame?: () => void;
  onPasteDuplicate?: () => void;
}

function readOverlayPropString(props: AppOverlay['props'], key: string): string {
  const value = props?.[key];
  return typeof value === 'string' ? value : '';
}

function readOverlayPropNumber(props: AppOverlay['props'], key: string): string {
  const value = props?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value;
  return '';
}

function readOverlayPropBoolean(props: AppOverlay['props'], key: string, fallback: boolean): boolean {
  const value = props?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function OverlayInspector({
  overlay,
  onPatch,
  onDuplicate,
  onDelete,
  clipboard,
  onCopy,
  onCut,
  onPasteSame,
  onPasteDuplicate,
}: OverlayInspectorProps) {
  const props = (overlay.props ?? {}) as Record<string, unknown>;
  const overlayType = overlay.overlay_type === 'modal' ? 'modal' : 'drawer';
  const position = readOverlayPropString(props, 'position') === 'left' ? 'left' : 'right';
  const sizeValue = readOverlayPropNumber(props, 'size');
  const headerEnabled = readOverlayPropBoolean(props, 'header_enabled', true);
  const showBackdrop = readOverlayPropBoolean(props, 'show_backdrop', true);
  const closeOnBackdrop = readOverlayPropBoolean(props, 'close_on_backdrop_click', true);
  const backdropOpacity = readOverlayPropNumber(props, 'backdrop_opacity');

  function patchProps(patch: Record<string, unknown>) {
    const next = { ...(overlay.props ?? {}) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete (next as Record<string, unknown>)[key];
      else (next as Record<string, unknown>)[key] = value;
    }
    onPatch({ props: next });
  }

  return (
    <div style={{ display: 'grid', gap: 12, padding: 12, alignContent: 'start' }} data-testid="overlay-inspector">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div>
          <p className="of-eyebrow" style={{ margin: 0 }}>Overlay · {overlayType}</p>
          <h3 className="of-heading-sm" style={{ margin: '4px 0 0' }}>{overlay.name || 'Untitled overlay'}</h3>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {onCopy ? (
            <button type="button" className="of-button of-button--ghost" title="Copy overlay" onClick={onCopy} style={{ minHeight: 24, padding: '0 6px', fontSize: 11 }} data-testid="overlay-copy">
              Copy
            </button>
          ) : null}
          {onCut ? (
            <button type="button" className="of-button of-button--ghost" title="Cut overlay" onClick={onCut} style={{ minHeight: 24, padding: '0 6px', fontSize: 11 }} data-testid="overlay-cut">
              Cut
            </button>
          ) : null}
          {onPasteSame && clipboard?.kind === 'overlay' ? (
            <button type="button" className="of-button of-button--ghost" title="Paste — keeps the same input variable references" onClick={onPasteSame} style={{ minHeight: 24, padding: '0 6px', fontSize: 11 }} data-testid="overlay-paste-same">
              Paste
            </button>
          ) : null}
          {onPasteDuplicate && clipboard?.kind === 'overlay' ? (
            <button type="button" className="of-button of-button--ghost" title="Paste with duplicated variable references" onClick={onPasteDuplicate} style={{ minHeight: 24, padding: '0 6px', fontSize: 11 }} data-testid="overlay-paste-duplicate">
              Paste+vars
            </button>
          ) : null}
          <button type="button" className="of-button of-button--ghost" title="Duplicate overlay" onClick={onDuplicate} style={{ minHeight: 24, padding: '0 6px' }}>
            <Glyph name="duplicate" size={12} />
          </button>
          <button type="button" className="of-button of-btn-danger" title="Delete overlay" onClick={onDelete} style={{ minHeight: 24, padding: '0 6px' }}>
            <Glyph name="trash" size={12} />
          </button>
        </div>
      </div>

      <SectionHeader>Basics</SectionHeader>
      <FieldGroup label="Name">
        <input
          value={overlay.name}
          onChange={(event) => onPatch({ name: event.target.value })}
          className="of-input"
          data-testid="overlay-name-input"
        />
      </FieldGroup>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
        <FieldGroup label="Type">
          <select
            value={overlayType}
            onChange={(event) => onPatch({ overlay_type: event.target.value })}
            className="of-input"
            data-testid="overlay-type-select"
          >
            <option value="drawer">Drawer</option>
            <option value="modal">Modal</option>
          </select>
        </FieldGroup>
        <FieldGroup label="Visible when variable is true">
          <input
            value={overlay.visible_variable_id ?? ''}
            onChange={(event) => onPatch({ visible_variable_id: event.target.value })}
            className="of-input"
            placeholder="show_drawer"
            data-testid="overlay-visible-var-input"
          />
        </FieldGroup>
      </div>

      <SectionHeader>Position &amp; size</SectionHeader>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
        {overlayType === 'drawer' ? (
          <FieldGroup label="Drawer position">
            <select
              value={position}
              onChange={(event) => patchProps({ position: event.target.value })}
              className="of-input"
              data-testid="overlay-position-select"
            >
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
          </FieldGroup>
        ) : (
          <FieldGroup label="Modal position">
            <input className="of-input" value="centered" readOnly />
          </FieldGroup>
        )}
        <FieldGroup label={overlayType === 'drawer' ? 'Width (px)' : 'Width (px)'}>
          <input
            value={sizeValue}
            onChange={(event) => {
              const raw = event.target.value;
              if (!raw) {
                patchProps({ size: undefined });
                return;
              }
              const n = Number(raw);
              if (Number.isFinite(n)) patchProps({ size: n });
            }}
            className="of-input"
            inputMode="numeric"
            placeholder={overlayType === 'drawer' ? '360' : '480'}
            data-testid="overlay-size-input"
          />
        </FieldGroup>
      </div>

      <SectionHeader>Header</SectionHeader>
      <FieldGroup label="Show header">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={headerEnabled}
            onChange={(event) => patchProps({ header_enabled: event.target.checked })}
            data-testid="overlay-header-enabled"
          />
          <span>Render a header bar with title + close button</span>
        </label>
      </FieldGroup>
      {headerEnabled ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
          <FieldGroup label="Title (overrides name)">
            <input
              value={readOverlayPropString(props, 'header_title')}
              onChange={(event) => patchProps({ header_title: event.target.value })}
              className="of-input"
              placeholder="Falls back to overlay name"
              data-testid="overlay-header-title-input"
            />
          </FieldGroup>
          <FieldGroup label="Icon">
            <input
              value={readOverlayPropString(props, 'header_icon')}
              onChange={(event) => patchProps({ header_icon: event.target.value })}
              className="of-input"
              placeholder="★ or emoji"
              data-testid="overlay-header-icon-input"
            />
          </FieldGroup>
        </div>
      ) : null}

      <SectionHeader>Backdrop</SectionHeader>
      <FieldGroup label="Show backdrop">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={showBackdrop}
            onChange={(event) => patchProps({ show_backdrop: event.target.checked })}
            data-testid="overlay-show-backdrop"
          />
          <span>Render an opaque backdrop behind the overlay</span>
        </label>
      </FieldGroup>
      <FieldGroup label="Close on backdrop click">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={closeOnBackdrop}
            onChange={(event) => patchProps({ close_on_backdrop_click: event.target.checked })}
            data-testid="overlay-close-on-backdrop"
          />
          <span>Clicking outside the overlay closes it</span>
        </label>
      </FieldGroup>
      <FieldGroup label="Backdrop opacity (0-1)">
        <input
          value={backdropOpacity}
          onChange={(event) => {
            const raw = event.target.value;
            if (!raw) {
              patchProps({ backdrop_opacity: undefined });
              return;
            }
            const n = Number(raw);
            if (Number.isFinite(n) && n >= 0 && n <= 1) patchProps({ backdrop_opacity: n });
          }}
          className="of-input"
          inputMode="decimal"
          placeholder="0.5"
          data-testid="overlay-backdrop-opacity-input"
        />
      </FieldGroup>

      <p className="of-text-muted" style={{ fontSize: 11, margin: 0 }}>
        Body widgets are managed via the JSON tab for now. A future slice will wire the canvas
        to overlay bodies.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default composed editor (kept for backward compatibility / fallback usage)
// ---------------------------------------------------------------------------

export function AppPagesEditor({ pagesJson, widgetCatalog, onChange }: AppPagesEditorProps) {
  const { pages, error } = useMemo(() => parsePages(pagesJson), [pagesJson]);
  const catalog = useMemo(() => getWidgetCatalogItems(widgetCatalog), [widgetCatalog]);
  const [selectedPageId, setSelectedPageId] = useState('');
  const [selectedWidgetId, setSelectedWidgetId] = useState('');
  const [selectedOverlayId, setSelectedOverlayId] = useState('');
  const [clipboard, setClipboard] = useState<ClipboardEntry | null>(null);

  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? pages[0] ?? null;
  const selectedWidget = selectedPage?.widgets.find((widget) => widget.id === selectedWidgetId) ?? null;
  const selectedOverlay = selectedPage?.overlays?.find((overlay) => overlay.id === selectedOverlayId) ?? null;

  useEffect(() => {
    if (pages.length === 0) {
      setSelectedPageId('');
      setSelectedWidgetId('');
      setSelectedOverlayId('');
      return;
    }
    if (!pages.some((page) => page.id === selectedPageId)) {
      setSelectedPageId(pages[0].id);
      setSelectedWidgetId('');
      setSelectedOverlayId('');
    }
  }, [pages, selectedPageId]);

  useEffect(() => {
    if (!selectedPage || !selectedWidgetId) return;
    if (!selectedPage.widgets.some((widget) => widget.id === selectedWidgetId)) {
      setSelectedWidgetId('');
    }
  }, [selectedPage, selectedWidgetId]);

  useEffect(() => {
    if (!selectedPage || !selectedOverlayId) return;
    if (!(selectedPage.overlays ?? []).some((overlay) => overlay.id === selectedOverlayId)) {
      setSelectedOverlayId('');
    }
  }, [selectedPage, selectedOverlayId]);

  function commit(nextPages: AppPage[]) {
    commitPages(onChange, nextPages);
  }

  function patchPage(id: string, patch: Partial<AppPage>) {
    commit(pages.map((page) => (page.id === id ? { ...page, ...patch } : page)));
  }

  function patchWidget(pageId: string, widgetId: string, patch: Partial<AppWidget>) {
    commit(patchWidgetInPages(pages, pageId, widgetId, patch));
  }

  function addPage() {
    const next = defaultPage();
    commit([...pages, next]);
    setSelectedPageId(next.id);
    setSelectedWidgetId('');
  }

  function duplicatePage(page: AppPage) {
    const next = {
      ...page,
      id: makeId('page'),
      name: `${page.name} copy`,
      path: `${page.path.replace(/\/$/, '')}-copy`,
      widgets: page.widgets.map((widget) => ({ ...widget, id: makeId('widget') })),
    };
    commit([...pages, next]);
    setSelectedPageId(next.id);
    setSelectedWidgetId('');
  }

  function deletePage(id: string) {
    const nextPages = pages.filter((page) => page.id !== id);
    commit(nextPages);
    if (selectedPageId === id) {
      setSelectedPageId(nextPages[0]?.id ?? '');
      setSelectedWidgetId('');
    }
  }

  function addWidget(pageId: string, item: WidgetCatalogItem, atY?: number) {
    const widget = defaultWidget(item);
    if (typeof atY === 'number') widget.position = { ...widget.position, y: atY };
    commit(pages.map((page) => (page.id === pageId ? { ...page, widgets: [...page.widgets, widget] } : page)));
    setSelectedWidgetId(widget.id);
  }

  function duplicateWidget(pageId: string, widget: AppWidget) {
    const copy = { ...widget, id: makeId('widget'), title: `${widget.title || widget.widget_type} copy` };
    commit(pages.map((page) => (page.id === pageId ? { ...page, widgets: [...page.widgets, copy] } : page)));
    setSelectedWidgetId(copy.id);
  }

  function deleteWidget(pageId: string, widgetId: string) {
    commit(pages.map((page) => (
      page.id === pageId ? { ...page, widgets: page.widgets.filter((widget) => widget.id !== widgetId) } : page
    )));
    if (selectedWidgetId === widgetId) setSelectedWidgetId('');
  }

  function applyLayoutTemplate(pageId: string, widgets: AppWidget[]) {
    commit(pages.map((page) => (page.id === pageId ? { ...page, widgets } : page)));
    setSelectedWidgetId('');
  }

  function addOverlay(pageId: string) {
    const overlay = defaultOverlay();
    commit(addOverlayToPage(pages, pageId, overlay));
    setSelectedOverlayId(overlay.id);
    setSelectedWidgetId('');
  }

  function deleteOverlay(pageId: string, overlayId: string) {
    commit(removeOverlayFromPage(pages, pageId, overlayId));
    if (selectedOverlayId === overlayId) setSelectedOverlayId('');
  }

  function duplicateOverlay(pageId: string, overlayId: string) {
    const result = duplicateOverlayInPage(pages, pageId, overlayId);
    if (!result.newId) return;
    commit(result.pages);
    setSelectedOverlayId(result.newId);
  }

  function patchOverlay(pageId: string, overlayId: string, patch: Partial<AppOverlay>) {
    commit(patchOverlayInPage(pages, pageId, overlayId, patch));
  }

  function copyWidgetToClipboard(widget: AppWidget) {
    setClipboard({ kind: 'widget', payload: widget });
  }

  function copyOverlayToClipboard(overlay: AppOverlay) {
    setClipboard({ kind: 'overlay', payload: overlay });
  }

  function pasteWidgetFromClipboard(pageId: string, mode: 'same' | 'duplicate') {
    if (clipboard?.kind !== 'widget') return;
    // The composed editor has no settings.workshop_variables wired in, so the
    // "duplicate" mode degrades gracefully to a same-variable paste. Hosts
    // that do have settings (AppsPage) should call preparePastedWidget
    // directly and wire newVariables back into settings.
    const result = preparePastedWidget(clipboard.payload, mode, []);
    commit(pages.map((page) =>
      page.id === pageId ? { ...page, widgets: [...page.widgets, result.widget] } : page
    ));
    setSelectedWidgetId(result.widget.id);
  }

  function pasteOverlayFromClipboard(pageId: string, mode: 'same' | 'duplicate') {
    if (clipboard?.kind !== 'overlay') return;
    const result = preparePastedOverlay(clipboard.payload, mode, []);
    commit(addOverlayToPage(pages, pageId, result.overlay));
    setSelectedOverlayId(result.overlay.id);
  }

  function addSection(pageId: string) {
    const page = pages.find((entry) => entry.id === pageId);
    if (!page) return;
    const nextY = page.widgets.reduce((max, widget) => Math.max(max, (widget.position?.y ?? 0) + (widget.position?.height ?? 1)), 0);
    const placeholder: AppWidget = {
      id: makeId('widget'),
      widget_type: 'text',
      title: 'Section',
      description: '',
      position: { x: 0, y: nextY, width: page.layout?.columns ?? 12, height: 2 },
      props: { content: '### Section\nDrop widgets here.' },
      binding: null,
      events: [],
      children: [],
    };
    commit(pages.map((entry) => (entry.id === pageId ? { ...entry, widgets: [...entry.widgets, placeholder] } : entry)));
    setSelectedWidgetId(placeholder.id);
  }

  if (error) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div className="of-status-danger" style={{ padding: '9px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          {error}
        </div>
        <JsonEditor value={pagesJson} onChange={onChange} minHeight={360} />
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(220px, 0.7fr) minmax(0, 1.7fr) minmax(280px, 0.95fr)' }}>
      <section className="of-panel" style={{ alignContent: 'start', padding: 10 }}>
        <PagesOutline
          pages={pages}
          selectedPageId={selectedPage?.id ?? ''}
          selectedWidgetId={selectedWidgetId}
          selectedOverlayId={selectedOverlayId}
          onSelectPage={(id) => {
            setSelectedPageId(id);
            setSelectedWidgetId('');
            setSelectedOverlayId('');
          }}
          onSelectWidget={(_, widgetId) => {
            setSelectedWidgetId(widgetId);
            setSelectedOverlayId('');
          }}
          onAddPage={addPage}
          onDuplicatePage={duplicatePage}
          onDeletePage={deletePage}
          onAddOverlay={addOverlay}
          onSelectOverlay={(pageId, overlayId) => {
            if (pageId !== selectedPageId) setSelectedPageId(pageId);
            setSelectedOverlayId(overlayId);
            setSelectedWidgetId('');
          }}
          onDuplicateOverlay={duplicateOverlay}
          onDeleteOverlay={deleteOverlay}
        />
      </section>
      <section className="of-panel" style={{ minWidth: 0, padding: 0 }}>
        <PageCanvas
          page={selectedPage}
          catalog={catalog}
          selectedWidgetId={selectedWidgetId}
          onSelectWidget={setSelectedWidgetId}
          onAddSection={() => selectedPage && addSection(selectedPage.id)}
          onAddWidgetToSection={() => {
            if (selectedPage && catalog.length > 0) addWidget(selectedPage.id, catalog[0]);
          }}
          onApplyTemplate={(widgets) => selectedPage && applyLayoutTemplate(selectedPage.id, widgets)}
        />
      </section>
      <aside className="of-panel" style={{ alignContent: 'start', padding: 0 }}>
        {selectedOverlay && selectedPage ? (
          <OverlayInspector
            overlay={selectedOverlay}
            onPatch={(patch) => patchOverlay(selectedPage.id, selectedOverlay.id, patch)}
            onDuplicate={() => duplicateOverlay(selectedPage.id, selectedOverlay.id)}
            onDelete={() => deleteOverlay(selectedPage.id, selectedOverlay.id)}
            clipboard={clipboard}
            onCopy={() => copyOverlayToClipboard(selectedOverlay)}
            onCut={() => {
              copyOverlayToClipboard(selectedOverlay);
              deleteOverlay(selectedPage.id, selectedOverlay.id);
            }}
            onPasteSame={() => pasteOverlayFromClipboard(selectedPage.id, 'same')}
            onPasteDuplicate={() => pasteOverlayFromClipboard(selectedPage.id, 'duplicate')}
          />
        ) : selectedWidget && selectedPage ? (
          <WidgetInspector
            widget={selectedWidget}
            catalog={catalog}
            onPatch={(patch) => patchWidget(selectedPage.id, selectedWidget.id, patch)}
            onDuplicate={() => duplicateWidget(selectedPage.id, selectedWidget)}
            onDelete={() => deleteWidget(selectedPage.id, selectedWidget.id)}
            clipboard={clipboard}
            onCopy={() => copyWidgetToClipboard(selectedWidget)}
            onCut={() => {
              copyWidgetToClipboard(selectedWidget);
              deleteWidget(selectedPage.id, selectedWidget.id);
            }}
            onPasteSame={() => pasteWidgetFromClipboard(selectedPage.id, 'same')}
            onPasteDuplicate={() => pasteWidgetFromClipboard(selectedPage.id, 'duplicate')}
          />
        ) : selectedPage ? (
          <PageInspector
            page={selectedPage}
            onPatch={(patch) => patchPage(selectedPage.id, patch)}
            onDuplicate={() => duplicatePage(selectedPage)}
            onDelete={() => deletePage(selectedPage.id)}
            disableDelete={pages.length <= 1}
          />
        ) : (
          <div style={{ padding: 14 }}>
            <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Add a page to start building.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

// Convenience: a small popover-like widget catalog panel used by the builder
// when the user clicks "Add widget".
export function WidgetCatalogPanel({
  items,
  onSelect,
}: {
  items: WidgetCatalogItem[];
  onSelect: (item: WidgetCatalogItem) => void;
}) {
  return (
    <WidgetCatalog items={items} onSelect={onSelect} />
  );
}

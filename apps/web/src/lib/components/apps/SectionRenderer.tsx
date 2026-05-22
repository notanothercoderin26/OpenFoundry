import { useEffect, useState, type CSSProperties, type DragEvent, type ReactElement } from 'react';

import type { AppSection, AppWidget, PageLayout, WidgetEvent } from '@/lib/api/apps';
import { AppWidgetRenderer } from '@/lib/components/apps/AppWidgetRenderer';
import { EmbeddedModuleRenderer } from '@/lib/components/apps/widgets/EmbeddedModuleRenderer';
import type { InterfaceMapping } from '@/lib/components/apps/widgets/embeddedRuntimeBridge';

const SUPPORTED_LAYOUT_KINDS = new Set([
  'grid',
  'columns',
  'rows',
  'tabs',
  'flow',
  'toolbar',
  'loop',
]);

export function resolveLayoutKind(layout: PageLayout | null | undefined): string {
  const raw = typeof layout?.kind === 'string' ? layout.kind.trim() : '';
  if (!raw) return 'grid';
  return SUPPORTED_LAYOUT_KINDS.has(raw) ? raw : 'grid';
}

export function resolveColumns(layout: PageLayout | null | undefined): number {
  const raw = Number(layout?.columns ?? 12);
  const value = Number.isFinite(raw) && raw > 0 ? raw : 12;
  return Math.max(1, Math.min(24, value));
}

export function sortByPosition<T extends { position?: { x?: number; y?: number } | undefined }>(
  items: readonly T[],
): T[] {
  return [...items].sort((left, right) => {
    const leftY = left.position?.y ?? 0;
    const rightY = right.position?.y ?? 0;
    if (leftY !== rightY) return leftY - rightY;
    return (left.position?.x ?? 0) - (right.position?.x ?? 0);
  });
}

const DEFAULT_LOOP_MAX_ITEMS = 100;
const LOOP_HARD_CAP = 1000;

function readLoopItems(props: Record<string, unknown> | undefined): unknown[] {
  const items = props?.loop_items;
  return Array.isArray(items) ? items : [];
}

function readLoopMaxItems(props: Record<string, unknown> | undefined): number {
  const raw = props?.loop_max_items;
  const numeric = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_LOOP_MAX_ITEMS;
  return Math.min(Math.floor(numeric), LOOP_HARD_CAP);
}

function readLoopEmptyMessage(props: Record<string, unknown> | undefined): string {
  const raw = props?.loop_empty_message;
  if (typeof raw === 'string' && raw.trim()) return raw;
  return 'No items to loop over.';
}

function isPrimitive(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

// --- Section style formatting -----------------------------------------

export type SectionHeaderFormat = 'block' | 'contained' | 'floating';
export type SectionBorderStyle =
  | 'bordered'
  | 'outer-shadow'
  | 'inner-shadow'
  | 'borderless';
export type SectionPaddingPreset = 'none' | 'compact' | 'regular' | 'large' | 'custom';
// Section background presets cover the Foundry-parity gray scale, a
// transparent sentinel, and a curated Blueprint-flavoured palette so builders
// can colour-tag sections without dropping into hex.
export type SectionBackgroundPreset =
  | 'gray-1'
  | 'gray-2'
  | 'gray-3'
  | 'gray-4'
  | 'gray-5'
  | 'transparent'
  | 'surface'
  | 'red-3'
  | 'orange-3'
  | 'yellow-3'
  | 'green-3'
  | 'turquoise-3'
  | 'cerulean-3'
  | 'blue-3'
  | 'indigo-3'
  | 'violet-3'
  | 'magenta-3';

const SECTION_BACKGROUND_PRESETS: SectionBackgroundPreset[] = [
  'gray-1',
  'gray-2',
  'gray-3',
  'gray-4',
  'gray-5',
  'transparent',
  'surface',
  'red-3',
  'orange-3',
  'yellow-3',
  'green-3',
  'turquoise-3',
  'cerulean-3',
  'blue-3',
  'indigo-3',
  'violet-3',
  'magenta-3',
];

export interface SectionPaddingCustom {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface SectionStyling {
  classNames: string[];
  style: CSSProperties;
  headerFormat: SectionHeaderFormat;
}

function readHeaderFormat(props: Record<string, unknown> | undefined): SectionHeaderFormat | undefined {
  const value = props?.header_format;
  return value === 'block' || value === 'contained' || value === 'floating' ? value : undefined;
}

function readBorderStyle(props: Record<string, unknown> | undefined): SectionBorderStyle | undefined {
  const value = props?.border_style;
  return value === 'bordered' || value === 'outer-shadow' || value === 'inner-shadow' || value === 'borderless'
    ? value
    : undefined;
}

function readPaddingPreset(props: Record<string, unknown> | undefined): SectionPaddingPreset | undefined {
  const value = props?.padding;
  return value === 'none' || value === 'compact' || value === 'regular' || value === 'large' || value === 'custom'
    ? value
    : undefined;
}

function readPaddingCustom(props: Record<string, unknown> | undefined): SectionPaddingCustom | undefined {
  const raw = props?.padding_custom;
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: SectionPaddingCustom = {};
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const v = r[side];
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (Number.isFinite(n) && n >= 0) out[side] = n;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function readBackgroundColor(props: Record<string, unknown> | undefined): string | undefined {
  const raw = props?.background_color;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

function isPresetBackground(value: string): value is SectionBackgroundPreset {
  return (SECTION_BACKGROUND_PRESETS as readonly string[]).includes(value);
}

export function isSectionDropZone(props: Record<string, unknown> | undefined): boolean {
  return props?.drop_zone === true || props?.drop_handling === true;
}

export interface SectionDropPayload {
  data: unknown;
  raw_text: string;
  drag_types: string[];
}

/**
 * Extracts a payload object from a DataTransfer. Tries
 *   1. application/json (parsed),
 *   2. text/plain (parsed if valid JSON, else raw string),
 * falling back to an empty payload. Returns the original raw text and a list
 * of available drag types so on_drop event configs can route on type/content.
 */
export function readDropPayload(dataTransfer: DataTransfer | null | undefined): SectionDropPayload {
  if (!dataTransfer) return { data: null, raw_text: '', drag_types: [] };
  const dragTypes = Array.from(dataTransfer.types ?? []);
  const json = dataTransfer.getData('application/json');
  if (json) {
    try {
      return { data: JSON.parse(json), raw_text: json, drag_types: dragTypes };
    } catch {
      // fall through to text/plain
    }
  }
  const text = dataTransfer.getData('text/plain') ?? '';
  if (text) {
    try {
      return { data: JSON.parse(text), raw_text: text, drag_types: dragTypes };
    } catch {
      return { data: text, raw_text: text, drag_types: dragTypes };
    }
  }
  return { data: null, raw_text: '', drag_types: dragTypes };
}

export function resolveSectionStyling(
  props: Record<string, unknown> | undefined,
): SectionStyling {
  const headerFormat: SectionHeaderFormat = readHeaderFormat(props) ?? 'block';
  const borderStyle = readBorderStyle(props);
  const padding = readPaddingPreset(props);
  const paddingCustom = readPaddingCustom(props);
  const bg = readBackgroundColor(props);

  const classNames: string[] = [`of-app-section--header-${headerFormat}`];
  if (borderStyle) classNames.push(`of-app-section--border-${borderStyle}`);
  if (padding && padding !== 'custom') {
    classNames.push(`of-app-section--padding-${padding}`);
  }

  const style: CSSProperties = {};
  if (bg) {
    if (isPresetBackground(bg)) {
      classNames.push(`of-app-section--bg-${bg}`);
    } else {
      style.background = bg;
    }
  }
  if (padding === 'custom' && paddingCustom) {
    const { top = 0, right = 0, bottom = 0, left = 0 } = paddingCustom;
    style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
  }

  return { classNames, style, headerFormat };
}

// ----------------------------------------------------------------------

export function augmentRuntimeParametersForLoopItem(
  base: Record<string, string>,
  item: unknown,
  index: number,
): Record<string, string> {
  const out: Record<string, string> = { ...base, item_index: String(index) };
  if (isPrimitive(item)) {
    out.item = String(item);
    return out;
  }
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
      if (value === null || value === undefined) continue;
      if (isPrimitive(value)) {
        out[`item.${key}`] = String(value);
      } else {
        // Single level of nesting; deeper values stringify to JSON so
        // builders can at least inspect them.
        out[`item.${key}`] = JSON.stringify(value);
      }
    }
  }
  return out;
}

export interface SectionRendererContext {
  globalFilter: string;
  runtimeParameters: Record<string, string>;
  interactivePromptSeed: string;
  primaryInteractiveAgentWidgetId: string | null;
  onAction: (event: WidgetEvent, payload?: Record<string, unknown>) => Promise<void>;
}

export interface SectionRendererProps extends SectionRendererContext {
  section: AppSection;
}

interface WidgetItemProps extends SectionRendererContext {
  widget: AppWidget;
  parentColumns: number;
  layoutKind: string;
}

function WidgetItem({ widget, parentColumns, layoutKind, ...ctx }: WidgetItemProps): ReactElement {
  const span = Math.max(1, Math.min(widget.position?.width ?? parentColumns, parentColumns));
  const rows = Math.max(1, widget.position?.height ?? 2);
  // Toolbar sections host compact widgets (button groups, metrics, single
  // inputs); enforcing a 160px floor would defeat the point.
  const baseStyle: CSSProperties =
    layoutKind === 'toolbar' ? {} : { minHeight: Math.max(160, rows * 96) };
  const style: CSSProperties =
    layoutKind === 'grid'
      ? ({ ...baseStyle, '--app-widget-span': span } as CSSProperties)
      : baseStyle;
  return (
    <div className="of-app-runtime__widget" style={style}>
      <AppWidgetRenderer
        widget={widget}
        globalFilter={ctx.globalFilter}
        runtimeParameters={ctx.runtimeParameters}
        interactivePromptSeed={ctx.interactivePromptSeed}
        primaryInteractiveAgentWidgetId={ctx.primaryInteractiveAgentWidgetId}
        onAction={ctx.onAction}
      />
    </div>
  );
}

function buildBodyStyle(kind: string, layout: PageLayout, columns: number): CSSProperties {
  const gap = layout.gap || '1rem';
  if (kind === 'columns') {
    return { display: 'flex', flexDirection: 'row', gap, alignItems: 'stretch' };
  }
  if (kind === 'rows') {
    const base: CSSProperties = { display: 'flex', flexDirection: 'column', gap };
    if (layout.scrollable) {
      return { ...base, overflowY: 'auto', minHeight: 0 };
    }
    return base;
  }
  if (kind === 'flow') {
    // Flow is conceptually "content that overflows" — always scrollable.
    return {
      display: 'flex',
      flexDirection: 'column',
      gap,
      overflowY: 'auto',
      minHeight: 0,
      height: '100%',
    };
  }
  if (kind === 'toolbar') {
    // Toolbar is a horizontal strip that wraps to a new line when content
    // exceeds the available width; tighter default gap than other kinds.
    return {
      display: 'flex',
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: layout.gap || '8px',
    };
  }
  // grid is the default; tabs/loop are handled in SectionRenderer itself
  // before this helper is consulted.
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap,
    alignItems: 'stretch',
    ['--app-runtime-columns' as string]: columns,
  } as CSSProperties;
}

interface LoopChildModuleConfig {
  module_slug?: string;
  module_rid?: string;
  // The external id of the child interface variable that receives the
  // iteration item. Required when `module_slug` is set.
  item_external_id?: string;
  // Extra mappings that should propagate the same value to every
  // iteration (e.g. selection state shared across the loop).
  shared_mapping?: InterfaceMapping;
}

function readLoopChildModule(props: Record<string, unknown> | undefined): LoopChildModuleConfig | null {
  const raw = props?.child_module;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  const slug =
    typeof entry.module_slug === 'string' ? entry.module_slug : typeof entry.module_rid === 'string' ? entry.module_rid : '';
  if (!slug.trim()) return null;
  return {
    module_slug: typeof entry.module_slug === 'string' ? entry.module_slug : '',
    module_rid: typeof entry.module_rid === 'string' ? entry.module_rid : '',
    item_external_id: typeof entry.item_external_id === 'string' ? entry.item_external_id : '',
    shared_mapping: (entry.shared_mapping as InterfaceMapping) ?? {},
  };
}

function LoopBody({
  section,
  columns,
  ctx,
}: {
  section: AppSection;
  columns: number;
  ctx: SectionRendererContext;
}): ReactElement {
  const items = readLoopItems(section.props);
  const maxItems = readLoopMaxItems(section.props);
  const limited = items.slice(0, maxItems);

  if (limited.length === 0) {
    return <div className="of-app-runtime__empty">{readLoopEmptyMessage(section.props)}</div>;
  }

  const childModule = readLoopChildModule(section.props);
  const widgets = sortByPosition(Array.isArray(section.widgets) ? section.widgets : []);
  const childSections = Array.isArray(section.sections) ? section.sections : [];

  return (
    <div className="of-app-section__loop">
      {limited.map((item, index) => {
        const iterationParams = augmentRuntimeParametersForLoopItem(ctx.runtimeParameters, item, index);
        const iterationCtx: SectionRendererContext = { ...ctx, runtimeParameters: iterationParams };

        // Child-module loops: render an embedded child per item, with
        // the iteration value bound to the configured interface var.
        // Inline widgets/child sections still render alongside for
        // builders that mix layouts; in pure embed kanbans they'll
        // typically be empty.
        if (childModule && childModule.item_external_id) {
          const itemMapping: InterfaceMapping = {
            [childModule.item_external_id]: { kind: 'literal', value: item },
            ...(childModule.shared_mapping ?? {}),
          };
          return (
            <div
              key={`loop-${index}`}
              className="of-app-section__loop-item"
              data-loop-index={index}
            >
              <EmbeddedModuleRenderer
                config={{
                  module_slug: childModule.module_slug,
                  module_rid: childModule.module_rid,
                  mapping: itemMapping,
                  lazy_load: index > 4,
                }}
                fallbackLabel={`Loop iteration #${index + 1}`}
              />
              {widgets.map((widget) => (
                <WidgetItem
                  key={`${widget.id}-${index}`}
                  widget={widget}
                  parentColumns={columns}
                  layoutKind="loop"
                  globalFilter={iterationCtx.globalFilter}
                  runtimeParameters={iterationCtx.runtimeParameters}
                  interactivePromptSeed={iterationCtx.interactivePromptSeed}
                  primaryInteractiveAgentWidgetId={iterationCtx.primaryInteractiveAgentWidgetId}
                  onAction={iterationCtx.onAction}
                />
              ))}
            </div>
          );
        }

        return (
          <div
            key={`loop-${index}`}
            className="of-app-section__loop-item"
            data-loop-index={index}
          >
            {widgets.map((widget) => (
              <WidgetItem
                key={`${widget.id}-${index}`}
                widget={widget}
                parentColumns={columns}
                layoutKind="loop"
                globalFilter={iterationCtx.globalFilter}
                runtimeParameters={iterationCtx.runtimeParameters}
                interactivePromptSeed={iterationCtx.interactivePromptSeed}
                primaryInteractiveAgentWidgetId={iterationCtx.primaryInteractiveAgentWidgetId}
                onAction={iterationCtx.onAction}
              />
            ))}
            {childSections.map((child) => (
              <SectionRenderer
                key={`${child.id}-${index}`}
                section={child}
                globalFilter={iterationCtx.globalFilter}
                runtimeParameters={iterationCtx.runtimeParameters}
                interactivePromptSeed={iterationCtx.interactivePromptSeed}
                primaryInteractiveAgentWidgetId={iterationCtx.primaryInteractiveAgentWidgetId}
                onAction={iterationCtx.onAction}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function TabsBody({ section, ctx }: { section: AppSection; ctx: SectionRendererContext }): ReactElement {
  const allTabs = Array.isArray(section.sections) ? section.sections : [];
  const visibleTabs = allTabs.filter((tab) => tab.visible !== false);
  const visibleIds = visibleTabs.map((tab) => tab.id).join('|');
  const [activeTabId, setActiveTabId] = useState<string>(visibleTabs[0]?.id ?? '');

  useEffect(() => {
    if (visibleTabs.length === 0) {
      if (activeTabId !== '') setActiveTabId('');
      return;
    }
    if (!visibleTabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(visibleTabs[0].id);
    }
    // visibleIds is a stable string fingerprint of the visible-tab list so
    // we only resync when the set actually changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds]);

  if (visibleTabs.length === 0) {
    return <div className="of-app-runtime__empty">No tabs in this section.</div>;
  }

  const activeTab = visibleTabs.find((tab) => tab.id === activeTabId) ?? visibleTabs[0];

  return (
    <div className="of-app-section__tabs">
      <div role="tablist" className="of-app-section__tablist">
        {visibleTabs.map((tab, index) => {
          const isActive = tab.id === activeTab.id;
          const label = tab.title?.trim() || `Tab ${index + 1}`;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`of-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`of-tabpanel-${tab.id}`}
              data-tab-id={tab.id}
              className={isActive ? 'of-app-section__tab is-active' : 'of-app-section__tab'}
              onClick={() => setActiveTabId(tab.id)}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`of-tabpanel-${activeTab.id}`}
        aria-labelledby={`of-tab-${activeTab.id}`}
        className="of-app-section__tabpanel"
      >
        <SectionRenderer section={activeTab} {...ctx} />
      </div>
    </div>
  );
}

export function SectionRenderer({ section, ...ctx }: SectionRendererProps): ReactElement | null {
  if (section.visible === false) return null;

  const layout: PageLayout = section.layout ?? {
    kind: 'grid',
    columns: 12,
    gap: '1rem',
    max_width: '',
  };
  const kind = resolveLayoutKind(layout);
  const columns = resolveColumns(layout);

  const widgets = sortByPosition(Array.isArray(section.widgets) ? section.widgets : []);
  const childSections = Array.isArray(section.sections) ? section.sections : [];

  const hasHeader = Boolean(section.title || section.description);

  const styling = resolveSectionStyling(section.props);
  const isDropZone = isSectionDropZone(section.props);
  const onDropEvents = (section.events ?? []).filter((event) => event.trigger === 'on_drop');
  const [isDropTarget, setIsDropTarget] = useState(false);

  const sectionClassName = [
    'of-app-section',
    `of-app-section--${kind}`,
    ...styling.classNames,
    isDropZone ? 'of-app-section--drop-zone' : '',
    isDropZone && isDropTarget ? 'is-drop-target' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const sectionStyle = styling.style;

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!isDropZone) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    if (!isDropTarget) setIsDropTarget(true);
  }
  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (!isDropZone) return;
    // Ignore drag-leave events that bubble from descendants by checking that
    // we're truly leaving the section rectangle.
    const related = event.relatedTarget as Node | null;
    if (related && event.currentTarget.contains(related)) return;
    setIsDropTarget(false);
  }
  function handleDrop(event: DragEvent<HTMLElement>) {
    if (!isDropZone) return;
    event.preventDefault();
    setIsDropTarget(false);
    if (onDropEvents.length === 0) return;
    const payload = readDropPayload(event.dataTransfer);
    for (const dropEvent of onDropEvents) {
      void ctx.onAction(dropEvent, payload as unknown as Record<string, unknown>);
    }
  }

  const dropProps = isDropZone
    ? {
        onDragOver: handleDragOver,
        onDragLeave: handleDragLeave,
        onDrop: handleDrop,
        'data-drop-zone': 'true' as const,
      }
    : {};
  const dropTargetAttr = isDropZone ? { 'data-drop-target': isDropTarget ? 'true' : 'false' } : {};

  const headerNode = hasHeader ? (
    <header className="of-app-section__header">
      {section.title && <h3 className="of-app-section__title">{section.title}</h3>}
      {section.description && (
        <p className="of-app-section__description">{section.description}</p>
      )}
    </header>
  ) : null;

  // Tabs has a fundamentally different body — children become tabs rather
  // than siblings — so we branch before computing the flex/grid body style.
  // Header format only applies to layouts that have a single body container;
  // tabs/loop ignore it and always render the header above the body.
  if (kind === 'tabs') {
    return (
      <section
        className={sectionClassName}
        style={sectionStyle}
        data-section-id={section.id}
        data-section-kind={kind}
        {...dropTargetAttr}
        {...dropProps}
      >
        {headerNode}
        <TabsBody section={section} ctx={ctx} />
      </section>
    );
  }

  // Loop renders the section's children once per item in `props.loop_items`,
  // augmenting runtimeParameters with item_index and flat item.<key> entries
  // so widget content templates can reference the current iteration.
  if (kind === 'loop') {
    return (
      <section
        className={sectionClassName}
        style={sectionStyle}
        data-section-id={section.id}
        data-section-kind={kind}
        {...dropTargetAttr}
        {...dropProps}
      >
        {headerNode}
        <LoopBody section={section} columns={columns} ctx={ctx} />
      </section>
    );
  }

  const bodyStyle = buildBodyStyle(kind, layout, columns);
  const isEmpty = widgets.length === 0 && childSections.length === 0;
  const headerInsideBody = styling.headerFormat === 'contained';

  return (
    <section
      className={sectionClassName}
      style={sectionStyle}
      data-section-id={section.id}
      data-section-kind={kind}
      {...dropTargetAttr}
      {...dropProps}
    >
      {!headerInsideBody && headerNode}
      <div className="of-app-section__body" style={bodyStyle}>
        {headerInsideBody && headerNode}
        {widgets.map((widget) => (
          <WidgetItem
            key={widget.id}
            widget={widget}
            parentColumns={columns}
            layoutKind={kind}
            globalFilter={ctx.globalFilter}
            runtimeParameters={ctx.runtimeParameters}
            interactivePromptSeed={ctx.interactivePromptSeed}
            primaryInteractiveAgentWidgetId={ctx.primaryInteractiveAgentWidgetId}
            onAction={ctx.onAction}
          />
        ))}
        {childSections.map((child) => (
          <SectionRenderer
            key={child.id}
            section={child}
            globalFilter={ctx.globalFilter}
            runtimeParameters={ctx.runtimeParameters}
            interactivePromptSeed={ctx.interactivePromptSeed}
            primaryInteractiveAgentWidgetId={ctx.primaryInteractiveAgentWidgetId}
            onAction={ctx.onAction}
          />
        ))}
        {isEmpty && <div className="of-app-runtime__empty">No content in this section.</div>}
      </div>
    </section>
  );
}

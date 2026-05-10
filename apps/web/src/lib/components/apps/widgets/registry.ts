// Widget Registry — single source of truth for which widget_type strings the
// app shell knows how to render.
//
// Both the Workshop editor (apps/web/src/routes/apps/WorkshopEditorPage.tsx)
// and the public runtime (AppRuntimePage → AppRenderer → AppWidgetRenderer)
// look up widget components through this registry instead of switching on
// strings inline. Adding a new widget type is one register() call; the
// editor's preview and the published runtime pick it up automatically.
//
// Extension: a future plugin SDK can call register() at boot time and add
// widget types from outside the core bundle.

import type { ComponentType } from 'react';

import type { AppWidget } from '@/lib/api/apps';

export interface WidgetRenderProps {
  widget: AppWidget;
}

export interface WidgetRegistration {
  type: string;
  Component: ComponentType<WidgetRenderProps>;
  /** Free-form description shown in tooling. */
  label?: string;
  /** Schema version of this widget's `props` shape. Bumped when props change. */
  version?: string;
}

const REGISTRY = new Map<string, WidgetRegistration>();

export function registerWidget(entry: WidgetRegistration): void {
  REGISTRY.set(entry.type, entry);
}

export function getWidget(type: string): WidgetRegistration | undefined {
  return REGISTRY.get(type);
}

export function listRegisteredWidgets(): WidgetRegistration[] {
  return Array.from(REGISTRY.values());
}

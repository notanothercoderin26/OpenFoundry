import { useCallback, useEffect, type CSSProperties, type MouseEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';

import type { AppOverlay, AppSection, PageLayout, WidgetEvent } from '@/lib/api/apps';
import { SectionRenderer } from '@/lib/components/apps/SectionRenderer';
import { useRuntime } from '@/lib/components/apps/widgets/workshop-runtime-context';

export type AppOverlayType = 'drawer' | 'modal';
export type AppOverlayDrawerPosition = 'left' | 'right';

export interface ResolvedOverlayProps {
  position: AppOverlayDrawerPosition;
  size: number | undefined;
  header_enabled: boolean;
  header_title: string | null;
  header_icon: string | null;
  close_on_backdrop_click: boolean;
  show_backdrop: boolean;
  backdrop_opacity: number;
}

const DEFAULT_DRAWER_WIDTH = 360;
const DEFAULT_MODAL_WIDTH = 480;
const DEFAULT_BACKDROP_OPACITY = 0.5;

export function readOverlayProps(raw: unknown): ResolvedOverlayProps {
  const r = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {});
  const position = r.position === 'left' ? 'left' : 'right';
  const size = typeof r.size === 'number' && r.size > 0 ? r.size : undefined;
  const header_enabled = r.header_enabled !== false;
  const header_title = typeof r.header_title === 'string' ? r.header_title : null;
  const header_icon = typeof r.header_icon === 'string' ? r.header_icon : null;
  const close_on_backdrop_click = r.close_on_backdrop_click !== false;
  const show_backdrop = r.show_backdrop !== false;
  const rawOpacity = r.backdrop_opacity;
  const backdrop_opacity = typeof rawOpacity === 'number' && rawOpacity >= 0 && rawOpacity <= 1
    ? rawOpacity
    : DEFAULT_BACKDROP_OPACITY;
  return {
    position,
    size,
    header_enabled,
    header_title,
    header_icon,
    close_on_backdrop_click,
    show_backdrop,
    backdrop_opacity,
  };
}

export function resolveOverlayType(value: string | undefined): AppOverlayType {
  return value === 'modal' ? 'modal' : 'drawer';
}

export function resolveOverlayVisibility(
  overlay: AppOverlay,
  primitiveValues: Record<string, unknown>,
): boolean {
  const variableId = overlay.visible_variable_id;
  if (!variableId) return false;
  return Boolean(primitiveValues[variableId]);
}

export interface AppOverlayRendererProps {
  overlay: AppOverlay;
  globalFilter: string;
  runtimeParameters: Record<string, string>;
  interactivePromptSeed: string;
  primaryInteractiveAgentWidgetId: string | null;
  onAction: (event: WidgetEvent, payload?: Record<string, unknown>) => Promise<void>;
}

export function AppOverlayRenderer({
  overlay,
  ...ctx
}: AppOverlayRendererProps): ReactElement | null {
  const runtime = useRuntime();
  const visible = resolveOverlayVisibility(overlay, runtime.primitiveValues);
  const overlayType = resolveOverlayType(overlay.overlay_type);
  const props = readOverlayProps(overlay.props);
  const onCloseEvents = (overlay.events ?? []).filter((event) => event.trigger === 'on_close');

  const close = useCallback(() => {
    if (overlay.visible_variable_id) {
      runtime.setPrimitiveValue(overlay.visible_variable_id, false);
    }
    for (const event of onCloseEvents) {
      void ctx.onAction(event);
    }
  }, [overlay.visible_variable_id, runtime, onCloseEvents, ctx]);

  // Always register the ESC listener — but only act when visible. This keeps
  // hooks order stable across renders even when the overlay is hidden.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    if (!visible) return undefined;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [visible, close]);

  if (typeof document === 'undefined') return null;
  if (!visible) return null;

  const synthSection: AppSection = {
    id: `${overlay.id}-body`,
    layout: overlay.layout ?? ({ kind: 'grid', columns: 12, gap: '1rem', max_width: '' } as PageLayout),
    widgets: overlay.widgets ?? [],
    sections: overlay.sections ?? [],
  };

  const drawerStyle: CSSProperties =
    overlayType === 'drawer'
      ? {
          width: props.size ?? DEFAULT_DRAWER_WIDTH,
          [props.position === 'left' ? 'left' : 'right']: 0,
        }
      : {
          width: props.size ?? DEFAULT_MODAL_WIDTH,
        };

  const backdropStyle: CSSProperties = {
    background: props.show_backdrop
      ? `rgba(15, 23, 42, ${props.backdrop_opacity})`
      : 'transparent',
    pointerEvents: 'auto',
  };

  function handleBackdropClick() {
    if (props.close_on_backdrop_click) close();
  }
  function stopPropagation(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
  }

  const headerTitle = props.header_title?.trim() || overlay.name || 'Overlay';

  return createPortal(
    <div
      className={`of-app-overlay-backdrop${props.show_backdrop ? '' : ' is-transparent'}`}
      style={backdropStyle}
      data-overlay-id={overlay.id}
      data-overlay-type={overlayType}
      onClick={handleBackdropClick}
    >
      <div
        className={`of-app-overlay of-app-overlay--${overlayType} of-app-overlay--${props.position}`}
        style={drawerStyle}
        role="dialog"
        aria-modal="true"
        aria-label={headerTitle}
        data-testid={`app-overlay-${overlay.id}`}
        onClick={stopPropagation}
      >
        {props.header_enabled && (
          <header className="of-app-overlay__header">
            {props.header_icon && (
              <span className="of-app-overlay__icon" aria-hidden="true" data-icon={props.header_icon}>
                {props.header_icon}
              </span>
            )}
            <h3 className="of-app-overlay__title">{headerTitle}</h3>
            <button
              type="button"
              className="of-app-overlay__close"
              aria-label="Close overlay"
              data-testid={`app-overlay-${overlay.id}-close`}
              onClick={close}
            >
              ×
            </button>
          </header>
        )}
        <div className="of-app-overlay__body">
          <SectionRenderer
            section={synthSection}
            globalFilter={ctx.globalFilter}
            runtimeParameters={ctx.runtimeParameters}
            interactivePromptSeed={ctx.interactivePromptSeed}
            primaryInteractiveAgentWidgetId={ctx.primaryInteractiveAgentWidgetId}
            onAction={ctx.onAction}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

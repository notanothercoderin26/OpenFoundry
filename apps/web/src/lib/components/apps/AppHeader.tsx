import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react';

import type { AppEmbedInfo, AppWidget, WidgetEvent } from '@/lib/api/apps';
import { AppHeaderCollapseContext } from '@/lib/components/apps/AppHeaderCollapseContext';
import { AppWidgetRenderer } from '@/lib/components/apps/AppWidgetRenderer';

export type AppHeaderOrientation = 'horizontal' | 'vertical';
export type AppHeaderLogoMode = 'icon' | 'image' | 'none';
export type AppHeaderLogoPosition = 'left' | 'center' | 'right' | 'top' | 'bottom';

export interface AppHeaderConfig {
  enabled?: boolean;
  title?: string | null;
  title_color?: string | null;
  logo_mode?: AppHeaderLogoMode;
  icon?: string | null;
  icon_color?: string | null;
  image_url?: string | null;
  image_height?: number;
  logo_position?: AppHeaderLogoPosition;
  favoriting_enabled?: boolean;
  background_color?: string | null;
  orientation?: AppHeaderOrientation;
  height?: number;
  width?: number;
  collapsible?: boolean;
  collapsed_by_default?: boolean;
  collapsed_image_url?: string | null;
  /**
   * Widgets pinned to the header bar. When the header is in a collapsed
   * vertical state, supported widget types (notably Button Group) render
   * in an icon-only mode driven by AppHeaderCollapseContext.
   */
  widgets?: AppWidget[];
}

function readString(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  return typeof value === 'string' ? value : undefined;
}

function readNumber(raw: Record<string, unknown>, key: string): number | undefined {
  const value = raw[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function readBoolean(raw: Record<string, unknown>, key: string): boolean | undefined {
  const value = raw[key];
  return typeof value === 'boolean' ? value : undefined;
}

function readLogoMode(value: unknown): AppHeaderLogoMode | undefined {
  return value === 'icon' || value === 'image' || value === 'none' ? value : undefined;
}

function readOrientation(value: unknown): AppHeaderOrientation | undefined {
  return value === 'horizontal' || value === 'vertical' ? value : undefined;
}

function readLogoPosition(value: unknown): AppHeaderLogoPosition | undefined {
  return value === 'left' || value === 'center' || value === 'right' || value === 'top' || value === 'bottom'
    ? value
    : undefined;
}

function readHeaderWidgets(raw: unknown): AppWidget[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const widgets: AppWidget[] = [];
  for (const entry of raw) {
    if (entry && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string') {
      widgets.push(entry as AppWidget);
    }
  }
  return widgets;
}

export function readHeaderConfig(raw: unknown): AppHeaderConfig {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  return {
    enabled: readBoolean(r, 'enabled'),
    title: readString(r, 'title') ?? null,
    title_color: readString(r, 'title_color') ?? null,
    logo_mode: readLogoMode(r.logo_mode),
    icon: readString(r, 'icon') ?? null,
    icon_color: readString(r, 'icon_color') ?? null,
    image_url: readString(r, 'image_url') ?? null,
    image_height: readNumber(r, 'image_height'),
    logo_position: readLogoPosition(r.logo_position),
    favoriting_enabled: readBoolean(r, 'favoriting_enabled'),
    background_color: readString(r, 'background_color') ?? null,
    orientation: readOrientation(r.orientation),
    height: readNumber(r, 'height'),
    width: readNumber(r, 'width'),
    collapsible: readBoolean(r, 'collapsible'),
    collapsed_by_default: readBoolean(r, 'collapsed_by_default'),
    collapsed_image_url: readString(r, 'collapsed_image_url') ?? null,
    widgets: readHeaderWidgets(r.widgets),
  };
}

export function resolveLogoMode(config: AppHeaderConfig, fallbackLogoUrl: string | null): AppHeaderLogoMode {
  if (config.logo_mode) return config.logo_mode;
  if (config.image_url) return 'image';
  if (config.icon) return 'icon';
  if (fallbackLogoUrl) return 'image';
  return 'none';
}

export interface AppHeaderProps {
  config: AppHeaderConfig;
  fallbackTitle: string;
  fallbackSubtitle: string;
  fallbackLogoUrl?: string | null;
  appId: string;
  publishedVersionNumber?: number | null;
  publishedAt?: string | null;
  embed?: AppEmbedInfo | null;
  primaryCtaUrl?: string;
  primaryCtaLabel?: string;
  formatDate: (value: string | null | undefined) => string;
  // Required when the header hosts widgets — same shape as the page-level
  // onAction callback used by AppRenderer so events from header widgets
  // flow through the same dispatcher.
  globalFilter?: string;
  runtimeParameters?: Record<string, string>;
  interactivePromptSeed?: string;
  primaryInteractiveAgentWidgetId?: string | null;
  onAction?: (event: WidgetEvent, payload?: Record<string, unknown>) => Promise<void>;
}

const DEFAULT_VERTICAL_WIDTH = 220;
const COLLAPSED_VERTICAL_WIDTH = 60;
const DEFAULT_IMAGE_HEIGHT = 36;

export function AppHeader({
  config,
  fallbackTitle,
  fallbackSubtitle,
  fallbackLogoUrl,
  appId,
  publishedVersionNumber = null,
  publishedAt = null,
  embed = null,
  primaryCtaUrl,
  primaryCtaLabel,
  formatDate,
  globalFilter = '',
  runtimeParameters = {},
  interactivePromptSeed = '',
  primaryInteractiveAgentWidgetId = null,
  onAction,
}: AppHeaderProps): ReactElement | null {
  if (config.enabled === false) return null;

  const orientation: AppHeaderOrientation = config.orientation === 'vertical' ? 'vertical' : 'horizontal';
  const isVertical = orientation === 'vertical';
  const collapsible = isVertical && config.collapsible === true;
  const favoritingEnabled = config.favoriting_enabled === true;

  const collapseKey = `of_app_header_collapsed_${appId}`;
  const favoriteKey = `of_app_favorite_${appId}`;

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (!collapsible) return false;
    if (typeof window === 'undefined') return Boolean(config.collapsed_by_default);
    const stored = window.localStorage.getItem(collapseKey);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return Boolean(config.collapsed_by_default);
  });

  const [favorite, setFavorite] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(favoriteKey) === 'true';
  });

  useEffect(() => {
    if (!collapsible || typeof window === 'undefined') return;
    window.localStorage.setItem(collapseKey, String(collapsed));
  }, [collapsed, collapsible, collapseKey]);

  useEffect(() => {
    if (!favoritingEnabled || typeof window === 'undefined') return;
    window.localStorage.setItem(favoriteKey, String(favorite));
  }, [favorite, favoritingEnabled, favoriteKey]);

  const title = config.title?.trim() || fallbackTitle;
  const subtitle = collapsed ? '' : fallbackSubtitle;
  const logoMode = resolveLogoMode(config, fallbackLogoUrl ?? null);
  const logoPosition: AppHeaderLogoPosition = config.logo_position
    ?? (isVertical ? 'top' : 'left');
  const imageUrl = collapsed && config.collapsed_image_url
    ? config.collapsed_image_url
    : config.image_url ?? fallbackLogoUrl ?? '';
  const imageHeight = config.image_height ?? DEFAULT_IMAGE_HEIGHT;

  const sizingStyle: CSSProperties = isVertical
    ? { width: collapsed ? COLLAPSED_VERTICAL_WIDTH : (config.width ?? DEFAULT_VERTICAL_WIDTH) }
    : (config.height ? { minHeight: config.height } : {});

  const headerStyle: CSSProperties = {
    ...sizingStyle,
    ...(config.background_color ? { background: config.background_color } : {}),
  };

  const titleStyle: CSSProperties | undefined = config.title_color
    ? { color: config.title_color }
    : undefined;
  const iconStyle: CSSProperties | undefined = config.icon_color
    ? { color: config.icon_color }
    : undefined;

  const orientationClass = isVertical ? 'of-app-runtime__header--vertical' : 'of-app-runtime__header--horizontal';
  const positionClass = `of-app-runtime__header--logo-${logoPosition}`;
  const collapsedClass = collapsed ? ' is-collapsed' : '';
  const className = `of-app-runtime__header ${orientationClass} ${positionClass}${collapsedClass}`;

  const logoNode = useMemo(() => {
    if (collapsed && isVertical) {
      // When collapsed in vertical mode, prefer collapsed_image_url over the
      // main brand asset for a square/icon-sized representation.
      if (config.collapsed_image_url) {
        return (
          <img
            src={config.collapsed_image_url}
            alt=""
            className="of-app-runtime__logo of-app-runtime__logo--collapsed"
            style={{ height: imageHeight, width: imageHeight }}
          />
        );
      }
      if (logoMode === 'icon' && config.icon) {
        return (
          <span
            className="of-app-runtime__logo-icon"
            style={iconStyle}
            aria-hidden="true"
            data-icon={config.icon}
          >
            {config.icon}
          </span>
        );
      }
    }
    if (logoMode === 'image' && imageUrl) {
      return (
        <img
          src={imageUrl}
          alt=""
          className="of-app-runtime__logo"
          style={{ height: imageHeight }}
        />
      );
    }
    if (logoMode === 'icon' && config.icon) {
      return (
        <span
          className="of-app-runtime__logo-icon"
          style={iconStyle}
          aria-hidden="true"
          data-icon={config.icon}
        >
          {config.icon}
        </span>
      );
    }
    return null;
  }, [collapsed, isVertical, logoMode, imageUrl, imageHeight, config.icon, config.collapsed_image_url, iconStyle]);

  const headerWidgets = config.widgets ?? [];
  const widgetsNode = headerWidgets.length > 0 && onAction ? (
    <div className="of-app-runtime__header-widgets" data-testid="app-header-widgets">
      {headerWidgets.map((widget) => (
        <div key={widget.id} className="of-app-runtime__header-widget" data-widget-id={widget.id}>
          <AppWidgetRenderer
            widget={widget}
            globalFilter={globalFilter}
            runtimeParameters={runtimeParameters}
            interactivePromptSeed={interactivePromptSeed}
            primaryInteractiveAgentWidgetId={primaryInteractiveAgentWidgetId}
            onAction={onAction}
          />
        </div>
      ))}
    </div>
  ) : null;

  const actions = (
    <div className="of-app-runtime__actions">
      {favoritingEnabled && (
        <button
          type="button"
          className={favorite ? 'of-button of-button--ghost is-active' : 'of-button of-button--ghost'}
          aria-pressed={favorite}
          aria-label={favorite ? 'Remove favorite' : 'Add favorite'}
          data-favorite={favorite ? 'true' : 'false'}
          data-testid="app-header-favorite"
          onClick={() => setFavorite((value) => !value)}
        >
          {favorite ? '★' : '☆'}
        </button>
      )}
      {publishedVersionNumber !== null && !collapsed && (
        <span className="of-chip">v{publishedVersionNumber}</span>
      )}
      {publishedAt && !collapsed && <span className="of-chip">{formatDate(publishedAt)}</span>}
      {embed?.url && !collapsed && (
        <a className="of-button" href={embed.url} target="_blank" rel="noreferrer">
          Embed URL
        </a>
      )}
      {primaryCtaUrl && primaryCtaLabel && !collapsed && (
        <a className="of-button of-button--primary" href={primaryCtaUrl}>
          {primaryCtaLabel}
        </a>
      )}
      {collapsible && (
        <button
          type="button"
          className="of-button of-button--ghost of-app-runtime__header-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand header' : 'Collapse header'}
          data-testid="app-header-collapse-toggle"
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? '›' : '‹'}
        </button>
      )}
    </div>
  );

  return (
    <AppHeaderCollapseContext.Provider value={collapsed}>
      <header
        className={className}
        style={headerStyle}
        data-orientation={orientation}
        data-collapsed={collapsed ? 'true' : 'false'}
      >
        <div className="of-app-runtime__brand">
          {logoNode}
          {!collapsed && (
            <div className="of-app-runtime__brand-text">
              <h2 style={titleStyle}>{title}</h2>
              {subtitle && <p>{subtitle}</p>}
            </div>
          )}
        </div>
        {widgetsNode}
        {actions}
      </header>
    </AppHeaderCollapseContext.Provider>
  );
}

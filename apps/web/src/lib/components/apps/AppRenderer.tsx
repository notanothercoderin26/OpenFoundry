import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import type { AppDefinition, AppEmbedInfo, AppPage, AppWidget, WidgetEvent } from '@/lib/api/apps';
import { AppWidgetRenderer } from '@/lib/components/apps/AppWidgetRenderer';

interface AppRendererProps {
  app: AppDefinition;
  mode?: 'builder' | 'published';
  chrome?: 'panel' | 'immersive';
  initialPageId?: string;
  initialRuntimeParameters?: Record<string, string>;
  publishedVersionNumber?: number | null;
  publishedAt?: string | null;
  embed?: AppEmbedInfo | null;
}

type RuntimeNotice = {
  tone: 'info' | 'success' | 'warning';
  message: string;
} | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringifyRuntimeValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function toRuntimeParameters(value: unknown) {
  if (!isRecord(value)) return {} as Record<string, string>;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== null && entry !== undefined)
      .map(([key, entry]) => [key, stringifyRuntimeValue(entry)]),
  );
}

function readString(config: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function interpolate(template: string, params: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => params[key] ?? '');
}

function normalizePagePath(path: string) {
  if (!path || path === '/') return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function matchesPage(page: AppPage, target: string) {
  if (!target) return false;
  const normalizedTarget = normalizePagePath(target);
  return page.id === target || page.name === target || normalizePagePath(page.path) === normalizedTarget;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function pageSort(left: AppWidget, right: AppWidget) {
  const leftY = left.position?.y ?? 0;
  const rightY = right.position?.y ?? 0;
  if (leftY !== rightY) return leftY - rightY;
  return (left.position?.x ?? 0) - (right.position?.x ?? 0);
}

export function AppRenderer({
  app,
  mode = 'published',
  chrome = 'panel',
  initialPageId = '',
  initialRuntimeParameters = {},
  publishedVersionNumber = null,
  publishedAt = null,
  embed = null,
}: AppRendererProps) {
  const pages = Array.isArray(app.pages) ? app.pages : [];
  const visiblePages = useMemo(() => pages.filter((page) => page.visible !== false), [pages]);
  const settings = (app.settings ?? {}) as Partial<AppDefinition['settings']>;
  const theme = (app.theme ?? {}) as Partial<AppDefinition['theme']>;
  const consumerMode = settings.consumer_mode;
  const interactiveWorkshop = settings.interactive_workshop;
  const navigationStyle = settings.navigation_style ?? 'tabs';
  const homePageId = settings.home_page_id ?? '';
  const initialParamsKey = useMemo(
    () => JSON.stringify(initialRuntimeParameters),
    [initialRuntimeParameters],
  );

  const defaultPage = useMemo(() => {
    return (
      visiblePages.find((page) => matchesPage(page, initialPageId)) ??
      visiblePages.find((page) => page.id === homePageId) ??
      visiblePages[0] ??
      null
    );
  }, [homePageId, initialPageId, visiblePages]);

  const [activePageId, setActivePageId] = useState(defaultPage?.id ?? '');
  const [notice, setNotice] = useState<RuntimeNotice>(null);
  const [globalFilter, setGlobalFilter] = useState('');
  const [runtimeParameters, setRuntimeParameters] = useState<Record<string, string>>(initialRuntimeParameters);
  const [interactivePromptSeed, setInteractivePromptSeed] = useState('');
  const [renderPass, setRenderPass] = useState(0);

  useEffect(() => {
    setActivePageId(defaultPage?.id ?? '');
    setNotice(null);
    setGlobalFilter('');
    setRuntimeParameters(initialRuntimeParameters);
    setInteractivePromptSeed('');
  }, [app.id, defaultPage?.id, initialParamsKey, initialRuntimeParameters]);

  const activePage = visiblePages.find((page) => page.id === activePageId) ?? defaultPage;

  const themeVars = useMemo(() => {
    const vars: Record<string, string> = {};
    if (theme.primary_color) vars['--app-primary'] = String(theme.primary_color);
    if (theme.accent_color) vars['--app-accent'] = String(theme.accent_color);
    if (theme.background_color) vars['--app-background'] = String(theme.background_color);
    if (theme.surface_color) vars['--app-surface'] = String(theme.surface_color);
    if (theme.text_color) vars['--app-text'] = String(theme.text_color);
    if (typeof theme.border_radius === 'number') vars['--app-radius'] = `${theme.border_radius}px`;
    if (theme.body_font) vars['--app-body-font'] = String(theme.body_font);
    if (theme.heading_font) vars['--app-heading-font'] = String(theme.heading_font);
    return vars;
  }, [theme]);

  const title = consumerMode?.enabled && consumerMode.portal_title ? consumerMode.portal_title : app.name;
  const subtitle = consumerMode?.enabled && consumerMode.portal_subtitle ? consumerMode.portal_subtitle : app.description;
  const primaryCtaUrl = consumerMode?.primary_cta_url ?? '';
  const primaryCtaLabel = consumerMode?.primary_cta_label ?? '';
  const primaryAgentWidgetId = interactiveWorkshop?.primary_agent_widget_id ?? null;
  const pageMaxWidth = activePage?.layout?.max_width ?? settings.max_width ?? '1280px';
  const showNavigation = visiblePages.length > 1 && navigationStyle !== 'none' && navigationStyle !== 'hidden';

  function setPage(page: AppPage, message?: string) {
    setActivePageId(page.id);
    if (message) setNotice({ tone: 'info', message });
    if (mode !== 'published' || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('page', page.path || page.id);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function applyRuntimeParameters(
    next: Record<string, string>,
    message = 'Parameters updated',
  ) {
    setRuntimeParameters(next);
    setNotice({ tone: 'success', message });
    const promptTemplate = interactiveWorkshop?.briefing_template;
    if (promptTemplate) setInteractivePromptSeed(interpolate(promptTemplate, next));
  }

  async function handleAction(event: WidgetEvent, payload?: Record<string, unknown>) {
    const config = event.config ?? {};
    const payloadParameters = toRuntimeParameters(payload);

    if (event.action === 'navigate') {
      const target = readString(config, ['page_id', 'page_path', 'path', 'url']);
      const nextPage = visiblePages.find((page) => matchesPage(page, target));
      if (nextPage) {
        setPage(nextPage, event.label ? `${event.label}: ${nextPage.name}` : `Opened ${nextPage.name}`);
        return;
      }
      if (mode === 'published' && target.startsWith('/')) window.location.assign(target);
      return;
    }

    if (event.action === 'open_link') {
      const url = readString(config, ['url', 'href']);
      if (!url) return;
      if (mode === 'builder') {
        setNotice({ tone: 'info', message: `Preview link: ${url}` });
        return;
      }
      if (url.startsWith('/')) window.location.assign(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (event.action === 'filter') {
      const value =
        payloadParameters.value ??
        payloadParameters.filter ??
        payloadParameters.query ??
        readString(config, ['value', 'filter', 'query']);
      setGlobalFilter(value ?? '');
      setNotice({ tone: 'info', message: value ? `Filter applied: ${value}` : 'Filter cleared' });
      return;
    }

    if (event.action === 'set_parameters') {
      const configParameters = toRuntimeParameters(config.parameters);
      const next = { ...runtimeParameters, ...configParameters, ...payloadParameters };
      applyRuntimeParameters(next, event.label ?? 'Parameters updated');
      return;
    }

    if (event.action === 'clear_parameters') {
      const next = Object.keys(payloadParameters).length > 0 ? payloadParameters : initialRuntimeParameters;
      applyRuntimeParameters(next, event.label ?? 'Parameters reset');
      return;
    }

    if (event.action === 'seed_agent_prompt') {
      const template = readString(config, ['prompt_template', 'prompt', 'message']);
      const nextPrompt = template ? interpolate(template, runtimeParameters) : stringifyRuntimeValue(payload?.prompt ?? '');
      setInteractivePromptSeed(nextPrompt);
      setNotice({ tone: 'info', message: event.label ?? 'Prompt applied' });
      return;
    }

    if (event.action === 'refresh') {
      setRenderPass((pass) => pass + 1);
      setNotice({ tone: 'info', message: event.label ?? 'Runtime refreshed' });
      return;
    }

    setNotice({ tone: 'warning', message: `${event.label ?? event.action} is not wired to a runtime handler yet.` });
  }

  const runtimeStyle = {
    ...(themeVars as CSSProperties),
    background: 'var(--app-background, #f8fafc)',
    color: 'var(--app-text, #0f172a)',
    fontFamily: 'var(--app-body-font, var(--font-sans))',
  } as CSSProperties;

  const isImmersive = chrome === 'immersive';

  return (
    <div className={isImmersive ? 'of-app-runtime of-app-runtime--immersive' : 'of-app-runtime'} style={runtimeStyle}>
      {settings.custom_css && <style>{settings.custom_css}</style>}

      {!isImmersive && (
        <header className="of-app-runtime__header">
          <div className="of-app-runtime__brand">
            {theme.logo_url && <img src={theme.logo_url} alt="" className="of-app-runtime__logo" />}
            <div>
              <h2>{title}</h2>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>

          <div className="of-app-runtime__actions">
            {publishedVersionNumber !== null && <span className="of-chip">v{publishedVersionNumber}</span>}
            {publishedAt && <span className="of-chip">{formatDate(publishedAt)}</span>}
            {embed?.url && (
              <a className="of-button" href={embed.url} target="_blank" rel="noreferrer">
                Embed URL
              </a>
            )}
            {primaryCtaUrl && primaryCtaLabel && (
              <a className="of-button of-button--primary" href={primaryCtaUrl}>
                {primaryCtaLabel}
              </a>
            )}
          </div>
        </header>
      )}

      {interactiveWorkshop?.enabled && (
        <section className="of-app-runtime__interactive">
          <div>
            <strong>{interactiveWorkshop.title ?? 'Interactive workshop'}</strong>
            {interactiveWorkshop.subtitle && <span>{interactiveWorkshop.subtitle}</span>}
          </div>
          {interactiveWorkshop.suggested_questions?.length > 0 && (
            <div className="of-app-runtime__suggestions">
              {interactiveWorkshop.suggested_questions.map((question) => (
                <button
                  key={question}
                  type="button"
                  className="of-button"
                  onClick={() => setInteractivePromptSeed(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          )}
          {interactiveWorkshop.scenario_presets?.length > 0 && (
            <div className="of-app-runtime__suggestions">
              {interactiveWorkshop.scenario_presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="of-button"
                  title={preset.description ?? undefined}
                  onClick={() => {
                    const nextParameters = { ...runtimeParameters, ...preset.parameters };
                    applyRuntimeParameters(
                      nextParameters,
                      `Scenario applied: ${preset.label}`,
                    );
                    if (preset.prompt_template) {
                      setInteractivePromptSeed(interpolate(preset.prompt_template, nextParameters));
                    }
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {showNavigation && (
        <nav
          className={
            navigationStyle === 'sidebar'
              ? 'of-app-runtime__nav of-app-runtime__nav--sidebar'
              : 'of-app-runtime__nav'
          }
          aria-label="App pages"
        >
          {visiblePages.map((page) => (
            <button
              key={page.id}
              type="button"
              className={page.id === activePage?.id ? 'of-app-runtime__nav-item is-active' : 'of-app-runtime__nav-item'}
              onClick={() => setPage(page)}
            >
              {page.name}
            </button>
          ))}
        </nav>
      )}

      {notice && (
        <div className={`of-app-runtime__notice of-status-${notice.tone}`}>
          {notice.message}
        </div>
      )}

      {globalFilter && (
        <div className="of-app-runtime__filter">
          <span>Filter: {globalFilter}</span>
          <button type="button" className="of-button of-button--ghost" onClick={() => setGlobalFilter('')}>
            Clear
          </button>
        </div>
      )}

      {activePage ? (
        <PageRenderer
          key={`${app.id}:${activePage.id}:${renderPass}`}
          page={activePage}
          maxWidth={pageMaxWidth}
          globalFilter={globalFilter}
          runtimeParameters={runtimeParameters}
          interactivePromptSeed={interactivePromptSeed}
          primaryInteractiveAgentWidgetId={primaryAgentWidgetId}
          onAction={handleAction}
        />
      ) : (
        <div className="of-app-runtime__empty">No visible pages.</div>
      )}
    </div>
  );
}

function PageRenderer({
  page,
  maxWidth,
  globalFilter,
  runtimeParameters,
  interactivePromptSeed,
  primaryInteractiveAgentWidgetId,
  onAction,
}: {
  page: AppPage;
  maxWidth: string;
  globalFilter: string;
  runtimeParameters: Record<string, string>;
  interactivePromptSeed: string;
  primaryInteractiveAgentWidgetId: string | null;
  onAction: (event: WidgetEvent, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const columns = Math.max(1, Math.min(24, Number(page.layout?.columns ?? 12) || 12));
  const widgets = (Array.isArray(page.widgets) ? [...page.widgets] : []).sort(pageSort);

  return (
    <main className="of-app-runtime__page" style={{ maxWidth }}>
      {page.description && <p className="of-app-runtime__page-description">{page.description}</p>}
      <div
        className="of-app-runtime__grid"
        style={
          {
            '--app-runtime-columns': columns,
            gap: page.layout?.gap ?? '1rem',
          } as CSSProperties
        }
      >
        {widgets.map((widget) => {
          const span = Math.max(1, Math.min(widget.position?.width ?? columns, columns));
          const rows = Math.max(1, widget.position?.height ?? 2);
          return (
            <div
              key={widget.id}
              className="of-app-runtime__widget"
              style={
                {
                  '--app-widget-span': span,
                  minHeight: Math.max(160, rows * 96),
                } as CSSProperties
              }
            >
              <AppWidgetRenderer
                widget={widget}
                globalFilter={globalFilter}
                runtimeParameters={runtimeParameters}
                interactivePromptSeed={interactivePromptSeed}
                primaryInteractiveAgentWidgetId={primaryInteractiveAgentWidgetId}
                onAction={onAction}
              />
            </div>
          );
        })}
        {widgets.length === 0 && <div className="of-app-runtime__empty">No widgets on this page.</div>}
      </div>
    </main>
  );
}

import { useContext, useEffect, useMemo, useState, type CSSProperties } from 'react';

import type { AppDefinition, AppEmbedInfo, AppPage, AppWidget, WidgetEvent } from '@/lib/api/apps';
import { AppHeader, readHeaderConfig } from '@/lib/components/apps/AppHeader';
import { AppOverlayRenderer } from '@/lib/components/apps/AppOverlayRenderer';
import { AppWidgetRenderer } from '@/lib/components/apps/AppWidgetRenderer';
import { SectionRenderer } from '@/lib/components/apps/SectionRenderer';
import { downloadWorkshopEventPayload, runWorkshopEvents, type WorkshopEventHandlers } from '@/lib/components/apps/widgets/workshopEvents';
import { WorkshopRuntimeContext } from '@/lib/components/apps/widgets/workshop-runtime-context';
import { scenarioPayloadToActionDefaults } from '@/lib/components/apps/widgets/workshopScenarios';

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
  const workshopRuntime = useContext(WorkshopRuntimeContext);

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

  const eventHandlers = useMemo<WorkshopEventHandlers>(() => ({
    setVariable: (variableId, value) => workshopRuntime.setPrimitiveValue(variableId, value),
    setRuntimeParameters: (next, event) => applyRuntimeParameters(next, event.label ?? 'Parameters updated'),
    navigate: (target, event) => {
      const nextPage = visiblePages.find((page) => matchesPage(page, target));
      if (nextPage) {
        setPage(nextPage, event.label ? `${event.label}: ${nextPage.name}` : `Opened ${nextPage.name}`);
        return;
      }
      if (mode === 'published' && target.startsWith('/')) window.location.assign(target);
    },
    openUrl: (url) => {
      if (mode === 'builder') {
        setNotice({ tone: 'info', message: `Preview link: ${url}` });
        return;
      }
      if (url.startsWith('/')) window.location.assign(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    },
    setFilter: (value) => {
      setGlobalFilter(value);
      setNotice({ tone: 'info', message: value ? `Filter applied: ${value}` : 'Filter cleared' });
    },
    seedPrompt: (prompt, event) => {
      setInteractivePromptSeed(prompt);
      setNotice({ tone: 'info', message: event.label ?? 'Prompt applied' });
    },
    refresh: (event) => {
      setRenderPass((pass) => pass + 1);
      setNotice({ tone: 'info', message: event.label ?? 'Runtime refreshed' });
    },
    applyAction: (actionTypeId, payload, event) => {
      workshopRuntime.onButtonClick({
        id: `event_${event.id}`,
        label: event.label ?? 'Apply action',
        on_click_kind: 'action',
        action_type_id: actionTypeId,
        parameter_defaults: scenarioPayloadToActionDefaults(payload),
        default_layout: 'form',
        switch_layout: false,
        conditional_visibility: false,
      });
    },
    exportData: (format, payload, event) => {
      downloadWorkshopEventPayload(format, payload, event.label ?? event.id);
      setNotice({ tone: 'success', message: `Exported ${format}` });
    },
    command: (command) => setNotice({ tone: 'info', message: `Command: ${command}` }),
    notice: (message, tone) => setNotice({ tone, message }),
  }), [mode, runtimeParameters, visiblePages, workshopRuntime]);

  useEffect(() => workshopRuntime.setEventHandlers(eventHandlers), [eventHandlers, workshopRuntime]);

  async function handleAction(event: WidgetEvent, payload?: Record<string, unknown>) {
    await runWorkshopEvents({
      events: [event],
      trigger: event.trigger,
      payload,
      state: { runtimeParameters, initialRuntimeParameters },
      handlers: eventHandlers,
    });
  }

  const runtimeStyle = {
    ...(themeVars as CSSProperties),
    background: 'var(--app-background, #f8fafc)',
    color: 'var(--app-text, #0f172a)',
    fontFamily: 'var(--app-body-font, var(--font-sans))',
  } as CSSProperties;

  const isImmersive = chrome === 'immersive';
  const headerConfig = useMemo(() => readHeaderConfig(settings.workshop_header), [settings.workshop_header]);
  const headerOrientation = headerConfig.enabled === false || isImmersive
    ? 'horizontal'
    : (headerConfig.orientation === 'vertical' ? 'vertical' : 'horizontal');
  const isVerticalHeader = headerOrientation === 'vertical';

  const rootClass = (() => {
    const classes = ['of-app-runtime'];
    if (isImmersive) classes.push('of-app-runtime--immersive');
    if (!isImmersive) classes.push(`of-app-runtime--header-${headerOrientation}`);
    return classes.join(' ');
  })();

  const headerElement = !isImmersive ? (
    <AppHeader
      config={headerConfig}
      fallbackTitle={title}
      fallbackSubtitle={subtitle}
      fallbackLogoUrl={theme.logo_url ?? null}
      appId={app.id}
      publishedVersionNumber={publishedVersionNumber}
      publishedAt={publishedAt}
      embed={embed}
      primaryCtaUrl={primaryCtaUrl}
      primaryCtaLabel={primaryCtaLabel}
      formatDate={formatDate}
      globalFilter={globalFilter}
      runtimeParameters={runtimeParameters}
      interactivePromptSeed={interactivePromptSeed}
      primaryInteractiveAgentWidgetId={primaryAgentWidgetId}
      onAction={handleAction}
    />
  ) : null;

  const bodyChildren = (
    <>
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

      {activePage?.overlays?.map((overlay) => (
        <AppOverlayRenderer
          key={overlay.id}
          overlay={overlay}
          globalFilter={globalFilter}
          runtimeParameters={runtimeParameters}
          interactivePromptSeed={interactivePromptSeed}
          primaryInteractiveAgentWidgetId={primaryAgentWidgetId}
          onAction={handleAction}
        />
      ))}
    </>
  );

  return (
    <div className={rootClass} style={runtimeStyle}>
      {settings.custom_css && <style>{settings.custom_css}</style>}
      {headerElement}
      {isVerticalHeader ? (
        <div className="of-app-runtime__main">{bodyChildren}</div>
      ) : (
        bodyChildren
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
  const sections = Array.isArray(page.sections) ? page.sections : [];
  const rendererContext = {
    globalFilter,
    runtimeParameters,
    interactivePromptSeed,
    primaryInteractiveAgentWidgetId,
    onAction,
  };

  const hasContent = widgets.length > 0 || sections.length > 0;

  return (
    <main className="of-app-runtime__page" style={{ maxWidth }}>
      {page.description && <p className="of-app-runtime__page-description">{page.description}</p>}
      {widgets.length > 0 && (
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
        </div>
      )}
      {sections.length > 0 && (
        <div className="of-app-runtime__sections">
          {sections.map((section) => (
            <SectionRenderer key={section.id} section={section} {...rendererContext} />
          ))}
        </div>
      )}
      {!hasContent && <div className="of-app-runtime__empty">No widgets on this page.</div>}
    </main>
  );
}

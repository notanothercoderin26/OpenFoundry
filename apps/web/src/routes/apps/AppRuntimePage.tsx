import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { ApiError } from '@/lib/api/client';
import { getPublishedApp, type AppDefinition, type AppEmbedInfo } from '@/lib/api/apps';
import { AppRenderer } from '@/lib/components/apps/AppRenderer';
import { WorkshopRuntimeProvider } from '@/lib/components/apps/widgets';
import { ErrorBanner } from '@/lib/components/ErrorBanner';
import { LoadingState } from '@/lib/components/LoadingState';

type RuntimeStatus = 'loading' | 'ready' | 'not_found' | 'error';

interface RuntimeMeta {
  versionNumber: number | null;
  publishedAt: string | null;
  embed: AppEmbedInfo | null;
}

function initials(value: string) {
  const cleaned = value.trim();
  if (!cleaned) return 'AP';
  const parts = cleaned.split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || cleaned.slice(0, 2).toUpperCase();
}

function formatPublishedAt(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

export function AppRuntimePage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const [app, setApp] = useState<AppDefinition | null>(null);
  const [meta, setMeta] = useState<RuntimeMeta>({
    versionNumber: null,
    publishedAt: null,
    embed: null,
  });
  const [status, setStatus] = useState<RuntimeStatus>('loading');
  const [error, setError] = useState('');

  const initialPageId = searchParams.get('page') ?? '';
  const runtimeParameters = useMemo(() => {
    const next: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      if (key !== 'page') next[key] = value;
    });
    return next;
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadRuntime() {
      if (!slug) {
        setStatus('not_found');
        setError('Missing app slug.');
        return;
      }

      setStatus('loading');
      setError('');
      setApp(null);

      try {
        const response = await getPublishedApp(slug);
        if (cancelled) return;
        setApp(response.app);
        setMeta({
          versionNumber: response.published_version_number,
          publishedAt: response.published_at,
          embed: response.embed,
        });
        setStatus('ready');
      } catch (cause) {
        if (cancelled) return;
        const message = cause instanceof Error ? cause.message : 'Failed to load published app';
        setError(message);
        setStatus(cause instanceof ApiError && cause.status === 404 ? 'not_found' : 'error');
      }
    }

    void loadRuntime();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    document.body.classList.add('of-app-runtime-body');
    return () => {
      document.body.classList.remove('of-app-runtime-body');
    };
  }, []);

  const consumerMode = app?.settings?.consumer_mode;
  const theme = app?.theme ?? null;
  const isConsumer = Boolean(consumerMode?.enabled);
  const headerTitle = isConsumer && consumerMode?.portal_title ? consumerMode.portal_title : app?.name ?? slug;
  const headerSubtitle = isConsumer && consumerMode?.portal_subtitle ? consumerMode.portal_subtitle : app?.description ?? '';
  const versionLabel = meta.versionNumber !== null ? `v${meta.versionNumber}` : null;
  const publishedLabel = formatPublishedAt(meta.publishedAt);
  const primaryCtaLabel = consumerMode?.primary_cta_label ?? '';
  const primaryCtaUrl = consumerMode?.primary_cta_url ?? '';

  return (
    <div className="app-runtime">
      <header className="app-runtime__bar" data-status={status}>
        <div className="app-runtime__bar-left">
          <Link
            to="/apps"
            className="app-runtime__close"
            aria-label="Close runtime and return to Workshop"
            title="Back to Workshop"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M3 3l8 8M11 3l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </Link>

          <div className="app-runtime__brand">
            {theme?.logo_url ? (
              <img src={theme.logo_url} alt="" className="app-runtime__logo" />
            ) : (
              <span
                className="app-runtime__logo app-runtime__logo--initials"
                style={{
                  background: theme?.primary_color || '#2d72d2',
                  color: '#fff',
                }}
                aria-hidden="true"
              >
                {initials(headerTitle)}
              </span>
            )}
            <div className="app-runtime__title-block">
              <div className="app-runtime__title-row">
                <span className="app-runtime__title">{headerTitle}</span>
                {versionLabel && <span className="app-runtime__chip">{versionLabel}</span>}
              </div>
              {headerSubtitle && <span className="app-runtime__subtitle">{headerSubtitle}</span>}
            </div>
          </div>
        </div>

        <div className="app-runtime__bar-right">
          {publishedLabel && (
            <span className="app-runtime__meta" title="Published">
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path
                  d="M6 1.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zm0 1.5v3l2 1.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {publishedLabel}
            </span>
          )}
          {meta.embed?.url && (
            <a
              className="app-runtime__icon-button"
              href={meta.embed.url}
              target="_blank"
              rel="noreferrer"
              title="Open embed URL"
              aria-label="Open embed URL"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path
                  d="M6 8L8 6M8 6v3.5M8 6h-3.5M3 11h8M3 3h5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          )}
          {primaryCtaUrl && primaryCtaLabel && (
            <a className="app-runtime__cta" href={primaryCtaUrl}>
              {primaryCtaLabel}
            </a>
          )}
          {!isConsumer && (
            <Link to="/apps" className="app-runtime__workshop-link">
              Workshop
            </Link>
          )}
        </div>
      </header>

      <main className="app-runtime__main" role="main">
        {status === 'loading' && (
          <div className="app-runtime__state">
            <LoadingState label="Loading published app..." />
          </div>
        )}

        {status === 'error' && (
          <div className="app-runtime__state">
            <ErrorBanner error={error} />
          </div>
        )}

        {status === 'not_found' && (
          <div className="app-runtime__state">
            <div className="app-runtime__not-found">
              <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
                <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.4" />
                <path
                  d="M16 18l16 12M32 18L16 30"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.6"
                />
              </svg>
              <h2>Runtime not available</h2>
              <p>
                No published version exists for <code>{slug}</code>. Publish the app from Workshop to make it available
                here.
              </p>
              <Link to="/apps" className="of-button of-button--primary">
                Open Workshop
              </Link>
            </div>
          </div>
        )}

        {status === 'ready' && app && (
          <WorkshopRuntimeProvider app={app} urlParams={runtimeParameters}>
            <AppRenderer
              app={app}
              mode="published"
              initialPageId={initialPageId}
              initialRuntimeParameters={runtimeParameters}
              publishedVersionNumber={meta.versionNumber}
              publishedAt={meta.publishedAt}
              embed={meta.embed}
              chrome="immersive"
            />
          </WorkshopRuntimeProvider>
        )}
      </main>
    </div>
  );
}

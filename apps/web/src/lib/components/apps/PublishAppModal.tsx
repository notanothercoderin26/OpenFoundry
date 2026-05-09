import { useEffect, useMemo, useState, type FormEvent } from 'react';

import type { AppVersion } from '@/lib/api/apps';
import { Glyph } from '@/lib/components/ui/Glyph';

export interface PublishAppDraft {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  pagesJson: string;
  settingsJson: string;
  themeJson: string;
}

interface PublishAppModalProps {
  app: PublishAppDraft | null;
  open: boolean;
  latestVersion: AppVersion | null;
  publishing: boolean;
  error?: string;
  onClose: () => void;
  onPublish: (notes: string) => Promise<void> | void;
}

interface AppPageLike {
  visible?: boolean;
  widgets?: AppWidgetLike[];
}

interface AppWidgetLike {
  children?: AppWidgetLike[];
}

interface AppSettingsLike {
  consumer_mode?: {
    enabled?: boolean;
    allow_guest_access?: boolean;
  };
  object_set_variables?: unknown[];
  slate?: {
    enabled?: boolean;
  };
}

function countWidgets(widgets: AppWidgetLike[] | undefined): number {
  return (widgets ?? []).reduce((total, widget) => total + 1 + countWidgets(widget.children), 0);
}

function parseJson<T>(value: string, label: string) {
  try {
    return { data: JSON.parse(value) as T, error: null };
  } catch {
    return { data: null, error: `${label} JSON is invalid.` };
  }
}

function formatPublishedAt(value: string | null | undefined) {
  if (!value) return 'none';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export function PublishAppModal({
  app,
  open,
  latestVersion,
  publishing,
  error = '',
  onClose,
  onPublish,
}: PublishAppModalProps) {
  const [notes, setNotes] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) return;
    setNotes('');
    setAcknowledged(false);
    setLocalError('');
  }, [open, app?.id]);

  useEffect(() => {
    if (!open) return;
    function onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !publishing) {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [open, onClose, publishing]);

  const draftSummary = useMemo(() => {
    if (!app) {
      return {
        pages: [] as AppPageLike[],
        settings: null as AppSettingsLike | null,
        errors: ['Select an app before publishing.'],
      };
    }
    const pages = parseJson<AppPageLike[]>(app.pagesJson, 'Pages');
    const settings = parseJson<AppSettingsLike>(app.settingsJson, 'Settings');
    const theme = parseJson<unknown>(app.themeJson, 'Theme');
    return {
      pages: Array.isArray(pages.data) ? pages.data : [],
      settings: settings.data,
      errors: [pages.error, settings.error, theme.error].filter((entry): entry is string => Boolean(entry)),
    };
  }, [app]);

  if (!open || !app) return null;

  const nextVersion = (latestVersion?.version_number ?? 0) + 1;
  const pageCount = draftSummary.pages.length;
  const visiblePageCount = draftSummary.pages.filter((page) => page.visible !== false).length;
  const widgetCount = draftSummary.pages.reduce((total, page) => total + countWidgets(page.widgets), 0);
  const guestAccess = draftSummary.settings?.consumer_mode?.allow_guest_access === true;
  const consumerMode = draftSummary.settings?.consumer_mode?.enabled === true;
  const objectVariables = draftSummary.settings?.object_set_variables?.length ?? 0;
  const slateEnabled = draftSummary.settings?.slate?.enabled === true;
  const blocked = publishing || !acknowledged || draftSummary.errors.length > 0;

  const versionSummary = [
    { label: 'Next version', value: `v${nextVersion}` },
    { label: 'Previous publish', value: formatPublishedAt(latestVersion?.published_at) },
    { label: 'Pages', value: `${pageCount} total, ${visiblePageCount} visible` },
    { label: 'Widgets', value: String(widgetCount) },
  ];

  const permissionSummary = [
    { label: 'Publish permission', value: 'apps.publish' },
    { label: 'Runtime read', value: 'apps.public.read' },
    { label: 'Consumer mode', value: consumerMode ? 'enabled' : 'off' },
    { label: 'Guest access', value: guestAccess ? 'enabled' : 'off' },
    { label: 'Object variables', value: String(objectVariables) },
    { label: 'Slate package', value: slateEnabled ? 'enabled' : 'off' },
  ];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError('');
    if (draftSummary.errors.length > 0) {
      setLocalError(draftSummary.errors[0] ?? 'Resolve validation issues before publishing.');
      return;
    }
    if (!acknowledged) {
      setLocalError('Review the permission summary before publishing.');
      return;
    }
    await onPublish(notes.trim());
  }

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !publishing) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(31, 37, 45, 0.46)',
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-app-title"
        className="of-panel"
        onSubmit={(event) => void submit(event)}
        style={{ width: 'min(680px, 100%)', overflow: 'hidden', background: 'var(--bg-panel)' }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <div>
            <p className="of-eyebrow" style={{ margin: 0 }}>APP-003</p>
            <h2 id="publish-app-title" className="of-heading-sm" style={{ margin: 0 }}>
              Publish {app.name}
            </h2>
            <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 12 }}>
              /{app.slug || 'draft-slug'} - {app.status}
            </p>
          </div>
          <button type="button" className="of-button of-button--ghost" onClick={onClose} disabled={publishing} aria-label="Close">
            <Glyph name="x" size={15} />
          </button>
        </header>

        <div style={{ display: 'grid', gap: 14, padding: 16 }}>
          <section className="of-panel-muted" style={{ display: 'grid', gap: 8, padding: 12 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>Version summary</p>
            <div style={{ display: 'grid', gap: 7 }}>
              {versionSummary.map((entry) => (
                <div key={entry.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                  <span className="of-text-muted">{entry.label}</span>
                  <code style={{ color: 'var(--text-strong)', textAlign: 'right' }}>{entry.value}</code>
                </div>
              ))}
            </div>
          </section>

          <section className="of-panel-muted" style={{ display: 'grid', gap: 8, padding: 12 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>Permission summary</p>
            <div style={{ display: 'grid', gap: 7 }}>
              {permissionSummary.map((entry) => (
                <div key={entry.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                  <span className="of-text-muted">{entry.label}</span>
                  <code style={{ color: 'var(--text-strong)', textAlign: 'right' }}>{entry.value}</code>
                </div>
              ))}
            </div>
          </section>

          <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
            Version notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={5}
              className="of-input"
              placeholder="What changed in this app version?"
              style={{ resize: 'vertical' }}
              disabled={publishing}
            />
          </label>

          {draftSummary.errors.length > 0 || error || localError ? (
            <div className="of-status-danger" style={{ padding: '9px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
              {localError || error || draftSummary.errors.join(' ')}
            </div>
          ) : null}

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--text-default)' }}>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => {
                setAcknowledged(event.target.checked);
                setLocalError('');
              }}
              disabled={publishing}
              style={{ marginTop: 2 }}
            />
            <span>
              I checked that bindings, navigation actions, and public runtime permissions are ready for this release.
            </span>
          </label>
        </div>

        <footer
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '12px 16px',
            borderTop: '1px solid var(--border-default)',
            background: 'var(--bg-panel-muted)',
          }}
        >
          <button type="button" className="of-button of-button--ghost" onClick={onClose} disabled={publishing}>
            Cancel
          </button>
          <button type="submit" className="of-button of-button--primary" disabled={blocked}>
            {publishing ? 'Publishing...' : `Publish v${nextVersion}`}
          </button>
        </footer>
      </form>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';

import type { QueryResult } from '@/lib/api/queries';
import {
  cloneDashboard,
  createWidget,
  type DashboardWidget,
  type DashboardWidgetType,
} from '@/lib/utils/dashboards';

import { ChartSettings } from './ChartSettings';
import { QueryPicker } from './QueryPicker';

type WidgetConfigTab = 'basics' | 'query' | 'settings';

interface WidgetConfigProps {
  open: boolean;
  initialWidget: DashboardWidget | null;
  onSave?: (widget: DashboardWidget) => void | Promise<void>;
  onClose?: () => void;
}

const TABS: Array<{ id: WidgetConfigTab; label: string }> = [
  { id: 'basics', label: 'Basics' },
  { id: 'query', label: 'Query' },
  { id: 'settings', label: 'Settings' },
];

function parseSeriesColumns(value: string) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function finalizeWidget(widget: DashboardWidget, seriesColumnsInput: string) {
  const final = cloneDashboard(widget);
  if (final.type === 'chart') {
    final.seriesColumns = parseSeriesColumns(seriesColumnsInput);
  }
  return final;
}

function validateWidget(widget: DashboardWidget, seriesColumnsInput: string) {
  if (!widget.title.trim()) return 'Title is required.';
  if (!widget.query.sql.trim()) return 'SQL query is required.';
  if (!Number.isFinite(widget.query.limit) || widget.query.limit < 1) return 'Query limit must be at least 1.';
  if (widget.layout.colSpan < 1 || widget.layout.colSpan > 12) return 'Columns must be between 1 and 12.';
  if (widget.layout.rowSpan < 1 || widget.layout.rowSpan > 4) return 'Rows must be between 1 and 4.';

  if (widget.type === 'chart') {
    if (!widget.categoryColumn.trim()) return 'Category column is required.';
    if (parseSeriesColumns(seriesColumnsInput).length === 0) return 'At least one series column is required.';
  }

  if (widget.type === 'kpi' && !widget.valueColumn.trim()) return 'Value column is required.';

  return '';
}

export function WidgetConfig({ open, initialWidget, onSave, onClose }: WidgetConfigProps) {
  const [draft, setDraft] = useState<DashboardWidget | null>(null);
  const [activeTab, setActiveTab] = useState<WidgetConfigTab>('basics');
  const [seriesColumnsInput, setSeriesColumnsInput] = useState('');
  const [previewResult, setPreviewResult] = useState<QueryResult | null>(null);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = initialWidget ? cloneDashboard(initialWidget) : null;
    setDraft(next);
    setSeriesColumnsInput(next && next.type === 'chart' ? next.seriesColumns.join(', ') : '');
    setPreviewResult(null);
    setSaveError('');
    setSaving(false);
    setActiveTab('basics');
  }, [initialWidget]);

  useEffect(() => {
    if (!open) return;

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose?.();
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [open, onClose]);

  const validationMessage = useMemo(() => {
    return draft ? validateWidget(draft, seriesColumnsInput) : '';
  }, [draft, seriesColumnsInput]);

  const dirty = useMemo(() => {
    if (!draft || !initialWidget) return false;
    return JSON.stringify(finalizeWidget(draft, seriesColumnsInput)) !== JSON.stringify(initialWidget);
  }, [draft, initialWidget, seriesColumnsInput]);

  const previewColumns = useMemo(() => {
    return previewResult?.columns.map((column) => column.name) ?? [];
  }, [previewResult]);

  if (!open || !draft) return null;

  function patchDraft(patch: Partial<DashboardWidget>) {
    setDraft((current) => (current ? ({ ...current, ...patch } as DashboardWidget) : current));
    setSaveError('');
  }

  function patchLayout(patch: Partial<DashboardWidget['layout']>) {
    setDraft((current) =>
      current ? ({ ...current, layout: { ...current.layout, ...patch } } as DashboardWidget) : current,
    );
    setSaveError('');
  }

  function patchQuery(patch: Partial<DashboardWidget['query']>) {
    setDraft((current) =>
      current ? ({ ...current, query: { ...current.query, ...patch } } as DashboardWidget) : current,
    );
    setSaveError('');
  }

  function switchType(type: DashboardWidgetType) {
    if (!draft || draft.type === type) return;
    const template = createWidget(type);
    const nextDraft = {
      ...template,
      id: draft.id,
      title: draft.title,
      description: draft.description,
      query: draft.query,
      layout: draft.layout,
    } as DashboardWidget;
    setDraft(nextDraft);
    setSeriesColumnsInput(nextDraft.type === 'chart' ? nextDraft.seriesColumns.join(', ') : '');
    setPreviewResult(null);
    setSaveError('');
    setActiveTab('settings');
  }

  async function save() {
    if (!draft) return;
    const message = validateWidget(draft, seriesColumnsInput);
    if (message) {
      setSaveError(message);
      return;
    }

    setSaving(true);
    setSaveError('');

    try {
      await onSave?.(finalizeWidget(draft, seriesColumnsInput));
      onClose?.();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Unable to save widget.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="widget-config-drawer" role="dialog" aria-modal="true" aria-labelledby="widget-config-title">
      <button
        type="button"
        className="widget-config-drawer__backdrop"
        aria-label="Close widget configuration"
        onClick={() => onClose?.()}
      />

      <aside className="widget-config-drawer__panel of-panel">
        <header className="widget-config-drawer__header">
          <div>
            <p className="of-eyebrow">Widget inspector</p>
            <h2 id="widget-config-title">{draft.title || 'Untitled widget'}</h2>
            <div className="widget-config-drawer__meta">
              <span className="of-chip">{draft.type}</span>
              {dirty && <span className="of-chip of-chip-active">Dirty</span>}
            </div>
          </div>

          <button type="button" className="widget-config-drawer__close" aria-label="Close" onClick={() => onClose?.()}>
            x
          </button>
        </header>

        <nav className="widget-config-drawer__tabs" role="tablist" aria-label="Widget configuration sections">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? 'widget-config-tab widget-config-tab--active' : 'widget-config-tab'}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="widget-config-drawer__body of-scrollbar">
          {activeTab === 'basics' && (
            <div className="widget-config-section">
              <div className="widget-config-section__header">
                <div>
                  <h3>Basics</h3>
                  <span>dashboard.edit_mode</span>
                </div>
              </div>

              <label className="widget-config-field">
                <span>Title</span>
                <input
                  type="text"
                  className="of-input"
                  value={draft.title}
                  onChange={(event) => patchDraft({ title: event.target.value })}
                />
              </label>

              <label className="widget-config-field">
                <span>Description</span>
                <textarea
                  className="of-textarea"
                  rows={4}
                  value={draft.description}
                  onChange={(event) => patchDraft({ description: event.target.value })}
                />
              </label>

              <div className="widget-config-field">
                <span>Widget type</span>
                <div className="of-pill-toggle widget-config-type-toggle" role="group" aria-label="Widget type">
                  {(['chart', 'table', 'kpi'] satisfies DashboardWidgetType[]).map((type) => (
                    <button key={type} type="button" data-active={draft.type === type} onClick={() => switchType(type)}>
                      {type.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'query' && (
            <QueryPicker value={draft.query} widgetType={draft.type} onChange={patchQuery} onPreview={setPreviewResult} />
          )}

          {activeTab === 'settings' && (
            <ChartSettings
              draft={draft}
              columnOptions={previewColumns}
              seriesColumnsInput={seriesColumnsInput}
              onPatchDraft={patchDraft}
              onPatchLayout={patchLayout}
              onSeriesColumnsInputChange={(value) => {
                setSeriesColumnsInput(value);
                setSaveError('');
              }}
            />
          )}
        </div>

        <footer className="widget-config-drawer__footer">
          {(saveError || validationMessage) && (
            <div className={saveError ? 'widget-config-save-state widget-config-save-state--error' : 'widget-config-save-state'}>
              {saveError || validationMessage}
            </div>
          )}
          <div className="widget-config-drawer__actions">
            <button type="button" className="of-btn" onClick={() => onClose?.()} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="of-btn of-btn-primary"
              onClick={() => void save()}
              disabled={saving || Boolean(validationMessage)}
            >
              {saving ? 'Saving...' : 'Save widget'}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

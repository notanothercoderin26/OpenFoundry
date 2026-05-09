import { useState } from 'react';

export interface WidgetEmbedRecord extends Record<string, unknown> {
  id?: string;
  kind?: string;
  title?: string;
  summary?: string;
  source_ref?: string | null;
}

interface WidgetDraft {
  kind: string;
  title: string;
  summary: string;
  source_ref: string;
}

interface WidgetKindOption {
  value: string;
  label: string;
  hint: string;
  defaultSummary: string;
}

interface WidgetEmbedsProps {
  widgets: WidgetEmbedRecord[];
  onChange: (widgets: WidgetEmbedRecord[]) => void;
  onInsertReference?: (widget: WidgetEmbedRecord) => void;
}

const WIDGET_KINDS: WidgetKindOption[] = [
  {
    value: 'contour',
    label: 'Contour',
    hint: 'Board or analysis snapshot',
    defaultSummary: 'Contour analysis attached to the document narrative.',
  },
  {
    value: 'quiver',
    label: 'Quiver',
    hint: 'Object lens or time-series view',
    defaultSummary: 'Quiver object analytics attached to the document narrative.',
  },
  {
    value: 'report',
    label: 'Report',
    hint: 'Report execution or evidence pack',
    defaultSummary: 'Report output attached to the document narrative.',
  },
  {
    value: 'fusion',
    label: 'Fusion',
    hint: 'Spreadsheet or reconciliation view',
    defaultSummary: 'Fusion workspace context attached to the document narrative.',
  },
];

function emptyDraft(): WidgetDraft {
  return { kind: WIDGET_KINDS[0].value, title: '', summary: '', source_ref: '' };
}

function newWidgetId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function widgetText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function widgetKind(value: unknown) {
  const kind = widgetText(value, 'widget');
  return WIDGET_KINDS.find((option) => option.value === kind) ?? {
    value: kind,
    label: kind,
    hint: 'Workspace context',
    defaultSummary: 'Live workspace context attached to the document narrative.',
  };
}

function sourceReference(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function isLinkReference(value: string) {
  return value.startsWith('/') || value.startsWith('http://') || value.startsWith('https://');
}

export function WidgetEmbeds({ widgets, onChange, onInsertReference }: WidgetEmbedsProps) {
  const [draft, setDraft] = useState<WidgetDraft>(emptyDraft());
  const selectedKind = widgetKind(draft.kind);

  function updateDraft(field: keyof WidgetDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function addWidget() {
    const title = draft.title.trim();
    if (!title) return;

    const next: WidgetEmbedRecord = {
      id: newWidgetId(),
      kind: draft.kind,
      title,
      summary: draft.summary.trim() || selectedKind.defaultSummary,
      source_ref: draft.source_ref.trim() || null,
    };
    onChange([...widgets, next]);
    setDraft(emptyDraft());
  }

  function removeWidget(index: number) {
    onChange(widgets.filter((_, currentIndex) => currentIndex !== index));
  }

  return (
    <section className="of-panel" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p className="of-eyebrow">Embeds</p>
          <h2 className="of-heading-md" style={{ marginTop: 4 }}>
            Attach live workspace context
          </h2>
        </div>
        <span className="of-chip" style={{ fontSize: 11 }}>
          {widgets.length} attached
        </span>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', marginTop: 16 }}>
        <Field label="Kind">
          <select
            className="of-select"
            value={draft.kind}
            onChange={(event) => updateDraft('kind', event.target.value)}
          >
            {WIDGET_KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="of-text-muted" style={{ marginTop: 6, fontSize: 11 }}>
            {selectedKind.hint}
          </div>
        </Field>
        <Field label="Title">
          <input
            className="of-input"
            value={draft.title}
            onChange={(event) => updateDraft('title', event.target.value)}
            placeholder="Executive trend board"
          />
        </Field>
        <Field label="Summary" fullWidth>
          <input
            className="of-input"
            value={draft.summary}
            onChange={(event) => updateDraft('summary', event.target.value)}
            placeholder={selectedKind.defaultSummary}
          />
        </Field>
        <Field label="Source reference" fullWidth>
          <input
            className="of-input"
            value={draft.source_ref}
            onChange={(event) => updateDraft('source_ref', event.target.value)}
            placeholder="/quiver?embedded=1 or report execution id"
          />
        </Field>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" className="of-btn" onClick={addWidget} disabled={!draft.title.trim()}>
          Add embed
        </button>
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        {widgets.length === 0 ? (
          <div
            style={{
              border: '1px dashed var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              fontSize: 13,
              color: 'var(--text-muted)',
            }}
          >
            No embedded widgets yet.
          </div>
        ) : (
          widgets.map((widget, index) => {
            const kind = widgetKind(widget.kind);
            const title = widgetText(widget.title, 'Untitled widget');
            const summary = widgetText(widget.summary, kind.defaultSummary);
            const sourceRef = sourceReference(widget.source_ref);

            return (
              <div
                key={widgetText(widget.id, `${kind.value}-${index}`)}
                style={{
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: 14,
                  background: 'var(--bg-panel-muted)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <p className="of-eyebrow" style={{ color: '#0e7490' }}>
                      {kind.label}
                    </p>
                    <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
                      {title}
                    </div>
                    <p className="of-text-muted" style={{ marginTop: 4, fontSize: 13, overflowWrap: 'anywhere' }}>
                      {summary}
                    </p>
                    {sourceRef && (
                      <div
                        className="of-text-muted"
                        style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 11, overflowWrap: 'anywhere' }}
                      >
                        {isLinkReference(sourceRef) ? (
                          <a className="of-link" href={sourceRef}>
                            {sourceRef}
                          </a>
                        ) : (
                          sourceRef
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
                    {onInsertReference && (
                      <button
                        type="button"
                        className="of-btn"
                        onClick={() => onInsertReference(widget)}
                        style={{ minHeight: 30, fontSize: 12 }}
                      >
                        Insert ref
                      </button>
                    )}
                    <button
                      type="button"
                      className="of-btn of-btn-danger"
                      onClick={() => removeWidget(index)}
                      style={{ minHeight: 30, fontSize: 12 }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}

function Field({ label, children, fullWidth }: FieldProps) {
  return (
    <label style={{ display: 'block', fontSize: 13, gridColumn: fullWidth ? '1 / -1' : undefined }}>
      <div className="of-eyebrow" style={{ marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </label>
  );
}

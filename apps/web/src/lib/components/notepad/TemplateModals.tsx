// Slice G — Templates v2 modals. Two shared dialogs:
//
//   * SaveAsTemplateModal — used from NotepadDetailPage to snapshot
//     the current document into a reusable template. Lets the owner
//     define the inputs schema inline (add/remove rows of
//     key/label/type/required/default/options).
//
//   * NewFromTemplateModal — used from NotepadListPage to instantiate
//     a template into a fresh document. Renders a form driven by the
//     selected template's `inputs_schema` so users see the parameters
//     they're filling in, not just `{{input.X}}` tokens.
//
// Both modals are presentational; the parent owns API calls + navigation.

import { useEffect, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import type {
  NotepadTemplateInput,
  NotepadTemplateInputType,
} from '@/lib/api/notepad';

// ── Save as template ─────────────────────────────────────────────────

export interface SaveAsTemplateModalProps {
  defaultName: string;
  defaultDescription?: string;
  defaultTitle: string;
  onCancel: () => void;
  onSave: (body: {
    name: string;
    description?: string;
    title: string;
    inputs_schema: NotepadTemplateInput[];
  }) => Promise<void>;
}

interface InputRowDraft extends NotepadTemplateInput {
  optionsCsv?: string;
}

function emptyInput(): InputRowDraft {
  return { key: '', label: '', type: 'string', required: false };
}

export function SaveAsTemplateModal({
  defaultName,
  defaultDescription,
  defaultTitle,
  onCancel,
  onSave,
}: SaveAsTemplateModalProps) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState(defaultDescription ?? '');
  const [title, setTitle] = useState(defaultTitle);
  const [inputs, setInputs] = useState<InputRowDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateRow(index: number, patch: Partial<InputRowDraft>) {
    setInputs((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setInputs((rows) => [...rows, emptyInput()]);
  }

  function removeRow(index: number) {
    setInputs((rows) => rows.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setError('');
    if (!name.trim()) {
      setError('Template name is required.');
      return;
    }
    // Validate input rows.
    const seen = new Set<string>();
    const cleaned: NotepadTemplateInput[] = [];
    for (const row of inputs) {
      const key = row.key.trim();
      if (!key) continue;
      if (seen.has(key)) {
        setError(`Duplicate input key: ${key}`);
        return;
      }
      seen.add(key);
      const entry: NotepadTemplateInput = {
        key,
        label: row.label.trim() || key,
        type: row.type,
        required: row.required ?? false,
        default: row.default ?? undefined,
      };
      if (row.type === 'enum') {
        const opts = (row.optionsCsv ?? row.options?.join(',') ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (opts.length === 0) {
          setError(`Enum input "${key}" needs at least one option`);
          return;
        }
        entry.options = opts;
      }
      cleaned.push(entry);
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        title: title.trim(),
        inputs_schema: cleaned,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Save as template" onCancel={onCancel}>
      <Section label="Template name">
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Airport report template"
          style={inputStyle}
        />
      </Section>
      <Section label="Description (optional)">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What this template is for"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 48 }}
        />
      </Section>
      <Section label="Default title — use {{input.key}} for parameters">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="{{input.airport_name}} brief"
          style={inputStyle}
        />
      </Section>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p className="of-eyebrow" style={{ margin: 0 }}>Inputs</p>
          <button type="button" className="of-btn" onClick={addRow} style={{ minWidth: 28, height: 28 }}>
            + Add input
          </button>
        </div>
        <p style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
          Inputs are referenced as <code>{`{{input.<key>}}`}</code> in the body, title, description and widgets.
        </p>
        {inputs.length === 0 ? (
          <div
            style={{
              marginTop: 8,
              padding: 12,
              border: '1px dashed var(--border-default)',
              borderRadius: 6,
              fontSize: 13,
              color: 'var(--text-muted)',
            }}
          >
            No inputs defined yet. Add one to make this template parameterised.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            {inputs.map((row, index) => (
              <div
                key={index}
                style={{
                  padding: 10,
                  border: '1px solid var(--border-default)',
                  borderRadius: 6,
                  display: 'grid',
                  gap: 6,
                  gridTemplateColumns: '1fr 1fr 1fr auto',
                  alignItems: 'center',
                }}
              >
                <input
                  type="text"
                  value={row.key}
                  onChange={(e) => updateRow(index, { key: e.target.value })}
                  placeholder="key (e.g. airport_name)"
                  style={inputStyle}
                />
                <input
                  type="text"
                  value={row.label}
                  onChange={(e) => updateRow(index, { label: e.target.value })}
                  placeholder="Label"
                  style={inputStyle}
                />
                <select
                  className="of-select"
                  value={row.type}
                  onChange={(e) => updateRow(index, { type: e.target.value as NotepadTemplateInputType })}
                >
                  <option value="string">string</option>
                  <option value="number">number</option>
                  <option value="enum">enum</option>
                </select>
                <button
                  type="button"
                  className="of-btn"
                  onClick={() => removeRow(index)}
                  title="Remove this input"
                  style={{ minWidth: 28, height: 28 }}
                >
                  ✕
                </button>
                <input
                  type="text"
                  value={row.default ?? ''}
                  onChange={(e) => updateRow(index, { default: e.target.value })}
                  placeholder="Default value (optional)"
                  style={{ ...inputStyle, gridColumn: '1 / 3' }}
                />
                {row.type === 'enum' ? (
                  <input
                    type="text"
                    value={row.optionsCsv ?? row.options?.join(', ') ?? ''}
                    onChange={(e) => updateRow(index, { optionsCsv: e.target.value })}
                    placeholder="option1, option2, option3"
                    style={{ ...inputStyle, gridColumn: '3 / 4' }}
                  />
                ) : (
                  <span />
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={row.required ?? false}
                    onChange={(e) => updateRow(index, { required: e.target.checked })}
                  />
                  Required
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="of-status-danger" style={errorStyle}>
          {error}
        </div>
      )}

      <ModalFooter>
        <button type="button" className="of-btn" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="of-btn of-btn-primary"
          onClick={() => void handleSubmit()}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save template'}
        </button>
      </ModalFooter>
    </ModalShell>
  );
}

// ── New from template ────────────────────────────────────────────────

// One entry in the modal's vertical list. The parent merges built-in
// templates (literals) and user-owned ones into the same shape so the
// modal stays agnostic of where each row came from.
export interface TemplateRow {
  id: string;
  name: string;
  description: string;
  // Display strings; the modal does not format them.
  author: string;
  path: string;
  // ISO string. Pass null for built-in entries with no edit history.
  updatedAt: string | null;
  // Built-ins and user templates without inputs go straight to create;
  // user templates with required parameters advance to the form step.
  hasInputs: boolean;
  inputsSchema?: NotepadTemplateInput[];
  // Default title for the new document — used as placeholder in the
  // title field and as fallback when the user does not override.
  defaultTitle: string;
}

export interface NewFromTemplateModalProps {
  templates: TemplateRow[];
  onCancel: () => void;
  // Single creation entry-point. The parent maps the row id back to
  // the right API call (createNotepadDocument vs instantiateNotepadTemplate).
  onCreate: (templateId: string, inputs: Record<string, string>, title: string) => Promise<void>;
}

type Step =
  | { kind: 'list' }
  | { kind: 'form'; row: TemplateRow };

function formatRowDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
}

export function NewFromTemplateModal({ templates, onCancel, onCreate }: NewFromTemplateModalProps) {
  const [step, setStep] = useState<Step>({ kind: 'list' });
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [titleOverride, setTitleOverride] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Seed default inputs whenever we advance to the form view.
  useEffect(() => {
    if (step.kind !== 'form') return;
    const next: Record<string, string> = {};
    for (const field of step.row.inputsSchema ?? []) {
      if (field.default) next[field.key] = field.default;
    }
    setInputs(next);
    setTitleOverride('');
    setError('');
  }, [step]);

  async function instantiate(row: TemplateRow, withInputs: Record<string, string>, title: string) {
    setError('');
    setSubmitting(true);
    try {
      await onCreate(row.id, withInputs, title);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to create document');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSelect(row: TemplateRow) {
    if (row.hasInputs && (row.inputsSchema?.length ?? 0) > 0) {
      setStep({ kind: 'form', row });
      return;
    }
    // No required form — create immediately using the template's defaults.
    await instantiate(row, {}, '');
  }

  async function handleFormSubmit() {
    if (step.kind !== 'form') return;
    for (const field of step.row.inputsSchema ?? []) {
      if (field.required && !inputs[field.key]?.toString().trim()) {
        setError(`"${field.label || field.key}" is required`);
        return;
      }
    }
    await instantiate(step.row, inputs, titleOverride.trim());
  }

  const title = step.kind === 'form' ? `Configure "${step.row.name}"` : 'New from template';

  return (
    <ModalShell title={title} onCancel={onCancel}>
      {step.kind === 'list' ? (
        templates.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
            No templates yet. Open any document and use "Save as template" to create one.
          </p>
        ) : (
          <ul className="of-template-list" role="list">
            {templates.map((row) => (
              <li key={row.id} className="of-template-list__item">
                <button
                  type="button"
                  className="of-template-row"
                  onClick={() => void handleSelect(row)}
                  disabled={submitting}
                  aria-label={`Use ${row.name}`}
                >
                  <span className="of-template-row__icon" aria-hidden="true">
                    <Glyph name="file-type" size={18} />
                  </span>
                  <span className="of-template-row__copy">
                    <span className="of-template-row__name">{row.name}</span>
                    <span className="of-template-row__path">{row.path}</span>
                  </span>
                  <span className="of-template-row__meta of-template-row__meta--author">
                    {row.author}
                  </span>
                  <span className="of-template-row__meta of-template-row__meta--date">
                    {formatRowDate(row.updatedAt)}
                  </span>
                  <span className="of-template-row__action" aria-hidden="true">
                    New from this template
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            {step.row.description || 'Fill in the values used by this template.'}
          </p>

          <Section label="Document title override (optional)">
            <input
              type="text"
              value={titleOverride}
              onChange={(e) => setTitleOverride(e.target.value)}
              placeholder={step.row.defaultTitle || 'Untitled'}
              style={inputStyle}
            />
          </Section>

          {(step.row.inputsSchema?.length ?? 0) > 0 && (
            <div style={{ display: 'grid', gap: 10 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Inputs</p>
              {step.row.inputsSchema!.map((field) => (
                <TemplateInputField
                  key={field.key}
                  field={field}
                  value={inputs[field.key] ?? ''}
                  onChange={(v) => setInputs((prev) => ({ ...prev, [field.key]: v }))}
                />
              ))}
            </div>
          )}
        </>
      )}

      {error && (
        <div className="of-status-danger" style={errorStyle}>
          {error}
        </div>
      )}

      <ModalFooter>
        {step.kind === 'form' && (
          <button
            type="button"
            className="of-btn"
            onClick={() => setStep({ kind: 'list' })}
            disabled={submitting}
            style={{ marginRight: 'auto' }}
          >
            ← Back
          </button>
        )}
        <button type="button" className="of-btn" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        {step.kind === 'form' && (
          <button
            type="button"
            className="of-btn of-btn-primary"
            onClick={() => void handleFormSubmit()}
            disabled={submitting}
          >
            {submitting ? 'Creating…' : 'Create document'}
          </button>
        )}
      </ModalFooter>
    </ModalShell>
  );
}

interface TemplateInputFieldProps {
  field: NotepadTemplateInput;
  value: string;
  onChange: (next: string) => void;
}

function TemplateInputField({ field, value, onChange }: TemplateInputFieldProps) {
  if (field.type === 'enum' && field.options && field.options.length > 0) {
    return (
      <label style={fieldLabelStyle}>
        <span className="of-eyebrow">
          {field.label || field.key}
          {field.required && <span style={{ color: '#dc2626' }}> *</span>}
        </span>
        <select className="of-select" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Select —</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {field.description && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{field.description}</span>}
      </label>
    );
  }
  return (
    <label style={fieldLabelStyle}>
      <span className="of-eyebrow">
        {field.label || field.key}
        {field.required && <span style={{ color: '#dc2626' }}> *</span>}
      </span>
      <input
        type={field.type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.default || ''}
        style={inputStyle}
      />
      {field.description && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{field.description}</span>}
    </label>
  );
}

// ── Shared shell ─────────────────────────────────────────────────────

function ModalShell({ title, children, onCancel }: { title: string; children: React.ReactNode; onCancel: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.42)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 80,
        zIndex: 60,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)',
          borderRadius: 'var(--radius-md)',
          minWidth: 540,
          maxWidth: 740,
          maxHeight: '82vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(15, 23, 42, 0.18)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <strong>{title}</strong>
          <button
            type="button"
            className="of-btn"
            onClick={onCancel}
            title="Close"
            style={{ minWidth: 24, height: 24, padding: '0 6px', fontSize: 12 }}
          >
            ✕
          </button>
        </header>
        <div style={{ padding: '14px 18px', display: 'grid', gap: 12 }}>{children}</div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={fieldLabelStyle}>
      <span className="of-eyebrow">{label}</span>
      {children}
    </label>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <footer
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 8,
        padding: '12px 18px',
        borderTop: '1px solid var(--border-default)',
        background: 'var(--bg-panel-muted)',
      }}
    >
      {children}
    </footer>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  fontSize: 14,
  width: '100%',
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
};

const errorStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 6,
  fontSize: 13,
};

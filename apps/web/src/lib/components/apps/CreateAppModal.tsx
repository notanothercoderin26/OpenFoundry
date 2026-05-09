import { useEffect, useMemo, useState, type FormEvent } from 'react';

import type { AppTemplate } from '@/lib/api/apps';
import { Glyph } from '@/lib/components/ui/Glyph';

interface CreateAppModalProps {
  open: boolean;
  busy: boolean;
  templates: AppTemplate[];
  onClose: () => void;
  onCreate: (input: { name: string; slug?: string; description?: string; template_key?: string }) => Promise<void> | void;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function CreateAppModal({ open, busy, templates, onClose, onCreate }: CreateAppModalProps) {
  const [name, setName] = useState('New app');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [templateKey, setTemplateKey] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('New app');
    setSlug('');
    setDescription('');
    setTemplateKey('');
    setError('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [open, busy, onClose]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.key === templateKey) ?? null,
    [templateKey, templates],
  );

  if (!open) return null;

  function selectTemplate(nextKey: string) {
    const next = templates.find((template) => template.key === nextKey) ?? null;
    setTemplateKey(next?.key ?? '');
    if (next) {
      setName((current) => (current.trim() && current !== 'New app' ? current : next.name));
      setDescription((current) => (current.trim() ? current : next.description));
      setSlug((current) => (current.trim() ? current : slugify(next.name)));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('App name is required.');
      return;
    }
    await onCreate({
      name: trimmedName,
      slug: slug.trim() || undefined,
      description: description.trim() || undefined,
      template_key: templateKey || undefined,
    });
  }

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(31, 37, 45, 0.46)',
        padding: 16,
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-app-title"
        className="of-panel"
        onSubmit={(event) => void submit(event)}
        style={{ width: 'min(900px, 100%)', maxHeight: '92vh', overflow: 'hidden', background: 'var(--bg-panel)' }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <div>
            <p className="of-eyebrow" style={{ margin: 0 }}>APP-CREATE</p>
            <h2 id="create-app-title" className="of-heading-sm" style={{ margin: 0 }}>
              New app
            </h2>
          </div>
          <button type="button" className="of-button of-button--ghost" onClick={onClose} disabled={busy} aria-label="Close">
            <Glyph name="x" size={15} />
          </button>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(240px, 0.85fr) minmax(0, 1.15fr)',
            minHeight: 430,
            overflow: 'auto',
          }}
        >
          <aside
            style={{
              display: 'grid',
              alignContent: 'start',
              gap: 8,
              borderRight: '1px solid var(--border-default)',
              background: 'var(--bg-panel-muted)',
              padding: 12,
            }}
          >
            <button
              type="button"
              onClick={() => selectTemplate('')}
              style={{
                display: 'grid',
                gap: 4,
                width: '100%',
                border: `1px solid ${templateKey === '' ? 'var(--status-info)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-sm)',
                background: templateKey === '' ? 'var(--status-info-bg)' : 'var(--bg-panel)',
                color: 'var(--text-default)',
                padding: 10,
                textAlign: 'left',
              }}
            >
              <span className="of-eyebrow">blank</span>
              <strong style={{ color: 'var(--text-strong)' }}>Start from scratch</strong>
              <span className="of-text-muted" style={{ fontSize: 12 }}>Empty page, default settings, and editable theme.</span>
            </button>

            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => selectTemplate(template.key)}
                style={{
                  display: 'grid',
                  gap: 4,
                  width: '100%',
                  border: `1px solid ${template.key === templateKey ? 'var(--status-info)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-sm)',
                  background: template.key === templateKey ? 'var(--status-info-bg)' : 'var(--bg-panel)',
                  color: 'var(--text-default)',
                  padding: 10,
                  textAlign: 'left',
                }}
              >
                <span className="of-eyebrow">{template.category}</span>
                <strong style={{ color: 'var(--text-strong)' }}>{template.name}</strong>
                <span className="of-text-muted" style={{ fontSize: 12, lineHeight: 1.4 }}>{template.description}</span>
              </button>
            ))}
          </aside>

          <div style={{ display: 'grid', alignContent: 'start', gap: 12, padding: 16 }}>
            {error ? (
              <div className="of-status-danger" style={{ padding: '9px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                {error}
              </div>
            ) : null}

            <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
              Name
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!slug.trim()) setSlug(slugify(event.target.value));
                }}
                className="of-input"
                autoFocus
                required
              />
            </label>

            <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
              Slug
              <input
                value={slug}
                onChange={(event) => setSlug(slugify(event.target.value))}
                className="of-input"
                placeholder="new-app"
              />
            </label>

            <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className="of-input"
                style={{ resize: 'vertical' }}
                placeholder="What this app helps users do."
              />
            </label>

            {selectedTemplate ? (
              <section className="of-panel-muted" style={{ display: 'grid', gap: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <p className="of-eyebrow" style={{ margin: 0 }}>Selected template</p>
                    <h3 className="of-heading-sm" style={{ margin: '4px 0 0' }}>{selectedTemplate.name}</h3>
                  </div>
                  <span className="of-chip of-chip-active">{selectedTemplate.category}</span>
                </div>
                <p className="of-text-muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
                  {selectedTemplate.definition.pages.length} pages,{' '}
                  {selectedTemplate.definition.pages.reduce((count, page) => count + page.widgets.length, 0)} widgets
                </p>
              </section>
            ) : null}
          </div>
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
          <button type="button" className="of-button of-button--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="of-button of-button--primary" disabled={busy || !name.trim()}>
            {busy ? 'Creating...' : 'Create app'}
          </button>
        </footer>
      </form>
    </div>
  );
}

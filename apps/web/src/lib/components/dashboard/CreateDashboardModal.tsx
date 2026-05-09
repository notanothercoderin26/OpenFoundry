import { useEffect, useMemo, useState, type FormEvent } from 'react';

import type { DashboardTemplateSummary } from '@/lib/utils/dashboards';

interface CreateDashboardModalProps {
  open: boolean;
  templates: DashboardTemplateSummary[];
  initialTemplateId?: string;
  onClose: () => void;
  onCreate: (templateId: string, name: string) => void;
}

function defaultName(template: DashboardTemplateSummary | undefined) {
  if (!template || template.id === 'blank') return 'New dashboard';
  return template.name;
}

export function CreateDashboardModal({
  open,
  templates,
  initialTemplateId = 'blank',
  onClose,
  onCreate,
}: CreateDashboardModalProps) {
  const [templateId, setTemplateId] = useState(initialTemplateId);
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) ?? templates[0],
    [templateId, templates],
  );
  const [name, setName] = useState(defaultName(selectedTemplate));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const template = templates.find((entry) => entry.id === initialTemplateId) ?? templates[0];
    setTemplateId(template?.id ?? 'blank');
    setName(defaultName(template));
    setError('');
  }, [initialTemplateId, open, templates]);

  useEffect(() => {
    if (!open) return;
    function onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [open, onClose]);

  if (!open) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError('Dashboard name is required.');
      return;
    }
    onCreate(templateId, normalizedName);
  }

  function selectTemplate(nextTemplateId: string) {
    const template = templates.find((entry) => entry.id === nextTemplateId) ?? templates[0];
    setTemplateId(template?.id ?? 'blank');
    setName((current) => (current.trim() ? current : defaultName(template)));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-dashboard-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(17, 24, 39, 0.42)',
        padding: 16,
      }}
    >
      <form
        className="of-panel"
        onSubmit={submit}
        style={{
          width: 'min(820px, 100%)',
          maxHeight: '90vh',
          overflow: 'hidden',
          background: 'var(--bg-panel)',
          boxShadow: 'var(--shadow-popover)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            borderBottom: '1px solid var(--border-default)',
            padding: '14px 16px',
          }}
        >
          <div>
            <p className="of-eyebrow" style={{ margin: 0 }}>
              Dashboards
            </p>
            <h2 id="create-dashboard-title" className="of-heading-md" style={{ marginTop: 4 }}>
              Create dashboard
            </h2>
          </div>
          <button type="button" className="of-button of-button--ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(240px, 0.85fr) minmax(0, 1.15fr)',
            minHeight: 360,
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
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => selectTemplate(template.id)}
                style={{
                  display: 'grid',
                  gap: 4,
                  width: '100%',
                  border: `1px solid ${template.id === templateId ? 'var(--status-info)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-sm)',
                  background: template.id === templateId ? 'var(--status-info-bg)' : 'var(--bg-panel)',
                  color: 'var(--text-default)',
                  padding: 10,
                  textAlign: 'left',
                }}
              >
                <span className="of-eyebrow">{template.category}</span>
                <strong style={{ color: 'var(--text-strong)' }}>{template.name}</strong>
                <span className="of-text-muted" style={{ fontSize: 12 }}>
                  {template.description}
                </span>
              </button>
            ))}
          </aside>

          <div style={{ display: 'grid', alignContent: 'start', gap: 14, padding: 16 }}>
            <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 600 }}>
              Dashboard name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Production quality dashboard"
                className="of-input"
                autoFocus
              />
            </label>

            {selectedTemplate ? (
              <section className="of-panel-muted" style={{ display: 'grid', gap: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <p className="of-eyebrow" style={{ margin: 0 }}>
                      Selected template
                    </p>
                    <h3 className="of-heading-sm" style={{ margin: '4px 0 0' }}>
                      {selectedTemplate.name}
                    </h3>
                  </div>
                  <span className="of-chip of-chip-active">{selectedTemplate.category}</span>
                </div>
                <p className="of-text-muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
                  {selectedTemplate.dashboardDescription}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {selectedTemplate.widgetTypes.map((type, index) => (
                    <span key={`${selectedTemplate.id}-${type}-${index}`} className="of-chip">
                      {type}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {error ? (
              <div className="of-status-danger" style={{ padding: '9px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <footer
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            borderTop: '1px solid var(--border-default)',
            padding: '12px 16px',
          }}
        >
          <button type="button" className="of-button of-button--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="of-button of-button--primary">
            Create dashboard
          </button>
        </footer>
      </form>
    </div>
  );
}

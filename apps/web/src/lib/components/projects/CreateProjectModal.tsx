import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { createProject, type OntologyProject } from '@/lib/api/ontology';

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (project: OntologyProject) => void;
}

const NAMESPACES = ['default', 'platform', 'analytics'] as const;
type Namespace = (typeof NAMESPACES)[number];

const DEFAULT_ROLES = ['viewer', 'editor', 'owner'] as const;
type DefaultRole = (typeof DEFAULT_ROLES)[number];
const ROLE_LABEL: Record<DefaultRole, string> = {
  viewer: 'Viewer',
  editor: 'Editor',
  owner: 'Owner',
};

function deriveSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-_\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `project-${Date.now().toString(36)}`;
}

function CloseGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function InfoGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 11v5M12 7.5v0.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function OrgChipGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="6.5" height="14" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="5" width="6.5" height="14" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 9h2.5M6 12h2.5M6 15h2.5M15.5 9H18M15.5 12H18M15.5 15H18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CaretDownGlyph({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CreateProjectModal({ open, onClose, onCreated }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [namespace, setNamespace] = useState<Namespace>('default');
  const [defaultRole, setDefaultRole] = useState<DefaultRole>('viewer');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setNamespace('default');
    setDefaultRole('viewer');
    setSubmitting(false);
    setError('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [open, onClose, submitting]);

  const slug = useMemo(() => deriveSlug(name), [name]);
  const orgLabel = namespace.charAt(0).toUpperCase() + namespace.slice(1);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Enter a project name to continue.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const project = await createProject({
        slug,
        display_name: name.trim(),
        description: description.trim() || undefined,
        workspace_slug: namespace,
      });
      onCreated(project);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-project-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        background: 'rgba(17, 24, 39, 0.42)',
        padding: '64px 16px 16px',
      }}
    >
      <form
        className="of-panel"
        onSubmit={(event) => void submit(event)}
        style={{
          width: '100%',
          maxWidth: 420,
          overflow: 'hidden',
          background: '#fff',
          borderRadius: 4,
          boxShadow: '0 16px 40px rgba(17, 24, 39, 0.24)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 16px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <h2
            id="create-project-title"
            style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-strong)' }}
          >
            Create new project
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={submitting}
            style={{
              border: 0,
              background: 'transparent',
              padding: 4,
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'inline-flex',
            }}
          >
            <CloseGlyph />
          </button>
        </header>

        <div style={{ display: 'grid', gap: 14, padding: 16 }}>
          <Field label="Name">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Flight Alerts at SFO"
              className="of-input"
              autoFocus
              autoComplete="off"
              style={{ background: '#eef3f8' }}
            />
          </Field>

          <Field label="Description" optional>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="of-input"
              style={{ minHeight: 88, resize: 'vertical' }}
            />
          </Field>

          <Field
            label="Namespace"
            tooltip="The namespace controls which workspace the project belongs to and the default location for resources."
          >
            <SelectShell>
              <select
                value={namespace}
                onChange={(event) => setNamespace(event.target.value as Namespace)}
                aria-label="Namespace"
                style={selectStyle}
              >
                {NAMESPACES.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry.charAt(0).toUpperCase() + entry.slice(1)}
                  </option>
                ))}
              </select>
            </SelectShell>
          </Field>

          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-strong)' }}>
              Organizations <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· Any of</span>
            </span>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                width: 'fit-content',
                padding: '4px 10px',
                background: '#eef3f8',
                border: '1px solid var(--border-subtle)',
                borderRadius: 3,
                color: 'var(--text-strong)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <OrgChipGlyph />
              {orgLabel}
            </div>
          </div>

          <Field label="Default role">
            <SelectShell>
              <select
                value={defaultRole}
                onChange={(event) => setDefaultRole(event.target.value as DefaultRole)}
                aria-label="Default role"
                style={selectStyle}
              >
                {DEFAULT_ROLES.map((entry) => (
                  <option key={entry} value={entry}>
                    {ROLE_LABEL[entry]}
                  </option>
                ))}
              </select>
            </SelectShell>
            <p
              style={{
                margin: '6px 0 0',
                color: 'var(--text-muted)',
                fontSize: 11,
                lineHeight: 1.45,
              }}
            >
              Everyone from <strong style={{ color: 'var(--text-strong)' }}>{orgLabel}</strong> can see the existence of this project and is granted the
              {' '}
              <a href="#" className="of-link">{ROLE_LABEL[defaultRole]}</a> role.
            </p>
          </Field>

          {error ? (
            <div
              className="of-status-danger"
              style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}
            >
              {error}
            </div>
          ) : null}
        </div>

        <footer
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '12px 16px',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <button
            type="button"
            className="of-button"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="of-button of-button--success"
            disabled={submitting || !name.trim()}
          >
            {submitting ? 'Creating...' : 'Create'}
          </button>
        </footer>
      </form>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  width: '100%',
  border: 0,
  background: 'transparent',
  paddingRight: 22,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-strong)',
  outline: 'none',
};

function SelectShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        position: 'relative',
        minHeight: 28,
        padding: '0 10px',
        background: 'linear-gradient(180deg, #ffffff 0%, #f3f5f7 100%)',
        border: '1px solid var(--border-strong)',
        borderRadius: 3,
        width: 'fit-content',
        minWidth: 110,
      }}
    >
      {children}
      <span
        aria-hidden="true"
        style={{ position: 'absolute', right: 8, color: 'var(--text-muted)', display: 'inline-flex' }}
      >
        <CaretDownGlyph />
      </span>
    </div>
  );
}

function Field({
  label,
  optional,
  tooltip,
  children,
}: {
  label: string;
  optional?: boolean;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-strong)',
        }}
      >
        {label}
        {optional ? (
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>
            (optional)
          </span>
        ) : null}
        {tooltip ? (
          <span
            title={tooltip}
            aria-label={tooltip}
            style={{ marginLeft: 2, color: 'var(--text-muted)', display: 'inline-flex' }}
          >
            <InfoGlyph />
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { createObjectType, listObjectTypes, type ObjectType } from '@/lib/api/ontology';

const DEFAULT_COLOR = '#2d72d2';
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;

const initialDraft = {
  name: '',
  displayName: '',
  description: '',
  icon: '',
  color: DEFAULT_COLOR,
};

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

function displayLabel(type: ObjectType) {
  return type.display_name || type.name;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function CreateObjectTypePage() {
  const [draft, setDraft] = useState(initialDraft);
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [createdType, setCreatedType] = useState<ObjectType | null>(null);

  async function loadTypes(nextSearch = search) {
    setLoading(true);
    setError('');
    try {
      const response = await listObjectTypes({
        page: 1,
        per_page: 200,
        search: nextSearch.trim() || undefined,
      });
      setObjectTypes(response.data);
      setTotal(response.total);
    } catch (cause) {
      setError(errorMessage(cause, 'Failed to load object types'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTypes('');
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = draft.name.trim();
    const displayName = draft.displayName.trim();
    const description = draft.description.trim();
    const icon = draft.icon.trim();

    if (!name) {
      setFormError('Name is required');
      return;
    }

    if (!IDENTIFIER_PATTERN.test(name)) {
      setFormError('Use a lowercase identifier that starts with a letter and contains only letters, numbers, and underscores.');
      return;
    }

    setSubmitting(true);
    setFormError('');
    setError('');
    setCreatedType(null);
    try {
      const created = await createObjectType({
        name,
        display_name: displayName || undefined,
        description: description || undefined,
        icon: icon || undefined,
        color: draft.color || undefined,
      });
      setCreatedType(created);
      setDraft(initialDraft);
      setSearch('');
      await loadTypes('');
    } catch (cause) {
      setFormError(errorMessage(cause, 'Create failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="of-page" style={{ padding: 24, display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Link to="/ontology" style={{ color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>
            Back to ontology
          </Link>
          <h1 className="of-heading-xl" style={{ marginTop: 6 }}>Object types</h1>
          <p className="of-text-muted" style={{ marginTop: 4, maxWidth: 720 }}>
            Create object type metadata and inspect the current ontology type catalog.
          </p>
        </div>
        <Link to="/object-link-types" className="of-button">
          Manage properties and links
        </Link>
      </header>

      {error && (
        <div role="alert" className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {createdType && (
        <div className="of-status-success" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          Created <Link to={`/ontology/${createdType.id}`}>{displayLabel(createdType)}</Link>.
        </div>
      )}

      <section className="of-panel" style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void loadTypes();
            }}
            placeholder="Search object types"
            className="of-input"
            style={{ minWidth: 240, flex: '1 1 320px' }}
          />
          <button type="button" onClick={() => void loadTypes()} disabled={loading} className="of-button">
            {loading ? 'Loading...' : 'Apply'}
          </button>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              void loadTypes('');
            }}
            disabled={loading || !search}
            className="of-button"
          >
            Reset
          </button>
          <span className="of-text-muted" style={{ fontSize: 12 }}>
            {total} total
          </span>
        </div>
      </section>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', alignItems: 'start' }}>
        <form onSubmit={submit} className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <div>
            <p className="of-eyebrow">Create type</p>
            <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              Add the identifier and display metadata first; properties can be configured after creation.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div
              aria-hidden="true"
              style={{
                width: 72,
                height: 72,
                flex: '0 0 72px',
                borderRadius: 8,
                background: draft.color,
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              {draft.icon.trim() || draft.displayName.trim().slice(0, 1).toUpperCase() || draft.name.trim().slice(0, 1).toUpperCase() || 'T'}
            </div>
            <div style={{ display: 'grid', gap: 8, flex: 1 }}>
              <label style={{ fontSize: 13 }}>
                Name (identifier)
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="customer_invoice"
                  required
                  className="of-input"
                  style={{ marginTop: 4, fontFamily: 'var(--font-mono)' }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                Display name
                <input
                  value={draft.displayName}
                  onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                  placeholder="Customer Invoice"
                  className="of-input"
                  style={{ marginTop: 4 }}
                />
              </label>
            </div>
          </div>

          <label style={{ fontSize: 13 }}>
            Description
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={3}
              className="of-input"
              style={{ marginTop: 4, resize: 'vertical' }}
            />
          </label>

          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <label style={{ fontSize: 13 }}>
              Icon text
              <input
                value={draft.icon}
                onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                placeholder="CI"
                className="of-input"
                style={{ marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              Color
              <input
                type="color"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                className="of-input"
                style={{ marginTop: 4, padding: 2, height: 36 }}
              />
            </label>
          </div>

          {formError && (
            <div role="alert" className="of-status-danger" style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
              {formError}
            </div>
          )}

          <button type="submit" disabled={submitting || !draft.name.trim()} className="of-button of-button--primary" style={{ justifySelf: 'start' }}>
            {submitting ? 'Creating...' : 'Create object type'}
          </button>
        </form>

        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
            <div>
              <p className="of-eyebrow">Current types</p>
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                {objectTypes.length} shown from {total} total
              </p>
            </div>
            <button type="button" onClick={() => void loadTypes()} disabled={loading} className="of-button">
              Refresh
            </button>
          </div>

          {loading && objectTypes.length === 0 && (
            <div role="status" className="of-panel-muted" style={{ padding: 14, fontSize: 13 }}>
              Loading object types...
            </div>
          )}

          {!loading && objectTypes.length === 0 && (
            <div className="of-panel-muted" style={{ padding: 14, fontSize: 13 }}>
              No object types found.
            </div>
          )}

          {objectTypes.length > 0 && (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
              {objectTypes.map((type) => (
                <li key={type.id}>
                  <Link to={`/ontology/${type.id}`} className="of-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 6,
                          background: type.color || DEFAULT_COLOR,
                          color: 'white',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flex: '0 0 36px',
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        {type.icon || displayLabel(type).slice(0, 2).toUpperCase()}
                      </span>
                      <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                        <strong style={{ color: 'var(--text-strong)', overflowWrap: 'anywhere' }}>{displayLabel(type)}</strong>
                        <span className="of-text-muted" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>
                          {type.name} - pk: {type.primary_key_property ?? 'none'}
                        </span>
                        {type.description && (
                          <span style={{ fontSize: 12, color: 'var(--text-default)', overflowWrap: 'anywhere' }}>
                            {type.description}
                          </span>
                        )}
                        <span className="of-text-muted" style={{ fontSize: 11 }}>
                          Updated {formatTimestamp(type.updated_at)}
                        </span>
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}

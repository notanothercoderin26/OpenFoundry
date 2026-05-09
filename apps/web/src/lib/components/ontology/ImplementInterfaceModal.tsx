import { useEffect, useMemo, useState, type FormEvent } from 'react';

import type { ObjectType, OntologyInterface } from '@/lib/api/ontology';
import { Glyph } from '@/lib/components/ui/Glyph';

interface ImplementInterfaceModalProps {
  open: boolean;
  iface: OntologyInterface | null;
  objectTypes: ObjectType[];
  initialObjectTypeId?: string;
  busy: boolean;
  onClose: () => void;
  onImplement: (objectTypeId: string) => Promise<void> | void;
}

export function ImplementInterfaceModal({
  open,
  iface,
  objectTypes,
  initialObjectTypeId = '',
  busy,
  onClose,
  onImplement,
}: ImplementInterfaceModalProps) {
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelectedTypeId(initialObjectTypeId || objectTypes[0]?.id || '');
    setQuery('');
    setError('');
  }, [open, initialObjectTypeId, objectTypes]);

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

  const filteredTypes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return objectTypes;
    return objectTypes.filter((objectType) =>
      `${objectType.name} ${objectType.display_name} ${objectType.description}`.toLowerCase().includes(needle),
    );
  }, [objectTypes, query]);

  const selectedType = useMemo(
    () => objectTypes.find((objectType) => objectType.id === selectedTypeId) ?? null,
    [objectTypes, selectedTypeId],
  );

  if (!open || !iface) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTypeId) {
      setError('Choose an object type to implement this interface.');
      return;
    }
    setError('');
    try {
      await onImplement(selectedTypeId);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to implement interface');
    }
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
        padding: 16,
        background: 'rgba(31, 37, 45, 0.46)',
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="implement-interface-title"
        className="of-panel"
        onSubmit={(event) => void submit(event)}
        style={{
          width: 'min(760px, 100%)',
          maxHeight: 'min(720px, 92vh)',
          overflow: 'hidden',
          background: 'var(--bg-panel)',
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr) auto',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
            padding: '14px 16px',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <div>
            <p className="of-eyebrow" style={{ margin: 0 }}>ONT-018</p>
            <h2 id="implement-interface-title" className="of-heading-sm" style={{ margin: 0 }}>
              Implement interface
            </h2>
          </div>
          <button type="button" className="of-button of-button--ghost" onClick={onClose} disabled={busy} aria-label="Close">
            <Glyph name="x" size={15} />
          </button>
        </header>

        <div style={{ display: 'grid', gap: 14, padding: 16, overflow: 'auto' }}>
          <section className="of-panel-muted" style={{ display: 'grid', gap: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-strong)' }}>{iface.display_name}</p>
                <p style={{ margin: '3px 0 0', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                  {iface.name}
                </p>
              </div>
              <span className="of-chip">Implementation binding</span>
            </div>
            {selectedType && (
              <div style={{ display: 'grid', gap: 4, paddingTop: 6, borderTop: '1px solid var(--border-default)' }}>
                <span className="of-text-muted" style={{ fontSize: 12 }}>Selected object type</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
                  {selectedType.display_name}
                </span>
              </div>
            )}
          </section>

          <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
            Search object types
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="of-input"
              placeholder="Filter by name, display name, or description"
              disabled={busy}
            />
          </label>

          <div style={{ display: 'grid', gap: 8 }}>
            {filteredTypes.length === 0 ? (
              <div
                style={{
                  border: '1px dashed var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: 20,
                  textAlign: 'center',
                  fontSize: 13,
                  color: 'var(--text-muted)',
                }}
              >
                No available object types match this filter.
              </div>
            ) : (
              filteredTypes.map((objectType) => {
                const active = selectedTypeId === objectType.id;
                return (
                  <button
                    key={objectType.id}
                    type="button"
                    onClick={() => setSelectedTypeId(objectType.id)}
                    disabled={busy}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: 12,
                      border: `1px solid ${active ? '#059669' : 'var(--border-default)'}`,
                      background: active ? '#ecfdf5' : 'var(--bg-elevated)',
                      borderRadius: 'var(--radius-md)',
                      cursor: busy ? 'default' : 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: 'var(--text-strong)' }}>
                          {objectType.display_name}
                        </p>
                        <p style={{ margin: '3px 0 0', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                          {objectType.name}
                        </p>
                      </div>
                      {active && <span className="of-chip">Selected</span>}
                    </div>
                    <p className="of-text-muted" style={{ marginTop: 8, fontSize: 12 }}>
                      {objectType.description || 'No object type description provided.'}
                    </p>
                  </button>
                );
              })
            )}
          </div>

          {error && (
            <div className="of-status-danger" style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
              {error}
            </div>
          )}
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
          <button type="submit" className="of-button of-button--primary" disabled={busy || !selectedTypeId}>
            {busy ? 'Implementing...' : 'Implement interface'}
          </button>
        </footer>
      </form>
    </div>
  );
}

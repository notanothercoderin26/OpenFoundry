import { useEffect, useRef, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import {
  type CompassTag,
  createCompassTag,
  tagResource,
  untagResource,
  type ResourceKind,
} from '@/lib/api/workspace';

interface TagPickerProps {
  resourceKind: ResourceKind;
  resourceId: string;
  attached: CompassTag[];
  available: CompassTag[];
  onChange: () => void;
  onTagsCatalogChange: () => void;
}

export function TagPicker({
  resourceKind,
  resourceId,
  attached,
  available,
  onChange,
  onTagsCatalogChange,
}: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onEsc(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const attachedIds = new Set(attached.map((tag) => tag.id));

  async function toggle(tag: CompassTag) {
    setBusyId(tag.id);
    setError('');
    try {
      if (attachedIds.has(tag.id)) {
        await untagResource(resourceKind, resourceId, tag.id);
      } else {
        await tagResource(resourceKind, resourceId, tag.id);
      }
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Tag update failed');
    } finally {
      setBusyId(null);
    }
  }

  async function createAndAttach() {
    const name = draftName.trim();
    if (!name) return;
    setBusyId('__create__');
    setError('');
    try {
      const tag = await createCompassTag({ name });
      onTagsCatalogChange();
      await tagResource(resourceKind, resourceId, tag.id);
      onChange();
      setDraftName('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Create tag failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        aria-label="Edit tags"
        title="Edit tags"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          color: '#5c7080',
        }}
      >
        <Glyph name="tag" size={13} tone="currentColor" />
      </button>
      {open ? (
        <div
          role="menu"
          onClick={(event) => event.stopPropagation()}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            zIndex: 40,
            minWidth: 220,
            maxWidth: 280,
            background: '#fff',
            border: '1px solid var(--border-default)',
            borderRadius: 4,
            boxShadow: 'var(--shadow-popover)',
            padding: 6,
          }}
        >
          {available.length === 0 ? (
            <p style={{ margin: '4px 6px', fontSize: 11, color: '#a1a8b3' }}>
              No tags yet. Create one below.
            </p>
          ) : (
            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
              {available.map((tag) => {
                const checked = attachedIds.has(tag.id);
                return (
                  <label
                    key={tag.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 6px',
                      cursor: 'pointer',
                      fontSize: 12,
                      color: 'var(--text-strong)',
                      opacity: busyId === tag.id ? 0.5 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => void toggle(tag)}
                      disabled={busyId === tag.id}
                      style={{ margin: 0, cursor: 'pointer' }}
                    />
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: tag.color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tag.name}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <div
            style={{
              borderTop: '1px solid var(--border-subtle)',
              marginTop: 6,
              paddingTop: 6,
              display: 'flex',
              gap: 4,
            }}
          >
            <input
              type="text"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void createAndAttach();
                }
              }}
              placeholder="New tag name"
              style={{
                flex: 1,
                padding: '4px 6px',
                fontSize: 11,
                border: '1px solid var(--border-default)',
                borderRadius: 3,
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => void createAndAttach()}
              disabled={!draftName.trim() || busyId === '__create__'}
              className="of-button"
              style={{ padding: '2px 8px', fontSize: 11 }}
            >
              Add
            </button>
          </div>
          {error ? (
            <p style={{ margin: '4px 6px 0', fontSize: 11, color: 'var(--status-danger)' }}>
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function TagChips({ tags, max }: { tags: CompassTag[]; max?: number }) {
  if (tags.length === 0) {
    return <span style={{ fontSize: 12, color: '#a1a8b3' }}>—</span>;
  }
  const visible = max != null ? tags.slice(0, max) : tags;
  const extra = max != null ? tags.length - visible.length : 0;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {visible.map((tag) => (
        <span
          key={tag.id}
          title={tag.name}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '1px 6px',
            borderRadius: 8,
            fontSize: 10,
            fontWeight: 500,
            background: `${tag.color}26`,
            color: tag.color,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: tag.color,
            }}
          />
          {tag.name}
        </span>
      ))}
      {extra > 0 ? (
        <span style={{ fontSize: 10, color: '#a1a8b3' }}>+{extra}</span>
      ) : null}
    </div>
  );
}

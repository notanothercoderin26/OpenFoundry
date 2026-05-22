import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Glyph, type GlyphName } from './Glyph';

export type DropdownMenuItem =
  | { kind: 'separator'; key?: string }
  | {
      kind: 'item';
      key: string;
      label: string;
      icon?: GlyphName;
      shortcut?: string;
      // Use `to` for navigation; the dropdown closes after the click.
      // Use `onClick` for in-app callbacks. Items with both are treated
      // as links and the onClick still fires.
      to?: string;
      onClick?: () => void;
      disabled?: boolean;
      danger?: boolean;
    };

interface DropdownMenuProps {
  // ReactNode so callers can render a chevron, an icon + text, or any
  // custom trigger content. Plain strings still work.
  label: ReactNode;
  items: DropdownMenuItem[];
  triggerClassName?: string;
  menuClassName?: string;
  // Anchor the menu to the left (default) or right edge of the trigger.
  align?: 'left' | 'right';
}

export function DropdownMenu({
  label,
  items,
  triggerClassName,
  menuClassName,
  align = 'left',
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: globalThis.MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const menuClass = [
    'of-dropdown__menu',
    align === 'right' ? 'of-dropdown__menu--right' : '',
    menuClassName ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="of-dropdown" ref={ref}>
      <button
        type="button"
        className={triggerClassName ?? 'of-dropdown__trigger'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
      </button>
      {open && (
        <div role="menu" className={menuClass}>
          {items.map((item, idx) => {
            if (item.kind === 'separator') {
              return (
                <div
                  key={item.key ?? `sep-${idx}`}
                  role="separator"
                  className="of-dropdown__sep"
                />
              );
            }
            const className = `of-dropdown__item${
              item.danger ? ' of-dropdown__item--danger' : ''
            }`;
            const body = (
              <>
                <span className="of-dropdown__icon">
                  {item.icon && <Glyph name={item.icon} size={13} />}
                </span>
                <span className="of-dropdown__label">{item.label}</span>
                {item.shortcut && (
                  <span className="of-dropdown__shortcut">{item.shortcut}</span>
                )}
              </>
            );
            if (item.to && !item.disabled) {
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  role="menuitem"
                  className={className}
                  onClick={() => {
                    setOpen(false);
                    item.onClick?.();
                  }}
                >
                  {body}
                </Link>
              );
            }
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={className}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
              >
                {body}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

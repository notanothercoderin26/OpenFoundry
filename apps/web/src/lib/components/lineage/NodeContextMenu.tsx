// Foundry exposes a right-click context menu on every lineage node:
// "Expand node", "Expand parents…", "Expand descendants…", "Open in
// app", "Build dataset". We reproduce the surface with a small DOM
// popover anchored to the cursor — closes on click-outside or Escape.

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

export interface NodeContextMenuItem {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  variant?: 'default' | 'danger';
}

interface NodeContextMenuProps {
  anchor: { x: number; y: number; nodeId: string; nodeLabel: string };
  items: NodeContextMenuItem[];
  onClose: () => void;
}

export function NodeContextMenu({ anchor, items, onClose }: NodeContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocPointerDown(event: MouseEvent) {
      if (!ref.current) return;
      if (event.target instanceof Node && ref.current.contains(event.target)) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDocPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{
        ...menuRoot,
        top: anchor.y,
        left: anchor.x,
      }}
    >
      <div style={menuHeader} title={anchor.nodeLabel}>
        {anchor.nodeLabel}
      </div>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          style={{
            ...menuItem,
            ...(item.disabled ? menuItemDisabled : {}),
            ...(item.variant === 'danger' ? menuItemDanger : {}),
          }}
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            item.onSelect();
            onClose();
          }}
          title={item.hint}
        >
          {item.icon && <span style={menuIconWrap}>{item.icon}</span>}
          <span style={menuLabel}>{item.label}</span>
          {item.shortcut && <span style={menuShortcut}>{item.shortcut}</span>}
        </button>
      ))}
    </div>
  );
}

const menuRoot: CSSProperties = {
  position: 'fixed',
  zIndex: 40,
  minWidth: 220,
  maxWidth: 320,
  padding: '4px 0',
  background: 'var(--bg-panel)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
  display: 'flex',
  flexDirection: 'column',
};
const menuHeader: CSSProperties = {
  padding: '6px 10px',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid var(--border-subtle)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const menuItem: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '6px 10px',
  border: 'none',
  background: 'transparent',
  fontSize: 12,
  color: 'var(--text-default)',
  cursor: 'pointer',
  textAlign: 'left',
};
const menuItemDisabled: CSSProperties = {
  opacity: 0.45,
  cursor: 'not-allowed',
};
const menuItemDanger: CSSProperties = {
  color: 'var(--status-danger)',
};
const menuLabel: CSSProperties = {
  flex: 1,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const menuShortcut: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 11,
};
const menuIconWrap: CSSProperties = {
  display: 'inline-flex',
  width: 14,
  height: 14,
  color: 'var(--text-muted)',
};

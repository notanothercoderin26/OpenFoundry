import type { ReactNode } from 'react';
import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';

export interface IconRailItem {
  id: string;
  icon: GlyphName;
  label: string;
  active?: boolean;
  badge?: ReactNode;
  onClick?: () => void;
  href?: string;
}

interface IconRailProps {
  items: IconRailItem[];
  header?: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function IconRail({ items, header, footer, width = 56 }: IconRailProps) {
  return (
    <aside
      aria-label="Application sidebar"
      style={{
        width,
        flexShrink: 0,
        background: 'var(--bg-sidebar)',
        color: 'var(--text-sidebar-icon)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        borderRight: '1px solid var(--bg-sidebar-active)',
      }}
    >
      {header && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px 0',
            borderBottom: '1px solid var(--bg-sidebar-active)',
          }}
        >
          {header}
        </div>
      )}

      <nav
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          paddingTop: 8,
          gap: 2,
        }}
      >
        {items.map((item) => (
          <IconRailButton key={item.id} item={item} />
        ))}
      </nav>

      {footer && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 0',
            borderTop: '1px solid var(--bg-sidebar-active)',
          }}
        >
          {footer}
        </div>
      )}
    </aside>
  );
}

function IconRailButton({ item }: { item: IconRailItem }) {
  const base = {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    width: '100%',
    background: item.active ? 'var(--bg-sidebar-active)' : 'transparent',
    color: item.active ? '#ffffff' : 'var(--text-sidebar-icon)',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'none',
    boxShadow: item.active ? 'inset 3px 0 0 var(--status-info)' : 'none',
  };

  const content = (
    <>
      <Glyph name={item.icon} size={20} />
      {item.badge && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 6,
            right: 10,
            fontSize: 10,
            background: 'var(--status-danger)',
            color: '#ffffff',
            borderRadius: '50%',
            minWidth: 14,
            height: 14,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 3px',
            lineHeight: 1,
          }}
        >
          {item.badge}
        </span>
      )}
    </>
  );

  if (item.href) {
    return (
      <a
        href={item.href}
        aria-label={item.label}
        aria-current={item.active ? 'page' : undefined}
        title={item.label}
        style={base}
        onMouseEnter={(e) => {
          if (!item.active)
            (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-sidebar-hover)';
        }}
        onMouseLeave={(e) => {
          if (!item.active) (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
        }}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      aria-label={item.label}
      aria-current={item.active ? 'page' : undefined}
      title={item.label}
      onClick={item.onClick}
      style={base}
      onMouseEnter={(e) => {
        if (!item.active)
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-sidebar-hover)';
      }}
      onMouseLeave={(e) => {
        if (!item.active)
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      {content}
    </button>
  );
}

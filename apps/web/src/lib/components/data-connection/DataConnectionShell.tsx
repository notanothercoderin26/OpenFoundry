import type { ReactNode } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import { IconRail, type IconRailItem } from '@/lib/components/ui/IconRail';

export interface DataConnectionShellProps {
  children: ReactNode;
  onToggleSidebar?: () => void;
  onSearch?: () => void;
  notificationsCount?: number;
}

export function DataConnectionShell({
  children,
  onToggleSidebar,
  onSearch,
  notificationsCount,
}: DataConnectionShellProps) {
  const items: IconRailItem[] = [
    { id: 'toggle', icon: 'menu', label: 'Toggle sidebar', onClick: onToggleSidebar },
    { id: 'home', icon: 'home', label: 'Home', href: '/' },
    { id: 'search', icon: 'search', label: 'Search', onClick: onSearch },
    {
      id: 'notifications',
      icon: 'bell',
      label: 'Notifications',
      badge: notificationsCount && notificationsCount > 0 ? notificationsCount : undefined,
    },
    { id: 'messages', icon: 'mail', label: 'Messages' },
    { id: 'history', icon: 'history', label: 'Recent', href: '/recent' },
    { id: 'files', icon: 'folder', label: 'Files', href: '/files' },
    { id: 'applications', icon: 'apps-grid', label: 'Applications', href: '/applications' },
    {
      id: 'data-connection',
      icon: 'database',
      label: 'Data Connection',
      href: '/data-connection',
      active: true,
    },
    { id: 'filters', icon: 'filter', label: 'Filters' },
    { id: 'saved', icon: 'bookmark', label: 'Saved' },
  ];

  const logo = (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        background: '#F4E5D1',
        color: '#B66B1E',
        borderRadius: 4,
      }}
    >
      <Glyph name="database" size={20} tone="#B66B1E" />
    </span>
  );

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg-app)',
      }}
    >
      <IconRail items={items} header={logo} width={56} />
      <main
        style={{
          flex: 1,
          minWidth: 0,
          background: 'var(--bg-app)',
          overflowX: 'hidden',
        }}
      >
        {children}
      </main>
    </div>
  );
}

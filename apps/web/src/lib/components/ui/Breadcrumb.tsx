import { Fragment, type ReactNode } from 'react';

export interface BreadcrumbItem {
  label: ReactNode;
  href?: string;
  onClick?: () => void;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  separator?: ReactNode;
}

export function Breadcrumb({ items, separator = '›' }: BreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '6px',
        fontSize: '14px',
        color: 'var(--text-muted)',
        fontWeight: 500,
        lineHeight: 1.4,
      }}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const isInteractive = !isLast && (item.href || item.onClick);

        const labelNode = isInteractive ? (
          <a
            href={item.href ?? '#'}
            onClick={(e) => {
              if (item.onClick) {
                e.preventDefault();
                item.onClick();
              }
            }}
            style={{
              color: 'var(--text-muted)',
              textDecoration: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-link)';
              (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)';
              (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none';
            }}
          >
            {item.label}
          </a>
        ) : (
          <span
            aria-current={isLast ? 'page' : undefined}
            style={{
              color: isLast ? 'var(--text-strong)' : 'var(--text-muted)',
              fontWeight: isLast ? 600 : 500,
            }}
          >
            {item.label}
          </span>
        );

        return (
          <Fragment key={index}>
            {labelNode}
            {!isLast && (
              <span aria-hidden="true" style={{ color: 'var(--text-soft)', fontSize: '14px' }}>
                {separator}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

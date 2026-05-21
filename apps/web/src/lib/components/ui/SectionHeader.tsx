import type { ReactNode } from 'react';

import { Glyph } from './Glyph';

interface SectionHeaderProps {
  title: ReactNode;
  count?: number;
  /** Right-side action. Renders before "See all" when both are present. */
  onConfigure?: () => void;
  configureLabel?: string;
  /** Right-side "See all →" link. */
  seeAllHref?: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
  /** Custom right-side content. Replaces both Configure/See all if provided. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Foundry Discover section header.
 *
 * `[Title] [count]               [⊞ Configure]  [See all →]`
 */
export function SectionHeader({
  title,
  count,
  onConfigure,
  configureLabel = 'Configure',
  seeAllHref,
  onSeeAll,
  seeAllLabel = 'See all',
  actions,
  className,
}: SectionHeaderProps) {
  const classes = ['flex items-center gap-2 min-h-7'];
  if (className) classes.push(className);

  const seeAll = (seeAllHref || onSeeAll) && !actions;
  const configure = onConfigure && !actions;

  return (
    <div className={classes.join(' ')}>
      <h2 className="text-of-16 font-of-semibold text-of-text">{title}</h2>
      {count != null ? (
        <span className="text-of-13 text-of-text-muted tabular-nums">{count}</span>
      ) : null}
      <div className="ml-auto flex items-center gap-3">
        {configure ? (
          <button
            type="button"
            onClick={onConfigure}
            className="inline-flex items-center gap-1.5 text-of-13 font-of-medium text-of-accent hover:text-of-accent-hover"
          >
            <Glyph name="view-grid" size={14} tone="currentColor" />
            <span>{configureLabel}</span>
          </button>
        ) : null}
        {seeAll ? (
          seeAllHref ? (
            <a
              href={seeAllHref}
              className="inline-flex items-center gap-1 text-of-13 font-of-medium text-of-accent hover:text-of-accent-hover"
            >
              <span>{seeAllLabel}</span>
              <Glyph name="chevron-right" size={14} tone="currentColor" />
            </a>
          ) : (
            <button
              type="button"
              onClick={onSeeAll}
              className="inline-flex items-center gap-1 text-of-13 font-of-medium text-of-accent hover:text-of-accent-hover"
            >
              <span>{seeAllLabel}</span>
              <Glyph name="chevron-right" size={14} tone="currentColor" />
            </button>
          )
        ) : null}
        {actions}
      </div>
    </div>
  );
}

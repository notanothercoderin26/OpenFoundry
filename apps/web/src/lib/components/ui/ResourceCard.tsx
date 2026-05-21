import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

import { GroupChip } from './GroupChip';
import { ResourceIcon } from './ResourceIcon';
import { StarFavoriteButton } from './StarFavoriteButton';
import { groupColor, type GroupColor } from './groupColors';
import type { GlyphName } from './Glyph';

export interface ResourceCardGroup {
  name: string;
  count?: number;
  color?: GroupColor;
}

interface ResourceCardProps {
  name: string;
  glyph?: GlyphName;
  /** Stable color key for the icon when no explicit colour is set. */
  iconColorKey?: string;
  iconColor?: GroupColor;

  /** Top-right metric, e.g. "2k objects". */
  objectCount?: ReactNode;
  /** Sub-row, e.g. "9 dependents". */
  dependentsCount?: number;
  /** Adds the "· Prominent" marker after dependents. */
  prominent?: boolean;

  group?: ResourceCardGroup;
  description?: ReactNode;

  favorite?: boolean;
  onToggleFavorite?: (next: boolean) => void;

  href?: string;
  onClick?: () => void;
  className?: string;
}

const cardClasses = [
  'group relative flex flex-col gap-2.5 p-3 min-w-0',
  'bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card',
  'transition-colors hover:border-of-border-strong',
  'focus-within:border-of-accent focus-within:ring-2 focus-within:ring-of-accent-soft',
].join(' ');

function formatCount(count: number): string {
  if (count >= 1000) {
    const k = count / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return String(count);
}

export function ResourceCard({
  name,
  glyph = 'cube',
  iconColorKey,
  iconColor,
  objectCount,
  dependentsCount,
  prominent,
  group,
  description,
  favorite,
  onToggleFavorite,
  href,
  onClick,
  className,
}: ResourceCardProps) {
  const palette = iconColor ?? groupColor(iconColorKey ?? group?.name ?? name);
  const clickable = Boolean(href || onClick);
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onClick && !href) return;
    if ((event.target as HTMLElement).closest('button,a')) return;
    if (onClick) onClick();
    else if (href) window.location.assign(href);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!clickable) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (onClick) onClick();
      else if (href) window.location.assign(href);
    }
  };

  const classes = [cardClasses];
  if (clickable) classes.push('cursor-pointer');
  if (className) classes.push(className);

  return (
    <div
      className={classes.join(' ')}
      role={clickable ? 'link' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <ResourceIcon glyph={glyph} color={palette} size="md" tone="soft" />
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {href && !onClick ? (
              <a
                href={href}
                className="text-of-14 font-of-semibold text-of-text truncate hover:text-of-accent"
                onClick={(e) => e.stopPropagation()}
              >
                {name}
              </a>
            ) : (
              <span className="text-of-14 font-of-semibold text-of-text truncate">{name}</span>
            )}
            {onToggleFavorite ? (
              <StarFavoriteButton
                value={favorite ?? false}
                onChange={onToggleFavorite}
                size="sm"
                className="-mr-1"
              />
            ) : null}
          </div>
          {objectCount != null ? (
            <span className="text-of-12 text-of-text-muted">{objectCount}</span>
          ) : null}
        </div>
      </div>

      {(dependentsCount != null || prominent) && (
        <div className="text-of-12 text-of-text-muted">
          {dependentsCount != null ? `${dependentsCount} dependents` : null}
          {prominent ? <span className="ml-1">· Prominent</span> : null}
        </div>
      )}

      {group ? (
        <div className="border-t border-of-border pt-2">
          <GroupChip
            name={group.name}
            count={group.count}
            color={group.color}
            colorKey={group.name}
            size="sm"
          />
        </div>
      ) : null}

      {description ? (
        <p
          className="text-of-13 text-of-text-muted overflow-hidden"
          style={{
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
          }}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

ResourceCard.formatCount = formatCount;

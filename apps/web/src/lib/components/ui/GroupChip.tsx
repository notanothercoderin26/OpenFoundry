import { groupColor, type GroupColor } from './groupColors';

interface GroupChipProps {
  name: string;
  count?: number;
  color?: GroupColor;
  /** Stable key when no explicit color is provided. Defaults to `name`. */
  colorKey?: string | null;
  size?: 'sm' | 'md';
  onClick?: () => void;
  className?: string;
}

const SIZE_TILE_PX = { sm: 12, md: 14 } as const;
const SIZE_TEXT = { sm: 'text-of-12', md: 'text-of-13' } as const;
const SIZE_PADDING = { sm: 'px-1.5 py-0.5', md: 'px-2 py-1' } as const;

/**
 * Foundry-style group chip: a 2×2 tile mosaic + name + optional count.
 *
 * The four tiles come from `color.chipColors`, derived deterministically from
 * the group name in `groupColor()` so the chip looks identical every render.
 */
export function GroupChip({
  name,
  count,
  color,
  colorKey,
  size = 'md',
  onClick,
  className,
}: GroupChipProps) {
  const palette = color ?? groupColor(colorKey ?? name);
  const tile = SIZE_TILE_PX[size];
  const Tag = onClick ? 'button' : 'span';
  const classes = [
    'inline-flex items-center gap-1.5 font-of-medium text-of-text',
    SIZE_TEXT[size],
    SIZE_PADDING[size],
    'rounded-of-sm border border-of-border bg-of-surface-raised',
  ];
  if (onClick) classes.push('cursor-pointer hover:border-of-border-strong');
  if (className) classes.push(className);

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={classes.join(' ')}
      aria-label={count != null ? `${name}, ${count} items` : name}
    >
      <span
        className="grid shrink-0 overflow-hidden rounded-of-sm"
        style={{
          width: tile,
          height: tile,
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
          gap: 1,
          background: '#fff',
        }}
        aria-hidden
      >
        {palette.chipColors.map((c, i) => (
          <span key={i} style={{ background: c }} />
        ))}
      </span>
      <span className="truncate">{name}</span>
      {count != null ? (
        <span className="text-of-text-muted font-of-regular tabular-nums">{count}</span>
      ) : null}
    </Tag>
  );
}

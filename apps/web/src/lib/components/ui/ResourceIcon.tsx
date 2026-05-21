import { Glyph, type GlyphName } from './Glyph';
import { groupColor, type GroupColor } from './groupColors';

export type ResourceIconSize = 'xs' | 'sm' | 'md' | 'lg';
export type ResourceIconTone = 'soft' | 'solid';

const SIZE_PX: Record<ResourceIconSize, number> = {
  xs: 20,
  sm: 24,
  md: 32,
  lg: 40,
};

const GLYPH_PX: Record<ResourceIconSize, number> = {
  xs: 12,
  sm: 14,
  md: 18,
  lg: 22,
};

const RADIUS_PX: Record<ResourceIconSize, number> = {
  xs: 3,
  sm: 4,
  md: 4,
  lg: 6,
};

interface ResourceIconProps {
  glyph?: GlyphName;
  /** Stable key (group name / RID). Used when no explicit `color` is passed. */
  colorKey?: string | null;
  /** Override the derived color. */
  color?: GroupColor;
  size?: ResourceIconSize;
  tone?: ResourceIconTone;
  className?: string;
  title?: string;
}

export function ResourceIcon({
  glyph = 'cube',
  colorKey,
  color,
  size = 'md',
  tone = 'soft',
  className,
  title,
}: ResourceIconProps) {
  const palette = color ?? groupColor(colorKey ?? glyph);
  const px = SIZE_PX[size];
  const isSolid = tone === 'solid';
  const background = isSolid ? palette.base : palette.soft;
  const foreground = isSolid ? palette.fg : palette.base;
  const classes = ['inline-flex items-center justify-center shrink-0'];
  if (className) classes.push(className);

  return (
    <span
      className={classes.join(' ')}
      style={{
        width: px,
        height: px,
        borderRadius: RADIUS_PX[size],
        background,
        color: foreground,
      }}
      title={title}
      aria-hidden={title ? undefined : true}
    >
      <Glyph name={glyph} size={GLYPH_PX[size]} tone={foreground} />
    </span>
  );
}

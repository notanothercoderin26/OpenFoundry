import { Glyph } from './Glyph';

interface StarFavoriteButtonProps {
  value: boolean;
  onChange: (next: boolean) => void;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
  /** Stop propagation on click — useful when the button sits inside a clickable card. */
  stopPropagation?: boolean;
}

const SIZE_BUTTON_PX = { sm: 22, md: 26, lg: 30 } as const;
const SIZE_GLYPH_PX = { sm: 14, md: 16, lg: 20 } as const;

const ACTIVE = '#facc15';
const INACTIVE = '#cdd2d8';
const HOVER = '#5f6b7c';

export function StarFavoriteButton({
  value,
  onChange,
  size = 'md',
  label,
  className,
  stopPropagation = true,
}: StarFavoriteButtonProps) {
  const classes = [
    'inline-flex items-center justify-center rounded-of-sm transition-colors',
    'hover:bg-of-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-of-accent-soft',
  ];
  if (className) classes.push(className);

  return (
    <button
      type="button"
      aria-pressed={value}
      aria-label={label ?? (value ? 'Remove from favorites' : 'Add to favorites')}
      title={label ?? (value ? 'Remove from favorites' : 'Add to favorites')}
      onClick={(event) => {
        if (stopPropagation) event.stopPropagation();
        onChange(!value);
      }}
      style={{
        width: SIZE_BUTTON_PX[size],
        height: SIZE_BUTTON_PX[size],
        color: value ? ACTIVE : INACTIVE,
      }}
      className={classes.join(' ')}
      onMouseEnter={(e) => {
        if (!value) e.currentTarget.style.color = HOVER;
      }}
      onMouseLeave={(e) => {
        if (!value) e.currentTarget.style.color = INACTIVE;
      }}
    >
      <Glyph name={value ? 'star-filled' : 'star'} size={SIZE_GLYPH_PX[size]} />
    </button>
  );
}

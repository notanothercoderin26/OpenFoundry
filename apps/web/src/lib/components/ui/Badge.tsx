import type { ReactNode } from 'react';

import { Glyph, type GlyphName } from './Glyph';

export type BadgeVariant =
  | 'title'
  | 'primary-key'
  | 'experimental'
  | 'active'
  | 'visibility-normal'
  | 'visibility-hidden'
  | 'visibility-prominent'
  | 'disabled'
  | 'not-indexed';

interface BadgeStyle {
  label: string;
  bg: string;
  fg: string;
  border?: string;
  glyph?: GlyphName;
}

const VARIANTS: Record<BadgeVariant, BadgeStyle> = {
  title: {
    label: 'Title',
    bg: '#e8f0fb',
    fg: '#215db0',
  },
  'primary-key': {
    label: 'Primary key',
    bg: '#f3e8ff',
    fg: '#7c3aed',
  },
  experimental: {
    label: 'Experimental',
    bg: '#fff3df',
    fg: '#9a5b00',
  },
  active: {
    label: 'Active',
    bg: '#e8f6ec',
    fg: '#1d8348',
  },
  'visibility-normal': {
    label: 'Normal',
    bg: '#e8f0fb',
    fg: '#215db0',
    glyph: 'eye',
  },
  'visibility-hidden': {
    label: 'Hidden',
    bg: '#eef0f3',
    fg: '#5f6b7c',
    glyph: 'eye',
  },
  'visibility-prominent': {
    label: 'Prominent',
    bg: '#fef3c7',
    fg: '#a16207',
    glyph: 'star-filled',
  },
  disabled: {
    label: 'Disabled',
    bg: '#eef0f3',
    fg: '#5f6b7c',
  },
  'not-indexed': {
    label: 'Not indexed on branch',
    bg: '#ffedd5',
    fg: '#9a5b00',
  },
};

interface BadgeProps {
  variant: BadgeVariant;
  /** Override the default label for the variant (rare). */
  children?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

const SIZE_TEXT = { sm: 'text-of-12', md: 'text-of-13' } as const;
const SIZE_PADDING = { sm: 'px-1.5 py-0.5', md: 'px-2 py-0.5' } as const;
const SIZE_GLYPH = { sm: 12, md: 14 } as const;

export function Badge({ variant, children, size = 'sm', className }: BadgeProps) {
  const style = VARIANTS[variant];
  const classes = [
    'inline-flex items-center gap-1 rounded-of-sm font-of-medium whitespace-nowrap',
    SIZE_TEXT[size],
    SIZE_PADDING[size],
  ];
  if (style.border) {
    classes.push('border');
  }
  if (className) classes.push(className);
  return (
    <span
      className={classes.join(' ')}
      style={{
        background: style.bg,
        color: style.fg,
        borderColor: style.border,
      }}
    >
      {style.glyph ? <Glyph name={style.glyph} size={SIZE_GLYPH[size]} tone={style.fg} /> : null}
      <span>{children ?? style.label}</span>
    </span>
  );
}

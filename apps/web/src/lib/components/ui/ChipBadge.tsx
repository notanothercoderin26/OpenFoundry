import type { ReactNode } from 'react';

export type ChipBadgeVariant =
  | 'default'
  | 'recommended'
  | 'reversible'
  | 'healthy'
  | 'experimental'
  | 'legacy';

interface ChipBadgeProps {
  variant?: ChipBadgeVariant;
  children: ReactNode;
  uppercase?: boolean;
}

interface VariantStyle {
  background: string;
  color: string;
}

const VARIANT_STYLES: Record<ChipBadgeVariant, VariantStyle> = {
  default: {
    background: 'var(--bg-chip)',
    color: 'var(--text-default)',
  },
  recommended: {
    background: 'var(--chip-recommended-bg)',
    color: 'var(--chip-recommended-text)',
  },
  reversible: {
    background: 'var(--chip-reversible-bg)',
    color: 'var(--chip-reversible-text)',
  },
  healthy: {
    background: 'var(--badge-healthy-bg)',
    color: 'var(--badge-healthy-text)',
  },
  experimental: {
    background: 'var(--chip-experimental-bg)',
    color: 'var(--chip-experimental-text)',
  },
  legacy: {
    background: 'var(--status-warning-bg)',
    color: 'var(--status-warning)',
  },
};

export function ChipBadge({ variant = 'default', children, uppercase = false }: ChipBadgeProps) {
  const palette = VARIANT_STYLES[variant];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '10px',
        fontSize: '11px',
        fontWeight: 600,
        lineHeight: 1.4,
        textTransform: uppercase ? 'uppercase' : 'none',
        letterSpacing: uppercase ? '0.04em' : 'normal',
        background: palette.background,
        color: palette.color,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

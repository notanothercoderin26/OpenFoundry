import type { Config } from 'tailwindcss';

/**
 * Tailwind v4 reads design tokens from the `@theme` block in
 * `src/styles/app.css`. This config is kept for IDE/docs and for tooling
 * that introspects tailwind.config.* — it mirrors the same tokens so they
 * show up in autocomplete.
 *
 * Foundry-style tokens are namespaced under `of-*` to avoid colliding with
 * existing utilities already used across ~340 components.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}', './tests/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        of: {
          surface: '#f6f7f9',
          'surface-raised': '#ffffff',
          'surface-muted': '#f0f2f5',
          canvas: '#f6f7f9',
          border: '#e5e8eb',
          'border-strong': '#cdd2d8',
          'border-focus': '#215db0',
          text: '#1c2127',
          'text-muted': '#5f6b7c',
          'text-soft': '#8b95a4',
          'text-inverse': '#ffffff',
          accent: '#215db0',
          'accent-hover': '#184a8a',
          'accent-soft': '#e8f0fb',
          'accent-strong': '#2d72d2',
          success: '#1d8348',
          'success-soft': '#e8f6ec',
          warning: '#9a5b00',
          'warning-soft': '#fff3df',
          danger: '#b42318',
          'danger-soft': '#fde7e7',
          info: '#215db0',
          'info-soft': '#e8f0fb',
        },
      },
      fontSize: {
        'of-12': ['12px', { lineHeight: '16px' }],
        'of-13': ['13px', { lineHeight: '18px' }],
        'of-14': ['14px', { lineHeight: '20px' }],
        'of-16': ['16px', { lineHeight: '22px' }],
        'of-20': ['20px', { lineHeight: '26px' }],
        'of-24': ['24px', { lineHeight: '30px' }],
      },
      fontWeight: {
        'of-regular': '400',
        'of-medium': '500',
        'of-semibold': '600',
      },
      borderRadius: {
        'of-sm': '3px',
        'of-md': '4px',
        'of-lg': '6px',
      },
      boxShadow: {
        'of-none': '0 0 #0000',
        'of-sm': '0 1px 0 rgba(17, 24, 39, 0.04)',
        'of-card': '0 1px 0 rgba(17, 24, 39, 0.04)',
        'of-popover': '0 6px 18px rgba(17, 24, 39, 0.12)',
      },
    },
  },
  plugins: [],
};

export default config;

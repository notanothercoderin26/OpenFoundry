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
        // Notepad redesign semantic tokens (T0.2). Generates
        // `bg-surface-app`, `text-accent-link`, `border-toolbar-border`,
        // `bg-chip-bg-document`, etc. Mirrors the @theme block in
        // src/styles/app.css.
        'surface-app': '#f6f7f9',
        'surface-panel': '#ffffff',
        'surface-panel-muted': '#f4f6f8',
        'surface-sidebar': '#20262d',
        'surface-sidebar-hover': '#2b323b',
        'surface-sidebar-active': '#151a20',
        'toolbar-bg': '#ffffff',
        'toolbar-border': '#e5e8eb',
        'accent-primary': '#137f4d',
        'accent-primary-hover': '#0f6a3f',
        'accent-primary-active': '#0c5634',
        'accent-primary-contrast': '#ffffff',
        'accent-link': '#215db0',
        'accent-link-hover': '#184a8a',
        'accent-danger': '#b42318',
        'chip-bg': '#eef0f3',
        'chip-text': '#1c2127',
        'chip-bg-document': '#e6efff',
        'chip-text-document': '#1f5ea8',
        'chip-bg-template': '#ececf2',
        'chip-text-template': '#4a5160',
        'row-hover': '#f3f5f8',
        'row-selected': '#e8f0fb',
      },
      fontFamily: {
        'sans-neutral': [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'system-ui',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        'of-12': ['12px', { lineHeight: '16px' }],
        'of-13': ['13px', { lineHeight: '18px' }],
        'of-14': ['14px', { lineHeight: '20px' }],
        'of-16': ['16px', { lineHeight: '22px' }],
        'of-20': ['20px', { lineHeight: '26px' }],
        'of-24': ['24px', { lineHeight: '30px' }],
        // Notepad redesign 11/12/13/14/15/18/24/28 scale (T0.2).
        // Unprefixed so JSX can write `text-13` directly.
        11: ['11px', { lineHeight: '14px' }],
        12: ['12px', { lineHeight: '16px' }],
        13: ['13px', { lineHeight: '18px' }],
        14: ['14px', { lineHeight: '20px' }],
        15: ['15px', { lineHeight: '22px' }],
        18: ['18px', { lineHeight: '24px' }],
        24: ['24px', { lineHeight: '30px' }],
        28: ['28px', { lineHeight: '34px' }],
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

import type { ReactNode } from 'react';

import { Glyph, type GlyphName } from './Glyph';

export interface TabBarItem<T extends string> {
  id: T;
  label: ReactNode;
  count?: number;
  glyph?: GlyphName;
  disabled?: boolean;
}

interface TabBarProps<T extends string> {
  tabs: ReadonlyArray<TabBarItem<T>>;
  active: T;
  onChange: (next: T) => void;
  className?: string;
  /** Right-aligned content rendered next to the tab list. */
  trailing?: ReactNode;
}

/**
 * Foundry-style horizontal tab bar: plain text labels with a blue underline
 * on the active tab. Optional count badges and glyphs.
 */
export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
  className,
  trailing,
}: TabBarProps<T>) {
  const classes = ['flex items-end gap-1 border-b border-of-border'];
  if (className) classes.push(className);

  return (
    <div className={classes.join(' ')} role="tablist">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        const tabClasses = [
          'inline-flex items-center gap-2 px-3 h-9 -mb-px border-b-2',
          'text-of-13 font-of-medium whitespace-nowrap transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-of-accent-soft',
        ];
        if (selected) {
          tabClasses.push('border-of-accent text-of-accent');
        } else {
          tabClasses.push('border-transparent text-of-text-muted hover:text-of-text');
        }
        if (tab.disabled) tabClasses.push('opacity-50 cursor-not-allowed');

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.id)}
            className={tabClasses.join(' ')}
          >
            {tab.glyph ? <Glyph name={tab.glyph} size={14} tone="currentColor" /> : null}
            <span>{tab.label}</span>
            {tab.count != null ? (
              <span
                className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-of-sm text-of-12 font-of-semibold tabular-nums ${
                  selected
                    ? 'bg-of-accent-soft text-of-accent'
                    : 'bg-of-surface-muted text-of-text-muted'
                }`}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
      {trailing ? <div className="ml-auto flex items-center gap-2 pb-1">{trailing}</div> : null}
    </div>
  );
}

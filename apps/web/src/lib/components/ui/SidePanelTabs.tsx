import type { ReactNode } from 'react';

export interface SidePanelTab<T extends string> {
  id: T;
  label: ReactNode;
  disabled?: boolean;
}

interface SidePanelTabsProps<T extends string> {
  tabs: ReadonlyArray<SidePanelTab<T>>;
  active: T;
  onChange: (next: T) => void;
  className?: string;
}

/**
 * Compact tab bar for property/action side panels.
 *
 * Looks like Foundry's General / Display / Interaction / Details / Advanced
 * row inside the property editor drawer — denser than {@link TabBar}, with
 * smaller padding and a thinner underline.
 */
export function SidePanelTabs<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: SidePanelTabsProps<T>) {
  const classes = ['flex items-end border-b border-of-border'];
  if (className) classes.push(className);

  return (
    <div className={classes.join(' ')} role="tablist">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        const cls = [
          'inline-flex items-center px-2.5 h-8 -mb-px border-b-2',
          'text-of-13 font-of-medium whitespace-nowrap transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-of-accent-soft',
        ];
        if (selected) {
          cls.push('border-of-accent text-of-accent');
        } else {
          cls.push('border-transparent text-of-text-muted hover:text-of-text');
        }
        if (tab.disabled) cls.push('opacity-50 cursor-not-allowed');
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.id)}
            className={cls.join(' ')}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

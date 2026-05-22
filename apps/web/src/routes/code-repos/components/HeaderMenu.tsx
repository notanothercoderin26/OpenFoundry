import { useRef, useState, type ReactNode } from 'react';

import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';
import { Popover, type PopoverAlign } from '@/lib/components/ui/Popover';

export interface HeaderMenuItem {
  /** Stable id so React can key the entry. */
  id: string;
  label: string;
  description?: string;
  glyph?: GlyphName;
  shortcut?: string;
  disabled?: boolean;
  /** Set to true to render a horizontal separator below this item. */
  separator?: boolean;
  /** Fired when the item is activated; the popover closes immediately after. */
  onSelect?: () => void;
}

interface HeaderMenuProps {
  /** Text shown on the trigger button. Required unless iconOnly is true. */
  label?: ReactNode;
  /** Optional leading glyph on the trigger. */
  glyph?: GlyphName;
  /** Optional trailing chevron — defaults to true. */
  showChevron?: boolean;
  /** Render the trigger as an icon-only button. */
  iconOnly?: boolean;
  /** Title / aria-label for the trigger. */
  title?: string;
  items: ReadonlyArray<HeaderMenuItem>;
  /** Popover alignment relative to the trigger. */
  align?: PopoverAlign;
  width?: number;
  /** Optional render-prop appended below the standard items. */
  footer?: ReactNode;
}

/**
 * Trigger + popover menu used for the File / Help / Clone dropdowns in the
 * Code Repositories header. Behaviour is light: click to open, click an
 * item to fire its handler and close, Escape / outside-click to dismiss.
 */
export function HeaderMenu({
  label,
  glyph,
  showChevron = true,
  iconOnly = false,
  title,
  items,
  align = 'start',
  width = 240,
  footer,
}: HeaderMenuProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  const triggerClasses = iconOnly
    ? 'inline-flex items-center justify-center w-8 h-8 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text'
    : 'inline-flex items-center gap-1 h-8 px-2 rounded-of-sm text-of-12 font-of-medium text-of-text-muted hover:bg-of-surface-muted hover:text-of-text';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        className={triggerClasses}
        onClick={() => setOpen((value) => !value)}
      >
        {glyph ? <Glyph name={glyph} size={iconOnly ? 16 : 14} tone="currentColor" /> : null}
        {iconOnly ? null : <span>{label}</span>}
        {showChevron && !iconOnly ? (
          <Glyph name="chevron-down" size={12} tone="currentColor" />
        ) : null}
      </button>

      <Popover
        open={open}
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
        placement="bottom"
        align={align}
        offset={6}
        width={width}
        showArrow={false}
        ariaLabel={typeof label === 'string' ? label : title ?? 'Menu'}
      >
        <ul role="menu" className="py-1">
          {items.map((item) => (
            <li key={item.id} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  item.onSelect?.();
                  setOpen(false);
                }}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-left text-of-13 ${
                  item.disabled
                    ? 'text-of-text-soft cursor-not-allowed'
                    : 'text-of-text hover:bg-of-surface-muted focus:bg-of-surface-muted focus:outline-none'
                }`}
              >
                {item.glyph ? <Glyph name={item.glyph} size={14} tone="currentColor" /> : null}
                <span className="flex-1 min-w-0 truncate">{item.label}</span>
                {item.shortcut ? (
                  <kbd className="text-of-12 text-of-text-soft font-mono">{item.shortcut}</kbd>
                ) : null}
              </button>
              {item.description ? (
                <p className="px-3 pb-1.5 -mt-0.5 text-of-12 text-of-text-soft">{item.description}</p>
              ) : null}
              {item.separator ? <hr className="my-1 border-of-border" /> : null}
            </li>
          ))}
        </ul>
        {footer ? <div className="px-3 pb-2 pt-1 border-t border-of-border">{footer}</div> : null}
      </Popover>
    </>
  );
}

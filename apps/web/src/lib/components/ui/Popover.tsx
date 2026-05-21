import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export type PopoverPlacement = 'bottom' | 'top' | 'left' | 'right';
export type PopoverAlign = 'start' | 'center' | 'end';

interface PopoverProps {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  placement?: PopoverPlacement;
  align?: PopoverAlign;
  offset?: number;
  width?: number;
  showArrow?: boolean;
  ariaLabel?: string;
  children: ReactNode;
}

const ARROW_SIZE = 10;

export function Popover({
  open,
  anchorRef,
  onClose,
  placement = 'bottom',
  align = 'end',
  offset = 8,
  width = 320,
  showArrow = true,
  ariaLabel,
  children,
}: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; arrowOffset: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    if (!anchor) return;

    function reposition() {
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      let top = 0;
      let left = 0;
      let arrowOffset = width / 2;

      if (placement === 'bottom' || placement === 'top') {
        if (align === 'start') left = rect.left;
        else if (align === 'end') left = rect.right - width;
        else left = rect.left + rect.width / 2 - width / 2;

        top = placement === 'bottom' ? rect.bottom + offset : rect.top - offset;

        const anchorCenter = rect.left + rect.width / 2;
        arrowOffset = Math.max(16, Math.min(width - 16, anchorCenter - left));
      } else {
        if (align === 'start') top = rect.top;
        else if (align === 'end') top = rect.bottom;
        else top = rect.top + rect.height / 2;
        left = placement === 'right' ? rect.right + offset : rect.left - offset;
      }

      setCoords({ top, left, arrowOffset });
    }

    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, anchorRef, placement, align, offset, width]);

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }

    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open, anchorRef, onClose]);

  if (!open || !coords) return null;

  const isBottom = placement === 'bottom';
  const isTop = placement === 'top';

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={ariaLabel}
      aria-modal="false"
      style={{
        position: 'fixed',
        top: isTop ? undefined : coords.top,
        bottom: isTop ? window.innerHeight - coords.top : undefined,
        left: coords.left,
        width,
        background: 'var(--bg-default)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-popover)',
        zIndex: 95,
        padding: 0,
      }}
    >
      {showArrow && (isBottom || isTop) && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: isBottom ? -ARROW_SIZE / 2 - 1 : undefined,
            bottom: isTop ? -ARROW_SIZE / 2 - 1 : undefined,
            left: coords.arrowOffset - ARROW_SIZE / 2,
            width: ARROW_SIZE,
            height: ARROW_SIZE,
            background: 'var(--bg-default)',
            borderTop: isBottom ? '1px solid var(--border-default)' : 'none',
            borderLeft: isBottom ? '1px solid var(--border-default)' : 'none',
            borderRight: isTop ? '1px solid var(--border-default)' : 'none',
            borderBottom: isTop ? '1px solid var(--border-default)' : 'none',
            transform: 'rotate(45deg)',
          }}
        />
      )}
      {children}
    </div>
  );
}

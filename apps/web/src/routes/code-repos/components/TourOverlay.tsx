import { useEffect, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

import { tour, useTour } from '../state/useTour';

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function rectFor(selector: string): TargetRect | null {
  if (typeof window === 'undefined') return null;
  const element = document.querySelector(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

/**
 * Step-by-step IDE walkthrough. Highlights the target element by
 * carving a hole out of a dimmed overlay and anchors a popover with the
 * step's title + description + Next / Previous / Skip controls. Persists
 * completion through useTour so users only see the tour once unless they
 * trigger it again from the Help menu.
 */
export function TourOverlay() {
  const { active, stepIndex } = useTour();
  const [rect, setRect] = useState<TargetRect | null>(null);

  const step = active ? tour.steps[stepIndex] : null;

  useEffect(() => {
    if (!step) {
      setRect(null);
      return;
    }
    function reposition() {
      if (!step) return;
      setRect(rectFor(step.selector));
    }
    // Two ticks because some target elements (Helper panel body, status
    // bar) are populated by lazy renders.
    reposition();
    const id = window.setTimeout(reposition, 80);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [step]);

  useEffect(() => {
    if (!active) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') tour.skip();
      if (event.key === 'ArrowRight') tour.next();
      if (event.key === 'ArrowLeft') tour.previous();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  if (!step) return null;

  const padding = 6;
  const target = rect
    ? {
        top: Math.max(0, rect.top - padding),
        left: Math.max(0, rect.left - padding),
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      }
    : null;

  // Place the popover below the target if possible, otherwise above.
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720;
  const placeBelow = !target || target.top + target.height + 180 < viewportHeight;
  const popoverTop = target
    ? placeBelow
      ? target.top + target.height + 12
      : Math.max(12, target.top - 12 - 180)
    : 80;
  const popoverLeft = target
    ? Math.max(12, Math.min(window.innerWidth - 360 - 12, target.left))
    : window.innerWidth / 2 - 180;

  const isLast = stepIndex === tour.steps.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="IDE walkthrough"
      style={{ position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'none' }}
    >
      {target ? (
        <>
          {/* Top */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: target.top,
              background: 'rgba(2,6,23,0.55)',
              pointerEvents: 'auto',
            }}
            onClick={() => tour.skip()}
          />
          {/* Left */}
          <div
            style={{
              position: 'absolute',
              top: target.top,
              left: 0,
              width: target.left,
              height: target.height,
              background: 'rgba(2,6,23,0.55)',
              pointerEvents: 'auto',
            }}
            onClick={() => tour.skip()}
          />
          {/* Right */}
          <div
            style={{
              position: 'absolute',
              top: target.top,
              left: target.left + target.width,
              right: 0,
              height: target.height,
              background: 'rgba(2,6,23,0.55)',
              pointerEvents: 'auto',
            }}
            onClick={() => tour.skip()}
          />
          {/* Bottom */}
          <div
            style={{
              position: 'absolute',
              top: target.top + target.height,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(2,6,23,0.55)',
              pointerEvents: 'auto',
            }}
            onClick={() => tour.skip()}
          />
          {/* Outline ring */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: target.top,
              left: target.left,
              width: target.width,
              height: target.height,
              border: '2px solid #2d72d2',
              borderRadius: 6,
              boxShadow: '0 0 0 4px rgba(45, 114, 210, 0.25)',
              pointerEvents: 'none',
            }}
          />
        </>
      ) : (
        <div
          style={{ position: 'absolute', inset: 0, background: 'rgba(2,6,23,0.6)', pointerEvents: 'auto' }}
          onClick={() => tour.skip()}
        />
      )}

      <section
        style={{
          position: 'absolute',
          top: popoverTop,
          left: popoverLeft,
          width: 360,
          background: 'var(--bg-default)',
          border: '1px solid var(--of-border)',
          borderRadius: 8,
          boxShadow: '0 24px 48px rgba(2,6,23,0.35)',
          padding: 16,
          pointerEvents: 'auto',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-of-accent text-white text-of-12 font-of-semibold">
            {stepIndex + 1}
          </span>
          <p className="text-of-13 font-of-semibold text-of-text">{step.title}</p>
          <span className="ml-auto text-of-12 text-of-text-soft">
            {stepIndex + 1} / {tour.steps.length}
          </span>
        </div>
        <p className="mt-2 text-of-13 text-of-text-muted">{step.description}</p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => tour.skip()}
            className="inline-flex items-center h-7 px-2 rounded-of-sm text-of-12 text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
          >
            Skip tour
          </button>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => tour.previous()}
              disabled={stepIndex === 0}
              className={`inline-flex items-center gap-1 h-7 px-2 rounded-of-sm text-of-12 font-of-medium ${
                stepIndex === 0
                  ? 'text-of-text-soft cursor-not-allowed'
                  : 'text-of-text hover:bg-of-surface-muted'
              }`}
            >
              <Glyph name="chevron-left" size={10} tone="currentColor" />
              Previous
            </button>
            <button
              type="button"
              onClick={() => (isLast ? tour.finish() : tour.next())}
              className="inline-flex items-center gap-1 h-7 px-2 rounded-of-sm text-of-12 font-of-medium bg-of-accent text-white hover:bg-of-accent-hover"
            >
              {isLast ? 'Finish' : 'Next'}
              {!isLast ? <Glyph name="chevron-right" size={10} tone="currentColor" /> : null}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// Lazy-mount hook for the EmbeddedModuleRenderer. Returns true once
// the supplied element has entered the viewport. Used to defer
// fetching + provider construction for embedded modules until they
// scroll into view (matches Palantir's lazy embedded-module init).
//
// When `enabled` is false, the hook returns true immediately so loop
// layouts and inspectors can opt out of lazy mounting.

import { useEffect, useState, type RefObject } from 'react';

export function useEmbeddedLazyMount(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
): boolean {
  const [visible, setVisible] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      if (!visible) setVisible(true);
      return;
    }
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      // SSR or older browsers — fall back to eager mount.
      setVisible(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            return;
          }
        }
      },
      { rootMargin: '120px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // visible is intentionally excluded — once we flip to true we
    // don't want to re-observe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ref]);

  return visible;
}

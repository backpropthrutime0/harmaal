import { useCallback, useSyncExternalStore } from 'react';

/**
 * Reactively reports whether the viewport is narrower than `breakpoint` (px).
 *
 * Defaults to Tailwind's `md` breakpoint (768px) so `useIsMobile()` is true on
 * phones and portrait tablets — the same threshold the app shell uses to swap
 * the sidebar for the hamburger drawer.
 *
 * Backed by `useSyncExternalStore` over a `matchMedia` query: no effect, no
 * first-paint flash, SSR/jsdom-safe (falls back to `false` when `matchMedia`
 * is unavailable), and it re-subscribes cleanly when `breakpoint` changes.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const query = `(max-width: ${breakpoint - 1}px)`;

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
      }
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

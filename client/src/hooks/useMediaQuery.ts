import { useState, useEffect } from 'react';

/**
 * Subscribe to a media query.
 *
 * Returns `false` during the first render pass so server-rendered markup and the
 * first client render agree; the effect corrects it immediately after. The
 * alternative -- reading `matchMedia` in a lazy `useState` initialiser -- makes
 * the very first paint differ between environments, which React reports as a
 * hydration mismatch.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const media = window.matchMedia(query);
    setMatches(media.matches);

    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

/*
 * The breakpoint wrappers that used to live here -- useIsMobile, useIsTablet,
 * useIsDesktop, useIsLargeDesktop, useReducedMotion, usePrefersDarkMode -- had no
 * callers. Two problems with keeping them: they hardcoded pixel values that had
 * already drifted from `tailwind.config.js` (which declares its own `xs: 420px`
 * and the standard scale), and a breakpoint expressed twice cannot be changed in
 * one place. Call `useMediaQuery` with the query you need, and take the value
 * from the Tailwind config.
 */

/**
 * Tracks the browser's online status.
 *
 * `navigator.onLine` reports whether the machine has a working network
 * interface, not whether the API is actually reachable, but it is the cheapest
 * available signal and the right one for deciding whether to warn the user.
 * Needs its own `online`/`offline` listeners -- a media query never changes with
 * connectivity, so it cannot be used here.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    // Re-sync on mount: the browser can have gone offline between the lazy
    // initialiser and this effect running.
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return isOnline;
}
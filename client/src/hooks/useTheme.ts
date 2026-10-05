import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'mangaud.theme';

/**
 * Resolve the initial theme.
 *
 * Order: an explicit saved choice, then the OS preference. The saved value
 * wins in both directions, which is the whole point of having a toggle — a user
 * who prefers dark on a light-mode laptop needs a way to say so.
 */
const resolveInitial = (): Theme => {
  if (typeof window === 'undefined') return 'light';

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Private browsing or a blocked-cookies setting. Fall through to the OS.
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const apply = (theme: Theme) => {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  // Keeps the browser's own UI (address bar on mobile, form controls, scrollbars)
  // in step with the page.
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#0D121B' : '#FAF7F2');
  }
};

/**
 * Theme control.
 *
 * The class is also applied by a blocking inline script in index.html before
 * React mounts. That script is what prevents the white flash on a dark-mode
 * reload; this hook is what keeps the class in sync afterwards.
 */
export function useTheme(): {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
} {
  const [theme, setThemeState] = useState<Theme>(resolveInitial);

  // Adopt whatever the inline script already decided, so the two cannot
  // disagree about what is on screen.
  useEffect(() => {
    const onDocument = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    setThemeState(onDocument);

    // Follow the OS only while the user has not made an explicit choice.
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      if (stored) return;
      const next: Theme = event.matches ? 'dark' : 'light';
      apply(next);
      setThemeState(next);
    };

    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    apply(next);
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A failed write only means the choice will not survive a reload.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
  }, [setTheme]);

  return { theme, setTheme, toggleTheme };
}

export default useTheme;
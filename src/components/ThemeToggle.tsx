'use client';

import { useSyncExternalStore } from 'react';
import { Sun, Moon } from 'lucide-react';

type Theme = 'dark' | 'light';

// Same key as the init script in app/layout.tsx, which applies the theme before first paint
const STORAGE_KEY = 'aicssyc_theme';

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

function getTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export default function ThemeToggle({ className = '' }: { className?: string }) {
  // null on the server: render a same-size placeholder so the header doesn't shift
  const theme = useSyncExternalStore<Theme | null>(subscribe, getTheme, () => null);

  const toggleTheme = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    const root = document.documentElement.classList;
    root.remove('light', 'dark');
    root.add(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the theme still applies for this visit
    }
  };

  const label = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';

  return (
    <button
      onClick={toggleTheme}
      type="button"
      disabled={theme === null}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-muted transition-colors hover:border-line-strong hover:text-ink cursor-pointer ${className}`}
      title={label}
      aria-label={label}
    >
      {theme === 'light' ? (
        <Moon className="h-5 w-5" aria-hidden="true" />
      ) : theme === 'dark' ? (
        <Sun className="h-5 w-5" aria-hidden="true" />
      ) : null}
    </button>
  );
}

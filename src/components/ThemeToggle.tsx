'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('aicssyc_theme') as 'dark' | 'light' | null;
    const initial = saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const applyTheme = (t: 'dark' | 'light') => {
    const root = document.documentElement;
    if (t === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
      document.body.classList.add('light');
      document.body.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    }
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('aicssyc_theme', next);
    applyTheme(next);
  };

  if (!mounted) return null;

  return (
    <button
      onClick={toggleTheme}
      type="button"
      className={`inline-flex items-center gap-2 px-3 py-1.5 border border-cyber-cyan/50 bg-cyber-panel text-cyber-cyan hover:border-cyber-cyan hover:bg-cyber-cyan/10 transition-all font-mono text-xs tracking-wider cyber-button-border cursor-pointer select-none shadow-sm ${className}`}
      title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
      aria-label="Toggle Theme Mode"
    >
      {theme === 'dark' ? (
        <>
          <Sun className="w-4 h-4 text-cyber-yellow" />
          <span className="font-bold tracking-widest text-[11px]">LIGHT</span>
        </>
      ) : (
        <>
          <Moon className="w-4 h-4 text-cyber-cyan" />
          <span className="font-bold tracking-widest text-[11px]">DARK</span>
        </>
      )}
    </button>
  );
}

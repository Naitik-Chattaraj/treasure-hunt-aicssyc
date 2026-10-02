'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, KeyRound, LogIn, ShieldCheck } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        router.push('/admin');
      } else {
        setError(data.error || 'Incorrect password.');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="bg-map min-h-dvh text-ink flex flex-col items-center justify-center px-4 pt-16 pb-10 sm:py-16">
      <div className="fixed top-3 right-3 z-20 sm:top-4 sm:right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm rounded-xl border border-line bg-surface parchment p-5 shadow-raised sm:p-8">
        <header className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
            <ShieldCheck className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold">Organizer login</h1>
          <p className="mt-1 text-sm text-muted">Mission control for the AICSSYC hunt</p>
        </header>

        {error && (
          <div role="alert" className="mb-5 flex items-start gap-2 rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label htmlFor="adminPassword" className="mb-1.5 block text-sm font-medium">Admin password</label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                id="adminPassword"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                className="h-12 w-full rounded-lg border border-line-strong bg-sunken pl-10 pr-4 text-base text-ink placeholder:text-muted outline-none transition-colors focus:border-primary focus:shadow-glow"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary btn-treasure font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60 cursor-pointer"
          >
            <LogIn className="h-5 w-5" aria-hidden="true" />
            {loading ? 'Checking…' : 'Log in'}
          </button>
        </form>

        <div className="mt-6 border-t border-line pt-4 text-center">
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Participant login
          </Link>
        </div>
      </div>
    </main>
  );
}

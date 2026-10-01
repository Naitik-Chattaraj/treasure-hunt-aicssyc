'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Lock, AlertTriangle, KeyRound, Terminal } from 'lucide-react';
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
    <main className="min-h-screen bg-canvas text-ink flex items-center justify-center p-4 relative overflow-hidden font-mono transition-colors">

      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="z-10 w-full max-w-md bg-surface rounded-xl border-t-2 border-b-2 border-danger p-6 sm:p-8 shadow-[0_0_25px_rgba(255,0,60,0.25)]">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full border-2 border-danger flex items-center justify-center bg-sunken shadow-[0_0_15px_rgba(255,0,60,0.3)]">
            <Lock className="w-7 h-7 text-danger animate-pulse" />
          </div>
        </div>

        <h1 className="text-xl sm:text-2xl text-center font-bold mb-1 tracking-widest text-danger uppercase">
          MISSION CONTROL
        </h1>
        <p className="text-center text-[11px] tracking-widest text-gray-400 mb-6">
          ADMIN ACCESS
        </p>

        {error && (
          <div className="bg-danger/20 border border-danger text-danger px-4 py-3 mb-5 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs uppercase text-danger font-bold tracking-wider block mb-1">
              Admin Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-danger/70 absolute left-3 top-3.5" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full bg-sunken border border-line focus:border-danger text-ink pl-10 pr-4 py-3 outline-none text-sm tracking-widest focus:shadow-[0_0_10px_rgba(255,0,60,0.25)] transition-all placeholder:text-gray-600"
                required
              />
            </div>
            <p className="text-[10px] text-gray-500 mt-1">
              Secure access
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-danger hover:bg-white text-white hover:text-black font-bold text-sm py-3.5 uppercase tracking-widest transition-all mt-4 disabled:opacity-50 cursor-pointer shadow-[0_0_15px_rgba(255,0,60,0.3)] flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" />
            {loading ? 'Verifying...' : 'AUTHORIZE ADMIN LINK'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-line/40 text-center">
          <a
            href="/login"
            className="text-xs text-gray-400 hover:text-accent transition-colors"
          >
            ← Participant Login
          </a>
        </div>
      </div>
    </main>
  );
}

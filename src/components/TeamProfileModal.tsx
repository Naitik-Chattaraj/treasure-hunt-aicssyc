'use client';

import { TeamProfile, HuntProgress } from '@/types/hunt';
import { CheckCircle2, Clock, LogOut, Users, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function TeamProfileModal({ 
  profile, 
  progress, 
  onClose 
}: { 
  profile: TeamProfile; 
  progress: HuntProgress; 
  onClose: () => void;
}) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState<string>('00:00:00');

  useEffect(() => {
    if (!progress.startTime) return;
    
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - progress.startTime!) / 1000);
      const h = Math.floor(diff / 3600).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [progress.startTime]);

  const handleLogout = async () => {
    await api.logout();
    router.push('/login');
  };

  const route = profile.assignedRoute || progress.assignedRoute || 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        className="relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-line bg-surface p-5 shadow-raised sm:max-w-md sm:rounded-xl sm:p-6"
      >
        <button 
          onClick={onClose} 
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
          aria-label="Close team profile"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        <h2 id="profile-title" className="pr-10 text-2xl font-bold">{profile.teamName}</h2>
        <div className="mt-2 mb-5 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md border border-line bg-sunken px-2 py-1">
            Access code <span className="ml-1 font-mono font-semibold tracking-wider text-primary">{profile.uid}</span>
          </span>
          <span className="rounded-md border border-line bg-sunken px-2 py-1">Lead: <span className="font-medium">{profile.teamLead}</span></span>
          <span className={`rounded-md border px-2 py-1 font-semibold ${
            route === 1 ? 'border-route-1/50 bg-route-1/10 text-route-1' : 'border-route-2/50 bg-route-2/10 text-route-2'
          }`}>
            Route {route}
          </span>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto pr-1">
          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-line bg-sunken p-3">
              <div className="text-xs text-muted">Stage</div>
              <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-primary">
                {String(Math.min(progress.currentStage, 12)).padStart(2, '0')}<span className="text-muted">/12</span>
              </div>
            </div>
            <div className="rounded-lg border border-line bg-sunken p-3">
              <div className="flex items-center gap-1 text-xs text-muted">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Elapsed
              </div>
              <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums">{elapsed}</div>
            </div>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted">
              <Users className="h-4 w-4" aria-hidden="true" />
              Team ({profile.members.length})
            </h3>
            <ul className="space-y-2">
              {profile.members.map((m, i) => (
                <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-sunken px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{m.name}</div>
                    <div className="truncate font-mono text-xs text-muted">{m.regNo}</div>
                  </div>
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
                    m.role === 'Field Scout' ? 'bg-primary/15 text-primary' : 'bg-accent/15 text-accent'
                  }`}>
                    {m.role}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Cleared checkpoints
            </h3>
            {progress.completedNodes.length === 0 ? (
              <p className="rounded-lg border border-line bg-sunken p-3 text-sm text-muted">
                Nothing cleared yet. Find checkpoint 1 to begin!
              </p>
            ) : (
              <ul className="max-h-40 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-sunken text-sm">
                {progress.completedNodes.map((n, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                      Checkpoint {n.nodeId}
                    </span>
                    <span className="font-mono text-xs text-muted">{new Date(n.timestamp).toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <button 
          onClick={handleLogout}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-danger/60 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 cursor-pointer"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Log out of this device
        </button>
      </div>
    </div>
  );
}

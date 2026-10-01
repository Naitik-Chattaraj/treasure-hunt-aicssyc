'use client';

import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { HuntProgress } from '@/types/hunt';
import { CheckCircle2, Trophy } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

export default function VictoryScreen({ 
  progress, 
  teamName 
}: { 
  progress: HuntProgress;
  teamName: string;
}) {
  const [elapsed, setElapsed] = useState<string>('');

  useEffect(() => {
    // Confetti in the active theme's colours; skipped for users who prefer reduced motion
    const css = getComputedStyle(document.documentElement);
    const colors = ['--primary', '--accent', '--route-2'].map((v) => css.getPropertyValue(v).trim()).filter(Boolean);

    // Initial big burst
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors,
        disableForReducedMotion: true
    });

    // Fire celebratory confetti sequence periodically for 5 seconds
    const duration = 5000;
    const end = Date.now() + duration;
    let intervalId: NodeJS.Timeout;

    const fire = () => {
      if (Date.now() > end) {
        clearInterval(intervalId);
        return;
      }
      
      confetti({
        particleCount: 15,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors,
        disableForReducedMotion: true
      });
      confetti({
        particleCount: 15,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors,
        disableForReducedMotion: true
      });
    };

    intervalId = setInterval(fire, 250);

    return () => {
      clearInterval(intervalId);
      confetti.reset();
    };
  }, []);

  useEffect(() => {
    // Calculate final elapsed time
    if (progress?.startTime) {
      const finalTime = progress.completedNodes[progress.completedNodes.length - 1]?.timestamp || Date.now();
      const diff = Math.max(0, Math.floor((finalTime - progress.startTime) / 1000));
      const h = Math.floor(diff / 3600).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    }
  }, [progress]);

  return (
    <main className="bg-map flex min-h-dvh items-center justify-center px-4 pt-16 pb-10 text-ink sm:py-16">
      <div className="fixed top-3 right-3 z-20 sm:top-4 sm:right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-lg rounded-xl border border-primary/50 bg-surface p-6 text-center shadow-raised sm:p-10">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Trophy className="h-10 w-10" aria-hidden="true" />
        </div>

        <h1 className="text-3xl font-bold sm:text-4xl">Treasure found!</h1>
        <p className="mt-2 text-lg text-muted">
          Well played, <span className="font-semibold text-ink">{teamName}</span>
        </p>

        <div className="mt-6 space-y-4 rounded-lg border border-line bg-sunken p-5 text-left">
          <div>
            <div className="text-sm text-muted">Total time</div>
            <div className="font-mono text-3xl font-bold tabular-nums text-primary sm:text-4xl">{elapsed}</div>
          </div>

          <div>
            <div className="text-sm text-muted">Victory code</div>
            <div className="mt-1 break-all rounded-md border border-line-strong bg-surface p-3 font-mono text-base font-semibold select-all">
              {progress.completionToken || 'WIN-VERIFIED-2026'}
            </div>
            <p className="mt-2 text-sm text-muted">
              Show this code to the AICSSYC organizers at the final station to claim your prize.
            </p>
          </div>
        </div>

        <p className="mt-6 flex items-center justify-center gap-2 font-semibold text-success">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          All 12 checkpoints cleared
        </p>
      </div>
    </main>
  );
}

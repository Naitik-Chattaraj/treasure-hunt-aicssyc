'use client';

import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { HuntProgress } from '@/types/hunt';
import { Trophy, CheckCircle, ShieldCheck } from 'lucide-react';
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
    // Fire celebratory confetti sequence
    const duration = 4000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 6,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#00F0FF', '#FCEE0A', '#FF003C']
      });
      confetti({
        particleCount: 6,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#00F0FF', '#FCEE0A', '#FF003C']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();

    // Calculate final elapsed time
    if (progress.startTime) {
      const finalTime = progress.completedNodes[progress.completedNodes.length - 1]?.timestamp || Date.now();
      const diff = Math.floor((finalTime - progress.startTime) / 1000);
      const h = Math.floor(diff / 3600).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    }
  }, [progress]);

  return (
    <main className="min-h-screen bg-cyber-dark text-foreground flex items-center justify-center p-4 relative overflow-hidden font-mono transition-colors">
      <div className="overlay-scanlines"></div>
      
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="z-10 w-full max-w-lg bg-cyber-panel cyber-panel-border border-2 border-cyber-yellow p-6 sm:p-8 text-center shadow-[0_0_35px_rgba(252,238,10,0.3)]">
        
        <Trophy className="w-16 h-16 sm:w-20 sm:h-20 text-cyber-yellow mx-auto mb-4 animate-bounce" />
        
        <h1 className="text-2xl sm:text-3xl font-bold mb-2 tracking-widest text-cyber-cyan cyber-glitch-text uppercase">
          TREASURE SECURED!
        </h1>
        
        <h2 className="text-lg sm:text-xl text-foreground font-bold mb-6 uppercase tracking-widest">
          TEAM: {teamName}
        </h2>

        <div className="bg-cyber-darker border border-cyber-border p-5 mb-6 text-left space-y-4 relative overflow-hidden">
          {/* Decorative watermark */}
          <ShieldCheck className="absolute -bottom-4 -right-4 w-32 h-32 text-cyber-yellow opacity-10 pointer-events-none" />
          
          <div>
            <div className="text-[11px] text-cyber-cyan uppercase mb-1 font-bold">Total Clearance Time</div>
            <div className="text-2xl sm:text-3xl text-cyber-yellow font-extrabold tracking-wider">{elapsed}</div>
          </div>
          
          <div>
            <div className="text-[11px] text-cyber-cyan uppercase mb-1 font-bold">Cryptographic Verification Hash</div>
            <div className="text-xs sm:text-sm text-foreground font-mono font-bold bg-black/40 p-2.5 border border-cyber-border/80 break-all select-all">
              {progress.completionToken || 'WIN-VERIFIED-2026'}
            </div>
            <p className="text-[10px] text-cyber-muted mt-2 uppercase">
              Present this token to the AICSSYC organizers at the final station to claim your prize.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-cyber-cyan font-bold tracking-widest text-sm animate-pulse">
          <CheckCircle className="w-4 h-4" />
          <span>ALL 12 CHECKPOINTS CONQUERED</span>
        </div>
      </div>
    </main>
  );
}

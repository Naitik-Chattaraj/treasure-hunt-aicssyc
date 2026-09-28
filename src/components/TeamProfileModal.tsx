'use client';

import { TeamProfile, HuntProgress } from '@/types/hunt';
import { X, LogOut, ShieldAlert, Award, Clock } from 'lucide-react';
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm transition-colors">
      <div className="w-full max-w-md bg-cyber-panel cyber-panel-border border-t-2 border-cyber-cyan shadow-[0_0_25px_rgba(0,240,255,0.2)] p-6 relative flex flex-col max-h-[90vh] font-mono">
        
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-cyber-muted hover:text-cyber-pink transition-colors cursor-pointer"
          aria-label="Close Profile"
        >
          <X className="w-6 h-6" />
        </button>

        <h2 className="text-2xl font-bold text-cyber-cyan mb-1 tracking-widest uppercase">
          {profile.teamName}
        </h2>
        <div className="flex items-center gap-2 mb-5">
          <span className="text-[11px] text-cyber-yellow bg-cyber-yellow/10 border border-cyber-yellow/30 px-2 py-0.5">
            UID: {profile.uid}
          </span>
          <span className="text-[11px] text-cyber-cyan bg-cyber-cyan/10 border border-cyber-cyan/30 px-2 py-0.5">
            LEAD: {profile.teamLead}
          </span>
        </div>

        <div className="overflow-y-auto pr-1 space-y-5 flex-1">
          {/* Live Telemetry */}
          <div className="bg-cyber-darker p-3.5 border border-cyber-border">
            <h3 className="text-[10px] text-cyber-muted mb-2 uppercase font-bold tracking-widest flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyber-cyan" />
              Live Hunt Telemetry
            </h3>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-cyber-muted">CURRENT STAGE</span>
              <span className="text-cyber-cyan font-bold">NODE 0{Math.min(progress.currentStage, 12)} / 12</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-cyber-muted">ELAPSED TIME</span>
              <span className="text-cyber-yellow font-bold tracking-wider">{elapsed}</span>
            </div>
          </div>

          {/* Roster */}
          <div>
            <h3 className="text-[10px] text-cyber-muted mb-2 uppercase font-bold tracking-widest">
              Team Roster ({profile.members.length} Members)
            </h3>
            <div className="space-y-2">
              {profile.members.map((m, i) => (
                <div key={i} className="bg-cyber-darker p-2.5 border-l-2 border-cyber-cyan text-sm border-t border-r border-b border-cyber-border/40">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-foreground">{m.name}</span>
                    <span className="text-cyber-blue text-xs uppercase font-bold tracking-wider">{m.role}</span>
                  </div>
                  <div className="text-[10px] text-cyber-muted mt-1">ID: {m.regNo}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Clearance Log */}
          <div>
            <h3 className="text-[10px] text-cyber-muted mb-2 uppercase font-bold tracking-widest flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-cyber-cyan" />
              Node Clearance Log
            </h3>
            <div className="space-y-1.5 text-xs text-cyber-muted max-h-32 overflow-y-auto">
              {progress.completedNodes.length === 0 && (
                <div className="italic text-[11px] text-cyber-muted p-2 bg-cyber-darker border border-cyber-border">
                  No nodes breached yet. Scan Node 01 to begin!
                </div>
              )}
              {progress.completedNodes.map((n, i) => (
                <div key={i} className="flex justify-between border-b border-cyber-border pb-1.5 px-1">
                  <span className="text-cyber-cyan font-bold">✓ Node 0{n.nodeId} Cleared</span>
                  <span className="text-[11px] text-cyber-muted">{new Date(n.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <button 
          onClick={handleLogout}
          className="mt-5 w-full flex items-center justify-center gap-2 border border-cyber-pink text-cyber-pink py-3 text-xs uppercase font-bold hover:bg-cyber-pink hover:text-black transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Disconnect Session
        </button>
      </div>
    </div>
  );
}

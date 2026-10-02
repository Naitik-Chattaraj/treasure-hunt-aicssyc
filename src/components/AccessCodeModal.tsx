'use client';

import { useState } from 'react';
import { 
  ShieldCheck, 
  Copy, 
  Check, 
  Users, 
  ArrowRight, 
  AlertTriangle,
  Sparkles,
  KeyRound,
  BrainCircuit,
  Footprints
} from 'lucide-react';

interface AccessCodeModalProps {
  accessCode: string;
  teamName: string;
  teamLead: string;
  assignedRoute?: 1 | 2;
  operativeRole?: string;
  onProceed: () => void;
}

export default function AccessCodeModal({
  accessCode,
  teamName,
  teamLead,
  assignedRoute,
  operativeRole,
  onProceed,
}: AccessCodeModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(accessCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = accessCode;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleProceedClick = async () => {
    // If not copied yet, try copying as a safeguard
    if (!copied) {
      try {
        await navigator.clipboard.writeText(accessCode);
      } catch {
        // silent fallback
      }
    }
    onProceed();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-md font-mono transition-colors animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-cyber-panel cyber-panel-border border-2 border-green-500 shadow-[0_0_40px_rgba(34,197,94,0.3)] relative overflow-hidden flex flex-col max-h-[95vh]">
        {/* Glowing Top Accent Line */}
        <div className="h-1.5 w-full bg-gradient-to-r from-cyber-cyan via-green-400 to-cyber-yellow animate-pulse" />

        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* Header Badge & Title */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center p-3 bg-green-500/15 border border-green-500/50 rounded-full mb-1 shadow-[0_0_20px_rgba(34,197,94,0.35)]">
              <ShieldCheck className="w-10 h-10 text-green-400 animate-pulse" />
            </div>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-green-400 font-bold uppercase tracking-widest">
              <Sparkles className="w-3.5 h-3.5" />
              <span>TEAM AUTHORIZED & APPROVED</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-wider uppercase">
              MISSION CLEARANCE GRANTED
            </h2>
            <p className="text-xs text-cyber-muted leading-relaxed max-w-md mx-auto">
              Your squad <span className="text-green-400 font-bold">{teamName}</span> has been officially approved by Mission Control.
            </p>
          </div>

          {/* Access Code Highlight Card */}
          <div className="bg-cyber-darker border-2 border-cyber-cyan p-4 sm:p-5 rounded relative shadow-[0_0_25px_rgba(0,240,255,0.18)] text-center space-y-3">
            <div className="flex items-center justify-center gap-1.5 text-xs text-cyber-cyan font-bold tracking-widest uppercase">
              <KeyRound className="w-4 h-4 text-cyber-yellow" />
              <span>OFFICIAL 6-DIGIT ACCESS CODE</span>
            </div>

            <p className="text-[11px] text-gray-300">
              Please copy this code immediately and share it with your squad:
            </p>

            {/* Big Code Display */}
            <div 
              onClick={handleCopy}
              className="bg-cyber-card/90 border border-cyber-cyan/40 hover:border-cyber-cyan py-3 px-4 rounded cursor-pointer transition-all hover:shadow-[0_0_15px_rgba(0,240,255,0.25)] group relative"
              title="Click to copy code"
            >
              <div className="text-3xl sm:text-4xl font-extrabold tracking-[0.3em] sm:tracking-[0.4em] text-cyber-yellow font-mono drop-shadow-[0_0_12px_rgba(252,238,10,0.6)] select-all">
                {accessCode}
              </div>
              <span className="text-[10px] text-cyber-muted group-hover:text-cyber-cyan tracking-wider uppercase mt-1 block">
                [ Click anywhere on code to copy ]
              </span>
            </div>

            {/* Primary Copy Button */}
            <button
              type="button"
              onClick={handleCopy}
              className={`w-full py-3 px-4 text-xs sm:text-sm font-bold tracking-widest uppercase transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 rounded border ${
                copied
                  ? 'bg-green-500 border-green-400 text-black shadow-[0_0_20px_rgba(34,197,94,0.5)] font-black'
                  : 'bg-cyber-cyan hover:bg-cyber-blue border-cyber-cyan text-cyber-dark shadow-[0_0_15px_rgba(0,240,255,0.3)] hover:scale-[1.01]'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-black stroke-[3]" />
                  <span>COPIED TO CLIPBOARD! ✓</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>COPY ACCESS CODE</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Team Info Badges */}
          <div className="grid grid-cols-2 gap-2 text-xs bg-cyber-darker p-3 border border-cyber-border rounded">
            <div className="space-y-0.5">
              <span className="text-[10px] text-cyber-muted uppercase font-bold">Team Leader</span>
              <div className="text-foreground font-bold truncate">{teamLead}</div>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] text-cyber-muted uppercase font-bold">Assigned Route</span>
              <div className="text-cyber-cyan font-bold">
                ROUTE 0{assignedRoute || 1}
              </div>
            </div>
            {operativeRole && (
              <div className="col-span-2 pt-1 border-t border-cyber-border/60 flex items-center justify-between text-[11px]">
                <span className="text-cyber-muted">This Device Role:</span>
                <span className="text-cyber-yellow font-bold flex items-center gap-1">
                  {operativeRole === 'Field Scout' ? (
                    <Footprints className="w-3.5 h-3.5 text-cyber-yellow" />
                  ) : (
                    <BrainCircuit className="w-3.5 h-3.5 text-cyber-cyan" />
                  )}
                  {operativeRole}
                </span>
              </div>
            )}
          </div>

          {/* Critical Instructions Callout */}
          <div className="bg-cyber-darker border-l-4 border-cyber-yellow p-3.5 text-left text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 text-cyber-yellow font-bold uppercase tracking-wider text-[11px]">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>SQUAD LOGIN INSTRUCTIONS:</span>
            </div>
            <ul className="text-gray-300 text-[11px] leading-relaxed space-y-1 pl-1 list-disc list-inside">
              <li>
                <strong className="text-white">Share with teammates:</strong> Send this 6-digit access code to your Base Decoders and Field Scouts.
              </li>
              <li>
                <strong className="text-white">Teammate login:</strong> Teammates switch to the <strong className="text-cyber-cyan">LOGIN</strong> tab and sign in using your Team Name and this Access Code.
              </li>
              <li>
                <strong className="text-white">Keep safe:</strong> You will need this code to log back in if your browser refreshes or disconnects.
              </li>
            </ul>
          </div>

          {/* Action Button: Proceed to Hunt */}
          <button
            type="button"
            onClick={handleProceedClick}
            className="w-full py-4 px-6 text-sm font-black tracking-widest uppercase transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 rounded bg-green-500 hover:bg-green-400 text-black shadow-[0_0_25px_rgba(34,197,94,0.45)] hover:shadow-[0_0_35px_rgba(34,197,94,0.65)] hover:scale-[1.01]"
          >
            <span>ENTER MISSION CONTROL</span>
            <ArrowRight className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
      </div>
    </div>
  );
}

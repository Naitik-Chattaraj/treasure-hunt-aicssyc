'use client';

import { AlertOctagon, X } from 'lucide-react';

export default function SequenceViolationModal({ 
  violationNode, 
  currentNode,
  onClose
}: { 
  violationNode: number;
  currentNode: number;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md transition-colors">
      <div className="w-full max-w-md bg-cyber-panel cyber-panel-border border-2 border-cyber-pink p-8 sm:p-10 relative font-mono text-center shadow-[0_0_30px_rgba(255,0,60,0.3)]">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-cyber-muted hover:text-cyber-pink transition-colors cursor-pointer"
          aria-label="Close Alert"
        >
          <X className="w-6 h-6" />
        </button>

        <AlertOctagon className="w-14 h-14 sm:w-16 sm:h-16 text-cyber-pink mx-auto mb-3 animate-pulse" />
        
        <h2 className="text-xl sm:text-2xl font-bold mb-3 tracking-widest text-cyber-pink cyber-crt-text uppercase">
          WRONG CHECKPOINT
        </h2>

        <div className="bg-cyber-pink/15 border border-cyber-pink p-4 mb-6 text-left">
          <p className="text-foreground text-sm mb-2">
            This is <span className="text-cyber-pink font-bold">Checkpoint {violationNode}</span> — not your current target.
          </p>
          <div className="text-cyber-yellow font-bold text-xs bg-cyber-darker p-2 border border-cyber-border uppercase tracking-wider">
            YOUR TARGET: CHECKPOINT {currentNode}
          </div>
          <p className="text-[11px] text-cyber-muted mt-2">
            Checkpoints must be solved in order (1 → 12).
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full border border-cyber-pink bg-cyber-pink/20 hover:bg-cyber-pink text-foreground hover:text-black font-bold py-3.5 uppercase tracking-widest transition-colors cursor-pointer text-xs"
        >
          Got It
        </button>
      </div>
    </div>
  );
}

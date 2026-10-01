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
      <div className="w-full max-w-md bg-surface rounded-xl border-2 border-danger p-8 sm:p-10 relative font-mono text-center shadow-[0_0_30px_rgba(255,0,60,0.3)]">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-muted hover:text-danger transition-colors cursor-pointer"
          aria-label="Close Alert"
        >
          <X className="w-6 h-6" />
        </button>

        <AlertOctagon className="w-14 h-14 sm:w-16 sm:h-16 text-danger mx-auto mb-3 animate-pulse" />
        
        <h2 className="text-xl sm:text-2xl font-bold mb-3 tracking-widest text-danger uppercase">
          WRONG CHECKPOINT
        </h2>

        <div className="bg-danger/15 border border-danger p-4 mb-6 text-left">
          <p className="text-ink text-sm mb-2">
            This is <span className="text-danger font-bold">Checkpoint {violationNode}</span> — not your current target.
          </p>
          <div className="text-primary font-bold text-xs bg-sunken p-2 border border-line uppercase tracking-wider">
            YOUR TARGET: CHECKPOINT {currentNode}
          </div>
          <p className="text-[11px] text-muted mt-2">
            Checkpoints must be solved in order (1 → 12).
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full border border-danger bg-danger/20 hover:bg-danger text-ink hover:text-black font-bold py-3.5 uppercase tracking-widest transition-colors cursor-pointer text-xs"
        >
          Got It
        </button>
      </div>
    </div>
  );
}

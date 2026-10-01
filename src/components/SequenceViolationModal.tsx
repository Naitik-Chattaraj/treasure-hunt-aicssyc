'use client';

import { ArrowRight, MapPinOff, X } from 'lucide-react';

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
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sequence-title"
        className="relative w-full rounded-t-2xl border border-line bg-surface p-5 text-center shadow-raised sm:max-w-md sm:rounded-xl sm:p-6"
      >
        <button
          onClick={onClose}
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
          aria-label="Close"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
          <MapPinOff className="h-7 w-7" aria-hidden="true" />
        </div>

        <h2 id="sequence-title" className="text-xl font-bold sm:text-2xl">Not this one yet</h2>
        <p className="mt-2 text-sm text-muted">Checkpoints have to be found in order, 1 to 12.</p>

        <div className="my-5 flex items-center justify-center gap-3 text-sm">
          <div className="rounded-lg border border-line bg-sunken px-3 py-2">
            <div className="text-xs text-muted">You scanned</div>
            <div className="font-mono text-lg font-semibold">{String(violationNode).padStart(2, '0')}</div>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
          <div className="rounded-lg border border-primary/60 bg-primary/10 px-3 py-2">
            <div className="text-xs text-muted">Find next</div>
            <div className="font-mono text-lg font-semibold text-primary">{String(currentNode).padStart(2, '0')}</div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="flex h-12 w-full items-center justify-center rounded-lg bg-primary font-semibold text-on-primary transition-colors hover:bg-primary-hover cursor-pointer"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

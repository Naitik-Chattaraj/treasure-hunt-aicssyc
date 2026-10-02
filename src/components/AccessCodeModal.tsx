'use client';

import { useState } from 'react';
import { AlertTriangle, ArrowRight, BrainCircuit, Check, Copy, Footprints, KeyRound } from 'lucide-react';
import TreasureChest from '@/components/TreasureChest';

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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="access-code-title"
    >
      <div className="parchment flex max-h-[95dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-primary/50 sm:rounded-xl">
        <div className="space-y-5 overflow-y-auto p-5 sm:p-6">
          <header className="text-center">
            <TreasureChest open className="mx-auto h-24 w-28" />
            <p className="mt-1 text-sm font-semibold text-success">Team approved</p>
            <h2 id="access-code-title" className="title-treasure mt-1 text-3xl sm:text-4xl">You&apos;re in!</h2>
            <p className="mt-2 text-sm text-muted">
              <span className="font-semibold text-ink">{teamName}</span> has been approved by the organizers.
            </p>
          </header>

          <section className="space-y-3 rounded-lg border border-line bg-sunken p-4 text-center" aria-label="Access code">
            <p className="flex items-center justify-center gap-1.5 text-sm font-semibold">
              <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
              Your 6-digit access code
            </p>
            <button
              type="button"
              onClick={handleCopy}
              title="Copy access code"
              className="w-full rounded-md border border-line-strong bg-surface px-4 py-3 transition-colors hover:border-primary cursor-pointer"
            >
              <span className="block select-all font-mono text-3xl font-bold tracking-[0.35em] text-primary sm:text-4xl">
                {accessCode}
              </span>
              <span className="mt-1 block text-xs text-muted">Tap the code to copy it</span>
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className={`flex h-12 w-full items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors cursor-pointer ${
                copied ? 'border-success bg-success text-on-primary' : 'border-line-strong bg-surface text-ink hover:border-ink/40'
              }`}
              aria-live="polite"
            >
              {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy access code'}
            </button>
          </section>

          <dl className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-sunken p-3 text-sm">
            <div className="min-w-0">
              <dt className="text-xs text-muted">Team leader</dt>
              <dd className="truncate font-semibold">{teamLead}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Route</dt>
              <dd className={`font-semibold ${(assignedRoute || 1) === 1 ? 'text-route-1' : 'text-route-2'}`}>Route {assignedRoute || 1}</dd>
            </div>
            {operativeRole && (
              <div className="col-span-2 flex items-center justify-between border-t border-line pt-2">
                <dt className="text-xs text-muted">This device</dt>
                <dd className="flex items-center gap-1.5 font-semibold">
                  {operativeRole === 'Field Scout'
                    ? <Footprints className="h-4 w-4 text-primary" aria-hidden="true" />
                    : <BrainCircuit className="h-4 w-4 text-accent" aria-hidden="true" />}
                  {operativeRole}
                </dd>
              </div>
            )}
          </dl>

          <section className="rounded-lg border border-line border-l-4 border-l-primary bg-surface-2 p-3.5 text-sm">
            <p className="mb-1.5 flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              How your squad logs in
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li><span className="font-medium text-ink">Share the code</span> with your Base Decoders and Field Scouts.</li>
              <li>They open <span className="font-medium text-ink">Log in</span> and enter the team name, this code and the team leader&apos;s name.</li>
              <li><span className="font-medium text-ink">Keep it safe:</span> you need it to log back in if this browser signs out.</li>
            </ul>
          </section>

          <button
            type="button"
            onClick={handleProceedClick}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-primary btn-treasure text-base font-semibold text-on-primary transition-colors hover:bg-primary-hover cursor-pointer"
          >
            Start the hunt
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

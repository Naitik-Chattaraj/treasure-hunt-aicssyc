'use client';

import { useState, useEffect } from 'react';
import { Checkpoint } from '@/types/hunt';
import { AlertCircle, BrainCircuit, CheckCircle2, Play, Timer, X } from 'lucide-react';
import { api } from '@/lib/api';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import MarkdownRenderer from '@/components/MarkdownRenderer';

export default function ChallengeModal({ 
  checkpoint, 
  onSuccess,
  onClose,
  initialCooldown = 0,
}: { 
  checkpoint: Checkpoint;
  onSuccess: () => void;
  onClose: () => void;
  initialCooldown?: number;
}) {
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [cooldown, setCooldown] = useState(initialCooldown);
  const [terminalOutput, setTerminalOutput] = useState('');
  const [runningCode, setRunningCode] = useState(false);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const runCode = async () => {
    if (!answer.trim() || runningCode || cooldown > 0) return;
    setRunningCode(true);
    setTerminalOutput('Executing...\n');
    try {
      const res = await fetch('https://emkc.org/api/v2/piston/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: 'javascript',
          version: '18.15.0',
          files: [{ content: answer }]
        })
      });
      const data = await res.json();
      if (data.run) {
        setTerminalOutput(data.run.output || data.run.stderr || 'No output.');
      } else {
        setTerminalOutput('Code execution failed.');
      }
    } catch {
      setTerminalOutput('Network error.');
    } finally {
      setRunningCode(false);
    }
  };

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown(c => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !answer.trim() || cooldown > 0) return;

    setLoading(true);
    setError(false);
    setErrorMessage('');
    
    try {
      const res = await api.solveChallenge(checkpoint.id, answer.trim());
      
      if (res.success) {
        setCleared(true);
        setTimeout(() => {
          onSuccess();
        }, 1800);
      } else {
        setError(true);
        setErrorMessage(res.message || 'Incorrect answer.');
        const wait = res.cooldownSeconds ?? res.waitSeconds;
        if (wait) {
          setCooldown(wait);
        }
        setTimeout(() => setError(false), 2000);
      }
    } catch {
      setError(true);
      setErrorMessage('Network error. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  const challenge = checkpoint.challenge;
  if (!challenge) return null;

  const stageNum = checkpoint.stage || (checkpoint.id <= 12 ? checkpoint.id : checkpoint.id - 12);

  const isCode = challenge.type === 'code';

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="challenge-title"
        className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-raised sm:rounded-xl sm:p-6 lg:max-h-[88dvh] lg:p-8 ${
          isCode ? 'sm:max-w-2xl lg:max-w-6xl' : 'sm:max-w-2xl lg:max-w-5xl'
        } ${error ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <span className="rounded-md border border-dashed border-primary/60 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
              Checkpoint {String(stageNum).padStart(2, '0')}
            </span>
            <h2 id="challenge-title" className="mt-2 flex items-center gap-2 text-xl font-bold sm:text-2xl">
              {cleared ? (
                <>
                  <CheckCircle2 className="h-6 w-6 text-success" aria-hidden="true" /> Solved!
                </>
              ) : (
                <>
                  <BrainCircuit className="h-6 w-6 text-primary" aria-hidden="true" /> Challenge
                </>
              )}
            </h2>
          </div>
          {!cleared && (
            <button
              onClick={onClose}
              className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
              aria-label="Close challenge"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        {!cleared && (
          <div className="lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
            <div className="mb-5 rounded-lg border border-line bg-sunken p-4 lg:sticky lg:top-0 lg:mb-0 lg:max-h-[68dvh] lg:overflow-y-auto lg:p-5">
              <MarkdownRenderer content={challenge.question} />
            </div>

            <div>
              {error && (
                <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-danger/50 bg-danger/10 px-3 py-2.5 text-sm text-danger">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{errorMessage || 'Incorrect answer.'}</span>
                </div>
              )}

              {cooldown > 0 && (
                <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/10 px-3 py-2.5 text-sm text-ink">
                  <Timer className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>Answering is locked for <span className="font-mono font-semibold tabular-nums">{cooldown}s</span> after a wrong answer.</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {challenge.type === 'mcq' && challenge.options ? (
                  <fieldset className="space-y-2">
                    <legend className="sr-only">Choose an answer</legend>
                    {challenge.options.map((opt, i) => (
                      <label
                        key={opt}
                        className={`flex min-h-12 items-center gap-3 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-primary cursor-pointer ${
                          answer === opt
                            ? 'border-primary bg-primary/10 font-semibold'
                            : 'border-line-strong bg-sunken hover:border-ink/40'
                        } ${cooldown > 0 ? 'opacity-60' : ''}`}
                      >
                        <input
                          type="radio"
                          name="answer"
                          value={opt}
                          checked={answer === opt}
                          disabled={cooldown > 0}
                          onChange={e => setAnswer(e.target.value)}
                          className="sr-only"
                        />
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                          answer === opt ? 'border-primary bg-primary text-on-primary' : 'border-line-strong text-muted'
                        }`}>
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span className="text-base">{opt}</span>
                      </label>
                    ))}
                  </fieldset>
                ) : isCode ? (
                  <div className="space-y-3">
                    <div className="overflow-hidden rounded-lg border border-line">
                      <CodeMirror
                        value={answer}
                        height="220px"
                        theme={oneDark}
                        extensions={[javascript({ jsx: true })]}
                        onChange={(value) => setAnswer(value)}
                        editable={cooldown <= 0}
                        className="text-left text-sm"
                      />
                    </div>
                    {!isMobile && (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={runCode}
                          disabled={runningCode || !answer || cooldown > 0}
                          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface text-sm font-semibold transition-colors hover:border-ink/40 disabled:opacity-50 cursor-pointer"
                        >
                          <Play className="h-4 w-4 text-accent" aria-hidden="true" />
                          {runningCode ? 'Running…' : 'Run code'}
                        </button>
                        <pre className="max-h-40 min-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-sunken p-3 text-left font-mono text-sm text-success" aria-live="polite">
                          {terminalOutput || '> Output will appear here…'}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label htmlFor="challengeAnswer" className="mb-1.5 block text-sm font-medium">Your answer</label>
                    <input
                      id="challengeAnswer"
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={answer}
                      disabled={cooldown > 0}
                      onChange={e => setAnswer(e.target.value)}
                      aria-invalid={error}
                      className={`h-12 w-full rounded-lg border bg-sunken px-4 font-mono text-base text-ink placeholder:font-sans placeholder:text-muted outline-none transition-colors focus:border-primary focus:shadow-glow disabled:opacity-60 ${
                        error ? 'border-danger' : 'border-line-strong'
                      }`}
                      placeholder={cooldown > 0 ? `Locked for ${cooldown}s` : 'Type your answer'}
                      required
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !answer || cooldown > 0}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-base font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Checking…' : cooldown > 0 ? `Locked (${cooldown}s)` : 'Submit answer'}
                </button>
              </form>
            </div>
          </div>
        )}

        {cleared && (
          <div className="space-y-2 py-6 text-center" role="status">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
              <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
            </div>
            <p className="text-lg font-semibold">Checkpoint {stageNum} solved!</p>
            <p className="text-sm text-muted">Unlocking the next checkpoint…</p>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          50% { transform: translateX(8px); }
          75% { transform: translateX(-8px); }
        }
      `}</style>
    </div>
  );
}

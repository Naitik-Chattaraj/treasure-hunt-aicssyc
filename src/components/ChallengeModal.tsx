'use client';

import { useState, useEffect } from 'react';
import { Checkpoint } from '@/types/hunt';
import { Terminal, LockOpen, X, AlertTriangle, ShieldCheck, Timer, Play } from 'lucide-react';
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
    if (!answer.trim() || cooldown > 0) return;

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
        if (res.cooldownSeconds) {
          setCooldown(res.cooldownSeconds);
        }
        setTimeout(() => setError(false), 800);
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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md transition-colors">
      <div className={`w-full max-w-md bg-cyber-panel cyber-panel-border border-t-2 border-b-2 ${cleared ? 'border-cyber-yellow' : 'border-cyber-pink'} p-8 sm:p-10 relative font-mono transition-all duration-300 shadow-[0_0_30px_rgba(255,0,60,0.2)] ${error ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
        
        {!cleared && (
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 text-cyber-muted hover:text-cyber-pink transition-colors cursor-pointer"
            aria-label="Close Challenge"
          >
            <X className="w-6 h-6" />
          </button>
        )}

        <div className="flex justify-center mb-3">
          {cleared ? (
            <LockOpen className="w-12 h-12 text-cyber-yellow animate-bounce" />
          ) : (
            <Terminal className="w-12 h-12 text-cyber-pink animate-pulse" />
          )}
        </div>

        <h2 className={`text-xl sm:text-2xl text-center font-bold mb-4 tracking-widest uppercase ${cleared ? 'text-cyber-yellow' : 'cyber-crt-text text-cyber-pink'}`}>
          {cleared ? 'SOLVED!' : 'CHALLENGE'}
        </h2>

        {!cleared && (
          <>
            <div className="bg-cyber-darker border border-cyber-border p-4 mb-5 relative">
              <div className="absolute top-0 left-0 bg-cyber-pink text-white text-[10px] px-2 py-0.5 font-bold tracking-wider uppercase">
                CHECKPOINT {stageNum}
              </div>
              <div className="mt-3">
                <MarkdownRenderer content={challenge.question} />
              </div>
            </div>

            {error && (
              <div className="bg-cyber-pink/15 border border-cyber-pink text-cyber-pink px-3 py-2 mb-4 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage || 'Incorrect answer.'}</span>
              </div>
            )}

            {cooldown > 0 && (
              <div className="bg-cyber-yellow/15 border border-cyber-yellow text-cyber-yellow px-3 py-2 mb-4 text-xs flex items-center gap-2">
                <Timer className="w-4 h-4 shrink-0 animate-spin" style={{ animationDuration: '3s' }} />
                <span>Cooldown: {cooldown}s</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {challenge.type === 'mcq' && challenge.options ? (
                <div className="space-y-2">
                  {challenge.options.map(opt => (
                    <label 
                      key={opt} 
                      className={`block border p-3 cursor-pointer transition-all ${
                        answer === opt 
                          ? 'border-cyber-cyan bg-cyber-cyan/15 text-cyber-cyan font-bold shadow-[0_0_8px_rgba(0,240,255,0.2)]' 
                          : 'border-cyber-border hover:border-cyber-cyan/50 text-foreground bg-cyber-darker'
                      }`}
                    >
                      <input 
                        type="radio" 
                        name="answer" 
                        value={opt} 
                        disabled={cooldown > 0}
                        onChange={e => setAnswer(e.target.value)}
                        className="hidden"
                      />
                      <span className="text-sm">{opt}</span>
                    </label>
                  ))}
                </div>
              ) : challenge.type === 'code' ? (
                <div className="space-y-4">
                  <div className="border border-cyber-border overflow-hidden">
                    <CodeMirror
                      value={answer}
                      height="200px"
                      theme={oneDark}
                      extensions={[javascript({ jsx: true })]}
                      onChange={(value) => setAnswer(value)}
                      editable={cooldown <= 0}
                      className="text-sm text-left"
                    />
                  </div>
                  {!isMobile && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={runCode}
                        disabled={runningCode || !answer || cooldown > 0}
                        className="w-full flex items-center justify-center gap-2 bg-cyber-darker border border-cyber-cyan text-cyber-cyan hover:bg-cyber-cyan hover:text-black font-bold py-2 uppercase tracking-widest transition-colors disabled:opacity-50"
                      >
                        <Play className="w-4 h-4" />
                        {runningCode ? 'RUNNING...' : 'RUN CODE'}
                      </button>
                      <div className="bg-black border border-cyber-border p-3 min-h-[100px] max-h-[150px] overflow-y-auto font-mono text-xs text-green-400 whitespace-pre-wrap text-left">
                        {terminalOutput || '> Output will appear here...'}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    value={answer}
                    disabled={cooldown > 0}
                    onChange={e => setAnswer(e.target.value)}
                    className={`w-full bg-cyber-darker border ${
                      error ? 'border-cyber-pink' : 'border-cyber-border'
                    } focus:border-cyber-cyan text-foreground px-4 py-3 outline-none text-center uppercase tracking-widest text-sm font-bold disabled:opacity-50`}
                    placeholder={cooldown > 0 ? `LOCKED (${cooldown}s)` : "Enter your answer"}
                    required
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !answer || cooldown > 0}
                className="w-full cyber-button-border bg-cyber-pink hover:bg-white text-white hover:text-black font-bold text-sm py-3.5 uppercase tracking-widest transition-all disabled:opacity-50 cursor-pointer shadow-[0_0_12px_rgba(255,0,60,0.3)]"
              >
                {loading ? 'VALIDATING...' : cooldown > 0 ? `LOCKED (${cooldown}s)` : 'SUBMIT SOLUTION'}
              </button>
            </form>
          </>
        )}

        {cleared && (
          <div className="text-center space-y-3 py-4 animate-pulse">
            <div className="flex items-center justify-center gap-2 text-cyber-yellow font-bold text-sm">
              <ShieldCheck className="w-5 h-5" />
              <span>CHECKPOINT {stageNum} SOLVED!</span>
            </div>
            <p className="text-xs text-cyber-muted">Unlocking next checkpoint...</p>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          50% { transform: translateX(10px); }
          75% { transform: translateX(-10px); }
        }
      `}</style>
    </div>
  );
}

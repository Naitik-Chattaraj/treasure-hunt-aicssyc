'use client';

import { useState } from 'react';
import { Checkpoint } from '@/types/hunt';
import { Terminal, LockOpen, X, AlertTriangle, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';

export default function ChallengeModal({ 
  checkpoint, 
  onSuccess,
  onClose
}: { 
  checkpoint: Checkpoint;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cleared, setCleared] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim()) return;

    setLoading(true);
    setError(false);
    
    const isCorrect = await api.solveChallenge(checkpoint.id, answer.trim());
    
    if (isCorrect) {
      setCleared(true);
      setTimeout(() => {
        onSuccess();
      }, 1800);
    } else {
      setError(true);
      setLoading(false);
      setTimeout(() => setError(false), 500);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md transition-colors">
      <div className={`w-full max-w-md bg-cyber-panel cyber-panel-border border-t-2 border-b-2 ${cleared ? 'border-cyber-yellow' : 'border-cyber-pink'} p-6 sm:p-8 relative font-mono transition-all duration-300 shadow-[0_0_30px_rgba(255,0,60,0.2)] ${error ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
        
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

        <h2 className={`text-xl sm:text-2xl text-center font-bold mb-4 tracking-widest uppercase ${cleared ? 'text-cyber-yellow' : 'cyber-glitch-text text-cyber-pink'}`}>
          {cleared ? 'ACCESS GRANTED' : 'CHALLENGE TERMINAL'}
        </h2>

        {!cleared && (
          <>
            <div className="bg-cyber-darker border border-cyber-border p-4 mb-5 relative">
              <div className="absolute top-0 left-0 bg-cyber-pink text-white text-[10px] px-2 py-0.5 font-bold tracking-wider uppercase">
                NODE 0{checkpoint.id} CHALLENGE
              </div>
              <p className="mt-3 text-sm text-foreground leading-relaxed font-sans">{checkpoint.challenge.question}</p>
            </div>

            {error && (
              <div className="bg-cyber-pink/15 border border-cyber-pink text-cyber-pink px-3 py-2 mb-4 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>INCORRECT KEY/ANSWER. TRY AGAIN.</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {checkpoint.challenge.type === 'mcq' && checkpoint.challenge.options ? (
                <div className="space-y-2">
                  {checkpoint.challenge.options.map(opt => (
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
                        onChange={e => setAnswer(e.target.value)}
                        className="hidden"
                      />
                      <span className="text-sm">{opt}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    value={answer}
                    onChange={e => setAnswer(e.target.value)}
                    className={`w-full bg-cyber-darker border ${
                      error ? 'border-cyber-pink' : 'border-cyber-border'
                    } focus:border-cyber-cyan text-foreground px-4 py-3 outline-none text-center uppercase tracking-widest text-sm font-bold`}
                    placeholder="ENTER OVERRIDE PASSCODE"
                    required
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !answer}
                className="w-full cyber-button-border bg-cyber-pink hover:bg-white text-white hover:text-black font-bold text-sm py-3.5 uppercase tracking-widest transition-all disabled:opacity-50 cursor-pointer shadow-[0_0_12px_rgba(255,0,60,0.3)]"
              >
                {loading ? 'VALIDATING...' : 'SUBMIT SOLUTION'}
              </button>
            </form>
          </>
        )}

        {cleared && (
          <div className="text-center space-y-3 py-4 animate-pulse">
            <div className="flex items-center justify-center gap-2 text-cyber-yellow font-bold text-sm">
              <ShieldCheck className="w-5 h-5" />
              <span>NODE 0{checkpoint.id} BREACHED!</span>
            </div>
            <p className="text-xs text-cyber-muted">Updating telemetry & unlocking next coordinate...</p>
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

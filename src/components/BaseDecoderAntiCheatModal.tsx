'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  AlertTriangle, 
  Maximize2, 
  Volume2, 
  VolumeX, 
  ShieldAlert, 
  Lock,
  EyeOff
} from 'lucide-react';

interface BaseDecoderAntiCheatModalProps {
  isBaseDecoder: boolean;
}

export default function BaseDecoderAntiCheatModal({ isBaseDecoder }: BaseDecoderAntiCheatModalProps) {
  // Initial entry state: requires user gesture to enter fullscreen
  const [hasEnteredFullscreen, setHasEnteredFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Penalty state
  const [isPenalized, setIsPenalized] = useState(false);
  const [penaltyRemaining, setPenaltyRemaining] = useState(0);
  const [violationReason, setViolationReason] = useState<string>('');
  const [audioMuted, setAudioMuted] = useState(false);

  // Audio synthesis refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const beeperIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const penaltyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const penaltyRemainingRef = useRef<number>(0);
  const isPenalizedRef = useRef<boolean>(false);
  const isAlarmPlayingRef = useRef<boolean>(false);

  // Keep ref synchronized with state for event listeners
  useEffect(() => {
    penaltyRemainingRef.current = penaltyRemaining;
  }, [penaltyRemaining]);

  useEffect(() => {
    isPenalizedRef.current = isPenalized;
  }, [isPenalized]);

  // Audio alarm generator using Web Audio API
  const stopAlarm = useCallback(() => {
    if (beeperIntervalRef.current) {
      clearInterval(beeperIntervalRef.current);
      beeperIntervalRef.current = null;
    }
    isAlarmPlayingRef.current = false;
  }, []);

  const playBeepTone = useCallback(() => {
    try {
      if (audioMuted) return;
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          audioCtxRef.current = new AudioCtx();
        }
      }

      const ctx = audioCtxRef.current;
      if (!ctx) return;

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      // Generate sharp security alarm beep (880Hz square wave)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.18);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {
      // Audio autoplay policy catch
    }
  }, [audioMuted]);

  const startAlarm = useCallback(() => {
    if (isAlarmPlayingRef.current) return;
    isAlarmPlayingRef.current = true;
    playBeepTone();
    beeperIntervalRef.current = setInterval(() => {
      playBeepTone();
    }, 350);
  }, [playBeepTone]);

  // Trigger violation penalty
  const triggerViolation = useCallback((reason: string) => {
    setViolationReason(reason);
    setIsPenalized(true);
    setPenaltyRemaining(15);
    penaltyRemainingRef.current = 15;

    // Start audible alarm
    startAlarm();

    // Start 15-second countdown timer
    if (penaltyTimerRef.current) {
      clearInterval(penaltyTimerRef.current);
    }

    penaltyTimerRef.current = setInterval(() => {
      setPenaltyRemaining((prev) => {
        if (prev <= 1) {
          if (penaltyTimerRef.current) {
            clearInterval(penaltyTimerRef.current);
            penaltyTimerRef.current = null;
          }
          // Penalty finished - if user is currently back in fullscreen, unlock
          const currentlyFullscreen = !!document.fullscreenElement;
          if (currentlyFullscreen) {
            setIsPenalized(false);
            stopAlarm();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [startAlarm, stopAlarm]);

  // Request fullscreen
  const enterFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if ((document.documentElement as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen) {
        await (document.documentElement as unknown as { webkitRequestFullscreen: () => Promise<void> }).webkitRequestFullscreen();
      }

      setHasEnteredFullscreen(true);
      setIsFullscreen(true);

      // Initialize audio context on explicit user gesture
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          audioCtxRef.current = new AudioCtx();
        }
      }

      // If penalty countdown already finished, clear penalty
      if (penaltyRemainingRef.current === 0) {
        setIsPenalized(false);
        stopAlarm();
      } else {
        // As agreed: stop the beeping sound once they are back in fullscreen
        // while the remaining countdown finishes
        stopAlarm();
      }
    } catch (err) {
      console.warn('Failed to enter fullscreen:', err);
    }
  };

  // 1. Right Click and Modifier Key Anti-Cheat for Base Decoders
  useEffect(() => {
    if (!isBaseDecoder) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable shortcuts using Ctrl, Meta (Cmd), or Alt
      if (e.ctrlKey || e.metaKey || e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Block developer tools and refresh shortcuts
      if (e.key === 'F12' || (e.ctrlKey && e.key === 'r') || (e.metaKey && e.key === 'r')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    window.addEventListener('contextmenu', handleContextMenu, { capture: true });
    window.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu, { capture: true });
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isBaseDecoder]);

  // 2. Fullscreen and Focus/Tab Tracking
  useEffect(() => {
    if (!isBaseDecoder) return;

    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isCurrentlyFullscreen);

      if (!isCurrentlyFullscreen && hasEnteredFullscreen) {
        triggerViolation('Fullscreen minimized or exited. Terminal must remain in fullscreen.');
      } else if (isCurrentlyFullscreen && isPenalizedRef.current) {
        // They re-entered fullscreen: stop the alarm siren
        stopAlarm();
        if (penaltyRemainingRef.current === 0) {
          setIsPenalized(false);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && hasEnteredFullscreen) {
        triggerViolation('Browser tab changed or minimized. Multitasking is strictly prohibited.');
      }
    };

    const handleWindowBlur = () => {
      // Trigger if window loses focus while in active hunt
      if (hasEnteredFullscreen) {
        triggerViolation('Window lost focus or split-screen detected. External windows are prohibited.');
      }
    };

    const handleWindowFocus = () => {
      // When window regains focus, if in fullscreen, silence the alarm
      if (document.fullscreenElement) {
        stopAlarm();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      stopAlarm();
      if (penaltyTimerRef.current) clearInterval(penaltyTimerRef.current);
    };
  }, [isBaseDecoder, hasEnteredFullscreen, triggerViolation, stopAlarm]);

  // Only active for Base Decoders
  if (!isBaseDecoder) return null;

  // Initial Mandatory Fullscreen Entry Overlay
  if (!hasEnteredFullscreen || (!isFullscreen && !isPenalized)) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md font-mono select-none">
        <div className="w-full max-w-lg bg-cyber-panel border-2 border-cyber-pink shadow-[0_0_40px_rgba(255,0,60,0.4)] p-6 sm:p-8 text-center space-y-6 rounded-sm relative">
          <div className="w-16 h-16 border-2 border-cyber-pink bg-cyber-pink/10 text-cyber-pink flex items-center justify-center mx-auto rounded-full shadow-[0_0_20px_rgba(255,0,60,0.3)] animate-pulse">
            <Maximize2 className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="text-[10px] bg-cyber-pink/20 text-cyber-pink border border-cyber-pink/50 px-2 py-0.5 uppercase tracking-widest font-bold">
              PROCTORED TERMINAL PROTOCOL
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-wider uppercase">
              MANDATORY FULLSCREEN MODE
            </h2>
            <p className="text-xs text-gray-300 leading-relaxed max-w-sm mx-auto">
              Base Decoders operate under secure exam constraints. Switching tabs, minimizing the window, or losing window focus will trigger a <strong className="text-cyber-yellow">15-second lockout penalty</strong> and an audible alert.
            </p>
          </div>

          <div className="bg-cyber-darker border border-cyber-border p-3 text-[11px] text-gray-400 space-y-1.5 text-left">
            <div className="flex items-center gap-2 text-cyber-cyan font-bold">
              <Lock className="w-3.5 h-3.5" /> Security Enforcement Active:
            </div>
            <div>• Clipboard shortcuts (Ctrl+C, Ctrl+V, etc.) disabled</div>
            <div>• Right-click and developer menus disabled</div>
            <div>• Unfocus and tab-switching monitoring enabled</div>
          </div>

          <button
            onClick={enterFullscreen}
            className="w-full bg-cyber-pink hover:bg-white text-white hover:text-black py-3.5 px-4 font-bold text-sm uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(255,0,60,0.5)] rounded-sm"
          >
            <Maximize2 className="w-4 h-4" />
            <span>ACTIVATE FULLSCREEN TERMINAL</span>
          </button>
        </div>
      </div>
    );
  }

  // Active Violation Penalty Modal
  if (isPenalized || penaltyRemaining > 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md font-mono select-none">
        <div className="w-full max-w-lg bg-cyber-darker border-2 border-red-500 shadow-[0_0_50px_rgba(239,68,68,0.6)] p-6 sm:p-8 text-center space-y-6 rounded-sm relative animate-[pulse_2s_ease-in-out_infinite]">
          {/* Header Icon */}
          <div className="w-16 h-16 border-2 border-red-500 bg-red-500/20 text-red-500 flex items-center justify-center mx-auto rounded-full shadow-[0_0_25px_rgba(239,68,68,0.5)]">
            <ShieldAlert className="w-8 h-8 animate-bounce" />
          </div>

          {/* Alert Title */}
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 text-red-500 font-bold text-xs uppercase tracking-widest">
              <AlertTriangle className="w-4 h-4 animate-ping" />
              <span>SECURITY VIOLATION DETECTED</span>
              <AlertTriangle className="w-4 h-4 animate-ping" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-red-400 tracking-wider uppercase">
              TERMINAL TEMPORARILY LOCKED
            </h2>
            <p className="text-xs text-gray-300 bg-red-950/60 border border-red-800/80 p-2.5 rounded">
              {violationReason || 'Window lost focus or minimized. All activities suspended.'}
            </p>
          </div>

          {/* Countdown Display */}
          <div className="bg-black/80 border-2 border-red-500/60 p-4 rounded space-y-1">
            <div className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
              LOCKOUT PENALTY COOLDOWN
            </div>
            <div className="text-4xl sm:text-5xl font-black text-red-500 tracking-widest font-mono">
              00:{penaltyRemaining.toString().padStart(2, '0')}
            </div>
            <div className="text-[10px] text-red-400">
              {penaltyRemaining > 0 ? 'Terminal operations will resume after countdown expires' : 'Ready to resume'}
            </div>
          </div>

          {/* Re-enter Fullscreen Button */}
          <div className="space-y-3">
            {!isFullscreen ? (
              <button
                onClick={enterFullscreen}
                className="w-full bg-red-600 hover:bg-white text-white hover:text-black py-3 px-4 font-bold text-xs sm:text-sm uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(239,68,68,0.4)]"
              >
                <Maximize2 className="w-4 h-4" />
                <span>RESTORE FULLSCREEN TO RE-ENABLE</span>
              </button>
            ) : penaltyRemaining > 0 ? (
              <div className="text-xs text-cyber-yellow font-bold flex items-center justify-center gap-2 bg-yellow-950/40 p-2.5 border border-yellow-800">
                <Lock className="w-4 h-4" />
                <span>Fullscreen restored. Stand by for lockout countdown to end...</span>
              </div>
            ) : (
              <button
                onClick={() => {
                  setIsPenalized(false);
                  stopAlarm();
                }}
                className="w-full bg-green-500 hover:bg-white text-black py-3 px-4 font-bold text-xs sm:text-sm uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(34,197,94,0.4)]"
              >
                <span>RESUME DECODING OPERATIONS</span>
              </button>
            )}

            <div className="flex items-center justify-center gap-2 text-[11px] text-gray-400">
              <EyeOff className="w-3.5 h-3.5 text-red-400" />
              <span>Audio siren indicates terminal breach to venue authorities</span>
              <button 
                type="button"
                onClick={() => setAudioMuted(m => !m)}
                className="text-[10px] text-gray-500 hover:text-gray-300 ml-2 underline flex items-center gap-1 cursor-pointer"
                title="Toggle local audio mute"
              >
                {audioMuted ? <VolumeX className="w-3 h-3 text-red-400" /> : <Volume2 className="w-3 h-3 text-green-400" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

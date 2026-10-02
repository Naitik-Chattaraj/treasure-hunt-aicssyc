'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { TeamProfile, HuntProgress, Checkpoint } from '@/types/hunt';
import {
  AlertOctagon,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Compass,
  Footprints,
  KeyRound,
  Lock,
  Map as MapIcon,
  MapPin,
  RefreshCw,
  ScanLine,
  ScrollText,
  Send,
} from 'lucide-react';
import TeamProfileModal from '@/components/TeamProfileModal';
import TacticalMapModal from '@/components/TacticalMapModal';
import QRScannerModal from '@/components/QRScannerModal';
import ChallengeModal from '@/components/ChallengeModal';
import SequenceViolationModal from '@/components/SequenceViolationModal';
import VictoryScreen from '@/components/VictoryScreen';
import ThemeToggle from '@/components/ThemeToggle';

export default function HuntHUD() {
  const router = useRouter();
  const [profile, setProfile] = useState<TeamProfile | null>(null);
  const [progress, setProgress] = useState<HuntProgress | null>(null);
  const [activeCheckpoint, setActiveCheckpoint] = useState<Checkpoint | null>(null);
  const activeCheckpointRef = useRef<Checkpoint | null>(null);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showProfile, setShowProfile] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  
  // Dynamic interaction states
  const [violationNode, setViolationNode] = useState<number | null>(null);
  const [showChallenge, setShowChallenge] = useState(false);
  const autoOpenedCheckpointRef = useRef<number | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const prevStageRef = useRef<number | null>(null);
  const [stageClearedNotice, setStageClearedNotice] = useState<string | null>(null);

  // Manual code entry state (for room team receiving code from field runners)
  const [manualCode, setManualCode] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [showManualCode, setShowManualCode] = useState(false);
  const [now, setNow] = useState<number>(0);
  const [reloadingStatus, setReloadingStatus] = useState(false);

  const isFieldScout = profile?.operativeRole === 'Field Scout';
  const isBaseDecoder = !isFieldScout;

  const loadData = async (silent = false, forceRefresh = false) => {
    if (!silent) setLoading(true);
    try {
      // Egress & Latency Optimization: Parallelize getMe and getCheckpoint if stage is known
      let prof, prog;
      let cp = null;
      const knownStage = progress?.currentStage || activeCheckpointRef.current?.stage;
      const isDecoderLocal = profile ? profile.operativeRole !== 'Field Scout' : false;
      const currentCp = activeCheckpointRef.current;
      const waitingForUnlock = isDecoderLocal && (!currentCp?.qrScanned || !currentCp?.challenge);

      if (knownStage && knownStage <= 12) {
        const stageChanged = !currentCp || (currentCp.stage !== undefined && currentCp.stage !== knownStage);
        // Avoid aggressive background polling of getCheckpoint when base decoder is awaiting QR scan to save egress
        const shouldFetchCp = stageChanged || forceRefresh || (!silent && waitingForUnlock);

        const results = await Promise.all([
          api.getMe(),
          shouldFetchCp ? api.getCheckpoint(knownStage) : Promise.resolve(currentCp)
        ]);
        
        prof = results[0].team;
        prog = results[0].progress;
        
        // If stage unexpectedly advanced during getMe, fetch new checkpoint
        if (prog && prog.currentStage > knownStage && prog.currentStage <= 12) {
           cp = await api.getCheckpoint(prog.currentStage);
        } else {
           cp = results[1];
        }
      } else {
        // Fallback for initial load
        const res = await api.getMe();
        prof = res.team;
        prog = res.progress;
        if (prog && prog.currentStage <= 12) {
          cp = await api.getCheckpoint(prog.currentStage);
        }
      }

      if (!prof || prof.status !== 'approved') {
        router.push('/login');
        return;
      }
      setProfile(prof);
      
      if (prog) {
        // Check if team just advanced stage (Base Decoder solved a question!)
        const prev = prevStageRef.current;
        if (prev !== null && prog.currentStage > prev) {
          const nextTarget = Math.min(prog.currentStage, 12);
          setStageClearedNotice(
            prof.operativeRole === 'Field Scout'
              ? `Challenge solved! Next stop: checkpoint ${nextTarget}`
              : `Checkpoint ${prev} cleared! Next stop: checkpoint ${nextTarget}`
          );
          setTimeout(() => setStageClearedNotice(null), 8000);
        }
        prevStageRef.current = prog.currentStage;

        setProgress(prog);
        if (cp) {
          activeCheckpointRef.current = cp;
          setActiveCheckpoint(cp);

          const isDecoder = prof.operativeRole !== 'Field Scout';
          // The Field Scout scans on campus; pop the question open on the Base Decoder's screen
          // once per checkpoint as soon as it arrives through polling
          if (isDecoder && cp.challenge && autoOpenedCheckpointRef.current !== cp.id) {
            autoOpenedCheckpointRef.current = cp.id;
            setShowChallenge(true);
          }
        }
      }
    } catch {
      console.warn('Network error during polling, skipping iteration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setNow(Date.now());
    loadData();

    // 1-second clock tick for active cooldown timers
    const clockInterval = setInterval(() => setNow(Date.now()), 1000);

    // Adaptive polling: 2.5s for fast sync
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadData(true);
      }
    }, 2500);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setNow(Date.now());
        loadData(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(clockInterval);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [router]);

  const processScanCode = async (rawCode: string): Promise<boolean> => {
    setScanNotice(null);

    // Extract code if a full URL or query string was scanned
    let cleanCode = rawCode.trim();
    try {
      if (cleanCode.startsWith('http://') || cleanCode.startsWith('https://')) {
        const url = new URL(cleanCode);
        cleanCode = url.searchParams.get('code') || 
                    url.searchParams.get('qr') || 
                    url.searchParams.get('hash') || 
                    url.searchParams.get('token') || 
                    cleanCode;
      } else if (cleanCode.includes('?code=')) {
        cleanCode = cleanCode.split('?code=')[1].split('&')[0];
      } else if (cleanCode.includes('?qr=')) {
        cleanCode = cleanCode.split('?qr=')[1].split('&')[0];
      } else if (cleanCode.includes('?token=')) {
        cleanCode = cleanCode.split('?token=')[1].split('&')[0];
      }
    } catch {}

    const result = await api.scanQr(cleanCode);

    if (result.success && result.nodeId) {
      const normNode = result.nodeId > 12 ? result.nodeId - 12 : result.nodeId;
      if (result.challenge) {
        setActiveCheckpoint((prev) => {
          const updated = prev ? { ...prev, qrScanned: true, challenge: result.challenge } : null;
          activeCheckpointRef.current = updated;
          return updated;
        });
      }
      // Reload checkpoint to sync with server state
      await loadData(true);
      setManualCode('');

      if (profile?.operativeRole === 'Field Scout') {
        setScanNotice(`Checkpoint ${normNode} scanned. Waiting for your Base Decoders.`);
      } else {
        setShowChallenge(true);
        setScanNotice(`Checkpoint ${normNode} unlocked!`);
      }
      setTimeout(() => setScanNotice(null), 6000); return true;
    } else if (result.error === 'route_mismatch') {
      alert(`🚫 ROUTE MISMATCH:\n\n${result.message || 'This QR code belongs to a different route! Verify your route target.'}`);
    } else if (result.error === 'already_completed') {
      const normNode = result.nodeId ? (result.nodeId > 12 ? result.nodeId - 12 : result.nodeId) : 1;
      const normCurrent = result.currentStage ? (result.currentStage > 12 ? result.currentStage - 12 : result.currentStage) : (progress?.currentStage || 1);
      alert(`⚠️ CHECKPOINT ALREADY BREACHED: Node 0${normNode} was already completed. Your current target is Node 0${normCurrent}.`);
    } else if (result.error === 'sequence_violation' && result.nodeId) {
      const normNode = result.nodeId > 12 ? result.nodeId - 12 : result.nodeId;
      setViolationNode(normNode);
    } else if (result.error === 'cooldown_active') {
      alert(result.message || 'SYSTEM LOCKOUT: Anti-brute-force active.');
    } else {
      alert(result.message || `UNKNOWN QR CODE (${cleanCode.substring(0, 16)}...). ACCESS DENIED.`);
    }
    return false;
  };

  const handleScanResult = async (qrHash: string) => {
    const success = await processScanCode(qrHash);
    if (success) {
      setShowScanner(false);
    }
    return success;
  };

  const handleManualCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    setManualSubmitting(true);
    await processScanCode(manualCode);
    setManualSubmitting(false);
  };

  const handleReloadStatus = async () => {
    setReloadingStatus(true);
    try {
      const wasUnlockedBefore = !!activeCheckpointRef.current?.qrScanned;
      await loadData(false, true);
      const isNowUnlocked = !!activeCheckpointRef.current?.qrScanned;
      if (!wasUnlockedBefore && isNowUnlocked) {
        const targetNode = activeCheckpointRef.current?.stage || progress?.currentStage || 1;
        setScanNotice(`QR VERIFIED: Node 0${targetNode} unlocked!`);
        setShowChallenge(true);
        setTimeout(() => setScanNotice(null), 6000);
      } else if (!isNowUnlocked) {
        setScanNotice('AWAITING FIELD SCOUT: QR code not scanned yet.');
        setTimeout(() => setScanNotice(null), 3000);
      }
    } catch {
      setScanNotice('Network error: Failed to check QR status.');
      setTimeout(() => setScanNotice(null), 3000);
    } finally {
      setReloadingStatus(false);
    }
  };

  const handleChallengeSuccess = async () => {
    setShowChallenge(false);
    await loadData(false);
  };

  if ((loading && !profile) || !profile || !progress) {
    return (
      <main className="bg-map flex min-h-dvh items-center justify-center text-muted" aria-busy="true">
        <Compass className="h-6 w-6 animate-spin" style={{ animationDuration: '3s' }} aria-hidden="true" />
        <span className="sr-only">Loading the hunt…</span>
      </main>
    );
  }

  if (progress.currentStage > 12) {
    return <VictoryScreen progress={progress} teamName={profile.teamName} />;
  }

  const cooldownSeconds = progress.cooldownUntil && now > 0 && progress.cooldownUntil > now
    ? Math.ceil((progress.cooldownUntil - now) / 1000)
    : 0;

  const isQrUnlocked = !!activeCheckpoint?.qrScanned;
  const hasChallenge = !!activeCheckpoint?.challenge;
  const currentStageDisplay = progress.currentStage;
  const stageLabel = currentStageDisplay.toString().padStart(2, '0');
  const route = profile.assignedRoute || progress.assignedRoute || 1;

  // Role- and phase-specific main action; shown in the phone bottom bar and the desktop side panel
  const primaryAction = isFieldScout ? (
    isQrUnlocked ? (
      <div className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-success/50 bg-success/10 px-4 py-3 text-center text-sm font-semibold text-success">
        <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>QR scanned · waiting for your decoders</span>
      </div>
    ) : (
      <button
        onClick={() => setShowScanner(true)}
        className="flex h-14 w-full items-center justify-center gap-2.5 rounded-lg bg-primary btn-treasure text-base font-semibold text-on-primary shadow-card transition-colors hover:bg-primary-hover active:scale-[0.99] cursor-pointer"
      >
        <ScanLine className="h-5 w-5" aria-hidden="true" />
        Scan checkpoint QR
      </button>
    )
  ) : isQrUnlocked && !hasChallenge ? (
    <div role="alert" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-center text-sm font-semibold text-danger">
      <AlertOctagon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span>No question is set for this checkpoint. Please call an organizer.</span>
    </div>
  ) : isQrUnlocked ? (
    <button
      onClick={() => setShowChallenge(true)}
      className="flex h-14 w-full items-center justify-center gap-2.5 rounded-lg bg-primary btn-treasure text-base font-semibold text-on-primary shadow-card transition-colors hover:bg-primary-hover active:scale-[0.99] cursor-pointer"
    >
      <BrainCircuit className="h-5 w-5" aria-hidden="true" />
      Solve the challenge
    </button>
  ) : (
    <div className="w-full space-y-2">
      <button
        onClick={handleReloadStatus}
        disabled={reloadingStatus}
        className="flex h-14 w-full items-center justify-center gap-2.5 rounded-lg bg-primary btn-treasure text-base font-semibold text-on-primary shadow-card transition-colors hover:bg-primary-hover disabled:opacity-60 cursor-pointer"
      >
        <RefreshCw className={`h-5 w-5 shrink-0 ${reloadingStatus ? 'animate-spin' : ''}`} aria-hidden="true" />
        {reloadingStatus ? 'Checking for the scan…' : 'Check if QR is scanned'}
      </button>
      <div className="flex items-center justify-between gap-2 px-1 text-sm text-muted">
        <span>Your Field Scout scans on campus</span>
        <button
          type="button"
          onClick={() => setShowScanner(true)}
          className="inline-flex min-h-11 items-center gap-1.5 underline underline-offset-4 transition-colors hover:text-ink cursor-pointer"
        >
          <ScanLine className="h-4 w-4" aria-hidden="true" />
          Scan with camera
        </button>
      </div>
    </div>
  );

  return (
    <main className="bg-map flex h-dvh flex-col overflow-hidden text-ink md:h-auto md:min-h-dvh md:overflow-visible">
      <header className="sticky top-0 z-30 shrink-0 border-b border-line bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2 sm:px-6 sm:py-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setShowProfile(true)}
              className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-line px-2.5 py-1 text-left transition-colors hover:border-line-strong cursor-pointer"
              title="Team profile"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                {isFieldScout ? <Footprints className="h-4 w-4" aria-hidden="true" /> : <BrainCircuit className="h-4 w-4" aria-hidden="true" />}
              </span>
              <span className="min-w-0">
                <span className="block max-w-[7.5rem] truncate text-sm font-semibold sm:max-w-[14rem]">{profile.teamName}</span>
                <span className="block text-xs text-muted">{isFieldScout ? 'Field Scout' : 'Base Decoder'}</span>
              </span>
            </button>

            <span className={`shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${
              route === 1 ? 'border-route-1/50 bg-route-1/10 text-route-1' : 'border-route-2/50 bg-route-2/10 text-route-2'
            }`}>
              Route {route}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <div className="text-right leading-tight">
              <div className="text-xs text-muted">Stage</div>
              <div className="font-mono text-base font-semibold tabular-nums text-primary">
                {stageLabel}<span className="text-muted">/12</span>
              </div>
            </div>
          </div>
        </div>
        <div className="h-1 bg-line" aria-hidden="true">
          <div className="h-full bg-primary transition-all" style={{ width: `${((currentStageDisplay - 1) / 12) * 100}%` }} />
        </div>
      </header>

      {/* Toasts */}
      <div className="pointer-events-none fixed inset-x-0 top-20 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {scanNotice && (
          <div className="flex w-full max-w-sm items-center gap-2.5 rounded-lg border border-line border-l-4 border-l-accent bg-surface p-3 text-sm shadow-raised">
            <ScanLine className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span>{scanNotice}</span>
          </div>
        )}
        {stageClearedNotice && (
          <div className="flex w-full max-w-sm items-center gap-2.5 rounded-lg border border-line border-l-4 border-l-success bg-surface p-3 text-sm font-semibold shadow-raised">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
            <span>{stageClearedNotice}</span>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto md:overflow-visible">
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-3 py-4 sm:px-6 sm:py-6 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:items-start md:gap-6 lg:py-8">
          {/* Checkpoint card */}
          <section className="rounded-xl border border-line bg-surface parchment p-4 shadow-card sm:p-6" aria-labelledby="checkpoint-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted">
                <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
                {activeCheckpoint?.area || `Sector ${stageLabel}`}
              </span>
              <span className="rounded-md border border-dashed border-primary/60 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                Checkpoint {stageLabel}
              </span>
            </div>

            <h2 id="checkpoint-title" className="mt-3 text-2xl font-bold sm:text-3xl">
              {activeCheckpoint?.title || `Checkpoint ${stageLabel}`}
            </h2>

            <div className="mt-4 rounded-lg border border-line bg-sunken p-4">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent">
                <ScrollText className="h-4 w-4" aria-hidden="true" /> Clue
              </div>
              <p className="text-base leading-relaxed">{activeCheckpoint?.clue}</p>
            </div>

            <div className={`mt-4 flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
              isQrUnlocked ? 'border-success/40 bg-success/10 text-success' : 'border-line bg-surface-2 text-muted'
            }`}>
              {isQrUnlocked ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />}
              <span>
                {isQrUnlocked
                  ? isFieldScout ? 'QR verified. Your decoders are solving the challenge.' : 'QR verified. The challenge is ready to solve.'
                  : isFieldScout ? 'Find this spot on campus and scan its QR code.' : 'Waiting for your Field Scout to scan this checkpoint.'}
              </span>
              {isBaseDecoder && !isQrUnlocked && (
                <button
                  type="button"
                  onClick={handleReloadStatus}
                  disabled={reloadingStatus}
                  title="Check if your Field Scout has scanned the QR"
                  className="ml-auto inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-line-strong px-3 text-sm font-medium text-ink transition-colors hover:border-ink/40 disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw className={`h-4 w-4 ${reloadingStatus ? 'animate-spin' : ''}`} aria-hidden="true" />
                  {reloadingStatus ? 'Checking…' : 'Reload'}
                </button>
              )}
              {isBaseDecoder && isQrUnlocked && hasChallenge && (
                <button
                  onClick={() => setShowChallenge(true)}
                  className="ml-auto inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md bg-success px-3 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90 cursor-pointer"
                >
                  Open
                </button>
              )}
            </div>
          </section>

          {/* Side panel: progress, phase and actions */}
          <aside className="space-y-4">
            <div className="rounded-xl border border-line bg-surface parchment p-4 shadow-card sm:p-5">
              <h3 className="text-sm font-semibold text-muted">Progress</h3>
              <ol className="mt-3 grid grid-cols-12 gap-1" aria-label={`Stage ${currentStageDisplay} of 12`}>
                {Array.from({ length: 12 }, (_, i) => {
                  const n = i + 1;
                  const state = n < currentStageDisplay ? 'done' : n === currentStageDisplay ? 'current' : 'todo';
                  return (
                    <li
                      key={n}
                      className={`h-2.5 rounded-full ${state === 'done' ? 'bg-primary' : state === 'current' ? 'bg-accent ring-2 ring-accent/30' : 'bg-line'}`}
                      aria-label={`Checkpoint ${n}: ${state === 'done' ? 'found' : state === 'current' ? 'current' : 'ahead'}`}
                    />
                  );
                })}
              </ol>

              <ol className="mt-4 space-y-2 text-sm">
                {[
                  { step: 1, label: 'Find & scan the QR', active: !isQrUnlocked, done: isQrUnlocked, Icon: Footprints },
                  { step: 2, label: 'Solve the challenge', active: isQrUnlocked, done: false, Icon: BrainCircuit },
                ].map(({ step, label, active, done, Icon }) => (
                  <li key={step} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 ${active ? 'bg-primary/10 font-semibold text-ink' : 'text-muted'}`}>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      done ? 'bg-success text-on-primary' : active ? 'bg-primary text-on-primary' : 'border border-line-strong'
                    }`}>
                      {done ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : step}
                    </span>
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {label}
                  </li>
                ))}
              </ol>

              <div className="mt-4 hidden md:block">{primaryAction}</div>
            </div>

            <button
              onClick={() => setShowMap(true)}
              className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-line bg-surface parchment p-3 text-left shadow-card transition-colors hover:border-line-strong cursor-pointer"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                <MapIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Treasure map</span>
                <span className="block text-sm text-muted">See every checkpoint on your route</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
            </button>

            {isBaseDecoder && !isQrUnlocked && (
              <div className="rounded-xl border border-line bg-surface parchment p-3 shadow-card">
                <button
                  type="button"
                  onClick={() => setShowManualCode(!showManualCode)}
                  aria-expanded={showManualCode}
                  className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-1 text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
                    Enter a code manually
                  </span>
                  <ChevronDown className={`h-4 w-4 text-muted transition-transform ${showManualCode ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>

                {showManualCode && (
                  <form onSubmit={handleManualCodeSubmit} className="mt-2 flex gap-2">
                    <label htmlFor="manualCode" className="sr-only">QR token</label>
                    <input
                      id="manualCode"
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={manualCode}
                      onChange={e => setManualCode(e.target.value)}
                      placeholder="QR token from your scout"
                      className="h-11 min-w-0 flex-1 rounded-md border border-line-strong bg-sunken px-3 font-mono text-base text-ink placeholder:font-sans placeholder:text-muted outline-none transition-colors focus:border-primary focus:shadow-glow sm:text-sm"
                    />
                    <button
                      type="submit"
                      disabled={manualSubmitting || !manualCode.trim()}
                      className="flex h-11 shrink-0 items-center gap-1.5 rounded-md bg-primary btn-treasure px-4 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50 cursor-pointer"
                    >
                      <Send className="h-4 w-4" aria-hidden="true" />
                      Send
                    </button>
                  </form>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* Phone action bar */}
      <div className="z-20 shrink-0 border-t border-line bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden">
        {primaryAction}
      </div>

      {/* Modals */}
      {showProfile && <TeamProfileModal profile={profile} progress={progress} onClose={() => setShowProfile(false)} />}
      {showMap && (
        <TacticalMapModal 
          progress={progress} 
          assignedRoute={profile.assignedRoute || progress.assignedRoute || 1} 
          onClose={() => setShowMap(false)} 
        />
      )}
      {showScanner && <QRScannerModal onScan={handleScanResult} onClose={() => setShowScanner(false)} />}
      
      {showChallenge && activeCheckpoint?.challenge && (
        <ChallengeModal 
          checkpoint={activeCheckpoint} 
          initialCooldown={cooldownSeconds}
          onSuccess={handleChallengeSuccess} 
          onClose={() => setShowChallenge(false)} 
        />
      )}

      {violationNode && (
        <SequenceViolationModal 
          violationNode={violationNode > 12 ? violationNode - 12 : violationNode} 
          currentNode={progress.currentStage > 12 ? progress.currentStage - 12 : progress.currentStage} 
          onClose={() => setViolationNode(null)} 
        />
      )}
    </main>
  );
}

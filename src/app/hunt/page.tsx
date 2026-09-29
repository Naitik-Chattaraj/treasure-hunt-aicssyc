'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { TeamProfile, HuntProgress, Checkpoint } from '@/types/hunt';
import { 
  User, 
  Map as MapIcon, 
  ScanLine, 
  Crosshair, 
  Compass, 
  Radio, 
  AlertOctagon, 
  KeyRound, 
  Send, 
  ShieldAlert, 
  BrainCircuit, 
  Footprints,
  CheckCircle2,
  Lock
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
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showProfile, setShowProfile] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  
  // Dynamic interaction states
  const [scannedNode, setScannedNode] = useState<number | null>(null);
  const [violationNode, setViolationNode] = useState<number | null>(null);
  const [showChallenge, setShowChallenge] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [prevStage, setPrevStage] = useState<number | null>(null);
  const [stageClearedNotice, setStageClearedNotice] = useState<string | null>(null);

  // Manual code entry state (for room team receiving code from field runners)
  const [manualCode, setManualCode] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);

  const isFieldScout = profile?.operativeRole === 'Field Scout';
  const isBaseDecoder = !isFieldScout;

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    const prof = await api.getProfile();
    if (!prof || prof.status !== 'approved') {
      router.push('/login');
      return;
    }
    setProfile(prof);
    
    const prog = await api.getProgress();
    if (prog) {
      // Check if team just advanced stage (Base Decoder solved a question!)
      setPrevStage((prev) => {
        if (prev !== null && prog.currentStage > prev) {
          const nextTarget = Math.min(prog.currentStage, 12);
          setStageClearedNotice(
            prof.operativeRole === 'Field Scout'
              ? `⚡ CHALLENGE CLEARED BY BASE DECODERS! Proceeding to Target Node 0${nextTarget}`
              : `✓ NODE 0${prev} OVERRIDDEN! Current Objective: Node 0${nextTarget}`
          );
          setTimeout(() => setStageClearedNotice(null), 8000);
        }
        return prog.currentStage;
      });

      setProgress(prog);
      if (prog.currentStage <= 12) {
        const cp = await api.getCheckpoint(prog.currentStage);
        setActiveCheckpoint(cp);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // Auto-poll checkpoint status every 3.5 seconds
    // This allows the Room Base Decoders' screen to instantly refresh as soon as Field Scouts scan on campus,
    // and allows Field Scouts on campus to instantly get notified when Base Decoders solve challenges!
    const interval = setInterval(() => {
      loadData(true);
    }, 3500);
    return () => clearInterval(interval);
  }, [router]);

  const processScanCode = async (rawCode: string) => {
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
      setScannedNode(normNode);
      if (result.challenge) {
        setActiveCheckpoint((prev) => prev ? { ...prev, qrScanned: true, challenge: result.challenge } : null);
      }
      // Reload checkpoint to sync with server state
      await loadData(true);
      setManualCode('');

      if (profile?.operativeRole === 'Field Scout') {
        setScanNotice(`QR SCAN SUCCESSFUL: Checkpoint Node 0${normNode} verified! Please wait for your Base Decoder teammates to solve the challenge.`);
      } else {
        setShowChallenge(true);
        setScanNotice(`QR VERIFIED: Node 0${normNode} challenge unlocked for Base Decoders!`);
      }
      setTimeout(() => setScanNotice(null), 6000);
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
  };

  const handleScanResult = async (qrHash: string) => {
    setShowScanner(false);
    await processScanCode(qrHash);
  };

  const handleManualCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    setManualSubmitting(true);
    await processScanCode(manualCode);
    setManualSubmitting(false);
  };

  const handleChallengeSuccess = async () => {
    setShowChallenge(false);
    await loadData(false);
  };

  if (loading && !profile) return <div className="bg-cyber-dark min-h-screen"></div>;

  if (!profile || !progress) return <div className="bg-cyber-dark min-h-screen"></div>;

  if (progress.currentStage > 12) {
    return <VictoryScreen progress={progress} teamName={profile.teamName} />;
  }

  const cooldownSeconds = progress.cooldownUntil && progress.cooldownUntil > Date.now()
    ? Math.ceil((progress.cooldownUntil - Date.now()) / 1000)
    : 0;

  const isQrUnlocked = !!activeCheckpoint?.qrScanned;
  const currentStageDisplay = progress.currentStage;

  return (
    <main className="h-[100dvh] max-h-[100dvh] bg-cyber-dark text-foreground flex flex-col relative overflow-hidden font-mono transition-colors">
      <div className="overlay-scanlines"></div>
      
      {/* Top Header */}
      <header className="shrink-0 z-10 bg-cyber-panel border-b border-cyber-cyan/40 p-2.5 sm:p-4 flex justify-between items-center shadow-[0_4px_15px_rgba(0,240,255,0.08)]">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowProfile(true)}
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-cyber-darker border border-cyber-cyan text-cyber-cyan hover:bg-cyber-cyan hover:text-cyber-dark transition-colors cyber-button-border text-xs sm:text-sm font-bold cursor-pointer"
            title="View Team Profile & Telemetry"
          >
            <User className="w-3.5 h-3.5" />
            <span className="truncate max-w-[90px] sm:max-w-[140px]">{profile.teamName}</span>
          </button>

          <span className={`px-2 py-0.5 sm:py-1 text-[10px] font-bold uppercase tracking-wider border ${
            (profile.assignedRoute || progress.assignedRoute || 1) === 1
              ? 'bg-cyan-500/15 border-cyan-400 text-cyan-400'
              : 'bg-purple-500/15 border-purple-400 text-purple-400'
          }`}>
            R-0{profile.assignedRoute || progress.assignedRoute || 1}
          </span>

          {/* Active Operative Role Badge */}
          <span className={`hidden xs:flex items-center gap-1 px-2 py-0.5 sm:py-1 text-[10px] font-bold uppercase tracking-wider border ${
            isFieldScout 
              ? 'bg-yellow-500/15 border-yellow-400 text-yellow-300'
              : 'bg-cyan-500/15 border-cyan-400 text-cyan-300'
          }`}>
            {isFieldScout ? <Footprints className="w-3 h-3" /> : <BrainCircuit className="w-3 h-3" />}
            <span>{isFieldScout ? 'FIELD SCOUT' : 'BASE DECODER'}</span>
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <div className="text-right">
            <div className="text-[9px] sm:text-[10px] text-cyber-muted font-bold tracking-widest uppercase">STAGE</div>
            <div className="text-cyber-yellow font-bold tracking-widest text-sm sm:text-base animate-pulse">
              NODE {currentStageDisplay.toString().padStart(2, '0')}/12
            </div>
          </div>
        </div>
      </header>

      {/* Floating Notice Toast */}
      {scanNotice && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[92%] bg-cyber-darker border-2 border-cyber-cyan text-white p-3 font-mono text-xs uppercase flex items-center gap-2.5 shadow-[0_0_25px_rgba(0,240,255,0.4)] backdrop-blur-md animate-bounce">
          <AlertOctagon className="w-4 h-4 text-cyber-cyan shrink-0" />
          <span className="leading-tight">{scanNotice}</span>
        </div>
      )}

      {/* Stage Cleared Real-time Notification Banner (Sync between Base Decoder & Field Scout) */}
      {stageClearedNotice && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[92%] bg-green-950/90 border-2 border-green-400 text-green-200 p-3 font-mono text-xs uppercase flex items-center gap-2.5 shadow-[0_0_25px_rgba(34,197,94,0.5)] backdrop-blur-md animate-pulse">
          <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 animate-bounce" />
          <span className="font-bold leading-tight">{stageClearedNotice}</span>
        </div>
      )}

      {/* Middle Scrollable Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-2.5 sm:py-3 space-y-3 sm:space-y-4 max-w-lg w-full mx-auto">
        {/* Active Stage Container */}
        <div className="space-y-3 sm:space-y-4">
          
          {/* Phase Status Banner (Field Scout vs Base Decoder) */}
          <div className={`p-3 border text-xs flex items-center justify-between shadow-md ${
            isQrUnlocked 
              ? 'bg-cyber-yellow/15 border-cyber-yellow text-cyber-yellow'
              : 'bg-cyber-cyan/15 border-cyber-cyan text-cyber-cyan'
          }`}>
            <div className="flex items-center gap-2 font-bold uppercase tracking-wider">
              {isQrUnlocked ? (
                <>
                  <BrainCircuit className="w-4 h-4 animate-pulse" />
                  <span>PHASE 2: BASE STATION CHALLENGE UNLOCKED</span>
                </>
              ) : (
                <>
                  <Footprints className="w-4 h-4 animate-pulse" />
                  <span>PHASE 1: FIELD SCOUTS HUNTING CAMPUS</span>
                </>
              )}
            </div>
            <span className="text-[10px] bg-cyber-darker px-2 py-0.5 border border-current font-bold uppercase">
              {isQrUnlocked ? 'DECODE' : 'RECON'}
            </span>
          </div>

          {/* Active Objective Card */}
          <div className="cyber-panel-border bg-cyber-panel border-l-4 border-cyber-cyan p-4 sm:p-5 relative shadow-lg">
            <div className="absolute top-0 right-0 bg-cyber-cyan text-cyber-dark text-[10px] px-2.5 py-0.5 font-bold uppercase tracking-wider">
              Target Node 0{currentStageDisplay}
            </div>
            
            <div className="flex items-center gap-2 text-cyber-yellow text-xs font-bold uppercase tracking-widest mt-1">
              <Crosshair className="w-4 h-4 text-cyber-cyan" />
              <span>{activeCheckpoint?.area || `Sector 0${currentStageDisplay}`}</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-foreground mt-2 mb-2">
              {activeCheckpoint?.title || `Node 0${currentStageDisplay}`}
            </h2>
            
            {/* Clue box for field runners */}
            <div className="bg-cyber-darker p-3 border border-cyber-border/70 text-xs sm:text-sm text-foreground/90 leading-relaxed font-sans mb-3">
              <div className="text-[10px] text-cyber-cyan font-mono font-bold uppercase mb-1 flex items-center gap-1">
                <Footprints className="w-3 h-3" /> Field Clue for Campus Runners:
              </div>
              {activeCheckpoint?.clue}
            </div>

            {/* Stage Status Indicator: Role-Differentiated */}
            {isQrUnlocked ? (
              <div className="p-3 bg-green-500/10 border border-green-500/50 text-green-400 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                    <span className="font-bold">Checkpoint QR Verified!</span>
                  </div>
                  {isBaseDecoder && (
                    <button
                      onClick={() => setShowChallenge(true)}
                      className="px-3 py-1 bg-green-500 text-black font-bold uppercase text-[11px] hover:bg-white transition-colors cursor-pointer"
                    >
                      Open Challenge
                    </button>
                  )}
                </div>

                {isFieldScout ? (
                  <div className="text-[11px] text-cyber-yellow bg-cyber-darker/90 p-2.5 border border-cyber-yellow/40 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-cyber-yellow animate-ping shrink-0"></div>
                    <span>QR verified. Please wait for your Base Decoder teammates in the room to solve the challenge.</span>
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-300">
                    Field team has secured this node. Decode the question now to unlock Node 0{Math.min(currentStageDisplay + 1, 12)}!
                  </div>
                )}
              </div>
            ) : (
              <div className="p-2.5 bg-cyber-darker border border-cyber-border text-xs text-cyber-muted flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-cyber-yellow shrink-0" />
                <span>
                  {isFieldScout 
                    ? `Navigate to the location and scan Node 0${currentStageDisplay} QR code.`
                    : `Challenge locked. Awaiting Field Scouts to locate and scan Node 0${currentStageDisplay} on campus.`}
                </span>
              </div>
            )}
          </div>

          {/* Mini-Map Radar Widget */}
          <div 
            onClick={() => setShowMap(true)}
            className="cursor-pointer group relative bg-cyber-panel border border-cyber-blue/50 hover:border-cyber-cyan p-3 cyber-panel-border transition-all shadow-md flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="relative w-11 h-11 rounded-full border-2 border-cyber-cyan/60 bg-cyber-darker flex items-center justify-center overflow-hidden shrink-0 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-cyber-cyan/20 to-transparent rounded-full animate-spin" style={{ animationDuration: '3s' }}></div>
                <div className="w-2 h-2 rounded-full bg-cyber-cyan z-10"></div>
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-cyber-yellow animate-ping"></div>
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-cyber-yellow"></div>
              </div>

              <div>
                <div className="text-xs font-bold text-cyber-cyan group-hover:text-cyber-yellow transition-colors flex items-center gap-1.5 uppercase tracking-wider">
                  <Compass className="w-3.5 h-3.5" />
                  Treasure Map
                </div>
                <p className="text-[11px] text-cyber-muted">Tap to view treasure hunt route map</p>
              </div>
            </div>

            <span className="text-[10px] uppercase font-bold text-cyber-cyan bg-cyber-cyan/10 border border-cyber-cyan/30 px-2 py-1">
              MAP
            </span>
          </div>

          {/* Manual Code Input Box (Only for Base Decoders in Room) */}
          {isBaseDecoder && !isQrUnlocked && (
            <div className="bg-cyber-panel border border-cyber-border p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs uppercase text-cyber-cyan font-bold tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-cyber-yellow" />
                  Base Station Code Input
                </label>
                <span className="text-[10px] text-gray-400">Field Scouts can text code</span>
              </div>

              <form onSubmit={handleManualCodeSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value)}
                  placeholder="Paste or enter QR code token"
                  className="flex-1 bg-cyber-darker border border-cyber-border focus:border-cyber-cyan px-3 py-2 text-xs font-mono text-foreground outline-none uppercase tracking-wider"
                />
                <button
                  type="submit"
                  disabled={manualSubmitting || !manualCode.trim()}
                  className="bg-cyber-cyan text-cyber-dark hover:bg-cyber-blue font-bold px-4 text-xs uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1"
                >
                  <Send className="w-3 h-3" />
                  Transmit
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Persistent Bottom Action Bar (Fixed at bottom of 100dvh viewport, role-tailored) */}
      <div className="shrink-0 p-3 sm:p-4 bg-cyber-panel/95 border-t border-cyber-cyan/30 backdrop-blur-md z-20 max-w-lg w-full mx-auto shadow-[0_-4px_15px_rgba(0,0,0,0.5)]">
        {isFieldScout ? (
          /* Field Scout View */
          isQrUnlocked ? (
            <div className="w-full flex items-center justify-center gap-3 bg-cyber-darker border-2 border-green-500/70 text-green-400 py-3 sm:py-3.5 text-xs sm:text-sm uppercase font-bold tracking-widest">
              <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-ping"></div>
              <span>CHECKPOINT SECURED // WAITING FOR BASE DECODE</span>
            </div>
          ) : (
            <button
              onClick={() => setShowScanner(true)}
              className="w-full flex items-center justify-center gap-3 cyber-button-border bg-cyber-yellow text-cyber-dark hover:bg-white py-3 sm:py-3.5 text-sm sm:text-base uppercase font-bold tracking-widest transition-all shadow-[0_0_15px_rgba(252,238,10,0.4)] cursor-pointer active:scale-[0.99]"
            >
              <ScanLine className="w-5 h-5 animate-pulse" />
              Scan Checkpoint QR Code
            </button>
          )
        ) : (
          /* Base Decoder View */
          isQrUnlocked ? (
            <button
              onClick={() => setShowChallenge(true)}
              className="w-full flex items-center justify-center gap-3 cyber-button-border bg-green-500 text-black hover:bg-white py-3 sm:py-3.5 text-sm sm:text-base uppercase font-bold tracking-widest transition-all shadow-[0_0_20px_rgba(34,197,94,0.4)] cursor-pointer active:scale-[0.99]"
            >
              <BrainCircuit className="w-5 h-5 animate-pulse" />
              SOLVE ETCHED QUESTION
            </button>
          ) : (
            <button
              onClick={() => setShowScanner(true)}
              className="w-full flex items-center justify-center gap-3 cyber-button-border bg-cyber-cyan/20 border border-cyber-cyan text-cyber-cyan hover:bg-cyber-cyan hover:text-black py-3 sm:py-3.5 text-xs sm:text-sm uppercase font-bold tracking-widest transition-all cursor-pointer active:scale-[0.99]"
            >
              <ScanLine className="w-4 h-4 animate-pulse" />
              AWAITING FIELD SCOUT SCAN (OR SCAN DIRECTLY)
            </button>
          )
        )}
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

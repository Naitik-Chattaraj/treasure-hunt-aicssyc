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

  // Manual code entry state (for room team receiving code from field runners)
  const [manualCode, setManualCode] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);

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
    // This allows the Room Base Decoders' screen to instantly refresh as soon as Field Scouts scan on campus!
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
      setScannedNode(result.nodeId);
      if (result.challenge) {
        setActiveCheckpoint((prev) => prev ? { ...prev, qrScanned: true, challenge: result.challenge } : null);
      }
      // Reload checkpoint to sync with server state
      await loadData(true);
      setShowChallenge(true);
      setManualCode('');
      setScanNotice(`QR VERIFIED: Node 0${result.nodeId} challenge unlocked for Base Decoders!`);
      setTimeout(() => setScanNotice(null), 5000);
    } else if (result.error === 'route_mismatch') {
      alert(`🚫 ROUTE MISMATCH:\n\n${result.message || 'This QR code belongs to a different route! Verify your route target.'}`);
    } else if (result.error === 'already_completed') {
      alert(`⚠️ CHECKPOINT ALREADY BREACHED: Node 0${result.nodeId} was already completed. Your current target is Node 0${result.currentStage || progress?.currentStage || 1}.`);
    } else if (result.error === 'sequence_violation' && result.nodeId) {
      setViolationNode(result.nodeId);
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

  return (
    <main className="min-h-screen bg-cyber-dark text-foreground flex flex-col relative overflow-hidden font-mono transition-colors">
      <div className="overlay-scanlines"></div>
      
      {/* Top Header */}
      <header className="z-10 bg-cyber-panel border-b border-cyber-cyan/40 p-3 sm:p-4 flex justify-between items-center shadow-[0_4px_15px_rgba(0,240,255,0.08)]">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowProfile(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-cyber-darker border border-cyber-cyan text-cyber-cyan hover:bg-cyber-cyan hover:text-cyber-dark transition-colors cyber-button-border text-xs sm:text-sm font-bold cursor-pointer"
            title="View Team Profile & Telemetry"
          >
            <User className="w-3.5 h-3.5" />
            <span className="truncate max-w-[110px] sm:max-w-[160px]">{profile.teamName}</span>
          </button>

          <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider border ${
            (profile.assignedRoute || progress.assignedRoute || 1) === 1
              ? 'bg-cyan-500/15 border-cyan-400 text-cyan-400'
              : 'bg-purple-500/15 border-purple-400 text-purple-400'
          }`}>
            ROUTE 0{profile.assignedRoute || progress.assignedRoute || 1}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <div className="text-right">
            <div className="text-[9px] sm:text-[10px] text-cyber-muted font-bold tracking-widest uppercase">STAGE</div>
            <div className="text-cyber-yellow font-bold tracking-widest text-sm sm:text-base animate-pulse">
              NODE {progress.currentStage.toString().padStart(2, '0')}/12
            </div>
          </div>
        </div>
      </header>

      {/* Floating Notice Toast */}
      {scanNotice && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[92%] bg-cyber-darker border-2 border-cyber-cyan text-white p-3 font-mono text-xs uppercase flex items-center gap-2 shadow-[0_0_20px_rgba(0,240,255,0.4)] backdrop-blur-md animate-bounce">
          <AlertOctagon className="w-5 h-5 text-cyber-cyan shrink-0" />
          <span>{scanNotice}</span>
        </div>
      )}

      {/* Main HUD Area */}
      <div className="flex-1 p-4 flex flex-col z-10 max-w-lg w-full mx-auto justify-between space-y-4">
        
        {/* Active Stage Container */}
        <div className="space-y-4">
          
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
              Target Node 0{progress.currentStage}
            </div>
            
            <div className="flex items-center gap-2 text-cyber-yellow text-xs font-bold uppercase tracking-widest mt-1">
              <Crosshair className="w-4 h-4 text-cyber-cyan" />
              <span>{activeCheckpoint?.area || `Sector 0${progress.currentStage}`}</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-foreground mt-2 mb-2">
              {activeCheckpoint?.title || `Node 0${progress.currentStage}`}
            </h2>
            
            {/* Clue box for field runners */}
            <div className="bg-cyber-darker p-3 border border-cyber-border/70 text-xs sm:text-sm text-foreground/90 leading-relaxed font-sans mb-3">
              <div className="text-[10px] text-cyber-cyan font-mono font-bold uppercase mb-1 flex items-center gap-1">
                <Footprints className="w-3 h-3" /> Field Clue for Campus Runners:
              </div>
              {activeCheckpoint?.clue}
            </div>

            {/* Stage Status Indicator */}
            {isQrUnlocked ? (
              <div className="p-3 bg-green-500/10 border border-green-500/50 text-green-400 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="font-bold">QR Token Authenticated!</span>
                </div>
                <button
                  onClick={() => setShowChallenge(true)}
                  className="px-3 py-1 bg-green-500 text-black font-bold uppercase text-[11px] hover:bg-white transition-colors cursor-pointer"
                >
                  Open Challenge
                </button>
              </div>
            ) : (
              <div className="p-2.5 bg-cyber-darker border border-cyber-border text-xs text-cyber-muted flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-cyber-yellow shrink-0" />
                <span>Challenge locked. Field Scouts must scan or transmit the checkpoint code.</span>
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
                  Tactical Campus Map
                </div>
                <p className="text-[11px] text-cyber-muted">Tap to view full campus node layout</p>
              </div>
            </div>

            <span className="text-[10px] uppercase font-bold text-cyber-cyan bg-cyber-cyan/10 border border-cyber-cyan/30 px-2 py-1">
              MAP
            </span>
          </div>

          {/* Manual Code Input Box (For Base Room Decoders receiving code from Field Scouts) */}
          {!isQrUnlocked && (
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

        {/* Action Buttons (Bottom area) */}
        <div className="space-y-3 pt-4 mb-2">
          {isQrUnlocked ? (
            <button
              onClick={() => setShowChallenge(true)}
              className="w-full flex items-center justify-center gap-3 cyber-button-border bg-green-500 text-black hover:bg-white py-4 text-base uppercase font-bold tracking-widest transition-all shadow-[0_0_20px_rgba(34,197,94,0.4)] cursor-pointer"
            >
              <BrainCircuit className="w-5 h-5 animate-pulse" />
              SOLVE ETCHED QUESTION
            </button>
          ) : (
            <button
              onClick={() => setShowScanner(true)}
              className="w-full flex items-center justify-center gap-3 cyber-button-border bg-cyber-yellow text-cyber-dark hover:bg-white py-4 text-base uppercase font-bold tracking-widest transition-all shadow-[0_0_15px_rgba(252,238,10,0.4)] cursor-pointer"
            >
              <ScanLine className="w-5 h-5 animate-pulse" />
              Scan Checkpoint QR Code
            </button>
          )}
        </div>
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
          violationNode={violationNode} 
          currentNode={progress.currentStage} 
          onClose={() => setViolationNode(null)} 
        />
      )}
    </main>
  );
}

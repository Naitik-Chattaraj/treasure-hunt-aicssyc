'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { TeamProfile, HuntProgress, Checkpoint } from '@/types/hunt';
import { User, Map as MapIcon, ScanLine, Crosshair, Compass, Radio } from 'lucide-react';
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

  const loadData = async () => {
    const prof = await api.getProfile();
    if (!prof) {
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
  }, [router]);

  const handleScanResult = (qrHash: string) => {
    setShowScanner(false);
    // Find if the hash matches any checkpoint
    api.getAllCheckpoints().then(checkpoints => {
      const matchedNode = checkpoints.find(c => c.qrHash === qrHash);
      if (!matchedNode) {
        // Unknown QR code
        alert('UNKNOWN QR CODE. ACCESS DENIED.');
        return;
      }
      
      if (!progress) return;

      if (matchedNode.id === progress.currentStage) {
        // Correct node scanned! Show challenge.
        setScannedNode(matchedNode.id);
        setShowChallenge(true);
      } else if (matchedNode.id < progress.currentStage) {
        // Already completed
        alert(`NODE 0${matchedNode.id} ALREADY COMPROMISED. CURRENT TARGET: NODE 0${progress.currentStage}`);
      } else {
        // Sequence violation (future node)
        setViolationNode(matchedNode.id);
      }
    });
  };

  const handleChallengeSuccess = async () => {
    setShowChallenge(false);
    await loadData(); // Reload progress and next checkpoint
  };

  if (loading || !profile || !progress) return <div className="bg-cyber-dark min-h-screen"></div>;

  if (progress.currentStage > 12) {
    return <VictoryScreen progress={progress} teamName={profile.teamName} />;
  }

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

      {/* Main HUD Area */}
      <div className="flex-1 p-4 flex flex-col z-10 max-w-lg w-full mx-auto justify-between">
        
        {/* Active Objective & GTA-Style Mini-Map */}
        <div className="space-y-4">
          {/* Active Objective Card */}
          <div className="cyber-panel-border bg-cyber-panel border-l-4 border-cyber-cyan p-4 sm:p-5 relative shadow-lg">
            <div className="absolute top-0 right-0 bg-cyber-cyan text-cyber-dark text-[10px] px-2.5 py-0.5 font-bold uppercase tracking-wider">
              Target Node
            </div>
            
            <div className="flex items-center gap-2 text-cyber-yellow text-xs font-bold uppercase tracking-widest mt-1">
              <Crosshair className="w-4 h-4 text-cyber-cyan" />
              <span>{activeCheckpoint?.area}</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-foreground mt-2 mb-2">
              {activeCheckpoint?.title}
            </h2>
            
            <div className="bg-cyber-darker p-3 border border-cyber-border/70 text-xs sm:text-sm text-foreground/90 leading-relaxed font-sans mb-2">
              {activeCheckpoint?.clue}
            </div>

            <div className="flex justify-between items-center text-[10px] text-cyber-muted pt-1">
              <span className="flex items-center gap-1">
                <Radio className="w-3 h-3 text-cyber-cyan animate-pulse" />
                GPS BEACON ACTIVE
              </span>
              <span>SEQUENCE LOCKED (STRICT ORDER)</span>
            </div>
          </div>

          {/* GTA Mini-Map Radar Widget */}
          <div 
            onClick={() => setShowMap(true)}
            className="cursor-pointer group relative bg-cyber-panel border border-cyber-blue/50 hover:border-cyber-cyan p-3 cyber-panel-border transition-all shadow-md flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              {/* Radar Circle */}
              <div className="relative w-12 h-12 rounded-full border-2 border-cyber-cyan/60 bg-cyber-darker flex items-center justify-center overflow-hidden shrink-0 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
                {/* Radar sweep */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-cyber-cyan/20 to-transparent rounded-full animate-spin" style={{ animationDuration: '3s' }}></div>
                {/* Center point */}
                <div className="w-2 h-2 rounded-full bg-cyber-cyan z-10"></div>
                {/* Target blip */}
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-cyber-yellow animate-ping"></div>
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-cyber-yellow"></div>
              </div>

              <div>
                <div className="text-xs font-bold text-cyber-cyan group-hover:text-cyber-yellow transition-colors flex items-center gap-1.5 uppercase tracking-wider">
                  <Compass className="w-3.5 h-3.5" />
                  Mini-Map Radar
                </div>
                <p className="text-[11px] text-cyber-muted">Tap to open full campus Treasure Map</p>
              </div>
            </div>

            <span className="text-[10px] uppercase font-bold text-cyber-cyan bg-cyber-cyan/10 border border-cyber-cyan/30 px-2 py-1">
              EXPAND
            </span>
          </div>
        </div>

        {/* Action Buttons (Bottom area) */}
        <div className="space-y-3 pt-6 mb-2">
          <button
            onClick={() => setShowMap(true)}
            className="w-full flex items-center justify-center gap-2.5 cyber-button-border bg-cyber-panel border border-cyber-blue text-cyber-blue hover:bg-cyber-blue hover:text-cyber-dark py-3.5 uppercase font-bold tracking-widest text-sm transition-all shadow-[0_0_10px_rgba(5,217,232,0.15)] cursor-pointer"
          >
            <MapIcon className="w-4 h-4" />
            Treasure Map
          </button>
          
          <button
            onClick={() => setShowScanner(true)}
            className="w-full flex items-center justify-center gap-3 cyber-button-border bg-cyber-yellow text-cyber-dark hover:bg-white py-4 text-base uppercase font-bold tracking-widest transition-all shadow-[0_0_15px_rgba(252,238,10,0.4)] cursor-pointer"
          >
            <ScanLine className="w-5 h-5 animate-pulse" />
            Initiate Scan
          </button>
        </div>
      </div>

      {/* Modals */}
      {showProfile && <TeamProfileModal profile={profile} progress={progress} onClose={() => setShowProfile(false)} />}
      {showMap && <TacticalMapModal progress={progress} onClose={() => setShowMap(false)} />}
      {showScanner && <QRScannerModal onScan={handleScanResult} onClose={() => setShowScanner(false)} />}
      
      {showChallenge && scannedNode === progress.currentStage && activeCheckpoint && (
        <ChallengeModal 
          checkpoint={activeCheckpoint} 
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

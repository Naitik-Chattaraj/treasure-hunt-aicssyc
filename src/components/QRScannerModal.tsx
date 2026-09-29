'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import QrScanner from 'qr-scanner';
import { 
  X, 
  Camera, 
  Upload, 
  AlertTriangle, 
  RefreshCw, 
  KeyRound, 
  FlipHorizontal, 
  CheckCircle2,
  Zap,
  ZapOff,
  Crosshair,
  Gauge
} from 'lucide-react';

// Configure Web Worker path for browsers without native BarcodeDetector
if (typeof window !== 'undefined') {
  QrScanner.WORKER_PATH = '/qr-scanner-worker.min.js';
}

// Tactile audio & haptic trigger for instant scan feedback
function triggerHapticAndSound() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate([40, 30, 40]);
    } catch {}
  }
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.07);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.07);
    }
  } catch {}
}

export default function QRScannerModal({ 
  onScan, 
  onClose 
}: { 
  onScan: (qrText: string) => void;
  onClose: () => void; 
}) {
  const [error, setError] = useState<string | null>(null);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [scanFailed, setScanFailed] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [activeCameraIndex, setActiveCameraIndex] = useState(0);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [isScanningActive, setIsScanningActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const onScanRef = useRef(onScan);
  const hasDetectedRef = useRef(false);
  const isOperatingRef = useRef(false);

  // Keep onScanRef always up to date without triggering re-initialization
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // Clean up scanner instance
  const cleanupScanner = useCallback(() => {
    if (scannerRef.current) {
      try {
        scannerRef.current.stop();
        scannerRef.current.destroy();
      } catch (e) {
        console.warn('Scanner cleanup warning:', e);
      } finally {
        scannerRef.current = null;
      }
    }
    setIsScanningActive(false);
  }, []);

  // Handle detected QR Code
  const handleDetected = useCallback((rawCode: string) => {
    if (hasDetectedRef.current) return;
    hasDetectedRef.current = true;
    setScanSuccess(true);
    setIsScanningActive(false);

    triggerHapticAndSound();

    // Trigger parent callback immediately
    onScanRef.current(rawCode.trim());

    // Clean up hardware after visual confirmation
    setTimeout(() => {
      cleanupScanner();
    }, 250);
  }, [cleanupScanner]);

  // Initialize and start QrScanner
  const startScanner = useCallback(async (cameraId?: string) => {
    if (isOperatingRef.current || !videoRef.current) return;
    isOperatingRef.current = true;
    hasDetectedRef.current = false;

    setError(null);
    setScanFailed(false);
    setScanSuccess(false);
    setTorchOn(false);
    setTorchSupported(false);

    cleanupScanner();

    try {
      const scanner = new QrScanner(
        videoRef.current,
        (result) => {
          if (result && result.data) {
            handleDetected(result.data);
          }
        },
        {
          preferredCamera: cameraId || 'environment',
          maxScansPerSecond: 25,
          highlightScanRegion: false,
          highlightCodeOutline: true,
          returnDetailedScanResult: true,
        }
      );

      scannerRef.current = scanner;
      await scanner.start();
      setIsScanningActive(true);

      // Check flashlight/torch support
      try {
        const hasTorch = await scanner.hasFlash();
        setTorchSupported(hasTorch);
      } catch {}

      // Asynchronously fetch device cameras without blocking video start
      QrScanner.listCameras(true)
        .then((available) => {
          if (available && available.length > 0) {
            setCameras(available);
            if (cameraId) {
              const idx = available.findIndex((c) => c.id === cameraId);
              if (idx !== -1) setActiveCameraIndex(idx);
            }
          }
        })
        .catch(() => {});

    } catch (err: unknown) {
      console.error('QR Scanner hardware init failure:', err);
      const msg = typeof err === 'string' ? err : (err as { message?: string })?.message || 'Camera permission denied or camera in use.';
      setError(`CAMERA ERROR: ${msg}`);
      setScanFailed(true);
    } finally {
      isOperatingRef.current = false;
    }
  }, [cleanupScanner, handleDetected]);

  // Start scanner once on mount
  useEffect(() => {
    startScanner();
    return () => {
      cleanupScanner();
    };
  }, [startScanner, cleanupScanner]);

  // Torch / Flashlight Toggle
  const handleToggleTorch = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.toggleFlash();
        setTorchOn(scannerRef.current.isFlashOn());
      }
    } catch (err) {
      console.warn('Torch toggle error:', err);
    }
  };

  // Flip Camera between back and front
  const handleFlipCamera = async () => {
    if (cameras.length < 2 || !scannerRef.current) return;
    const nextIdx = (activeCameraIndex + 1) % cameras.length;
    setActiveCameraIndex(nextIdx);
    const targetCam = cameras[nextIdx];

    try {
      await scannerRef.current.setCamera(targetCam.id);
      try {
        const hasTorch = await scannerRef.current.hasFlash();
        setTorchSupported(hasTorch);
        setTorchOn(false);
      } catch {}
    } catch {
      await startScanner(targetCam.id);
    }
  };

  // Manual code submission
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    cleanupScanner();
    onScanRef.current(manualCode.trim());
  };

  // High-performance direct image scanning
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setScanFailed(false);

    try {
      const result = await QrScanner.scanImage(file, {
        returnDetailedScanResult: true,
        alsoTryWithoutScanRegion: true,
      });

      if (result && result.data) {
        handleDetected(result.data.trim());
      } else {
        throw new Error('No QR code detected');
      }
    } catch {
      setError('DECODER ERROR: Could not extract a valid QR code from the uploaded photo. Please ensure good lighting and clear focus, or paste the token directly.');
      setScanFailed(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md transition-colors font-mono">
      <div className="w-full max-w-md bg-cyber-panel cyber-panel-border border-2 border-cyber-yellow shadow-[0_0_25px_rgba(252,238,10,0.25)] p-5 sm:p-6 relative max-h-[92vh] overflow-y-auto">
        
        {/* Close Button */}
        <button 
          onClick={() => {
            cleanupScanner();
            onClose();
          }} 
          className="absolute top-4 right-4 text-cyber-muted hover:text-cyber-yellow transition-colors cursor-pointer"
          aria-label="Close Scanner"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Modal Header & Controls */}
        <div className="flex justify-between items-center mb-3 pr-8">
          <h2 className="text-lg font-bold text-cyber-yellow tracking-widest uppercase flex items-center gap-2">
            <Camera className="w-5 h-5 text-cyber-yellow" />
            Checkpoint Scanner
          </h2>

          <div className="flex items-center gap-2">
            {torchSupported && !scanFailed && (
              <button
                type="button"
                onClick={handleToggleTorch}
                className={`flex items-center gap-1 text-[11px] px-2.5 py-1 border transition-all cursor-pointer font-bold ${
                  torchOn 
                    ? 'bg-cyber-yellow text-black border-cyber-yellow shadow-[0_0_12px_rgba(252,238,10,0.6)]' 
                    : 'bg-cyber-darker border-cyber-yellow/40 text-cyber-yellow hover:bg-cyber-yellow/20'
                }`}
                title={torchOn ? 'Turn Flashlight Off' : 'Turn Flashlight On'}
              >
                {torchOn ? <ZapOff className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5 text-cyber-yellow" />}
                <span>{torchOn ? 'LIGHT ON' : 'TORCH'}</span>
              </button>
            )}

            {cameras.length > 1 && !scanFailed && (
              <button
                type="button"
                onClick={handleFlipCamera}
                className="flex items-center gap-1 text-[11px] px-2 py-1 bg-cyber-darker border border-cyber-yellow/40 text-cyber-yellow hover:bg-cyber-yellow hover:text-black transition-colors cursor-pointer"
                title="Switch Camera"
              >
                <FlipHorizontal className="w-3.5 h-3.5" />
                <span>FLIP</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Camera Viewfinder (Direct HTML5 Video element) */}
        <div className="relative mb-3 border-2 border-cyber-yellow/80 overflow-hidden bg-black min-h-[260px] max-h-[340px] flex items-center justify-center">
          
          <video 
            ref={videoRef}
            className="w-full h-full object-cover min-h-[260px] max-h-[340px]"
            playsInline
            muted
          />

          {/* Success Flash Overlay */}
          {scanSuccess && (
            <div className="absolute inset-0 bg-green-500/40 flex flex-col items-center justify-center text-white backdrop-blur-xs z-30 animate-pulse">
              <CheckCircle2 className="w-16 h-16 text-green-300 mb-2 drop-shadow-[0_0_12px_rgba(74,222,128,0.8)]" />
              <div className="text-sm font-bold uppercase tracking-wider bg-black/90 px-3 py-1.5 border border-green-400 text-green-300 shadow-lg">
                QR CODE VERIFIED!
              </div>
            </div>
          )}

          {/* Cyberpunk HUD Reticle & Laser Sweep */}
          {!scanSuccess && (
            <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-2.5 z-20">
              <div className="flex justify-between items-center text-cyber-yellow/90 text-[10px] bg-black/75 px-2 py-1 border border-cyber-yellow/30">
                <span className="flex items-center gap-1.5 font-bold">
                  <span className={`w-2 h-2 rounded-full ${isScanningActive ? 'bg-cyber-green animate-ping' : 'bg-cyber-yellow'}`}></span>
                  {isScanningActive ? 'SENSOR ACTIVE' : 'INITIALIZING...'}
                </span>
                <span className="text-[9px] text-cyber-cyan flex items-center gap-1">
                  <Gauge className="w-3 h-3 text-cyber-cyan" />
                  TURBO DECODER
                </span>
              </div>

              {/* Central Target Reticle & High-speed Laser Sweep */}
              <div className="relative flex items-center justify-center my-auto">
                <div className="relative w-48 h-48 rounded border border-cyber-yellow/40 flex items-center justify-center shadow-[0_0_20px_rgba(252,238,10,0.15)]">
                  {/* Corner Reticle Accents */}
                  <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-cyber-yellow"></div>
                  <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-cyber-yellow"></div>
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-cyber-yellow"></div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-cyber-yellow"></div>
                  
                  {/* Center Crosshair */}
                  <Crosshair className="w-6 h-6 text-cyber-yellow/40" />

                  {/* Laser Sweep Beam */}
                  <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-cyber-cyan to-transparent shadow-[0_0_10px_#00f0ff] laser-beam pointer-events-none"></div>
                </div>
              </div>

              <div className="text-center text-[10px] text-cyber-yellow font-bold tracking-widest bg-black/85 py-1 border-t border-cyber-yellow/30">
                ALIGN QR CODE IN RETICLE
              </div>
            </div>
          )}
        </div>

        {/* Camera Error Alert */}
        {scanFailed && (
          <div className="bg-cyber-pink/20 border border-cyber-pink text-cyber-pink px-3 py-2 text-xs mb-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="text-[11px] leading-relaxed">{error}</div>
          </div>
        )}

        {/* Manual Input & Image Upload */}
        <div className="space-y-3 pt-1 border-t border-cyber-border">
          <form onSubmit={handleManualSubmit} className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[11px] uppercase text-cyber-cyan font-bold tracking-wider flex items-center gap-1">
                <KeyRound className="w-3 h-3 text-cyber-yellow" />
                Or Paste / Type Code Directly
              </label>
              <span className="text-[9px] text-gray-400">If camera cannot focus</span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                placeholder="Paste SHA-256 token"
                className="flex-1 bg-cyber-darker border border-cyber-border focus:border-cyber-cyan text-foreground px-3 py-2 text-xs font-mono outline-none uppercase tracking-wider"
              />
              <button 
                type="submit"
                disabled={!manualCode.trim()}
                className="bg-cyber-yellow text-black px-4 font-bold text-xs uppercase hover:bg-white transition-colors cursor-pointer disabled:opacity-50"
              >
                Submit
              </button>
            </div>
          </form>

          <div className="flex items-center justify-between pt-1">
            <label className="text-[11px] text-gray-400 hover:text-cyber-cyan flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload QR Photo from Gallery</span>
              <input 
                type="file" 
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => startScanner()}
              className="text-[11px] text-cyber-yellow hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Reset Camera
            </button>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes laserSweep {
          0% { top: 12%; opacity: 0.3; }
          50% { top: 88%; opacity: 1; }
          100% { top: 12%; opacity: 0.3; }
        }
        .laser-beam {
          animation: laserSweep 1.6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

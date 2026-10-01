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
  onScan: (qrText: string) => Promise<boolean> | void;
  onClose: () => void; 
}) {
  const [error, setError] = useState<string | null>(null);
  const [scanState, setScanState] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
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
  const handleDetected = useCallback(async (rawCode: string) => {
    if (hasDetectedRef.current) return;
    hasDetectedRef.current = true;
    setScanState('verifying');
    setIsScanningActive(false);

    triggerHapticAndSound();

    try {
      const result = await onScanRef.current(rawCode.trim());
      if (result === false) {
        setScanState('error');
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate([100, 50, 100]); } catch {}
        }
        setTimeout(() => {
          hasDetectedRef.current = false;
          setScanState('idle');
          if (scannerRef.current) {
            scannerRef.current.start().then(() => setIsScanningActive(true)).catch(() => {});
          }
        }, 1500);
        return;
      }
      
      setScanState('success');
      setTimeout(() => {
        cleanupScanner();
      }, 350);
    } catch {
      setScanState('success');
      setTimeout(() => {
        cleanupScanner();
      }, 350);
    }
  }, [cleanupScanner]);

  // Initialize and start QrScanner
  const startScanner = useCallback(async (cameraId?: string) => {
    if (isOperatingRef.current || !videoRef.current) return;
    isOperatingRef.current = true;
    hasDetectedRef.current = false;

    setError(null);
    setScanFailed(false);
    setScanState('idle');
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

  const closeScanner = () => {
    cleanupScanner();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scanner-title"
        className="relative max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-4 shadow-raised sm:max-w-md sm:rounded-xl sm:p-5"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="scanner-title" className="flex items-center gap-2 text-lg font-bold">
            <Camera className="h-5 w-5 text-primary" aria-hidden="true" />
            Scan checkpoint
          </h2>

          <div className="flex items-center gap-1">
            {torchSupported && !scanFailed && (
              <button
                type="button"
                onClick={handleToggleTorch}
                aria-pressed={torchOn}
                className={`flex h-11 w-11 items-center justify-center rounded-md border transition-colors cursor-pointer ${
                  torchOn ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-muted hover:text-ink'
                }`}
                aria-label={torchOn ? 'Turn flashlight off' : 'Turn flashlight on'}
              >
                {torchOn ? <ZapOff className="h-5 w-5" aria-hidden="true" /> : <Zap className="h-5 w-5" aria-hidden="true" />}
              </button>
            )}

            {cameras.length > 1 && !scanFailed && (
              <button
                type="button"
                onClick={handleFlipCamera}
                className="flex h-11 w-11 items-center justify-center rounded-md border border-line bg-surface text-muted transition-colors hover:text-ink cursor-pointer"
                aria-label="Switch camera"
              >
                <FlipHorizontal className="h-5 w-5" aria-hidden="true" />
              </button>
            )}

            <button 
              onClick={closeScanner}
              className="flex h-11 w-11 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
              aria-label="Close scanner"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Live camera viewfinder; overlays stay white-on-black so they read against any video */}
        <div className="relative mb-3 flex aspect-square max-h-[55dvh] w-full items-center justify-center overflow-hidden rounded-lg bg-black">
          <video 
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
          />

          {scanState === 'verifying' && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 text-white" role="status">
              <RefreshCw className="mb-2 h-12 w-12 animate-spin" aria-hidden="true" />
              <div className="rounded-md bg-black/80 px-3 py-1.5 text-sm font-semibold">Checking code…</div>
            </div>
          )}

          {scanState === 'success' && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-success/40 text-white" role="status">
              <CheckCircle2 className="mb-2 h-14 w-14" aria-hidden="true" />
              <div className="rounded-md bg-black/80 px-3 py-1.5 text-sm font-semibold">QR code accepted</div>
            </div>
          )}

          {scanState === 'error' && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-danger/40 text-white" role="alert">
              <X className="mb-2 h-14 w-14" aria-hidden="true" />
              <div className="rounded-md bg-black/80 px-3 py-1.5 text-sm font-semibold">Not a valid checkpoint code</div>
            </div>
          )}

          {scanState === 'idle' && (
            <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3">
              <span className="flex w-fit items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white">
                <span className={`h-2 w-2 rounded-full ${isScanningActive ? 'bg-success' : 'bg-white/60'}`} aria-hidden="true" />
                {isScanningActive ? 'Camera on · scanning' : 'Starting camera…'}
              </span>

              <div className="relative mx-auto my-auto h-52 w-52">
                <div className="absolute -left-0.5 -top-0.5 h-6 w-6 rounded-tl-lg border-l-4 border-t-4 border-white" />
                <div className="absolute -right-0.5 -top-0.5 h-6 w-6 rounded-tr-lg border-r-4 border-t-4 border-white" />
                <div className="absolute -bottom-0.5 -left-0.5 h-6 w-6 rounded-bl-lg border-b-4 border-l-4 border-white" />
                <div className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-br-lg border-b-4 border-r-4 border-white" />
                {isScanningActive && <div className="laser-beam absolute left-3 right-3 h-0.5 rounded-full bg-primary" />}
              </div>

              <p className="mx-auto rounded-md bg-black/70 px-3 py-1 text-center text-sm text-white">
                Fit the QR code inside the frame
              </p>
            </div>
          )}
        </div>

        {scanFailed && (
          <div role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-danger/50 bg-danger/10 px-3 py-2.5 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>{error}</div>
          </div>
        )}

        <div className="space-y-3 border-t border-line pt-3">
          <form onSubmit={handleManualSubmit}>
            <label htmlFor="scannerManualCode" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
              Camera won&apos;t focus? Type the code
            </label>
            <div className="flex gap-2">
              <input
                id="scannerManualCode"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                placeholder="Code printed under the QR"
                className="h-11 min-w-0 flex-1 rounded-md border border-line-strong bg-sunken px-3 font-mono text-base text-ink placeholder:font-sans placeholder:text-muted outline-none transition-colors focus:border-primary focus:shadow-glow sm:text-sm"
              />
              <button 
                type="submit"
                disabled={!manualCode.trim()}
                className="h-11 shrink-0 rounded-md bg-primary px-4 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50 cursor-pointer"
              >
                Submit
              </button>
            </div>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-1 text-sm text-muted transition-colors hover:text-ink focus-within:ring-2 focus-within:ring-primary">
              <Upload className="h-4 w-4" aria-hidden="true" />
              Upload a photo of the QR
              <input 
                type="file" 
                accept="image/*"
                onChange={handleFileUpload}
                className="sr-only"
              />
            </label>

            <button
              type="button"
              onClick={() => startScanner()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm text-muted transition-colors hover:text-ink cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Restart camera
            </button>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes laserSweep {
          0% { top: 8%; opacity: 0.4; }
          50% { top: 92%; opacity: 1; }
          100% { top: 8%; opacity: 0.4; }
        }
        .laser-beam {
          animation: laserSweep 1.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

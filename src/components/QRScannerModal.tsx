'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, CameraDevice } from 'html5-qrcode';
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

// Helper to add white quiet zone (margin) to cropped images before decoding
async function padImageQuietZone(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const padding = Math.max(35, Math.floor(Math.min(img.width, img.height) * 0.15));
        canvas.width = img.width + padding * 2;
        canvas.height = img.height + padding * 2;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          return resolve(file);
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, padding, padding);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob) {
            resolve(new File([blob], 'padded_' + file.name, { type: 'image/png' }));
          } else {
            resolve(file);
          }
        }, 'image/png');
      } catch {
        URL.revokeObjectURL(url);
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
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
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [activeCameraIndex, setActiveCameraIndex] = useState(0);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [isScanningActive, setIsScanningActive] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isOperatingRef = useRef(false);
  const hasDetectedRef = useRef(false);

  // Complete cleanup of scanner hardware
  const cleanupScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (e) {
        console.warn('Scanner cleanup warning:', e);
      } finally {
        scannerRef.current = null;
      }
    }

    const container = document.getElementById('reader');
    if (container) {
      container.innerHTML = '';
    }
  }, []);

  // Central trigger when a QR code is detected
  const handleDetected = useCallback((rawCode: string) => {
    if (hasDetectedRef.current) return;
    hasDetectedRef.current = true;
    setScanSuccess(true);
    setIsScanningActive(false);

    triggerHapticAndSound();

    // Trigger onScan immediately!
    onScan(rawCode.trim());

    // Clean up scanner in background after quick visual confirmation
    setTimeout(() => {
      cleanupScanner().catch(() => {});
    }, 250);
  }, [onScan, cleanupScanner]);

  // Start Scanner
  const startScanner = useCallback(async (cameraId?: string) => {
    if (isOperatingRef.current) return;
    isOperatingRef.current = true;
    hasDetectedRef.current = false;

    setError(null);
    setScanFailed(false);
    setScanSuccess(false);
    setTorchOn(false);
    setTorchSupported(false);

    await cleanupScanner();

    try {
      // 1. Initialize Html5Qrcode with hardware acceleration and QR_CODE format only (10x faster)
      const scanner = new Html5Qrcode('reader', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        useBarCodeDetectorIfSupported: true,
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
      });
      scannerRef.current = scanner;

      // 2. Camera Constraint: Use direct facingMode constraint so it starts IMMEDIATELY without waiting for camera enumeration!
      const cameraConstraint = cameraId ? cameraId : { facingMode: 'environment' };

      // 3. High-performance scanner config with optimal 24 FPS and bounded target reticle (dramatically fewer pixels to process)
      const config = {
        fps: 24,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minDim = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.floor(minDim * 0.85);
          return {
            width: Math.max(220, size),
            height: Math.max(220, size),
          };
        },
        aspectRatio: 1.0,
        videoConstraints: {
          facingMode: 'environment',
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
        },
      };

      await scanner.start(
        cameraConstraint,
        config,
        (decodedText) => {
          handleDetected(decodedText.trim());
        },
        () => {
          // Normal frame scan tick
        }
      );

      setIsScanningActive(true);

      // Check for flashlight/torch capability
      try {
        const caps = scanner.getRunningTrackCameraCapabilities();
        if (caps && typeof caps.torchFeature === 'function') {
          const tf = caps.torchFeature();
          if (tf && tf.isSupported()) {
            setTorchSupported(true);
          }
        }
      } catch {}

      // Asynchronously fetch available cameras in background (does not block video stream!)
      Html5Qrcode.getCameras().then((cams) => {
        if (cams && cams.length > 0) {
          setCameras(cams);
          if (cameraId) {
            const idx = cams.findIndex((c) => c.id === cameraId);
            if (idx !== -1) setActiveCameraIndex(idx);
          }
        }
      }).catch(() => {});

    } catch (err: unknown) {
      console.error('Optical Scanner start failure:', err);
      const msg = typeof err === 'string' ? err : (err as { message?: string })?.message || 'Camera permission denied or camera in use.';
      setError(`CAMERA ERROR: ${msg}`);
      setScanFailed(true);
    } finally {
      isOperatingRef.current = false;
    }
  }, [cleanupScanner, handleDetected]);

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
        const caps = scannerRef.current.getRunningTrackCameraCapabilities();
        if (caps && typeof caps.torchFeature === 'function') {
          const tf = caps.torchFeature();
          if (tf && tf.isSupported()) {
            await tf.apply(!torchOn);
            setTorchOn(!torchOn);
          }
        }
      }
    } catch (err) {
      console.warn('Torch toggle error:', err);
    }
  };

  // Switch between front/rear or multiple cameras
  const handleFlipCamera = async () => {
    if (cameras.length <= 1) return;
    const nextIndex = (activeCameraIndex + 1) % cameras.length;
    setActiveCameraIndex(nextIndex);
    await startScanner(cameras[nextIndex].id);
  };

  // Manual token submission
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScan(manualCode.trim());
      cleanupScanner().catch(() => {});
    }
  };

  // Gallery / Photo Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const originalFile = e.target.files[0];

    try {
      await cleanupScanner();

      // Pad quiet zone margin to guarantee decoding even on tight crops
      const paddedFile = await padImageQuietZone(originalFile);
      const fileScanner = new Html5Qrcode('reader', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });

      let decodedText = '';
      try {
        decodedText = await fileScanner.scanFile(paddedFile, false);
      } catch {
        decodedText = await fileScanner.scanFile(originalFile, false);
      }
      await fileScanner.clear();

      if (decodedText) {
        handleDetected(decodedText.trim());
      }
    } catch {
      setError('DECODER ERROR: Could not extract a valid QR code from the uploaded image. Please ensure the code is well-lit and not blurry, or paste the token directly.');
      setScanFailed(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md transition-colors">
      <div className="w-full max-w-md bg-cyber-panel cyber-panel-border border-2 border-cyber-yellow shadow-[0_0_25px_rgba(252,238,10,0.25)] p-5 sm:p-6 relative font-mono max-h-[92vh] overflow-y-auto">
        
        {/* Close Button */}
        <button 
          onClick={() => {
            cleanupScanner().then(onClose);
          }} 
          className="absolute top-4 right-4 text-cyber-muted hover:text-cyber-yellow transition-colors cursor-pointer"
          aria-label="Close Scanner"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Modal Header & Quick Action Buttons */}
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

        {/* Live Camera Viewfinder */}
        <div className="relative mb-3 border-2 border-cyber-yellow/80 overflow-hidden bg-black min-h-[260px] max-h-[340px] flex items-center justify-center">
          
          {/* Html5Qrcode Viewport */}
          <div 
            id="reader" 
            className="w-full h-full min-h-[260px]"
          />
          
          {/* Success Overlay */}
          {scanSuccess && (
            <div className="absolute inset-0 bg-green-500/40 flex flex-col items-center justify-center text-white backdrop-blur-xs z-30 animate-pulse">
              <CheckCircle2 className="w-16 h-16 text-green-300 mb-2 drop-shadow-[0_0_12px_rgba(74,222,128,0.8)]" />
              <div className="text-sm font-bold uppercase tracking-wider bg-black/90 px-3 py-1.5 border border-green-400 text-green-300 shadow-lg">
                QR CODE VERIFIED!
              </div>
            </div>
          )}

          {/* Tactical HUD Reticle Overlay */}
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

        {/* Camera Error Alert if any */}
        {scanFailed && (
          <div className="bg-cyber-pink/20 border border-cyber-pink text-cyber-pink px-3 py-2 text-xs mb-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="text-[11px] leading-relaxed">{error}</div>
          </div>
        )}

        {/* Instant Manual Input & Image Upload */}
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
        #reader {
          width: 100% !important;
          height: 100% !important;
          border: none !important;
        }
        #reader video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          display: block !important;
        }
        #reader__scan_region {
          min-height: 260px !important;
        }
        #reader__dashboard {
          display: none !important;
        }
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

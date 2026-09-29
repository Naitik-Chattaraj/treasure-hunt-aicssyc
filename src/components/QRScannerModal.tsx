'use client';

import { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, CameraDevice } from 'html5-qrcode';
import { X, Camera, Upload, AlertTriangle, RefreshCw, KeyRound, FlipHorizontal, CheckCircle2 } from 'lucide-react';

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

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isOperatingRef = useRef(false);
  const hasDetectedRef = useRef(false);

  const cleanupScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (e) {
        console.warn("Scanner cleanup warning:", e);
      } finally {
        scannerRef.current = null;
      }
    }
    const container = document.getElementById("reader");
    if (container) {
      container.innerHTML = "";
    }
  };

  const startScanner = async (cameraId?: string) => {
    if (isOperatingRef.current) return;
    isOperatingRef.current = true;
    hasDetectedRef.current = false;

    setError(null);
    setScanFailed(false);
    setScanSuccess(false);

    await cleanupScanner();

    try {
      const availableCameras = await Html5Qrcode.getCameras();
      if (!availableCameras || availableCameras.length === 0) {
        throw new Error("No optical camera hardware detected on this device.");
      }
      setCameras(availableCameras);

      const scanner = new Html5Qrcode("reader");
      scannerRef.current = scanner;

      let selectedCameraId = cameraId;
      if (!selectedCameraId) {
        // Prefer rear/environment camera on mobile
        const backCam = availableCameras.find(c => 
          c.label.toLowerCase().includes('back') || 
          c.label.toLowerCase().includes('rear') ||
          c.label.toLowerCase().includes('environment')
        );
        selectedCameraId = backCam ? backCam.id : availableCameras[0].id;
        const foundIdx = availableCameras.findIndex(c => c.id === selectedCameraId);
        if (foundIdx !== -1) setActiveCameraIndex(foundIdx);
      }

      // Full-frame scanning (no qrbox restriction) so wide QR codes & dense modules aren't cropped
      const config = {
        fps: 20,
        videoConstraints: {
          facingMode: 'environment',
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
        },
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
      };

      await scanner.start(
        selectedCameraId,
        config,
        (decodedText) => {
          // Prevent multiple triggers
          if (hasDetectedRef.current) return;
          hasDetectedRef.current = true;
          setScanSuccess(true);

          // Trigger onScan immediately!
          onScan(decodedText.trim());

          // Cleanup camera in background
          try {
            scanner.pause(true);
          } catch {}
          setTimeout(() => {
            cleanupScanner().catch(() => {});
          }, 300);
        },
        () => {
          // Normal frame scan tick
        }
      );
    } catch (err: any) {
      console.error("Optical Scanner start failure:", err);
      const msg = typeof err === 'string' ? err : err?.message || 'Camera permission denied or camera currently in use.';
      setError(`CAMERA ERROR: ${msg}`);
      setScanFailed(true);
    } finally {
      isOperatingRef.current = false;
    }
  };

  useEffect(() => {
    startScanner();
    return () => {
      cleanupScanner();
    };
  }, []);

  const handleFlipCamera = async () => {
    if (cameras.length <= 1) return;
    const nextIndex = (activeCameraIndex + 1) % cameras.length;
    setActiveCameraIndex(nextIndex);
    await startScanner(cameras[nextIndex].id);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScan(manualCode.trim());
      cleanupScanner().catch(() => {});
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const originalFile = e.target.files[0];
      try {
        await cleanupScanner();
        // Add white margin/quiet zone so even tight screenshots decode reliably!
        const paddedFile = await padImageQuietZone(originalFile);
        const fileScanner = new Html5Qrcode("reader");
        let decodedText = '';
        try {
          decodedText = await fileScanner.scanFile(paddedFile, false);
        } catch {
          // Fallback to original file
          decodedText = await fileScanner.scanFile(originalFile, false);
        }
        await fileScanner.clear();
        onScan(decodedText.trim());
      } catch {
        setError("DECODER ERROR: Could not extract a valid QR code from the uploaded image. Please ensure the code is well-lit and not blurry, or paste the token directly.");
        setScanFailed(true);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md transition-colors">
      <div className="w-full max-w-md bg-cyber-panel cyber-panel-border border-2 border-cyber-yellow shadow-[0_0_25px_rgba(252,238,10,0.25)] p-5 sm:p-6 relative font-mono max-h-[92vh] overflow-y-auto">
        
        <button 
          onClick={() => {
            cleanupScanner().then(onClose);
          }} 
          className="absolute top-4 right-4 text-cyber-muted hover:text-cyber-yellow transition-colors cursor-pointer"
          aria-label="Close Scanner"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex justify-between items-center mb-3 pr-8">
          <h2 className="text-lg font-bold text-cyber-yellow tracking-widest uppercase flex items-center gap-2">
            <Camera className="w-5 h-5 text-cyber-yellow" />
            Checkpoint Scanner
          </h2>

          {cameras.length > 1 && !scanFailed && (
            <button
              onClick={handleFlipCamera}
              className="flex items-center gap-1 text-[11px] px-2 py-1 bg-cyber-darker border border-cyber-yellow/40 text-cyber-yellow hover:bg-cyber-yellow hover:text-black transition-colors cursor-pointer"
              title="Switch Camera"
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
              <span>FLIP</span>
            </button>
          )}
        </div>

        {/* Live Camera Viewfinder */}
        <div className="relative mb-3 border-2 border-cyber-yellow/80 overflow-hidden bg-black min-h-[260px] max-h-[320px] flex items-center justify-center">
          <div id="reader" className="w-full h-full min-h-[260px]"></div>
          
          {/* Success Overlay */}
          {scanSuccess && (
            <div className="absolute inset-0 bg-green-500/30 flex flex-col items-center justify-center text-white backdrop-blur-xs z-20 animate-pulse">
              <CheckCircle2 className="w-16 h-16 text-green-400 mb-2" />
              <div className="text-sm font-bold uppercase tracking-wider bg-black/80 px-3 py-1 border border-green-400 text-green-400">
                QR CODE DETECTED!
              </div>
            </div>
          )}

          {/* HUD Reticle Overlay */}
          {!scanSuccess && (
            <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-2.5 z-10">
              <div className="flex justify-between text-cyber-yellow/90 text-[10px] bg-black/60 px-2 py-0.5">
                <span>[CAMERA: {cameras[activeCameraIndex]?.label ? 'ONLINE' : 'ACTIVE'}]</span>
                <span className="animate-pulse">SCANNING...</span>
              </div>
              <div className="flex items-center justify-center">
                <div className="relative border-2 border-dashed border-cyber-yellow w-48 h-48 rounded flex items-center justify-center shadow-[0_0_15px_rgba(252,238,10,0.3)]">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyber-yellow animate-ping"></div>
                </div>
              </div>
              <div className="text-center text-[10px] text-cyber-yellow tracking-widest bg-black/70 py-1">
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
      `}</style>
    </div>
  );
}

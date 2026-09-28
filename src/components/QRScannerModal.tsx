'use client';

import { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, CameraDevice } from 'html5-qrcode';
import { X, Camera, Upload, AlertTriangle, RefreshCw, KeyRound, FlipHorizontal } from 'lucide-react';

export default function QRScannerModal({ 
  onScan, 
  onClose 
}: { 
  onScan: (qrText: string) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [scanFailed, setScanFailed] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [activeCameraIndex, setActiveCameraIndex] = useState(0);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isMountedRef = useRef(true);
  const isOperatingRef = useRef(false);

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

  const startScanner = async (cameraIdOrFacing?: string | { facingMode: string }) => {
    if (isOperatingRef.current) return;
    isOperatingRef.current = true;

    setError(null);
    setScanFailed(false);
    setShowFallback(false);

    await cleanupScanner();

    if (!isMountedRef.current) {
      isOperatingRef.current = false;
      return;
    }

    try {
      const availableCameras = await Html5Qrcode.getCameras();
      if (!isMountedRef.current) return;

      if (!availableCameras || availableCameras.length === 0) {
        throw new Error("No optical camera hardware detected on this device.");
      }
      setCameras(availableCameras);

      const scanner = new Html5Qrcode("reader");
      scannerRef.current = scanner;

      // Select camera: either provided cameraId, or back camera if available, or first camera
      let cameraConfig: any = cameraIdOrFacing;
      if (!cameraConfig) {
        // Try finding back/environment camera
        const backCam = availableCameras.find(c => 
          c.label.toLowerCase().includes('back') || 
          c.label.toLowerCase().includes('rear') ||
          c.label.toLowerCase().includes('environment')
        );
        cameraConfig = backCam ? backCam.id : availableCameras[0].id;
        const foundIdx = availableCameras.findIndex(c => c.id === cameraConfig);
        if (foundIdx !== -1) setActiveCameraIndex(foundIdx);
      }

      const qrboxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const edgeSize = Math.max(160, Math.floor(minEdge * 0.7));
        return { width: edgeSize, height: edgeSize };
      };

      const config = {
        fps: 15,
        qrbox: qrboxFunction,
        aspectRatio: 1.0,
      };

      await scanner.start(
        cameraConfig,
        config,
        (decodedText) => {
          if (!isMountedRef.current) return;
          cleanupScanner().then(() => {
            onScan(decodedText);
          });
        },
        () => {
          // Normal frame scanning cycle
        }
      );
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error("Optical Scanner start failure:", err);
      const msg = typeof err === 'string' ? err : err?.message || 'Camera permission denied or device not found.';
      setError(`OPTICAL HARDWARE ERROR: ${msg}`);
      setScanFailed(true);
    } finally {
      isOperatingRef.current = false;
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    startScanner();

    return () => {
      isMountedRef.current = false;
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
      cleanupScanner().then(() => {
        onScan(manualCode.trim());
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      try {
        await cleanupScanner();
        const fileScanner = new Html5Qrcode("reader");
        const decodedText = await fileScanner.scanFile(file, true);
        await fileScanner.clear();
        onScan(decodedText);
      } catch {
        setError("DECODER ERROR: Could not extract a valid QR code from the uploaded image.");
        setScanFailed(true);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md transition-colors">
      <div className="w-full max-w-md bg-cyber-panel cyber-panel-border border border-cyber-yellow shadow-[0_0_25px_rgba(252,238,10,0.25)] p-5 sm:p-6 relative font-mono">
        
        <button 
          onClick={() => {
            cleanupScanner().then(onClose);
          }} 
          className="absolute top-4 right-4 text-cyber-muted hover:text-cyber-yellow transition-colors cursor-pointer"
          aria-label="Close Scanner"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex justify-between items-center mb-4 pr-8">
          <h2 className="text-lg sm:text-xl font-bold text-cyber-yellow tracking-widest uppercase flex items-center gap-2">
            <Camera className="w-5 h-5 text-cyber-yellow" />
            Optical Scanner
          </h2>

          {cameras.length > 1 && !showFallback && !scanFailed && (
            <button
              onClick={handleFlipCamera}
              className="flex items-center gap-1 text-[11px] px-2 py-1 bg-cyber-darker border border-cyber-yellow/40 text-cyber-yellow hover:bg-cyber-yellow hover:text-black transition-colors"
              title="Switch Camera"
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
              <span>FLIP</span>
            </button>
          )}
        </div>

        {/* Live Camera Viewfinder */}
        {!showFallback && (
          <div className="relative mb-4 border-2 border-cyber-yellow/80 overflow-hidden bg-black min-h-[280px] max-h-[340px] flex items-center justify-center">
            <div id="reader" className="w-full h-full min-h-[280px]"></div>
            
            {/* HUD Reticle Overlay */}
            <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3">
              <div className="flex justify-between text-cyber-yellow/80 text-[10px] bg-black/40 px-2 py-1">
                <span>[SENSOR: {cameras[activeCameraIndex]?.label ? 'ONLINE' : 'ACQUIRING...'}]</span>
                <span>RETICLE LOCK</span>
              </div>
              <div className="flex items-center justify-center">
                <div className="relative border-2 border-dashed border-cyber-cyan/60 w-44 h-44 rounded-md flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-cyber-yellow animate-ping"></div>
                </div>
              </div>
              <div className="text-center text-[10px] text-cyber-yellow tracking-widest bg-black/60 py-1">
                ALIGN QR CODE INSIDE RETICLE
              </div>
            </div>
          </div>
        )}

        {/* Scanning status banner when active and no failure */}
        {!showFallback && !scanFailed && (
          <div className="text-center text-xs text-cyber-muted py-1">
            Sensor stream active. Position lens steadily over Node QR.
          </div>
        )}

        {/* Confirmed Failure Alert & Fallback Unlock */}
        {scanFailed && (
          <div className="space-y-3 mb-4">
            <div className="bg-cyber-pink/15 border border-cyber-pink text-cyber-pink px-3 py-2.5 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-bold">SYSTEM SCAN FAILURE CONFIRMED</div>
                <div className="text-[11px] opacity-90">{error}</div>
              </div>
            </div>

            {!showFallback && (
              <button
                type="button"
                onClick={() => setShowFallback(true)}
                className="w-full py-3 px-4 bg-cyber-yellow/20 border border-cyber-yellow text-cyber-yellow hover:bg-cyber-yellow hover:text-black font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_10px_rgba(252,238,10,0.2)]"
              >
                <KeyRound className="w-4 h-4" />
                <span>Activate Manual Override / File Upload</span>
              </button>
            )}
          </div>
        )}

        {/* Fallback Interface (Only shown when user triggers after confirmed failure) */}
        {showFallback && (
          <div className="space-y-5 mt-2">
            <div className="border border-dashed border-cyber-border hover:border-cyber-cyan p-4 text-center transition-colors cursor-pointer relative bg-cyber-darker">
              <input 
                type="file" 
                accept="image/*"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Upload className="w-7 h-7 text-cyber-cyan mx-auto mb-1.5" />
              <div className="text-xs font-bold text-cyber-cyan uppercase">Upload QR Image File</div>
              <div className="text-[10px] text-cyber-muted mt-0.5">Select image taken from phone camera</div>
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-cyber-border"></div>
              <span className="flex-shrink mx-3 text-cyber-muted text-[10px] uppercase">Or Input Node Hash</span>
              <div className="flex-grow border-t border-cyber-border"></div>
            </div>

            <form onSubmit={handleManualSubmit}>
              <label className="block text-xs uppercase text-cyber-yellow mb-1 font-bold">
                Manual Override Passcode / Hash
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value)}
                  className="flex-1 bg-cyber-darker border border-cyber-border focus:border-cyber-yellow text-foreground px-3 py-2 outline-none text-xs uppercase tracking-wider"
                  placeholder="e.g. QR_HASH_NODE_1"
                />
                <button 
                  type="submit"
                  className="bg-cyber-yellow text-black px-4 font-bold text-xs uppercase hover:bg-white transition-colors cursor-pointer"
                >
                  Verify
                </button>
              </div>
            </form>

            <button
              type="button"
              onClick={() => startScanner()}
              className="w-full text-center text-xs text-cyber-cyan hover:underline flex items-center justify-center gap-1.5 pt-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Live Camera Sensor
            </button>
          </div>
        )}
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

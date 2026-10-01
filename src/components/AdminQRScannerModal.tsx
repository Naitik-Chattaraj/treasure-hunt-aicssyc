'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import QrScanner from 'qr-scanner';
import { 
  X, 
  Camera, 
  Upload, 
  AlertTriangle, 
  RefreshCw, 
  KeyRound, 
  CheckCircle2, 
  HelpCircle, 
  Footprints, 
  ExternalLink,
  Zap,
  ZapOff,
  FlipHorizontal,
  Crosshair
} from 'lucide-react';

if (typeof window !== 'undefined') {
  QrScanner.WORKER_PATH = '/qr-scanner-worker.min.js';
}

interface QuestionPoolItem {
  id: string;
  node_id: number;
  challenge_type: 'passcode' | 'mcq' | 'riddle';
  question: string;
  options: string[] | null;
  answer: string;
}

interface AdminCheckpoint {
  id: number;
  route_id?: 1 | 2;
  stage?: number;
  title: string;
  area: string;
  clue: string;
  qr_hash: string;
  questions_pool?: QuestionPoolItem[];
}

export default function AdminQRScannerModal({
  checkpoints,
  onClose,
  onSelectCheckpoint,
}: {
  checkpoints: AdminCheckpoint[];
  onClose: () => void;
  onSelectCheckpoint: (cp: AdminCheckpoint) => void;
}) {
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [matchedCp, setMatchedCp] = useState<AdminCheckpoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [activeCameraIndex, setActiveCameraIndex] = useState(0);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [isScanning, setIsScanning] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const isOperatingRef = useRef(false);

  const cleanupScanner = useCallback(() => {
    if (scannerRef.current) {
      try {
        scannerRef.current.stop();
        scannerRef.current.destroy();
      } catch (e) {
        console.warn('Admin scanner cleanup:', e);
      } finally {
        scannerRef.current = null;
      }
    }
    setIsScanning(false);
  }, []);

  const handleCodeFound = useCallback((rawCode: string) => {
    const clean = rawCode.trim();
    setScannedCode(clean);
    setIsScanning(false);

    // Look for matching checkpoint by qr_hash or query param
    let hashToMatch = clean;
    try {
      if (clean.startsWith('http://') || clean.startsWith('https://')) {
        const u = new URL(clean);
        hashToMatch = u.searchParams.get('code') || 
                      u.searchParams.get('qr') || 
                      u.searchParams.get('hash') || 
                      u.searchParams.get('token') || 
                      clean;
      }
    } catch {}

    const match = checkpoints.find(
      (cp) => cp.qr_hash.toLowerCase() === hashToMatch.toLowerCase() || cp.qr_hash.toLowerCase() === clean.toLowerCase()
    );

    if (match) {
      setMatchedCp(match);
      setError(null);
    } else {
      setMatchedCp(null);
      setError(`UNKNOWN TOKEN: No active Question Block registered for this code (${clean.substring(0, 24)}...).`);
    }

    cleanupScanner();
  }, [checkpoints, cleanupScanner]);

  const startScanner = useCallback(async (cameraId?: string) => {
    if (isOperatingRef.current || !videoRef.current) return;
    isOperatingRef.current = true;
    setError(null);
    setScannedCode(null);
    setMatchedCp(null);

    cleanupScanner();

    try {
      const scanner = new QrScanner(
        videoRef.current,
        (result) => {
          if (result && result.data) {
            handleCodeFound(result.data);
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
      setIsScanning(true);

      try {
        const hasTorch = await scanner.hasFlash();
        setTorchSupported(hasTorch);
      } catch {}

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
      const msg = typeof err === 'string' ? err : (err as { message?: string })?.message || 'Camera access failed.';
      setError(`CAMERA ERROR: ${msg}`);
      setIsScanning(false);
    } finally {
      isOperatingRef.current = false;
    }
  }, [cleanupScanner, handleCodeFound]);

  useEffect(() => {
    startScanner();
    return () => {
      cleanupScanner();
    };
  }, [startScanner, cleanupScanner]);

  const handleToggleTorch = async () => {
    if (scannerRef.current) {
      await scannerRef.current.toggleFlash();
      setTorchOn(scannerRef.current.isFlashOn());
    }
  };

  const handleFlipCamera = async () => {
    if (cameras.length < 2 || !scannerRef.current) return;
    const nextIdx = (activeCameraIndex + 1) % cameras.length;
    setActiveCameraIndex(nextIdx);
    await scannerRef.current.setCamera(cameras[nextIdx].id);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await QrScanner.scanImage(file, {
        returnDetailedScanResult: true,
        alsoTryWithoutScanRegion: true,
      });
      if (result && result.data) {
        handleCodeFound(result.data);
      } else {
        throw new Error('No QR detected');
      }
    } catch {
      setError('DECODER ERROR: Could not extract a valid QR code from uploaded image.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md font-mono">
      <div className="w-full max-w-2xl bg-surface rounded-xl border-2 border-danger shadow-[0_0_30px_rgba(255,0,60,0.3)] p-5 sm:p-6 relative max-h-[92vh] overflow-y-auto">
        
        {/* Close Button */}
        <button 
          onClick={() => {
            cleanupScanner();
            onClose();
          }} 
          className="absolute top-4 right-4 text-muted hover:text-danger transition-colors cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Modal Header */}
        <div className="flex justify-between items-center mb-4 pr-8">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-danger tracking-widest uppercase flex items-center gap-2">
              <Camera className="w-5 h-5 text-danger animate-pulse" />
              Admin Checkpoint QR Scanner & Verifier
            </h2>
            <p className="text-[11px] text-gray-400">
              Scan physical checkpoint stickers on campus to inspect their linked Question Block in real-time.
            </p>
          </div>

          {isScanning && (
            <div className="flex items-center gap-2">
              {torchSupported && (
                <button
                  type="button"
                  onClick={handleToggleTorch}
                  className={`text-[10px] px-2 py-1 border font-bold ${
                    torchOn ? 'bg-danger text-white border-danger' : 'border-danger/40 text-danger'
                  }`}
                >
                  {torchOn ? <ZapOff className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                </button>
              )}

              {cameras.length > 1 && (
                <button
                  type="button"
                  onClick={handleFlipCamera}
                  className="text-[10px] px-2 py-1 border border-danger/40 text-danger hover:bg-danger/20"
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Scanner Viewfinder (active when scanning) */}
        {isScanning && (
          <div className="relative mb-4 border-2 border-danger/80 overflow-hidden bg-black min-h-[260px] max-h-[320px] flex items-center justify-center">
            <video 
              ref={videoRef}
              className="w-full h-full object-cover min-h-[260px] max-h-[320px]"
              playsInline
              muted
            />

            {/* Target Reticle */}
            <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-2.5 z-20">
              <div className="flex justify-between items-center text-danger text-[10px] bg-black/75 px-2 py-1 border border-danger/30">
                <span className="flex items-center gap-1.5 font-bold">
                  <span className="w-2 h-2 rounded-full bg-danger animate-ping"></span>
                  MISSION CONTROL CAMERA ACTIVE
                </span>
              </div>

              <div className="relative flex items-center justify-center my-auto">
                <div className="relative w-44 h-44 rounded border border-danger/40 flex items-center justify-center">
                  <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-danger"></div>
                  <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-danger"></div>
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-danger"></div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-danger"></div>
                  <Crosshair className="w-6 h-6 text-danger/40" />
                </div>
              </div>

              <div className="text-center text-[10px] text-danger font-bold tracking-widest bg-black/85 py-1 border-t border-danger/30">
                POINT AT CHECKPOINT STICKER
              </div>
            </div>
          </div>
        )}

        {/* Matched Question Block Telemetry Report */}
        {matchedCp && (
          <div className="bg-sunken border-2 border-green-500/80 p-4 space-y-4 mb-4 shadow-[0_0_20px_rgba(34,197,94,0.2)]">
            <div className="flex flex-wrap justify-between items-center gap-2 border-b border-green-500/30 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <span className="font-bold text-green-400 text-sm uppercase tracking-wider">
                  CHECKPOINT VERIFIED IN DATABASE
                </span>
              </div>

              <span className={`text-xs font-bold px-2 py-0.5 uppercase ${
                (matchedCp.route_id || (matchedCp.id <= 12 ? 1 : 2)) === 1 
                  ? 'bg-cyan-500 text-black' 
                  : 'bg-purple-500 text-white'
              }`}>
                ROUTE 0{matchedCp.route_id || (matchedCp.id <= 12 ? 1 : 2)} // NODE 0{matchedCp.stage || (matchedCp.id <= 12 ? matchedCp.id : matchedCp.id - 12)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[10px] text-gray-400 uppercase font-bold">Checkpoint Title:</span>
                <div className="text-ink font-bold text-sm mt-0.5">{matchedCp.title}</div>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 uppercase font-bold">Campus Area / Sector:</span>
                <div className="text-primary font-bold text-sm mt-0.5">{matchedCp.area}</div>
              </div>
            </div>

            <div className="text-xs bg-black/50 p-2.5 border border-line">
              <span className="text-[10px] text-accent font-bold uppercase flex items-center gap-1 mb-1">
                <Footprints className="w-3 h-3" /> Location Clue:
              </span>
              <p className="text-gray-300 leading-relaxed">{matchedCp.clue}</p>
            </div>

            {/* Questions Pool Preview */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase text-gray-300 flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 text-primary" />
                  Active Question Pool ({matchedCp.questions_pool?.length || 0} Questions in this Block)
                </span>
                <span className="text-[10px] text-green-400">Random 1 etched per team</span>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {(matchedCp.questions_pool || []).map((q, idx) => (
                  <div key={q.id} className="bg-surface border border-line p-2.5 text-xs space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 font-bold uppercase border border-accent/40">
                        #{idx + 1} {q.challenge_type}
                      </span>
                      <span className="text-[10px] text-green-400 font-mono font-bold bg-green-950/60 px-2 py-0.5 border border-green-800">
                        SECRET ANSWER: {q.answer}
                      </span>
                    </div>
                    <div className="text-gray-200">{q.question}</div>
                    {q.options && q.options.length > 0 && (
                      <div className="text-[11px] text-gray-400">
                        Options: {q.options.join(' | ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-green-500/20">
              <button
                onClick={() => {
                  onSelectCheckpoint(matchedCp);
                  onClose();
                }}
                className="flex-1 bg-green-500 hover:bg-white text-black font-bold py-2 px-3 text-xs uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Jump to & Edit this Question Block
              </button>

              <button
                onClick={() => startScanner()}
                className="bg-sunken hover:bg-surface border border-line text-ink font-bold py-2 px-3 text-xs uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Scan Another QR Code
              </button>
            </div>
          </div>
        )}

        {/* Error / Unknown Code Banner */}
        {error && (
          <div className="bg-danger/20 border-2 border-danger p-3 text-xs mb-4 text-danger space-y-2">
            <div className="flex items-center gap-2 font-bold uppercase">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            {scannedCode && (
              <div className="bg-black/60 p-2 border border-danger/40 text-[11px] font-mono break-all text-white">
                Scanned Raw Value: {scannedCode}
              </div>
            )}
            <button
              onClick={() => startScanner()}
              className="mt-2 bg-danger text-white px-3 py-1 text-xs uppercase font-bold hover:bg-white hover:text-black cursor-pointer inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Try Scanning Again
            </button>
          </div>
        )}

        {/* Bottom Upload & Manual Token Test */}
        <div className="flex flex-wrap justify-between items-center gap-3 pt-3 border-t border-line text-xs">
          <label className="text-gray-400 hover:text-danger flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Photo of Printed Sticker</span>
            <input 
              type="file" 
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const token = prompt('Enter or paste checkpoint SHA-256 token to test:');
                if (token) handleCodeFound(token);
              }}
              className="text-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              <KeyRound className="w-3 h-3" />
              Test Token Manually
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

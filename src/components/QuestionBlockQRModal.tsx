'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  X, 
  Printer, 
  Download, 
  Copy, 
  Check, 
  RefreshCw, 
  Layers, 
  Sparkles,
  QrCode
} from 'lucide-react';

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

export default function QuestionBlockQRModal({
  checkpoint,
  onClose,
  onRegenerateToken,
}: {
  checkpoint: AdminCheckpoint;
  onClose: () => void;
  onRegenerateToken?: (checkpointId: number, newHash: string) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const routeNumber = checkpoint.route_id || (checkpoint.id <= 12 ? 1 : 2);
  const stageNumber = checkpoint.stage || (checkpoint.id <= 12 ? checkpoint.id : checkpoint.id - 12);

  const handleCopy = () => {
    navigator.clipboard.writeText(checkpoint.qr_hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const qrElement = document.getElementById('question-block-qr-svg');
    const svgContent = qrElement ? qrElement.outerHTML : '';

    const escapeHtml = (str: string) => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Sticker - Route ${routeNumber} Node ${stageNumber} (${escapeHtml(checkpoint.title)})</title>
          <style>
            @page { size: auto; margin: 10mm; }
            body { 
              font-family: monospace; 
              display: flex; 
              flex-direction: column; 
              align-items: center; 
              justify-content: center;
              padding: 20px;
              color: #000;
            }
            .sticker-card {
              border: 3px solid #000;
              padding: 25px;
              text-align: center;
              max-width: 380px;
              border-radius: 8px;
            }
            .badge {
              font-size: 14px;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 2px;
              margin-bottom: 8px;
              background: #000;
              color: #fff;
              padding: 4px 8px;
              display: inline-block;
            }
            h1 { font-size: 18px; margin: 8px 0; text-transform: uppercase; }
            h2 { font-size: 14px; margin: 4px 0 16px; color: #444; }
            .token { font-size: 10px; word-break: break-all; margin-top: 15px; border-top: 1px dashed #666; padding-top: 10px; }
            svg { width: 240px; height: 240px; margin: 0 auto; display: block; }
          </style>
        </head>
        <body>
          <div class="sticker-card">
            <div class="badge">AICSSYC 2026 // ROUTE 0${routeNumber} // NODE 0${stageNumber}</div>
            <h1>${escapeHtml(checkpoint.title)}</h1>
            <h2>${escapeHtml(checkpoint.area)}</h2>
            ${svgContent}
            <div class="token">TOKEN: ${checkpoint.qr_hash}</div>
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownloadSVG = () => {
    const qrElement = document.getElementById('question-block-qr-svg');
    if (!qrElement) return;

    const svgData = new XMLSerializer().serializeToString(qrElement);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = `QR-Route${routeNumber}-Node${stageNumber}-${checkpoint.title.replace(/[^a-zA-Z0-9]/g, '_')}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(svgUrl);
  };

  const handleRegenerate = async () => {
    if (!onRegenerateToken) return;
    if (!confirm(`Generate a brand new unique QR Code token for Route 0${routeNumber} Node 0${stageNumber}? Previous printed stickers with the old code will stop working!`)) {
      return;
    }

    setRegenerating(true);
    try {
      const newHash = crypto.randomUUID();
      await onRegenerateToken(checkpoint.id, newHash);
    } catch {
      alert('Failed to regenerate QR token');
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-md bg-surface rounded-xl border-2 border-accent shadow-card p-5 sm:p-6 relative max-h-[92vh] overflow-y-auto flex flex-col items-center text-center">
        
        {/* Close Button */}
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-muted hover:text-accent transition-colors cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Badge & Title */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs font-bold px-2.5 py-0.5 uppercase tracking-wider ${
            routeNumber === 1 ? 'bg-accent text-on-primary' : 'bg-route-2 text-on-primary'
          }`}>
            ROUTE 0{routeNumber} // NODE 0{stageNumber}
          </span>
          <span className="text-xs bg-sunken text-muted px-2 py-0.5 border border-line font-bold">
            CHECKPOINT #{checkpoint.id}
          </span>
        </div>

        <h2 className="text-lg font-bold text-ink mb-0.5">
          {checkpoint.title}
        </h2>
        <div className="text-xs text-primary font-bold uppercase mb-4">
          {checkpoint.area}
        </div>

        {/* High-Resolution QR Code Block */}
        <div className="bg-white p-4 border-4 border-white shadow-2xl mb-4 rounded-xl flex items-center justify-center">
          <QRCodeSVG 
            id="question-block-qr-svg"
            value={checkpoint.qr_hash} 
            size={220} 
            level="H"
            includeMargin={true}
            marginSize={4}
          />
        </div>

        {/* Token Info & Copy */}
        <div className="w-full bg-sunken p-3 border border-line text-left text-xs mb-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-muted uppercase font-bold">Active QR SHA-256 Token:</span>
            <button
              onClick={handleCopy}
              className="text-xs text-accent hover:text-ink flex items-center gap-1 cursor-pointer bg-surface px-2 py-0.5 border border-accent/40"
            >
              {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied!' : 'Copy Token'}</span>
            </button>
          </div>
          <code className="text-xs text-primary break-all block font-mono bg-sunken p-1.5 border border-line/40">
            {checkpoint.qr_hash}
          </code>
        </div>

        {/* Action Buttons: Print, Download, Regenerate */}
        <div className="grid grid-cols-2 gap-2 w-full mb-3">
          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-1.5 bg-accent text-on-primary hover:opacity-90 font-bold py-2.5 px-3 text-xs uppercase transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Print Sticker
          </button>

          <button
            onClick={handleDownloadSVG}
            className="flex items-center justify-center gap-1.5 bg-surface hover:bg-sunken text-accent border border-accent font-bold py-2.5 px-3 text-xs uppercase transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Download SVG
          </button>
        </div>

        {/* Regenerate Token Button */}
        {onRegenerateToken && (
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="w-full flex items-center justify-center gap-1.5 text-muted hover:text-primary hover:border-primary/50 border border-line py-2 px-3 text-xs uppercase transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${regenerating ? 'animate-spin' : ''}`} />
            <span>Generate New Unique QR Token</span>
          </button>
        )}

      </div>
    </div>
  );
}

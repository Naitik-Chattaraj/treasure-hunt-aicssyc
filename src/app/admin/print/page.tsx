'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import Link from 'next/link';
import { ArrowLeft, Printer, Copy, Check, Compass, Layers } from 'lucide-react';

interface PrintCheckpoint {
  id: number;
  routeId: 1 | 2;
  stage: number;
  title: string;
  area: string;
  clue: string;
  qrHash: string;
}

type RouteFilter = 'route1' | 'route2' | 'all';

// Admin-only batch print sheet. QR tokens come from the database (via the admin-authenticated
// checkpoints API), so regenerated tokens print correctly and nothing is exposed to players.
export default function AdminPrintQRPage() {
  const router = useRouter();
  const [selectedRoute, setSelectedRoute] = useState<RouteFilter>('route1');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [checkpoints, setCheckpoints] = useState<PrintCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/checkpoints')
      .then(async (res) => {
        if (res.status === 401) {
          router.push('/admin/login');
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load checkpoints');

        // Preselect the route from the dashboard link (?route=1 or ?route=2)
        const route = new URLSearchParams(window.location.search).get('route');
        if (route === '2') setSelectedRoute('route2');
        else if (route === 'all') setSelectedRoute('all');

        setCheckpoints(
          (data.checkpoints || []).map((cp: {
            id: number; route_id?: number | null; stage?: number | null;
            title: string; area: string; clue: string; qr_hash: string;
          }) => ({
            id: cp.id,
            routeId: (cp.route_id ?? (cp.id <= 12 ? 1 : 2)) === 2 ? 2 : 1,
            stage: cp.stage ?? (cp.id <= 12 ? cp.id : cp.id - 12),
            title: cp.title,
            area: cp.area,
            clue: cp.clue,
            qrHash: cp.qr_hash,
          }))
        );
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'Failed to load checkpoints'))
      .finally(() => setLoading(false));
  }, [router]);

  const handleCopy = (id: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const displayedCheckpoints = checkpoints
    .filter((cp) =>
      selectedRoute === 'route1' ? cp.routeId === 1 : selectedRoute === 'route2' ? cp.routeId === 2 : true
    )
    .sort((a, b) => a.routeId - b.routeId || a.stage - b.stage);

  return (
    <main className="min-h-screen bg-gray-900 text-gray-100 p-4 sm:p-8 font-mono">
      <div className="max-w-6xl mx-auto">
        
        {/* Navigation & Print Controls */}
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6 border-b border-gray-800 pb-4 print:hidden">
          <Link 
            href="/admin" 
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-cyan-400 border border-cyan-500/30 text-xs font-bold uppercase transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Admin Dashboard
          </Link>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold uppercase transition-colors cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.4)]"
            >
              <Printer className="w-4 h-4" />
              {selectedRoute === 'route1' 
                ? 'Print Route 1 (12 QR Codes)' 
                : selectedRoute === 'route2' 
                ? 'Print Route 2 (12 QR Codes)' 
                : 'Print All (24 QR Codes)'}
            </button>
          </div>
        </div>

        {/* Page Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Compass className="w-4 h-4" />
            <span>Dual Route Architecture</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-white">
            AICSSYC 2026 // Physical QR Checkpoints Sheet
          </h1>
          <p className="text-gray-400 text-xs leading-relaxed max-w-3xl">
            Two separate 12-checkpoint campus routes are deployed simultaneously. Teams are randomly assigned to either Route 1 or Route 2. Scanning a QR code verifies that the code matches the team&apos;s assigned route and current stage sequence before unlocking challenges.
          </p>
        </div>

        {/* Route Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 mb-8 border-b border-gray-800 pb-4 print:hidden">
          <button
            onClick={() => setSelectedRoute('route1')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 border ${
              selectedRoute === 'route1'
                ? 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.4)]'
                : 'bg-gray-800/80 text-gray-300 border-gray-700 hover:border-cyan-500/50'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            Route 1: Hippocrates Loop (12 QR Codes)
          </button>

          <button
            onClick={() => setSelectedRoute('route2')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 border ${
              selectedRoute === 'route2'
                ? 'bg-purple-500 text-white border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.4)]'
                : 'bg-gray-800/80 text-gray-300 border-gray-700 hover:border-purple-500/50'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            Route 2: Hospital to Arts Loop (12 QR Codes)
          </button>

          <button
            onClick={() => setSelectedRoute('all')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 border ${
              selectedRoute === 'all'
                ? 'bg-yellow-400 text-black border-yellow-300 shadow-[0_0_15px_rgba(250,204,21,0.4)]'
                : 'bg-gray-800/80 text-gray-300 border-gray-700 hover:border-yellow-400/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            All Routes (24 QR Codes)
          </button>
        </div>

        {/* Route Banner */}
        <div className="mb-6 p-3 bg-gray-800/60 border border-gray-700 text-xs flex flex-wrap justify-between items-center gap-2">
          <div>
            <span className="text-gray-400 font-bold uppercase">Displaying: </span>
            <span className="font-bold text-white uppercase">
              {selectedRoute === 'route1' && 'Route 1 // Hippocrates Hall to Hippocrates Hall (12 Nodes)'}
              {selectedRoute === 'route2' && 'Route 2 // SRM Hospital to FSH Arts College (12 Nodes)'}
              {selectedRoute === 'all' && 'All Routes // 24 Checkpoints (12 for Route 1, 12 for Route 2)'}
            </span>
          </div>
          <span className="text-[11px] text-cyan-400 font-mono bg-cyan-950/60 border border-cyan-800 px-2 py-0.5">
            {displayedCheckpoints.length} QR Codes Active
          </span>
        </div>
        
        {loading && (
          <div className="p-4 text-xs text-cyan-400 border border-gray-700 bg-gray-800/60">Loading checkpoints from database...</div>
        )}
        {loadError && (
          <div className="p-4 text-xs text-red-400 border border-red-500/50 bg-red-950/40">{loadError}</div>
        )}

        {/* QR Code Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedCheckpoints.map(cp => {
            const isRoute1 = cp.routeId === 1;
            return (
              <div 
                key={cp.id} 
                className={`border p-5 flex flex-col items-center rounded shadow-md relative transition-all ${
                  isRoute1 
                    ? 'border-cyan-500/40 bg-gray-800/90 shadow-[0_4px_20px_rgba(0,240,255,0.06)]' 
                    : 'border-purple-500/40 bg-gray-800/90 shadow-[0_4px_20px_rgba(168,85,247,0.06)]'
                }`}
              >
                {/* Header row */}
                <div className="flex justify-between w-full items-center mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider ${
                      isRoute1 ? 'bg-cyan-500 text-black' : 'bg-purple-500 text-white'
                    }`}>
                      ROUTE 0{cp.routeId}
                    </span>
                    <span className="text-[10px] bg-black/60 text-yellow-300 border border-gray-700 px-1.5 py-0.5 font-bold uppercase">
                      NODE 0{cp.stage}
                    </span>
                  </div>

                  <span className="text-[10px] text-gray-400 font-mono uppercase">
                    ID #{cp.id.toString().padStart(2, '0')}
                  </span>
                </div>
                
                <h2 className="text-sm font-bold mb-1 text-white text-center min-h-[2.5rem] flex items-center justify-center">
                  {cp.title}
                </h2>

                <div className="text-[11px] text-yellow-400/90 font-bold uppercase text-center mb-3">
                  {cp.area}
                </div>
                
                {/* QR Code with mandatory ISO quiet zone margin & large high-contrast block size */}
                <div className="bg-white p-4 border-4 border-white shadow-2xl mb-4 rounded-xl flex items-center justify-center">
                  <QRCodeSVG 
                    value={cp.qrHash || ''} 
                    size={200} 
                    level="M"
                    includeMargin={true}
                    marginSize={4}
                  />
                </div>
                
                {/* Card Metadata Details */}
                <div className="w-full text-left text-xs bg-gray-900/90 p-3 border border-gray-700/80 rounded space-y-2">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] text-gray-400 uppercase font-bold">SHA-256 Token:</span>
                      <button
                        onClick={() => handleCopy(cp.id, cp.qrHash || '')}
                        className="text-[10px] text-cyan-400 hover:text-white flex items-center gap-1 cursor-pointer bg-gray-800 px-2 py-0.5 border border-gray-700 transition-colors"
                        title="Copy SHA-256 token to clipboard"
                      >
                        {copiedId === cp.id ? (
                          <>
                            <Check className="w-3 h-3 text-green-400" />
                            <span className="text-green-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy Token</span>
                          </>
                        )}
                      </button>
                    </div>
                    <code className="text-[10px] text-yellow-300 break-all block bg-black/70 p-1.5 border border-gray-800 font-mono leading-tight">
                      {cp.qrHash}
                    </code>
                  </div>

                  <div className="text-[11px] text-gray-400 pt-1 border-t border-gray-800">
                    <span className="text-[10px] text-gray-500 uppercase font-bold block">Physical Clue:</span>
                    <span className="text-gray-300 text-xs leading-relaxed">{cp.clue}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

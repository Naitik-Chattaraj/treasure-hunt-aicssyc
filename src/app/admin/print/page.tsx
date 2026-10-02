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
    <main className="min-h-screen bg-sunken text-ink p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Navigation & Print Controls */}
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6 border-b border-line pb-4 print:hidden">
          <Link 
            href="/admin" 
            className="inline-flex items-center gap-2 px-4 py-2 bg-surface-2 hover:bg-surface-2 text-accent border border-accent/30 text-xs font-bold uppercase transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Admin Dashboard
          </Link>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent text-on-primary text-xs font-bold uppercase transition-colors cursor-pointer shadow-card"
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
          <div className="flex items-center gap-2 text-accent text-xs font-bold uppercase tracking-wider mb-1">
            <Compass className="w-4 h-4" />
            <span>Dual Route Architecture</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-ink">
            AICSSYC 2026 // Physical QR Checkpoints Sheet
          </h1>
          <p className="text-muted text-xs leading-relaxed max-w-3xl">
            Two separate 12-checkpoint campus routes are deployed simultaneously. Teams are randomly assigned to either Route 1 or Route 2. Scanning a QR code verifies that the code matches the team&apos;s assigned route and current stage sequence before unlocking challenges.
          </p>
        </div>

        {/* Route Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 mb-8 border-b border-line pb-4 print:hidden">
          <button
            onClick={() => setSelectedRoute('route1')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 border ${
              selectedRoute === 'route1'
                ? 'bg-accent text-on-primary border-accent shadow-card'
                : 'bg-surface-2/80 text-ink border-line hover:border-accent/50'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-accent"></span>
            Route 1: Hippocrates Loop (12 QR Codes)
          </button>

          <button
            onClick={() => setSelectedRoute('route2')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 border ${
              selectedRoute === 'route2'
                ? 'bg-route-2 text-on-primary border-route-2 shadow-card'
                : 'bg-surface-2/80 text-ink border-line hover:border-route-2/50'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-route-2"></span>
            Route 2: Hospital to Arts Loop (12 QR Codes)
          </button>

          <button
            onClick={() => setSelectedRoute('all')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 border ${
              selectedRoute === 'all'
                ? 'bg-primary text-on-primary border-primary shadow-card'
                : 'bg-surface-2/80 text-ink border-line hover:border-primary/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            All Routes (24 QR Codes)
          </button>
        </div>

        {/* Route Banner */}
        <div className="mb-6 p-3 bg-surface-2/60 border border-line text-xs flex flex-wrap justify-between items-center gap-2">
          <div>
            <span className="text-muted font-bold uppercase">Displaying: </span>
            <span className="font-bold text-ink uppercase">
              {selectedRoute === 'route1' && 'Route 1 // Hippocrates Hall to Hippocrates Hall (12 Nodes)'}
              {selectedRoute === 'route2' && 'Route 2 // SRM Hospital to FSH Arts College (12 Nodes)'}
              {selectedRoute === 'all' && 'All Routes // 24 Checkpoints (12 for Route 1, 12 for Route 2)'}
            </span>
          </div>
          <span className="text-xs text-accent font-mono bg-accent/10 border border-accent/50 rounded-md px-2 py-0.5">
            {displayedCheckpoints.length} QR Codes Active
          </span>
        </div>
        
        {loading && (
          <div className="p-4 text-xs text-accent border border-line bg-surface-2/60">Loading checkpoints from database...</div>
        )}
        {loadError && (
          <div className="p-4 text-xs text-danger border border-danger/50 bg-danger/10 rounded-lg">{loadError}</div>
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
                    ? 'border-accent/40 bg-surface-2/90 shadow-card' 
                    : 'border-route-2/40 bg-surface-2/90 shadow-card'
                }`}
              >
                {/* Header row */}
                <div className="flex justify-between w-full items-center mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs px-2 py-0.5 font-bold uppercase tracking-wider ${
                      isRoute1 ? 'bg-accent text-on-primary' : 'bg-route-2 text-on-primary'
                    }`}>
                      ROUTE 0{cp.routeId}
                    </span>
                    <span className="text-xs bg-sunken text-primary border border-line px-1.5 py-0.5 font-bold uppercase">
                      NODE 0{cp.stage}
                    </span>
                  </div>

                  <span className="text-xs text-muted font-mono uppercase">
                    ID #{cp.id.toString().padStart(2, '0')}
                  </span>
                </div>
                
                <h2 className="text-sm font-bold mb-1 text-ink text-center min-h-[2.5rem] flex items-center justify-center">
                  {cp.title}
                </h2>

                <div className="text-xs text-primary/90 font-bold uppercase text-center mb-3">
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
                <div className="w-full text-left text-xs bg-sunken/90 p-3 border border-line/80 rounded space-y-2">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-muted uppercase font-bold">SHA-256 Token:</span>
                      <button
                        onClick={() => handleCopy(cp.id, cp.qrHash || '')}
                        className="text-xs text-accent hover:text-ink flex items-center gap-1 cursor-pointer bg-surface-2 px-2 py-0.5 border border-line transition-colors"
                        title="Copy SHA-256 token to clipboard"
                      >
                        {copiedId === cp.id ? (
                          <>
                            <Check className="w-3 h-3 text-success" />
                            <span className="text-success">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy Token</span>
                          </>
                        )}
                      </button>
                    </div>
                    <code className="text-xs text-primary break-all block bg-sunken p-1.5 border border-line font-mono leading-tight">
                      {cp.qrHash}
                    </code>
                  </div>

                  <div className="text-xs text-muted pt-1 border-t border-line">
                    <span className="text-xs text-muted uppercase font-bold block">Physical Clue:</span>
                    <span className="text-ink text-xs leading-relaxed">{cp.clue}</span>
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

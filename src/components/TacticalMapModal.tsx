'use client';

import { HuntProgress } from '@/types/hunt';
import { Check, Map as MapIcon, X } from 'lucide-react';

const ROUTE_1_MAP_NODES = [
  { x: 18, y: 78, name: 'Hippocrates Hall' },
  { x: 26, y: 60, name: 'N Block' },
  { x: 22, y: 35, name: 'Shiva Temple' },
  { x: 40, y: 22, name: 'BEL Block' },
  { x: 62, y: 20, name: 'TP Building' },
  { x: 50, y: 45, name: 'Clock Tower' },
  { x: 68, y: 46, name: 'UB Building' },
  { x: 82, y: 38, name: 'Architecture Block' },
  { x: 84, y: 64, name: 'Law College' },
  { x: 55, y: 65, name: 'Vendhar Square' },
  { x: 38, y: 75, name: 'Medical College' },
  { x: 20, y: 82, name: 'Hippocrates Hall (Final)' },
];

const ROUTE_2_MAP_NODES = [
  { x: 16, y: 75, name: 'SRM General Hospital Lawn' },
  { x: 30, y: 80, name: 'Dental / Pharmacy Block' },
  { x: 42, y: 70, name: 'Bio-Tech & Life Sciences' },
  { x: 36, y: 48, name: 'TP Ganesan Auditorium' },
  { x: 50, y: 45, name: 'Vendhar & Clock Tower' },
  { x: 42, y: 24, name: 'BEL Block' },
  { x: 58, y: 32, name: 'Java Green / Main Canteen' },
  { x: 68, y: 22, name: 'SRM Tech Park' },
  { x: 70, y: 46, name: 'Central Library / UB' },
  { x: 82, y: 52, name: 'Post Office & Bank' },
  { x: 84, y: 66, name: 'School of Law' },
  { x: 60, y: 80, name: 'FSH (Arts College)' },
];

export default function TacticalMapModal({ 
  progress, 
  assignedRoute,
  onClose 
}: { 
  progress: HuntProgress; 
  assignedRoute?: 1 | 2;
  onClose: () => void; 
}) {
  const currentRoute: 1 | 2 = assignedRoute || progress.assignedRoute || 1;
  const nodes = currentRoute === 1 ? ROUTE_1_MAP_NODES : ROUTE_2_MAP_NODES;

  const currentIndex = Math.min(progress.currentStage, 12) - 1;
  const trail = nodes.map((p) => `${p.x},${p.y}`).join(' ');
  const walked = nodes.slice(0, currentIndex + 1).map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-title"
        className="relative flex h-[88dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-raised sm:h-[82dvh] sm:max-w-3xl sm:rounded-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <MapIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="map-title" className="flex items-center gap-2 text-lg font-bold">
                Treasure map
                <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${
                  currentRoute === 1 ? 'border-route-1/50 bg-route-1/10 text-route-1' : 'border-route-2/50 bg-route-2/10 text-route-2'
                }`}>
                  Route {currentRoute}
                </span>
              </h2>
              <p className="truncate text-sm text-muted">
                Next: {nodes[currentIndex]?.name} · 12 checkpoints
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
            aria-label="Close map"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="bg-map relative flex-1 overflow-hidden p-4 sm:p-6">
          <div className="relative h-full w-full rounded-lg border border-dashed border-line-strong">
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={trail} fill="none" stroke="var(--line-strong)" strokeWidth="2" strokeDasharray="1 5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <polyline points={walked} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>

            <ol className="contents">
              {nodes.map((pos, idx) => {
                const stageId = idx + 1;
                const isCompleted = progress.completedNodes.some(n => n.nodeId === stageId);
                const isCurrent = progress.currentStage === stageId;
                const status = isCompleted ? 'found' : isCurrent ? 'current target' : 'ahead';

                return (
                  <li
                    key={stageId}
                    tabIndex={0}
                    aria-label={`Checkpoint ${stageId}, ${pos.name}: ${status}`}
                    className={`group absolute -ml-4 -mt-4 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold outline-none transition-transform focus-visible:ring-2 focus-visible:ring-primary ${
                      isCompleted
                        ? 'border-primary bg-primary text-on-primary'
                        : isCurrent
                          ? 'z-20 scale-110 border-accent bg-surface text-accent ring-4 ring-accent/25'
                          : 'border-line-strong bg-surface text-muted'
                    }`}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  >
                    {isCompleted ? <Check className="h-4 w-4" aria-hidden="true" /> : stageId}

                    <span className="pointer-events-none absolute bottom-10 left-1/2 z-30 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink shadow-raised group-hover:block group-focus:block">
                      {stageId}. {pos.name} · {status}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="absolute bottom-6 left-6 space-y-1.5 rounded-lg border border-line bg-surface/95 p-2.5 text-xs shadow-card sm:bottom-8 sm:left-8">
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border-2 border-accent" /> Current ({Math.min(progress.currentStage, 12)})</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-primary" /> Found</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border-2 border-line-strong" /> Ahead</div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { HuntProgress } from '@/types/hunt';
import { X, Navigation } from 'lucide-react';

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-mono transition-colors">
      <div className="w-full max-w-2xl h-[82vh] bg-cyber-panel cyber-panel-border border-2 border-cyber-blue shadow-[0_0_30px_rgba(5,217,232,0.25)] relative flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center p-3 sm:p-4 border-b border-cyber-blue/30 bg-cyber-darker">
          <div className="flex items-center gap-2">
            <Navigation className="w-5 h-5 text-cyber-blue" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-cyber-blue tracking-widest uppercase">
                  Treasure Map
                </h2>
                <span className={`text-[10px] px-2 py-0.5 font-bold uppercase ${
                  currentRoute === 1 ? 'bg-cyber-cyan text-cyber-dark' : 'bg-purple-500 text-white'
                }`}>
                  Route 0{currentRoute}
                </span>
              </div>
              <p className="text-[10px] text-cyber-muted">
                {currentRoute === 1 
                  ? 'ROUTE 1 // HIPPOCRATES LOOP (12 SECTORS)' 
                  : 'ROUTE 2 // HOSPITAL TO ARTS SECTORS (12 SECTORS)'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-cyber-muted hover:text-cyber-pink transition-colors cursor-pointer"
            aria-label="Close Map"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Map Container */}
        <div className="flex-1 relative overflow-hidden bg-cyber-dark p-4 flex flex-col justify-center">
          {/* Blueprint Grid Background */}
          <div 
            className="absolute inset-0 opacity-40" 
            style={{ 
              backgroundImage: 'linear-gradient(rgba(0, 240, 255, 0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 240, 255, 0.15) 1px, transparent 1px)',
              backgroundSize: '24px 24px'
            }}
          ></div>
          
          <div className="absolute inset-4 border border-cyber-blue/30 pointer-events-none">
            {/* Coordinate markings */}
            <span className="absolute top-1 left-2 text-[9px] text-cyber-blue/70">X: 104.22 // Y: 40.89</span>
            <span className="absolute bottom-1 right-2 text-[9px] text-cyber-blue/70">
              CAMPUS GRID // ROUTE 0{currentRoute}
            </span>
          </div>

          <div className="relative w-full h-full">
            {nodes.map((pos, idx) => {
              const stageId = idx + 1;
              const isCompleted = progress.completedNodes.some(n => n.nodeId === stageId);
              const isCurrent = progress.currentStage === stageId;
              
              let styleClasses = 'bg-cyber-darker border-cyber-border text-cyber-muted'; // Locked
              let glowEffect = '';

              if (isCompleted) {
                styleClasses = 'bg-cyber-cyan/20 border-cyber-cyan text-cyber-cyan font-bold';
                glowEffect = 'shadow-[0_0_12px_rgba(0,240,255,0.6)]';
              } else if (isCurrent) {
                styleClasses = 'bg-cyber-yellow text-black border-cyber-yellow font-extrabold animate-pulse';
                glowEffect = 'shadow-[0_0_18px_rgba(252,238,10,0.9)] z-20 scale-110';
              }

              return (
                <div 
                  key={stageId}
                  className={`group absolute w-8 h-8 -ml-4 -mt-4 border-2 rounded-full flex items-center justify-center text-xs transition-all cursor-pointer ${styleClasses} ${glowEffect}`}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                >
                  {stageId}
                  {isCurrent && (
                    <div className="absolute inset-0 border-2 border-cyber-yellow rounded-full animate-ping opacity-60"></div>
                  )}

                  {/* Tooltip on hover/touch */}
                  <div className="absolute bottom-9 left-1/2 -translate-x-1/2 hidden group-hover:block z-30 whitespace-nowrap bg-black text-white border border-cyber-cyan px-2.5 py-1 text-[10px] uppercase shadow-lg pointer-events-none">
                    Node 0{stageId}: {pos.name} {isCompleted ? '✓' : isCurrent ? '★ ACTIVE TARGET' : '🔒'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="absolute bottom-6 left-6 bg-cyber-panel/90 border border-cyber-border p-2.5 text-[10px] space-y-1.5 shadow-md">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-cyber-yellow shadow-[0_0_6px_rgba(252,238,10,0.8)]"></div> 
              <span className="font-bold text-cyber-yellow">ACTIVE TARGET (NODE 0{Math.min(progress.currentStage, 12)})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-cyber-cyan shadow-[0_0_6px_rgba(0,240,255,0.8)]"></div> 
              <span className="text-cyber-cyan">SECURED & CLEARED</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-gray-500"></div> 
              <span className="text-cyber-muted">ENCRYPTED / LOCKED</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

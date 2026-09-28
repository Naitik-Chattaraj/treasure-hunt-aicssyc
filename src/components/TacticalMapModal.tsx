'use client';

import { HuntProgress } from '@/types/hunt';
import { X, Navigation, MapPin } from 'lucide-react';

// Hardcoded arbitrary positions for nodes on our mock map grid
const NODE_POSITIONS = [
  { x: 20, y: 30, name: 'Tech Park Gate' },
  { x: 40, y: 20, name: 'Central Quad' },
  { x: 70, y: 15, name: 'Science Block' },
  { x: 80, y: 40, name: 'Robotics Wing' },
  { x: 60, y: 55, name: 'Main Auditorium' },
  { x: 30, y: 65, name: 'Old Amphitheatre' },
  { x: 15, y: 80, name: 'Library Grounds' },
  { x: 45, y: 85, name: 'Sports Complex' },
  { x: 75, y: 80, name: 'Innovation Hub' },
  { x: 85, y: 60, name: 'Cafeteria Plaza' },
  { x: 50, y: 40, name: 'Clock Tower' },
  { x: 50, y: 50, name: 'Final Chamber' },
];

export default function TacticalMapModal({ 
  progress, 
  onClose 
}: { 
  progress: HuntProgress; 
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-mono transition-colors">
      <div className="w-full max-w-2xl h-[82vh] bg-cyber-panel cyber-panel-border border-2 border-cyber-blue shadow-[0_0_30px_rgba(5,217,232,0.25)] relative flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center p-3 sm:p-4 border-b border-cyber-blue/30 bg-cyber-darker">
          <div className="flex items-center gap-2">
            <Navigation className="w-5 h-5 text-cyber-blue" />
            <div>
              <h2 className="text-base sm:text-lg font-bold text-cyber-blue tracking-widest uppercase">
                Treasure Map
              </h2>
              <p className="text-[10px] text-cyber-muted">AICSSYC CAMPUS GRID TELEMETRY</p>
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
            <span className="absolute bottom-1 right-2 text-[9px] text-cyber-blue/70">CAMPUS SECTOR GRID</span>
          </div>

          <div className="relative w-full h-full">
            {NODE_POSITIONS.map((pos, idx) => {
              const nodeId = idx + 1;
              const isCompleted = progress.completedNodes.some(n => n.nodeId === nodeId);
              const isCurrent = progress.currentStage === nodeId;
              
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
                  key={nodeId}
                  className={`group absolute w-8 h-8 -ml-4 -mt-4 border-2 rounded-full flex items-center justify-center text-xs transition-all cursor-pointer ${styleClasses} ${glowEffect}`}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                >
                  {nodeId}
                  {isCurrent && (
                    <div className="absolute inset-0 border-2 border-cyber-yellow rounded-full animate-ping opacity-60"></div>
                  )}

                  {/* Tooltip on hover/touch */}
                  <div className="absolute bottom-9 left-1/2 -translate-x-1/2 hidden group-hover:block z-30 whitespace-nowrap bg-black text-white border border-cyber-cyan px-2 py-1 text-[10px] uppercase shadow-lg pointer-events-none">
                    Node 0{nodeId}: {pos.name} {isCompleted ? '✓' : isCurrent ? '★ TARGET' : '🔒'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="absolute bottom-6 left-6 bg-cyber-panel/90 border border-cyber-border p-2.5 text-[10px] space-y-1.5 shadow-md">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-cyber-yellow shadow-[0_0_6px_rgba(252,238,10,0.8)]"></div> 
              <span className="font-bold text-cyber-yellow">ACTIVE TARGET (NODE 0{progress.currentStage})</span>
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

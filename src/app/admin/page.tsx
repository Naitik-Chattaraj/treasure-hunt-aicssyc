import { Terminal, Lock } from 'lucide-react';

export default function AdminStub() {
  return (
    <main className="min-h-screen bg-cyber-dark text-foreground flex items-center justify-center p-4 relative overflow-hidden font-mono">
      <div className="overlay-scanlines"></div>
      
      <div className="z-10 w-full max-w-md bg-cyber-panel cyber-panel-border border-t-2 border-b-2 border-cyber-pink p-8 shadow-[0_0_15px_rgba(255,0,60,0.2)] text-center">
        <Lock className="w-12 h-12 text-cyber-pink mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2 tracking-widest text-cyber-pink cyber-glitch-text uppercase">
          ADMINISTRATIVE ACCESS
        </h1>
        <p className="text-gray-400 text-sm mt-4">
          This sector is currently under construction for Phase 2.
          <br /><br />
          Please return to the main participant terminal.
        </p>
      </div>
    </main>
  );
}

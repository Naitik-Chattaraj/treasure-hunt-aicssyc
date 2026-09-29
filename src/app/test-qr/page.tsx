'use client';

import { useState } from 'react';
import { MOCK_CHECKPOINTS } from '@/lib/mock-data';
import { QRCodeSVG } from 'qrcode.react';
import Link from 'next/link';
import { ArrowLeft, Printer, Copy, Check, ShieldAlert } from 'lucide-react';

export default function TestQRPage() {
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const handleCopy = (id: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <main className="min-h-screen bg-gray-900 text-gray-100 p-4 sm:p-8 font-mono">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6 border-b border-gray-800 pb-4 print:hidden">
          <Link 
            href="/hunt" 
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-cyan-400 border border-cyan-500/30 text-xs font-bold uppercase transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Hunt HUD
          </Link>
          
          <button 
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold uppercase transition-colors cursor-pointer shadow"
          >
            <Printer className="w-4 h-4" />
            Print All 12 QR Codes
          </button>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-cyan-400">
            AICSSYC 2026 // Physical QR Checkpoints Sheet
          </h1>
          <p className="text-gray-400 text-xs leading-relaxed max-w-3xl">
            Each QR code contains a unique 64-character SHA-256 token. When scanned on campus by Field Scouts (or when the token is typed manually into the Base Station input), the server verifies sequence order and permanently etches a random challenge for the team.
          </p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {MOCK_CHECKPOINTS.map(cp => (
            <div key={cp.id} className="border border-gray-700 p-5 flex flex-col items-center bg-gray-800/80 rounded shadow-md relative">
              <div className="flex justify-between w-full items-center mb-3">
                <span className="text-xs bg-cyan-500 text-black px-2 py-0.5 font-bold uppercase">
                  NODE 0{cp.id}
                </span>
                <span className="text-[11px] text-yellow-400 font-bold uppercase">{cp.area}</span>
              </div>
              
              <h2 className="text-sm font-bold mb-3 text-white text-center">{cp.title}</h2>
              
              {/* QR Code with mandatory ISO quiet zone margin & large high-contrast block size */}
              <div className="bg-white p-4 border-2 border-white shadow-xl mb-4 rounded-xl flex items-center justify-center">
                <QRCodeSVG 
                  value={cp.qrHash || ''} 
                  size={200} 
                  level="M"
                  includeMargin={true}
                  marginSize={4}
                />
              </div>
              
              <div className="w-full text-left text-xs bg-gray-900/90 p-3 border border-gray-700/80 rounded space-y-2">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-gray-400 uppercase font-bold">SHA-256 Token:</span>
                    <button
                      onClick={() => handleCopy(cp.id, cp.qrHash || '')}
                      className="text-[10px] text-cyan-400 hover:text-white flex items-center gap-1 cursor-pointer bg-gray-800 px-2 py-0.5 border border-gray-700"
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
                  <code className="text-[10px] text-yellow-300 break-all block bg-black/60 p-1.5 border border-gray-800 font-mono">
                    {cp.qrHash}
                  </code>
                </div>

                <div className="text-[11px] text-gray-400 pt-1 border-t border-gray-800">
                  <span className="text-[10px] text-gray-500 uppercase font-bold block">Physical Clue:</span>
                  <span className="text-gray-300 text-xs">{cp.clue}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

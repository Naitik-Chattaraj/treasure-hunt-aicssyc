'use client';

import { MOCK_CHECKPOINTS } from '@/lib/mock-data';
import { QRCodeSVG } from 'qrcode.react';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';

export default function TestQRPage() {
  return (
    <main className="min-h-screen bg-white text-black p-4 sm:p-8 font-mono">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6 border-b pb-4 print:hidden">
          <Link 
            href="/hunt" 
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-black border border-gray-300 text-sm font-bold uppercase transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Hunt HUD
          </Link>
          
          <button 
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-5 py-2 bg-black hover:bg-gray-800 text-white text-sm font-bold uppercase transition-colors cursor-pointer shadow"
          >
            <Printer className="w-4 h-4" />
            Print All QRs
          </button>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold mb-2">AICSSYC 2026 // QR Checkpoints Print Sheet</h1>
        <p className="mb-8 text-gray-600 text-sm">
          Print this sheet and cut out the QR codes to place around the campus. 
          Each code is assigned to a specific node and must be scanned sequentially (1 through 12).
        </p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {MOCK_CHECKPOINTS.map(cp => (
            <div key={cp.id} className="border-2 border-dashed border-gray-400 p-5 flex flex-col items-center break-inside-avoid bg-white">
              <div className="flex justify-between w-full items-center mb-1">
                <span className="text-xs bg-black text-white px-2 py-0.5 font-bold">NODE 0{cp.id}</span>
                <span className="text-[11px] text-gray-500 font-bold uppercase">{cp.area}</span>
              </div>
              <h2 className="text-lg font-bold mb-3">{cp.title}</h2>
              
              <div className="bg-white p-3 border border-gray-300 shadow-sm mb-4">
                <QRCodeSVG value={cp.qrHash} size={150} />
              </div>
              
              <div className="w-full text-left text-xs bg-gray-50 p-2.5 border border-gray-200 rounded">
                <p><span className="font-bold">QR Hash:</span> <code className="bg-gray-200 px-1 py-0.5">{cp.qrHash}</code></p>
                <p className="mt-1"><span className="font-bold">Challenge Type:</span> <span className="uppercase">{cp.challenge.type}</span></p>
                <p className="mt-1 text-green-700 font-bold">Answer: {cp.challenge.answer}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

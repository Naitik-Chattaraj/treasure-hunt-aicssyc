'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  QrCode, 
  Printer, 
  Download, 
  Copy, 
  Check, 
  RefreshCw, 
  Layers, 
  Sparkles, 
  Plus, 
  Compass, 
  Footprints, 
  HelpCircle,
  ExternalLink,
  Save,
  Search,
  CheckCircle2,
  AlertCircle
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

export default function AdminQRGeneratorTab({
  checkpoints,
  onRefresh,
  onRegenerateToken,
  onOpenQuestionModal,
}: {
  checkpoints: AdminCheckpoint[];
  onRefresh: () => Promise<void>;
  onRegenerateToken: (checkpointId: number, newHash: string) => Promise<void>;
  onOpenQuestionModal: (nodeId: number) => void;
}) {
  const [selectedRoute, setSelectedRoute] = useState<'all' | 1 | 2>(1);
  const [selectedCpId, setSelectedCpId] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [customToken, setCustomToken] = useState('');
  const [qrSize, setQrSize] = useState<number>(240);
  const [errorLevel, setErrorLevel] = useState<'L' | 'M' | 'Q' | 'H'>('H');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  // New Question Block Creation State
  const [showCreateBlock, setShowCreateBlock] = useState(false);
  const [newBlockRoute, setNewBlockRoute] = useState<1 | 2>(1);
  const [newBlockStage, setNewBlockStage] = useState<number>(1);
  const [newBlockTitle, setNewBlockTitle] = useState('');
  const [newBlockArea, setNewBlockArea] = useState('');
  const [newBlockClue, setNewBlockClue] = useState('');
  const [newBlockQuestion, setNewBlockQuestion] = useState('');
  const [newBlockAnswer, setNewBlockAnswer] = useState('');
  const [newBlockType, setNewBlockType] = useState<'passcode' | 'mcq' | 'riddle'>('passcode');
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<{ id: number; qr_hash: string; title: string } | null>(null);

  const selectedCheckpoint = checkpoints.find((c) => c.id === selectedCpId) || checkpoints[0] || null;
  const activeQrCodeValue = customToken.trim() || selectedCheckpoint?.qr_hash || 'HUNT-SAMPLE-TOKEN';

  const routeNumber = selectedCheckpoint ? (selectedCheckpoint.route_id || (selectedCheckpoint.id <= 12 ? 1 : 2)) : 1;
  const stageNumber = selectedCheckpoint ? (selectedCheckpoint.stage || (selectedCheckpoint.id <= 12 ? selectedCheckpoint.id : selectedCheckpoint.id - 12)) : 1;

  const handleCopy = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handlePrintSelected = () => {
    if (!selectedCheckpoint) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const qrElement = document.getElementById('admin-qr-generator-svg');
    const svgContent = qrElement ? qrElement.outerHTML : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Sticker - Route ${routeNumber} Node ${stageNumber} (${selectedCheckpoint.title})</title>
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
            <h1>${selectedCheckpoint.title}</h1>
            <h2>${selectedCheckpoint.area}</h2>
            ${svgContent}
            <div class="token">TOKEN: ${activeQrCodeValue}</div>
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
    const qrElement = document.getElementById('admin-qr-generator-svg');
    if (!qrElement) return;

    const svgData = new XMLSerializer().serializeToString(qrElement);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = `QR-Route${routeNumber}-Node${stageNumber}-${(selectedCheckpoint?.title || 'Checkpoint').replace(/[^a-zA-Z0-9]/g, '_')}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(svgUrl);
  };

  const handleDownloadPNG = () => {
    const qrElement = document.getElementById('admin-qr-generator-svg');
    if (!qrElement) return;

    const svgData = new XMLSerializer().serializeToString(qrElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    canvas.width = qrSize * 2;
    canvas.height = qrSize * 2;

    img.onload = () => {
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `QR-Route${routeNumber}-Node${stageNumber}.png`;
        link.href = pngUrl;
        link.click();
      }
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleRegenerate = async () => {
    if (!selectedCheckpoint) return;
    if (!confirm(`Generate a brand new unique QR Code token for Route 0${routeNumber} Node 0${stageNumber}? Any previously printed physical sticker will be replaced!`)) {
      return;
    }

    setRegenerating(true);
    try {
      const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
      const newHash = `HUNT-R${routeNumber}-N${stageNumber.toString().padStart(2, '0')}-${randomSuffix}`;
      await onRegenerateToken(selectedCheckpoint.id, newHash);
      setCustomToken('');
    } catch {
      alert('Failed to regenerate token');
    } finally {
      setRegenerating(false);
    }
  };

  const handleCreateBlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlockTitle.trim() || !newBlockArea.trim()) {
      alert('Title and Area are required.');
      return;
    }

    setCreateStatus('Generating Question Block and Minting QR Code...');
    try {
      const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
      const generatedQrToken = `HUNT-R${newBlockRoute}-N${newBlockStage.toString().padStart(2, '0')}-${randomSuffix}`;
      
      // Calculate matching checkpoint ID: Route 1 nodes are 1..12, Route 2 nodes are 13..24
      const targetCheckpointId = newBlockRoute === 1 ? newBlockStage : newBlockStage + 12;

      // 1. Update Checkpoint Details & QR Token
      const cpRes = await fetch('/api/admin/checkpoints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: targetCheckpointId,
          title: newBlockTitle.trim(),
          area: newBlockArea.trim(),
          clue: newBlockClue.trim() || `Look for Node 0${newBlockStage} in the ${newBlockArea.trim()} area.`,
          qr_hash: generatedQrToken,
        }),
      });

      if (!cpRes.ok) {
        const d = await cpRes.json();
        throw new Error(d.error || 'Failed to configure Checkpoint');
      }

      // 2. Add question to pool if provided
      if (newBlockQuestion.trim() && newBlockAnswer.trim()) {
        await fetch('/api/admin/questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodeId: targetCheckpointId,
            challengeType: newBlockType,
            question: newBlockQuestion.trim(),
            options: newBlockType === 'mcq' ? ['Option A', 'Option B', 'Option C', 'Option D'] : null,
            answer: newBlockAnswer.trim(),
          }),
        });
      }

      await onRefresh();
      setSelectedCpId(targetCheckpointId);
      setCreatedResult({
        id: targetCheckpointId,
        qr_hash: generatedQrToken,
        title: newBlockTitle.trim(),
      });
      setCreateStatus('SUCCESS! Question Block created & QR Code minted!');

      // Reset form
      setNewBlockTitle('');
      setNewBlockArea('');
      setNewBlockClue('');
      setNewBlockQuestion('');
      setNewBlockAnswer('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setCreateStatus(`Error: ${msg}`);
    }
  };

  const filteredCheckpoints = checkpoints
    .filter((cp) => {
      const r = cp.route_id || (cp.id <= 12 ? 1 : 2);
      if (selectedRoute !== 'all' && r !== selectedRoute) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          cp.title.toLowerCase().includes(q) ||
          cp.area.toLowerCase().includes(q) ||
          cp.qr_hash.toLowerCase().includes(q) ||
          `node ${cp.stage || cp.id}`.includes(q)
        );
      }
      return true;
    });

  return (
    <div className="space-y-6 font-mono">
      {/* Top Banner Alert & Action Bar */}
      <div className="bg-cyber-panel border-2 border-cyber-yellow p-4 sm:p-5 flex flex-wrap justify-between items-center gap-4 shadow-[0_0_20px_rgba(252,238,10,0.15)]">
        <div>
          <div className="flex items-center gap-2 text-cyber-yellow text-sm font-bold uppercase tracking-wider mb-1">
            <QrCode className="w-5 h-5 text-cyber-yellow animate-pulse" />
            <span>MISSION CONTROL // QUESTION BLOCK QR CODE STUDIO</span>
          </div>
          <p className="text-xs text-gray-300 max-w-2xl leading-relaxed">
            Generate, customize, and print official physical QR stickers for every Question Block across Route 1 and Route 2. When participants scan these stickers in the field, the code unlocks the etched challenge from that block.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateBlock(!showCreateBlock)}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-white text-black font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-[0_0_15px_rgba(34,197,94,0.4)]"
          >
            <Plus className="w-4 h-4" />
            <span>{showCreateBlock ? 'Hide Creator Form' : '+ New Question Block & QR Code'}</span>
          </button>
        </div>
      </div>

      {/* CREATE NEW QUESTION BLOCK FORM (DRAWER) */}
      {showCreateBlock && (
        <div className="bg-cyber-panel border-2 border-green-500 p-5 sm:p-6 shadow-[0_0_25px_rgba(34,197,94,0.2)]">
          <div className="flex justify-between items-center border-b border-green-500/30 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-green-400" />
              <h3 className="text-base font-bold text-green-400 uppercase tracking-wider">
                Create / Configure Question Block with Auto-Generated QR Code
              </h3>
            </div>
            <button
              onClick={() => setShowCreateBlock(false)}
              className="text-gray-400 hover:text-white text-xs uppercase"
            >
              Close
            </button>
          </div>

          <form onSubmit={handleCreateBlockSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Assigned Route</label>
                <select
                  value={newBlockRoute}
                  onChange={(e) => setNewBlockRoute(Number(e.target.value) as 1 | 2)}
                  className="w-full bg-cyber-darker border border-cyber-border focus:border-green-400 px-3 py-2 text-foreground text-xs"
                >
                  <option value={1}>Route 01 (Hippocrates Loop)</option>
                  <option value={2}>Route 02 (Hospital to Arts)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Target Node (Stage 1 - 12)</label>
                <select
                  value={newBlockStage}
                  onChange={(e) => setNewBlockStage(Number(e.target.value))}
                  className="w-full bg-cyber-darker border border-cyber-border focus:border-green-400 px-3 py-2 text-foreground text-xs"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((stage) => (
                    <option key={stage} value={stage}>Node 0{stage} (Checkpoint #{newBlockRoute === 1 ? stage : stage + 12})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Location Title</label>
                <input
                  type="text"
                  value={newBlockTitle}
                  onChange={(e) => setNewBlockTitle(e.target.value)}
                  placeholder="e.g. Clock Tower Archway"
                  className="w-full bg-cyber-darker border border-cyber-border focus:border-green-400 px-3 py-2 text-foreground text-xs"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Campus Area / Sector</label>
                <input
                  type="text"
                  value={newBlockArea}
                  onChange={(e) => setNewBlockArea(e.target.value)}
                  placeholder="e.g. Central Plaza Sector 04"
                  className="w-full bg-cyber-darker border border-cyber-border focus:border-green-400 px-3 py-2 text-foreground text-xs"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Physical Clue for Scouts</label>
                <input
                  type="text"
                  value={newBlockClue}
                  onChange={(e) => setNewBlockClue(e.target.value)}
                  placeholder="e.g. Find the monolith where shadows converge at solar noon."
                  className="w-full bg-cyber-darker border border-cyber-border focus:border-green-400 px-3 py-2 text-foreground text-xs"
                />
              </div>
            </div>

            {/* Initial Question in Block */}
            <div className="bg-cyber-darker p-3.5 border border-cyber-border space-y-3">
              <span className="text-[10px] text-cyber-yellow font-bold uppercase flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5" /> Initial Question for this Block&apos;s Pool (Optional):
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Challenge Type</label>
                  <select
                    value={newBlockType}
                    onChange={(e) => setNewBlockType(e.target.value as any)}
                    className="w-full bg-black border border-cyber-border focus:border-green-400 px-2.5 py-1.5 text-foreground text-xs"
                  >
                    <option value="passcode">Passcode</option>
                    <option value="mcq">Multiple Choice</option>
                    <option value="riddle">Riddle / Cypher</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[10px] text-gray-400 block mb-1">Question Prompt</label>
                  <input
                    type="text"
                    value={newBlockQuestion}
                    onChange={(e) => setNewBlockQuestion(e.target.value)}
                    placeholder="e.g. What is the hexadecimal code etched beneath the plaque?"
                    className="w-full bg-black border border-cyber-border focus:border-green-400 px-2.5 py-1.5 text-foreground text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Secret Answer (Evaluated Case-Insensitively)</label>
                <input
                  type="text"
                  value={newBlockAnswer}
                  onChange={(e) => setNewBlockAnswer(e.target.value)}
                  placeholder="e.g. 0x4F9B"
                  className="w-full bg-black border border-cyber-border focus:border-green-400 px-2.5 py-1.5 text-foreground text-xs font-mono uppercase"
                />
              </div>
            </div>

            {createStatus && (
              <div className={`p-3 text-xs font-bold ${createStatus.startsWith('SUCCESS') ? 'bg-green-500/20 text-green-400 border border-green-500' : 'bg-cyber-yellow/20 text-cyber-yellow border border-cyber-yellow'}`}>
                {createStatus}
              </div>
            )}

            {createdResult && (
              <div className="p-3 bg-black/60 border border-green-400 flex items-center justify-between text-xs">
                <div>
                  <span className="text-gray-400">Minted Token: </span>
                  <span className="text-green-400 font-bold">{createdResult.qr_hash}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCpId(createdResult.id);
                    setShowCreateBlock(false);
                  }}
                  className="text-cyber-yellow underline font-bold"
                >
                  View in Studio &rarr;
                </button>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="bg-green-500 hover:bg-white text-black font-extrabold px-5 py-2.5 text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>Save Question Block & Mint QR Code</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCreateBlock(false)}
                className="border border-cyber-border text-gray-400 hover:text-white px-4 py-2.5 text-xs uppercase"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MAIN TWO-COLUMN STUDIO: SELECTOR & LIVE GENERATOR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Question Block Selector & Filter */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-cyber-panel border border-cyber-border p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider text-cyber-cyan flex items-center gap-1.5">
                <Compass className="w-4 h-4" />
                Select Question Block
              </h3>
              <span className="text-[10px] text-gray-400">{filteredCheckpoints.length} Blocks Available</span>
            </div>

            {/* Route Filter Pills */}
            <div className="flex gap-1.5">
              <button
                onClick={() => setSelectedRoute(1)}
                className={`flex-1 py-1.5 text-[11px] font-bold uppercase border transition-colors cursor-pointer ${
                  selectedRoute === 1 ? 'bg-cyan-500 text-black border-cyan-400' : 'bg-cyber-darker text-gray-400 border-cyber-border hover:border-cyan-400'
                }`}
              >
                Route 1
              </button>
              <button
                onClick={() => setSelectedRoute(2)}
                className={`flex-1 py-1.5 text-[11px] font-bold uppercase border transition-colors cursor-pointer ${
                  selectedRoute === 2 ? 'bg-purple-500 text-white border-purple-400' : 'bg-cyber-darker text-gray-400 border-cyber-border hover:border-purple-400'
                }`}
              >
                Route 2
              </button>
              <button
                onClick={() => setSelectedRoute('all')}
                className={`flex-1 py-1.5 text-[11px] font-bold uppercase border transition-colors cursor-pointer ${
                  selectedRoute === 'all' ? 'bg-yellow-400 text-black border-yellow-300' : 'bg-cyber-darker text-gray-400 border-cyber-border hover:border-yellow-400'
                }`}
              >
                All 24
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search node title, sector, token..."
                className="w-full bg-cyber-darker border border-cyber-border focus:border-cyber-cyan pl-8 pr-3 py-1.5 text-xs text-foreground outline-none"
              />
            </div>

            {/* List of Checkpoints */}
            <div className="max-h-[520px] overflow-y-auto space-y-2 pr-1">
              {filteredCheckpoints.map((cp) => {
                const isSelected = cp.id === selectedCpId;
                const r = cp.route_id || (cp.id <= 12 ? 1 : 2);
                const st = cp.stage || (cp.id <= 12 ? cp.id : cp.id - 12);
                const qCount = cp.questions_pool?.length || 0;

                return (
                  <div
                    key={cp.id}
                    onClick={() => {
                      setSelectedCpId(cp.id);
                      setCustomToken('');
                    }}
                    className={`p-3 border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-cyber-yellow/15 border-cyber-yellow shadow-[0_0_12px_rgba(252,238,10,0.2)]'
                        : 'bg-cyber-darker border-cyber-border hover:border-cyber-cyan/50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 uppercase ${
                          r === 1 ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'bg-purple-500/20 text-purple-400 border border-purple-500/40'
                        }`}>
                          R0{r} // N0{st}
                        </span>
                        <span className="text-[10px] text-gray-400 truncate">{cp.area}</span>
                      </div>
                      <div className="text-xs font-bold text-foreground truncate">{cp.title}</div>
                      <div className="text-[10px] text-gray-500 font-mono truncate mt-0.5">{cp.qr_hash}</div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] bg-cyber-panel px-1.5 py-0.5 border border-cyber-border text-gray-300">
                        {qCount} Qs
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Live Interactive QR Generator & Sticker Preview */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-cyber-panel border-2 border-cyber-cyan p-5 sm:p-6 shadow-[0_0_25px_rgba(0,240,255,0.15)] flex flex-col items-center text-center">
            
            {/* Header info */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
              <span className={`text-xs font-bold px-3 py-1 uppercase tracking-wider ${
                routeNumber === 1 ? 'bg-cyan-500 text-black' : 'bg-purple-500 text-white'
              }`}>
                ROUTE 0{routeNumber} // NODE 0{stageNumber}
              </span>
              <span className="text-xs bg-cyber-darker text-gray-300 px-2.5 py-1 border border-cyber-border font-bold">
                CHECKPOINT #{selectedCheckpoint?.id || 1}
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-1">
              {selectedCheckpoint?.title || 'Selected Checkpoint'}
            </h2>
            <div className="text-xs text-cyber-yellow font-bold uppercase mb-4 tracking-wider">
              {selectedCheckpoint?.area || 'Sector Area'}
            </div>

            {/* THE VISUAL HIGH-RES QR CODE */}
            <div className="bg-white p-5 border-4 border-white shadow-2xl mb-4 rounded-xl flex items-center justify-center">
              <QRCodeSVG
                id="admin-qr-generator-svg"
                value={activeQrCodeValue}
                size={qrSize}
                level={errorLevel}
                includeMargin={true}
                marginSize={4}
              />
            </div>

            {/* Active Encoded Token */}
            <div className="w-full max-w-lg bg-cyber-darker p-3 border border-cyber-border text-left text-xs mb-4">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-gray-400 uppercase font-bold">Encoded QR Token (Sent to Server):</span>
                <button
                  onClick={() => handleCopy(activeQrCodeValue)}
                  className="text-[10px] text-cyber-cyan hover:text-white flex items-center gap-1 cursor-pointer bg-cyber-panel px-2 py-0.5 border border-cyber-cyan/40"
                >
                  {copiedToken === activeQrCodeValue ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedToken === activeQrCodeValue ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
              <code className="text-xs text-cyber-yellow break-all block font-mono bg-black/60 p-2 border border-cyber-border/40 font-bold">
                {activeQrCodeValue}
              </code>
            </div>

            {/* Custom Token Override Input */}
            <div className="w-full max-w-lg mb-4 text-left">
              <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">
                Ad-Hoc / Custom Token Preview (Optional):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customToken}
                  onChange={(e) => setCustomToken(e.target.value)}
                  placeholder="Type any custom string or URL to render live QR..."
                  className="flex-1 bg-cyber-darker border border-cyber-border focus:border-cyber-cyan px-3 py-1.5 text-xs text-foreground font-mono outline-none"
                />
                {customToken && (
                  <button
                    type="button"
                    onClick={() => setCustomToken('')}
                    className="px-2 py-1 bg-cyber-darker border border-cyber-border text-gray-400 hover:text-white text-xs"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Generator Customization Settings */}
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs bg-cyber-darker p-3 border border-cyber-border w-full max-w-lg mb-5">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-[10px] uppercase font-bold">QR Size:</span>
                <select
                  value={qrSize}
                  onChange={(e) => setQrSize(Number(e.target.value))}
                  className="bg-black border border-cyber-border px-2 py-1 text-foreground text-xs"
                >
                  <option value={180}>Compact (180px)</option>
                  <option value={240}>Standard (240px)</option>
                  <option value={300}>High-Res (300px)</option>
                  <option value={360}>Poster (360px)</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-[10px] uppercase font-bold">Error Correction:</span>
                <select
                  value={errorLevel}
                  onChange={(e) => setErrorLevel(e.target.value as any)}
                  className="bg-black border border-cyber-border px-2 py-1 text-foreground text-xs"
                >
                  <option value="L">L (7% Recovery)</option>
                  <option value="M">M (15% Recovery)</option>
                  <option value="Q">Q (25% Recovery)</option>
                  <option value="H">H (30% Tough Outdoor)</option>
                </select>
              </div>
            </div>

            {/* Action Buttons: Print, Download, Regenerate */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg mb-3">
              <button
                onClick={handlePrintSelected}
                className="flex items-center justify-center gap-2 bg-cyber-cyan text-black hover:bg-white font-extrabold py-3 px-4 text-xs uppercase tracking-wider transition-colors cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.4)]"
              >
                <Printer className="w-4 h-4" />
                Print Sticker
              </button>

              <button
                onClick={handleDownloadSVG}
                className="flex items-center justify-center gap-1.5 bg-cyber-panel hover:bg-cyber-darker text-cyber-cyan border border-cyber-cyan font-bold py-3 px-3 text-xs uppercase transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Download SVG
              </button>

              <button
                onClick={handleDownloadPNG}
                className="flex items-center justify-center gap-1.5 bg-cyber-panel hover:bg-cyber-darker text-cyber-yellow border border-cyber-yellow font-bold py-3 px-3 text-xs uppercase transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Download PNG
              </button>
            </div>

            {/* Regenerate Token Button */}
            {selectedCheckpoint && (
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="flex items-center gap-1.5 text-gray-400 hover:text-cyber-yellow text-xs uppercase cursor-pointer transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
                  <span>Regenerate New Unique QR Token for this Node</span>
                </button>

                <span className="text-gray-600">|</span>

                <button
                  onClick={() => onOpenQuestionModal(selectedCheckpoint.id)}
                  className="text-green-400 hover:underline text-xs uppercase font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Question to Pool
                </button>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* BATCH PRINT BAR */}
      <div className="bg-cyber-panel border border-cyber-border p-4 flex flex-wrap justify-between items-center gap-3">
        <div>
          <h4 className="text-xs font-bold uppercase text-cyber-yellow tracking-wider flex items-center gap-1.5">
            <Printer className="w-4 h-4" />
            Batch Printing Campus QR Checkpoint Sheets
          </h4>
          <p className="text-[11px] text-gray-400">
            Open the full multi-card physical checkpoint sheet to print all 12 Route 1 or Route 2 stickers at once.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/test-qr"
            target="_blank"
            className="flex items-center gap-1.5 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-extrabold uppercase transition-colors shadow"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Open Route 1 Sheet (12 Stickers)</span>
            <ExternalLink className="w-3 h-3 ml-1" />
          </a>

          <a
            href="/test-qr"
            target="_blank"
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-500 hover:bg-purple-400 text-white text-xs font-extrabold uppercase transition-colors shadow"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Open Route 2 Sheet (12 Stickers)</span>
            <ExternalLink className="w-3 h-3 ml-1" />
          </a>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { 
  X, 
  Users, 
  BrainCircuit, 
  Footprints, 
  Phone, 
  CreditCard, 
  Copy, 
  Check, 
  CheckCircle2, 
  XCircle, 
  Layers, 
  Trophy, 
  Clock, 
  ShieldCheck,
  ShieldAlert,
  Compass
} from 'lucide-react';

export interface AdminTeamMember {
  name: string;
  role: string;
  regNo: string;
  phone: string;
}

export interface AdminTeamData {
  id: string;
  uid: string;
  team_name: string;
  team_lead: string;
  status: 'pending' | 'approved' | 'rejected';
  current_stage: number;
  assigned_route?: 1 | 2;
  start_time: string | null;
  completed_at: string | null;
  completion_token: string | null;
  created_at: string;
  members: AdminTeamMember[];
}

interface AdminTeamSquadModalProps {
  team: AdminTeamData;
  onClose: () => void;
  onApproveReject: (teamId: string, status: 'approved' | 'rejected') => Promise<void>;
  onUpdateRoute: (teamId: string, newRoute: 1 | 2) => Promise<void>;
  actionLoading: string | null;
}

export default function AdminTeamSquadModal({
  team,
  onClose,
  onApproveReject,
  onUpdateRoute,
  actionLoading,
}: AdminTeamSquadModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const assignedRoute: 1 | 2 = team.assigned_route || 1;

  // Ensure members list has at least fallback items if empty
  const memberList: AdminTeamMember[] = Array.isArray(team.members) && team.members.length > 0
    ? team.members
    : [
        { name: team.team_lead, role: 'Base Decoder', regNo: team.uid, phone: 'Not provided' },
        { name: 'Operative 2', role: 'Base Decoder', regNo: 'REG-002', phone: 'Not provided' },
        { name: 'Operative 3', role: 'Field Scout', regNo: 'REG-003', phone: 'Not provided' },
        { name: 'Operative 4', role: 'Field Scout', regNo: 'REG-004', phone: 'Not provided' },
      ];

  const baseDecoders = memberList.filter(m => m.role?.toLowerCase().includes('decoder') || m.role?.toLowerCase().includes('base'));
  const fieldScouts = memberList.filter(m => m.role?.toLowerCase().includes('scout') || m.role?.toLowerCase().includes('field'));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm font-mono transition-colors">
      <div className="w-full max-w-3xl max-h-[92vh] bg-cyber-panel cyber-panel-border border-2 border-cyber-cyan shadow-[0_0_35px_rgba(0,240,255,0.25)] flex flex-col relative overflow-hidden">
        
        {/* Modal Top Bar */}
        <div className="flex justify-between items-start p-4 sm:p-5 border-b border-cyber-cyan/30 bg-cyber-darker">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs text-cyber-cyan font-bold flex items-center gap-1.5 uppercase tracking-wider">
                <Users className="w-4 h-4 text-cyber-yellow" />
                TEAM DETAILS
              </span>
              <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${
                team.status === 'approved'
                  ? 'bg-green-500/15 border-green-500 text-green-400'
                  : team.status === 'pending'
                  ? 'bg-cyber-yellow/15 border-cyber-yellow text-cyber-yellow animate-pulse'
                  : 'bg-cyber-pink/15 border-cyber-pink text-cyber-pink'
              }`}>
                {team.status}
              </span>
            </div>
            
            <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-wide flex items-center gap-2">
              {team.team_name}
            </h2>
            <div className="text-xs text-gray-400 mt-0.5">
              Team Lead: <span className="text-foreground font-bold">{team.team_lead}</span>
            </div>
          </div>

          <button 
            onClick={onClose} 
            className="p-1.5 text-cyber-muted hover:text-cyber-pink hover:bg-cyber-panel transition-colors cursor-pointer"
            aria-label="Close Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {/* 6-Digit Access Code */}
            <div className="bg-cyber-darker border border-cyber-border p-3 space-y-1">
              <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Access Code</span>
              <div className="flex items-center justify-between">
                <span className="text-base font-extrabold text-cyber-cyan tracking-widest">{team.uid}</span>
                <button
                  onClick={() => copyToClipboard(team.uid, 'uid')}
                  className="text-gray-400 hover:text-cyber-cyan p-1"
                  title="Copy Access Code"
                >
                  {copiedKey === 'uid' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Current Route */}
            <div className="bg-cyber-darker border border-cyber-border p-3 space-y-1">
              <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Assigned Route</span>
              <div>
                <select
                  value={assignedRoute}
                  onChange={(e) => onUpdateRoute(team.id, Number(e.target.value) as 1 | 2)}
                  disabled={actionLoading === team.id}
                  className={`w-full px-2 py-1 text-[11px] font-bold uppercase rounded border cursor-pointer ${
                    assignedRoute === 1
                      ? 'bg-cyan-950/80 text-cyan-400 border-cyan-700'
                      : 'bg-purple-950/80 text-purple-400 border-purple-700'
                  }`}
                >
                  <option value={1} className="bg-gray-900 text-cyan-400">Route 1 (Hippocrates)</option>
                  <option value={2} className="bg-gray-900 text-purple-400">Route 2 (Hospital)</option>
                </select>
              </div>
            </div>

            {/* Progress Stage */}
            <div className="bg-cyber-darker border border-cyber-border p-3 space-y-1">
              <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Current Node</span>
              <div className="text-sm font-bold text-cyber-yellow flex items-center gap-1">
                {team.current_stage > 12 ? (
                  <span className="text-green-400 flex items-center gap-1">
                    <Trophy className="w-3.5 h-3.5" /> CLEARED
                  </span>
                ) : (
                  <span>NODE 0{team.current_stage} / 12</span>
                )}
              </div>
            </div>

            {/* Registered Time */}
            <div className="bg-cyber-darker border border-cyber-border p-3 space-y-1">
              <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Registered At</span>
              <div className="text-xs text-gray-300 font-bold truncate">
                {new Date(team.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          {/* Members Roster Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-cyber-border/80 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-cyber-cyan flex items-center gap-2">
                <Users className="w-4 h-4 text-cyber-cyan" />
                Team Members ({memberList.length})
              </h3>
              <span className="text-[10px] text-gray-400">
                2 Decoders + 2-3 Scouts
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {memberList.map((m, idx) => {
                const isDecoder = m.role?.toLowerCase().includes('decoder') || m.role?.toLowerCase().includes('base');
                const isScout = m.role?.toLowerCase().includes('scout') || m.role?.toLowerCase().includes('field');

                return (
                  <div 
                    key={idx}
                    className={`p-3.5 border transition-all relative ${
                      isDecoder 
                        ? 'bg-cyber-cyan/5 border-cyber-cyan/40 hover:border-cyber-cyan shadow-[0_0_10px_rgba(0,240,255,0.08)]' 
                        : isScout 
                        ? 'bg-cyber-yellow/5 border-cyber-yellow/40 hover:border-cyber-yellow shadow-[0_0_10px_rgba(252,238,10,0.08)]'
                        : 'bg-cyber-darker border-cyber-border'
                    }`}
                  >
                    {/* Header: Operative name & Role Badge */}
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500 font-bold">#{idx + 1}</span>
                        <h4 className="font-bold text-sm text-foreground">{m.name || `Operative ${idx + 1}`}</h4>
                      </div>

                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 border ${
                        isDecoder 
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' 
                          : isScout 
                          ? 'bg-yellow-500/20 border-yellow-400 text-yellow-300' 
                          : 'bg-gray-800 border-gray-600 text-gray-300'
                      }`}>
                        {isDecoder && <BrainCircuit className="w-3 h-3" />}
                        {isScout && <Footprints className="w-3 h-3" />}
                        {m.role || 'Operative'}
                      </span>
                    </div>

                    {/* Member Meta: Reg No & Phone */}
                    <div className="space-y-1.5 text-xs text-gray-300">
                      <div className="flex items-center justify-between bg-cyber-darker/80 px-2.5 py-1 border border-cyber-border/40">
                        <span className="text-[10px] text-gray-400 flex items-center gap-1 uppercase">
                          <CreditCard className="w-3 h-3 text-cyber-cyan" /> Reg / ID:
                        </span>
                        <div className="flex items-center gap-1 font-mono">
                          <span>{m.regNo || 'N/A'}</span>
                          {m.regNo && (
                            <button 
                              onClick={() => copyToClipboard(m.regNo, `reg-${idx}`)}
                              className="text-gray-400 hover:text-cyber-cyan p-0.5 ml-1"
                              title="Copy Registration ID"
                            >
                              {copiedKey === `reg-${idx}` ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between bg-cyber-darker/80 px-2.5 py-1 border border-cyber-border/40">
                        <span className="text-[10px] text-gray-400 flex items-center gap-1 uppercase">
                          <Phone className="w-3 h-3 text-cyber-yellow" /> Phone:
                        </span>
                        <div className="flex items-center gap-1">
                          {m.phone ? (
                            <a 
                              href={`tel:${m.phone}`} 
                              className="text-cyber-yellow hover:underline flex items-center gap-1"
                            >
                              {m.phone}
                            </a>
                          ) : (
                            <span className="text-gray-500 italic">Not provided</span>
                          )}
                          {m.phone && (
                            <button 
                              onClick={() => copyToClipboard(m.phone, `phone-${idx}`)}
                              className="text-gray-400 hover:text-cyber-yellow p-0.5 ml-1"
                              title="Copy Phone Number"
                            >
                              {copiedKey === `phone-${idx}` ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Completion Token if finished */}
          {team.completion_token && (
            <div className="bg-green-500/10 border border-green-500 p-3.5 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-green-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5" /> Victory Code
                </span>
                <button
                  onClick={() => copyToClipboard(team.completion_token!, 'token')}
                  className="text-green-400 hover:text-white flex items-center gap-1 text-[10px] uppercase font-bold"
                >
                  {copiedKey === 'token' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  Copy Token
                </button>
              </div>
              <div className="font-mono text-sm text-green-300 font-extrabold tracking-wider break-all">
                {team.completion_token}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-cyber-border bg-cyber-darker flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {team.status === 'pending' ? (
              <>
                <button
                  onClick={() => onApproveReject(team.id, 'approved')}
                  disabled={actionLoading === team.id}
                  className="bg-green-500 text-black hover:bg-white font-bold px-4 py-2 text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer shadow-[0_0_10px_rgba(34,197,94,0.4)]"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approve Team
                </button>
                <button
                  onClick={() => onApproveReject(team.id, 'rejected')}
                  disabled={actionLoading === team.id}
                  className="bg-cyber-pink/20 hover:bg-cyber-pink hover:text-white text-cyber-pink border border-cyber-pink px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  Reject Team
                </button>
              </>
            ) : team.status === 'approved' ? (
              <button
                onClick={() => onApproveReject(team.id, 'rejected')}
                disabled={actionLoading === team.id}
                className="border border-cyber-pink/60 hover:border-cyber-pink hover:bg-cyber-pink/20 text-cyber-pink px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldAlert className="w-4 h-4" />
                Revoke
              </button>
            ) : (
              <button
                onClick={() => onApproveReject(team.id, 'approved')}
                disabled={actionLoading === team.id}
                className="border border-green-500/60 hover:border-green-500 hover:bg-green-500/20 text-green-400 px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                Re-Approve
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 border border-cyber-border text-gray-400 hover:text-white hover:border-cyber-cyan text-xs uppercase font-bold tracking-wider transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

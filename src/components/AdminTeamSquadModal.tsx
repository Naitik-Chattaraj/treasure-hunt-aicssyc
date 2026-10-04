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
  Trophy, 
  ShieldCheck,
  ShieldAlert
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
  members?: AdminTeamMember[];
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 transition-colors">
      <div className="w-full max-w-3xl max-h-[92vh] bg-surface rounded-xl border-2 border-accent shadow-card flex flex-col relative overflow-hidden">
        
        {/* Modal Top Bar */}
        <div className="flex justify-between items-start p-4 sm:p-5 border-b border-accent/30 bg-sunken">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs text-accent font-bold flex items-center gap-1.5 uppercase tracking-wider">
                <Users className="w-4 h-4 text-primary" />
                TEAM DETAILS
              </span>
              <span className={`px-2 py-0.5 text-xs font-bold uppercase rounded border ${
                team.status === 'approved'
                  ? 'bg-success/15 border-success text-success'
                  : team.status === 'pending'
                  ? 'bg-primary/15 border-primary text-primary animate-pulse'
                  : 'bg-danger/15 border-danger text-danger'
              }`}>
                {team.status}
              </span>
            </div>
            
            <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-wide flex items-center gap-2">
              {team.team_name}
            </h2>
            <div className="text-xs text-muted mt-0.5">
              Team Lead: <span className="text-ink font-bold">{team.team_lead}</span>
            </div>
          </div>

          <button 
            onClick={onClose} 
            className="p-1.5 text-muted hover:text-danger hover:bg-surface transition-colors cursor-pointer"
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
            <div className="bg-sunken border border-line p-3 space-y-1">
              <span className="text-xs text-muted uppercase font-bold tracking-wider">Access Code</span>
              <div className="flex items-center justify-between">
                <span className="text-base font-extrabold text-accent tracking-widest">{team.uid}</span>
                <button
                  onClick={() => copyToClipboard(team.uid, 'uid')}
                  className="text-muted hover:text-accent p-1"
                  title="Copy Access Code"
                >
                  {copiedKey === 'uid' ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Current Route */}
            <div className="bg-sunken border border-line p-3 space-y-1">
              <span className="text-xs text-muted uppercase font-bold tracking-wider">Assigned Route</span>
              <div>
                <select
                  value={assignedRoute}
                  onChange={(e) => onUpdateRoute(team.id, Number(e.target.value) as 1 | 2)}
                  disabled={actionLoading === team.id}
                  className={`w-full px-2 py-1 text-xs font-bold uppercase rounded border cursor-pointer ${
                    assignedRoute === 1
                      ? 'bg-route-1/10 text-route-1 border-route-1/50'
                      : 'bg-route-2/10 text-route-2 border-route-2/50'
                  }`}
                >
                  <option value={1} className="bg-sunken text-accent">Route 1 (Hippocrates)</option>
                  <option value={2} className="bg-sunken text-route-2">Route 2 (Hospital)</option>
                </select>
              </div>
            </div>

            {/* Progress Stage */}
            <div className="bg-sunken border border-line p-3 space-y-1">
              <span className="text-xs text-muted uppercase font-bold tracking-wider">Current Node</span>
              <div className="text-sm font-bold text-primary flex items-center gap-1">
                {team.current_stage > 12 ? (
                  <span className="text-success flex items-center gap-1">
                    <Trophy className="w-3.5 h-3.5" /> CLEARED
                  </span>
                ) : (
                  <span>NODE 0{team.current_stage} / 12</span>
                )}
              </div>
            </div>

            {/* Registered Time */}
            <div className="bg-sunken border border-line p-3 space-y-1">
              <span className="text-xs text-muted uppercase font-bold tracking-wider">Registered At</span>
              <div className="text-xs text-ink font-bold truncate">
                {new Date(team.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          {/* Members Roster Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-line/80 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-accent flex items-center gap-2">
                <Users className="w-4 h-4 text-accent" />
                Team Members ({memberList.length})
              </h3>
              <span className="text-xs text-muted">
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
                        ? 'bg-accent/5 border-accent/40 hover:border-accent shadow-card' 
                        : isScout 
                        ? 'bg-primary/5 border-primary/40 hover:border-primary shadow-card'
                        : 'bg-sunken border-line'
                    }`}
                  >
                    {/* Header: Operative name & Role Badge */}
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted font-bold">#{idx + 1}</span>
                        <h4 className="font-bold text-sm text-ink">{m.name || `Operative ${idx + 1}`}</h4>
                      </div>

                      <span className={`px-2 py-0.5 text-xs font-bold uppercase tracking-wider flex items-center gap-1 border ${
                        isDecoder 
                          ? 'bg-accent/20 border-accent text-accent' 
                          : isScout 
                          ? 'bg-primary/20 border-primary text-primary' 
                          : 'bg-surface-2 border-line-strong text-ink'
                      }`}>
                        {isDecoder && <BrainCircuit className="w-3 h-3" />}
                        {isScout && <Footprints className="w-3 h-3" />}
                        {m.role || 'Operative'}
                      </span>
                    </div>

                    {/* Member Meta: Reg No & Phone */}
                    <div className="space-y-1.5 text-xs text-ink">
                      <div className="flex items-center justify-between bg-sunken/80 px-2.5 py-1 border border-line/40">
                        <span className="text-xs text-muted flex items-center gap-1 uppercase">
                          <CreditCard className="w-3 h-3 text-accent" /> Reg / ID:
                        </span>
                        <div className="flex items-center gap-1 font-mono">
                          <span>{m.regNo || 'N/A'}</span>
                          {m.regNo && (
                            <button 
                              onClick={() => copyToClipboard(m.regNo, `reg-${idx}`)}
                              className="text-muted hover:text-accent p-0.5 ml-1"
                              title="Copy Registration ID"
                            >
                              {copiedKey === `reg-${idx}` ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between bg-sunken/80 px-2.5 py-1 border border-line/40">
                        <span className="text-xs text-muted flex items-center gap-1 uppercase">
                          <Phone className="w-3 h-3 text-primary" /> Phone:
                        </span>
                        <div className="flex items-center gap-1">
                          {m.phone ? (
                            <a 
                              href={`tel:${m.phone}`} 
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              {m.phone}
                            </a>
                          ) : (
                            <span className="text-muted italic">Not provided</span>
                          )}
                          {m.phone && (
                            <button 
                              onClick={() => copyToClipboard(m.phone, `phone-${idx}`)}
                              className="text-muted hover:text-primary p-0.5 ml-1"
                              title="Copy Phone Number"
                            >
                              {copiedKey === `phone-${idx}` ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3.5 h-3.5" />}
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
            <div className="bg-success/10 border border-success p-3.5 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-success font-bold uppercase tracking-wider flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5" /> Victory Code
                </span>
                <button
                  onClick={() => copyToClipboard(team.completion_token!, 'token')}
                  className="text-success hover:text-ink flex items-center gap-1 text-xs uppercase font-bold"
                >
                  {copiedKey === 'token' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  Copy Token
                </button>
              </div>
              <div className="font-mono text-sm text-success font-extrabold tracking-wider break-all">
                {team.completion_token}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-line bg-sunken flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {team.status === 'pending' ? (
              <>
                <button
                  onClick={() => onApproveReject(team.id, 'approved')}
                  disabled={actionLoading === team.id}
                  className="bg-success text-on-primary hover:opacity-90 font-bold px-4 py-2 text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer shadow-card"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approve Team
                </button>
                <button
                  onClick={() => onApproveReject(team.id, 'rejected')}
                  disabled={actionLoading === team.id}
                  className="bg-danger/20 hover:bg-danger hover:text-on-primary text-danger border border-danger px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  Reject Team
                </button>
              </>
            ) : team.status === 'approved' ? (
              <button
                onClick={() => onApproveReject(team.id, 'rejected')}
                disabled={actionLoading === team.id}
                className="border border-danger/60 hover:border-danger hover:bg-danger/20 text-danger px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldAlert className="w-4 h-4" />
                Revoke
              </button>
            ) : (
              <button
                onClick={() => onApproveReject(team.id, 'approved')}
                disabled={actionLoading === team.id}
                className="border border-success/60 hover:border-success hover:bg-success/20 text-success px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                Re-Approve
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 border border-line text-muted hover:text-ink hover:border-accent text-xs uppercase font-bold tracking-wider transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

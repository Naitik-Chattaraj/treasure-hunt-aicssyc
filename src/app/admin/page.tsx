'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Users, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  LogOut, 
  Radio, 
  Layers, 
  ExternalLink,
  Edit,
  Save,
  X,
  AlertTriangle,
  KeyRound,
  Trophy,
  Plus,
  Trash2,
  HelpCircle,
  Footprints,
  Copy,
  Check,
  Camera,
  QrCode,
  Printer
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import ThemeToggle from '@/components/ThemeToggle';
import AdminQRScannerModal from '@/components/AdminQRScannerModal';
import QuestionBlockQRModal from '@/components/QuestionBlockQRModal';
import AdminQRGeneratorTab from '@/components/AdminQRGeneratorTab';

interface AdminTeam {
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
  members: Array<{ name: string; role: string; regNo: string; phone: string }>;
}

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

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'teams' | 'checkpoints' | 'qr-generator'>('teams');
  const [checkpointRouteFilter, setCheckpointRouteFilter] = useState<'all' | 1 | 2>(1);
  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [checkpoints, setCheckpoints] = useState<AdminCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Edit checkpoint modal state (Title, Area, Clue, QR Hash)
  const [editingCheckpoint, setEditingCheckpoint] = useState<AdminCheckpoint | null>(null);
  const [editForm, setEditForm] = useState<Partial<AdminCheckpoint>>({});
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Question Pool Modal state (Add or Edit question)
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<{
    isNew: boolean;
    nodeId: number;
    id?: string;
    challenge_type: 'passcode' | 'mcq' | 'riddle';
    question: string;
    options: string[];
    answer: string;
  }>({
    isNew: true,
    nodeId: 1,
    challenge_type: 'passcode',
    question: '',
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    answer: '',
  });
  const [questionSaveStatus, setQuestionSaveStatus] = useState<string | null>(null);

  // QR Scanner Modal and Question Block QR Generator Modal states
  const [showAdminScanner, setShowAdminScanner] = useState(false);
  const [qrModalCheckpoint, setQrModalCheckpoint] = useState<AdminCheckpoint | null>(null);

  const handleRegenerateToken = async (checkpointId: number, newHash: string) => {
    const cp = checkpoints.find(c => c.id === checkpointId);
    if (!cp) return;

    try {
      const res = await fetch('/api/admin/checkpoints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: checkpointId,
          title: cp.title,
          area: cp.area,
          clue: cp.clue,
          qr_hash: newHash,
        }),
      });

      if (res.ok) {
        await fetchDashboardData(true);
        setQrModalCheckpoint(prev => prev && prev.id === checkpointId ? { ...prev, qr_hash: newHash } : null);
      } else {
        const data = await res.json();
        alert(`Failed to regenerate QR token: ${data.error || 'Server error'}`);
      }
    } catch {
      alert('Network error regenerating QR token');
    }
  };

  const fetchDashboardData = async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const [teamsRes, cpRes] = await Promise.all([
        fetch('/api/admin/teams'),
        fetch('/api/admin/checkpoints'),
      ]);

      if (teamsRes.status === 401 || cpRes.status === 401) {
        router.push('/admin/login');
        return;
      }

      if (teamsRes.ok) {
        const teamsData = await teamsRes.json();
        setTeams(teamsData.teams || []);
      }

      if (cpRes.ok) {
        const cpData = await cpRes.json();
        setCheckpoints(cpData.checkpoints || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(() => {
      fetchDashboardData(true);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleApproveReject = async (teamId: string, status: 'approved' | 'rejected') => {
    setActionLoading(teamId);
    try {
      const res = await fetch('/api/admin/teams/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, status }),
      });

      if (res.ok) {
        await fetchDashboardData(true);
      }
    } catch {
      alert('Failed to update team authorization status.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateTeamRoute = async (teamId: string, newRoute: 1 | 2) => {
    setActionLoading(teamId);
    try {
      const res = await fetch('/api/admin/teams', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, assignedRoute: newRoute }),
      });
      if (res.ok) {
        await fetchDashboardData(true);
      }
    } catch {
      alert('Failed to reassign team route.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  // Checkpoint Info Edit
  const handleStartEdit = (cp: AdminCheckpoint) => {
    setEditingCheckpoint(cp);
    setEditForm({ ...cp });
    setSaveStatus(null);
  };

  const handleSaveCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCheckpoint) return;

    setSaveStatus('Saving changes...');
    try {
      const res = await fetch('/api/admin/checkpoints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      if (res.ok) {
        setSaveStatus('Updated successfully!');
        await fetchDashboardData(true);
        setTimeout(() => {
          setEditingCheckpoint(null);
          setSaveStatus(null);
        }, 1000);
      } else {
        const data = await res.json();
        setSaveStatus(`Error: ${data.error || 'Failed to save'}`);
      }
    } catch {
      setSaveStatus('Network error saving checkpoint');
    }
  };

  // Question Pool Management
  const handleOpenAddQuestion = (nodeId: number) => {
    setEditingQuestion({
      isNew: true,
      nodeId,
      challenge_type: 'passcode',
      question: '',
      options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
      answer: '',
    });
    setQuestionSaveStatus(null);
    setQuestionModalOpen(true);
  };

  const handleOpenEditQuestion = (nodeId: number, q: QuestionPoolItem) => {
    setEditingQuestion({
      isNew: false,
      nodeId,
      id: q.id,
      challenge_type: q.challenge_type,
      question: q.question,
      options: q.options && q.options.length > 0 ? q.options : ['Alpha', 'Beta', 'Gamma', 'Delta'],
      answer: q.answer,
    });
    setQuestionSaveStatus(null);
    setQuestionModalOpen(true);
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('Are you sure you want to remove this question from the node pool?')) return;
    try {
      const res = await fetch(`/api/admin/questions?id=${questionId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchDashboardData(true);
      } else {
        alert('Failed to delete question');
      }
    } catch {
      alert('Network error deleting question');
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuestionSaveStatus('Saving question to pool...');

    try {
      const isNew = editingQuestion.isNew;
      const res = await fetch('/api/admin/questions', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingQuestion.id,
          nodeId: editingQuestion.nodeId,
          challengeType: editingQuestion.challenge_type,
          question: editingQuestion.question,
          options: editingQuestion.challenge_type === 'mcq' ? editingQuestion.options : null,
          answer: editingQuestion.answer,
        }),
      });

      if (res.ok) {
        setQuestionSaveStatus('Question saved successfully!');
        await fetchDashboardData(true);
        setTimeout(() => {
          setQuestionModalOpen(false);
          setQuestionSaveStatus(null);
        }, 1000);
      } else {
        const data = await res.json();
        setQuestionSaveStatus(`Error: ${data.error || 'Failed to save question'}`);
      }
    } catch {
      setQuestionSaveStatus('Network error saving question');
    }
  };

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const pendingTeams = teams.filter(t => t.status === 'pending');
  const finishedTeams = teams.filter(t => t.status === 'approved' && t.current_stage > 12);
  const activeHunting = teams.filter(t => t.status === 'approved' && t.current_stage <= 12);

  if (loading) {
    return (
      <main className="min-h-screen bg-cyber-dark text-foreground flex items-center justify-center font-mono">
        <div className="flex items-center gap-3 text-cyber-cyan animate-pulse">
          <RefreshCw className="w-6 h-6 animate-spin" />
          <span className="tracking-widest text-sm uppercase">ESTABLISHING ENCRYPTED MISSION CONTROL LINK...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-cyber-dark text-foreground flex flex-col font-mono relative overflow-x-clip transition-colors">
      <div className="overlay-scanlines"></div>

      {/* Top Admin Header (Fixed on Top) */}
      <header className="fixed top-0 left-0 right-0 z-40 w-full bg-cyber-panel/95 backdrop-blur-md border-b border-cyber-pink/50 p-3 sm:p-4 flex flex-wrap justify-between items-center gap-3 sm:gap-4 shadow-[0_4px_25px_rgba(0,0,0,0.85)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 border-2 border-cyber-pink flex items-center justify-center bg-cyber-darker text-cyber-pink shadow-[0_0_10px_rgba(255,0,60,0.3)]">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-widest text-cyber-pink uppercase flex items-center gap-2">
              MISSION CONTROL TERMINAL
              <span className="text-[10px] bg-cyber-pink text-white px-2 py-0.5 font-bold">ADMIN ACTIVE</span>
            </h1>
            <p className="text-[11px] text-gray-400">AICSSYC TREASURE HUNT 2026 // SYSTEM LEVEL 0</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setActiveTab('qr-generator')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'qr-generator'
                ? 'bg-cyber-yellow text-black border border-cyber-yellow shadow-[0_0_15px_rgba(252,238,10,0.5)] font-extrabold'
                : 'bg-cyber-darker border border-cyber-yellow text-cyber-yellow hover:bg-cyber-yellow hover:text-black'
            }`}
            title="Open Interactive Question Block QR Code Studio"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>QR CODE GENERATOR</span>
          </button>

          <button
            onClick={() => setShowAdminScanner(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyber-darker border border-cyber-pink text-cyber-pink hover:bg-cyber-pink hover:text-white text-xs font-bold transition-all cursor-pointer shadow-[0_0_12px_rgba(255,0,60,0.25)]"
            title="Scan Physical Checkpoint QR Code to Inspect Question Block"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>SCAN / VERIFY QR</span>
          </button>

          <Link
            href="/leaderboard"
            target="_blank"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyber-darker border border-cyber-yellow text-cyber-yellow hover:bg-cyber-yellow hover:text-cyber-dark text-xs font-bold transition-all"
            title="Open Secret Live Leaderboard in New Tab"
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>LIVE LEADERBOARD</span>
            <ExternalLink className="w-3 h-3 ml-1" />
          </Link>

          <button
            onClick={() => fetchDashboardData()}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyber-darker border border-cyber-cyan text-cyber-cyan hover:bg-cyber-cyan hover:text-cyber-dark text-xs font-bold transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>REFRESH</span>
          </button>

          <ThemeToggle />

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-cyber-pink text-cyber-pink hover:bg-cyber-pink hover:text-white text-xs font-bold transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>LOGOUT</span>
          </button>
        </div>
      </header>

      {/* Top Navbar Spacer to prevent fixed header from overlapping content */}
      <div className="h-28 sm:h-24 md:h-20 shrink-0 pointer-events-none" aria-hidden="true" />

      {/* Main Container */}
      <div className="flex-1 p-4 sm:p-6 z-10 max-w-7xl w-full mx-auto space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-cyber-panel border border-cyber-border p-4 shadow-sm">
            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">TOTAL REGISTRATIONS</div>
            <div className="text-2xl sm:text-3xl font-bold text-foreground mt-1">{teams.length}</div>
            <div className="text-[10px] text-gray-500 mt-1">Teams in database</div>
          </div>

          <div className={`bg-cyber-panel border ${pendingTeams.length > 0 ? 'border-cyber-yellow shadow-[0_0_15px_rgba(252,238,10,0.2)]' : 'border-cyber-border'} p-4`}>
            <div className="text-[10px] text-cyber-yellow uppercase font-bold tracking-wider flex items-center justify-between">
              <span>PENDING APPROVAL</span>
              {pendingTeams.length > 0 && <span className="w-2 h-2 rounded-full bg-cyber-yellow animate-ping"></span>}
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-cyber-yellow mt-1">{pendingTeams.length}</div>
            <div className="text-[10px] text-gray-400 mt-1">Awaiting admin clearance</div>
          </div>

          <div className="bg-cyber-panel border border-cyber-border p-4 shadow-sm">
            <div className="text-[10px] text-cyber-cyan uppercase font-bold tracking-wider">ACTIVE IN FIELD</div>
            <div className="text-2xl sm:text-3xl font-bold text-cyber-cyan mt-1">{activeHunting.length}</div>
            <div className="text-[10px] text-gray-400 mt-1">Hunting Nodes 1-12</div>
          </div>

          <div className="bg-cyber-panel border border-cyber-border p-4 shadow-sm">
            <div className="text-[10px] text-green-400 uppercase font-bold tracking-wider">FINAL CITADEL CLEARED</div>
            <div className="text-2xl sm:text-3xl font-bold text-green-400 mt-1">{finishedTeams.length}</div>
            <div className="text-[10px] text-gray-400 mt-1">Completed Hunt</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap border-b border-cyber-border gap-2">
          <button
            onClick={() => setActiveTab('teams')}
            className={`px-5 py-3 text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'teams'
                ? 'border-cyber-cyan text-cyber-cyan bg-cyber-panel shadow-[0_4px_12px_rgba(0,240,255,0.15)] font-extrabold'
                : 'border-transparent text-gray-400 hover:text-foreground'
            }`}
          >
            <Users className="w-4 h-4 text-cyber-cyan" />
            <span>Fleet Telemetry & Approvals ({pendingTeams.length} Pending)</span>
          </button>

          <button
            onClick={() => setActiveTab('checkpoints')}
            className={`px-5 py-3 text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'checkpoints'
                ? 'border-cyber-pink text-cyber-pink bg-cyber-panel shadow-[0_4px_12px_rgba(255,0,60,0.15)] font-extrabold'
                : 'border-transparent text-gray-400 hover:text-foreground'
            }`}
          >
            <Layers className="w-4 h-4 text-cyber-pink" />
            <span>Checkpoints & Question Bank Vault (24 Nodes / 2 Routes)</span>
          </button>

          <button
            onClick={() => setActiveTab('qr-generator')}
            className={`px-5 py-3 text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'qr-generator'
                ? 'border-cyber-yellow text-cyber-yellow bg-cyber-panel shadow-[0_4px_12px_rgba(252,238,10,0.15)] font-extrabold'
                : 'border-transparent text-gray-400 hover:text-foreground'
            }`}
          >
            <QrCode className="w-4 h-4 text-cyber-yellow" />
            <span>QR Code Generator & Stickers</span>
            <span className="text-[9px] bg-cyber-yellow text-black font-extrabold px-1.5 py-0.2 rounded">STUDIO</span>
          </button>
        </div>

        {/* Tab 1: Teams & Approvals */}
        {activeTab === 'teams' && (
          <div className="space-y-6">
            {pendingTeams.length > 0 && (
              <div className="bg-cyber-panel border-2 border-cyber-yellow p-4 sm:p-5 shadow-[0_0_20px_rgba(252,238,10,0.15)]">
                <div className="flex items-center gap-2 text-cyber-yellow text-sm font-bold uppercase tracking-wider mb-4">
                  <AlertTriangle className="w-5 h-5 shrink-0 animate-pulse" />
                  <span>ACTION REQUIRED: {pendingTeams.length} Team(s) Queued for Clearance</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendingTeams.map((team) => (
                    <div key={team.id} className="bg-cyber-darker border border-cyber-yellow/60 p-4 space-y-3 relative">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold text-base text-foreground">{team.team_name}</div>
                          <div className="text-xs text-cyber-yellow">UID: {team.uid}</div>
                        </div>
                        <span className="text-[10px] bg-cyber-yellow/20 text-cyber-yellow border border-cyber-yellow/50 px-2 py-0.5 uppercase font-bold">
                          Pending
                        </span>
                      </div>

                      <div className="text-xs text-gray-300 space-y-1">
                        <div><strong className="text-gray-400">Lead:</strong> {team.team_lead}</div>
                        <div><strong className="text-gray-400">Operatives:</strong> {team.members?.length || 4} members</div>
                        <div className="flex items-center gap-2 pt-1">
                          <strong className="text-gray-400 text-[10px] uppercase">Route:</strong>
                          <select
                            value={team.assigned_route || 1}
                            onChange={(e) => handleUpdateTeamRoute(team.id, Number(e.target.value) as 1 | 2)}
                            disabled={actionLoading === team.id}
                            className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border cursor-pointer ${
                              (team.assigned_route || 1) === 1
                                ? 'bg-cyan-950/80 text-cyan-400 border-cyan-700'
                                : 'bg-purple-950/80 text-purple-400 border-purple-700'
                            }`}
                          >
                            <option value={1} className="bg-gray-900 text-cyan-400">Route 1 (Hippocrates)</option>
                            <option value={2} className="bg-gray-900 text-purple-400">Route 2 (Hospital)</option>
                          </select>
                        </div>
                        <div className="text-[10px] text-gray-500">Registered: {new Date(team.created_at).toLocaleTimeString()}</div>
                      </div>

                      <div className="flex gap-2 pt-2 border-t border-cyber-border">
                        <button
                          onClick={() => handleApproveReject(team.id, 'approved')}
                          disabled={actionLoading === team.id}
                          className="flex-1 bg-green-500/20 hover:bg-green-500 hover:text-black text-green-400 border border-green-500 py-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approve
                        </button>
                        <button
                          onClick={() => handleApproveReject(team.id, 'rejected')}
                          disabled={actionLoading === team.id}
                          className="flex-1 bg-cyber-pink/20 hover:bg-cyber-pink hover:text-white text-cyber-pink border border-cyber-pink py-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All Teams Roster Table */}
            <div className="bg-cyber-panel border border-cyber-border overflow-hidden">
              <div className="p-4 border-b border-cyber-border flex justify-between items-center">
                <h2 className="text-sm font-bold uppercase tracking-widest text-cyber-cyan flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  All Participant Teams ({teams.length})
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-cyber-darker text-gray-400 uppercase tracking-wider border-b border-cyber-border">
                    <tr>
                      <th className="p-3">UID</th>
                      <th className="p-3">Team Name</th>
                      <th className="p-3">Team Lead</th>
                      <th className="p-3">Assigned Route</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Current Progress</th>
                      <th className="p-3">Start Time</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyber-border/50">
                    {teams.map((t) => (
                      <tr key={t.id} className="hover:bg-cyber-darker/60 transition-colors">
                        <td className="p-3 text-cyber-cyan font-bold">{t.uid}</td>
                        <td className="p-3 text-foreground font-bold">{t.team_name}</td>
                        <td className="p-3 text-gray-300">{t.team_lead}</td>
                        <td className="p-3">
                          <select
                            value={t.assigned_route || 1}
                            onChange={(e) => handleUpdateTeamRoute(t.id, Number(e.target.value) as 1 | 2)}
                            disabled={actionLoading === t.id}
                            className={`px-2 py-1 text-[11px] font-bold uppercase rounded border cursor-pointer ${
                              (t.assigned_route || 1) === 1
                                ? 'bg-cyan-950/80 text-cyan-400 border-cyan-700'
                                : 'bg-purple-950/80 text-purple-400 border-purple-700'
                            }`}
                          >
                            <option value={1} className="bg-gray-900 text-cyan-400">Route 1 (Hippocrates)</option>
                            <option value={2} className="bg-gray-900 text-purple-400">Route 2 (Hospital)</option>
                          </select>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase border ${
                            t.status === 'approved'
                              ? 'bg-green-500/10 text-green-400 border-green-500/40'
                              : t.status === 'pending'
                              ? 'bg-cyber-yellow/10 text-cyber-yellow border-cyber-yellow/40'
                              : 'bg-cyber-pink/10 text-cyber-pink border-cyber-pink/40'
                          }`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="p-3">
                          {t.current_stage > 12 ? (
                            <span className="text-green-400 font-bold flex items-center gap-1">
                              <Trophy className="w-3.5 h-3.5" />
                              COMPLETED (WINNER)
                            </span>
                          ) : (
                            <span className="text-cyber-yellow font-bold">
                              NODE 0{t.current_stage} / 12
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-gray-400">
                          {t.start_time ? new Date(t.start_time).toLocaleTimeString() : 'Not started'}
                        </td>
                        <td className="p-3 text-right">
                          {t.status === 'pending' ? (
                            <button
                              onClick={() => handleApproveReject(t.id, 'approved')}
                              className="px-2 py-1 bg-green-500/20 text-green-400 border border-green-500 hover:bg-green-500 hover:text-black font-bold text-[10px] uppercase"
                            >
                              Approve
                            </button>
                          ) : t.status === 'approved' ? (
                            <button
                              onClick={() => handleApproveReject(t.id, 'rejected')}
                              className="px-2 py-1 text-cyber-pink border border-cyber-pink/40 hover:border-cyber-pink font-bold text-[10px] uppercase"
                            >
                              Revoke
                            </button>
                          ) : (
                            <button
                              onClick={() => handleApproveReject(t.id, 'approved')}
                              className="px-2 py-1 text-green-400 border border-green-500/40 hover:border-green-500 font-bold text-[10px] uppercase"
                            >
                              Re-Approve
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {teams.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-gray-500">
                          No teams registered yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Checkpoints & Question Bank Vault */}
        {activeTab === 'checkpoints' && (
          <div className="space-y-6">
            <div className="bg-cyber-panel border border-cyber-pink/40 p-4 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-cyber-pink flex items-center gap-2">
                  <KeyRound className="w-4 h-4" />
                  Checkpoint Coordinates, Location Clues & Question Banks (2 Routes // 24 Nodes)
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Teams are randomly assigned to Route 1 or Route 2. You can filter by route below and customize physical clues, areas, and question pools.
                </p>
              </div>

              {/* Route Filter Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setCheckpointRouteFilter(1)}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded border transition-colors cursor-pointer ${
                    checkpointRouteFilter === 1
                      ? 'bg-cyan-500 text-black border-cyan-400 font-extrabold'
                      : 'bg-cyber-darker text-gray-300 border-gray-700 hover:border-cyan-400'
                  }`}
                >
                  Route 1 (12 Nodes)
                </button>
                <button
                  onClick={() => setCheckpointRouteFilter(2)}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded border transition-colors cursor-pointer ${
                    checkpointRouteFilter === 2
                      ? 'bg-purple-500 text-white border-purple-400 font-extrabold'
                      : 'bg-cyber-darker text-gray-300 border-gray-700 hover:border-purple-400'
                  }`}
                >
                  Route 2 (12 Nodes)
                </button>
                <button
                  onClick={() => setCheckpointRouteFilter('all')}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded border transition-colors cursor-pointer ${
                    checkpointRouteFilter === 'all'
                      ? 'bg-yellow-400 text-black border-yellow-300 font-extrabold'
                      : 'bg-cyber-darker text-gray-300 border-gray-700 hover:border-yellow-400'
                  }`}
                >
                  All 24 Nodes
                </button>

                <button
                  onClick={() => setActiveTab('qr-generator')}
                  className="px-3 py-1.5 bg-cyber-yellow hover:bg-white text-black text-xs font-extrabold uppercase tracking-wider rounded transition-colors cursor-pointer flex items-center gap-1.5 shadow-[0_0_12px_rgba(252,238,10,0.3)] ml-auto"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Open QR Code Studio &rarr;</span>
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {checkpoints
                .filter((cp) => {
                  const r = cp.route_id || (cp.id <= 12 ? 1 : 2);
                  if (checkpointRouteFilter === 'all') return true;
                  return r === checkpointRouteFilter;
                })
                .map((cp) => {
                const pool = cp.questions_pool || [];
                const routeNumber = cp.route_id || (cp.id <= 12 ? 1 : 2);
                const stageNumber = cp.stage || (cp.id <= 12 ? cp.id : cp.id - 12);
                return (
                  <div key={cp.id} className="bg-cyber-panel border-2 border-cyber-border hover:border-cyber-pink/60 transition-colors p-4 sm:p-5 relative shadow-md">
                    {/* Node Header */}
                    <div className="flex flex-wrap justify-between items-center gap-2 border-b border-cyber-border pb-3 mb-4">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold px-2.5 py-1 uppercase tracking-wider ${
                          routeNumber === 1 ? 'bg-cyan-500 text-black' : 'bg-purple-500 text-white'
                        }`}>
                          ROUTE 0{routeNumber} // NODE 0{stageNumber}
                        </span>
                        <div>
                          <h3 className="font-bold text-foreground text-base sm:text-lg">{cp.title}</h3>
                          <div className="text-xs text-cyber-yellow font-bold uppercase">{cp.area}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleStartEdit(cp)}
                          className="text-xs text-cyber-cyan hover:text-white flex items-center gap-1 border border-cyber-cyan/50 px-3 py-1.5 hover:bg-cyber-cyan/20 cursor-pointer font-bold uppercase"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          Edit Node & Clue
                        </button>

                        <button
                          onClick={() => handleOpenAddQuestion(cp.id)}
                          className="text-xs bg-green-500/20 text-green-400 border border-green-500 hover:bg-green-500 hover:text-black flex items-center gap-1 px-3 py-1.5 cursor-pointer font-bold uppercase transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Question to Pool
                        </button>
                      </div>
                    </div>

                    {/* Location Clue & QR Hash */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      {/* Location Clue */}
                      <div className="bg-cyber-darker p-3.5 border border-cyber-border/70 text-xs text-gray-300">
                        <span className="text-cyber-cyan text-[10px] uppercase font-bold flex items-center gap-1 mb-1">
                          <Footprints className="w-3 h-3" /> Next Location Physical Clue (Shown to scouts):
                        </span>
                        <p className="leading-relaxed text-gray-200">{cp.clue}</p>
                      </div>

                      {/* Visual QR Code & Token Block */}
                      <div className="bg-cyber-darker p-3.5 border border-cyber-border/70 text-xs flex flex-col sm:flex-row items-center gap-3">
                        {/* Rendered QR Code Thumbnail */}
                        <div 
                          onClick={() => setQrModalCheckpoint(cp)}
                          className="bg-white p-2 border-2 border-white rounded shadow-md shrink-0 cursor-pointer hover:scale-105 transition-transform"
                          title="Click to view & print high-res QR sticker"
                        >
                          <QRCodeSVG value={cp.qr_hash} size={72} level="M" />
                        </div>

                        <div className="flex-1 w-full space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400 text-[10px] uppercase font-bold">QR Code Token:</span>
                            <button
                              onClick={() => handleCopyHash(cp.qr_hash)}
                              className="text-[10px] text-cyber-cyan hover:text-white flex items-center gap-1 cursor-pointer bg-cyber-panel px-1.5 py-0.5 border border-cyber-border"
                            >
                              {copiedHash === cp.qr_hash ? (
                                <Check className="w-3 h-3 text-green-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>{copiedHash === cp.qr_hash ? 'Copied!' : 'Copy'}</span>
                            </button>
                          </div>
                          <code className="text-[10px] text-cyber-yellow break-all block font-mono bg-black/60 p-1.5 border border-cyber-border/40">
                            {cp.qr_hash}
                          </code>
                          <button
                            onClick={() => setQrModalCheckpoint(cp)}
                            className="text-[10px] text-cyber-cyan hover:text-white hover:underline flex items-center gap-1 cursor-pointer font-bold uppercase mt-1"
                          >
                            <QrCode className="w-3 h-3 text-cyber-yellow" />
                            View, Print & Download QR Sticker &rarr;
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Questions Pool List */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs uppercase font-bold tracking-wider text-gray-300 flex items-center gap-1.5">
                          <HelpCircle className="w-3.5 h-3.5 text-cyber-cyan" />
                          Question Bank Pool ({pool.length} Questions Configured)
                        </span>
                        <span className="text-[10px] text-gray-500">1 random is etched per team</span>
                      </div>

                      <div className="space-y-2">
                        {pool.map((q, idx) => (
                          <div key={q.id} className="bg-cyber-darker border border-cyber-border/60 p-3 text-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold bg-cyber-blue/20 text-cyber-blue border border-cyber-blue/40 px-1.5 py-0.2 uppercase">
                                  #{idx + 1} {q.challenge_type}
                                </span>
                                <span className="text-gray-200 font-sans">{q.question}</span>
                              </div>

                              {q.options && q.options.length > 0 && (
                                <div className="text-[11px] text-gray-400 pl-2">
                                  <strong className="text-gray-500">Options:</strong> {q.options.join(' | ')}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <div className="bg-green-500/10 border border-green-500/40 px-2 py-1 text-green-400 text-[11px]">
                                <span className="text-gray-500 text-[9px] uppercase block">Answer</span>
                                <span className="font-bold">{q.answer}</span>
                              </div>

                              <button
                                onClick={() => handleOpenEditQuestion(cp.id, q)}
                                className="p-1.5 text-gray-400 hover:text-cyber-cyan cursor-pointer border border-cyber-border hover:border-cyber-cyan"
                                title="Edit Question"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleDeleteQuestion(q.id)}
                                className="p-1.5 text-gray-400 hover:text-cyber-pink cursor-pointer border border-cyber-border hover:border-cyber-pink"
                                title="Delete Question"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}

                        {pool.length === 0 && (
                          <div className="p-4 text-center text-gray-500 text-xs italic bg-cyber-darker border border-dashed border-cyber-border">
                            No questions added yet for Node 0{cp.id}. Click &quot;Add Question to Pool&quot; above to add questions!
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 3: QR Code Generator & Studio */}
        {activeTab === 'qr-generator' && (
          <AdminQRGeneratorTab
            checkpoints={checkpoints}
            onRefresh={() => fetchDashboardData(true)}
            onRegenerateToken={handleRegenerateToken}
            onOpenQuestionModal={handleOpenAddQuestion}
          />
        )}
      </div>

      {/* Modal 1: Edit Checkpoint Info & Next Location Clue */}
      {editingCheckpoint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-cyber-panel border-2 border-cyber-pink p-6 relative font-mono shadow-[0_0_30px_rgba(255,0,60,0.3)] max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setEditingCheckpoint(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-cyber-pink"
            >
              <X className="w-6 h-6" />
            </button>

            <h3 className="text-lg font-bold text-cyber-pink uppercase tracking-widest mb-1 flex items-center gap-2">
              <Edit className="w-5 h-5" />
              Configure Node 0{editingCheckpoint.id} Location & Clue
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Edit the clue given to teams to find this checkpoint once the previous node is solved.
            </p>

            {saveStatus && (
              <div className="bg-cyber-darker border border-cyber-pink text-xs p-2.5 mb-4 text-cyber-pink">
                {saveStatus}
              </div>
            )}

            <form onSubmit={handleSaveCheckpoint} className="space-y-4 text-xs">
              <div>
                <label className="text-[10px] uppercase text-gray-400 font-bold block mb-1">Title</label>
                <input
                  type="text"
                  value={editForm.title || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-cyber-darker border border-cyber-border px-3 py-2 text-foreground outline-none focus:border-cyber-pink"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] uppercase text-gray-400 font-bold block mb-1">Campus Sector / Area</label>
                <input
                  type="text"
                  value={editForm.area || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, area: e.target.value }))}
                  className="w-full bg-cyber-darker border border-cyber-border px-3 py-2 text-foreground outline-none focus:border-cyber-pink"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] uppercase text-cyber-cyan font-bold block mb-1">
                  Location Physical Clue (Presented to Scouts):
                </label>
                <textarea
                  rows={3}
                  value={editForm.clue || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, clue: e.target.value }))}
                  className="w-full bg-cyber-darker border border-cyber-border px-3 py-2 text-foreground outline-none focus:border-cyber-cyan leading-relaxed font-sans"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] uppercase text-gray-400 font-bold block mb-1">QR Code Secret Token (SHA-256)</label>
                <input
                  type="text"
                  value={editForm.qr_hash || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, qr_hash: e.target.value }))}
                  className="w-full bg-cyber-darker border border-cyber-border px-3 py-2 text-cyber-yellow font-bold outline-none focus:border-cyber-pink text-xs"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-cyber-pink hover:bg-white text-white hover:text-black py-2.5 font-bold uppercase tracking-widest text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Checkpoint
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCheckpoint(null)}
                  className="px-4 border border-cyber-border text-gray-400 hover:text-foreground text-xs uppercase cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Add / Edit Question in Pool */}
      {questionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-cyber-panel border-2 border-green-500 p-6 relative font-mono shadow-[0_0_30px_rgba(34,197,94,0.3)] max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setQuestionModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-green-400"
            >
              <X className="w-6 h-6" />
            </button>

            <h3 className="text-lg font-bold text-green-400 uppercase tracking-widest mb-1 flex items-center gap-2">
              <Plus className="w-5 h-5" />
              {editingQuestion.isNew ? `Add Question to Node 0${editingQuestion.nodeId} Pool` : `Edit Question (Node 0${editingQuestion.nodeId})`}
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Add multiple questions to this node. The system randomly etches one for each team.
            </p>

            {questionSaveStatus && (
              <div className="bg-cyber-darker border border-green-500 text-xs p-2.5 mb-4 text-green-400">
                {questionSaveStatus}
              </div>
            )}

            <form onSubmit={handleSaveQuestion} className="space-y-4 text-xs">
              <div>
                <label className="text-[10px] uppercase text-gray-400 font-bold block mb-1">Challenge Type</label>
                <select
                  value={editingQuestion.challenge_type}
                  onChange={e => setEditingQuestion(prev => ({ ...prev, challenge_type: e.target.value as any }))}
                  className="w-full bg-cyber-darker border border-cyber-border px-3 py-2 text-foreground outline-none focus:border-green-400 font-bold uppercase"
                >
                  <option value="passcode">Passcode / Cryptographic Cipher</option>
                  <option value="mcq">Multiple Choice (MCQ)</option>
                  <option value="riddle">Riddle / Logic Puzzle</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase text-gray-400 font-bold block mb-1">Question / Prompt</label>
                <textarea
                  rows={3}
                  value={editingQuestion.question}
                  onChange={e => setEditingQuestion(prev => ({ ...prev, question: e.target.value }))}
                  placeholder="Enter the puzzle, cipher, or riddle question..."
                  className="w-full bg-cyber-darker border border-cyber-border px-3 py-2 text-foreground outline-none focus:border-green-400 font-sans"
                  required
                />
              </div>

              {editingQuestion.challenge_type === 'mcq' && (
                <div>
                  <label className="text-[10px] uppercase text-gray-400 font-bold block mb-1">MCQ Options (Choices)</label>
                  <div className="space-y-1.5">
                    {editingQuestion.options.map((opt, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-gray-500 w-4 pt-1 text-[10px]">#{i + 1}</span>
                        <input
                          type="text"
                          value={opt}
                          onChange={e => {
                            const val = e.target.value;
                            setEditingQuestion(prev => ({
                              ...prev,
                              options: prev.options.map((o, idx) => idx === i ? val : o)
                            }));
                          }}
                          placeholder={`Option ${i + 1}`}
                          className="flex-1 bg-cyber-darker border border-cyber-border px-2 py-1 text-foreground outline-none focus:border-green-400 text-xs"
                          required
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] uppercase text-green-400 font-bold block mb-1">Secret Correct Solution / Answer</label>
                <input
                  type="text"
                  value={editingQuestion.answer}
                  onChange={e => setEditingQuestion(prev => ({ ...prev, answer: e.target.value }))}
                  placeholder="Case-insensitive secret solution"
                  className="w-full bg-cyber-darker border border-green-500 px-3 py-2 text-green-400 font-bold outline-none focus:border-green-300"
                  required
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Answers are evaluated case-insensitively on the server.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-green-500 hover:bg-white text-black py-2.5 font-bold uppercase tracking-widest text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Question
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionModalOpen(false)}
                  className="px-4 border border-cyber-border text-gray-400 hover:text-foreground text-xs uppercase cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin QR Scanner & Physical Sticker Verifier Modal */}
      {showAdminScanner && (
        <AdminQRScannerModal
          checkpoints={checkpoints}
          onClose={() => setShowAdminScanner(false)}
          onSelectCheckpoint={(cp) => {
            const r = cp.route_id || (cp.id <= 12 ? 1 : 2);
            setCheckpointRouteFilter(r);
            setActiveTab('checkpoints');
            handleStartEdit(cp);
          }}
        />
      )}

      {/* Question Block QR Code Generator, Print & Download Modal */}
      {qrModalCheckpoint && (
        <QuestionBlockQRModal
          checkpoint={qrModalCheckpoint}
          onClose={() => setQrModalCheckpoint(null)}
          onRegenerateToken={handleRegenerateToken}
        />
      )}
    </main>
  );
}

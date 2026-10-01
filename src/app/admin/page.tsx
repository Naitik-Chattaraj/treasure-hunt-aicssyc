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
  QrCode
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import ThemeToggle from '@/components/ThemeToggle';
import AdminQRScannerModal from '@/components/AdminQRScannerModal';
import QuestionBlockQRModal from '@/components/QuestionBlockQRModal';
import AdminQRGeneratorTab from '@/components/AdminQRGeneratorTab';
import AdminTeamSquadModal from '@/components/AdminTeamSquadModal';
import MarkdownRenderer from '@/components/MarkdownRenderer';

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
  const [squadModalTeam, setSquadModalTeam] = useState<AdminTeam | null>(null);

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

  const fetchDashboardData = async (silent = false, includeCheckpoints = true) => {
    if (!silent) setRefreshing(true);
    try {
      const promises: [Promise<Response>, Promise<Response>?] = [
        fetch('/api/admin/teams'),
        includeCheckpoints ? fetch('/api/admin/checkpoints') : undefined,
      ];
      const [teamsRes, cpRes] = await Promise.all([
        promises[0],
        promises[1] ?? Promise.resolve(null as Response | null),
      ]);

      if (teamsRes.status === 401 || (cpRes && cpRes.status === 401)) {
        router.push('/admin/login');
        return;
      }

      if (teamsRes.ok) {
        const teamsData = await teamsRes.json();
        setTeams(teamsData.teams || []);
      }

      if (cpRes && cpRes.ok) {
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
    // Initial fetch includes both teams and static checkpoints
    fetchDashboardData(false, true);

    let pollInterval: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (!pollInterval) {
        // Poll teams only every 10s to minimize egress (checkpoints are static)
        pollInterval = setInterval(() => {
          fetchDashboardData(true, false);
        }, 10000);
      }
    };

    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchDashboardData(true, false);
        startPolling();
      } else {
        stopPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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
        await fetchDashboardData(true, false);
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
        await fetchDashboardData(true, false);
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
      <main className="min-h-screen bg-canvas text-ink flex items-center justify-center">
        <div className="flex items-center gap-3 text-accent animate-pulse">
          <RefreshCw className="w-6 h-6 animate-spin" />
          <span className="tracking-widest text-sm uppercase">Loading dashboard...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas text-ink flex flex-col relative overflow-x-clip transition-colors">

      {/* Top Admin Header (Fixed on Top) */}
      <header className="sticky top-0 z-40 w-full bg-surface/95 border-b border-line px-3 py-2.5 sm:px-6 sm:py-3 flex flex-wrap justify-between items-center gap-2 sm:gap-4 shadow-card">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary/15 text-primary shrink-0">
            <Radio className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2">
              Mission control
              
            </h1>
            <p className="text-xs text-muted">AICSSYC Treasure Hunt 2026</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
       

          <button
            onClick={() => setShowAdminScanner(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-md px-2.5 sm:px-3 text-sm font-medium transition-colors cursor-pointer bg-primary text-on-primary hover:bg-primary-hover"
            title="Scan & Verify QR"
            aria-label="Verify a QR code"
          >
            <Camera className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Verify QR</span>
          </button>

          <Link
            href="/leaderboard"
            target="_blank"
            className="inline-flex h-10 items-center gap-1.5 rounded-md px-2.5 sm:px-3 text-sm font-medium transition-colors cursor-pointer border border-line text-ink hover:border-line-strong"
            title="Live Leaderboard"
            aria-label="Open leaderboard"
          >
            <Trophy className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Leaderboard</span>
            <ExternalLink className="hidden sm:block w-3.5 h-3.5" aria-hidden="true" />
          </Link>

          <button
            onClick={() => fetchDashboardData()}
            disabled={refreshing}
            className="inline-flex h-10 items-center gap-1.5 rounded-md px-2.5 sm:px-3 text-sm font-medium transition-colors cursor-pointer border border-line text-ink hover:border-line-strong disabled:opacity-60"
            aria-label="Refresh data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <ThemeToggle />

          <button
            onClick={handleLogout}
            className="inline-flex h-10 items-center gap-1.5 rounded-md px-2.5 sm:px-3 text-sm font-medium transition-colors cursor-pointer border border-danger/50 text-danger hover:bg-danger/10"
            aria-label="Log out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 px-3 py-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6 sm:space-y-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
          <div className="bg-surface border border-line p-4 sm:p-5 shadow-card rounded-xl">
            <div className="text-xs text-muted uppercase font-bold tracking-wider">TOTAL TEAMS</div>
            <div className="text-2xl sm:text-3xl font-bold text-ink mt-2">{teams.length}</div>
          </div>

          <div className={`bg-surface border rounded-sm ${pendingTeams.length > 0 ? 'border-primary shadow-card' : 'border-line'} p-5`}>
            <div className="text-xs text-primary uppercase font-bold tracking-wider flex items-center justify-between">
              <span>PENDING</span>
              {pendingTeams.length > 0 && <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>}
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-primary mt-2">{pendingTeams.length}</div>
          </div>

          <div className="bg-surface border border-line p-4 sm:p-5 shadow-card rounded-xl">
            <div className="text-xs text-accent uppercase font-bold tracking-wider">ACTIVE</div>
            <div className="text-2xl sm:text-3xl font-bold text-accent mt-2">{activeHunting.length}</div>
          </div>

          <div className="bg-surface border border-line p-4 sm:p-5 shadow-card rounded-xl">
            <div className="text-xs text-success uppercase font-bold tracking-wider">FINISHED</div>
            <div className="text-2xl sm:text-3xl font-bold text-success mt-2">{finishedTeams.length}</div>
          </div>
        </div>

        <div className="-mx-3 flex gap-1 overflow-x-auto border-b border-line px-3 sm:mx-0 sm:px-0" role="tablist">
          <button
            onClick={() => setActiveTab('teams')}
            role="tab"
            aria-selected={activeTab === 'teams'}
            className={`shrink-0 min-h-11 px-4 py-2.5 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'teams'
                ? 'border-primary text-ink'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Users className="w-4 h-4" aria-hidden="true" />
            <span>Teams {pendingTeams.length > 0 && `(${pendingTeams.length})`}</span>
          </button>

          <button
            onClick={() => setActiveTab('checkpoints')}
            role="tab"
            aria-selected={activeTab === 'checkpoints'}
            className={`shrink-0 min-h-11 px-4 py-2.5 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'checkpoints'
                ? 'border-primary text-ink'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Layers className="w-4 h-4" aria-hidden="true" />
            <span>Checkpoints</span>
          </button>

          <button
            onClick={() => setActiveTab('qr-generator')}
            role="tab"
            aria-selected={activeTab === 'qr-generator'}
            className={`shrink-0 min-h-11 px-4 py-2.5 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'qr-generator'
                ? 'border-primary text-ink'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <QrCode className="w-4 h-4" aria-hidden="true" />
            <span>QR studio</span>
          </button>
        </div>

        {/* Tab 1: Teams & Approvals */}
        {activeTab === 'teams' && (
          <div className="space-y-8">
            {pendingTeams.length > 0 && (
              <div className="bg-surface border-2 border-primary p-5 sm:p-6 shadow-card rounded-sm">
                <div className="flex items-center gap-2 text-primary text-sm font-bold uppercase tracking-wider mb-5">
                  <AlertTriangle className="w-5 h-5 shrink-0 animate-[pulse_2s_ease-in-out_infinite]" />
                  <span>{pendingTeams.length} Team(s) Pending Approval</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendingTeams.map((team) => (
                    <div key={team.id} className="bg-sunken border border-primary/60 p-4 space-y-3 relative">
                      <div className="flex justify-between items-start">
                        <div>
                          <button
                            onClick={() => setSquadModalTeam(team)}
                            className="font-bold text-base text-ink hover:text-primary text-left transition-colors cursor-pointer flex items-center gap-1.5"
                            title="Inspect Team Squad Members"
                          >
                            <span>{team.team_name}</span>
                            <Users className="w-3.5 h-3.5 text-primary" />
                          </button>
                          <div className="text-xs text-primary">Access Code: {team.uid}</div>
                        </div>
                        <span className="text-xs bg-primary/20 text-primary border border-primary/50 px-2 py-0.5 uppercase font-bold">
                          Pending
                        </span>
                      </div>

                      <div className="text-xs text-ink space-y-1">
                        <div><strong className="text-muted">Lead:</strong> {team.team_lead}</div>
                        <div className="flex items-center justify-between">
                          <span><strong className="text-muted">Operatives:</strong> {team.members?.length || 4} members</span>
                          <button
                            onClick={() => setSquadModalTeam(team)}
                            className="text-xs text-accent hover:underline uppercase font-bold flex items-center gap-1 cursor-pointer"
                          >
                            View Squad →
                          </button>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <strong className="text-muted text-xs uppercase">Route:</strong>
                          <select
                            value={team.assigned_route || 1}
                            onChange={(e) => handleUpdateTeamRoute(team.id, Number(e.target.value) as 1 | 2)}
                            disabled={actionLoading === team.id}
                            className={`min-h-9 px-2 py-1 text-xs font-bold uppercase rounded-md border cursor-pointer ${
                              (team.assigned_route || 1) === 1
                                ? 'bg-route-1/10 text-route-1 border-route-1/50'
                                : 'bg-route-2/10 text-route-2 border-route-2/50'
                            }`}
                          >
                            <option value={1} className="bg-sunken text-accent">Route 1 (Hippocrates)</option>
                            <option value={2} className="bg-sunken text-route-2">Route 2 (Hospital)</option>
                          </select>
                        </div>
                        <div className="text-xs text-muted">Registered: {new Date(team.created_at).toLocaleTimeString()}</div>
                      </div>

                      <div className="flex gap-2 pt-2 border-t border-line">
                        <button
                          onClick={() => handleApproveReject(team.id, 'approved')}
                          disabled={actionLoading === team.id}
                          className="flex-1 bg-success/20 hover:bg-success hover:text-on-primary text-success border border-success py-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approve
                        </button>
                        <button
                          onClick={() => handleApproveReject(team.id, 'rejected')}
                          disabled={actionLoading === team.id}
                          className="flex-1 bg-danger/20 hover:bg-danger hover:text-on-primary text-danger border border-danger py-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1 cursor-pointer"
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
            <div className="bg-surface border border-line overflow-hidden rounded-sm">
              <div className="p-5 border-b border-line flex justify-between items-center">
                <h2 className="text-sm font-bold uppercase tracking-widest text-accent flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  All Teams ({teams.length})
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-sunken text-muted uppercase tracking-wider border-b border-line">
                    <tr>
                      <th className="px-4 py-3">Access Code</th>
                      <th className="px-4 py-3">Team Name</th>
                      <th className="px-4 py-3">Team Lead</th>
                      <th className="px-4 py-3">Team</th>
                      <th className="px-4 py-3">Assigned Route</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Current Progress</th>
                      <th className="px-4 py-3">Start Time</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/50">
                    {teams.map((t) => (
                      <tr key={t.id} className="hover:bg-sunken/60 transition-colors">
                        <td className="px-4 py-3 text-accent font-bold">{t.uid}</td>
                        <td className="px-4 py-3 font-bold">
                          <button
                            onClick={() => setSquadModalTeam(t)}
                            className="text-ink hover:text-accent transition-colors text-left cursor-pointer flex items-center gap-1.5"
                            title="Click to view all team members & positions"
                          >
                            <span>{t.team_name}</span>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-ink">{t.team_lead}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setSquadModalTeam(t)}
                            className="px-2.5 py-1 bg-sunken hover:bg-surface border border-accent/40 hover:border-accent text-accent text-xs font-bold uppercase rounded flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                            title="Inspect full operative roster (Base Decoders & Field Scouts)"
                          >
                            <Users className="w-3.5 h-3.5 text-primary" />
                            <span>{t.members?.length || 4} Operatives</span>
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={t.assigned_route || 1}
                            onChange={(e) => handleUpdateTeamRoute(t.id, Number(e.target.value) as 1 | 2)}
                            disabled={actionLoading === t.id}
                            className={`min-h-9 px-2 py-1 text-xs font-bold uppercase rounded-md border cursor-pointer ${
                              (t.assigned_route || 1) === 1
                                ? 'bg-route-1/10 text-route-1 border-route-1/50'
                                : 'bg-route-2/10 text-route-2 border-route-2/50'
                            }`}
                          >
                            <option value={1} className="bg-sunken text-accent">Route 1 (Hippocrates)</option>
                            <option value={2} className="bg-sunken text-route-2">Route 2 (Hospital)</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 text-xs font-bold uppercase border ${
                            t.status === 'approved'
                              ? 'bg-success/10 text-success border-success/40'
                              : t.status === 'pending'
                              ? 'bg-primary/10 text-primary border-primary/40'
                              : 'bg-danger/10 text-danger border-danger/40'
                          }`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {t.current_stage > 12 ? (
                            <span className="text-success font-bold flex items-center gap-1">
                              <Trophy className="w-3.5 h-3.5" />
                              COMPLETED (WINNER)
                            </span>
                          ) : (
                            <span className="text-primary font-bold">
                              NODE 0{t.current_stage} / 12
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {t.start_time ? new Date(t.start_time).toLocaleTimeString() : 'Not started'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            
                            {t.status === 'pending' ? (
                              <button
                                onClick={() => handleApproveReject(t.id, 'approved')}
                                className="px-2 py-1 flex items-center gap-1 bg-success/20 text-success border border-success hover:bg-success hover:text-on-primary font-bold text-xs uppercase cursor-pointer"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Approve
                              </button>
                            ) : t.status === 'approved' ? (
                              <button
                                onClick={() => handleApproveReject(t.id, 'rejected')}
                                className="px-2 py-1 flex items-center gap-1 text-danger border border-danger/40 hover:border-danger font-bold text-xs uppercase cursor-pointer"
                              >
                                <XCircle className="w-3 h-3" />
                                Revoke
                              </button>
                            ) : (
                              <button
                                onClick={() => handleApproveReject(t.id, 'approved')}
                                className="px-2 py-1 flex items-center gap-1 text-success border border-success/40 hover:border-success font-bold text-xs uppercase cursor-pointer"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Re-Approve
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {teams.length === 0 && (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-muted">
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
          <div className="space-y-8">
            <div className="bg-surface border border-danger/40 p-5 sm:p-6 flex flex-wrap justify-between items-center gap-4 rounded-sm">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-danger flex items-center gap-2">
                  <KeyRound className="w-4 h-4" />
                  Checkpoints & Question Pools
                </h2>
                <p className="text-xs text-muted mt-1">
                  Manage routes, clues, and questions.
                </p>
              </div>

              {/* Route Filter Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setCheckpointRouteFilter(1)}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded border transition-colors cursor-pointer ${
                    checkpointRouteFilter === 1
                      ? 'bg-accent text-on-primary border-accent font-extrabold'
                      : 'bg-sunken text-ink border-line hover:border-accent'
                  }`}
                >
                  Route 1 (12 Nodes)
                </button>
                <button
                  onClick={() => setCheckpointRouteFilter(2)}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded border transition-colors cursor-pointer ${
                    checkpointRouteFilter === 2
                      ? 'bg-route-2 text-on-primary border-route-2 font-extrabold'
                      : 'bg-sunken text-ink border-line hover:border-route-2'
                  }`}
                >
                  Route 2 (12 Nodes)
                </button>
                <button
                  onClick={() => setCheckpointRouteFilter('all')}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded border transition-colors cursor-pointer ${
                    checkpointRouteFilter === 'all'
                      ? 'bg-primary text-on-primary border-primary font-extrabold'
                      : 'bg-sunken text-ink border-line hover:border-primary'
                  }`}
                >
                  All 24 Nodes
                </button>

                <button
                  onClick={() => setActiveTab('qr-generator')}
                  className="px-3 py-1.5 bg-primary hover:opacity-90 text-on-primary text-xs font-extrabold uppercase tracking-wider rounded transition-colors cursor-pointer flex items-center gap-1.5 shadow-card ml-auto"
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
                  <div key={cp.id} className="bg-surface border border-line hover:border-danger/60 transition-colors p-5 sm:p-6 relative shadow-md rounded-sm">
                    {/* Node Header */}
                    <div className="flex flex-wrap justify-between items-center gap-2 border-b border-line pb-3 mb-4">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold px-2.5 py-1 uppercase tracking-wider ${
                          routeNumber === 1 ? 'bg-accent text-on-primary' : 'bg-route-2 text-on-primary'
                        }`}>
                          ROUTE 0{routeNumber} {'//'} NODE 0{stageNumber}
                        </span>
                        <div>
                          <h3 className="font-bold text-ink text-base sm:text-lg">{cp.title}</h3>
                          <div className="text-xs text-primary font-bold uppercase">{cp.area}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleStartEdit(cp)}
                          className="text-xs text-accent hover:text-ink flex items-center gap-1 border border-accent/50 px-3 py-1.5 hover:bg-accent/20 cursor-pointer font-bold uppercase"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          Edit
                        </button>

                        <button
                          onClick={() => handleOpenAddQuestion(cp.id)}
                          className="text-xs bg-success/20 text-success border border-success hover:bg-success hover:text-on-primary flex items-center gap-1 px-3 py-1.5 cursor-pointer font-bold uppercase transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Question
                        </button>
                      </div>
                    </div>

                    {/* Location Clue & QR Hash */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      {/* Location Clue */}
                      <div className="bg-sunken p-3.5 border border-line/70 text-xs text-ink">
                        <span className="text-accent text-xs uppercase font-bold flex items-center gap-1 mb-1">
                          <Footprints className="w-3 h-3" /> Location Clue:
                        </span>
                        <p className="leading-relaxed text-ink">{cp.clue}</p>
                      </div>

                      {/* Visual QR Code & Token Block */}
                      <div className="bg-sunken p-3.5 border border-line/70 text-xs flex flex-col sm:flex-row items-center gap-3">
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
                            <span className="text-muted text-xs uppercase font-bold">QR Token:</span>
                            <button
                              onClick={() => handleCopyHash(cp.qr_hash)}
                              className="text-xs text-accent hover:text-ink flex items-center gap-1 cursor-pointer bg-surface px-1.5 py-0.5 border border-line"
                            >
                              {copiedHash === cp.qr_hash ? (
                                <Check className="w-3 h-3 text-success" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>{copiedHash === cp.qr_hash ? 'Copied!' : 'Copy'}</span>
                            </button>
                          </div>
                          <code className="text-xs text-primary break-all block font-mono bg-sunken p-1.5 border border-line/40">
                            {cp.qr_hash}
                          </code>
                          <button
                            onClick={() => setQrModalCheckpoint(cp)}
                            className="text-xs text-accent hover:text-ink hover:underline flex items-center gap-1 cursor-pointer font-bold uppercase mt-1"
                          >
                            <QrCode className="w-3 h-3 text-primary" />
                            View / Print QR &rarr;
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Questions Pool List */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs uppercase font-bold tracking-wider text-ink flex items-center gap-1.5">
                          <HelpCircle className="w-3.5 h-3.5 text-accent" />
                          Questions ({pool.length})
                        </span>
                        <span className="text-xs text-muted">1 random per team</span>
                      </div>

                      <div className="space-y-2">
                        {pool.map((q, idx) => (
                          <div key={q.id} className="bg-sunken border border-line/60 p-3 text-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold bg-accent/20 text-accent border border-accent/40 px-1.5 py-0.2 uppercase">
                                  #{idx + 1} {q.challenge_type}
                                </span>
                                <div className="flex-1 text-ink font-sans w-full max-w-full overflow-hidden">
                                  <MarkdownRenderer content={q.question} />
                                </div>
                              </div>

                              {q.options && q.options.length > 0 && (
                                <div className="text-xs text-muted pl-2">
                                  <strong className="text-muted">Options:</strong> {q.options.join(' | ')}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <div className="bg-success/10 border border-success/40 px-2 py-1 text-success text-xs">
                                <span className="text-muted text-xs uppercase block">Answer</span>
                                <span className="font-bold">{q.answer}</span>
                              </div>

                              <button
                                onClick={() => handleOpenEditQuestion(cp.id, q)}
                                className="p-1.5 text-muted hover:text-accent cursor-pointer border border-line hover:border-accent"
                                title="Edit Question"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleDeleteQuestion(q.id)}
                                className="p-1.5 text-muted hover:text-danger cursor-pointer border border-line hover:border-danger"
                                title="Delete Question"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}

                        {pool.length === 0 && (
                          <div className="p-4 text-center text-muted text-xs italic bg-sunken border border-dashed border-line">
                            No questions yet. Add one above.
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-lg bg-surface border-2 border-danger p-6 relative font-mono shadow-card max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setEditingCheckpoint(null)}
              className="absolute top-4 right-4 text-muted hover:text-danger"
            >
              <X className="w-6 h-6" />
            </button>

            <h3 className="text-lg font-bold text-danger uppercase tracking-widest mb-1 flex items-center gap-2">
              <Edit className="w-5 h-5" />
              Configure Node 0{editingCheckpoint.id} Location & Clue
            </h3>
            <p className="text-xs text-muted mb-4">
              Clue shown to teams after solving the previous checkpoint.
            </p>

            {saveStatus && (
              <div className="bg-sunken border border-danger text-xs p-2.5 mb-4 text-danger">
                {saveStatus}
              </div>
            )}

            <form onSubmit={handleSaveCheckpoint} className="space-y-4 text-xs">
              <div>
                <label className="text-xs uppercase text-muted font-bold block mb-1">Title</label>
                <input
                  type="text"
                  value={editForm.title || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-sunken border border-line px-3 py-2 text-ink outline-none focus:border-danger"
                  required
                />
              </div>

              <div>
                <label className="text-xs uppercase text-muted font-bold block mb-1">Campus Sector / Area</label>
                <input
                  type="text"
                  value={editForm.area || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, area: e.target.value }))}
                  className="w-full bg-sunken border border-line px-3 py-2 text-ink outline-none focus:border-danger"
                  required
                />
              </div>

              <div>
                <label className="text-xs uppercase text-accent font-bold block mb-1">
                  Location Clue:
                </label>
                <textarea
                  rows={3}
                  value={editForm.clue || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, clue: e.target.value }))}
                  className="w-full bg-sunken border border-line px-3 py-2 text-ink outline-none focus:border-accent leading-relaxed font-sans"
                  required
                />
              </div>

              <div>
                <label className="text-xs uppercase text-muted font-bold block mb-1">QR Token</label>
                <input
                  type="text"
                  value={editForm.qr_hash || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, qr_hash: e.target.value }))}
                  className="w-full bg-sunken border border-line px-3 py-2 text-primary font-bold outline-none focus:border-danger text-base sm:text-sm"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-danger hover:opacity-90 text-on-primary py-2.5 font-bold uppercase tracking-widest text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Checkpoint
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCheckpoint(null)}
                  className="px-4 border border-line text-muted hover:text-ink text-xs uppercase cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-lg bg-surface border-2 border-success p-6 relative font-mono shadow-card max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setQuestionModalOpen(false)}
              className="absolute top-4 right-4 text-muted hover:text-success"
            >
              <X className="w-6 h-6" />
            </button>

            <h3 className="text-lg font-bold text-success uppercase tracking-widest mb-1 flex items-center gap-2">
              <Plus className="w-5 h-5" />
              {editingQuestion.isNew ? `Add Question to Node 0${editingQuestion.nodeId} Pool` : `Edit Question (Node 0${editingQuestion.nodeId})`}
            </h3>
            <p className="text-xs text-muted mb-4">
              1 question randomly selected per team.
            </p>

            {questionSaveStatus && (
              <div className="bg-sunken border border-success text-xs p-2.5 mb-4 text-success">
                {questionSaveStatus}
              </div>
            )}

            <form onSubmit={handleSaveQuestion} className="space-y-4 text-xs">
              <div>
                <label className="text-xs uppercase text-muted font-bold block mb-1">Challenge Type</label>
                <select
                  value={editingQuestion.challenge_type}
                  onChange={e => setEditingQuestion(prev => ({ ...prev, challenge_type: e.target.value as 'passcode' | 'mcq' | 'riddle' }))}
                  className="w-full bg-sunken border border-line px-3 py-2 text-ink outline-none focus:border-primary font-bold uppercase"
                >
                  <option value="passcode">Passcode / Cryptographic Cipher</option>
                  <option value="mcq">Multiple Choice (MCQ)</option>
                  <option value="riddle">Riddle / Logic Puzzle</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs uppercase text-muted font-bold">Question / Prompt</label>
                  <span className="text-xs text-muted">Supports Markdown (use ``` for code blocks)</span>
                </div>
                <textarea
                  rows={3}
                  value={editingQuestion.question}
                  onChange={e => setEditingQuestion(prev => ({ ...prev, question: e.target.value }))}
                  placeholder="Enter the puzzle, cipher, or riddle question..."
                  className="w-full bg-sunken border border-line px-3 py-2 text-ink outline-none focus:border-primary font-sans"
                  required
                />
              </div>

              {editingQuestion.challenge_type === 'mcq' && (
                <div>
                  <label className="text-xs uppercase text-muted font-bold block mb-1">MCQ Options (Choices)</label>
                  <div className="space-y-1.5">
                    {editingQuestion.options.map((opt, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-muted w-4 pt-1 text-xs">#{i + 1}</span>
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
                          className="flex-1 bg-sunken border border-line px-2 py-1 text-ink outline-none focus:border-primary text-base sm:text-sm"
                          required
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs uppercase text-success font-bold block mb-1">Secret Correct Solution / Answer</label>
                <input
                  type="text"
                  value={editingQuestion.answer}
                  onChange={e => setEditingQuestion(prev => ({ ...prev, answer: e.target.value }))}
                  placeholder="Case-insensitive secret solution"
                  className="w-full bg-sunken border border-success px-3 py-2 text-success font-bold outline-none focus:border-primary"
                  required
                />
                <p className="text-xs text-muted mt-1">
                  Answers are case-insensitive.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-success hover:opacity-90 text-on-primary py-2.5 font-bold uppercase tracking-widest text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Question
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionModalOpen(false)}
                  className="px-4 border border-line text-muted hover:text-ink text-xs uppercase cursor-pointer"
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

      {/* Admin Team Squad Inspection Modal */}
      {squadModalTeam && (
        <AdminTeamSquadModal
          team={squadModalTeam}
          onClose={() => setSquadModalTeam(null)}
          onApproveReject={async (teamId, status) => {
            await handleApproveReject(teamId, status);
            setSquadModalTeam(prev => prev && prev.id === teamId ? { ...prev, status } : prev);
          }}
          onUpdateRoute={async (teamId, newRoute) => {
            await handleUpdateTeamRoute(teamId, newRoute);
            setSquadModalTeam(prev => prev && prev.id === teamId ? { ...prev, assigned_route: newRoute } : prev);
          }}
          actionLoading={actionLoading}
        />
      )}
    </main>
  );
}

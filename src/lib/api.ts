import { TeamProfile, HuntProgress, Checkpoint, LeaderboardEntry, Challenge } from '@/types/hunt';
import { mockTeam, MOCK_CHECKPOINTS } from './mock-data';

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== 'false';
const LOCAL_STORAGE_KEY_TEAM = 'aicssyc_team';
const LOCAL_STORAGE_KEY_PROGRESS = 'aicssyc_progress';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ScanResult {
  success: boolean;
  error?: 'invalid_qr' | 'already_completed' | 'sequence_violation' | 'cooldown_active';
  nodeId?: number;
  currentStage?: number;
  message?: string;
  waitSeconds?: number;
  challenge?: Challenge | null;
}

export interface SolveResult {
  success: boolean;
  error?: string;
  nextStage?: number;
  completed?: boolean;
  completionToken?: string | null;
  cooldownSeconds?: number;
  message?: string;
}

export interface LoginResult {
  status: 'approved' | 'pending' | 'rejected';
  team?: TeamProfile;
  message?: string;
  error?: string;
}

export const api = {
  async login(uid: string, teamName: string, teamLead: string, members?: any[]): Promise<LoginResult> {
    const trimmedUid = uid.trim();
    const trimmedTeam = teamName.trim();
    const trimmedLead = teamLead.trim();

    if (!trimmedUid || !trimmedTeam || !trimmedLead) {
      return { status: 'rejected', error: 'Missing required credentials' };
    }

    if (USE_MOCK) {
      await delay(500);
      const activeTeam: TeamProfile = {
        teamName: trimmedTeam,
        teamLead: trimmedLead,
        uid: trimmedUid,
        status: 'approved',
        members: members && members.length >= 4
          ? members
          : [
              { name: trimmedLead, role: 'Base Decoder', regNo: trimmedUid, phone: '555-0100' },
              { name: 'Member 2', role: 'Base Decoder', regNo: 'REG-002', phone: '555-0102' },
              { name: 'Member 3', role: 'Field Scout', regNo: 'REG-003', phone: '555-0103' },
              { name: 'Member 4', role: 'Field Scout', regNo: 'REG-004', phone: '555-0104' },
            ],
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCAL_STORAGE_KEY_TEAM, JSON.stringify(activeTeam));
        if (!localStorage.getItem(LOCAL_STORAGE_KEY_PROGRESS)) {
          const initialProgress: HuntProgress = {
            currentStage: 1,
            startTime: Date.now(),
            completedNodes: [],
            completionToken: null,
          };
          localStorage.setItem(LOCAL_STORAGE_KEY_PROGRESS, JSON.stringify(initialProgress));
        }
      }
      return { status: 'approved', team: activeTeam };
    }

    // Call Next.js API backed by Supabase
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: trimmedUid, teamName: trimmedTeam, teamLead: trimmedLead, members }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { status: data.status || 'rejected', error: data.error || 'Authentication failed' };
    }

    return {
      status: data.status,
      team: data.team,
      message: data.message,
    };
  },

  async logout(): Promise<void> {
    if (USE_MOCK) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(LOCAL_STORAGE_KEY_TEAM);
      }
      return;
    }
    await fetch('/api/auth/logout', { method: 'POST' });
  },

  async getProfile(): Promise<TeamProfile | null> {
    if (USE_MOCK) {
      if (typeof window !== 'undefined') {
        const data = localStorage.getItem(LOCAL_STORAGE_KEY_TEAM);
        return data ? JSON.parse(data) : null;
      }
      return null;
    }

    try {
      const res = await fetch('/api/team/me');
      if (!res.ok) return null;
      const data = await res.json();
      return data.team || null;
    } catch {
      return null;
    }
  },

  async getProgress(): Promise<HuntProgress | null> {
    if (USE_MOCK) {
      if (typeof window !== 'undefined') {
        const data = localStorage.getItem(LOCAL_STORAGE_KEY_PROGRESS);
        return data ? JSON.parse(data) : null;
      }
      return null;
    }

    try {
      const res = await fetch('/api/team/me');
      if (!res.ok) return null;
      const data = await res.json();
      return data.progress || null;
    } catch {
      return null;
    }
  },

  async getCheckpoint(id: number): Promise<Checkpoint | null> {
    if (USE_MOCK) {
      const cp = MOCK_CHECKPOINTS.find((c) => c.id === id);
      if (!cp) return null;
      const isScanned = typeof window !== 'undefined' ? localStorage.getItem(`aicssyc_scanned_${id}`) === 'true' : false;
      return {
        ...cp,
        qrScanned: isScanned,
        challenge: isScanned ? cp.challenge : null,
      };
    }

    try {
      const res = await fetch('/api/hunt/checkpoint');
      if (!res.ok) return null;
      const data = await res.json();
      return data.checkpoint || null;
    } catch {
      return null;
    }
  },

  async scanQr(qrHash: string): Promise<ScanResult> {
    const cleanHash = qrHash.trim();
    if (USE_MOCK) {
      await delay(300);
      const matchedNode = MOCK_CHECKPOINTS.find((c) => c.qrHash?.toLowerCase() === cleanHash.toLowerCase());
      if (!matchedNode) {
        return { success: false, error: 'invalid_qr', message: 'UNKNOWN QR CODE. ACCESS DENIED.' };
      }

      const progressData = typeof window !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_KEY_PROGRESS) : null;
      const progress: HuntProgress = progressData ? JSON.parse(progressData) : { currentStage: 1, completedNodes: [] };

      if (matchedNode.id === progress.currentStage) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(`aicssyc_scanned_${matchedNode.id}`, 'true');
        }
        return { success: true, nodeId: matchedNode.id, challenge: matchedNode.challenge };
      } else if (matchedNode.id < progress.currentStage) {
        return {
          success: false,
          error: 'already_completed',
          nodeId: matchedNode.id,
          currentStage: progress.currentStage,
          message: `NODE 0${matchedNode.id} ALREADY COMPROMISED. CURRENT TARGET: NODE 0${progress.currentStage}`,
        };
      } else {
        return {
          success: false,
          error: 'sequence_violation',
          nodeId: matchedNode.id,
          currentStage: progress.currentStage,
          message: `SEQUENCE VIOLATION: Accessing Node 0${matchedNode.id} out of order. You haven't reached this node yet!`,
        };
      }
    }

    const res = await fetch('/api/hunt/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrHash: cleanHash }),
    });

    const data = await res.json();
    return data;
  },

  async solveChallenge(nodeId: number, answer: string): Promise<SolveResult> {
    if (USE_MOCK) {
      await delay(800);
      const cp = MOCK_CHECKPOINTS.find((c) => c.id === nodeId);
      if (cp && cp.challenge && cp.challenge.answer && cp.challenge.answer.toLowerCase() === answer.toLowerCase()) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(`aicssyc_scanned_${nodeId}`);
          const progressData = localStorage.getItem(LOCAL_STORAGE_KEY_PROGRESS);
          if (progressData) {
            const progress: HuntProgress = JSON.parse(progressData);
            if (progress.currentStage === nodeId) {
              progress.currentStage += 1;
              progress.completedNodes.push({ nodeId, timestamp: Date.now() });
              if (progress.currentStage > 12) {
                progress.completionToken = `WIN-${Date.now().toString(16).toUpperCase()}`;
              }
              localStorage.setItem(LOCAL_STORAGE_KEY_PROGRESS, JSON.stringify(progress));
            }
          }
        }
        return { success: true, nextStage: nodeId + 1, completed: nodeId >= 12 };
      }
      return { success: false, error: 'incorrect_answer', message: 'INCORRECT CODE' };
    }

    const res = await fetch('/api/hunt/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, answer }),
    });

    const data = await res.json();
    return data;
  },

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    if (USE_MOCK) {
      return [
        {
          id: '1',
          teamName: 'CYBER_PUNKS_01',
          teamLead: 'Alex Mercer',
          currentStage: 7,
          startTime: new Date(Date.now() - 3600000).toISOString(),
          completedAt: null,
          status: 'approved',
          elapsedSeconds: 3600,
        },
      ];
    }

    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) return [];
      const data = await res.json();
      return data.leaderboard || [];
    } catch {
      return [];
    }
  },
};

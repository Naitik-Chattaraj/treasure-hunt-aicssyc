import { TeamProfile, HuntProgress, Checkpoint, LeaderboardEntry, Challenge } from '@/types/hunt';
import { mockTeam, MOCK_CHECKPOINTS } from './mock-data';

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== 'false';
const LOCAL_STORAGE_KEY_TEAM = 'aicssyc_team';
const LOCAL_STORAGE_KEY_PROGRESS = 'aicssyc_progress';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ScanResult {
  success: boolean;
  error?: 'invalid_qr' | 'already_completed' | 'sequence_violation' | 'cooldown_active' | 'route_mismatch';
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
  async login(uid: string, teamName: string, teamLead: string, members?: any[], isLoginMode?: boolean): Promise<LoginResult> {
    const trimmedUid = uid.trim();
    const trimmedTeam = teamName.trim();
    const trimmedLead = teamLead.trim();

    if (isLoginMode) {
       if (!trimmedUid || !trimmedTeam) return { status: 'rejected', error: 'Missing team name or 6-digit access code' };
    } else {
       if (!trimmedTeam || !trimmedLead) return { status: 'rejected', error: 'Missing required credentials' };
    }

    if (USE_MOCK) {
      await delay(500);

      // Check if existing team in storage already has assigned route
      let assignedRoute: 1 | 2 = Math.random() < 0.5 ? 1 : 2;
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY_TEAM);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed.uid === trimmedUid && (parsed.assignedRoute === 1 || parsed.assignedRoute === 2)) {
              assignedRoute = parsed.assignedRoute;
            }
          } catch {}
        }
      }

      const mockUid = trimmedUid || Math.random().toString(36).substring(2, 8).toUpperCase();
      const activeTeam: TeamProfile = {
        teamName: trimmedTeam,
        teamLead: trimmedLead,
        uid: mockUid,
        status: 'approved',
        assignedRoute,
        assigned_route: assignedRoute,
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
            assignedRoute,
            startTime: Date.now(),
            completedNodes: [],
            completionToken: null,
          };
          localStorage.setItem(LOCAL_STORAGE_KEY_PROGRESS, JSON.stringify(initialProgress));
        } else {
          // Sync route to progress
          try {
            const prog = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_PROGRESS)!);
            prog.assignedRoute = assignedRoute;
            localStorage.setItem(LOCAL_STORAGE_KEY_PROGRESS, JSON.stringify(prog));
          } catch {}
        }
      }
      return { status: 'approved', team: activeTeam };
    }

    // Call Next.js API backed by Supabase
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: trimmedUid, teamName: trimmedTeam, teamLead: trimmedLead, members, isLoginMode }),
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
        if (!data) return null;
        const parsed = JSON.parse(data);
        if (!parsed.assignedRoute) {
          parsed.assignedRoute = 1;
          parsed.assigned_route = 1;
          localStorage.setItem(LOCAL_STORAGE_KEY_TEAM, JSON.stringify(parsed));
        }
        return parsed;
      }
      return null;
    }

    try {
      const res = await fetch('/api/team/me');
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401 && data.error === 'Session expired: logged in from another device') {
          if (typeof window !== 'undefined') {
            alert('Your session has expired because your team logged in from another device. Only one device can be active at a time.');
          }
        }
        return null;
      }
      return data.team || null;
    } catch {
      return null;
    }
  },

  async getProgress(): Promise<HuntProgress | null> {
    if (USE_MOCK) {
      if (typeof window !== 'undefined') {
        const data = localStorage.getItem(LOCAL_STORAGE_KEY_PROGRESS);
        if (!data) return null;
        const parsed = JSON.parse(data);
        const teamData = localStorage.getItem(LOCAL_STORAGE_KEY_TEAM);
        if (teamData) {
          try {
            const team = JSON.parse(teamData);
            parsed.assignedRoute = team.assignedRoute || 1;
          } catch {}
        }
        return parsed;
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

  async getCheckpoint(stage: number, routeId?: 1 | 2): Promise<Checkpoint | null> {
    if (USE_MOCK) {
      let teamRoute: 1 | 2 = routeId || 1;
      if (!routeId && typeof window !== 'undefined') {
        const teamData = localStorage.getItem(LOCAL_STORAGE_KEY_TEAM);
        if (teamData) {
          try {
            const team = JSON.parse(teamData);
            if (team.assignedRoute === 1 || team.assignedRoute === 2) {
              teamRoute = team.assignedRoute;
            }
          } catch {}
        }
      }

      const cp = MOCK_CHECKPOINTS.find((c) => c.routeId === teamRoute && c.stage === stage);
      if (!cp) return null;
      const isScanned = typeof window !== 'undefined' ? localStorage.getItem(`aicssyc_scanned_${cp.id}`) === 'true' : false;
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
      await delay(40);
      const matchedNode = MOCK_CHECKPOINTS.find((c) => c.qrHash?.toLowerCase() === cleanHash.toLowerCase());
      if (!matchedNode) {
        return { success: false, error: 'invalid_qr', message: 'UNKNOWN QR CODE. ACCESS DENIED.' };
      }

      let teamRoute: 1 | 2 = 1;
      if (typeof window !== 'undefined') {
        const teamData = localStorage.getItem(LOCAL_STORAGE_KEY_TEAM);
        if (teamData) {
          try {
            const team = JSON.parse(teamData);
            if (team.assignedRoute === 1 || team.assignedRoute === 2) {
              teamRoute = team.assignedRoute;
            }
          } catch {}
        }
      }

      // Check if QR belongs to a different route!
      if (matchedNode.routeId !== teamRoute) {
        return {
          success: false,
          error: 'invalid_qr',
          message: `ROUTE MISMATCH: This QR code belongs to Route 0${matchedNode.routeId}. Your team is assigned to Route 0${teamRoute}!`,
        };
      }

      const progressData = typeof window !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_KEY_PROGRESS) : null;
      const progress: HuntProgress = progressData ? JSON.parse(progressData) : { currentStage: 1, completedNodes: [] };

      if (matchedNode.stage === progress.currentStage) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(`aicssyc_scanned_${matchedNode.id}`, 'true');
        }
        return { success: true, nodeId: matchedNode.id, challenge: matchedNode.challenge };
      } else if (matchedNode.stage < progress.currentStage) {
        return {
          success: false,
          error: 'already_completed',
          nodeId: matchedNode.id,
          currentStage: progress.currentStage,
          message: `NODE 0${matchedNode.stage} ALREADY COMPROMISED. CURRENT TARGET: NODE 0${progress.currentStage}`,
        };
      } else {
        return {
          success: false,
          error: 'sequence_violation',
          nodeId: matchedNode.id,
          currentStage: progress.currentStage,
          message: `SEQUENCE VIOLATION: Accessing Node 0${matchedNode.stage} out of order. You haven't reached this node yet!`,
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
      let teamRoute: 1 | 2 = 1;
      if (typeof window !== 'undefined') {
        const teamData = localStorage.getItem(LOCAL_STORAGE_KEY_TEAM);
        if (teamData) {
          try {
            const team = JSON.parse(teamData);
            if (team.assignedRoute === 1 || team.assignedRoute === 2) {
              teamRoute = team.assignedRoute;
            }
          } catch {}
        }
      }

      const cp = MOCK_CHECKPOINTS.find((c) => c.id === nodeId || (c.stage === nodeId && c.routeId === teamRoute));
      if (cp && cp.challenge && cp.challenge.answer && cp.challenge.answer.toLowerCase() === answer.toLowerCase()) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(`aicssyc_scanned_${cp.id}`);
          const progressData = localStorage.getItem(LOCAL_STORAGE_KEY_PROGRESS);
          if (progressData) {
            const progress: HuntProgress = JSON.parse(progressData);
            if (progress.currentStage === cp.stage) {
              progress.currentStage += 1;
              progress.completedNodes.push({ nodeId: cp.stage, timestamp: Date.now() });
              if (progress.currentStage > 12) {
                progress.completionToken = `WIN-${Date.now().toString(16).toUpperCase()}`;
              }
              localStorage.setItem(LOCAL_STORAGE_KEY_PROGRESS, JSON.stringify(progress));
            }
          }
        }
        return { success: true, nextStage: cp.stage + 1, completed: cp.stage >= 12 };
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
          assignedRoute: 1,
          currentStage: 7,
          startTime: new Date(Date.now() - 3600000).toISOString(),
          completedAt: null,
          status: 'approved',
          elapsedSeconds: 3600,
        },
        {
          id: '2',
          teamName: 'NEURAL_PIONEERS',
          teamLead: 'Elena Rostova',
          assignedRoute: 2,
          currentStage: 5,
          startTime: new Date(Date.now() - 2400000).toISOString(),
          completedAt: null,
          status: 'approved',
          elapsedSeconds: 2400,
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
